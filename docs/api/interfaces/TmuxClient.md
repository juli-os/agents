[**@juli-os/agents**](../index.md)

***

[@juli-os/agents](../index.md) / TmuxClient

# Interface: TmuxClient

Defined in: baton/dist/baton/tmux.d.ts:22

## Extended by

- [`HerdrClient`](HerdrClient.md)

## Properties

### socketPath?

> `readonly` `optional` **socketPath?**: `string`

Defined in: baton/dist/baton/tmux.d.ts:23

## Methods

### capturePane()

> **capturePane**(`name`, `lines?`): `Promise`\<`Result`\<`string`, `Error`\>\>

Defined in: baton/dist/baton/tmux.d.ts:38

#### Parameters

##### name

`string`

##### lines?

`number`

#### Returns

`Promise`\<`Result`\<`string`, `Error`\>\>

***

### foregroundCommandOf()

> **foregroundCommandOf**(`name`): `Promise`\<`string`\>

Defined in: baton/dist/baton/tmux.d.ts:26

#### Parameters

##### name

`string`

#### Returns

`Promise`\<`string`\>

***

### hasSession()

> **hasSession**(`name`): `Promise`\<`boolean`\>

Defined in: baton/dist/baton/tmux.d.ts:24

#### Parameters

##### name

`string`

#### Returns

`Promise`\<`boolean`\>

***

### interrupt()

> **interrupt**(`name`): `Promise`\<`Result`\<`void`, `Error`\>\>

Defined in: baton/dist/baton/tmux.d.ts:40

#### Parameters

##### name

`string`

#### Returns

`Promise`\<`Result`\<`void`, `Error`\>\>

***

### killSession()

> **killSession**(`name`): `Promise`\<`Result`\<`void`, `Error`\>\>

Defined in: baton/dist/baton/tmux.d.ts:39

#### Parameters

##### name

`string`

#### Returns

`Promise`\<`Result`\<`void`, `Error`\>\>

***

### listSessions()

> **listSessions**(): `Promise`\<readonly `string`[]\>

Defined in: baton/dist/baton/tmux.d.ts:30

#### Returns

`Promise`\<readonly `string`[]\>

***

### listSessionsDetailed()

> **listSessionsDetailed**(): `Promise`\<`Result`\<readonly [`TmuxSessionInfo`](TmuxSessionInfo.md)[], `Error`\>\>

Defined in: baton/dist/baton/tmux.d.ts:31

#### Returns

`Promise`\<`Result`\<readonly [`TmuxSessionInfo`](TmuxSessionInfo.md)[], `Error`\>\>

***

### newSession()

> **newSession**(`name`, `cwd?`): `Promise`\<`Result`\<`void`, `Error`\>\>

Defined in: baton/dist/baton/tmux.d.ts:32

#### Parameters

##### name

`string`

##### cwd?

`string`

#### Returns

`Promise`\<`Result`\<`void`, `Error`\>\>

***

### panePathOf()

> **panePathOf**(`name`): `Promise`\<`string`\>

Defined in: baton/dist/baton/tmux.d.ts:27

#### Parameters

##### name

`string`

#### Returns

`Promise`\<`string`\>

***

### sendKey()

> **sendKey**(`name`, `key`): `Promise`\<`Result`\<`void`, `Error`\>\>

Defined in: baton/dist/baton/tmux.d.ts:25

#### Parameters

##### name

`string`

##### key

[`TerminalKey`](../type-aliases/TerminalKey.md)

#### Returns

`Promise`\<`Result`\<`void`, `Error`\>\>

***

### sendText()

> **sendText**(`name`, `text`): `Promise`\<`Result`\<`void`, `Error`\>\>

Defined in: baton/dist/baton/tmux.d.ts:33

#### Parameters

##### name

`string`

##### text

`string`

#### Returns

`Promise`\<`Result`\<`void`, `Error`\>\>

***

### sendTextConfirmed()

> **sendTextConfirmed**(`name`, `text`): `Promise`\<`Result`\<[`SubmitStats`](SubmitStats.md), `Error`\>\>

Defined in: baton/dist/baton/tmux.d.ts:34

#### Parameters

##### name

`string`

##### text

`string`

#### Returns

`Promise`\<`Result`\<[`SubmitStats`](SubmitStats.md), `Error`\>\>

***

### sendTextQueued()

> **sendTextQueued**(`name`, `text`): `Promise`\<`Result`\<[`SubmitStats`](SubmitStats.md) & `object`, `Error`\>\>

Defined in: baton/dist/baton/tmux.d.ts:35

#### Parameters

##### name

`string`

##### text

`string`

#### Returns

`Promise`\<`Result`\<[`SubmitStats`](SubmitStats.md) & `object`, `Error`\>\>

***

### sessionBirthsOf()

> **sessionBirthsOf**(): `Promise`\<`ReadonlyMap`\<`string`, `number`\>\>

Defined in: baton/dist/baton/tmux.d.ts:28

#### Returns

`Promise`\<`ReadonlyMap`\<`string`, `number`\>\>

***

### setEnv()

> **setEnv**(`vars`): `Promise`\<`Result`\<`void`, `Error`\>\>

Defined in: baton/dist/baton/tmux.d.ts:29

#### Parameters

##### vars

`Readonly`\<`Record`\<`string`, `string`\>\>

#### Returns

`Promise`\<`Result`\<`void`, `Error`\>\>
