// herdr 执行后端（2026-10-31 接入，2026-11-04 下沉进本包）：以 herdr
// （terminal workspace manager，herdr.dev，Rust）替换/并列 tmux 作为 agent
// 终端基底。实现层不动 —— 本文件把 TmuxClient 契约（同目录 tmux.ts）映射到
// herdr 的 socket API（换行分隔 JSON over Unix socket），派发管线
// （createProvisioningDispatch / probePane / snapshot / hooks）零改动可跑。
// 消费入口 = backend.ts 的 createAgentBackend（tmux|herdr 正交后端工厂）。
//
// 映射模型（v2，2026-11-06：workspace 让位给 tenant）：
//   - herdr 命名 session namespace（`herdr --session <ns>`，config
//     herdr_session，默认 'juli'）≈ tmux 专属 socket 的隔离位。
//   - workspace = tenant（租户预留位，默认 label='juli'；多租户落地时一
//     客户一 workspace）；tab = agent 会话（label=会话名，cwd/env 随 tab）；
//     pane = 终端本体。
//   - pane label `juli:<会话名>` 是跨重启的稳定寻址键（2026-11-06 实测
//     tab/pane label 均随 server 重启持久；引擎重启丢内存缓存后靠
//     pane.list 扫描找回，tab label 匹配为第二兜底，旧 workspace=会话
//     形状仅迁移窗口由 legacy 兜底兼容）。
//
// env 注入的诚实边界（0.9.5 实测，2026-10-31）：
//   - workspace.create / pane.split / layout.apply 的 env 参数不进 shell；
//     唯一验证生效的是 tab.create 的 env（对象形态，干净 server 上生效）。
//   - herdr server 重启后 workspace 结构恢复、pane 复位为裸 shell 且 env
//     全丢 —— 所以 boot 命令（backend.bootCommand）自带
//     `source <data_dir>/agent-env.sh` 兜底（0600 文件，密钥不进 pane
//     scrollback），恢复态与新建态同一条路。
//   - 热改 env 只对「之后新建的 workspace」生效（与 tmux 全局环境的
//     「已在跑会话不受影响」语义一致）。
//
// 契约无 exec 逃逸口（2026-11-04 R1 评审 #3 收口）：tmux argv 不再是跨后端
// 协议——probePane/确认循环/快照/transcript 门控全部走命名方法（sendKey/
// foregroundCommandOf/panePathOf/sessionBirthsOf/setEnv），herdr 逐个直译，
// 新后端不再需要翻译任何 tmux 命令形状。

import { createServer, createConnection, type Socket } from 'node:net';
import { spawn, execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { accessSync, constants, writeFileSync } from 'node:fs';
import { err, ok, type Result } from '../shared/result.ts';
import { defaultHookSpecs, type HookSpec } from './hooks.ts';
import { createPty, type PtyOpts, type PtySession } from './pty.ts';
import {
  inputBoxState, promptFingerprints,
  type SubmitStats, type TerminalKey, type TmuxClient, type TmuxSessionInfo,
} from './tmux.ts';

// ---- 二进制解析（对齐 L0 resolveTmuxBin 的 GUI 残缺 PATH 教训）----------------

const canExec = (p: string): boolean => {
  try {
    accessSync(p, constants.X_OK);
    return true;
  } catch {
    return false;
  }
};

/** herdr 二进制解析：PATH 优先（尊重自装覆盖），常见安装位兜底绝对路径。 */
export const resolveHerdrBin = (
  pathEnv: string | undefined = process.env['PATH'],
  exists: (p: string) => boolean = canExec,
): string => {
  if (pathEnv?.split(':').some((dir) => dir !== '' && exists(join(dir, 'herdr')))) return 'herdr';
  for (const candidate of ['/opt/homebrew/bin/herdr', '/usr/local/bin/herdr']) {
    if (exists(candidate)) return candidate;
  }
  return 'herdr'; // 查不到保留原名，让 ENOENT 原样显性可诊断
};

export const HERDR_BIN = resolveHerdrBin();

/** 命名 session namespace 的 socket 路径（herdr 固定布局）。 */
export const herdrSocketPath = (session: string): string =>
  join(homedir(), '.config', 'herdr', 'sessions', session, 'herdr.sock');

/** agent pane 的稳定寻址 label（pane.rename 打上、pane.list 扫回）。 */
export const paneLabelOf = (session: string): string => `juli:${session}`;

// ---- NDJSON wire（一次请求一条连接；无订阅面，无状态机）------------------------

export interface HerdrWireResponse {
  readonly id: string;
  readonly result?: Record<string, unknown>;
  readonly error?: { code: string; message: string };
}

/** 单次 socket 调用：写一行、读到同 id 的第一行为止。连接失败归一为
 * `server_not_running` 错误码（供上层决定是否拉起 server 后重试）。 */
export const herdrRequest = (
  socketPath: string,
  id: string,
  method: string,
  params: Record<string, unknown>,
  timeoutMs = 8000,
): Promise<Result<Record<string, unknown>, Error>> =>
  new Promise((resolve) => {
    const sock: Socket = createConnection(socketPath);
    let buf = '';
    let settled = false;
    const finish = (r: Result<Record<string, unknown>, Error>): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      sock.destroy();
      resolve(r);
    };
    const timer = setTimeout(() => {
      finish(err(new Error(`herdr ${method}: 请求超时（${timeoutMs}ms）`)));
    }, timeoutMs);
    sock.on('connect', () => {
      sock.write(`${JSON.stringify({ id, method, params })}\n`);
    });
    sock.on('data', (chunk) => {
      buf += chunk.toString('utf8');
      const nl = buf.indexOf('\n');
      if (nl === -1) return;
      let parsed: HerdrWireResponse;
      try {
        parsed = JSON.parse(buf.slice(0, nl)) as HerdrWireResponse;
      } catch {
        finish(err(new Error(`herdr ${method}: 响应不可解析`)));
        return;
      }
      if (parsed.id !== id) return; // 理论上单请求连接不会收到别的 id
      if (parsed.error !== undefined) {
        finish(err(new Error(`herdr ${method}: ${parsed.error.code} ${parsed.error.message}`)));
      } else {
        finish(ok(parsed.result ?? {}));
      }
    });
    sock.on('error', (e) => {
      const msg = e instanceof Error ? e.message : String(e);
      finish(err(new Error(`herdr ${method}: server_not_running ${msg}`)));
    });
  });

