[**@juli-os/agents**](../index.md)

***

[@juli-os/agents](../index.md) / recoverFromSnapshot

# Function: recoverFromSnapshot()

> **recoverFromSnapshot**(`deps`): `Promise`\<`number`\>

Defined in: [platform/agents/snapshot.ts:98](https://github.com/juli-os/agents/blob/main/src/platform/agents/snapshot.ts#L98)

从快照恢复：会话不在 → 按快照重建（工作区 + agent 命令）；在但 agent 死 →
重发启动命令。返回恢复的会话数。

## Parameters

### deps

[`SnapshotDeps`](../interfaces/SnapshotDeps.md)

## Returns

`Promise`\<`number`\>
