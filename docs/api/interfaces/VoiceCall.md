[**@juli-os/agents**](../index.md)

***

[@juli-os/agents](../index.md) / VoiceCall

# Interface: VoiceCall

Defined in: [peel-l0-agents/src/platform/agents/voice.ts:127](https://github.com/juli-os/agents/blob/main/src/platform/agents/voice.ts#L127)

## Properties

### mode

> `readonly` **mode**: [`CallMode`](../type-aliases/CallMode.md)

Defined in: [peel-l0-agents/src/platform/agents/voice.ts:128](https://github.com/juli-os/agents/blob/main/src/platform/agents/voice.ts#L128)

***

### phase

> `readonly` **phase**: [`CallPhase`](../type-aliases/CallPhase.md)

Defined in: [peel-l0-agents/src/platform/agents/voice.ts:133](https://github.com/juli-os/agents/blob/main/src/platform/agents/voice.ts#L133)

***

### stagedPlan

> `readonly` **stagedPlan**: [`StagedPlan`](StagedPlan.md) \| `null`

Defined in: [peel-l0-agents/src/platform/agents/voice.ts:132](https://github.com/juli-os/agents/blob/main/src/platform/agents/voice.ts#L132)

## Methods

### confirmPlan()

> **confirmPlan**(): `Promise`\<[`VoiceTurn`](VoiceTurn.md)\>

Defined in: [peel-l0-agents/src/platform/agents/voice.ts:130](https://github.com/juli-os/agents/blob/main/src/platform/agents/voice.ts#L130)

#### Returns

`Promise`\<[`VoiceTurn`](VoiceTurn.md)\>

***

### denyPlan()

> **denyPlan**(): [`VoiceTurn`](VoiceTurn.md)

Defined in: [peel-l0-agents/src/platform/agents/voice.ts:131](https://github.com/juli-os/agents/blob/main/src/platform/agents/voice.ts#L131)

#### Returns

[`VoiceTurn`](VoiceTurn.md)

***

### turn()

> **turn**(`text`): `Promise`\<[`VoiceTurn`](VoiceTurn.md)\>

Defined in: [peel-l0-agents/src/platform/agents/voice.ts:129](https://github.com/juli-os/agents/blob/main/src/platform/agents/voice.ts#L129)

#### Parameters

##### text

`string`

#### Returns

`Promise`\<[`VoiceTurn`](VoiceTurn.md)\>
