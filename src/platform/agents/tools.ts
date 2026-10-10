// Tool registry (counterpart of Go internal/ai/agent/tools): Tool/Param
// structures + 18 tools. Each factory depends only on the ports it needs
// (tmux/notifier/assessor/fs/state file); execute uniformly returns Result —
// decoupling the orchestrator loop from vendor protocols.

import { execFile } from 'node:child_process';
import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { join, resolve as resolvePath } from 'node:path';
import { ok, toResult, type Result } from '../shared/result.ts';
import type { ToolSchema } from '../../contracts/ports.ts';
import type { TmuxClient } from './tmux.ts';
import { probePane } from './pane_probe.ts';

// ---- Dispatch safety policy (counterpart of Go blockedPatterns, ported item by item) ---------------------------

const BLOCKED_PATTERNS: readonly { readonly re: RegExp; readonly label: string }[] = [
  { re: /\brm\b.*(?:(?:-[a-zA-Z]*[rf][a-zA-Z]*[rf])|(?:-[a-zA-Z]*r[a-zA-Z]*\s+-[a-zA-Z]*f)|(?:-[a-zA-Z]*f[a-zA-Z]*\s+-[a-zA-Z]*r)|(--recursive\b.*--force\b)|(--force\b.*--recursive\b))/i, label: 'rm -rf' },
  { re: /sudo\s+rm\s+/i, label: 'sudo rm' },
  { re: /mkfs\b/i, label: 'mkfs' },
  { re: /dd\s+if=.*\s+of=\/dev\//i, label: 'dd to block device' },
  { re: /chmod\s+-R\s+(777|000|a\+rwx)\s+(\/|~)/i, label: 'chmod -R 777 /' },
  { re: />\s*\/dev\/sd/i, label: 'write to block device' },
  { re: /(curl|wget)\b.*\|\s*(sh|bash)\b/i, label: 'curl/wget | sh' },
  { re: /\)\s*\{.*\|.*&/, label: 'fork bomb' },
];

/** Dispatch content safety policy: reject on match (policy before sending, not remediation after). */
export const isBlockedCommand = (message: string): string | null => {
  for (const p of BLOCKED_PATTERNS) {
    if (p.re.test(message)) return p.label;
  }
  return null;
}

export interface ToolParam {
  readonly name: string;
  readonly type: 'string' | 'number' | 'boolean';
  readonly description: string;
  readonly required: boolean;
}

export interface Tool {
  readonly name: string;
  readonly description: string;
  readonly parameters: readonly ToolParam[];
  execute(args: Record<string, unknown>): Promise<Result<string, Error>>;
}

/** Agent notifier (Stop/Start events, versioned waiting — the root of wait_until_idle). */
export interface NotifierPort {
  snapshot(session: string): number;
  lastStatus(session: string): string;
  working(session: string): boolean;
  /** Wait for a notification newer than `after`; returns a cancellable promise. */
  waitAfter(session: string, after: number): Promise<void> & { cancel(): void };
}

export interface Assessment {
  readonly decision: 'approve' | 'reject' | 'idle' | 'unknown';
  readonly reason: string;
}

/** Guardian assessor (counterpart of tools.Assessor in guardian.go). */
export interface Assessor {
  assess(session: string, output: string): Promise<Result<Assessment, Error>>;
}

export interface SessionHealer {
  /** Self-heal restart a session whose agent died, from the snapshot; returns whether it succeeded. */
  healSession(session: string): Promise<boolean>;
}

export interface ToolsDeps {
  readonly tmux: TmuxClient | null;
  readonly notifier: NotifierPort | null;
  readonly assessor: Assessor | null;
  /** Bare-shell self-heal (snapshot restore); used by the send-time gate. */
  readonly healer?: SessionHealer;
  /** Workspace root for the file tools (paths outside it are rejected). */
  readonly cwd: string;
  readonly statePath?: string;
  readonly log?: (m: string) => void;
  readonly onSwitch?: (session: string) => void;
}

const str = (args: Record<string, unknown>, k: string): string =>
  typeof args[k] === 'string' ? (args[k] as string) : '';
const num = (args: Record<string, unknown>, k: string, fallback: number): number =>
  typeof args[k] === 'number' ? (args[k] as number) : fallback;
const bool = (args: Record<string, unknown>, k: string): boolean => args[k] === true;

const tool = (
  name: string, description: string,
  parameters: readonly ToolParam[],
  execute: (args: Record<string, unknown>) => Promise<Result<string, Error>>,
): Tool => ({ name, description, parameters, execute });

/** JSON Schema view (for vendor protocols). */
export const toolSchemas = (tools: readonly Tool[]): ToolSchema[] =>
  tools.map((t) => ({
    name: t.name,
    description: t.description,
    parameters: {
      type: 'object',
      properties: Object.fromEntries(t.parameters.map((p) => [p.name, { type: p.type, description: p.description }])),
      required: t.parameters.filter((p) => p.required).map((p) => p.name),
    },
  }));

// ---- tmux session tools -----------------------------------------------------------------

const sessionTools = (deps: ToolsDeps): readonly Tool[] => {
  const tc = deps.tmux;
  const requireTmux = (): Result<TmuxClient, Error> =>
    tc ? ok(tc) : { ok: false, error: new Error('tmux not available') };
  return [
    tool('list_sessions', 'List live tmux agent sessions with their working/idle state.', [], async () => {
      const r = requireTmux();
      if (!r.ok) return r;
      return ok(JSON.stringify(await r.value.listSessions()));
    }),
    tool('create_session', 'Create a new detached tmux session for an agent.', [
      { name: 'name', type: 'string', description: 'Session name', required: true },
      { name: 'cwd', type: 'string', description: 'Working directory (optional)', required: false },
    ], async (a) => {
      const r = requireTmux();
      if (!r.ok) return r;
      return (await r.value.newSession(str(a, 'name'), str(a, 'cwd') || undefined)).ok
        ? ok(`session ${str(a, 'name')} created`)
        : toResult(Promise.reject(new Error('create failed')));
    }),
    tool('agent_alive', 'Check whether an agent session still exists.', [
      { name: 'name', type: 'string', description: 'Session name', required: true },
    ], async (a) => {
      const r = requireTmux();
      if (!r.ok) return r;
      return ok(JSON.stringify({ alive: await r.value.hasSession(str(a, 'name')) }));
    }),
    tool('send_to_session', 'Send a command or message to a tmux session. Only works when a coding agent is alive; a bare shell is auto-recovered from the snapshot first. Destructive shell commands are blocked. Follow with wait_until_idle to handle any confirmation prompts.', [
      { name: 'name', type: 'string', description: 'Session name', required: true },
      { name: 'message', type: 'string', description: 'Text to send to the session', required: true },
    ], async (a) => {
      const r = requireTmux();
      if (!r.ok) return r;
      const name = str(a, 'name');
      const message = str(a, 'message');
      // Gate 0: content safety policy.
      const blocked = isBlockedCommand(message);
      if (blocked !== null) {
        return toResult(Promise.reject(new Error(`command blocked by safety policy: matched pattern "${blocked}"`)));
      }
      if (!(await r.value.hasSession(name))) {
        return toResult(Promise.reject(new Error(`session ${name} not found`)));
      }
      // Gate 1: pane interaction state. Never send blindly into a selection
      // menu — the guardian must assess before acting.
      const probe = await probePane(r.value, name);
      if (probe.liveSelection) {
        if (!deps.assessor) {
          return toResult(Promise.reject(new Error('selection menu visible — guardian assessor not configured, send refused')));
        }
        const cap = await r.value.capturePane(name, 30);
        if (!cap.ok) return cap;
        const verdict = await deps.assessor.assess(name, cap.value);
        if (!verdict.ok) return verdict;
        if (verdict.value.decision === 'reject') {
          return toResult(Promise.reject(new Error(`guardian rejected: ${verdict.value.reason}`)));
        }
        if (verdict.value.decision === 'approve') {
          // After approval, clear the menu: reply "1", then continue with the original message.
          await r.value.sendText(name, '1');
          await new Promise((res2) => setTimeout(res2, 800));
        } else {
          return toResult(Promise.reject(new Error(`guardian undecided (${verdict.value.reason}) — send refused`)));
        }
      }
      // Gate 2: bare shell → snapshot self-heal restarts the agent.
      const fresh = await probePane(r.value, name);
      if (fresh.foregroundIsShell) {
        if (!deps.healer) {
          return toResult(Promise.reject(new Error(`bare shell, no coding agent running (${name})`)));
        }
        if (!(await deps.healer.healSession(name))) {
          return toResult(Promise.reject(new Error(`auto-recover session "${name}" failed`)));
        }
      }
      return (await r.value.sendText(name, message)).ok
        ? ok('sent')
        : toResult(Promise.reject(new Error('send failed')));
    }),
    tool('read_session_output', 'Read output from a tmux session with paging support (lines/offset).', [
      { name: 'name', type: 'string', description: 'Session name', required: true },
      { name: 'lines', type: 'number', description: 'Lines to read per page (default 200)', required: false },
      { name: 'offset', type: 'number', description: 'Skip this many lines from the end (default 0)', required: false },
    ], async (a) => {
      const r = requireTmux();
      if (!r.ok) return r;
      const res = await r.value.capturePane(str(a, 'name'), 5000);
      if (!res.ok) return res;
      const lines = res.value.split('\n');
      const total = lines.length;
      const skip = num(a, 'offset', 0);
      const take = num(a, 'lines', 200);
      const page = lines.slice(Math.max(0, total - skip - take), total - skip);
      return ok(JSON.stringify({ lines: page.join('\n'), total_lines: total, has_more: total - skip > take }));
    }),
    tool('read_structured_output', "Read the session's last structured JSON output block.", [
      { name: 'name', type: 'string', description: 'Session name', required: true },
    ], async (a) => {
      const r = requireTmux();
      if (!r.ok) return r;
      const res = await r.value.capturePane(str(a, 'name'), 3000);
      if (!res.ok) return res;
      const m = /```json\n([\s\S]*?)```/.exec(res.value) ?? /\{[\s\S]*\}/.exec(res.value);
      return m ? ok(m[1] ?? m[0]) : toResult(Promise.reject(new Error('no structured output found')));
    }),
    tool('relay_message', 'Relay a message from one agent session to another (read source output first, then send a condensed brief).', [
      { name: 'from', type: 'string', description: 'Source session', required: true },
      { name: 'to', type: 'string', description: 'Target session', required: true },
      { name: 'brief', type: 'string', description: 'Condensed message to relay', required: true },
    ], async (a) => {
      const r = requireTmux();
      if (!r.ok) return r;
      return (await r.value.sendText(str(a, 'to'), `[message from ${str(a, 'from')}] ${str(a, 'brief')}`)).ok
        ? ok('relayed')
        : toResult(Promise.reject(new Error('relay failed')));
    }),
    tool('wait_until_idle', 'Wait for a session agent to finish, then return its output. Combines waiting and reading.', [
      { name: 'session_name', type: 'string', description: 'Session name to poll', required: true },
      { name: 'timeout_seconds', type: 'number', description: 'Max wait time in seconds (default 300)', required: false },
    ], async (a) => {
      const r = requireTmux();
      if (!r.ok) return r;
      const session = str(a, 'session_name');
      const timeoutMs = num(a, 'timeout_seconds', 300) * 1000;
      const notifier = deps.notifier;
      if (notifier) {
        const after = notifier.snapshot(session);
        const wait = notifier.waitAfter(session, after);
        const timer = new Promise<'timeout'>((res) => setTimeout(() => res('timeout'), timeoutMs));
        const result = await Promise.race([wait.then(() => 'idle' as const), timer]);
        wait.cancel();
        if (result === 'timeout') return toResult(Promise.reject(new Error(`wait timeout after ${timeoutMs}ms`)));
      } else {
        // No notifier (simplified deployment): after the wait elapses, return the current output directly.
        await new Promise((r2) => setTimeout(r2, Math.min(timeoutMs, 5000)));
      }
      const res = await r.value.capturePane(session, 400);
      return res.ok ? ok(res.value.slice(-4000)) : res;
    }),
    tool('save_context', "Capture a session's full pane output into a context file under the workspace.", [
      { name: 'name', type: 'string', description: 'Session name', required: true },
      { name: 'file', type: 'string', description: 'Context file name (under .contexts/)', required: true },
    ], async (a) => {
      const r = requireTmux();
      if (!r.ok) return r;
      const cap = await r.value.capturePane(str(a, 'name'), 5000);
      if (!cap.ok) return cap;
      const dir = join(deps.cwd, '.contexts');
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, str(a, 'file')), cap.value, 'utf8');
      return ok(`saved ${cap.value.length} chars to .contexts/${str(a, 'file')}`);
    }),
    tool('restore_context', 'Send a saved context file back into a session (summary briefing).', [
      { name: 'name', type: 'string', description: 'Session name', required: true },
      { name: 'file', type: 'string', description: 'Context file name (under .contexts/)', required: true },
    ], async (a) => {
      const r = requireTmux();
      if (!r.ok) return r;
      const res = await toResult(readFile(join(deps.cwd, '.contexts', str(a, 'file')), 'utf8'), 'context file not found');
      if (!res.ok) return res;
      const brief = `The following is the archived context of a previous session; continue from it:\n\n${res.value.slice(-6000)}`;
      return (await r.value.sendText(str(a, 'name'), brief)).ok
        ? ok('context restored')
        : toResult(Promise.reject(new Error('restore failed')));
    }),
    tool('switch_session', 'Mark a session as the active working target for this orchestrator.', [
      { name: 'name', type: 'string', description: 'Session name', required: true },
    ], async (a) => {
      const r = requireTmux();
      if (!r.ok) return r;
      const name = str(a, 'name');
      if (!(await r.value.hasSession(name))) return toResult(Promise.reject(new Error(`session ${name} not found`)));
      deps.onSwitch?.(name);
      return ok(`switched to ${name}`);
    }),
  ];
};

