[**@juli-os/agents**](../index.md)

***

[@juli-os/agents](../index.md) / HookManager

# Interface: HookManager

Defined in: [platform/agents/orchestrator.ts:38](https://github.com/juli-os/agents/blob/main/src/platform/agents/orchestrator.ts#L38)

## Methods

### fire()

> **fire**(`p`): `Promise`\<[`HookPayload`](HookPayload.md)\>

Defined in: [platform/agents/orchestrator.ts:40](https://github.com/juli-os/agents/blob/main/src/platform/agents/orchestrator.ts#L40)

#### Parameters

##### p

[`HookPayload`](HookPayload.md)

#### Returns

`Promise`\<[`HookPayload`](HookPayload.md)\>

***

### on()

> **on**(`type`, `handler`): `void`

Defined in: [platform/agents/orchestrator.ts:39](https://github.com/juli-os/agents/blob/main/src/platform/agents/orchestrator.ts#L39)

#### Parameters

##### type

[`HookType`](../type-aliases/HookType.md)

##### handler

(`p`) => [`HookPayload`](HookPayload.md) \| `Promise`\<[`HookPayload`](HookPayload.md)\>

#### Returns

`void`