// ---- 客户端 -------------------------------------------------------------------

export interface HerdrClientOpts {
  /** 命名 session namespace（默认 'juli'）。 */
  readonly session?: string;
  /** 租户 workspace 的 label（默认 'juli'）：映射模型 v2（2026-11-06）——
   * workspace=tenant（多租户预留位，今天单租户占一席）、tab=agent 会话
   * （label=会话名）、pane=终端本体。旧「workspace=会话」形状仅在迁移
   * 窗口被 resolve/kill/list 的 legacy 兜底兼容。 */
  readonly tenant?: string;
  /** socket 路径覆盖（缺省 = 命名 session 的固定布局；测试指向 fake server）。 */
  readonly socketPath?: string;
  /** 新建 workspace 时随 tab.create 注入的 env（runtime 的 ai 段热注入面）。 */
  readonly env?: () => Readonly<Record<string, string>>;
  /** socket 缺失时自动拉起 headless server（默认 true；测试可关）。 */
  readonly autoStartServer?: boolean;
  /** 提交确认总预算（默认 20s，对齐 L0 sendTextConfirmed）。 */
  readonly submitConfirmMs?: number;
  /** 入队式投递的观察预算（默认 8s，对齐 L0 sendTextQueued）。 */
  readonly queuedConfirmMs?: number;
  /** 单次 socket 请求超时。 */
  readonly requestMs?: number;
  /** headless server 拉起等待预算。 */
  readonly serverStartMs?: number;
  /** 测试注入的睡眠。 */
  readonly sleep?: (ms: number) => Promise<void>;
  readonly log?: (m: string) => void;
}

export interface HerdrClient extends TmuxClient {
  readonly backend: 'herdr';
  readonly session: string;
  /** herdr 原生托管 agent 启动（`herdr agent start` 的 socket 形态，0.9.5+）：
   * 在会话 pane 里以 herdr 管理生命周期的方式拉起一个交互 agent（如
   * kind='zcode'）。与 sendText 手敲命令的差别：herdr 侧登记 managed
   * agent（名字/种类/状态机/恢复语义），`herdr agent list/get/wait` 全链
   * 可观测——「herdr 启动 pi agent」的同款路径。要求 pane 是裸 shell
   * （本 client 的 newSession 产物正是），已在跑 agent 的 pane 会得到
   * herdr 侧 target_busy 报错。 */
  startManagedAgent(session: string, opts: HerdrManagedAgentStart): Promise<Result<HerdrAgentInfo, Error>>;
}

/** agent.start 入参（herdr AgentStartParams 直译；name 规则=小写字母开头、
 * 仅小写/数字/'-'/'_'、≤32 字符，kind 必须 herdr detect 名单内——两样都由
 * herdr 侧校验，这里不重复实现，错误原文透传可诊断）。 */
export interface HerdrManagedAgentStart {
  readonly name: string;
  readonly kind: string;
  /** 透传给 agent CLI 的参数（如 zcode 的 --cwd/--resume）。 */
  readonly args?: readonly string[];
  /** 启动就绪等待预算毫秒（>3000 且 ≤300000，缺省 herdr 30s）。 */
  readonly timeoutMs?: number;
  /** pane shell 落回提示符的等待预算毫秒（新建 workspace 的 zsh 还在跑
   * 启动文件时，herdr 侧 shell-idle 检查会先回 agent_pane_busy——本层按
   * 此预算重试；缺省 15s）。 */
  readonly shellSettleMs?: number;
}

/** agent.start 应答的 agent 节（herdr snake_case 原样，零翻译）。 */
export interface HerdrAgentInfo {
  readonly name?: string;
  readonly agent?: string;
  readonly agent_status?: string;
  readonly pane_id?: string;
  readonly interactive_ready?: boolean;
  readonly terminal_title?: string;
  readonly workspace_id?: string;
}

interface PaneRef {
  readonly workspaceId: string;
  readonly paneId: string;
}

const defaultSleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

let reqSeq = 0;

