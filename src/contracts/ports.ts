// L0 的对外端口契约（type-only，零运行时代码）：引擎注入实现，包内只认形状。
// 来源三处的主仓定义逐字拷贝（contracts/ports.ts 的 SyncDispatcherPort、
// platform/llm/chat.ts 的聊天端口族）——L0 不依赖 L5 的 llm 实现，只依赖形状。

import type { Result } from '../platform/shared/result.ts';

/** ACP 在途 turn 的同步派发口（interrupt 优先走 ACP 在途通道）。 */
export interface SyncDispatcherPort {
  dispatchSync(source: string, session: string, text: string): Promise<Result<string, Error>>;
}

/** LLM 工具的 JSON Schema（parameters）。 */
export interface ToolSchema {
  readonly name: string;
  readonly description: string;
  readonly parameters: Record<string, unknown>;
}

export interface ToolCallRequest {
  /** {role, content, toolCalls?, toolResults?} 的完整消息历史。 */
  readonly messages: readonly ChatMessage[];
  readonly tools?: readonly ToolSchema[];
  readonly model?: string;
  readonly maxTokens?: number;
  readonly signal?: AbortSignal;
}

export interface ChatMessage {
  readonly role: 'user' | 'assistant' | 'tool' | 'system';
  readonly content: string;
  readonly toolCalls?: readonly { readonly id: string; readonly name: string; readonly arguments: string }[];
  /** role=tool 时：上一轮 assistant toolCalls 的结果。 */
  readonly toolResults?: readonly { readonly id: string; readonly name: string; readonly content: string; readonly isError?: boolean }[];
  readonly system?: string;
}

export interface ChatResult {
  readonly content: string;
  readonly thinking?: string;
  readonly stopReason?: string;
  readonly toolCalls: readonly { readonly id: string; readonly name: string; readonly arguments: string }[];
}

/** 聊天 LLM 端口：编排器/语音理解只认此形状，实现由宿主注入。 */
export interface ChatLlmPort {
  readonly name: string;
  chat(req: ToolCallRequest): Promise<Result<ChatResult, Error>>;
}
