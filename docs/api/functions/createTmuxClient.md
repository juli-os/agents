[**@juli-os/agents**](../index.md)

***

[@juli-os/agents](../index.md) / createTmuxClient

# Function: createTmuxClient()

> **createTmuxClient**(`opts?`): [`TmuxClient`](../interfaces/TmuxClient.md)

Defined in: [platform/agents/tmux.ts:161](https://github.com/juli-os/agents/blob/main/src/platform/agents/tmux.ts#L161)

## Parameters

### opts?

#### queuedConfirmMs?

`number`

入队式投递的观察预算（默认 8s）：到达即返，in_box 到期也接受——
这里等的不是「提交被消费」（可能要等整个 agent 回合），只是「到达」。

#### sleep?

(`ms`) => `Promise`\<`void`\>

测试注入的睡眠（默认真睡）。

#### socketPath?

`string`

#### submitConfirmMs?

`number`

提交确认总预算（默认 20s）：4s 实测产假阴性——agent 忙时 prompt 入队
稍后才消费（2026-09-21 深夜用户实测「实际上已经提交了」）。

## Returns

[`TmuxClient`](../interfaces/TmuxClient.md)
