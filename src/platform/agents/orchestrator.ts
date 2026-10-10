// Orchestrator (counterpart of Go internal/ai/agent/orchestrator.go +
// commands.go + guardian.go): slash-command routing → tool-calling loop
// (pre/post hook interception, context trimming, empty-reply nudge retry) →
// event-stream callbacks. Functional factory + immutable snapshot message
// history.

import { ok, toResult, type Result } from '../shared/result.ts';
import { truncate, type JsonRecord } from '../shared/json.ts';
import type { Clock } from '../shared/clock.ts';
import type { ChatLlmPort, ChatMessage, ToolCallRequest } from '../../contracts/ports.ts';
import { makeAllTools, toolSchemas, type Tool, type Assessor } from './tools.ts';

// ---- Event stream -----------------------------------------------------------------------

export type OrchestratorEvent =
  | { readonly type: 'text'; readonly content: string }
  | { readonly type: 'thinking'; readonly content: string }
  | { readonly type: 'tool_call'; readonly tool: string; readonly args: JsonRecord }
  | { readonly type: 'tool_result'; readonly tool: string; readonly content: string }
  | { readonly type: 'done'; readonly aborted?: boolean };

export type Emit = (e: OrchestratorEvent) => void;

// ---- hooks (pre/post tool-call interception) ------------------------------------------------

export type HookType = 'before_tool_call' | 'after_tool_call' | 'agent_start' | 'agent_stop';

export interface HookPayload {
  readonly type: HookType;
  readonly tool?: string;
  readonly args?: JsonRecord;
  readonly result?: string;
  /** before_tool_call returning block=true intercepts that call (the guardian's iron-fist position). */
  readonly block?: boolean;
  readonly blockReason?: string;
  /** after_tool_call returning modifiedResult replaces the tool output. */
  readonly modifiedResult?: string;
}

export interface HookManager {
  on(type: HookType, handler: (p: HookPayload) => Promise<HookPayload> | HookPayload): void;
  fire(p: HookPayload): Promise<HookPayload>;
}

export const createHookManager = (): HookManager => {
  const handlers = new Map<HookType, ((p: HookPayload) => Promise<HookPayload> | HookPayload)[]>();
  return {
    on(type, handler) {
      handlers.set(type, [...(handlers.get(type) ?? []), handler]);
    },
    async fire(p) {
      for (const h of handlers.get(p.type) ?? []) {
        try {
          const r = await h(p);
          if (r !== undefined) return r;
        } catch { /* a hook error does not break the main chain */ }
      }
      return p;
    },
  };
};

// ---- slash commands --------------------------------------------------------------------

export interface SlashCommand {
  readonly name: string;
  readonly usage: string;
  readonly description: string;
  readonly run: (args: readonly string[], emit: Emit) => Promise<void>;
}

export interface CommandRegistry {
  register(cmd: SlashCommand): void;
  match(input: string): SlashCommand | null;
  all(): readonly SlashCommand[];
  help(): string;
}

export const createCommandRegistry = (): CommandRegistry => {
  const commands: SlashCommand[] = [];
  return {
    register(cmd) { commands.push(cmd); },
    match(input) {
      const trimmed = input.trim();
      if (!trimmed.startsWith('/')) return null;
      const name = trimmed.slice(1).split(/\s+/)[0] ?? '';
      return commands.find((c) => c.name === name) ?? null;
    },
    all: () => commands,
    help: () => commands.map((c) => `${c.usage} — ${c.description}`).join('\n'),
  };
};

export const registerDefaultCommands = (
  registry: CommandRegistry,
  deps: { createSession?: (name: string, cwd?: string) => Promise<Result<void, Error>>; listSessions?: () => Promise<readonly string[]> },
): void => {
  registry.register({
    name: 'create', usage: '/create <name> [working-dir]', description: 'Create a new agent session',
    async run(args, emit) {
      if (!deps.createSession) return void emit({ type: 'text', content: 'session creation not available' });
      const name = args[0] ?? '';
      if (name === '') return void emit({ type: 'text', content: 'usage: /create <name> [working-dir]' });
      const res = await deps.createSession(name, args[1]);
      emit({ type: 'text', content: res.ok ? `Session ${name} created` : `Creation failed: ${res.error.message}` });
    },
  });
  registry.register({
    name: 'switch', usage: '/switch <name>', description: 'Switch the active agent session',
    async run(args, emit) {
      emit({ type: 'text', content: args[0] ? `Switched to ${args[0]}` : 'usage: /switch <name>' });
    },
  });
  registry.register({
    name: 'list', usage: '/list', description: 'List live sessions',
    async run(_args, emit) {
      const sessions = (await deps.listSessions?.()) ?? [];
      emit({ type: 'text', content: sessions.length > 0 ? sessions.join('\n') : '(no live sessions)' });
    },
  });
  registry.register({
    name: 'help', usage: '/help', description: 'Show commands',
    async run(_args, emit) { emit({ type: 'text', content: registry.help() }); },
  });
};

