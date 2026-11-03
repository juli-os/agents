[**@juli-os/agents**](../index.md)

***

[@juli-os/agents](../index.md) / Orchestrator

# Interface: Orchestrator

Defined in: [platform/agents/orchestrator.ts:196](https://github.com/juli-os/agents/blob/main/src/platform/agents/orchestrator.ts#L196)

## Properties

### commands

> `readonly` **commands**: [`CommandRegistry`](CommandRegistry.md)

Defined in: [platform/agents/orchestrator.ts:201](https://github.com/juli-os/agents/blob/main/src/platform/agents/orchestrator.ts#L201)

***

### hooks

> `readonly` **hooks**: [`HookManager`](HookManager.md)

Defined in: [platform/agents/orchestrator.ts:202](https://github.com/juli-os/agents/blob/main/src/platform/agents/orchestrator.ts#L202)

***

### messages

> `readonly` **messages**: readonly [`ChatMessage`](ChatMessage.md)[]

Defined in: [platform/agents/orchestrator.ts:199](https://github.com/juli-os/agents/blob/main/src/platform/agents/orchestrator.ts#L199)

## Methods

### handle()

> **handle**(`input`, `emit`): `Promise`\<`void`\>

Defined in: [platform/agents/orchestrator.ts:198](https://github.com/juli-os/agents/blob/main/src/platform/agents/orchestrator.ts#L198)

处理一条用户输入：slash 命令分流或完整 tool-calling 循环。

#### Parameters

##### input

`string`

##### emit

[`Emit`](../type-aliases/Emit.md)

#### Returns

`Promise`\<`void`\>

***

### reset()

> **reset**(): `void`

Defined in: [platform/agents/orchestrator.ts:200](https://github.com/juli-os/agents/blob/main/src/platform/agents/orchestrator.ts#L200)

#### Returns

`void`
