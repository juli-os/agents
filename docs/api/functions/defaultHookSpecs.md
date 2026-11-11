[**@juli-os/agents**](../index.md)

***

[@juli-os/agents](../index.md) / defaultHookSpecs

# Function: defaultHookSpecs()

> **defaultHookSpecs**(`hookJsPath`, `password?`, `serviceUrl?`, `sessionExpr?`): readonly [`HookSpec`](../interfaces/HookSpec.md)[]

Defined in: [peel-l0-agents/src/platform/agents/hooks.ts:101](https://github.com/juli-os/agents/blob/main/src/platform/agents/hooks.ts#L101)

标准六 hook 命令组（tmux 会话名内嵌进命令行——CC 的 stdin 里没有它）。
服务端 /api/* 全量 Bearer 认证，而 claude 派生的 hook 进程没有 JULI_PASSWORD
环境——密码必须内嵌进命令行，否则 Stop 结算永远 401。
sessionExpr = hook 进程内解析「我在哪个会话」的 shell 表达式——随终端
后端变化（tmux=display-message 运行时反查；herdr=JULI_HERDR_SESSION env，
见 herdr.ts 的 herdrHookSpecs），六事件表只此一处（2026-11-04 R1 评审 #7）。

## Parameters

### hookJsPath

`string`

### password?

`string` = `''`

### serviceUrl?

`string` = `''`

### sessionExpr?

`string` = `...`

## Returns

readonly [`HookSpec`](../interfaces/HookSpec.md)[]
