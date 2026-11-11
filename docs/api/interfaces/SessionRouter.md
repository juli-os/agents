[**@juli-os/agents**](../index.md)

***

[@juli-os/agents](../index.md) / SessionRouter

# Interface: SessionRouter

Defined in: [peel-l0-agents/src/platform/agents/router.ts:17](https://github.com/juli-os/agents/blob/main/src/platform/agents/router.ts#L17)

## Methods

### available()

> **available**(): readonly `string`[]

Defined in: [peel-l0-agents/src/platform/agents/router.ts:21](https://github.com/juli-os/agents/blob/main/src/platform/agents/router.ts#L21)

真实活会话名单（triage 白名单/健康检查共用）。

#### Returns

readonly `string`[]

***

### resolve()

> **resolve**(`session`): `string`

Defined in: [peel-l0-agents/src/platform/agents/router.ts:19](https://github.com/juli-os/agents/blob/main/src/platform/agents/router.ts#L19)

别名解析：存在→原样（复用第一）；不存在→default。

#### Parameters

##### session

`string`

#### Returns

`string`
