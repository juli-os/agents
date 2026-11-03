[**@juli-os/agents**](../index.md)

***

[@juli-os/agents](../index.md) / takeSnapshot

# Function: takeSnapshot()

> **takeSnapshot**(`deps`): `Promise`\<`Result`\<[`Snapshot`](../interfaces/Snapshot.md), `Error`\>\>

Defined in: [platform/agents/snapshot.ts:59](https://github.com/juli-os/agents/blob/main/src/platform/agents/snapshot.ts#L59)

抓取并合并：tmux 失败时保留上一份（stale）——恢复数据绝不能被清空。

## Parameters

### deps

[`SnapshotDeps`](../interfaces/SnapshotDeps.md)

## Returns

`Promise`\<`Result`\<[`Snapshot`](../interfaces/Snapshot.md), `Error`\>\>