export const createHerdrClient = (opts: HerdrClientOpts = {}): HerdrClient => {
  const ns = opts.session ?? 'juli';
  const tenant = opts.tenant ?? ns;
  const socketPath = opts.socketPath ?? herdrSocketPath(ns);
  const submitConfirmMs = opts.submitConfirmMs ?? 20_000;
  const queuedConfirmMs = opts.queuedConfirmMs ?? 8_000;
  const requestMs = opts.requestMs ?? 8000;
  const serverStartMs = opts.serverStartMs ?? 10_000;
  const sleepP = opts.sleep ?? defaultSleep;
  const extraEnv: Record<string, string> = {};
  /** label → 寻址缓存（引擎内存态；丢失后由 resolve 的 pane.list 扫描重建）。 */
  const panes = new Map<string, PaneRef>();
  let serverEnsured = false;

  const envFor = (session: string): Record<string, string> => ({
    ...(opts.env?.() ?? {}),
    ...extraEnv,
    JULI_HERDR_SESSION: session,
  });

  const call = (method: string, params: Record<string, unknown>): Promise<Result<Record<string, unknown>, Error>> => {
    const id = `juli:${++reqSeq}`;
    return herdrRequest(socketPath, id, method, params, requestMs);
  };

  /** headless server 拉起：ping 失败 → spawn `herdr --session <ns> server`
   * （detached）→ 轮询等 socket 就绪。CLI 侧查询不会自动拉 server（实测），
   * 引擎是唯一拉起方，与「引擎首建 tmux server 继承引擎 env」同位。 */
  const ensureServer = async (): Promise<Result<void, Error>> => {
    if (serverEnsured) return ok(undefined);
    const ping = await call('ping', {});
    if (ping.ok) {
      serverEnsured = true;
      return ok(undefined);
    }
    if (opts.autoStartServer === false) return err(ping.error);
    opts.log?.(`[herdr] server 不在（${ping.error.message.slice(0, 80)}）——拉起 headless server（session=${ns}）`);
    const child = spawn(HERDR_BIN, ['--session', ns, 'server'], {
      detached: true,
      stdio: 'ignore',
    });
    child.unref();
    const deadline = Date.now() + serverStartMs;
    for (;;) {
      await sleepP(250);
      const again = await call('ping', {});
      if (again.ok) {
        serverEnsured = true;
        return ok(undefined);
      }
      if (Date.now() >= deadline) {
        return err(new Error(`herdr headless server ${serverStartMs}ms 内未就绪（session=${ns}）：${again.error.message.slice(0, 120)}`));
      }
    }
  };

  /** 带一次性 server 拉起重试的调用（仅连接类失败重试一次）。 */
  const request = async (method: string, params: Record<string, unknown>): Promise<Result<Record<string, unknown>, Error>> => {
    const first = await call(method, params);
    if (first.ok) return first;
    if (!first.error.message.includes('server_not_running')) return first;
    const up = await ensureServer();
    if (!up.ok) return first;
    return call(method, params);
  };

  const wireError = (method: string, e: Error): Error =>
    new Error(`herdr ${method} 失败: ${e.message.slice(0, 200)}`);

  interface WorkspaceRec {
    readonly workspace_id: string;
    readonly label: string;
    readonly focused?: boolean;
  }
  interface PaneRec {
    readonly pane_id: string;
    readonly workspace_id: string;
    readonly tab_id: string;
    readonly cwd?: string;
    readonly label?: string;
  }
  interface TabRec {
    readonly tab_id: string;
    readonly workspace_id: string;
    readonly label?: string;
    readonly focused?: boolean;
  }

  const listWorkspaces = async (): Promise<Result<readonly WorkspaceRec[], Error>> => {
    const r = await request('workspace.list', {});
    if (!r.ok) return err(wireError('workspace.list', r.error));
    const list = r.value['workspaces'];
    if (!Array.isArray(list)) return ok([]);
    return ok(list as WorkspaceRec[]);
  };

  const listPanes = async (): Promise<Result<readonly PaneRec[], Error>> => {
    const r = await request('pane.list', {});
    if (!r.ok) return err(wireError('pane.list', r.error));
    const list = r.value['panes'];
    if (!Array.isArray(list)) return ok([]);
    return ok(list as PaneRec[]);
  };

  const listTabs = async (): Promise<Result<readonly TabRec[], Error>> => {
    const r = await request('tab.list', {});
    if (!r.ok) return err(wireError('tab.list', r.error));
    const list = r.value['tabs'];
    if (!Array.isArray(list)) return ok([]);
    return ok(list as TabRec[]);
  };

  /** 租户 workspace 的 id（内存缓存 + 按需扫描；未建返回 undefined）。 */
  const tenantWorkspaceId = async (): Promise<Result<string | undefined, Error>> => {
    const wl = await listWorkspaces();
    if (!wl.ok) return err(wl.error);
    return ok(wl.value.find((w) => w.label === tenant)?.workspace_id);
  };

  /** 会话名 → pane 寻址（v2 映射：tab=会话）：内存缓存 → pane label 扫描
   * （跨重启稳定，2026-11-06 实测 label 随 server 重启持久）→ 租户 workspace
   * 内 tab label 匹配 → legacy 兜底（workspace label=会话名的旧形状，仅迁移
   * 窗口存在）。 */
  const resolve = async (session: string): Promise<Result<PaneRef, Error>> => {
    const cached = panes.get(session);
    if (cached) return ok(cached);
    const want = paneLabelOf(session);
    const pl = await listPanes();
    if (!pl.ok) return err(pl.error);
    const byLabel = pl.value.find((p) => p.label === want);
    if (byLabel) {
      const ref = { workspaceId: byLabel.workspace_id, paneId: byLabel.pane_id };
      panes.set(session, ref);
      return ok(ref);
    }
    const tw = await tenantWorkspaceId();
    if (!tw.ok) return err(tw.error);
    if (tw.value !== undefined) {
      const tl = await listTabs();
      if (!tl.ok) return err(tl.error);
      const tab = tl.value.find((t) => t.workspace_id === tw.value && t.label === session);
      if (tab !== undefined) {
        const pane = pl.value.find((p) => p.tab_id === tab.tab_id);
        if (pane !== undefined) {
          const ref = { workspaceId: tw.value, paneId: pane.pane_id };
          panes.set(session, ref);
          return ok(ref);
        }
      }
    }
    const wl = await listWorkspaces();
    if (!wl.ok) return err(wl.error);
    const ws = wl.value.find((w) => w.label === session);
    if (!ws) return err(new Error(`herdr 会话 "${session}" 不存在（租户 tab 未建）`));
    const pane = pl.value.find((p) => p.workspace_id === ws.workspace_id);
    if (!pane) return err(new Error(`herdr 会话 "${session}" 的 workspace 无可用 pane`));
    const ref = { workspaceId: ws.workspace_id, paneId: pane.pane_id };
    panes.set(session, ref);
    return ok(ref);
  };

  /** 前台进程名（probePane 的 shell/agent 判定数据源）。失败回空串——与
   * tmux list-panes 失败时的容错一致（probePane 对空 cmd 按 shell 处理）。 */
  const foregroundOf = async (paneId: string): Promise<string> => {
    const r = await request('pane.process_info', { pane_id: paneId });
    if (!r.ok) return '';
    const info = r.value['process_info'];
    if (info === undefined || typeof info !== 'object' || info === null) return '';
    const procs = (info as { foreground_processes?: { name?: string }[] }).foreground_processes;
    return Array.isArray(procs) && procs.length > 0 && typeof procs[0]?.name === 'string' ? procs[0].name : '';
  };

  // ---- sendText / 提交确认（L0 sendTextConfirmed 逻辑按 pane.read 移植）----

  const sendRaw = async (session: string, text: string): Promise<Result<void, Error>> => {
    const ref = await resolve(session);
    if (!ref.ok) return ref;
    const sent = await request('pane.send_text', { pane_id: ref.value.paneId, text });
    if (!sent.ok) return err(wireError('pane.send_text', sent.error));
    return ok(undefined);
  };

  const sendEnter = async (session: string): Promise<Result<void, Error>> => {
    const ref = await resolve(session);
    if (!ref.ok) return ref;
    const sent = await request('pane.send_keys', { pane_id: ref.value.paneId, keys: ['enter'] });
    return sent.ok ? ok(undefined) : err(wireError('pane.send_keys', sent.error));
  };

  const sendTextImpl = async (session: string, text: string): Promise<Result<void, Error>> => {
    // 与 L0 同款：>10 字符走 bracketed-paste 包裹（整段原子进输入行），短文本
    // 直发。herdr pane.send_text 是字面字节写，包裹标记由本层自带。
    const wrapped = text.length > 10;
    const body = wrapped ? `\x1b[200~${text}\x1b[201~` : text;
    const sent = await sendRaw(session, body);
    if (!sent.ok) return sent;
    if (wrapped) {
      // paste 落地门（2026-11-06 zcode 实测）：ZCode 的 Ink textarea 异步提交
      // paste 内容，紧跟的 Enter 会赶在提交前把粘贴整段丢掉（claude/pi 无此
      // 问题——它们的首轮轮询即过，零额外延迟）。有界轮询指纹进框再补
      // Enter；1.5s 内未落地也放行（丢粘贴由确认循环的重粘贴分支兜底）。
      const { tail } = promptFingerprints(text);
      const landDeadline = Date.now() + 1500;
      while (tail !== '' && Date.now() < landDeadline) {
        const cap = await capture(session, 40);
        if (cap.ok && submitState(cap.value, tail) !== 'absent') break;
        await sleepP(120);
      }
    }
    return sendEnter(session);
  };

  const capture = async (session: string, lines: number): Promise<Result<string, Error>> => {
    const ref = await resolve(session);
    if (!ref.ok) return ref;
    const r = await request('pane.read', { pane_id: ref.value.paneId, source: 'recent', lines, format: 'text' });
    if (!r.ok) return err(wireError('pane.read', r.error));
    const read = r.value['read'];
    return ok(typeof (read as { text?: unknown } | undefined)?.text === 'string'
      ? (read as { text: string }).text
      : '');
  };

  /** 提交判定（zcode 2026-11-06 实测校准）：claude 流派提交后输入框重置成空
   * ❯ 行（tmux 侧 inputBoxState 的原口径）；ZCode 类 Ink TUI 不重置——「已
   * 提交」的可观测信号是指纹从输入框（最后一个 ╭ 起的圆角框区，输入框恒在
   * 屏幕最底）上移进 transcript。两流派按序判定。 */
  const submitState = (pane: string, tail: string): 'cleared' | 'in-box' | 'absent' => {
    if (tail === '') return 'cleared';
    const at = pane.lastIndexOf(tail);
    if (at >= 0) {
      const below = pane.slice(at).split('\n').slice(1);
      if (below.some((l) => /^\s*❯\s*$/.test(l))) return 'cleared';
    }
    const lines = pane.split('\n');
    let boxStart = -1;
    for (let i = lines.length - 1; i >= 0; i -= 1) {
      if (/^\s*╭/.test(lines[i] ?? '')) {
        boxStart = i;
        break;
      }
    }
    if (boxStart >= 0) {
      const inBox = lines.slice(boxStart).some((l) => l.includes(tail));
      return inBox ? 'in-box' : (at >= 0 ? 'cleared' : 'absent');
    }
    return at === -1 ? 'absent' : 'in-box';
  };

  const sendTextConfirmed = async (session: string, text: string): Promise<Result<SubmitStats, Error>> => {
    const started = Date.now();
    const sent = await sendTextImpl(session, text);
    if (!sent.ok) return sent;
    const { tail } = promptFingerprints(text);
    if (tail === '') return ok({ enters: 0, repasted: false, elapsedMs: Date.now() - started });
    const deadline = Date.now() + submitConfirmMs;
    let enters = 0;
    let seenInBox = false;
    let repasted = false;
    for (;;) {
      await sleepP(280);
      // 40 行窗：ZCode 的 prompt 回显上移后常落出 10 行窗（实测），浅窗会把
      // 已提交误判成 absent、触发不必要的重粘贴。
      const cap = await capture(session, 40);
      if (!cap.ok) return cap;
      const state = submitState(cap.value, tail);
      if (state === 'cleared') {
        return ok({ enters, repasted, elapsedMs: Date.now() - started });
      }
      if (state === 'in-box') seenInBox = true;
      if (Date.now() >= deadline) {
        return err(new Error(
          seenInBox
            ? 'submit_unconfirmed: prompt 已入框但连续补 Enter 未被消费（输入框未重置）——任务未确认提交'
            : 'submit_lost: prompt 末行指纹始终未出现在 pane——疑似粘贴丢失，任务未确认提交',
        ));
      }
      if (!seenInBox && !repasted) {
        repasted = true;
        const again = await sendTextImpl(session, text);
        if (!again.ok) return again;
        continue;
      }
      if (enters < 3) {
        enters += 1;
        const e = await sendEnter(session);
        if (!e.ok) return e;
      }
    }
  };

  const sendTextQueued = async (
    session: string,
    text: string,
  ): Promise<Result<SubmitStats & { readonly finalState: 'cleared' | 'in_box' }, Error>> => {
    const started = Date.now();
    const sent = await sendTextImpl(session, text);
    if (!sent.ok) return sent;
    const { tail } = promptFingerprints(text);
    if (tail === '') {
      return ok({ enters: 0, repasted: false, finalState: 'cleared', elapsedMs: Date.now() - started });
    }
    const deadline = Date.now() + queuedConfirmMs;
    let enters = 0;
    let seen = false;
    let repasted = false;
    for (;;) {
      await sleepP(280);
      const cap = await capture(session, 40);
      if (!cap.ok) return cap;
      const state = submitState(cap.value, tail);
      if (state === 'cleared') {
        return ok({ enters, repasted, finalState: 'cleared', elapsedMs: Date.now() - started });
      }
      if (state === 'in-box') {
        seen = true;
        if (enters < 3) {
          enters += 1;
          const e = await sendEnter(session);
          if (!e.ok) return e;
        }
      }
      if (Date.now() >= deadline) break;
      if (!seen && !repasted) {
        repasted = true;
        const again = await sendTextImpl(session, text);
        if (!again.ok) return again;
      }
    }
    if (seen) {
      return ok({ enters, repasted, finalState: 'in_box', elapsedMs: Date.now() - started });
    }
    return err(new Error('paste_lost: 指纹从未出现在 pane——粘贴未到达会话输入'));
  };

  const killSession = async (session: string): Promise<Result<void, Error>> => {
    // v2 主路：租户 workspace 下的 tab（label=会话名）。
    const tw = await tenantWorkspaceId();
    if (!tw.ok) return err(tw.error);
    if (tw.value !== undefined) {
      const tl = await listTabs();
      if (!tl.ok) return err(tl.error);
      const tab = tl.value.find((t) => t.workspace_id === tw.value && t.label === session);
      if (tab !== undefined) {
        const closed = await request('tab.close', { tab_id: tab.tab_id });
        if (!closed.ok) return err(wireError('tab.close', closed.error));
        panes.delete(session);
        return ok(undefined);
      }
    }
    // legacy 兜底：旧形状（workspace label=会话名）——迁移窗口兼容。
    const wl = await listWorkspaces();
    if (!wl.ok) return err(wl.error);
    const ws = wl.value.find((w) => w.label === session);
    if (ws === undefined) {
      return err(new Error(`herdr 会话 "${session}" 不存在`));
    }
    const closed = await request('workspace.close', { workspace_id: ws.workspace_id });
    if (!closed.ok) return err(wireError('workspace.close', closed.error));
    panes.delete(session);
    return ok(undefined);
  };

  const newSession = async (session: string, cwd?: string): Promise<Result<void, Error>> => {
    const up = await ensureServer();
    if (!up.ok) return up;
    // 租户 workspace 幂等复用（v2：workspace=tenant）。⚠顺序锚（2026-11-06
    // tabv2 实测）：先建会话 tab、最后关默认 tab——先关默认 tab 会把
    // workspace 清成零 tab，herdr 连带删掉整个 workspace（后续 tab.create
    // 报 workspace_not_found）。
    let workspaceId = await tenantWorkspaceId().then((r) => (r.ok ? r.value : undefined));
    let freshDefaultTabId: string | undefined;
    if (workspaceId === undefined) {
      const created = await request('workspace.create', {
        label: tenant, cwd: cwd ?? null, focus: false,
      });
      if (!created.ok) return err(wireError('workspace.create', created.error));
      const w = created.value['workspace'] as { workspace_id: string } | undefined;
      const t = created.value['tab'] as { tab_id: string } | undefined;
      if (w === undefined || t === undefined) {
        return err(new Error('herdr workspace.create 响应缺 workspace/tab（协议漂移，需核对 herdr 版本）'));
      }
      workspaceId = w.workspace_id;
      freshDefaultTabId = t.tab_id;
    }
    // 会话 tab 幂等（重启恢复/半建残留）：按 label 找到即复用（pane 补打
    // label、缓存重建），不盲目新建——重复 warmup 不再堆出双份 tab。
    const tl = await listTabs();
    if (!tl.ok) return err(tl.error);
    const existingTab = tl.value.find((t) => t.workspace_id === workspaceId && t.label === session);
    if (existingTab !== undefined) {
      const pl = await listPanes();
      if (!pl.ok) return err(pl.error);
      const pane = pl.value.find((p) => p.tab_id === existingTab.tab_id);
      if (pane === undefined) {
        return err(new Error(`herdr 会话 "${session}" 的 tab 无可用 pane`));
      }
      if (pane.label !== paneLabelOf(session)) {
        const renamed = await request('pane.rename', { pane_id: pane.pane_id, label: paneLabelOf(session) });
        if (!renamed.ok) return err(wireError('pane.rename', renamed.error));
      }
      panes.set(session, { workspaceId: workspaceId!, paneId: pane.pane_id });
      return ok(undefined);
    }
    // 会话 tab：env 注入唯一验证生效的路径（见文件头实测记录）。
    const tab = await request('tab.create', {
      workspace_id: workspaceId, label: session, cwd: cwd ?? null, env: envFor(session), focus: false,
    });
    if (!tab.ok) return err(wireError('tab.create', tab.error));
    const pane = tab.value['root_pane'] as { pane_id: string } | undefined;
    if (pane === undefined) {
      return err(new Error('herdr tab.create 响应缺 root_pane（协议漂移，需核对 herdr 版本）'));
    }
    // pane label = 跨重启稳定寻址键。
    const renamed = await request('pane.rename', { pane_id: pane.pane_id, label: paneLabelOf(session) });
    if (!renamed.ok) return err(wireError('pane.rename', renamed.error));
    panes.set(session, { workspaceId: workspaceId!, paneId: pane.pane_id });
    // 最后关默认 tab：窗口内只留带 env 的会话 tab（workspace 已有≥1 tab，
    // 关闭不再触发空删）。
    if (freshDefaultTabId !== undefined) {
      const closed = await request('tab.close', { tab_id: freshDefaultTabId });
      if (!closed.ok) opts.log?.(`[herdr] 租户 ${tenant} 默认 tab 关闭失败（不影响使用）: ${closed.error.message.slice(0, 80)}`);
    }
    return ok(undefined);
  };

  const listSessionsDetailed = async (): Promise<Result<readonly TmuxSessionInfo[], Error>> => {
    const wl = await listWorkspaces();
    if (!wl.ok) {
      // 无 server = 正常空态（与 tmux no server running 同语义）。
      if (wl.error.message.includes('server_not_running')) return ok([]);
      return err(wl.error);
    }
    const pl = await listPanes();
    if (!pl.ok) return err(pl.error);
    const rows: TmuxSessionInfo[] = [];
    // v2 主路：租户 workspace 的会话 tab（label=会话名；未打 label 的杂散
    // tab——如默认 '1'——不算会话）。
    const tenantWs = wl.value.find((w) => w.label === tenant);
    if (tenantWs !== undefined) {
      const tl = await listTabs();
      if (!tl.ok) return err(tl.error);
      for (const tab of tl.value) {
        if (tab.workspace_id !== tenantWs.workspace_id) continue;
        const name = (tab.label ?? '').trim();
        if (name === '') continue;
        const pane = pl.value.find((p) => p.tab_id === tab.tab_id);
        if (pane === undefined) continue;
        rows.push({
          name,
          // herdr 无 client attach 态可查：以 server 侧 focus 态作近似（TUI 谁在
          // 看它就亮谁；无客户端时恒 false——与「未附着」语义同形）。
          attached: tab.focused === true,
          path: pane.cwd ?? '',
          cmd: await foregroundOf(pane.pane_id),
        });
      }
      return ok(rows);
    }
    // legacy 兜底（迁移窗口）：旧形状 workspace=会话。
    for (const ws of wl.value) {
      const pane = pl.value.find((p) => p.label === paneLabelOf(ws.label))
        ?? pl.value.find((p) => p.workspace_id === ws.workspace_id);
      if (pane === undefined) continue;
      rows.push({
        name: ws.label,
        attached: ws.focused === true,
        path: pane.cwd ?? '',
        cmd: await foregroundOf(pane.pane_id),
      });
    }
    return ok(rows);
  };

  return {
    backend: 'herdr',
    session: ns,
    async setEnv(vars) {
      // herdr 无 server 级全局 env API：进注入面，对之后新建的 workspace
      // 生效（已在跑的 workspace 不受影响——与 tmux 语义一致）。
      for (const [k, v] of Object.entries(vars)) extraEnv[k] = v;
      return ok(undefined);
    },
    async sendKey(session, key) {
      const ref = await resolve(session);
      if (!ref.ok) return ref;
      const sent = await request('pane.send_keys', { pane_id: ref.value.paneId, keys: [translateKey(key)] });
      return sent.ok ? ok(undefined) : err(wireError('pane.send_keys', sent.error));
    },
    async foregroundCommandOf(session) {
      const ref = await resolve(session);
      // 缺会话回空串：probePane 对空 cmd 按 shell 处理（与 tmux 侧容错同形）。
      if (!ref.ok) return '';
      return foregroundOf(ref.value.paneId);
    },
    async panePathOf(session) {
      const ref = await resolve(session);
      if (!ref.ok) return '';
      const pl = await listPanes();
      if (!pl.ok) return '';
      return pl.value.find((p) => p.pane_id === ref.value.paneId)?.cwd ?? '';
    },
    async sessionBirthsOf() {
      // herdr workspace 无出生时间概念：空表=调用方（transcript 人机混仓
      // 门控）拿到空表即保守回落不门控——方向与 tmux 取不到 created 相同。
      return new Map<string, number>();
    },
    async hasSession(session) {
      // v2：租户 tab；租户未建/迁移窗口走 legacy workspace 名匹配。
      const wl = await listWorkspaces();
      if (!wl.ok) return false;
      const tw = wl.value.find((w) => w.label === tenant);
      if (tw === undefined) return wl.value.some((w) => w.label === session);
      const tl = await listTabs();
      return tl.ok && tl.value.some((t) => t.workspace_id === tw.workspace_id && t.label === session);
    },
    async listSessions() {
      const wl = await listWorkspaces();
      if (!wl.ok) return [];
      const tw = wl.value.find((w) => w.label === tenant);
      if (tw === undefined) return wl.value.map((w) => w.label);
      const tl = await listTabs();
      if (!tl.ok) return [];
      return tl.value
        .filter((t) => t.workspace_id === tw.workspace_id && (t.label ?? '').trim() !== '')
        .map((t) => (t.label ?? '').trim());
    },
    listSessionsDetailed,
    newSession,
    sendText: sendTextImpl,
    sendTextConfirmed,
    sendTextQueued,
    capturePane: capture,
    killSession,
    async interrupt(session) {
      const ref = await resolve(session);
      if (!ref.ok) return ref;
      const sent = await request('pane.send_keys', { pane_id: ref.value.paneId, keys: ['ctrl+c'] });
      return sent.ok ? ok(undefined) : err(wireError('pane.send_keys', sent.error));
    },
    async startManagedAgent(session, opts) {
      const ref = await resolve(session);
      if (!ref.ok) return ref;
      const params: Record<string, unknown> = {
        name: opts.name,
        kind: opts.kind,
        pane_id: ref.value.paneId,
      };
      if (opts.args !== undefined && opts.args.length > 0) params['args'] = [...opts.args];
      if (opts.timeoutMs !== undefined) params['timeout_ms'] = opts.timeoutMs;
      // 新建 workspace 的 shell 还在跑启动文件（zprofile/zshrc）时，herdr 的
      // shell-idle 前置检查回 agent_pane_busy——按 shellSettleMs 预算重试，
      // 与就绪派发的 provision 语义同向。其他错误（invalid_name/unsupported_
      // kind/target_busy 真占位）不重试，原文透传。
      const settleDeadline = Date.now() + (opts.shellSettleMs ?? 15_000);
      let started: HerdrAgentInfo | undefined;
      for (;;) {
        const r = await request('agent.start', params);
        if (r.ok) {
          started = r.value['agent'] as HerdrAgentInfo | undefined;
          if (started === undefined) {
            return err(new Error('herdr agent.start 响应缺 agent（协议漂移，需核对 herdr 版本）'));
          }
          break;
        }
        if (!r.error.message.includes('agent_pane_busy') || Date.now() >= settleDeadline) {
          return err(wireError('agent.start', r.error));
        }
        await sleepP(500);
      }
      // raw agent.start 返回的是提交瞬间快照（interactive_ready 尚未落位）；
      // herdr CLI 的 start 命令同款收尾——轮询 agent.get 到 kind 就绪。
      // 到期不判死（agent 已起，杀之可惜）：返回最后快照，interactive_ready
      // 字段留给调用方裁断；agent 半路消失（name lost）才是硬错误。
      const readyDeadline = Date.now() + (opts.timeoutMs ?? 30_000);
      let info = started;
      for (;;) {
        if (info.agent === opts.kind && info.interactive_ready === true) return ok(info);
        if (Date.now() >= readyDeadline) return ok(info);
        await sleepP(500);
        const g = await request('agent.get', { target: opts.name });
        if (g.ok) {
          const next = g.value['agent'] as HerdrAgentInfo | undefined;
          if (next !== undefined) info = next;
        } else if (!g.error.message.includes('not_found')) {
          return err(wireError('agent.get', g.error));
        }
      }
    },
    socketPath: undefined,
  };
};

