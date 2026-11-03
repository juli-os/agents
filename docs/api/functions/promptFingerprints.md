[**@juli-os/agents**](../index.md)

***

[@juli-os/agents](../index.md) / promptFingerprints

# Function: promptFingerprints()

> **promptFingerprints**(`text`): `object`

Defined in: [platform/agents/tmux.ts:83](https://github.com/juli-os/agents/blob/main/src/platform/agents/tmux.ts#L83)

prompt 指纹对：首/末非空行各取前 40 字符——输入框判定锚（框内可见的是末行，
提交后对话记录可见的是首行）。

## Parameters

### text

`string`

## Returns

`object`

### head

> `readonly` **head**: `string`

### tail

> `readonly` **tail**: `string`
