// tmux 执行器（对应 Go internal/runtime/tmux 的命令面）。CLI 驱动：建会话、
// 发文本（bracketed-paste 保证大文本原子落地）、抓 pane、杀会话。轮询状态
// 镜像与 keepalive 属于桌面侧体验，服务端部署首版不需要。

import { execFile } from 'node:child_process';
import { accessSync, constants } from 'node:fs';
import { join } from 'node:path';
import { err, ok, toResult, type Result } from '../shared/result.ts';

/** 可执行探测：accessSync X_OK——existsSync 只查存在，PATH 目录里同名不可执行
 * 文件（数据文件/半成品）execvp 会跳过继续找，误判命中只会把失败拖到运行期
 * EACCES（2026-10-09 Review P2）。 */
const canExec = (p: string): boolean => {
  try {
    accessSync(p, constants.X_OK);
    return true;
  } catch {
    return false;
  }
};

/** tmux 二进制解析（2026-10-08 新机迁移 GUI 拉起引擎事故）：GUI 子进程默认
 * PATH 只有 /usr/bin:/bin:/usr/sbin:/sbin——homebrew 的 tmux 会 spawn ENOENT
 * （warmup 全失败、派发 2 秒 failed，服务本身正常=最迷惑的形态）。PATH 查得
 * 到仍用 'tmux'（尊重自装覆盖）；查不到按常见安装位兜底成绝对路径。第二参
 * 保留注入位（测试用，形态仍 (p:string)=>boolean）；默认实现自 X_OK 探测起，
 * 语义=「存在且可执行」而非仅存在。 */
export const resolveTmuxBin = (
  pathEnv: string | undefined = process.env['PATH'],
  exists: (p: string) => boolean = canExec,
): string => {
  if (pathEnv?.split(':').some((dir) => dir !== '' && exists(join(dir, 'tmux')))) return 'tmux';
  for (const candidate of ['/opt/homebrew/bin/tmux', '/usr/local/bin/tmux']) {
    if (exists(candidate)) return candidate;
  }
  return 'tmux'; // 常见位也没有：保留原名，让 ENOENT 原样显性可诊断
};

/** 进程级解析一次：启动时定死，运行中不漂移（测试直调 resolveTmuxBin 注入）。 */
export const TMUX_BIN = resolveTmuxBin();

/** tmux 子进程环境：强制声明一个 UTF-8 locale（2026-10-10 launchd 裸环境事故）。
 * tmux 在无任何 LANG/LC_* 的环境里进非 UTF-8 模式，`-F` 格式串里的字面 tab
 * 会被渲染成下划线——listSessionsDetailed 的 tab 分隔整体失效，会话名变成
 * "name_0_cwd_cmd" 复合串（graph/DAG 节点翻倍、终端按错误名 attach 打不开）。
 * 已声明的 locale 不覆盖（尊重显式配置）；tmux 只认字符串含 "UTF-8"，
 * C.UTF-8 在 macOS/Linux 都可用。 */
export const tmuxEnv = (): NodeJS.ProcessEnv => {
  const hasLocale = (process.env['LANG'] ?? '') + (process.env['LC_ALL'] ?? '')
    + (process.env['LC_CTYPE'] ?? '');
  return hasLocale.includes('UTF-8') || hasLocale.includes('utf8')
    ? process.env
    : { ...process.env, LC_ALL: 'C.UTF-8' };
};

const run = (cmd: string, args: readonly string[], timeoutMs = 10_000): Promise<Result<string, Error>> =>
  toResult(new Promise<string>((resolve, reject) => {
    execFile(cmd, [...args], { timeout: timeoutMs, encoding: 'utf8', env: tmuxEnv() }, (e, stdout) => {
      if (e) {
        reject(new Error(`${cmd} ${args.join(' ')}: ${e.message.slice(0, 300)}`));
      } else {
        resolve(stdout);
      }
    });
  }), 'tmux command failed');

export interface TmuxSessionInfo {
  readonly name: string;
  readonly attached: boolean;
  readonly path: string;
  readonly cmd: string;
}