// ---- Guardian assessor (guardian.go) ------------------------------------------------------

export const DEFAULT_ASSESSOR_PROMPT = `You are a session guardian. You monitor a coding agent in a terminal and decide how to respond to its confirmation prompts.

Determine if the agent is WAITING for user input. Return "approve"/"reject"/"unknown".

The agent is WAITING for input when:
- The output ends with a shell prompt followed by a selection menu (1. Yes / 2. No)
- The last question is asking for user approval or a decision
- Any confirmation, permission, or choice prompt visible near the end of output
- The agent asks a direct question and the shell prompt is visible, meaning the agent is done and waiting

The agent is NOT waiting for input when:
- It is actively showing progress (e.g. "Phase 1", "Step 2/5", running commands)
- It is in the middle of generating output (no shell prompt visible)
- Tool calls are executing (showing output, not waiting for approval)

Respond with ONLY a JSON object on a single line:
- {"decision":"approve","reason":"brief reason"} — routine confirmation (tool calls, file edits, proceed prompts, questions asking for decisions)
- {"decision":"reject","reason":"brief reason"} — dangerous operation (deleting prod data, force-pushing, dropping databases, sudo)
- {"decision":"unknown","reason":"brief reason"} — cannot determine`;

export const createSessionAssessor = (
  llm: ChatLlmPort, model: string, prompt = DEFAULT_ASSESSOR_PROMPT,
): Assessor => ({
  async assess(sessionName, output) {
    const res = await llm.chat({
      model,
      maxTokens: 200,
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: `Session: ${sessionName}\n\nRecent output:\n${truncate(output, 3000)}` },
      ],
    });
    if (!res.ok) return res;
    const m = /\{[\s\S]*\}/.exec(res.value.content);
    if (!m) return { ok: false, error: new Error('assessor: no json in response') };
    try {
      const v = JSON.parse(m[0]) as { decision?: string; reason?: string };
      const decision = (['approve', 'reject', 'idle', 'unknown'] as const).includes(
        (v.decision ?? 'unknown') as Assessment['decision'],
      ) ? (v.decision as Assessment['decision']) : 'unknown';
      return ok({ decision, reason: v.reason ?? '' });
    } catch (e) {
      return { ok: false, error: new Error(`assessor: ${String(e)}`) };
    }
  },
});

import type { Assessment } from './tools.ts';

// ---- Orchestrator --------------------------------------------------------------------------

export interface OrchestratorDeps {
  readonly llm: ChatLlmPort;
  readonly model: string;
  readonly tools: readonly Tool[];
  readonly systemPrompt: string;
  readonly maxContextMessages?: number;
  readonly hooks?: HookManager;
  readonly commands?: CommandRegistry;
  readonly clock?: Clock;
  readonly callTimeoutMs?: number;
  readonly log?: (m: string) => void;
  /** Usage accounting (one entry per LLM call). */
  readonly usage?: (r: { model: string; inputTokens?: number; outputTokens?: number; note: string }) => void;
  /** Skill registry: /skill activates, injected into the next input turn (one-shot semantics). */
  readonly skills?: import('./skills.ts').SkillRegistry;
}

export interface Orchestrator {
  /** Handle one user input: slash-command routing or the full tool-calling loop. */
  handle(input: string, emit: Emit): Promise<void>;
  readonly messages: readonly ChatMessage[];
  reset(): void;
  readonly commands: CommandRegistry;
  readonly hooks: HookManager;
}

const EMPTY_AFTER_TOOLS_NUDGE =
  'Based on the tool call results above, answer my previous question in brief natural language. Do not call tools again; give the summary directly.';

