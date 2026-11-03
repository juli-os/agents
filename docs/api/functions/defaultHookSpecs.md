[**@juli-os/agents**](../index.md)

***

[@juli-os/agents](../index.md) / defaultHookSpecs

# Function: defaultHookSpecs()

> **defaultHookSpecs**(`hookJsPath`, `password?`, `serviceUrl?`): readonly [`HookSpec`](../interfaces/HookSpec.md)[]

Defined in: [platform/agents/hooks.ts:94](https://github.com/juli-os/agents/blob/main/src/platform/agents/hooks.ts#L94)

标准六 hook 命令组（tmux 会话名内嵌进命令行——CC 的 stdin 里没有它）。
服务端 /api/* 全量 Bearer 认证，而 claude 派生的 hook 进程没有 JULI_PASSWORD
环境——密码必须内嵌进命令行，否则 Stop 结算永远 401。

## Parameters

### hookJsPath

`string`

### password?

`string` = `''`

### serviceUrl?

`string` = `''`

## Returns

readonly [`HookSpec`](../interfaces/HookSpec.md)[]