// ---- 提交确认（2026-09-21 冷启动吞 Enter 事故）--------------------------------
// sendText 的「paste + Enter」在 Claude 冷启动窗口（SessionStart 横幅/ink 重绘）
// 里 Enter 会被吞：文本躺在输入框、ctx 0%、Stop hook 永远不来——静默挂死 10 分钟
// 的实测形态。sendTextConfirmed 在发出后 280ms 级轮询验证「输入框已重置」，
// 被吞只补 Enter（绝不重发文本，防双重粘贴），~4s 内确认或显性失败。

/** prompt 指纹对：首/末非空行各取前 40 字符——输入框判定锚（框内可见的是末行，
 * 提交后对话记录可见的是首行）。 */
export const promptFingerprints = (text: string): { readonly head: string; readonly tail: string } => {
  const lines = text.split('\n').map((l) => l.trim()).filter((l) => l !== '');
  return {
    head: (lines[0] ?? '').slice(0, 40),
    tail: (lines.at(-1) ?? '').slice(0, 40),
  };
};

/** 输入框状态：tail 在底部输入框区（未提交）；tail 下方出现空的 ❯ 行（已提交，
 * 输入框重置）；两者都不在 pane（已提交滚出视野，或粘贴丢失——由调用方结合
 * 「曾见指纹」区分）。 */
export const inputBoxState = (pane: string, tail: string): 'cleared' | 'in-box' | 'absent' => {
  if (tail === '') return 'cleared';
  const at = pane.lastIndexOf(tail);
  if (at === -1) return 'absent';
  const below = pane.slice(at).split('\n').slice(1);
  return below.some((l) => /^\s*❯\s*$/.test(l)) ? 'cleared' : 'in-box';
};

const sleepP = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** 提交确认的观测数据（测试器/CLI 的可见性面）：实际补了几次 Enter、
 * 是否触发过整段补粘贴、总耗时。 */
export interface SubmitStats {
  readonly enters: number;
  readonly repasted: boolean;
  readonly elapsedMs: number;
}

export interface TmuxClient {
  /** 本 client 绑定的 socket 路径（undefined=default socket）。web 终端
   * attach 侧用它拼 `-S`——PTY attach 是裸 tmux 命令，不经本 client。 */
  readonly socketPath?: string;
  hasSession(name: string): Promise<boolean>;
  /** 原生命令面（pane-probe 等确定性探测用）。 */
  exec(args: readonly string[]): Promise<Result<string, Error>>;
  listSessions(): Promise<readonly string[]>;
  /** 单条 list-sessions 批量取会话元数据（列表面 N+1 消除）：
   * `#{session_name}\t#{session_attached}\t#{pane_current_path}\t#{pane_current_command}`。
   * 无活动 server（零会话）= 正常空态，返回空数组而非错误。 */
  listSessionsDetailed(): Promise<Result<readonly TmuxSessionInfo[], Error>>;
  newSession(name: string, cwd?: string): Promise<Result<void, Error>>;
  /** 发文本进会话。>10 字符走 bracketed-paste + 回车（原子），短文本直接
   * send-keys（tmux 对短参数的逐键合并语义与 Go 版一致）。无提交确认——
   * 任务派发用 sendTextConfirmed。 */
  sendText(name: string, text: string): Promise<Result<void, Error>>;
  /** 确认式发送：paste + Enter 后轮询验证输入框已重置；Enter 被吞只补 Enter
   * （不重发文本），~20s 内确认或显性失败（guard=submit_unconfirmed）。 */
  sendTextConfirmed(name: string, text: string): Promise<Result<SubmitStats, Error>>;
  /** 入队式投递（intervene/relay 面，2026-09-23 插话 400 事故）：忙碌会话里
   * CC 把输入排队消费、输入框不重置是常态——严格提交确认对它永远超时
   * （实测 20127ms ≈ submitConfirmMs 耗尽）。这里只验证「文本到达过会话」：
   * 指纹出现在 pane（框内或提交后）即成立；in_box 到期也接受（排队待消费）；
   * 从未出现 → 补一次粘贴再判，仍无 → paste_lost。 */
  sendTextQueued(name: string, text: string): Promise<Result<SubmitStats & { readonly finalState: 'cleared' | 'in_box' }, Error>>;
  capturePane(name: string, lines?: number): Promise<Result<string, Error>>;
  killSession(name: string): Promise<Result<void, Error>>;
  interrupt(name: string): Promise<Result<void, Error>>;
}