export const createOrchestrator = (deps: OrchestratorDeps): Orchestrator => {
  let messages: ChatMessage[] = [];
  const hooks = deps.hooks ?? createHookManager();
  const commands = deps.commands ?? createCommandRegistry();
  const maxContext = deps.maxContextMessages ?? 40;
  const log = deps.log ?? (() => undefined);

  const append = (m: ChatMessage): void => {
    messages = [...messages, m];
    // Context trimming: keep the most recent maxContext messages (Go's maxContextMessages).
    if (messages.length > maxContext) messages = messages.slice(-maxContext);
  };

  const snapshot = (): readonly ChatMessage[] =>
    [{ role: 'system', content: deps.systemPrompt }, ...messages];

  const executeTool = async (tc: { id: string; name: string; arguments: string }): Promise<{ id: string; name: string; content: string; isError?: boolean }> => {
    const parsed = (() => {
      try {
        return JSON.parse(tc.arguments || '{}') as JsonRecord;
      } catch {
        return {};
      }
    })();
    const before = await hooks.fire({ type: 'before_tool_call', tool: tc.name, args: parsed });
    if (before.block) {
      return { id: tc.id, name: tc.name, content: before.blockReason ?? 'blocked by hook', isError: true };
    }
    const tool = deps.tools.find((t) => t.name === tc.name);
    const result = tool
      ? await tool.execute(parsed)
      : ({ ok: false, error: new Error(`unknown tool ${tc.name}`) } as Result<string, Error>);
    let content = result.ok ? result.value : `error: ${result.error.message}`;
    const after = await hooks.fire({ type: 'after_tool_call', tool: tc.name, result: content });
    if (after.modifiedResult !== undefined) content = after.modifiedResult;
    return { id: tc.id, name: tc.name, content, isError: !result.ok };
  };

  const handleLLM = async (input: string, emit: Emit): Promise<void> => {
    // Activated skill: injected ahead of this turn's input (one-shot semantics).
    const skill = deps.skills?.takeActive() ?? null;
    const finalInput = skill !== null ? `${skill.prompt}\n\n[Current request]\n${input}` : input;
    append({ role: 'user', content: finalInput });
    let hadTools = false;
    for (let turn = 0; turn < 25; turn++) {
      const req: ToolCallRequest = {
        messages: snapshot(),
        tools: toolSchemas(deps.tools),
        model: deps.model,
        maxTokens: 4096,
      };
      const res = await deps.llm.chat(req);
      deps.usage?.({ model: deps.model, note: `turn=${turn} msgs=${req.messages.length}` });
      if (!res.ok) {
        emit({ type: 'text', content: `LLM error: ${res.error.message}` });
        emit({ type: 'done' });
        return;
      }
      const result = res.value;
      if (result.thinking) emit({ type: 'thinking', content: result.thinking });
      if (result.content !== '') emit({ type: 'text', content: result.content });
      append({ role: 'assistant', content: result.content, toolCalls: result.toolCalls });

      if (result.toolCalls.length === 0) {
        // GLM-class models may return empty content on the turn after tool
        // use — nudge it into summarizing (nudge once only).
        if (hadTools && result.content === '') {
          hadTools = false;
          log('orchestrator: empty content after tool use, nudging');
          append({ role: 'user', content: EMPTY_AFTER_TOOLS_NUDGE });
          continue;
        }
        emit({ type: 'done' });
        return;
      }
      hadTools = true;
      const results: { id: string; name: string; content: string; isError?: boolean }[] = [];
      for (const tc of result.toolCalls) {
        emit({ type: 'tool_call', tool: tc.name, args: safeArgs(tc.arguments) });
        const tr = await executeTool(tc);
        results.push(tr);
        emit({ type: 'tool_result', tool: tc.name, content: tr.content });
      }
      append({ role: 'tool', content: '', toolResults: results });
    }
    emit({ type: 'text', content: 'Tool-call turn limit reached; aborted.' });
    emit({ type: 'done' });
  };

  return {
    async handle(input, emit) {
      const cmd = commands.match(input);
      if (cmd) {
        const args = input.trim().split(/\s+/).slice(1);
        await toResult(cmd.run(args, emit), 'command failed');
        emit({ type: 'done' });
        return;
      }
      await handleLLM(input, emit);
    },
    get messages() { return messages; },
    reset() { messages = []; },
    commands,
    hooks,
  };
};

const safeArgs = (s: string): JsonRecord => {
  try {
    const v = JSON.parse(s || '{}');
    return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as JsonRecord) : {};
  } catch {
    return {};
  }
};

/** Register the skill slash commands (/skills listing, /skill <name> [args] activation). */
export const registerSkillCommands = (
  registry: CommandRegistry,
  skills: import('./skills.ts').SkillRegistry | undefined,
  emitText: (msg: string) => void,
): void => {
  if (!skills) return;
  registry.register({
    name: 'skills', usage: '/skills', description: 'List available skills',
    async run(_args, emit) {
      emit({ type: 'text', content: skills.all.length === 0
        ? '(no skills loaded — put .md files into the skills directory)'
        : skills.all.map((s) => `${s.name} — ${s.description}`).join('\n') });
    },
  });
  registry.register({
    name: 'skill', usage: '/skill <name> [args...]', description: 'Activate a skill for the next message',
    async run(args, emit) {
      const name = args[0] ?? '';
      if (name === '') return void emit({ type: 'text', content: 'usage: /skill <name> [args...]' });
      const res = skills.activate(name, args.slice(1));
      emit({ type: 'text', content: res.ok ? `Skill ${name} activated (takes effect on the next message)` : res.error.message });
    },
  });
  void emitText;
};

export { makeAllTools, type Assessment };
