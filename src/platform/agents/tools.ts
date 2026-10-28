// 工具注册表（对应 Go internal/ai/agent/tools）：Tool/Param 结构 + 18 个
// 工具。每个工厂只依赖自己需要的端口（tmux/通知器/评估器/fs/状态文件），
// execute 统一返回 Result—— orchestrator 的循环与供应商协议解耦。

import { execFile } from 'node:child_process';
import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { join, resolve as resolvePath } from 'node:path';
import { ok, err, toResult, type Result } from '../shared/result.ts';
import type { ToolSchema } from '../../contracts/ports.ts';
import type { TmuxClient } from './tmux.ts';
import { probePane } from './pane_probe.ts';

// ---- 派发安全策略（对应 Go blockedPatterns，逐条移植）---------------------------

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

/** 派发内容安全策略：命中即拒绝（策略在发送前，而非发送后补救）。 */
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

/** agent 通知器（Stop/Start 事件，版本化等待——wait_until_idle 的根）。 */
export interface NotifierPort {
  snapshot(session: string): number;
  lastStatus(session: string): string;
  working(session: string): boolean;
  /** 等待比 after 更新的通知；返回取消函数。 */
  waitAfter(session: string, after: number): Promise<void> & { cancel(): void };
}

export interface Assessment {
  readonly decision: 'approve' | 'reject' | 'idle' | 'unknown';
  readonly reason: string;
}

/** 守护者评估器（guardian.go 的 tools.Assessor 对应物）。 */
export interface Assessor {
  assess(session: string, output: string): Promise<Result<Assessment, Error>>;
}

export interface SessionHealer {
  /** agent 死亡的会话从快照自愈重启；返回是否成功。 */
  healSession(session: string): Promise<boolean>;
}

export interface ToolsDeps {
  readonly tmux: TmuxClient | null;
  readonly notifier: NotifierPort | null;
  readonly assessor: Assessor | null;
  /** 裸 shell 自愈（快照恢复）；send-time 门使用。 */
  readonly healer?: SessionHealer;
  /** 文件工具的工作区根（绝对路径外拒）。 */
  readonly cwd: string;
  readonly statePath?: string;
  readonly log?: (m: string) => void;
  readonly onSwitch?: (session: string) => void;
}

const str = (args: Record<string, unknown>, k: string): string => {
  const v = args[k];
  return typeof v === 'string' ? v : '';
};
const num = (args: Record<string, unknown>, k: string, fallback: number): number => {
  const v = args[k];
  return typeof v === 'number' ? v : fallback;
};

const tool = (
  name: string, description: string,
  parameters: readonly ToolParam[],
  execute: (args: Record<string, unknown>) => Promise<Result<string, Error>>,
): Tool => ({ name, description, parameters, execute });

/** JSON Schema 视图（供应商协议用）。 */
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

// ---- tmux 会话类工具 -------------------------------------------------------------

const requireTmux = (deps: ToolsDeps): Result<TmuxClient, Error> =>
  deps.tmux ? ok(deps.tmux) : { ok: false, error: new Error('tmux not available') };

