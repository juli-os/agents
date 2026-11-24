[**@juli-os/agents**](../index.md)

***

[@juli-os/agents](../index.md) / OrchestratorEvent

# Type Alias: OrchestratorEvent

> **OrchestratorEvent** = \{ `content`: `string`; `type`: `"text"`; \} \| \{ `content`: `string`; `type`: `"thinking"`; \} \| \{ `args`: `JsonRecord`; `tool`: `string`; `type`: `"tool_call"`; \} \| \{ `content`: `string`; `tool`: `string`; `type`: `"tool_result"`; \} \| \{ `aborted?`: `boolean`; `type`: `"done"`; \}

Defined in: [peel-l0-agents/src/platform/agents/orchestrator.ts:13](https://github.com/juli-os/agents/blob/main/src/platform/agents/orchestrator.ts#L13)
