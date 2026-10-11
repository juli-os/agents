// 语音通话状态机（对应 Go cmd/gui/chat_voice.go）：三模式配置表（闲聊/落实/
// 查询——提示词原文保留）、```plan 块暂存、确认短语匹配（宽松确认集只在
// 已提议阶段安全）、确认后确定性派发（绕过派发门）。派发永远只走
// ConfirmPlan → 安全发送，编排器绝不自己派发。

import type { JsonRecord } from '../shared/json.ts';
import { truncate } from '../shared/json.ts';
import type { Result } from '../shared/result.ts';
import type { ChatLlmPort } from '../../contracts/ports.ts';

export type CallMode = 'chat' | 'plan' | 'query';

export const parseCallMode = (mode: string): CallMode =>
  mode === 'chat' || mode === 'plan' || mode === 'query' ? mode : 'plan';

export interface StagedPlan {
  readonly session: string;
  readonly summary: string;
  readonly brief: string;
}

// ---- 模式前缀（逐字保留——这是给语音模型的行为协议）-----------------------------

const PLAN_MODE_PREFIX = `[语音通话模式·落实] 用简洁口语回答：不用表格、代码块或 markdown 符号；可用「第一、第二」短要点；尽量短以节省语音额度。
本次通话分三阶段，你只能在前两阶段行动：
1) 讨论：澄清、细化、深化用户想法。不要调用 send_to_session / relay_message / create_session（会被拦截）。
2) 提议：当任务清晰且用户想做时，先用一句话口述计划，然后在回复【末尾】输出一个计划块，格式严格如下，输出后停下并问「要我落实吗？」：
\`\`\`plan
{"session":"<真实session名>","summary":"<一句话做什么>","brief":"<给该session的可执行指令>"}
\`\`\`
3) 派发：由系统在用户确认后自动执行，你绝不自己派发。
session 名必须先用 list_sessions 查真实结果；brief 要具体、可直接执行。确认前不得派发。

`;

const CHAT_MODE_PREFIX = '[语音通话模式·闲聊] 自然轻松地口语聊天，像朋友。不要调用任何工具，不要提议落实或派发。不用表格/代码/markdown，简短温暖，说完即答。\n\n';

const QUERY_MODE_PREFIX = '[语音通话模式·查询] 用简洁口语回答用户关于 session 或项目状态的问题。可用只读工具查真实状态：list_sessions（有哪些 session）、read_session_output / read_structured_output（某个 session 在干什么、有没有报错）。不要派发任务、不要提议落实、不要调用 send_to_session。不用表格/代码/markdown，简短。\n\n';

export interface CallModeConfig {
  readonly prefix: string;
  readonly blockAllTools: boolean;
  readonly stagePlans: boolean;
}

export const callModeConfigs: Readonly<Record<CallMode, CallModeConfig>> = {
  chat: { prefix: CHAT_MODE_PREFIX, blockAllTools: true, stagePlans: false },
  plan: { prefix: PLAN_MODE_PREFIX, blockAllTools: false, stagePlans: true },
  query: { prefix: QUERY_MODE_PREFIX, blockAllTools: false, stagePlans: false },
};

/** 通话激活时被拒绝的派发类工具（读/观察类保持放行——讨论要有据）。 */
export const VOICE_BLOCKED_TOOLS: ReadonlySet<string> = new Set([
  'send_to_session', 'relay_message', 'create_session', 'respond_confirmation',
]);

// ---- 确认短语（宽松确认集只在已提议阶段使用；歧义一律回到讨论）---------------------

const CONFIRM_KEYWORDS = ['确认', '落实', '派发', '执行吧', '发吧', '就这样', 'yes', 'confirm', 'confirmed', 'approved', 'go ahead', 'do it'];
const TERSE_AFFIRMATIVES = ['可以', '好的', '好了', '对的', '是的', '好', '对', '行', '没问题', 'ok', 'okay', 'sure'];

export const isConfirmPhrase = (s: string): boolean => {
  const t = s.toLowerCase().trim();
  for (const k of CONFIRM_KEYWORDS) {
    if (t.includes(k)) return true;
  }
  // 短肯定句：仅当整句很短时——「对」/「好的」在提议后的独立应答才算确认。
  if ([...t].length <= 6) {
    for (const k of TERSE_AFFIRMATIVES) {
      if (t.includes(k)) return true;
    }
  }
  return false;
};

/** ```plan 围栏块提取（非贪婪到收尾围栏）。 */
export const extractPlanBlock = (text: string): StagedPlan | null => {
  const m = /```plan\s*([\s\S]*?)\s*```/.exec(text);
  if (!m) return null;
  try {
    const v = JSON.parse(m[1]!.trim()) as Record<string, unknown>;
    const session = typeof v['session'] === 'string' ? v['session'] : '';
    const brief = typeof v['brief'] === 'string' ? v['brief'] : '';
    if (session === '' || brief === '') return null;
    return {
      session,
      summary: typeof v['summary'] === 'string' ? v['summary'] : '',
      brief,
    };
  } catch {
    return null;
  }
};