const sessionTools = (deps: ToolsDeps): readonly Tool[] => [
  tool('list_sessions', 'List live tmux agent sessions with their working/idle state.', [], async () => {
    const r = requireTmux(deps);
    if (!r.ok) return r;
    return ok(JSON.stringify(await r.value.listSessions()));
  }),
  tool('create_session', 'Create a new detached tmux session for an agent.', [
    { name: 'name', type: 'string', description: 'Session name', required: true },
    { name: 'cwd', type: 'string', description: 'Working directory (optional)', required: false },
  ], async (a) => {
    const r = requireTmux(deps);
    if (!r.ok) return r;
    return (await r.value.newSession(str(a, 'name'), str(a, 'cwd') || undefined)).ok
      ? ok(`session ${str(a, 'name')} created`)
      : err(new Error('create failed'));
  }),
  tool('agent_alive', 'Check whether an agent session still exists.', [
    { name: 'name', type: 'string', description: 'Session name', required: true },
  ], async (a) => {
    const r = requireTmux(deps);
    if (!r.ok) return r;
    return ok(JSON.stringify({ alive: await r.value.hasSession(str(a, 'name')) }));
  }),
  tool('send_to_session', 'Send a command or message to a tmux session. Only works when a coding agent is alive; a bare shell is auto-recovered from the snapshot first. Destructive shell commands are blocked. Follow with wait_until_idle to handle any confirmation prompts.', [
    { name: 'name', type: 'string', description: 'Session name', required: true },
    { name: 'message', type: 'string', description: 'Text to send to the session', required: true },
  ], async (a) => {
    const r = requireTmux(deps);
    if (!r.ok) return r;
    const name = str(a, 'name');
    const message = str(a, 'message');
    // 门 0：内容安全策略。
    const blocked = isBlockedCommand(message);
    if (blocked !== null) {
      return err(new Error(`command blocked by safety policy: matched pattern "${blocked}"`));
    }
    if (!(await r.value.hasSession(name))) {
      return err(new Error(`session ${name} not found`));
    }
    // 门 1：pane 交互状态。选择菜单绝不盲发——守护者评估后才能动。
    let probe = await probePane(r.value, name);
    if (probe.liveSelection) {
      if (!deps.assessor) {
        return err(new Error('selection menu visible — guardian assessor not configured, send refused'));
      }
      const cap = await r.value.capturePane(name, 30);
      if (!cap.ok) return cap;
      const verdict = await deps.assessor.assess(name, cap.value);
      if (!verdict.ok) return verdict;
      if (verdict.value.decision === 'reject') {
        return err(new Error(`guardian rejected: ${verdict.value.reason}`));
      }
      if (verdict.value.decision === 'approve') {
        // 确认后清菜单：回一个「1」，再继续原消息。
        await r.value.sendText(name, '1');
        await new Promise((res2) => setTimeout(res2, 800));
        probe = await probePane(r.value, name); // 面板被动过：重探后再过门 2
      } else {
        return err(new Error(`guardian undecided (${verdict.value.reason}) — send refused`));
      }
    }
    // 门 2：裸 shell → 快照自愈重启 agent。
    if (probe.foregroundIsShell) {
      if (!deps.healer) {
        return err(new Error(`bare shell, no coding agent running (${name})`));
      }
      if (!(await deps.healer.healSession(name))) {
        return err(new Error(`auto-recover session "${name}" failed`));
      }
    }
    return (await r.value.sendText(name, message)).ok
      ? ok('sent')
      : err(new Error('send failed'));
  }),
  tool('read_session_output', 'Read output from a tmux session with paging support (lines/offset).', [
    { name: 'name', type: 'string', description: 'Session name', required: true },
    { name: 'lines', type: 'number', description: 'Lines to read per page (default 200)', required: false },
    { name: 'offset', type: 'number', description: 'Skip this many lines from the end (default 0)', required: false },
  ], async (a) => {
    const r = requireTmux(deps);
    if (!r.ok) return r;
    const res = await r.value.capturePane(str(a, 'name'), 5000);
    if (!res.ok) return res;
    const lines = res.value.split('\n');
    const total = lines.length;
    // 越界/负值 offset、负值 lines 归位：返回空页，而不是错位索引从数组尾错读。
    const skip = Math.max(0, Math.min(num(a, 'offset', 0), total));
    const take = Math.max(0, num(a, 'lines', 200));
    const page = lines.slice(Math.max(0, total - skip - take), total - skip);
    return ok(JSON.stringify({ lines: page.join('\n'), total_lines: total, has_more: total - skip > take }));
  }),
  tool('read_structured_output', "Read the session's last structured JSON output block.", [
    { name: 'name', type: 'string', description: 'Session name', required: true },
  ], async (a) => {
    const r = requireTmux(deps);
    if (!r.ok) return r;
    const res = await r.value.capturePane(str(a, 'name'), 3000);
    if (!res.ok) return res;
    const m = /```json\n([\s\S]*?)```/.exec(res.value) ?? /\{[\s\S]*\}/.exec(res.value);
    return m ? ok(m[1] ?? m[0]) : err(new Error('no structured output found'));
  }),
  tool('relay_message', 'Relay a message from one agent session to another (read source output first, then send a condensed brief).', [
    { name: 'from', type: 'string', description: 'Source session', required: true },
    { name: 'to', type: 'string', description: 'Target session', required: true },
    { name: 'brief', type: 'string', description: 'Condensed message to relay', required: true },
  ], async (a) => {
    const r = requireTmux(deps);
    if (!r.ok) return r;
    return (await r.value.sendText(str(a, 'to'), `[来自 ${str(a, 'from')} 的消息] ${str(a, 'brief')}`)).ok
      ? ok('relayed')
      : err(new Error('relay failed'));
  }),
  tool('wait_until_idle', 'Wait for a session agent to finish, then return its output. Combines waiting and reading.', [
    { name: 'session_name', type: 'string', description: 'Session name to poll', required: true },
    { name: 'timeout_seconds', type: 'number', description: 'Max wait time in seconds (default 300)', required: false },
  ], async (a) => {
    const r = requireTmux(deps);
    if (!r.ok) return r;
    const session = str(a, 'session_name');
    const timeoutMs = num(a, 'timeout_seconds', 300) * 1000;
    const notifier = deps.notifier;
    if (notifier) {
      const after = notifier.snapshot(session);
      const wait = notifier.waitAfter(session, after);
      let timerId: ReturnType<typeof setTimeout> | undefined;
      const timer = new Promise<'timeout'>((res) => { timerId = setTimeout(() => res('timeout'), timeoutMs); });
      const result = await Promise.race([wait.then(() => 'idle' as const), timer]);
      wait.cancel();
      clearTimeout(timerId); // wait 先到也撤定时器：ref 计时器会挂住进程关闭最长 timeoutMs
      if (result === 'timeout') return err(new Error(`wait timeout after ${timeoutMs}ms`));
    } else {
      // 无通知器（部署简化态）：等待期满后直接返回当前输出。
      await new Promise((r2) => setTimeout(r2, Math.min(timeoutMs, 5000)));
    }
    const res = await r.value.capturePane(session, 400);
    return res.ok ? ok(res.value.slice(-4000)) : res;
  }),
  tool('save_context', "Capture a session's full pane output into a context file under the workspace.", [
    { name: 'name', type: 'string', description: 'Session name', required: true },
    { name: 'file', type: 'string', description: 'Context file name (under .contexts/)', required: true },
  ], async (a) => {
    const r = requireTmux(deps);
    if (!r.ok) return r;
    const cap = await r.value.capturePane(str(a, 'name'), 5000);
    if (!cap.ok) return cap;
    const dir = join(deps.cwd, '.contexts');
    // file 名来自 LLM：围栏以 .contexts 为根，'../' 逃逸直接拒绝。
    const abs = withinCwd(dir, str(a, 'file'));
    if (!abs) return err(new Error('path escapes workspace'));
    return toResult(mkdir(dir, { recursive: true }).then(() => writeFile(abs, cap.value, 'utf8')).then(() =>
      `saved ${cap.value.length} chars to .contexts/${str(a, 'file')}`), 'save failed');
  }),
  tool('restore_context', 'Send a saved context file back into a session (summary briefing).', [
    { name: 'name', type: 'string', description: 'Session name', required: true },
    { name: 'file', type: 'string', description: 'Context file name (under .contexts/)', required: true },
  ], async (a) => {
    const r = requireTmux(deps);
    if (!r.ok) return r;
    const abs = withinCwd(join(deps.cwd, '.contexts'), str(a, 'file'));
    if (!abs) return err(new Error('path escapes workspace'));
    const res = await toResult(readFile(abs, 'utf8'), 'context file not found');
    if (!res.ok) return res;
    const brief = `以下是此前会话的上下文存档，请据此继续：\n\n${res.value.slice(-6000)}`;
    return (await r.value.sendText(str(a, 'name'), brief)).ok
      ? ok('context restored')
      : err(new Error('restore failed'));
  }),
  tool('switch_session', 'Mark a session as the active working target for this orchestrator.', [
    { name: 'name', type: 'string', description: 'Session name', required: true },
  ], async (a) => {
    const r = requireTmux(deps);
    if (!r.ok) return r;
    const name = str(a, 'name');
    if (!(await r.value.hasSession(name))) return err(new Error(`session ${name} not found`));
    deps.onSwitch?.(name);
    return ok(`switched to ${name}`);
  }),
];

