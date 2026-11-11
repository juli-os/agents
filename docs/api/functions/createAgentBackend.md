[**@juli-os/agents**](../index.md)

***

[@juli-os/agents](../index.md) / createAgentBackend

# Function: createAgentBackend()

> **createAgentBackend**(`opts?`): `AgentBackend`

Defined in: [peel-l0-agents/src/index.ts:34](https://github.com/juli-os/agents/blob/main/src/index.ts#L34)

终端后端工厂（tmux|herdr，实现在 @juli-os/baton）——同签名同行为：包装层
把本包的 defaultHookSpecs 注入 baton 的 hookSpecs 参数（六事件表只此一处）。

## Parameters

### opts?

`AgentBackendOpts` = `{}`

## Returns

`AgentBackend`
