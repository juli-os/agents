[**@juli-os/agents**](../index.md)

***

[@juli-os/agents](../index.md) / ChatMessage

# Interface: ChatMessage

Defined in: [peel-l0-agents/src/contracts/ports.ts:35](https://github.com/juli-os/agents/blob/main/src/contracts/ports.ts#L35)

## Properties

### content

> `readonly` **content**: `string`

Defined in: [peel-l0-agents/src/contracts/ports.ts:37](https://github.com/juli-os/agents/blob/main/src/contracts/ports.ts#L37)

***

### role

> `readonly` **role**: `"assistant"` \| `"user"` \| `"tool"` \| `"system"`

Defined in: [peel-l0-agents/src/contracts/ports.ts:36](https://github.com/juli-os/agents/blob/main/src/contracts/ports.ts#L36)

***

### system?

> `readonly` `optional` **system?**: `string`

Defined in: [peel-l0-agents/src/contracts/ports.ts:41](https://github.com/juli-os/agents/blob/main/src/contracts/ports.ts#L41)

***

### toolCalls?

> `readonly` `optional` **toolCalls?**: readonly `ToolCall`[]

Defined in: [peel-l0-agents/src/contracts/ports.ts:38](https://github.com/juli-os/agents/blob/main/src/contracts/ports.ts#L38)

***

### toolResults?

> `readonly` `optional` **toolResults?**: readonly `object`[]

Defined in: [peel-l0-agents/src/contracts/ports.ts:40](https://github.com/juli-os/agents/blob/main/src/contracts/ports.ts#L40)

role=tool 时：上一轮 assistant toolCalls 的结果。
