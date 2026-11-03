[**@juli-os/agents**](../index.md)

***

[@juli-os/agents](../index.md) / PaneProbe

# Interface: PaneProbe

Defined in: [platform/agents/pane\_probe.ts:9](https://github.com/juli-os/agents/blob/main/src/platform/agents/pane_probe.ts#L9)

## Properties

### agent

> `readonly` **agent**: `string`

Defined in: [platform/agents/pane\_probe.ts:14](https://github.com/juli-os/agents/blob/main/src/platform/agents/pane_probe.ts#L14)

***

### agentAlive

> `readonly` **agentAlive**: `boolean`

Defined in: [platform/agents/pane\_probe.ts:13](https://github.com/juli-os/agents/blob/main/src/platform/agents/pane_probe.ts#L13)

***

### foregroundIsShell

> `readonly` **foregroundIsShell**: `boolean`

Defined in: [platform/agents/pane\_probe.ts:12](https://github.com/juli-os/agents/blob/main/src/platform/agents/pane_probe.ts#L12)

裸 shell 占着面板（agent 未启动或已退出）。

***

### liveSelection

> `readonly` **liveSelection**: `boolean`

Defined in: [platform/agents/pane\_probe.ts:18](https://github.com/juli-os/agents/blob/main/src/platform/agents/pane_probe.ts#L18)

任何带编号的选择项（权限菜单/模型选择器）——绝不盲点，需守护者评估。

***

### ready

> `readonly` **ready**: `boolean`

Defined in: [platform/agents/pane\_probe.ts:20](https://github.com/juli-os/agents/blob/main/src/platform/agents/pane_probe.ts#L20)

agent 活着且输入光标在最后一行——可以派任务。

***

### reason

> `readonly` **reason**: `string`

Defined in: [platform/agents/pane\_probe.ts:21](https://github.com/juli-os/agents/blob/main/src/platform/agents/pane_probe.ts#L21)

***

### session

> `readonly` **session**: `string`

Defined in: [platform/agents/pane\_probe.ts:10](https://github.com/juli-os/agents/blob/main/src/platform/agents/pane_probe.ts#L10)

***

### trustDialog

> `readonly` **trustDialog**: `boolean`

Defined in: [platform/agents/pane\_probe.ts:16](https://github.com/juli-os/agents/blob/main/src/platform/agents/pane_probe.ts#L16)

CC 的信任/引导对话框——可程序化安全接受。
