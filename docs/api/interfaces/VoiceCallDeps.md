[**@juli-os/agents**](../index.md)

***

[@juli-os/agents](../index.md) / VoiceCallDeps

# Interface: VoiceCallDeps

Defined in: [peel-l0-agents/src/platform/agents/voice.ts:114](https://github.com/juli-os/agents/blob/main/src/platform/agents/voice.ts#L114)

## Properties

### dispatch

> `readonly` **dispatch**: (`session`, `brief`) => `Promise`\<`Result`\<`void`, `Error`\>\>

Defined in: [peel-l0-agents/src/platform/agents/voice.ts:118](https://github.com/juli-os/agents/blob/main/src/platform/agents/voice.ts#L118)

确认后的确定性派发（SafeSendWithHealer 对应物：门 + 自愈 + 发送）。

#### Parameters

##### session

`string`

##### brief

`string`

#### Returns

`Promise`\<`Result`\<`void`, `Error`\>\>

***

### llm

> `readonly` **llm**: [`ChatLlmPort`](ChatLlmPort.md)

Defined in: [peel-l0-agents/src/platform/agents/voice.ts:115](https://github.com/juli-os/agents/blob/main/src/platform/agents/voice.ts#L115)

***

### log?

> `readonly` `optional` **log?**: (`m`) => `void`

Defined in: [peel-l0-agents/src/platform/agents/voice.ts:119](https://github.com/juli-os/agents/blob/main/src/platform/agents/voice.ts#L119)

#### Parameters

##### m

`string`

#### Returns

`void`

***

### model

> `readonly` **model**: `string`

Defined in: [peel-l0-agents/src/platform/agents/voice.ts:116](https://github.com/juli-os/agents/blob/main/src/platform/agents/voice.ts#L116)
