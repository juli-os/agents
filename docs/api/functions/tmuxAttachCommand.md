[**@juli-os/agents**](../index.md)

***

[@juli-os/agents](../index.md) / tmuxAttachCommand

# Function: tmuxAttachCommand()

> **tmuxAttachCommand**(`socketPath`, `session`, `bin?`): readonly `string`[]

Defined in: [platform/agents/pty.ts:73](https://github.com/juli-os/agents/blob/main/src/platform/agents/pty.ts#L73)

attach 命令拼装（纯函数可测）：专属 socket（tmux_socket_path）必须随行——
引擎 server 与 default socket 分家后，裸 `tmux attach` 会 attach 到错误的
server（2026-09-28 专属 socket 切换配套）。首元素必须是 tmux 二进制——
0216446 曾漏掉它（sh -c exec 'attach' → not found → pty 秒退 → xterm
attach 全灭），2026-09-29 e2e 实证修复。二进制默认走 TMUX_BIN 解析
（2026-10-08 GUI 残缺 PATH 兜底：sh -c exec 同样按 PATH 找 tmux）。

## Parameters

### socketPath

`string` \| `undefined`

### session

`string`

### bin?

`string` = `TMUX_BIN`

## Returns

readonly `string`[]
