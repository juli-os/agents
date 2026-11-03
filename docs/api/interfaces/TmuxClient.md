[**@juli-os/agents**](../index.md)

***

[@juli-os/agents](../index.md) / TmuxClient

# Interface: TmuxClient

Defined in: [platform/agents/tmux.ts:110](https://github.com/juli-os/agents/blob/main/src/platform/agents/tmux.ts#L110)

## Properties

### socketPath?

> `readonly` `optional` **socketPath?**: `string`

Defined in: [platform/agents/tmux.ts:113](https://github.com/juli-os/agents/blob/main/src/platform/agents/tmux.ts#L113)

本 client 绑定的 socket 路径（undefined=default socket）。web 终端
attach 侧用它拼 `-S`——PTY attach 是裸 tmux 命令，不经本 client。

## Methods

### capturePane()

> **capturePane**(`name`, `lines?`): `Promise`\<`Result`\<`string`, `Error`\>\>

Defined in: [platform/agents/tmux.ts:139](https://github.com/juli-os/agents/blob/main/src/platform/agents/tmux.ts#L139)

#### Parameters

##### name

`string`

##### lines?

`number`

#### Returns

`Promise`\<`Result`\<`string`, `Error`\>\>

***

### exec()

> **exec**(`args`): `Promise`\<`Result`\<`string`, `Error`\>\>

Defined in: [platform/agents/tmux.ts:116](https://github.com/juli-os/agents/blob/main/src/platform/agents/tmux.ts#L116)

原生命令面（pane-probe 等确定性探测用）。

#### Parameters

##### args

readonly `string`[]

#### Returns

`Promise`\<`Result`\<`string`, `Error`\>\>

***

### hasSession()

> **hasSession**(`name`): `Promise`\<`boolean`\>

Defined in: [platform/agents/tmux.ts:114](https://github.com/juli-os/agents/blob/main/src/platform/agents/tmux.ts#L114)

#### Parameters

##### name

`string`

#### Returns

`Promise`\<`boolean`\>

***

### interrupt()

> **interrupt**(`name`): `Promise`\<`Result`\<`void`, `Error`\>\>

Defined in: [platform/agents/tmux.ts:141](https://github.com/juli-os/agents/blob/main/src/platform/agents/tmux.ts#L141)

#### Parameters

##### name

`string`

#### Returns

`Promise`\<`Result`\<`void`, `Error`\>\>

***

### killSession()

> **killSession**(`name`): `Promise`\<`Result`\<`void`, `Error`\>\>

Defined in: [platform/agents/tmux.ts:140](https://github.com/juli-os/agents/blob/main/src/platform/agents/tmux.ts#L140)

#### Parameters

##### name

`string`

#### Returns

`Promise`\<`Result`\<`void`, `Error`\>\>

***

### listSessions()

> **listSessions**(): `Promise`\<readonly `string`[]\>

Defined in: [platform/agents/tmux.ts:120](https://github.com/juli-os/agents/blob/main/src/platform/agents/tmux.ts#L120)

全部会话名。任何失败（含 tmux 不在）都归一为空数组——签名无错误通道，
消费方（snapshot）以 stale 快照兜底、零会话与故障同形即可；要区分
「无 server」与真错误用 listSessionsDetailed。

#### Returns

`Promise`\<readonly `string`[]\>

***

### listSessionsDetailed()

> **listSessionsDetailed**(): `Promise`\<`Result`\<readonly [`TmuxSessionInfo`](TmuxSessionInfo.md)[], `Error`\>\>

Defined in: [platform/agents/tmux.ts:124](https://github.com/juli-os/agents/blob/main/src/platform/agents/tmux.ts#L124)

单条 list-sessions 批量取会话元数据（列表面 N+1 消除）：
`#{session_name}\t#{session_attached}\t#{pane_current_path}\t#{pane_current_command}`。
无活动 server（零会话）= 正常空态，返回空数组而非错误。

#### Returns

`Promise`\<`Result`\<readonly [`TmuxSessionInfo`](TmuxSessionInfo.md)[], `Error`\>\>

***

### newSession()

> **newSession**(`name`, `cwd?`): `Promise`\<`Result`\<`void`, `Error`\>\>

Defined in: [platform/agents/tmux.ts:125](https://github.com/juli-os/agents/blob/main/src/platform/agents/tmux.ts#L125)

#### Parameters

##### name

`string`

##### cwd?

`string`

#### Returns

`Promise`\<`Result`\<`void`, `Error`\>\>

***

### sendText()

> **sendText**(`name`, `text`): `Promise`\<`Result`\<`void`, `Error`\>\>

Defined in: [platform/agents/tmux.ts:129](https://github.com/juli-os/agents/blob/main/src/platform/agents/tmux.ts#L129)

发文本进会话。>10 字符走 bracketed-paste + 回车（原子），短文本直接
send-keys（tmux 对短参数的逐键合并语义与 Go 版一致）。无提交确认——
任务派发用 sendTextConfirmed。

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

Defined in: [platform/agents/tmux.ts:132](https://github.com/juli-os/agents/blob/main/src/platform/agents/tmux.ts#L132)

确认式发送：paste + Enter 后轮询验证输入框已重置；Enter 被吞只补 Enter
（不重发文本），~20s 内确认或显性失败（guard=submit_unconfirmed）。

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

Defined in: [platform/agents/tmux.ts:138](https://github.com/juli-os/agents/blob/main/src/platform/agents/tmux.ts#L138)

入队式投递（intervene/relay 面，2026-09-23 插话 400 事故）：忙碌会话里
CC 把输入排队消费、输入框不重置是常态——严格提交确认对它永远超时
（实测 20127ms ≈ submitConfirmMs 耗尽）。这里只验证「文本到达过会话」：
指纹出现在 pane（框内或提交后）即成立；in_box 到期也接受（排队待消费）；
从未出现 → 补一次粘贴再判，仍无 → paste_lost。

#### Parameters

##### name

`string`

##### text

`string`

#### Returns

`Promise`\<`Result`\<[`SubmitStats`](SubmitStats.md) & `object`, `Error`\>\>
