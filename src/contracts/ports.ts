// L0's outward port contracts (type-only, zero runtime code): the engine
// injects implementations; inside this package only the shapes matter. Copied
// verbatim from the main-repo definitions in three places (SyncDispatcherPort
// from contracts/ports.ts, the chat port family from platform/llm/chat.ts) —
// L0 does not depend on L5's llm implementation, only on the shapes.

import type { Result } from '../platform/shared/result.ts';

/** Synchronous dispatch port for an in-flight ACP turn (interrupts prefer the in-flight ACP channel). */
export interface SyncDispatcherPort {
  dispatchSync(source: string, session: string, text: string): Promise<Result<string, Error>>;
}

/** JSON Schema (parameters) for an LLM tool. */
export interface ToolSchema {
  readonly name: string;
  readonly description: string;
  readonly parameters: Record<string, unknown>;
}

export interface ToolCallRequest {
  /** Full message history of {role, content, toolCalls?, toolResults?}. */
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
  /** When role=tool: results of the previous assistant turn's toolCalls. */
  readonly toolResults?: readonly { readonly id: string; readonly name: string; readonly content: string; readonly isError?: boolean }[];
  readonly system?: string;
}

export interface ChatResult {
  readonly content: string;
  readonly thinking?: string;
  readonly stopReason?: string;
  readonly toolCalls: readonly { readonly id: string; readonly name: string; readonly arguments: string }[];
}

/** Chat LLM port: the orchestrator and voice understanding depend only on this shape; the host injects the implementation. */
export interface ChatLlmPort {
  readonly name: string;
  chat(req: ToolCallRequest): Promise<Result<ChatResult, Error>>;
}
