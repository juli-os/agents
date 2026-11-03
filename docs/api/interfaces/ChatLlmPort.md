[**@juli-os/agents**](../index.md)

***

[@juli-os/agents](../index.md) / ChatLlmPort

# Interface: ChatLlmPort

Defined in: [contracts/ports.ts:52](https://github.com/juli-os/agents/blob/main/src/contracts/ports.ts#L52)

聊天 LLM 端口：编排器/语音理解只认此形状，实现由宿主注入。

## Properties

### name

> `readonly` **name**: `string`

Defined in: [contracts/ports.ts:53](https://github.com/juli-os/agents/blob/main/src/contracts/ports.ts#L53)

## Methods

### chat()

> **chat**(`req`): `Promise`\<`Result`\<[`ChatResult`](ChatResult.md), `Error`\>\>

Defined in: [contracts/ports.ts:54](https://github.com/juli-os/agents/blob/main/src/contracts/ports.ts#L54)

#### Parameters

##### req

[`ToolCallRequest`](ToolCallRequest.md)

#### Returns

`Promise`\<`Result`\<[`ChatResult`](ChatResult.md), `Error`\>\>
