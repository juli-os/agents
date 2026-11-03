[**@juli-os/agents**](../index.md)

***

[@juli-os/agents](../index.md) / ContextGateState

# Interface: ContextGateState

Defined in: [platform/agents/contextGate.ts:12](https://github.com/juli-os/agents/blob/main/src/platform/agents/contextGate.ts#L12)

## Properties

### compactAt?

> `optional` **compactAt?**: `number`

Defined in: [platform/agents/contextGate.ts:20](https://github.com/juli-os/agents/blob/main/src/platform/agents/contextGate.ts#L20)

上次真实执行 /compact 的时刻（ms epoch，十四跑 R1 P2-4 冷却起点）。
latestInputTokens 靠 60s 摄取，滞后窗内连续派发会对同一膨胀 context
重复 /compact——冷却窗内不再重判 compact。

***

### lastInputTokens

> **lastInputTokens**: `number`

Defined in: [platform/agents/contextGate.ts:16](https://github.com/juli-os/agents/blob/main/src/platform/agents/contextGate.ts#L16)

该会话最近一次回合的 input tokens（≈当前 context 量级）。

***

### wf

> **wf**: `string`

Defined in: [platform/agents/contextGate.ts:14](https://github.com/juli-os/agents/blob/main/src/platform/agents/contextGate.ts#L14)

该会话当前 workflow id（空串=未知/无单）。