/** tmux 键名 → herdr 组合键串（sendKey 翻译；TerminalKey 闭合集全覆盖）。 */
export const translateKey = (key: TerminalKey): string => {
  const map: Readonly<Record<string, string>> = {
    Enter: 'enter', Down: 'down', Up: 'up', Left: 'left', Right: 'right',
    'C-c': 'ctrl+c', 'C-z': 'ctrl+z', 'C-d': 'ctrl+d', Escape: 'esc', Tab: 'tab',
  };
  return map[key] ?? key.toLowerCase();
};

// ---- 同步名单（router listSync 的 herdr 分枝）--------------------------------

/** 生产 listSync：herdr workspace list（label 名单）。CLI 查询在 server 缺席
 * 时干净报错不自动拉起（实测），异常归一空名单——与 tmuxListSync 同语义。 */
export const herdrListSync = (session: string, bin: string = HERDR_BIN): readonly string[] => {
  try {
    const out = execFileSync(bin, ['--session', session, 'workspace', 'list'], {
      encoding: 'utf8', timeout: 3000,
    });
    const v = JSON.parse(out) as { result?: { workspaces?: { label?: string }[] } };
    return (v.result?.workspaces ?? [])
      .map((w) => (w.label ?? '').trim())
      .filter(Boolean);
  } catch {
    return [];
  }
};

