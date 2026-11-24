[**@juli-os/agents**](../index.md)

***

[@juli-os/agents](../index.md) / SyncDispatcherPort

# Interface: SyncDispatcherPort

Defined in: [peel-l0-agents/src/contracts/ports.ts:8](https://github.com/juli-os/agents/blob/main/src/contracts/ports.ts#L8)

ACP 在途 turn 的同步派发口（interrupt 优先走 ACP 在途通道）。

## Methods

### dispatchSync()

> **dispatchSync**(`source`, `session`, `text`): `Promise`\<`Result`\<`string`, `Error`\>\>

Defined in: [peel-l0-agents/src/contracts/ports.ts:9](https://github.com/juli-os/agents/blob/main/src/contracts/ports.ts#L9)

#### Parameters

##### source

`string`

##### session

`string`

##### text

`string`

#### Returns

`Promise`\<`Result`\<`string`, `Error`\>\>
