// PTY 会话（对应 Go 的 creack/pty 面）。零原生依赖实现：/usr/bin/expect
// 分配伪终端（stty_init 原生设行列，interact 桥接双向字节流）。
// 限制：无运行中 resize（重连生效）——xterm 前端按固定行列渲染。
// （node-pty 在本机 posix_spawnp 失败，故走 expect；macOS 自带。）

import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { err, ok, type Result } from '../shared/result.ts';
import { TMUX_BIN } from './tmux.ts';

export interface PtyOpts {
  readonly cols?: number;
  readonly rows?: number;
  readonly env?: Readonly<Record<string, string>>;
}

export interface PtySession {
  write(data: string): void;
  kill(): void;
  readonly exit: Promise<number>;
}

export const DEFAULT_PTY_COLS = 120;
export const DEFAULT_PTY_ROWS = 32;

export const createPty = (
  cmd: readonly string[],
  opts: PtyOpts = {},
  onData: (chunk: string) => void = () => undefined,
): PtySession => {
  const cols = opts.cols ?? DEFAULT_PTY_COLS;
  const rows = opts.rows ?? DEFAULT_PTY_ROWS;
  // expect 脚本：stty_init 设行列 → spawn 目标命令（带 pty）→ interact 全双工桥。
  const inner = cmd.map((a) => `'${a.replace(/'/g, `'\\''`)}'`).join(' ');
  const script = `set stty_init "rows ${rows} cols ${cols}"\nspawn sh -c {exec ${inner}}\ninteract`;
  const child: ChildProcess = spawn('/usr/bin/expect', ['-c', script], {
    // 继承完整环境，TERM 必须是能力完整的终端（tmux attach 依赖 clear 等能力）。
    // PATH 不能丢——但它如今真正养的是会话内 login shell 与 claude 自举
    // （node 等仍按 PATH 找）：内层 tmux 二进制已默认走 TMUX_BIN 解析
    // （2026-10-08 GUI 残缺 PATH 兜底，残缺 PATH 不再断在引擎这一层）。
    env: { ...process.env, TERM: 'xterm-256color', ...(opts.env ?? {}) },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  child.stdout?.setEncoding('utf8');
  child.stdout?.on('data', onData);
  child.stderr?.on('data', onData); // 终端语义：stderr 也进 pane
  const exit = new Promise<number>((resolve) => {
    child.on('exit', (code) => resolve(code ?? 0));
    child.on('error', () => resolve(-1));
  });
  return {
    write(data) {
      child.stdin?.write(data);
    },
    kill() {
      try {
        child.kill('SIGKILL'); // expect 连 pty 带内层一起走
      } catch { /* 已死 */ }
    },
    exit,
  };
};

/** attach 一个 tmux 会话，返回 PTY 会话。
 *
 * 2026-09-20 agent-a 幽灵会话事故：此处曾「不存在则先建」——任意名字的
 * 终端 attach（旧 run 的 @会话芯片、手输名）都会静默 new-session（无 cwd
 * →引擎进程 cwd），用户视角=凭空冒出陌生 Profile。创建是显式动作（与复用
 * 优先路由同裁决）：不存在 → 明确报错；要重建立走 POST /api/sessions 或
 * 引擎派发（绑定会话自带 cwd）。 */
/** attach 命令拼装（纯函数可测）：专属 socket（tmux_socket_path）必须随行——
 * 引擎 server 与 default socket 分家后，裸 `tmux attach` 会 attach 到错误的
 * server（2026-09-28 专属 socket 切换配套）。首元素必须是 tmux 二进制——
 * 0216446 曾漏掉它（sh -c exec 'attach' → not found → pty 秒退 → xterm
 * attach 全灭），2026-09-29 e2e 实证修复。二进制默认走 TMUX_BIN 解析
 * （2026-10-08 GUI 残缺 PATH 兜底：sh -c exec 同样按 PATH 找 tmux）。 */
export const tmuxAttachCommand = (
  socketPath: string | undefined,
  session: string,
  bin: string = TMUX_BIN,
): readonly string[] => [bin, ...(socketPath ? ['-S', socketPath] : []), 'attach', '-t', session];

export const attachTmuxPty = async (
  tmux: { hasSession(name: string): Promise<boolean>; readonly socketPath?: string },
  session: string,
  opts: PtyOpts = {},
  onData?: (chunk: string) => void,
): Promise<Result<PtySession, Error>> => {
  if (!(await tmux.hasSession(session))) {
    return err(new Error(`会话 ${session} 不存在——终端不代建（创建是显式动作：POST /api/sessions 或由引擎派发）`));
  }
  return ok(createPty(tmuxAttachCommand(tmux.socketPath, session), opts, onData));
};

export const ptyAvailable = (): boolean => existsSync('/usr/bin/expect');