// ---- hook 命令组（herdr 分枝）--------------------------------------------------

/** CC hook 的 herdr 会话名解析：workspace 建 tab 时注入的 JULI_HERDR_SESSION
 * env（claude 进程及其 hook 子进程继承）。tmux 分枝用 display-message 运行
 * 时反查；herdr 无对应反查面，env 是唯一稳定通道（server 重启丢 env 的恢复
 * 态由 boot 命令的 JULI_HERDR_SESSION 前缀兜底）。非 juli 环境跑的 claude
 * （用户自己终端里）取到空串 → hook usage 失败静默退 0——与 tmux 分枝同形。
 * 六事件表只在 hooks.ts 一处（2026-11-04 R1 评审 #7），这里只贡献会话名
 * 表达式。 */
export const herdrHookSpecs = (hookJsPath: string, password = '', serviceUrl = ''): readonly HookSpec[] =>
  defaultHookSpecs(hookJsPath, password, serviceUrl, '"$JULI_HERDR_SESSION"');

// ---- PTY attach（web 终端桥的 herdr 分枝）--------------------------------------

/** herdr attach 命令：附着整个 namespace（TUI 全屏，xterm 完整承载）。
 * herdr 无单 pane 的 PTY attach 命令（agent attach 需已识别的 agent 在位，
 * 裸 shell 期不可用）——web 终端从「单会话 pane」升格为「该 namespace 的
 * herdr TUI」，用户在 TUI 里切到目标 workspace。 */