// ---- Guardian / confirmation tools ---------------------------------------------------------------------------

const confirmationTools = (deps: ToolsDeps): readonly Tool[] => [
  tool('probe_pane', 'Probe a tmux pane for its interactive state (agent alive? trust dialog? selection menu? ready for a task?). Deterministic, no LLM.', [
    { name: 'name', type: 'string', description: 'Session name', required: true },
  ], async (a) => {
    const r = requireTmux2(deps);
    if (!r.ok) return r;
    const probe = await probePane(r.value, str(a, 'name'));
    return ok(JSON.stringify(probe));
  }),
  tool('assess_confirmation', 'Have the guardian evaluate a session for a pending confirmation prompt (approve/reject/idle/unknown).', [
    { name: 'session_name', type: 'string', description: 'Session name', required: true },
  ], async (a) => {
    if (!deps.assessor) return toResult(Promise.reject(new Error('guardian assessor not configured')));
    const r = requireTmux2(deps);
    if (!r.ok) return r;
    const cap = await r.value.capturePane(str(a, 'session_name'), 200);
    if (!cap.ok) return cap;
    const res = await deps.assessor.assess(str(a, 'session_name'), cap.value);
    if (!res.ok) return res;
    return ok(JSON.stringify(res.value));
  }),
  tool('respond_confirmation', 'Answer a pending confirmation prompt in a session (e.g. "1", "yes", free text).', [
    { name: 'name', type: 'string', description: 'Session name', required: true },
    { name: 'response', type: 'string', description: 'Response text to send', required: true },
  ], async (a) => {
    const r = requireTmux2(deps);
    if (!r.ok) return r;
    return (await r.value.sendText(str(a, 'name'), str(a, 'response'))).ok
      ? ok('response sent')
      : toResult(Promise.reject(new Error('send failed')));
  }),
];
const requireTmux2 = (deps: ToolsDeps): Result<TmuxClient, Error> =>
  deps.tmux ? ok(deps.tmux) : { ok: false, error: new Error('tmux not available') };

