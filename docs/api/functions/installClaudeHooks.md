[**@juli-os/agents**](../index.md)

***

[@juli-os/agents](../index.md) / installClaudeHooks

# Function: installClaudeHooks()

> **installClaudeHooks**(`claudeDir`, `specs`, `readFile?`): `Result`\<`void`, `Error`\>

Defined in: [platform/agents/hooks.ts:45](https://github.com/juli-os/agents/blob/main/src/platform/agents/hooks.ts#L45)

幂等注入：先清掉本服务管理的旧 hook（值过期也无妨——整体重写），再写入
新集合；用户的其它 hook 不动。端口/地址变更后重启即重写陈旧条目。
边界（R2 复审 #5）：specs 的 password/serviceUrl 双空参时，产出命令不含
上述任何管理指纹——重复 install 不清旧会翻倍。引擎实调恒带 serviceUrl
（runtime 注入 URL 与密码），生产不可达；API 允许双空参是为手写 specs
的自由，调用方自负。

## Parameters

### claudeDir

`string`

### specs

readonly [`HookSpec`](../interfaces/HookSpec.md)[]

### readFile?

(`p`) => `string` \| `null`

## Returns

`Result`\<`void`, `Error`\>
