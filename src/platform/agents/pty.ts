// PTY sessions (counterpart of the Go creack/pty surface). Zero
// native-dependency implementation: /usr/bin/expect allocates the
// pseudo-terminal (stty_init natively sets rows/cols; interact bridges the
// byte stream both ways).
// Limitation: no live resize (takes effect on reconnect) — the xterm front
// end renders at fixed rows/cols.
// (node-pty fails at posix_spawnp on this machine, hence expect; macOS ships it.)

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
  // expect script: stty_init sets rows/cols → spawn the target command (with a pty) → interact bridges full duplex.
  const inner = cmd.map((a) => `'${a.replace(/'/g, `'\\''`)}'`).join(' ');
  const script = `set stty_init "rows ${rows} cols ${cols}"\nspawn sh -c {exec ${inner}}\ninteract`;
  const child: ChildProcess = spawn('/usr/bin/expect', ['-c', script], {
    // Inherit the full environment; TERM must be a fully capable terminal
    // (tmux attach relies on capabilities such as clear).
    // PATH must not be lost — but what it really feeds these days is the
    // in-session login shell and the claude bootstrap (node etc. are still
    // found via PATH): the inner tmux binary is resolved via TMUX_BIN by
    // default (2026-10-08 fallback for broken GUI PATHs; a broken PATH no
    // longer breaks things at the engine layer).
    env: { ...process.env, TERM: 'xterm-256color', ...(opts.env ?? {}) },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  child.stdout?.setEncoding('utf8');
  child.stdout?.on('data', onData);
  child.stderr?.on('data', onData); // terminal semantics: stderr also goes to the pane
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
        child.kill('SIGKILL'); // expect takes the pty and the inner process down with it
      } catch { /* already dead */ }
    },
    exit,
  };
};

/** Attach to a tmux session, returning a PTY session.
 *
 * 2026-09-20 agent-a phantom-session incident: this used to be "create if
 * missing" — attaching a terminal with any name (the old run's @session chip,
 * hand-typed names) would silently new-session (no cwd → the engine process's
 * cwd), which from the user's perspective conjured an unfamiliar Profile out
 * of nowhere. Creation is an explicit act (same ruling as the reuse-first
 * routing): missing → explicit error; to recreate, go through POST
 * /api/sessions or engine dispatch (dispatched sessions carry their own
 * cwd). */
/** Attach-command assembly (pure function, testable): the dedicated socket
 * (tmux_socket_path) must come along — after the engine server split from the
 * default socket, a bare `tmux attach` attaches to the wrong server (part of
 * the 2026-09-28 dedicated-socket switch). The first element must be the tmux
 * binary — 0216446 once omitted it (sh -c exec 'attach' → not found → the
 * pty dies instantly → every xterm attach dies), fixed and verified in e2e on
 * 2026-09-29. The binary is resolved via TMUX_BIN by default (2026-10-08
 * fallback for broken GUI PATHs: sh -c exec likewise finds tmux via PATH). */
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
    return err(new Error(`Session ${session} does not exist — the terminal does not create it implicitly (creation is an explicit act: POST /api/sessions or engine dispatch)`));
  }
  return ok(createPty(tmuxAttachCommand(tmux.socketPath, session), opts, onData));
};

export const ptyAvailable = (): boolean => existsSync('/usr/bin/expect');
