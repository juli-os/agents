[**@juli-os/agents**](../index.md)

***

[@juli-os/agents](../index.md) / AgentBackend

# Interface: AgentBackend

Defined in: platform/agents/backend.ts:44

## Properties

### describe

> `readonly` **describe**: `string`

Defined in: platform/agents/backend.ts:47

人读描述（warmup/诊断日志）：`tmux socket=default` / `herdr session=juli`。

***

### kind

> `readonly` **kind**: [`AgentBackendKind`](../type-aliases/AgentBackendKind.md)

Defined in: platform/agents/backend.ts:45

***

### terminal

> `readonly` **terminal**: [`TmuxClient`](TmuxClient.md)

Defined in: platform/agents/backend.ts:49

终端契约——派发/探测/快照管线的唯一消费面。

## Methods

### applyEnv()

> **applyEnv**(`vars`): `void`

Defined in: platform/agents/backend.ts:59

AI 段 env 注入（[key, value] 对）。

#### Parameters

##### vars

readonly (readonly \[`string`, `string`\])[]

#### Returns

`void`

***

### attach()

> **attach**(`session`, `opts`, `onData?`): `Promise`\<`Result`\<[`PtySession`](PtySession.md), `Error`\>\>

Defined in: platform/agents/backend.ts:55

web 终端 attach：会话不存在明确报错、不代建。

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

Defined in: platform/agents/backend.ts:57

引导命令包装：base=引擎选好的 claude 启动命令，session=目标会话名。

#### Parameters

##### base

`string`

##### session

`string`

#### Returns

`string`

***

### hookSpecs()

> **hookSpecs**(`hookJsPath`, `password`, `serviceUrl`): readonly [`HookSpec`](HookSpec.md)[]

Defined in: platform/agents/backend.ts:51

CC hook 命令组（installClaudeHooks 的入参）。

#### Parameters

##### hookJsPath

`string`

##### password

`string`

##### serviceUrl

`string`

#### Returns

readonly [`HookSpec`](HookSpec.md)[]

***

### listSync()

> **listSync**(): readonly `string`[]

Defined in: platform/agents/backend.ts:53

会话名单同步源（router listSync；失败/缺席归一空名单）。

#### Returns

readonly `string`[]
