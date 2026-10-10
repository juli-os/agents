// tmux executor (the command surface of Go internal/runtime/tmux).
// CLI-driven: create sessions, send text (bracketed-paste guarantees large
// text lands atomically), capture panes, kill sessions. Polling state
// mirroring and keepalive belong to the desktop-side experience; the
// server-side deployment does not need them in v1.

import { execFile } from 'node:child_process';
import { accessSync, constants } from 'node:fs';
import { join } from 'node:path';
import { err, ok, toResult, type Result } from '../shared/result.ts';

/** Executability probe: accessSync X_OK — existsSync only checks existence;
 * a same-named non-executable file in a PATH dir (a data file or half-built
 * artifact) makes execvp skip it and keep searching, so a false hit merely
 * drags the failure to a runtime EACCES (2026-10-09 Review P2). */
const canExec = (p: string): boolean => {
  try {
    accessSync(p, constants.X_OK);
    return true;
  } catch {
    return false;
  }
};

/** tmux binary resolution (2026-10-08 machine-migration GUI-launch engine
 * incident): GUI child processes get a default PATH of only
 * /usr/bin:/bin:/usr/sbin:/sbin — homebrew's tmux then spawns ENOENT (warmup
 * fails across the board, dispatch fails in 2 seconds, while the service
 * itself stays healthy = the most confusing failure shape). If PATH finds
 * it, keep 'tmux' (respecting self-installed overrides); if not, fall back
 * to an absolute path at the common install locations. The second parameter
 * stays an injection point (for tests; shape remains (p:string)=>boolean);
 * the default implementation starts from the X_OK probe, meaning "exists and
 * is executable", not merely exists. */
export const resolveTmuxBin = (
  pathEnv: string | undefined = process.env['PATH'],
  exists: (p: string) => boolean = canExec,
): string => {
  if (pathEnv?.split(':').some((dir) => dir !== '' && exists(join(dir, 'tmux')))) return 'tmux';
  for (const candidate of ['/opt/homebrew/bin/tmux', '/usr/local/bin/tmux']) {
    if (exists(candidate)) return candidate;
  }
  return 'tmux'; // not at the common locations either: keep the bare name so the ENOENT stays explicit and diagnosable
};

/** Resolved once at process level: pinned at startup, no drift at runtime (tests inject by calling resolveTmuxBin directly). */
export const TMUX_BIN = resolveTmuxBin();

/** tmux subprocess environment: force-declare a UTF-8 locale (2026-10-10
 * launchd bare-env incident). In an environment with no LANG/LC_* at all,
 * tmux enters non-UTF-8 mode and literal tabs in `-F` format strings render
 * as underscores — listSessionsDetailed's tab separation breaks wholesale
 * and session names become compound strings like "name_0_cwd_cmd" (graph/DAG
 * nodes double; terminals fail to attach under the wrong name). An
 * already-declared locale is not overridden (respecting explicit config);
 * tmux only checks that the string contains "UTF-8"; C.UTF-8 works on both
 * macOS and Linux. */
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

// ---- Submit confirmation (2026-09-21 cold-start swallowed-Enter incident) --------------------------------
// sendText's "paste + Enter" can have its Enter swallowed inside Claude's
// cold-start window (SessionStart banner / ink redraw): text sits in the
// input box, ctx 0%, the Stop hook never fires — the empirically observed
// shape of a silent 10-minute hang. sendTextConfirmed polls at ~280ms after
// sending to verify "the input box has reset"; a swallowed Enter only
// re-sends Enter (never re-pastes text, guarding against a double paste),
// confirming or failing explicitly within ~4s.

/** Prompt fingerprint pair: the first 40 chars of the first/last non-empty
 * line — the anchor for input-box detection (the last line is what is
 * visible in the box; the first line is what shows in the conversation
 * history after submission). */
export const promptFingerprints = (text: string): { readonly head: string; readonly tail: string } => {
  const lines = text.split('\n').map((l) => l.trim()).filter((l) => l !== '');
  return {
    head: (lines[0] ?? '').slice(0, 40),
    tail: (lines.at(-1) ?? '').slice(0, 40),
  };
};

/** Input-box state: the tail is in the bottom input-box area (not
 * submitted); an empty ❯ line appears below the tail (submitted, box
 * reset); neither is in the pane (submitted and scrolled out of view, or
 * paste lost — the caller distinguishes via "fingerprint seen before"). */
export const inputBoxState = (pane: string, tail: string): 'cleared' | 'in-box' | 'absent' => {
  if (tail === '') return 'cleared';
  const at = pane.lastIndexOf(tail);
  if (at === -1) return 'absent';
  const below = pane.slice(at).split('\n').slice(1);
  return below.some((l) => /^\s*❯\s*$/.test(l)) ? 'cleared' : 'in-box';
};

const sleepP = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Observability surface of submit confirmation (for testers/CLI): how many
 * Enters were actually re-sent, whether a full re-paste ever happened,
 * total elapsed time. */
export interface SubmitStats {
  readonly enters: number;
  readonly repasted: boolean;
  readonly elapsedMs: number;
}