// ---- File / state tools -------------------------------------------------------------------

const withinCwd = (cwd: string, p: string): string | null => {
  const abs = resolvePath(cwd, p);
  return abs.startsWith(cwd) ? abs : null; // outside the workspace → reject
};

const fileTools = (deps: ToolsDeps): readonly Tool[] => [
  tool('read_file', 'Read a text file inside the workspace.', [
    { name: 'path', type: 'string', description: 'Relative path', required: true },
  ], async (a) => {
    const abs = withinCwd(deps.cwd, str(a, 'path'));
    if (!abs) return toResult(Promise.reject(new Error('path escapes workspace')));
    return toResult(readFile(abs, 'utf8'), 'read failed');
  }),
  tool('write_file', 'Write a text file inside the workspace (parent dirs auto-created).', [
    { name: 'path', type: 'string', description: 'Relative path', required: true },
    { name: 'content', type: 'string', description: 'File content', required: true },
  ], async (a) => {
    const abs = withinCwd(deps.cwd, str(a, 'path'));
    if (!abs) return toResult(Promise.reject(new Error('path escapes workspace')));
    await mkdir(abs.replace(/[/\\][^/\\]*$/, ''), { recursive: true });
    await writeFile(abs, str(a, 'content'), 'utf8');
    return ok(`wrote ${str(a, 'path')}`);
  }),
  tool('list_directory', 'List a directory inside the workspace.', [
    { name: 'path', type: 'string', description: 'Relative path (default .)', required: false },
  ], async (a) => {
    const abs = withinCwd(deps.cwd, str(a, 'path') || '.');
    if (!abs) return toResult(Promise.reject(new Error('path escapes workspace')));
    return toResult(readdir(abs).then((names) => names.join('\n')), 'list failed');
  }),
  tool('run_command', 'Run a short read-only command inside the workspace (git status, ls ...).', [
    { name: 'command', type: 'string', description: 'Command with args (no shell)', required: true },
  ], async (a) => {
    const parts = str(a, 'command').split(/\s+/).filter(Boolean);
    return toResult(new Promise<string>((res, rej) => {
      execFile(parts[0] ?? '', parts.slice(1), { cwd: deps.cwd, timeout: 15_000 }, (e, out) =>
        e ? rej(new Error(e.message.slice(0, 200))) : res(out));
    }), 'command failed');
  }),
];

