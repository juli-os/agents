[**@juli-os/agents**](../index.md)

***

[@juli-os/agents](../index.md) / attachTmuxPty

# Function: attachTmuxPty()

> **attachTmuxPty**(`tmux`, `session`, `opts?`, `onData?`): `Promise`\<`Result`\<[`PtySession`](../interfaces/PtySession.md), `Error`\>\>

Defined in: [platform/agents/pty.ts:86](https://github.com/juli-os/agents/blob/main/src/platform/agents/pty.ts#L86)

attach 一个 tmux 会话，返回 PTY 会话。

2026-09-20 agent-a 幽灵会话事故：此处曾「不存在则先建」——任意名字的
终端 attach（旧 run 的 @会话芯片、手输名）都会静默 new-session（无 cwd
→引擎进程 cwd），用户视角=凭空冒出陌生 Profile。创建是显式动作（与复用
优先路由同裁决）：不存在 → 明确报错；要重建立走 POST /api/sessions 或
引擎派发（绑定会话自带 cwd）。

## Parameters

### tmux

#### socketPath?

`string`

#### hasSession

(`name`) => `Promise`\<`boolean`\>

### session

`string`

### opts?

[`PtyOpts`](../interfaces/PtyOpts.md) = `{}`

### onData?

(`chunk`) => `void`

## Returns

`Promise`\<`Result`\<[`PtySession`](../interfaces/PtySession.md), `Error`\>\>
