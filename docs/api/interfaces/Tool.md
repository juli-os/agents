[**@juli-os/agents**](../index.md)

***

[@juli-os/agents](../index.md) / Tool

# Interface: Tool

Defined in: [platform/agents/tools.ts:41](https://github.com/juli-os/agents/blob/main/src/platform/agents/tools.ts#L41)

## Properties

### description

> `readonly` **description**: `string`

Defined in: [platform/agents/tools.ts:43](https://github.com/juli-os/agents/blob/main/src/platform/agents/tools.ts#L43)

***

### name

> `readonly` **name**: `string`

Defined in: [platform/agents/tools.ts:42](https://github.com/juli-os/agents/blob/main/src/platform/agents/tools.ts#L42)

***

### parameters

> `readonly` **parameters**: readonly [`ToolParam`](ToolParam.md)[]

Defined in: [platform/agents/tools.ts:44](https://github.com/juli-os/agents/blob/main/src/platform/agents/tools.ts#L44)

## Methods

### execute()

> **execute**(`args`): `Promise`\<`Result`\<`string`, `Error`\>\>

Defined in: [platform/agents/tools.ts:45](https://github.com/juli-os/agents/blob/main/src/platform/agents/tools.ts#L45)

#### Parameters

##### args

`Record`\<`string`, `unknown`\>

#### Returns

`Promise`\<`Result`\<`string`, `Error`\>\>
