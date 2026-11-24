[**@juli-os/agents**](../index.md)

***

[@juli-os/agents](../index.md) / ToolCallRequest

# Interface: ToolCallRequest

Defined in: [src/contracts/ports.ts:14](https://github.com/juli-os/agents/blob/main/src/contracts/ports.ts#L14)

## Properties

### maxTokens?

> `readonly` `optional` **maxTokens?**: `number`

Defined in: [src/contracts/ports.ts:19](https://github.com/juli-os/agents/blob/main/src/contracts/ports.ts#L19)

***

### messages

> `readonly` **messages**: readonly [`ChatMessage`](ChatMessage.md)[]

Defined in: [src/contracts/ports.ts:16](https://github.com/juli-os/agents/blob/main/src/contracts/ports.ts#L16)

{role, content, toolCalls?, toolResults?} 的完整消息历史。

***

### model?

> `readonly` `optional` **model?**: `string`

Defined in: [src/contracts/ports.ts:18](https://github.com/juli-os/agents/blob/main/src/contracts/ports.ts#L18)

***

### signal?

> `readonly` `optional` **signal?**: `AbortSignal`

Defined in: [src/contracts/ports.ts:20](https://github.com/juli-os/agents/blob/main/src/contracts/ports.ts#L20)

***

### tools?

> `readonly` `optional` **tools?**: readonly [`ToolSchema`](ToolSchema.md)[]

Defined in: [src/contracts/ports.ts:17](https://github.com/juli-os/agents/blob/main/src/contracts/ports.ts#L17)