export const herdrAttachCommand = (session: string, bin: string = HERDR_BIN): readonly string[] =>
  [bin, '--session', session];

/** ptyhub 的 herdr attach 实现（形状对齐 L0 attachTmuxPty：不存在→明确
 * 报错不代建；存在→起 PTY 跑 attach 命令）。 */
export const herdrAttach = (deps: {
  readonly client: { hasSession(name: string): Promise<boolean> };
  readonly session: string;
  readonly bin?: string;
}) => async (
  session: string,
  opts: PtyOpts,
  onData?: (chunk: string) => void,
): Promise<Result<PtySession, Error>> => {
  if (!(await deps.client.hasSession(session))) {
    return err(new Error(`会话 ${session} 不存在——终端不代建（创建是显式动作：POST /api/sessions 或由引擎派发）`));
  }
  return ok(createPty(herdrAttachCommand(deps.session, deps.bin), opts, onData));
};

// ---- agent 执行环境文件（boot 兜底通道）----------------------------------------

/** 写 agent env 文件（0600）：runtime 的 ai 段热注入落盘，herdr 恢复态的
 * boot 命令 source 它把 env 灌回 shell（密钥不进 pane scrollback——pane 里
 * 可见的只有 source 那一行文件路径）。 */
export const writeAgentEnvFile = (path: string, vars: Readonly<Record<string, string>>): void => {
  const shQuote = (v: string): string => `'${v.replace(/'/g, `'\\''`)}'`;
  const body = Object.entries(vars)
    .map(([k, v]) => `export ${k}=${shQuote(v)}`)
    .join('\n');
  writeFileSync(path, `${body}\n`, { mode: 0o600 });
};

/** herdr 分枝的引导命令：source env 文件 + 会话名 env 前缀 + 原引导命令。
 * 新建态走 tab env 已有这些变量（重复 export 幂等无害）；恢复态（server
 * 重启 pane 复位裸 shell、env 全丢，实测）靠这行兜底——两条路同一形状。 */
export const herdrBootCommand = (base: string, envFile: string, session: string): string =>
  `. '${envFile.replace(/'/g, `'\\''`)}' >/dev/null 2>&1; JULI_HERDR_SESSION='${session.replace(/'/g, `'\\''`)}' ${base}`;

// ---- 测试脚手架：进程内 fake herdr server --------------------------------------

/** fake herdr server（契约测试用）：进程内 unix socket 上跑换行分隔 JSON，
 * 记录收到的全部请求，按状态机应答 workspace/tab/pane 的最小闭环。 */
export interface FakeHerdr {
  readonly socketPath: string;
  readonly requests: { method: string; params: Record<string, unknown> }[];
  /** 脚本化 pane.read 输出（sendTextConfirmed 轮询的回放序列）。 */
  setReads(texts: readonly string[]): void;
  close(): Promise<void>;
}

export const startFakeHerdr = async (socketPath: string): Promise<FakeHerdr> => {
  const requests: { method: string; params: Record<string, unknown> }[] = [];
  let reads: readonly string[] = [];
  let readIdx = 0;
  let wsSeq = 0;
  let paneSeq = 0;
  let tabSeq = 0;
  const workspaces: { workspace_id: string; label: string; focused: boolean }[] = [];
  const panes: { pane_id: string; workspace_id: string; tab_id: string; label: string; cwd: string; foreground: string }[] = [];
  const tabs: { tab_id: string; workspace_id: string; label: string }[] = [];
  const managedAgents: { pane_id: string; name: string; kind: string }[] = [];
  const server = createServer((sock) => {
    let buf = '';
    sock.on('data', (chunk) => {
      buf += chunk.toString('utf8');
      let nl: number;
      while ((nl = buf.indexOf('\n')) !== -1) {
        const line = buf.slice(0, nl);
        buf = buf.slice(nl + 1);
        if (line.trim() === '') continue;
        const req = JSON.parse(line) as { id: string; method: string; params: Record<string, unknown> };
        requests.push({ method: req.method, params: req.params });
        sock.write(`${JSON.stringify(handle(req))}\n`);
      }
    });
  });
  const handle = (req: { id: string; method: string; params: Record<string, unknown> }): unknown => {
    const okR = (result: Record<string, unknown>): unknown => ({ id: req.id, result: { type: 'ok', ...result } });
    const errR = (code: string, message: string): unknown => ({ id: req.id, error: { code, message } });
    switch (req.method) {
      case 'ping':
        return okR({ type: 'pong' });
      case 'workspace.create': {
        wsSeq += 1;
        tabSeq += 1;
        paneSeq += 1;
        const wsId = `w${wsSeq}`;
        workspaces.push({ workspace_id: wsId, label: String(req.params['label'] ?? ''), focused: false });
        const defTabId = `${wsId}:t${tabSeq}`;
        tabs.push({ tab_id: defTabId, workspace_id: wsId, label: '1' });
        panes.push({
          pane_id: `${wsId}:p${paneSeq}`, workspace_id: wsId, tab_id: defTabId, label: '',
          cwd: String(req.params['cwd'] ?? ''), foreground: 'zsh',
        });
        return okR({
          workspace: { workspace_id: wsId, label: req.params['label'] },
          tab: { tab_id: `${wsId}:t${tabSeq}` },
          root_pane: { pane_id: `${wsId}:p${paneSeq}` },
        });
      }
      case 'workspace.list':
        return okR({ workspaces });
      case 'tab.create': {
        tabSeq += 1;
        paneSeq += 1;
        const wsId = String(req.params['workspace_id'] ?? '');
        const tabId = `${wsId}:t${tabSeq}`;
        tabs.push({ tab_id: tabId, workspace_id: wsId, label: String(req.params['label'] ?? '') });
        panes.push({
          pane_id: `${wsId}:p${paneSeq}`, workspace_id: wsId, tab_id: tabId, label: '',
          cwd: String(req.params['cwd'] ?? ''), foreground: 'zsh',
        });
        return okR({ tab: { tab_id: tabId }, root_pane: { pane_id: `${wsId}:p${paneSeq}` } });
      }
      case 'pane.rename': {
        const pane = panes.find((p) => p.pane_id === req.params['pane_id']);
        if (pane) pane.label = String(req.params['label'] ?? '');
        return pane ? okR({ pane }) : errR('not_found', 'pane not found');
      }
      case 'tab.list':
        return okR({ tabs });
      case 'tab.close': {
        const i = tabs.findIndex((t) => t.tab_id === req.params['tab_id']);
        if (i >= 0) {
          const closedTab = tabs[i]!.tab_id;
          tabs.splice(i, 1);
          for (let j = panes.length - 1; j >= 0; j--) if (panes[j]!.tab_id === closedTab) panes.splice(j, 1);
        }
        return okR({});
      }
      case 'workspace.close': {
        const wsId = String(req.params['workspace_id'] ?? '');
        const i = workspaces.findIndex((w) => w.workspace_id === wsId);
        if (i >= 0) workspaces.splice(i, 1);
        for (let j = panes.length - 1; j >= 0; j--) if (panes[j]!.workspace_id === wsId) panes.splice(j, 1);
        return okR({});
      }
      case 'pane.list':
        return okR({ panes });
      case 'pane.process_info': {
        const pane = panes.find((p) => p.pane_id === req.params['pane_id']);
        return pane
          ? okR({ process_info: { foreground_processes: [{ name: pane.foreground }] } })
          : errR('not_found', 'pane not found');
      }
      case 'pane.send_text':
        return panes.some((p) => p.pane_id === req.params['pane_id'])
          ? okR({})
          : errR('not_found', 'pane not found');
      case 'pane.send_keys':
        return panes.some((p) => p.pane_id === req.params['pane_id'])
          ? okR({})
          : errR('not_found', 'pane not found');
      case 'agent.start': {
        const pane = panes.find((p) => p.pane_id === req.params['pane_id']);
        if (!pane) return errR('not_found', 'pane not found');
        if (managedAgents.some((a) => a.pane_id === pane.pane_id)) {
          return errR('target_busy', 'agent already running in pane');
        }
        const name = String(req.params['name'] ?? '');
        const kind = String(req.params['kind'] ?? '');
        managedAgents.push({ pane_id: pane.pane_id, name, kind });
        // 托管启动后前台进程即 agent 可执行名（与真实 herdr 的 managed 归因同形）。
        pane.foreground = kind;
        // raw agent.start = 提交瞬间快照（就绪未落位）——与真实 herdr 同形，
        // 客户端的就绪轮询走 agent.get。
        return okR({
          agent: {
            name,
            agent: kind,
            agent_status: 'unknown',
            pane_id: pane.pane_id,
            interactive_ready: false,
          },
        });
      }
      case 'agent.get': {
        const target = String(req.params['target'] ?? '');
        const rec = managedAgents.find((a) => a.name === target || a.pane_id === target);
        if (!rec) return errR('not_found', 'agent not found');
        return okR({
          agent: {
            name: rec.name,
            agent: rec.kind,
            agent_status: 'idle',
            pane_id: rec.pane_id,
            interactive_ready: true,
          },
        });
      }
      case 'pane.read': {
        const pane = panes.find((p) => p.pane_id === req.params['pane_id']);
        if (!pane) return errR('not_found', 'pane not found');
        const text = reads[Math.min(readIdx, reads.length - 1)] ?? '';
        readIdx += 1;
        return okR({ read: { pane_id: pane.pane_id, text } });
      }
      default:
        return errR('not_found', `unknown method ${req.method}`);
    }
  };
  await new Promise<void>((resolve) => server.listen(socketPath, resolve));
  return {
    socketPath,
    requests,
    setReads(texts) {
      reads = texts;
      readIdx = 0;
    },
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
};
