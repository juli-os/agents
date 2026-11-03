[**@juli-os/agents**](../index.md)

***

[@juli-os/agents](../index.md) / SnapshotDeps

# Interface: SnapshotDeps

Defined in: [platform/agents/snapshot.ts:23](https://github.com/juli-os/agents/blob/main/src/platform/agents/snapshot.ts#L23)

## Properties

### clock?

> `readonly` `optional` **clock?**: () => `Date`

Defined in: [platform/agents/snapshot.ts:26](https://github.com/juli-os/agents/blob/main/src/platform/agents/snapshot.ts#L26)

#### Returns

`Date`

***

### file

> `readonly` **file**: `string`

Defined in: [platform/agents/snapshot.ts:25](https://github.com/juli-os/agents/blob/main/src/platform/agents/snapshot.ts#L25)

***

### log?

> `readonly` `optional` **log?**: (`m`) => `void`

Defined in: [platform/agents/snapshot.ts:27](https://github.com/juli-os/agents/blob/main/src/platform/agents/snapshot.ts#L27)

#### Parameters

##### m

`string`

#### Returns

`void`

***

### tmux

> `readonly` **tmux**: [`TmuxClient`](TmuxClient.md)

Defined in: [platform/agents/snapshot.ts:24](https://github.com/juli-os/agents/blob/main/src/platform/agents/snapshot.ts#L24)
