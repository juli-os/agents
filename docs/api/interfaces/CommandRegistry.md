[**@juli-os/agents**](../index.md)

***

[@juli-os/agents](../index.md) / CommandRegistry

# Interface: CommandRegistry

Defined in: [peel-l0-agents/src/platform/agents/orchestrator.ts:73](https://github.com/juli-os/agents/blob/main/src/platform/agents/orchestrator.ts#L73)

## Methods

### all()

> **all**(): readonly [`SlashCommand`](SlashCommand.md)[]

Defined in: [peel-l0-agents/src/platform/agents/orchestrator.ts:76](https://github.com/juli-os/agents/blob/main/src/platform/agents/orchestrator.ts#L76)

#### Returns

readonly [`SlashCommand`](SlashCommand.md)[]

***

### help()

> **help**(): `string`

Defined in: [peel-l0-agents/src/platform/agents/orchestrator.ts:77](https://github.com/juli-os/agents/blob/main/src/platform/agents/orchestrator.ts#L77)

#### Returns

`string`

***

### match()

> **match**(`input`): [`SlashCommand`](SlashCommand.md) \| `null`

Defined in: [peel-l0-agents/src/platform/agents/orchestrator.ts:75](https://github.com/juli-os/agents/blob/main/src/platform/agents/orchestrator.ts#L75)

#### Parameters

##### input

`string`

#### Returns

[`SlashCommand`](SlashCommand.md) \| `null`

***

### register()

> **register**(`cmd`): `void`

Defined in: [peel-l0-agents/src/platform/agents/orchestrator.ts:74](https://github.com/juli-os/agents/blob/main/src/platform/agents/orchestrator.ts#L74)

#### Parameters

##### cmd

[`SlashCommand`](SlashCommand.md)

#### Returns

`void`