export interface TmuxClient {
  /** Socket path this client is bound to (undefined = default socket). The
   * web-terminal attach side uses it to assemble `-S` — a PTY attach is a
   * bare tmux command that does not go through this client. */
  readonly socketPath?: string;
  hasSession(name: string): Promise<boolean>;
  /** Native command surface (for deterministic probes such as pane-probe). */
  exec(args: readonly string[]): Promise<Result<string, Error>>;
  listSessions(): Promise<readonly string[]>;
  /** Batch-fetch session metadata with a single list-sessions (kills the
   * list N+1): `#{session_name}\t#{session_attached}\t#{pane_current_path}\t#{pane_current_command}`.
   * No running server (zero sessions) = a normal empty state; returns an empty array, not an error. */
  listSessionsDetailed(): Promise<Result<readonly TmuxSessionInfo[], Error>>;
  newSession(name: string, cwd?: string): Promise<Result<void, Error>>;
  /** Send text into a session. >10 chars goes through bracketed-paste +
   * Enter (atomic); short text uses send-keys directly (tmux's key-merge
   * semantics for short arguments match the Go version). No submit
   * confirmation — task dispatch uses sendTextConfirmed. */
  sendText(name: string, text: string): Promise<Result<void, Error>>;
  /** Confirmed send: after paste + Enter, poll to verify the input box has
   * reset; a swallowed Enter only re-sends Enter (no text re-send),
   * confirming or failing explicitly within ~20s (guard=submit_unconfirmed). */
  sendTextConfirmed(name: string, text: string): Promise<Result<SubmitStats, Error>>;
  /** Queued delivery (intervene/relay surface, 2026-09-23 interjection-400
   * incident): in a busy session CC queues and consumes input while the
   * input box stays put — strict submit confirmation would always time out
   * for it (observed 20127ms ≈ submitConfirmMs exhausted). Here we only
   * verify "the text reached the session": the fingerprint appearing in the
   * pane (in-box or after submission) suffices; in_box at expiry is also
   * accepted (queued, pending consumption); never appeared → re-paste once
   * and re-check; still nothing → paste_lost. */
  sendTextQueued(name: string, text: string): Promise<Result<SubmitStats & { readonly finalState: 'cleared' | 'in_box' }, Error>>;
  capturePane(name: string, lines?: number): Promise<Result<string, Error>>;
  killSession(name: string): Promise<Result<void, Error>>;
  interrupt(name: string): Promise<Result<void, Error>>;
}

export const createTmuxClient = (opts: {
  socketPath?: string;
  /** Total submit-confirmation budget (default 20s): 4s proved to yield
   * false negatives in the field — when the agent is busy, the prompt is
   * consumed only some time after enqueueing (2026-09-21 late-night user
   * report: "it had actually been submitted"). */
  submitConfirmMs?: number;
  /** Observation budget for queued delivery (default 8s): return on
   * arrival; in_box at expiry is also accepted — what we wait for here is
   * not "the submission being consumed" (that can take a whole agent turn),
   * just "arrival". */
  queuedConfirmMs?: number;
  /** Test-injected sleep (default: real sleep). */
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
      // run() already returns a Result — an earlier .then(ok) wrapped it once
      // more, making .ok always truthy: dispatch therefore skipped session
      // creation and send-keys'd straight into a nonexistent session (root
      // cause of the can't-find-pane incident). exit 0 = exists, non-0 = not.
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
        // zero sessions = the tmux server is not running (normal empty state), not an error.
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
        // bracketed-paste: paste semantics land the whole block on the input
        // line and one Enter submits it — the atomicity guarantee for large
        // prompts (aligned with the Go SendConfirmed).
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
              ? 'submit_unconfirmed: prompt reached the input box but repeated Enter top-ups went unconsumed (input box not reset) — task submission unconfirmed'
              : 'submit_lost: prompt head/tail fingerprints never appeared in the pane — likely paste loss, task submission unconfirmed',
          ));
        }
        // A swallowed Enter only re-sends Enter (Enter on an empty input box
        // is a safe no-op); fingerprint never seen = paste lost, re-paste
        // once in full (once only, guarding against chained double delivery).
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
        await sleepP(280); // give the paste render time first — an immediate capture misreads "not drawn yet" as lost
        const cap = await this.capturePane(name, 10);
        if (!cap.ok) return cap;
        const state = inputBoxState(cap.value, tail);
        if (state === 'cleared') {
          return ok({ enters, repasted, finalState: 'cleared', elapsedMs: Date.now() - started });
        }
        if (state === 'in-box') {
          seen = true;
          // swallowed-Enter fallback: Enter on an empty input box is a no-op;
          // re-sending Enter while in_box can only push submission/enqueue,
          // never duplicate the pasted text.
          if (enters < 3) {
            enters += 1;
            await this.exec(['send-keys', '-t', name, 'Enter']);
          }
        }
        if (Date.now() >= deadline) break;
        if (!seen && !repasted) {
          // fingerprint never seen = paste lost, re-paste once in full (once only, guarding against chained double delivery).
          repasted = true;
          const again = await this.sendText(name, text);
          if (!again.ok) return again;
        }
      }
      // Expired while still in-box: the queued shape of a busy session — arrival means delivery succeeded.
      if (seen) {
        return ok({ enters, repasted, finalState: 'in_box', elapsedMs: Date.now() - started });
      }
      return err(new Error('paste_lost: fingerprint never appeared in the pane — the paste never reached the session input'));
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
