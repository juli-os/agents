[**@juli-os/agents**](../index.md)

***

[@juli-os/agents](../index.md) / resolveTmuxBin

# Function: resolveTmuxBin()

> **resolveTmuxBin**(`pathEnv?`, `exists?`): `string`

Defined in: [platform/agents/tmux.ts:28](https://github.com/juli-os/agents/blob/main/src/platform/agents/tmux.ts#L28)

tmux 二进制解析（2026-10-08 新机迁移 GUI 拉起引擎事故）：GUI 子进程默认
PATH 只有 /usr/bin:/bin:/usr/sbin:/sbin——homebrew 的 tmux 会 spawn ENOENT
（warmup 全失败、派发 2 秒 failed，服务本身正常=最迷惑的形态）。PATH 查得
到仍用 'tmux'（尊重自装覆盖）；查不到按常见安装位兜底成绝对路径。第二参
保留注入位（测试用，形态仍 (p:string)=>boolean）；默认实现自 X_OK 探测起，
语义=「存在且可执行」而非仅存在。

## Parameters

### pathEnv?

`string` \| `undefined` = `...`

### exists?

(`p`) => `boolean`

## Returns

`string`
