[**@juli-os/agents**](../index.md)

***

[@juli-os/agents](../index.md) / parsePaneQuestion

# Function: parsePaneQuestion()

> **parsePaneQuestion**(`pane`, `fallbackMessage?`): [`PaneQuestion`](../interfaces/PaneQuestion.md)

Defined in: [platform/shared/paneFingerprint.ts:47](https://github.com/juli-os/agents/blob/main/src/platform/shared/paneFingerprint.ts#L47)

从 pane 文本解析「agent 的问题 + 选项」（问询闸门的内容源，2026-09-28）。
CC 权限/选择菜单 = 编号行（❯ 1. Yes / 2. No…）——选项 reply 用编号（菜单
键盘选择语义）；无菜单（开放提问）= 通用同意/拒绝 + 自定义兜底。

## Parameters

### pane

`string`

### fallbackMessage?

`string` = `''`

## Returns

[`PaneQuestion`](../interfaces/PaneQuestion.md)
