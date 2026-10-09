// 就绪派发（对应 pane_probe 的"什么算就绪"契约）：任务只在 agent 就绪后
// 出手。裸 shell 自动拉起 agent 并等 REPL 就绪；信任对话框安全接受（默认
// 高亮是 No, exit，Down+Enter）；带编号选择菜单（权限/模型/部署确认）按
// 默认高亮项 Enter 同意——2026-09-21 用户裁定：审核面在 juli 闸门，任务
// 既已过闸，claude 交互层不再二次审核。
//
// 2026-09-12 事故修复：此前 dispatch 对新会话只 new-session（裸 bash）就
// send-keys——任务文本打进 shell 提示符，甚至整段被当命令执行；会话缺失
// 时 send-keys 直接 can't find session。派发前确保 agent 在位，失败显式
// 报错进步 output，不再产生静默僵尸。

import { realpathSync } from 'node:fs';
import type { TmuxClient } from './tmux.ts';
import { probePane } from './pane_probe.ts';
import { err, ok, type Result } from '../shared/result.ts';
import { decideContextAction } from './contextGate.ts';

export interface ProvisioningOpts {
  readonly tmux: TmuxClient;
  /** CC context 门（wf_a79a6fcbf7ef）：切单 clear / 阈值 compact——
   * 派发任务消息之前执行。缺省不启用（undefined = 无门，行为不变）。 */
  readonly contextGate?: {
    readonly workflowFor: (session: string) => Promise<string>;
    readonly contextTokensFor: (session: string) => Promise<number>;
    readonly threshold?: number;
  };
  readonly log?: (m: string) => void;
  /** 裸 shell 里拉起 agent 的命令（claude CLI）。 */
  readonly bootCommand?: string;
  /** 会话感知的引导命令（2026-09-28 模型分层）：优先于 bootCommand——
   * 声明 high 的会话冷启动带 `--model <高档 id>`，其余照常。缺省回落
   * bootCommand/'claude'。已就绪的会话不受影响（模型只在引导时定档）。 */
  readonly bootFor?: (session: string) => string;
  /** 等待就绪上限（毫秒）；超时拒派。 */
  readonly waitReadyMs?: number;
  readonly pollMs?: number;
  readonly sleep?: (ms: number) => Promise<void>;
  /** 绑定会话的自建 cwd（专用 agent 隔离：会话须在指定目录启动才能看到
   * 项目级 skill）；未命中返回 undefined 走默认 cwd。 */
  readonly cwdFor?: (session: string) => string | undefined;
}

const defaultSleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** 目录等价比较（绑定会话复用校验用）：macOS tmux 会把 /tmp 报成 /private/tmp，
 * 先各自 realpath（不存在则退回去尾斜杠原样），消掉符号链接与尾斜杠差异。 */
const sameDir = (a: string, b: string): boolean => {
  const norm = (p: string): string => {
    try {
      return realpathSync(p);
    } catch {
      return p.replace(/\/+$/, '') || '/';
    }
  };
  return norm(a) === norm(b);
};

