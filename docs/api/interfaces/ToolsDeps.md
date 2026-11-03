[**@juli-os/agents**](../index.md)

***

[@juli-os/agents](../index.md) / ToolsDeps

# Interface: ToolsDeps

Defined in: [platform/agents/tools.ts:72](https://github.com/juli-os/agents/blob/main/src/platform/agents/tools.ts#L72)

## Properties

### assessor

> `readonly` **assessor**: [`Assessor`](Assessor.md) \| `null`

Defined in: [platform/agents/tools.ts:75](https://github.com/juli-os/agents/blob/main/src/platform/agents/tools.ts#L75)

***

### cwd

> `readonly` **cwd**: `string`

Defined in: [platform/agents/tools.ts:79](https://github.com/juli-os/agents/blob/main/src/platform/agents/tools.ts#L79)

文件工具的工作区根（绝对路径外拒）。

***

### healer?

> `readonly` `optional` **healer?**: [`SessionHealer`](SessionHealer.md)

Defined in: [platform/agents/tools.ts:77](https://github.com/juli-os/agents/blob/main/src/platform/agents/tools.ts#L77)

裸 shell 自愈（快照恢复）；send-time 门使用。

***

### log?

> `readonly` `optional` **log?**: (`m`) => `void`

Defined in: [platform/agents/tools.ts:81](https://github.com/juli-os/agents/blob/main/src/platform/agents/tools.ts#L81)

#### Parameters

##### m

`string`

#### Returns

`void`

***

### notifier

> `readonly` **notifier**: [`NotifierPort`](NotifierPort.md) \| `null`

Defined in: [platform/agents/tools.ts:74](https://github.com/juli-os/agents/blob/main/src/platform/agents/tools.ts#L74)

***

### onSwitch?

> `readonly` `optional` **onSwitch?**: (`session`) => `void`

Defined in: [platform/agents/tools.ts:82](https://github.com/juli-os/agents/blob/main/src/platform/agents/tools.ts#L82)

#### Parameters

##### session

`string`

#### Returns

`void`

***

### statePath?

> `readonly` `optional` **statePath?**: `string`

Defined in: [platform/agents/tools.ts:80](https://github.com/juli-os/agents/blob/main/src/platform/agents/tools.ts#L80)

***

### tmux

> `readonly` **tmux**: [`TmuxClient`](TmuxClient.md) \| `null`

Defined in: [platform/agents/tools.ts:73](https://github.com/juli-os/agents/blob/main/src/platform/agents/tools.ts#L73)
