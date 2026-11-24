[**@juli-os/agents**](../index.md)

***

[@juli-os/agents](../index.md) / ChatMessage

# Interface: ChatMessage

Defined in: [src/contracts/ports.ts:30](https://github.com/juli-os/agents/blob/main/src/contracts/ports.ts#L30)

## Properties

### content

> `readonly` **content**: `string`

Defined in: [src/contracts/ports.ts:32](https://github.com/juli-os/agents/blob/main/src/contracts/ports.ts#L32)

***

### role

> `readonly` **role**: `"assistant"` \| `"user"` \| `"tool"` \| `"system"`

Defined in: [src/contracts/ports.ts:31](https://github.com/juli-os/agents/blob/main/src/contracts/ports.ts#L31)

***

### system?

> `readonly` `optional` **system?**: `string`

Defined in: [src/contracts/ports.ts:36](https://github.com/juli-os/agents/blob/main/src/contracts/ports.ts#L36)

***

### toolCalls?

> `readonly` `optional` **toolCalls?**: readonly `ToolCall`[]

Defined in: [src/contracts/ports.ts:33](https://github.com/juli-os/agents/blob/main/src/contracts/ports.ts#L33)

***

### toolResults?

> `readonly` `optional` **toolResults?**: readonly `object`[]

Defined in: [src/contracts/ports.ts:35](https://github.com/juli-os/agents/blob/main/src/contracts/ports.ts#L35)

role=tool 时：上一轮 assistant toolCalls 的结果。