const stateTools = (deps: ToolsDeps): readonly Tool[] => {
  const readState = async (): Promise<Record<string, string>> => {
    try {
      return JSON.parse(await readFile(deps.statePath ?? join(deps.cwd, 'state.json'), 'utf8')) as Record<string, string>;
    } catch {
      return {};
    }
  };
  return [
    tool('set_state', 'Persist a key-value pair to the state file.', [
      { name: 'key', type: 'string', description: 'State key', required: true },
      { name: 'value', type: 'string', description: 'State value', required: true },
    ], async (a) => {
      const st = await readState();
      st[str(a, 'key')] = str(a, 'value');
      await writeFile(deps.statePath ?? join(deps.cwd, 'state.json'), JSON.stringify(st, null, 2), 'utf8');
      return ok(`set ${str(a, 'key')}`);
    }),
    tool('get_state', 'Read a persisted state value (empty string when unset).', [
      { name: 'key', type: 'string', description: 'State key', required: true },
    ], async (a) => {
      const st = await readState();
      return ok(st[str(a, 'key')] ?? '');
    }),
  ];
};

// ---- Assembly (aligned with the list in Go tools.AllTools) --------------------------------------------------

export const makeAllTools = (deps: ToolsDeps): readonly Tool[] => [
  ...sessionTools(deps),
  ...confirmationTools(deps),
  ...fileTools(deps),
  ...stateTools(deps),
];
