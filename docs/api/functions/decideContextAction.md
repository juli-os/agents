[**@juli-os/agents**](../index.md)

***

[@juli-os/agents](../index.md) / decideContextAction

# Function: decideContextAction()

> **decideContextAction**(`prev`, `currentWf`, `lastInputTokens`, `threshold?`, `nowMs?`): [`ContextAction`](../type-aliases/ContextAction.md)

Defined in: [peel-l0-agents/src/platform/agents/contextGate.ts:41](https://github.com/juli-os/agents/blob/main/src/platform/agents/contextGate.ts#L41)

判定（纯函数）：
- 本单与该会话当前单不同（切换 workflow）→ clear；
- 同一单且 lastInputTokens ≥ 阈值 → compact（但上次 compact 后冷却窗内
  不重判——摄取滞后的 stale 膨胀值不触发二次压缩）；
- 其余 → null（不动）。
首见会话（prev=undefined）：无状态可比较 → null（宁可少 clear 一次，不
误清）。prev.wf=''（曾发生无单派发/热身，有状态可比）不算首见：进入
第一个 workflow 视为边界切换 → clear（context 只剩热身残渣，清场无害）。

## Parameters

### prev

[`ContextGateState`](../interfaces/ContextGateState.md) \| `undefined`

### currentWf

`string`

### lastInputTokens

`number`

### threshold?

`number` = `DEFAULT_COMPACT_THRESHOLD`

### nowMs?

`number`

## Returns

[`ContextAction`](../type-aliases/ContextAction.md)
