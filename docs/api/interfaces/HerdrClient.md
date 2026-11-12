[**@juli-os/agents**](../index.md)

***

[@juli-os/agents](../index.md) / HerdrClient

# Interface: HerdrClient

Defined in: [platform/agents/herdr.ts:166](https://github.com/juli-os/agents/blob/main/src/platform/agents/herdr.ts#L166)

## Extends

- [`TmuxClient`](TmuxClient.md)

## Properties

### backend

> `readonly` **backend**: `"herdr"`

Defined in: [platform/agents/herdr.ts:167](https://github.com/juli-os/agents/blob/main/src/platform/agents/herdr.ts#L167)

***

### session

> `readonly` **session**: `string`

Defined in: [platform/agents/herdr.ts:168](https://github.com/juli-os/agents/blob/main/src/platform/agents/herdr.ts#L168)

***

### socketPath?

> `readonly` `optional` **socketPath?**: `string`

Defined in: [platform/agents/tmux.ts:119](https://github.com/juli-os/agents/blob/main/src/platform/agents/tmux.ts#L119)

本 client 绑定的 socket 路径（undefined=default socket）。web 终端
attach 侧用它拼 `-S`——PTY attach 是裸 tmux 命令，不经本 client。

#### Inherited from

[`TmuxClient`](TmuxClient.md).[`socketPath`](TmuxClient.md#socketpath)

## Methods

### agentAtPaneOf()

> **agentAtPaneOf**(`session`): `Promise`\<`string`\>

Defined in: [platform/agents/herdr.ts:184](https://github.com/juli-os/agents/blob/main/src/platform/agents/herdr.ts#L184)

pane 上被识别的 agent（pane.list 的 agent 字段，herdr PaneInfo.agent）：
非空 = `agent attach <pane>` 的在位前置成立。裸 shell / 寻址失败回空串
（attach 闸用，2026-11-10 live 实测：裸 shell 期 attach 回
agent_not_found、PTY 秒死）。

#### Parameters

##### session

`string`

#### Returns

`Promise`\<`string`\>

***

### capturePane()

> **capturePane**(`name`, `lines?`): `Promise`\<`Result`\<`string`, `Error`\>\>

Defined in: [platform/agents/tmux.ts:156](https://github.com/juli-os/agents/blob/main/src/platform/agents/tmux.ts#L156)

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

Defined in: [platform/agents/tmux.ts:125](https://github.com/juli-os/agents/blob/main/src/platform/agents/tmux.ts#L125)

会话 pane 的前台进程名（probePane 的 shell/agent 判定数据源）。
失败回空串——probe 对空 cmd 按 shell 处理（容错语义的一部分）。

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

Defined in: [platform/agents/tmux.ts:120](https://github.com/juli-os/agents/blob/main/src/platform/agents/tmux.ts#L120)

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

Defined in: [platform/agents/tmux.ts:158](https://github.com/juli-os/agents/blob/main/src/platform/agents/tmux.ts#L158)

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

Defined in: [platform/agents/tmux.ts:157](https://github.com/juli-os/agents/blob/main/src/platform/agents/tmux.ts#L157)

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

Defined in: [platform/agents/tmux.ts:137](https://github.com/juli-os/agents/blob/main/src/platform/agents/tmux.ts#L137)

全部会话名。任何失败（含 tmux 不在）都归一为空数组——签名无错误通道，
消费方（snapshot）以 stale 快照兜底、零会话与故障同形即可；要区分
「无 server」与真错误用 listSessionsDetailed。

#### Returns

`Promise`\<readonly `string`[]\>

#### Inherited from

[`TmuxClient`](TmuxClient.md).[`listSessions`](TmuxClient.md#listsessions)

***

### listSessionsDetailed()

> **listSessionsDetailed**(): `Promise`\<`Result`\<readonly [`TmuxSessionInfo`](TmuxSessionInfo.md)[], `Error`\>\>

Defined in: [platform/agents/tmux.ts:141](https://github.com/juli-os/agents/blob/main/src/platform/agents/tmux.ts#L141)

单条 list-sessions 批量取会话元数据（列表面 N+1 消除）：
`#{session_name}\t#{session_attached}\t#{pane_current_path}\t#{pane_current_command}`。
无活动 server（零会话）= 正常空态，返回空数组而非错误。

#### Returns

`Promise`\<`Result`\<readonly [`TmuxSessionInfo`](TmuxSessionInfo.md)[], `Error`\>\>

#### Inherited from

[`TmuxClient`](TmuxClient.md).[`listSessionsDetailed`](TmuxClient.md#listsessionsdetailed)

***

### newSession()

> **newSession**(`name`, `cwd?`): `Promise`\<`Result`\<`void`, `Error`\>\>

Defined in: [platform/agents/tmux.ts:142](https://github.com/juli-os/agents/blob/main/src/platform/agents/tmux.ts#L142)

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

Defined in: [platform/agents/herdr.ts:179](https://github.com/juli-os/agents/blob/main/src/platform/agents/herdr.ts#L179)

会话 pane 的 herdr 公共 id（`wB:p2` 形态）——单 pane attach（`agent
attach <pane-id>`）的入参。解析失败回空串（调用方决定兜底语义）。

#### Parameters

##### session

`string`

#### Returns

`Promise`\<`string`\>

***

### panePathOf()

> **panePathOf**(`name`): `Promise`\<`string`\>

Defined in: [platform/agents/tmux.ts:127](https://github.com/juli-os/agents/blob/main/src/platform/agents/tmux.ts#L127)

会话 pane 的 cwd（快照/恢复用）。失败回空串。

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

Defined in: [platform/agents/tmux.ts:122](https://github.com/juli-os/agents/blob/main/src/platform/agents/tmux.ts#L122)

发单键（对话框导航/接受用；多键文本走 sendText）。

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

Defined in: [platform/agents/tmux.ts:146](https://github.com/juli-os/agents/blob/main/src/platform/agents/tmux.ts#L146)

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

#### Inherited from

[`TmuxClient`](TmuxClient.md).[`sendText`](TmuxClient.md#sendtext)

***

### sendTextConfirmed()

> **sendTextConfirmed**(`name`, `text`): `Promise`\<`Result`\<[`SubmitStats`](SubmitStats.md), `Error`\>\>

Defined in: [platform/agents/tmux.ts:149](https://github.com/juli-os/agents/blob/main/src/platform/agents/tmux.ts#L149)

确认式发送：paste + Enter 后轮询验证输入框已重置；Enter 被吞只补 Enter
（不重发文本），~20s 内确认或显性失败（guard=submit_unconfirmed）。

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

Defined in: [platform/agents/tmux.ts:155](https://github.com/juli-os/agents/blob/main/src/platform/agents/tmux.ts#L155)

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

#### Inherited from

[`TmuxClient`](TmuxClient.md).[`sendTextQueued`](TmuxClient.md#sendtextqueued)

***

### sessionBirthsOf()

> **sessionBirthsOf**(): `Promise`\<`ReadonlyMap`\<`string`, `number`\>\>

Defined in: [platform/agents/tmux.ts:130](https://github.com/juli-os/agents/blob/main/src/platform/agents/tmux.ts#L130)

会话名 → 出生点（epoch ms）。无 server/后端无此概念/失败 = 空表——
调用方（transcript 人机混仓门控）空表即保守回落不门控。

#### Returns

`Promise`\<`ReadonlyMap`\<`string`, `number`\>\>

#### Inherited from

[`TmuxClient`](TmuxClient.md).[`sessionBirthsOf`](TmuxClient.md#sessionbirthsof)

***

### setEnv()

> **setEnv**(`vars`): `Promise`\<`Result`\<`void`, `Error`\>\>

Defined in: [platform/agents/tmux.ts:133](https://github.com/juli-os/agents/blob/main/src/platform/agents/tmux.ts#L133)

会话环境注入（AI 段密钥等）：tmux=set-environment -g 逐项；herdr=
新建 workspace 的 tab env 注入面。已在跑会话不受影响（两侧同语义）。

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

Defined in: [platform/agents/herdr.ts:176](https://github.com/juli-os/agents/blob/main/src/platform/agents/herdr.ts#L176)

herdr 原生托管 agent 启动（`herdr agent start` 的 socket 形态，0.9.5+）：
在会话 pane 里以 herdr 管理生命周期的方式拉起一个交互 agent（如
kind='zcode'）。与 sendText 手敲命令的差别：herdr 侧登记 managed
agent（名字/种类/状态机/恢复语义），`herdr agent list/get/wait` 全链
可观测——「herdr 启动 pi agent」的同款路径。要求 pane 是裸 shell
（本 client 的 newSession 产物正是），已在跑 agent 的 pane 会得到
herdr 侧 target_busy 报错。

#### Parameters

##### session

`string`

##### opts

[`HerdrManagedAgentStart`](HerdrManagedAgentStart.md)

#### Returns

`Promise`\<`Result`\<[`HerdrAgentInfo`](HerdrAgentInfo.md), `Error`\>\>
