// Readiness dispatch (per pane_probe's "what counts as ready" contract): a
// task is fired only after the agent is ready. A bare shell gets the agent
// booted automatically and waits for the REPL; the trust dialog is safely
// accepted (the default highlight is No, exit — Down+Enter); numbered
// selection menus (permission/model/deploy confirmation) are approved via
// Enter on the default highlighted item — user ruling of 2026-09-21: the
// review surface is the juli gate; once a task has passed the gate, claude's
// interaction layer does not review it a second time.
//
// Fix for the 2026-09-12 incident: dispatch previously only ran new-session
// (bare bash) on a new session before send-keys — the task text landed in
// the shell prompt, or was even executed as a command wholesale; a missing
// session made send-keys fail outright with can't find session. Ensure the
// agent is in place before dispatching; failures go explicitly into the op
// output instead of producing silent zombies.

import { realpathSync } from 'node:fs';
import type { TmuxClient } from './tmux.ts';
import { probePane } from './pane_probe.ts';
import { err, ok, type Result } from '../shared/result.ts';
import { decideContextAction } from './contextGate.ts';

export interface ProvisioningOpts {
  readonly tmux: TmuxClient;
  /** CC context gate (wf_a79a6fcbf7ef): clear on work-order switch /
   * compact at threshold — executed before the task message is dispatched.
   * Disabled by default (undefined = no gate, behavior unchanged). */
  readonly contextGate?: {
    readonly workflowFor: (session: string) => Promise<string>;
    readonly contextTokensFor: (session: string) => Promise<number>;
    readonly threshold?: number;
  };
  readonly log?: (m: string) => void;
  /** Command that boots the agent in a bare shell (the claude CLI). */
  readonly bootCommand?: string;
  /** Session-aware boot command (2026-09-28 model tiering): takes precedence
   * over bootCommand — sessions flagged high cold-start with `--model
   * <high-tier id>`, the rest as usual. Defaults to falling back to
   * bootCommand/'claude'. Sessions that are already ready are unaffected
   * (the model tier is only set at boot). */
  readonly bootFor?: (session: string) => string;
  /** Upper bound for waiting on readiness (ms); refuse to dispatch past it. */
  readonly waitReadyMs?: number;
  readonly pollMs?: number;
  readonly sleep?: (ms: number) => Promise<void>;
  /** Self-built cwd for bound sessions (dedicated-agent isolation: the
   * session must start in the designated directory to see project-level
   * skills); a miss returns undefined and the default cwd applies. */
  readonly cwdFor?: (session: string) => string | undefined;
}

const defaultSleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Directory equality comparison (for bound-session reuse validation):
 * macOS tmux reports /tmp as /private/tmp, so realpath each side first
 * (falling back to the original with trailing slashes stripped when it does
 * not exist), eliminating symlink and trailing-slash differences. */
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
  // CC context gate (wf_a79a6fcbf7ef): execute clear/compact per the decision
  // before the task message goes out. State lives in an in-memory Map (a
  // restart only loses it enough to send one extra clear — idempotent and
  // harmless); the decision pure function is in contextGate.ts
  // (unit-testable). After the slash command is sent, wait for the REPL to
  // become ready again (compact polling cap 120s); on failure degrade to
  // sending the task directly (context management never blocks dispatch).
  const gate = opts.contextGate;
  const gateState = new Map<string, { wf: string; lastInputTokens: number; compactAt?: number }>();
  const runGate = async (session: string): Promise<void> => {
    if (!gate) return;
    try {
      const curWf = await gate.workflowFor(session);
      const lastTokens = await gate.contextTokensFor(session);
      const prev = gateState.get(session);
      const action = decideContextAction(prev, curWf, lastTokens, gate.threshold, Date.now());
      // compactAt is refreshed only when compact actually runs — an idle
      // tick inside the cooldown window must not reset the cooldown; after
      // clear the old compactAt is kept, which happens to suppress the false
      // compact of "stale bloated value from ingestion lag + new work order".
      gateState.set(session, {
        wf: curWf, lastInputTokens: lastTokens,
        compactAt: action === 'compact' ? Date.now() : prev?.compactAt,
      });
      if (action === null) return;
      opts.log?.(`contextGate ${session}: ${action} (work-order switch=${prev?.wf ?? '∅'}→${curWf || '∅'} · lastIn=${lastTokens})`);
      const slash = action === 'clear' ? '/clear' : '/compact';
      const sent = await opts.tmux.sendTextConfirmed(session, slash);
      if (!sent.ok) { opts.log?.(`contextGate ${session}: ${slash} send failed (degrading to sending the task directly)`); return; }
      // Wait for the REPL to become ready again (/compact can take a while; /clear is fast).
      const deadline = Date.now() + 120_000;
      for (;;) {
        await sleep(1_500);
        const p = await probePane(opts.tmux, session);
        if (p.ready) return;
        if (Date.now() > deadline) {
          opts.log?.(`contextGate ${session}: not ready 120s after ${slash} (proceeding to send directly, task not blocked)`);
          return;
        }
      }
    } catch (e) {
      opts.log?.(`contextGate ${session}: decision error (${String(e).slice(0, 80)}) — skipping`);
    }
  };
  const boot = opts.bootCommand ?? 'claude';
  // Cold-start headroom: a new session = create session + claude startup
  // (incl. trust dialog/init), which can exceed 90s in the field — a 240s
  // cap; better to wait long than to kill by mistake.
  const waitMs = opts.waitReadyMs ?? 240_000;
  const pollMs = opts.pollMs ?? 2000;
  const sleep = opts.sleep ?? defaultSleep;

  return async (_source: string, session: string, text: string): Promise<Result<void, Error>> => {
    const wantCwd = opts.cwdFor?.(session);
    if (await opts.tmux.hasSession(session)) {
      // Bound-session reuse validation (2026-09-20 P2 pre-created-bypass
      // fallback): before reusing a bound session with a configured cwd,
      // compare the existing path — a pre-created session of the same name
      // (any directory, project-level skills absent) is no longer silently
      // reused; an explicit failed is recorded.
      if (wantCwd !== undefined) {
        const det = await opts.tmux.listSessionsDetailed();
        const cur = det.ok ? det.value.find((s) => s.name === session) : undefined;
        if (cur !== undefined && !sameDir(cur.path, wantCwd)) {
          return err(new Error(
            `Session ${session} is a bound session, but its current directory (${cur.path}) does not match the configured cwd (${wantCwd}) — dispatch refused; verify the session's origin, or delete it and let the engine rebuild it`,
          ));
        }
      }
    } else {
      const created = await opts.tmux.newSession(session, wantCwd);
      if (!created.ok) return created;
      opts.log?.(`dispatch ${session}: session missing, created${wantCwd !== undefined ? ` (cwd=${wantCwd})` : ''}`);
    }
    const t0 = Date.now();
    let trustAccepted = false;
    let bootedHere = false;
    let probe = await probePane(opts.tmux, session);
    if (probe.foregroundIsShell) {
      const cmd = opts.bootFor?.(session) ?? boot;
      opts.log?.(`dispatch ${session}: bare shell — booting ${cmd}`);
      bootedHere = true;
      const booted = await opts.tmux.sendText(session, cmd);
      if (!booted.ok) return booted;
    }
    for (;;) {
      probe = await probePane(opts.tmux, session);
      if (probe.ready) break;
      if (probe.trustDialog) {
        // The CC trust dialog's default highlight is "No, exit" — a bare
        // Enter exits the agent (2026-09-12 run-3 incident: Enter picked No
        // and claude exited back to the shell). The correct accept = Down to
        // move the cursor onto "Yes, I trust this folder", then Enter.
        if (!trustAccepted) {
          trustAccepted = true; // accept only once per waiting cycle, guarding against double presses
          opts.log?.(`dispatch ${session}: trust dialog — accepting via Down+Enter`);
          const down = await opts.tmux.exec(['send-keys', '-t', session, 'Down']);
          if (!down.ok) return down;
          const acc = await opts.tmux.sendText(session, '');
          if (!acc.ok) return acc;
        } else {
          await sleep(pollMs); // already accepted, still rendering; wait for the next probe round
        }
      } else if (probe.liveSelection) {
        // Selection menu (permission/model/deploy confirmation/inquiry) →
        // approve via Enter on the default highlighted item (user ruling of
        // 2026-09-21: the review surface is the juli gate; once a task has
        // passed the gate, claude's interaction layer does not review it a
        // second time; the trust dialog's destructive default goes through
        // the Down+Enter branch above). At most one key per round; if the
        // menu persists, wait for the next probe round, with waitMs as the
        // backstop.
        opts.log?.(`dispatch ${session}: selection menu — approving via Enter on the default item (already reviewed by the juli gate)`);
        const acc = await opts.tmux.sendText(session, '');
        if (!acc.ok) return acc;
        await sleep(pollMs);
      }
      if (Date.now() - t0 > waitMs) {
        return err(new Error(
          `Agent in session ${session} not ready within ${waitMs}ms (${probe.reason}) — dispatch aborted, task not sent`,
        ));
      }
      await sleep(pollMs);
    }
    // Cold-start stagger (2026-09-21 wf_3a435bf00a54 incident): for a claude
    // booted by this dispatch itself, ink redraws during the SessionStart
    // banner swallow sendText's Enter — the ready check cannot tell
    // "booting" from "idle", so we always stagger 1.5s before firing; the
    // confirmation layer (sendTextConfirmed) catches the remaining races.
    if (bootedHere) await sleep(1_500);
    await runGate(session);
    const r = await opts.tmux.sendTextConfirmed(session, text);
    return r.ok ? ok(undefined) : r;
  };
};

// Semantics exit for tests and callers to reference the readiness decision.
export { probePane, ok };
