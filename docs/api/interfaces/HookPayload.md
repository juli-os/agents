[**@juli-os/agents**](../index.md)

***

[@juli-os/agents](../index.md) / HookPayload

# Interface: HookPayload

Defined in: [platform/agents/orchestrator.ts:26](https://github.com/juli-os/agents/blob/main/src/platform/agents/orchestrator.ts#L26)

## Properties

### args?

> `readonly` `optional` **args?**: `JsonRecord`

Defined in: [platform/agents/orchestrator.ts:29](https://github.com/juli-os/agents/blob/main/src/platform/agents/orchestrator.ts#L29)

***

### block?

> `readonly` `optional` **block?**: `boolean`

Defined in: [platform/agents/orchestrator.ts:32](https://github.com/juli-os/agents/blob/main/src/platform/agents/orchestrator.ts#L32)

before_tool_call 返回 block=true 拦截该次调用（guardian 铁腕位）。

***

### blockReason?

> `readonly` `optional` **blockReason?**: `string`

Defined in: [platform/agents/orchestrator.ts:33](https://github.com/juli-os/agents/blob/main/src/platform/agents/orchestrator.ts#L33)

***

### modifiedResult?

> `readonly` `optional` **modifiedResult?**: `string`

Defined in: [platform/agents/orchestrator.ts:35](https://github.com/juli-os/agents/blob/main/src/platform/agents/orchestrator.ts#L35)

after_tool_call 返回 modifiedResult 替换工具输出。

***

### result?

> `readonly` `optional` **result?**: `string`

Defined in: [platform/agents/orchestrator.ts:30](https://github.com/juli-os/agents/blob/main/src/platform/agents/orchestrator.ts#L30)

***

### tool?

> `readonly` `optional` **tool?**: `string`

Defined in: [platform/agents/orchestrator.ts:28](https://github.com/juli-os/agents/blob/main/src/platform/agents/orchestrator.ts#L28)

***

### type

> `readonly` **type**: [`HookType`](../type-aliases/HookType.md)

Defined in: [platform/agents/orchestrator.ts:27](https://github.com/juli-os/agents/blob/main/src/platform/agents/orchestrator.ts#L27)
