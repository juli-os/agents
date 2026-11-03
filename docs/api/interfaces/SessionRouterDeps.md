[**@juli-os/agents**](../index.md)

***

[@juli-os/agents](../index.md) / SessionRouterDeps

# Interface: SessionRouterDeps

Defined in: [platform/agents/router.ts:9](https://github.com/juli-os/agents/blob/main/src/platform/agents/router.ts#L9)

## Properties

### defaultSession

> `readonly` **defaultSession**: `string`

Defined in: [platform/agents/router.ts:13](https://github.com/juli-os/agents/blob/main/src/platform/agents/router.ts#L13)

兜底会话（生产 = juli-reply）：点名不存在时的落点。空 = 不兜底。

***

### listSync

> `readonly` **listSync**: () => readonly `string`[]

Defined in: [platform/agents/router.ts:11](https://github.com/juli-os/agents/blob/main/src/platform/agents/router.ts#L11)

同步取活会话名单；异常按空名单处理。

#### Returns

readonly `string`[]

***

### log?

> `readonly` `optional` **log?**: (`m`) => `void`

Defined in: [platform/agents/router.ts:16](https://github.com/juli-os/agents/blob/main/src/platform/agents/router.ts#L16)

#### Parameters

##### m

`string`

#### Returns

`void`

***

### ttlMs?

> `readonly` `optional` **ttlMs?**: `number`

Defined in: [platform/agents/router.ts:15](https://github.com/juli-os/agents/blob/main/src/platform/agents/router.ts#L15)

名单快照 TTL（毫秒）。
