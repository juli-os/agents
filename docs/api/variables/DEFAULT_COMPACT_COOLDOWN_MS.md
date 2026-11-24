[**@juli-os/agents**](../index.md)

***

[@juli-os/agents](../index.md) / DEFAULT\_COMPACT\_COOLDOWN\_MS

# Variable: DEFAULT\_COMPACT\_COOLDOWN\_MS

> `const` **DEFAULT\_COMPACT\_COOLDOWN\_MS**: `number`

Defined in: [peel-l0-agents/src/platform/agents/contextGate.ts:29](https://github.com/juli-os/agents/blob/main/src/platform/agents/contextGate.ts#L29)

compact 冷却窗（十四跑 R1 P2-4）：10 分钟。构成：compact 就绪轮询上限
120s + latestInputTokens 的 60s 摄取滞后 + compact 后真实回合计分钟级，
10 分钟稳超最坏滞后组合，又把重复压缩的误判上限压在 6 次/时。
