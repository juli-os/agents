[**@juli-os/agents**](../index.md)

***

[@juli-os/agents](../index.md) / ChatLlmPort

# Interface: ChatLlmPort

Defined in: [src/contracts/ports.ts:47](https://github.com/juli-os/agents/blob/main/src/contracts/ports.ts#L47)

聊天 LLM 端口：编排器/语音理解只认此形状，实现由宿主注入。

## Properties

### name

> `readonly` **name**: `string`

Defined in: [src/contracts/ports.ts:48](https://github.com/juli-os/agents/blob/main/src/contracts/ports.ts#L48)

## Methods

### chat()

> **chat**(`req`): `Promise`\<`Result`\<[`ChatResult`](ChatResult.md), `Error`\>\>

Defined in: [src/contracts/ports.ts:49](https://github.com/juli-os/agents/blob/main/src/contracts/ports.ts#L49)

#### Parameters

##### req

[`ToolCallRequest`](ToolCallRequest.md)

#### Returns

`Promise`\<`Result`\<[`ChatResult`](ChatResult.md), `Error`\>\>