export const createTmuxClient = (opts: {
  socketPath?: string;
  /** 提交确认总预算（默认 20s）：4s 实测产假阴性——agent 忙时 prompt 入队
   * 稍后才消费（2026-09-21 深夜用户实测「实际上已经提交了」）。 */
  submitConfirmMs?: number;
  /** 入队式投递的观察预算（默认 8s）：到达即返，in_box 到期也接受——
   * 这里等的不是「提交被消费」（可能要等整个 agent 回合），只是「到达」。 */
  queuedConfirmMs?: number;
  /** 测试注入的睡眠（默认真睡）。 */
  sleep?: (ms: number) => Promise<void>;
} = {}): TmuxClient => {
  const socketArgs = opts.socketPath ? ['-S', opts.socketPath] : [];
  const submitConfirmMs = opts.submitConfirmMs ?? 20_000;
  const queuedConfirmMs = opts.queuedConfirmMs ?? 8_000;
  const sleepP = opts.sleep ?? ((ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms)));
  return {
    async exec(args) {
      return run(TMUX_BIN, [...socketArgs, ...args]);
    },
    async hasSession(name) {
      // run() 返回的已是 Result——此前 .then(ok) 又包一层，导致 .ok 恒真：
      // 派发因此跳过建会话、直接向不存在的会话 send-keys（can't find pane
      // 事故根因）。exit 0 = 在，非 0 = 不在。
      const res = await run(TMUX_BIN, [...socketArgs, 'has-session', '-t', name]);
      return res.ok;
    },
    async listSessions() {
      const res = await run(TMUX_BIN, [...socketArgs, 'list-sessions', '-F', '#{session_name}']);
      if (!res.ok) return [];
      return res.value.split('\n').map((s) => s.trim()).filter(Boolean);
    },
    async listSessionsDetailed() {
      const res = await run(TMUX_BIN, [...socketArgs, 'list-sessions', '-F',
        '#{session_name}\t#{session_attached}\t#{pane_current_path}\t#{pane_current_command}']);
      if (!res.ok) {
        // 零会话 = tmux server 未运行（正常空态），不是错误。
        if (res.error.message.includes('no server running')) return ok([]);
        return err(res.error);
      }
      const rows = res.value
        .split('\n')
        .filter((l) => l.trim() !== '')
        .map((l) => {
          const [name, attached, path, cmd] = l.split('\t');
          return {
            name: (name ?? '').trim(),
            attached: (attached ?? '0').trim() !== '0',
            path: (path ?? '').trim(),
            cmd: (cmd ?? '').trim(),
          };
        })
        .filter((s) => s.name !== '');
      return ok(rows);
    },
    async newSession(name, cwd) {
      const args = [...socketArgs, 'new-session', '-d', '-s', name];
      if (cwd) args.push('-c', cwd);
      const res = await run(TMUX_BIN, args);
      return res.ok ? ok(undefined) : err(res.error);
    },
    async sendText(name, text) {
      if (text.length > 10) {
        // bracketed-paste：粘贴语义整段进入输入行，回车一次提交——大段
        // prompt 的原子性保证（对齐 Go 版 SendConfirmed）。
        const pasted = `\x1b[200~${text}\x1b[201~`;
        const a = await run(TMUX_BIN, [...socketArgs, 'send-keys', '-t', name, '-l', pasted]);
        if (!a.ok) return a;
        const b = await run(TMUX_BIN, [...socketArgs, 'send-keys', '-t', name, 'Enter']);
        return b.ok ? ok(undefined) : err(b.error);
      }
      const res = await run(TMUX_BIN, [...socketArgs, 'send-keys', '-t', name, '-l', text]);
      if (!res.ok) return res;
      const enter = await run(TMUX_BIN, [...socketArgs, 'send-keys', '-t', name, 'Enter']);
      return enter.ok ? ok(undefined) : err(enter.error);
    },
    async sendTextConfirmed(name, text) {
      const started = Date.now();
      const sent = await this.sendText(name, text);
      if (!sent.ok) return sent;
      const { tail } = promptFingerprints(text);
      if (tail === '') return ok({ enters: 0, repasted: false, elapsedMs: Date.now() - started });
      const deadline = Date.now() + submitConfirmMs;
      let enters = 0;
      let seenInBox = false;
      let repasted = false;
      for (;;) {
        await sleepP(280);
        const cap = await this.capturePane(name, 10);
        if (!cap.ok) return cap;
        const state = inputBoxState(cap.value, tail);
        if (state === 'cleared') {
          return ok({ enters, repasted, elapsedMs: Date.now() - started });
        }
        if (state === 'in-box') seenInBox = true;
        if (Date.now() >= deadline) {
          return err(new Error(
            seenInBox
              ? 'submit_unconfirmed: prompt 已入框但连续补 Enter 未被消费（输入框未重置）——任务未确认提交'
              : 'submit_lost: prompt 首尾指纹始终未出现在 pane——疑似粘贴丢失，任务未确认提交',
          ));
        }
        // 被吞只补 Enter（空输入框上的 Enter 是 no-op，安全）；从没见过指纹 =
        // 粘贴丢失，补一次完整粘贴（仅一次，防连环双投）。
        if (!seenInBox && !repasted) {
          repasted = true;
          const again = await this.sendText(name, text);
          if (!again.ok) return again;
          continue;
        }
        if (enters < 3) {
          enters += 1;
          await this.exec(['send-keys', '-t', name, 'Enter']);
        }
      }
    },
    async sendTextQueued(name, text) {
      const started = Date.now();
      const sent = await this.sendText(name, text);
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
        await sleepP(280); // 先给粘贴留渲染时间——立即抓屏会把「还没画出来」误判成丢失
        const cap = await this.capturePane(name, 10);
        if (!cap.ok) return cap;
        const state = inputBoxState(cap.value, tail);
        if (state === 'cleared') {
          return ok({ enters, repasted, finalState: 'cleared', elapsedMs: Date.now() - started });
        }
        if (state === 'in-box') {
          seen = true;
          // 吞 Enter 兜底：空输入框上的 Enter 是 no-op；in_box 时补 Enter
          // 只会促成提交/入队，不会重复粘贴文本。
          if (enters < 3) {
            enters += 1;
            await this.exec(['send-keys', '-t', name, 'Enter']);
          }
        }
        if (Date.now() >= deadline) break;
        if (!seen && !repasted) {
          // 从没见过指纹 = 粘贴丢失，补一次完整粘贴（仅一次，防连环双投）。
          repasted = true;
          const again = await this.sendText(name, text);
          if (!again.ok) return again;
        }
      }
      // 到期仍在框内：忙碌会话的排队形态——到达即投递成立。
      if (seen) {
        return ok({ enters, repasted, finalState: 'in_box', elapsedMs: Date.now() - started });
      }
      return err(new Error('paste_lost: 指纹从未出现在 pane——粘贴未到达会话输入'));
    },
    async capturePane(name, lines = 2000) {
      const res = await run(TMUX_BIN, [
        ...socketArgs, 'capture-pane', '-p', '-t', name, '-S', `-${lines}`,
      ]);
      return res.ok ? ok(res.value) : err(res.error);
    },
    async killSession(name) {
      const res = await run(TMUX_BIN, [...socketArgs, 'kill-session', '-t', name]);
      return res.ok ? ok(undefined) : err(res.error);
    },
    async interrupt(name) {
      const res = await run(TMUX_BIN, [...socketArgs, 'send-keys', '-t', name, 'C-c']);
      return res.ok ? ok(undefined) : err(res.error);
    },
    socketPath: opts.socketPath,
  };
};
