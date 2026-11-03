[**@juli-os/agents**](../index.md)

***

[@juli-os/agents](../index.md) / ProvisioningOpts

# Interface: ProvisioningOpts

Defined in: [platform/agents/dispatch.ts:18](https://github.com/juli-os/agents/blob/main/src/platform/agents/dispatch.ts#L18)

## Properties

### bootCommand?

> `readonly` `optional` **bootCommand?**: `string`

Defined in: [platform/agents/dispatch.ts:29](https://github.com/juli-os/agents/blob/main/src/platform/agents/dispatch.ts#L29)

裸 shell 里拉起 agent 的命令（claude CLI）。

***

### bootFor?

> `readonly` `optional` **bootFor?**: (`session`) => `string`

Defined in: [platform/agents/dispatch.ts:33](https://github.com/juli-os/agents/blob/main/src/platform/agents/dispatch.ts#L33)

会话感知的引导命令（2026-09-28 模型分层）：优先于 bootCommand——
声明 high 的会话冷启动带 `--model <高档 id>`，其余照常。缺省回落
bootCommand/'claude'。已就绪的会话不受影响（模型只在引导时定档）。

#### Parameters

##### session

`string`

#### Returns

`string`

***

### contextGate?

> `readonly` `optional` **contextGate?**: `object`

Defined in: [platform/agents/dispatch.ts:22](https://github.com/juli-os/agents/blob/main/src/platform/agents/dispatch.ts#L22)

CC context 门（wf_a79a6fcbf7ef）：切单 clear / 阈值 compact——
派发任务消息之前执行。缺省不启用（undefined = 无门，行为不变）。

#### contextTokensFor

> `readonly` **contextTokensFor**: (`session`) => `Promise`\<`number`\>

##### Parameters

###### session

`string`

##### Returns

`Promise`\<`number`\>

#### threshold?

> `readonly` `optional` **threshold?**: `number`

#### workflowFor

> `readonly` **workflowFor**: (`session`) => `Promise`\<`string`\>

##### Parameters

###### session

`string`

##### Returns

`Promise`\<`string`\>

***

### cwdFor?

> `readonly` `optional` **cwdFor?**: (`session`) => `string` \| `undefined`

Defined in: [platform/agents/dispatch.ts:40](https://github.com/juli-os/agents/blob/main/src/platform/agents/dispatch.ts#L40)

绑定会话的自建 cwd（专用 agent 隔离：会话须在指定目录启动才能看到
项目级 skill）；未命中返回 undefined 走默认 cwd。

#### Parameters

##### session

`string`

#### Returns

`string` \| `undefined`

***

### log?

> `readonly` `optional` **log?**: (`m`) => `void`

Defined in: [platform/agents/dispatch.ts:27](https://github.com/juli-os/agents/blob/main/src/platform/agents/dispatch.ts#L27)

#### Parameters

##### m

`string`

#### Returns

`void`

***

### pollMs?

> `readonly` `optional` **pollMs?**: `number`

Defined in: [platform/agents/dispatch.ts:36](https://github.com/juli-os/agents/blob/main/src/platform/agents/dispatch.ts#L36)

***

### sleep?

> `readonly` `optional` **sleep?**: (`ms`) => `Promise`\<`void`\>

Defined in: [platform/agents/dispatch.ts:37](https://github.com/juli-os/agents/blob/main/src/platform/agents/dispatch.ts#L37)

#### Parameters

##### ms

`number`

#### Returns

`Promise`\<`void`\>

***

### tmux

> `readonly` **tmux**: [`TmuxClient`](TmuxClient.md)

Defined in: [platform/agents/dispatch.ts:19](https://github.com/juli-os/agents/blob/main/src/platform/agents/dispatch.ts#L19)

***

### waitReadyMs?

> `readonly` `optional` **waitReadyMs?**: `number`

Defined in: [platform/agents/dispatch.ts:35](https://github.com/juli-os/agents/blob/main/src/platform/agents/dispatch.ts#L35)

等待就绪上限（毫秒）；超时拒派。
