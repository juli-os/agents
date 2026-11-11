[**@juli-os/agents**](../index.md)

***

[@juli-os/agents](../index.md) / HerdrClient

# Interface: HerdrClient

Defined in: baton/dist/baton/herdr.d.ts:31

## Extends

- [`TmuxClient`](TmuxClient.md)

## Properties

### backend

> `readonly` **backend**: `"herdr"`

Defined in: baton/dist/baton/herdr.d.ts:32

***

### session

> `readonly` **session**: `string`

Defined in: baton/dist/baton/herdr.d.ts:33

***

### socketPath?

> `readonly` `optional` **socketPath?**: `string`

Defined in: baton/dist/baton/tmux.d.ts:23

#### Inherited from

[`TmuxClient`](TmuxClient.md).[`socketPath`](TmuxClient.md#socketpath)

## Methods

### agentAtPaneOf()

> **agentAtPaneOf**(`session`): `Promise`\<`string`\>

Defined in: baton/dist/baton/herdr.d.ts:36

#### Parameters

##### session

`string`

#### Returns

`Promise`\<`string`\>

***

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

#### Inherited from

[`TmuxClient`](TmuxClient.md).[`capturePane`](TmuxClient.md#capturepane)

***

### foregroundCommandOf()

> **foregroundCommandOf**(`name`): `Promise`\<`string`\>

Defined in: baton/dist/baton/tmux.d.ts:26

#### Parameters

##### name

`string`

#### Returns

`Promise`\<`string`\>

#### Inherited from

[`TmuxClient`](TmuxClient.md).[`foregroundCommandOf`](TmuxClient.md#foregroundcommandof)

***

### hasSession()

> **hasSession**(`name`): `Promise`\<`boolean`\>

Defined in: baton/dist/baton/tmux.d.ts:24

#### Parameters

##### name

`string`

#### Returns

`Promise`\<`boolean`\>

#### Inherited from

[`TmuxClient`](TmuxClient.md).[`hasSession`](TmuxClient.md#hassession)

***

### interrupt()

> **interrupt**(`name`): `Promise`\<`Result`\<`void`, `Error`\>\>

Defined in: baton/dist/baton/tmux.d.ts:40

#### Parameters

##### name

`string`

#### Returns

`Promise`\<`Result`\<`void`, `Error`\>\>

#### Inherited from

[`TmuxClient`](TmuxClient.md).[`interrupt`](TmuxClient.md#interrupt)

***

### killSession()

> **killSession**(`name`): `Promise`\<`Result`\<`void`, `Error`\>\>

Defined in: baton/dist/baton/tmux.d.ts:39

#### Parameters

##### name

`string`

#### Returns

`Promise`\<`Result`\<`void`, `Error`\>\>

#### Inherited from

[`TmuxClient`](TmuxClient.md).[`killSession`](TmuxClient.md#killsession)

***

### listSessions()

> **listSessions**(): `Promise`\<readonly `string`[]\>

Defined in: baton/dist/baton/tmux.d.ts:30

#### Returns

`Promise`\<readonly `string`[]\>

#### Inherited from

[`TmuxClient`](TmuxClient.md).[`listSessions`](TmuxClient.md#listsessions)

***

### listSessionsDetailed()

> **listSessionsDetailed**(): `Promise`\<`Result`\<readonly [`TmuxSessionInfo`](TmuxSessionInfo.md)[], `Error`\>\>

Defined in: baton/dist/baton/tmux.d.ts:31

#### Returns

`Promise`\<`Result`\<readonly [`TmuxSessionInfo`](TmuxSessionInfo.md)[], `Error`\>\>

#### Inherited from

[`TmuxClient`](TmuxClient.md).[`listSessionsDetailed`](TmuxClient.md#listsessionsdetailed)

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

#### Inherited from

[`TmuxClient`](TmuxClient.md).[`newSession`](TmuxClient.md#newsession)

***

### paneIdOf()

> **paneIdOf**(`session`): `Promise`\<`string`\>

Defined in: baton/dist/baton/herdr.d.ts:35

#### Parameters

##### session

`string`

#### Returns

`Promise`\<`string`\>

***

### panePathOf()

> **panePathOf**(`name`): `Promise`\<`string`\>

Defined in: baton/dist/baton/tmux.d.ts:27

#### Parameters

##### name

`string`

#### Returns

`Promise`\<`string`\>

#### Inherited from

[`TmuxClient`](TmuxClient.md).[`panePathOf`](TmuxClient.md#panepathof)

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

#### Inherited from

[`TmuxClient`](TmuxClient.md).[`sendKey`](TmuxClient.md#sendkey)

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

#### Inherited from

[`TmuxClient`](TmuxClient.md).[`sendText`](TmuxClient.md#sendtext)

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

#### Inherited from

[`TmuxClient`](TmuxClient.md).[`sendTextConfirmed`](TmuxClient.md#sendtextconfirmed)

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

#### Inherited from

[`TmuxClient`](TmuxClient.md).[`sendTextQueued`](TmuxClient.md#sendtextqueued)

***

### sessionBirthsOf()

> **sessionBirthsOf**(): `Promise`\<`ReadonlyMap`\<`string`, `number`\>\>

Defined in: baton/dist/baton/tmux.d.ts:28

#### Returns

`Promise`\<`ReadonlyMap`\<`string`, `number`\>\>

#### Inherited from

[`TmuxClient`](TmuxClient.md).[`sessionBirthsOf`](TmuxClient.md#sessionbirthsof)

***

### setEnv()

> **setEnv**(`vars`): `Promise`\<`Result`\<`void`, `Error`\>\>

Defined in: baton/dist/baton/tmux.d.ts:29

#### Parameters

##### vars

`Readonly`\<`Record`\<`string`, `string`\>\>

#### Returns

`Promise`\<`Result`\<`void`, `Error`\>\>

#### Inherited from

[`TmuxClient`](TmuxClient.md).[`setEnv`](TmuxClient.md#setenv)

***

### startManagedAgent()

> **startManagedAgent**(`session`, `opts`): `Promise`\<`Result`\<[`HerdrAgentInfo`](HerdrAgentInfo.md), `Error`\>\>

Defined in: baton/dist/baton/herdr.d.ts:34

#### Parameters

##### session

`string`

##### opts

[`HerdrManagedAgentStart`](HerdrManagedAgentStart.md)

#### Returns

`Promise`\<`Result`\<[`HerdrAgentInfo`](HerdrAgentInfo.md), `Error`\>\>
