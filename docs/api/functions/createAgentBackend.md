[**@juli-os/agents**](../index.md)

***

[@juli-os/agents](../index.md) / createAgentBackend

# Function: createAgentBackend()

> **createAgentBackend**(`opts?`): [`AgentBackend`](../interfaces/AgentBackend.md)

Defined in: [src/index.ts:35](https://github.com/juli-os/agents/blob/main/src/index.ts#L35)

终端后端工厂（tmux|herdr，实现在 @juli-os/baton）——同签名同行为：包装层
把本包的 defaultHookSpecs 注入 baton 的 hookSpecs 参数（六事件表只此一处）。

## Parameters

### opts?

[`AgentBackendOpts`](../interfaces/AgentBackendOpts.md) = `{}`

## Returns

[`AgentBackend`](../interfaces/AgentBackend.md)
