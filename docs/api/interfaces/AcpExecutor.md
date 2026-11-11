[**@juli-os/agents**](../index.md)

***

[@juli-os/agents](../index.md) / AcpExecutor

# Interface: AcpExecutor

Defined in: [peel-l0-agents/src/platform/agents/acp.ts:57](https://github.com/juli-os/agents/blob/main/src/platform/agents/acp.ts#L57)

## Properties

### dispatchSync

> `readonly` **dispatchSync**: (`source`, `session`, `text`) => `Promise`\<`Result`\<`string`, `Error`\>\>

Defined in: [peel-l0-agents/src/platform/agents/acp.ts:58](https://github.com/juli-os/agents/blob/main/src/platform/agents/acp.ts#L58)

#### Parameters

##### source

`string`

##### session

`string`

##### text

`string`

#### Returns

`Promise`\<`Result`\<`string`, `Error`\>\>

## Methods

### alive()

> **alive**(): `boolean`

Defined in: [peel-l0-agents/src/platform/agents/acp.ts:60](https://github.com/juli-os/agents/blob/main/src/platform/agents/acp.ts#L60)

#### Returns

`boolean`

***

### interrupt()

> **interrupt**(`session`): `Promise`\<`Result`\<`void`, `Error`\>\>

Defined in: [peel-l0-agents/src/platform/agents/acp.ts:59](https://github.com/juli-os/agents/blob/main/src/platform/agents/acp.ts#L59)

#### Parameters

##### session

`string`

#### Returns

`Promise`\<`Result`\<`void`, `Error`\>\>

***

### stop()

> **stop**(): `void`

Defined in: [peel-l0-agents/src/platform/agents/acp.ts:61](https://github.com/juli-os/agents/blob/main/src/platform/agents/acp.ts#L61)

#### Returns

`void`
