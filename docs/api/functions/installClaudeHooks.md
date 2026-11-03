[**@juli-os/agents**](../index.md)

***

[@juli-os/agents](../index.md) / installClaudeHooks

# Function: installClaudeHooks()

> **installClaudeHooks**(`claudeDir`, `specs`, `readFile?`): `Result`\<`void`, `Error`\>

Defined in: [platform/agents/hooks.ts:41](https://github.com/juli-os/agents/blob/main/src/platform/agents/hooks.ts#L41)

幂等注入：先清掉本服务管理的旧 hook（值过期也无妨——整体重写），再写入
新集合；用户的其它 hook 不动。端口/地址变更后重启即重写陈旧条目。

## Parameters

### claudeDir

`string`

### specs

readonly [`HookSpec`](../interfaces/HookSpec.md)[]

### readFile?

(`p`) => `string` \| `null`

## Returns

`Result`\<`void`, `Error`\>
