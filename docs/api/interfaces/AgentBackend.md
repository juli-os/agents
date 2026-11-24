[**@juli-os/agents**](../index.md)

***

[@juli-os/agents](../index.md) / AgentBackend

# Interface: AgentBackend

Defined in: node\_modules/@juli-os/baton/dist/baton/backend.d.ts:16

## Properties

### describe

> `readonly` **describe**: `string`

Defined in: node\_modules/@juli-os/baton/dist/baton/backend.d.ts:18

***

### kind

> `readonly` **kind**: [`AgentBackendKind`](../type-aliases/AgentBackendKind.md)

Defined in: node\_modules/@juli-os/baton/dist/baton/backend.d.ts:17

***

### terminal

> `readonly` **terminal**: [`TmuxClient`](TmuxClient.md)

Defined in: node\_modules/@juli-os/baton/dist/baton/backend.d.ts:19

## Methods

### applyEnv()

> **applyEnv**(`vars`): `void`

Defined in: node\_modules/@juli-os/baton/dist/baton/backend.d.ts:24

#### Parameters

##### vars

readonly (readonly \[`string`, `string`\])[]

#### Returns

`void`

***

### attach()

> **attach**(`session`, `opts`, `onData?`): `Promise`\<`Result`\<[`PtySession`](PtySession.md), `Error`\>\>

Defined in: node\_modules/@juli-os/baton/dist/baton/backend.d.ts:22

#### Parameters

##### session

`string`

##### opts

[`PtyOpts`](PtyOpts.md)

##### onData?

(`chunk`) => `void`

#### Returns

`Promise`\<`Result`\<[`PtySession`](PtySession.md), `Error`\>\>

***

### bootCommand()

> **bootCommand**(`base`, `session`): `string`

Defined in: node\_modules/@juli-os/baton/dist/baton/backend.d.ts:23

#### Parameters

##### base

`string`

##### session

`string`

#### Returns

`string`

***

### hookSpecs()

> **hookSpecs**(`hookJsPath`, `password`, `serviceUrl`): readonly `HookSpec`[]

Defined in: node\_modules/@juli-os/baton/dist/baton/backend.d.ts:20

#### Parameters

##### hookJsPath

`string`

##### password

`string`

##### serviceUrl

`string`

#### Returns

readonly `HookSpec`[]

***

### listSync()

> **listSync**(): readonly `string`[]

Defined in: node\_modules/@juli-os/baton/dist/baton/backend.d.ts:21

#### Returns

readonly `string`[]
