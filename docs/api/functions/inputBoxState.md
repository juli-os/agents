[**@juli-os/agents**](../index.md)

***

[@juli-os/agents](../index.md) / inputBoxState

# Function: inputBoxState()

> **inputBoxState**(`pane`, `tail`): `"cleared"` \| `"in-box"` \| `"absent"`

Defined in: [platform/agents/tmux.ts:94](https://github.com/juli-os/agents/blob/main/src/platform/agents/tmux.ts#L94)

输入框状态：tail 在底部输入框区（未提交）；tail 下方出现空的 ❯ 行（已提交，
输入框重置）；两者都不在 pane（已提交滚出视野，或粘贴丢失——由调用方结合
「曾见指纹」区分）。

## Parameters

### pane

`string`

### tail

`string`

## Returns

`"cleared"` \| `"in-box"` \| `"absent"`
