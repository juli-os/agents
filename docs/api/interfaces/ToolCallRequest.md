[**@juli-os/agents**](../index.md)

***

[@juli-os/agents](../index.md) / ToolCallRequest

# Interface: ToolCallRequest

Defined in: [peel-l0-agents/src/contracts/ports.ts:19](https://github.com/juli-os/agents/blob/main/src/contracts/ports.ts#L19)

## Properties

### maxTokens?

> `readonly` `optional` **maxTokens?**: `number`

Defined in: [peel-l0-agents/src/contracts/ports.ts:24](https://github.com/juli-os/agents/blob/main/src/contracts/ports.ts#L24)

***

### messages

> `readonly` **messages**: readonly [`ChatMessage`](ChatMessage.md)[]

Defined in: [peel-l0-agents/src/contracts/ports.ts:21](https://github.com/juli-os/agents/blob/main/src/contracts/ports.ts#L21)

{role, content, toolCalls?, toolResults?} 的完整消息历史。

***

### model?

> `readonly` `optional` **model?**: `string`

Defined in: [peel-l0-agents/src/contracts/ports.ts:23](https://github.com/juli-os/agents/blob/main/src/contracts/ports.ts#L23)

***

### signal?

> `readonly` `optional` **signal?**: `AbortSignal`

Defined in: [peel-l0-agents/src/contracts/ports.ts:25](https://github.com/juli-os/agents/blob/main/src/contracts/ports.ts#L25)

***

### tools?

> `readonly` `optional` **tools?**: readonly [`ToolSchema`](ToolSchema.md)[]

Defined in: [peel-l0-agents/src/contracts/ports.ts:22](https://github.com/juli-os/agents/blob/main/src/contracts/ports.ts#L22)
