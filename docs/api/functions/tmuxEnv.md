[**@juli-os/agents**](../index.md)

***

[@juli-os/agents](../index.md) / tmuxEnv

# Function: tmuxEnv()

> **tmuxEnv**(): `ProcessEnv`

Defined in: [platform/agents/tmux.ts:48](https://github.com/juli-os/agents/blob/main/src/platform/agents/tmux.ts#L48)

tmux 子进程环境：强制声明一个 UTF-8 locale（2026-10-10 launchd 裸环境事故）。
tmux 在无任何 LANG/LC_* 的环境里进非 UTF-8 模式，`-F` 格式串里的字面 tab
会被渲染成下划线——listSessionsDetailed 的 tab 分隔整体失效，会话名变成
"name_0_cwd_cmd" 复合串（graph/DAG 节点翻倍、终端按错误名 attach 打不开）。
已声明的 locale 不覆盖（尊重显式配置）；tmux 只认字符串含 "UTF-8"，
C.UTF-8 在 macOS/Linux 都可用。

## Returns

`ProcessEnv`
