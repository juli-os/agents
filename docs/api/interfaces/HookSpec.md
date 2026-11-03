[**@juli-os/agents**](../index.md)

***

[@juli-os/agents](../index.md) / HookSpec

# Interface: HookSpec

Defined in: [platform/agents/hooks.ts:12](https://github.com/juli-os/agents/blob/main/src/platform/agents/hooks.ts#L12)

## Properties

### command

> `readonly` **command**: `string`

Defined in: [platform/agents/hooks.ts:21](https://github.com/juli-os/agents/blob/main/src/platform/agents/hooks.ts#L21)

完整命令行（通常 = `node <dist>/cli/hook.js <verb> "$(tmux ...)" ...`）。

***

### event

> `readonly` **event**: `string`

Defined in: [platform/agents/hooks.ts:14](https://github.com/juli-os/agents/blob/main/src/platform/agents/hooks.ts#L14)

CC hook 事件名（Stop / SessionStart / PermissionRequest / UserPromptSubmit / Notification / PostToolUse）。

***

### matcher?

> `readonly` `optional` **matcher?**: `string`

Defined in: [platform/agents/hooks.ts:19](https://github.com/juli-os/agents/blob/main/src/platform/agents/hooks.ts#L19)

工具名白名单（正则 include 过滤，官方机制）：省略=全量。PostToolUse
钉 `^(Skill$|skill__)` 只放 skill 工具调用进来（CC 实测 tool_name=
"Skill"，`skill__<name>` 为规范兼容保留）——高频工具（Bash/Read/Edit）
在 CC 层即被筛掉，hook 命令零开销（2026-10-02 skill 追溯）。