// ---- 守护者 / 确认类工具 -----------------------------------------------------------

const confirmationTools = (deps: ToolsDeps): readonly Tool[] => [
  tool('probe_pane', 'Probe a tmux pane for its interactive state (agent alive? trust dialog? selection menu? ready for a task?). Deterministic, no LLM.', [
    { name: 'name', type: 'string', description: 'Session name', required: true },
  ], async (a) => {
    const r = requireTmux(deps);
    if (!r.ok) return r;
    const probe = await probePane(r.value, str(a, 'name'));
    return ok(JSON.stringify(probe));
  }),
  tool('assess_confirmation', 'Have the guardian evaluate a session for a pending confirmation prompt (approve/reject/idle/unknown).', [
    { name: 'session_name', type: 'string', description: 'Session name', required: true },
  ], async (a) => {
    if (!deps.assessor) return err(new Error('guardian assessor not configured'));
    const r = requireTmux(deps);
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
    const r = requireTmux(deps);
    if (!r.ok) return r;
    return (await r.value.sendText(str(a, 'name'), str(a, 'response'))).ok
      ? ok('response sent')
      : err(new Error('send failed'));
  }),
];

// ---- 文件 / 状态类工具 -------------------------------------------------------------

const withinCwd = (cwd: string, p: string): string | null => {
  const abs = resolvePath(cwd, p);
  const root = resolvePath(cwd);
  // 分隔符感知：裸 startsWith 会把 /w/x-secret 当 /w/x 的子路径放行。
  return abs === root || abs.startsWith(root + '/') ? abs : null; // 越出工作区拒绝
};