// ---- 通话会话状态机 ----------------------------------------------------------------

export type CallPhase = 'discuss' | 'proposed';

export interface VoiceEvent {
  readonly type: 'chat:plan' | 'chat:phase' | 'chat:dispatched' | 'chat:error' | 'chat:system';
  readonly data: string;
}

export interface VoiceCallDeps {
  readonly llm: ChatLlmPort;
  readonly model: string;
  /** 确认后的确定性派发（SafeSendWithHealer 对应物：门 + 自愈 + 发送）。 */
  readonly dispatch: (session: string, brief: string) => Promise<Result<void, Error>>;
  readonly log?: (m: string) => void;
}

export interface VoiceTurn {
  readonly events: VoiceEvent[];
  readonly reply: string;
}

export interface VoiceCall {
  readonly mode: CallMode;
  turn(text: string): Promise<VoiceTurn>;
  confirmPlan(): Promise<VoiceTurn>;
  denyPlan(): VoiceTurn;
  readonly stagedPlan: StagedPlan | null;
  readonly phase: CallPhase;
}

export const createVoiceCall = (mode: CallMode, deps: VoiceCallDeps): VoiceCall => {
  const config = callModeConfigs[mode];
  let staged: StagedPlan | null = null;
  let phase: CallPhase = 'discuss';
  const history: { role: 'user' | 'assistant'; content: string }[] = [];
  const emit = (events: VoiceEvent[], type: VoiceEvent['type'], data: string): void => {
    events.push({ type, data });
  };

  const stageIfPresent = (events: VoiceEvent[], reply: string): void => {
    const plan = extractPlanBlock(reply);
    if (!plan) return;
    staged = plan;
    phase = 'proposed';
    emit(events, 'chat:plan', JSON.stringify(plan));
    emit(events, 'chat:phase', 'proposed');
  };

  return {
    get mode() { return mode; },
    get stagedPlan() { return staged; },
    get phase() { return phase; },

    async turn(text) {
      const events: VoiceEvent[] = [];
      // 已提议阶段：先解读确认意图——明确确认即派发（不经编排器回合）；
      // 其余视为修订/继续讨论，丢弃暂存计划重新来。
      if (staged !== null) {
        if (isConfirmPhrase(text.trim().toLowerCase())) {
          const confirm = await (this as VoiceCall).confirmPlan();
          events.push(...confirm.events);
          return { events, reply: confirm.events.at(-1)?.data ?? '' };
        }
        staged = null;
        phase = 'discuss';
        emit(events, 'chat:phase', 'discuss');
      }
      history.push({ role: 'user', content: config.prefix + text });
      const res = await deps.llm.chat({
        model: deps.model,
        maxTokens: 1024,
        messages: history.map((m) => ({ role: m.role, content: m.content })),
      });
      if (!res.ok) {
        emit(events, 'chat:error', res.error.message);
        return { events, reply: '' };
      }
      const reply = res.value.content;
      history.push({ role: 'assistant', content: reply });
      if (config.stagePlans) stageIfPresent(events, reply);
      return { events, reply };
    },

    async confirmPlan() {
      const events: VoiceEvent[] = [];
      const plan = staged;
      staged = null;
      if (!plan) return { events, reply: '' };
      const res = await deps.dispatch(plan.session, plan.brief);
      if (!res.ok) {
        emit(events, 'chat:error', `派发失败: ${res.error.message}`);
        return { events, reply: '' };
      }
      emit(events, 'chat:dispatched', plan.session);
      emit(events, 'chat:phase', 'discuss');
      const msg = `已派发给 @${plan.session} ✓`;
      emit(events, 'chat:system', msg);
      phase = 'discuss';
      deps.log?.(`[voice] 派发 ${plan.session}: ${truncate(plan.brief, 60)}`);
      return { events, reply: msg };
    },

    denyPlan() {
      const events: VoiceEvent[] = [];
      staged = null;
      phase = 'discuss';
      emit(events, 'chat:phase', 'discuss');
      return { events, reply: '' };
    },
  };
};

/** 语音回合的派发门：通话激活时拦截派发类工具（编排器 hooks 的铁腕位）。 */
export const voiceGateHook = (
  callActive: () => boolean,
  mode: () => CallMode,
): ((p: { type: string; tool?: string; block?: boolean; blockReason?: string }) => { type: string; tool?: string; block?: boolean; blockReason?: string }) => (p) => {
  if (p.type !== 'before_tool_call' || !callActive()) return p;
  if (mode() === 'chat' || VOICE_BLOCKED_TOOLS.has(p.tool ?? '')) {
    return { ...p, block: true, blockReason: '语音通话中：派发类工具被拦截（落实请走确认流程）' };
  }
  return p;
};

void ({} as JsonRecord);