export const createProvisioningDispatch = (opts: ProvisioningOpts) => {
  // CC context 门（wf_a79a6fcbf7ef）：发任务消息之前按判定执行 clear/compact。
  // 状态内存 Map（重启丢失只多发一次 clear，幂等无害）；判定纯函数在
  // contextGate.ts（可单测）。斜杠命令发完等 REPL 再回就绪（compact 耗时
  // 轮询上限 120s）；失败降级为直接发任务（context 管理不阻塞派发）。
  const gate = opts.contextGate;
  const gateState = new Map<string, { wf: string; lastInputTokens: number; compactAt?: number }>();
  const runGate = async (session: string): Promise<void> => {
    if (!gate) return;
    try {
      const curWf = await gate.workflowFor(session);
      const lastTokens = await gate.contextTokensFor(session);
      const prev = gateState.get(session);
      const action = decideContextAction(prev, curWf, lastTokens, gate.threshold, Date.now());
      // compactAt 只在真执行 compact 时刷新——冷却窗内的无动作 tick 不得重置
      // 冷却；clear 后保留旧 compactAt，恰好压住「摄取滞后的 stale 膨胀值 +
      // 新单」的误 compact。
      gateState.set(session, {
        wf: curWf, lastInputTokens: lastTokens,
        compactAt: action === 'compact' ? Date.now() : prev?.compactAt,
      });
      if (action === null) return;
      opts.log?.(`contextGate ${session}: ${action}（切单=${prev?.wf ?? '∅'}→${curWf || '∅'} · lastIn=${lastTokens}）`);
      const slash = action === 'clear' ? '/clear' : '/compact';
      const sent = await opts.tmux.sendTextConfirmed(session, slash);
      if (!sent.ok) { opts.log?.(`contextGate ${session}: ${slash} 发送失败（降级直发任务）`); return; }
      // 等 REPL 回就绪（/compact 可能要跑一阵；/clear 快）。
      const deadline = Date.now() + 120_000;
      for (;;) {
        await sleep(1_500);
        const p = await probePane(opts.tmux, session);
        if (p.ready) return;
        if (Date.now() > deadline) {
          opts.log?.(`contextGate ${session}: ${slash} 后 120s 未回就绪（继续直发，任务不阻塞）`);
          return;
        }
      }
    } catch (e) {
      opts.log?.(`contextGate ${session}: 判定异常（${String(e).slice(0, 80)}）——跳过`);
    }
  };
  const boot = opts.bootCommand ?? 'claude';
  // 冷启动余量：新会话 = 建会话 + claude 启动（含信任对话框/初始化），
  // 实测可超 90s——240s 上限，宁可慢等不可误杀。
  const waitMs = opts.waitReadyMs ?? 240_000;
  const pollMs = opts.pollMs ?? 2000;
  const sleep = opts.sleep ?? defaultSleep;

  return async (_source: string, session: string, text: string): Promise<Result<void, Error>> => {
    const wantCwd = opts.cwdFor?.(session);
    if (await opts.tmux.hasSession(session)) {
      // 绑定会话复用校验（2026-09-20 P2 预建旁路兜底）：有配置 cwd 的绑定会话
      // 复用前比对现存 path——预建的同名会话（任意目录，项目级 skill 缺席）
      // 不再被静默复用，显性 failed 留痕。
      if (wantCwd !== undefined) {
        const det = await opts.tmux.listSessionsDetailed();
        const cur = det.ok ? det.value.find((s) => s.name === session) : undefined;
        if (cur !== undefined && !sameDir(cur.path, wantCwd)) {
          return err(new Error(
            `会话 ${session} 是绑定会话，但当前目录（${cur.path}）与配置 cwd（${wantCwd}）不符——拒绝派发；请核对该会话来源或删除后由引擎重建`,
          ));
        }
      }
    } else {
      const created = await opts.tmux.newSession(session, wantCwd);
      if (!created.ok) return created;
      opts.log?.(`dispatch ${session}: 会话不存在，已新建${wantCwd !== undefined ? `（cwd=${wantCwd}）` : ''}`);
    }
    const t0 = Date.now();
    let trustAccepted = false;
    let bootedHere = false;
    let probe = await probePane(opts.tmux, session);
    if (probe.foregroundIsShell) {
      const cmd = opts.bootFor?.(session) ?? boot;
      opts.log?.(`dispatch ${session}: 裸 shell——拉起 ${cmd}`);
      bootedHere = true;
      const booted = await opts.tmux.sendText(session, cmd);
      if (!booted.ok) return booted;
    }
    for (;;) {
      probe = await probePane(opts.tmux, session);
      if (probe.ready) break;
      if (probe.trustDialog) {
        // CC 信任对话框默认高亮是「No, exit」——裸 Enter 会退出 agent
        // （2026-09-12 三跑事故：Enter 选了 No，claude 退出回 shell）。
        // 正确接受 = Down 把光标移到「Yes, I trust this folder」再 Enter。
        if (!trustAccepted) {
          trustAccepted = true; // 一个等待周期只接受一次，防连按
          opts.log?.(`dispatch ${session}: 信任对话框——Down+Enter 接受`);
          const down = await opts.tmux.exec(['send-keys', '-t', session, 'Down']);
          if (!down.ok) return down;
          const acc = await opts.tmux.sendText(session, '');
          if (!acc.ok) return acc;
        } else {
          await sleep(pollMs); // 已接受仍在渲染中，等下一轮 probe
        }
      } else if (probe.liveSelection) {
        // 选择菜单（权限/模型/部署确认/询问）→ 按默认高亮项 Enter 同意
        // （2026-09-21 用户裁定：审核面在 juli 闸门，任务既已过闸，claude
        // 交互层不再二次审核；破坏性缺省的信任对话框走上方 Down+Enter 分支）。
        // 每轮至多一次按键；菜单未消等下一轮 probe，waitMs 兜底。
        opts.log?.(`dispatch ${session}: 选择菜单——按默认项 Enter 同意（juli 闸门已审）`);
        const acc = await opts.tmux.sendText(session, '');
        if (!acc.ok) return acc;
        await sleep(pollMs);
      }
      if (Date.now() - t0 > waitMs) {
        return err(new Error(
          `会话 ${session} 的 agent ${waitMs}ms 内未就绪（${probe.reason}）——派发中止，任务未发出`,
        ));
      }
      await sleep(pollMs);
    }
    // 冷启动错峰（2026-09-21 wf_3a435bf00a54 事故）：本派发自己拉起的 claude，
    // SessionStart 横幅期 ink 重绘会吞掉 sendText 的 Enter——ready 判定无法
    // 区分「启动中/空闲」，固定错峰 1.5s 再出手；确认层（sendTextConfirmed）
    // 兜住剩余竞态。
    if (bootedHere) await sleep(1_500);
    await runGate(session);
    const r = await opts.tmux.sendTextConfirmed(session, text);
    return r.ok ? ok(undefined) : r;
  };
};

// 供测试与调用方引用就绪判定的语义出口。
export { probePane, ok };