const fileTools = (deps: ToolsDeps): readonly Tool[] => [
  tool('read_file', 'Read a text file inside the workspace.', [
    { name: 'path', type: 'string', description: 'Relative path', required: true },
  ], async (a) => {
    const abs = withinCwd(deps.cwd, str(a, 'path'));
    if (!abs) return err(new Error('path escapes workspace'));
    return toResult(readFile(abs, 'utf8'), 'read failed');
  }),
  tool('write_file', 'Write a text file inside the workspace (parent dirs auto-created).', [
    { name: 'path', type: 'string', description: 'Relative path', required: true },
    { name: 'content', type: 'string', description: 'File content', required: true },
  ], async (a) => {
    const abs = withinCwd(deps.cwd, str(a, 'path'));
    if (!abs) return err(new Error('path escapes workspace'));
    return toResult(mkdir(abs.replace(/[/\\][^/\\]*$/, ''), { recursive: true }).then(() =>
      writeFile(abs, str(a, 'content'), 'utf8')).then(() =>
      `wrote ${str(a, 'path')}`), 'write failed');
  }),
  tool('list_directory', 'List a directory inside the workspace.', [
    { name: 'path', type: 'string', description: 'Relative path (default .)', required: false },
  ], async (a) => {
    const abs = withinCwd(deps.cwd, str(a, 'path') || '.');
    if (!abs) return err(new Error('path escapes workspace'));
    return toResult(readdir(abs).then((names) => names.join('\n')), 'list failed');
  }),
  tool('run_command', 'Run a short read-only command inside the workspace (git status, ls ...).', [
    { name: 'command', type: 'string', description: 'Command with args (no shell)', required: true },
  ], async (a) => {
    // 门 0 同款内容策略：此工具直接起子进程，不拦即等于安全围栏另有侧门。
    const blocked = isBlockedCommand(str(a, 'command'));
    if (blocked !== null) {
      return err(new Error(`command blocked by safety policy: matched pattern "${blocked}"`));
    }
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
      return toResult(writeFile(deps.statePath ?? join(deps.cwd, 'state.json'), JSON.stringify(st, null, 2), 'utf8').then(() =>
        `set ${str(a, 'key')}`), 'state write failed');
    }),
    tool('get_state', 'Read a persisted state value (empty string when unset).', [
      { name: 'key', type: 'string', description: 'State key', required: true },
    ], async (a) => {
      const st = await readState();
      return ok(st[str(a, 'key')] ?? '');
    }),
  ];
};

// ---- 组装（对齐 Go tools.AllTools 的清单）------------------------------------------

export const makeAllTools = (deps: ToolsDeps): readonly Tool[] => [
  ...sessionTools(deps),
  ...confirmationTools(deps),
  ...fileTools(deps),
  ...stateTools(deps),
];
