// 编排器（对应 Go internal/ai/agent/orchestrator.go + commands.go + guardian.go）：
// slash 命令分流 → tool-calling 循环（hooks 前后拦截、上下文裁剪、空回复
// 唤醒重试）→ 事件流回调。函数式工厂 + 不可变快照消息历史。

import { ok, toResult, type Result } from '../shared/result.ts';
import { truncate, type JsonRecord } from '../shared/json.ts';
import type { Clock } from '../shared/clock.ts';
import type { ChatLlmPort, ChatMessage, ToolCallRequest } from '../../contracts/ports.ts';
import { makeAllTools, toolSchemas, type Tool, type Assessor } from './tools.ts';

// ---- 事件流 -----------------------------------------------------------------------

export type OrchestratorEvent =
  | { readonly type: 'text'; readonly content: string }
  | { readonly type: 'thinking'; readonly content: string }
  | { readonly type: 'tool_call'; readonly tool: string; readonly args: JsonRecord }
  | { readonly type: 'tool_result'; readonly tool: string; readonly content: string }
  | { readonly type: 'done'; readonly aborted?: boolean };

export type Emit = (e: OrchestratorEvent) => void;

// ---- hooks（前/后工具调用拦截）------------------------------------------------------

export type HookType = 'before_tool_call' | 'after_tool_call' | 'agent_start' | 'agent_stop';

export interface HookPayload {
  readonly type: HookType;
  readonly tool?: string;
  readonly args?: JsonRecord;
  readonly result?: string;
  /** before_tool_call 返回 block=true 拦截该次调用（guardian 铁腕位）。 */
  readonly block?: boolean;
  readonly blockReason?: string;
  /** after_tool_call 返回 modifiedResult 替换工具输出。 */
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
        } catch { /* hook 异常不阻断主链 */ }
      }
      return p;
    },
  };
};

// ---- slash 命令 --------------------------------------------------------------------

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
      emit({ type: 'text', content: res.ok ? `会话 ${name} 已创建` : `创建失败: ${res.error.message}` });
    },
  });
  registry.register({
    name: 'switch', usage: '/switch <name>', description: 'Switch the active agent session',
    async run(args, emit) {
      emit({ type: 'text', content: args[0] ? `已切换到 ${args[0]}` : 'usage: /switch <name>' });
    },
  });
  registry.register({
    name: 'list', usage: '/list', description: 'List live sessions',
    async run(_args, emit) {
      const sessions = (await deps.listSessions?.()) ?? [];
      emit({ type: 'text', content: sessions.length > 0 ? sessions.join('\n') : '(无活动会话)' });
    },
  });
  registry.register({
    name: 'help', usage: '/help', description: 'Show commands',
    async run(_args, emit) { emit({ type: 'text', content: registry.help() }); },
  });
};

// ---- 守护者评估器（guardian.go）------------------------------------------------------

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
        { role: 'user', content: `会话: ${sessionName}\n\n最近的输出:\n${truncate(output, 3000)}` },
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

// ---- 编排器 --------------------------------------------------------------------------

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
  /** 用量入账（每次 LLM 调用一条）。 */
  readonly usage?: (r: { model: string; inputTokens?: number; outputTokens?: number; note: string }) => void;
  /** 技能注册表：/skill 激活，下一轮输入注入（单次语义）。 */
  readonly skills?: import('./skills.ts').SkillRegistry;
}

export interface Orchestrator {
  /** 处理一条用户输入：slash 命令分流或完整 tool-calling 循环。 */
  handle(input: string, emit: Emit): Promise<void>;
  readonly messages: readonly ChatMessage[];
  reset(): void;
  readonly commands: CommandRegistry;
  readonly hooks: HookManager;
}

const EMPTY_AFTER_TOOLS_NUDGE =
  '请根据上面的工具调用结果，用简短的自然语言回答我之前的问题。不要再次调用工具，直接给出总结。';

export const createOrchestrator = (deps: OrchestratorDeps): Orchestrator => {
  let messages: ChatMessage[] = [];
  const hooks = deps.hooks ?? createHookManager();
  const commands = deps.commands ?? createCommandRegistry();
  const maxContext = deps.maxContextMessages ?? 40;
  const log = deps.log ?? (() => undefined);

  const append = (m: ChatMessage): void => {
    messages = [...messages, m];
    // 上下文裁剪：保住最近 maxContext 条（Go 的 maxContextMessages）。
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
    // 激活态技能：注入到本轮输入前面（单次语义）。
    const skill = deps.skills?.takeActive() ?? null;
    const finalInput = skill !== null ? `${skill.prompt}\n\n【本轮请求】${input}` : input;
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
        // GLM 类模型在工具后一轮可能只回空内容——推一把让它总结（只推一次）。
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
    emit({ type: 'text', content: '工具调用轮数达到上限，已中止。' });
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

/** 注册技能类 slash 命令（/skills 列表、/skill <name> [args] 激活）。 */
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
        ? '（无已加载技能——把 .md 放进 skills 目录）'
        : skills.all.map((s) => `${s.name} — ${s.description}`).join('\n') });
    },
  });
  registry.register({
    name: 'skill', usage: '/skill <name> [args...]', description: 'Activate a skill for the next message',
    async run(args, emit) {
      const name = args[0] ?? '';
      if (name === '') return void emit({ type: 'text', content: 'usage: /skill <name> [args...]' });
      const res = skills.activate(name, args.slice(1));
      emit({ type: 'text', content: res.ok ? `技能 ${name} 已激活（对下一条消息生效）` : res.error.message });
    },
  });
  void emitText;
};

export { makeAllTools, type Assessment };
