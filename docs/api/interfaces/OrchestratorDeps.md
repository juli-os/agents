[**@juli-os/agents**](../index.md)

***

[@juli-os/agents](../index.md) / OrchestratorDeps

# Interface: OrchestratorDeps

Defined in: [peel-l0-agents/src/platform/agents/orchestrator.ts:179](https://github.com/juli-os/agents/blob/main/src/platform/agents/orchestrator.ts#L179)

## Properties

### callTimeoutMs?

> `readonly` `optional` **callTimeoutMs?**: `number`

Defined in: [peel-l0-agents/src/platform/agents/orchestrator.ts:188](https://github.com/juli-os/agents/blob/main/src/platform/agents/orchestrator.ts#L188)

***

### clock?

> `readonly` `optional` **clock?**: `Clock`

Defined in: [peel-l0-agents/src/platform/agents/orchestrator.ts:187](https://github.com/juli-os/agents/blob/main/src/platform/agents/orchestrator.ts#L187)

***

### commands?

> `readonly` `optional` **commands?**: [`CommandRegistry`](CommandRegistry.md)

Defined in: [peel-l0-agents/src/platform/agents/orchestrator.ts:186](https://github.com/juli-os/agents/blob/main/src/platform/agents/orchestrator.ts#L186)

***

### hooks?

> `readonly` `optional` **hooks?**: [`HookManager`](HookManager.md)

Defined in: [peel-l0-agents/src/platform/agents/orchestrator.ts:185](https://github.com/juli-os/agents/blob/main/src/platform/agents/orchestrator.ts#L185)

***

### llm

> `readonly` **llm**: [`ChatLlmPort`](ChatLlmPort.md)

Defined in: [peel-l0-agents/src/platform/agents/orchestrator.ts:180](https://github.com/juli-os/agents/blob/main/src/platform/agents/orchestrator.ts#L180)

***

### log?

> `readonly` `optional` **log?**: (`m`) => `void`

Defined in: [peel-l0-agents/src/platform/agents/orchestrator.ts:189](https://github.com/juli-os/agents/blob/main/src/platform/agents/orchestrator.ts#L189)

#### Parameters

##### m

`string`

#### Returns

`void`

***

### maxContextMessages?

> `readonly` `optional` **maxContextMessages?**: `number`

Defined in: [peel-l0-agents/src/platform/agents/orchestrator.ts:184](https://github.com/juli-os/agents/blob/main/src/platform/agents/orchestrator.ts#L184)

***

### model

> `readonly` **model**: `string`

Defined in: [peel-l0-agents/src/platform/agents/orchestrator.ts:181](https://github.com/juli-os/agents/blob/main/src/platform/agents/orchestrator.ts#L181)

***

### skills?

> `readonly` `optional` **skills?**: [`SkillRegistry`](SkillRegistry.md)

Defined in: [peel-l0-agents/src/platform/agents/orchestrator.ts:193](https://github.com/juli-os/agents/blob/main/src/platform/agents/orchestrator.ts#L193)

技能注册表：/skill 激活，下一轮输入注入（单次语义）。

***

### systemPrompt

> `readonly` **systemPrompt**: `string`

Defined in: [peel-l0-agents/src/platform/agents/orchestrator.ts:183](https://github.com/juli-os/agents/blob/main/src/platform/agents/orchestrator.ts#L183)

***

### tools

> `readonly` **tools**: readonly [`Tool`](Tool.md)[]

Defined in: [peel-l0-agents/src/platform/agents/orchestrator.ts:182](https://github.com/juli-os/agents/blob/main/src/platform/agents/orchestrator.ts#L182)

***

### usage?

> `readonly` `optional` **usage?**: (`r`) => `void`

Defined in: [peel-l0-agents/src/platform/agents/orchestrator.ts:191](https://github.com/juli-os/agents/blob/main/src/platform/agents/orchestrator.ts#L191)

用量入账（每次 LLM 调用一条）。

#### Parameters

##### r

###### inputTokens?

`number`

###### model

`string`

###### note

`string`

###### outputTokens?

`number`

#### Returns

`void`
