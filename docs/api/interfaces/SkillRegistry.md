[**@juli-os/agents**](../index.md)

***

[@juli-os/agents](../index.md) / SkillRegistry

# Interface: SkillRegistry

Defined in: [peel-l0-agents/src/platform/agents/skills.ts:55](https://github.com/juli-os/agents/blob/main/src/platform/agents/skills.ts#L55)

## Properties

### all

> `readonly` **all**: readonly [`Skill`](Skill.md)[]

Defined in: [peel-l0-agents/src/platform/agents/skills.ts:56](https://github.com/juli-os/agents/blob/main/src/platform/agents/skills.ts#L56)

## Methods

### activate()

> **activate**(`name`, `args`): `Result`\<\{ `allowedTools`: readonly `string`[]; `prompt`: `string`; \}, `Error`\>

Defined in: [peel-l0-agents/src/platform/agents/skills.ts:58](https://github.com/juli-os/agents/blob/main/src/platform/agents/skills.ts#L58)

#### Parameters

##### name

`string`

##### args

readonly `string`[]

#### Returns

`Result`\<\{ `allowedTools`: readonly `string`[]; `prompt`: `string`; \}, `Error`\>

***

### find()

> **find**(`name`): [`Skill`](Skill.md) \| `null`

Defined in: [peel-l0-agents/src/platform/agents/skills.ts:57](https://github.com/juli-os/agents/blob/main/src/platform/agents/skills.ts#L57)

#### Parameters

##### name

`string`

#### Returns

[`Skill`](Skill.md) \| `null`

***

### takeActive()

> **takeActive**(): \{ `allowedTools`: readonly `string`[]; `prompt`: `string`; \} \| `null`

Defined in: [peel-l0-agents/src/platform/agents/skills.ts:60](https://github.com/juli-os/agents/blob/main/src/platform/agents/skills.ts#L60)

取走激活态（单次语义：注入下一轮输入后即失效）。

#### Returns

\{ `allowedTools`: readonly `string`[]; `prompt`: `string`; \} \| `null`
