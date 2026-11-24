[**@juli-os/agents**](../index.md)

***

[@juli-os/agents](../index.md) / AcpDeps

# Interface: AcpDeps

Defined in: [peel-l0-agents/src/platform/agents/acp.ts:46](https://github.com/juli-os/agents/blob/main/src/platform/agents/acp.ts#L46)

## Properties

### apiKey

> `readonly` **apiKey**: `string`

Defined in: [peel-l0-agents/src/platform/agents/acp.ts:51](https://github.com/juli-os/agents/blob/main/src/platform/agents/acp.ts#L51)

子进程 env 注入（codex 的 GLM provider 读 GLM_API_KEY）。

***

### command

> `readonly` **command**: readonly `string`[]

Defined in: [peel-l0-agents/src/platform/agents/acp.ts:48](https://github.com/juli-os/agents/blob/main/src/platform/agents/acp.ts#L48)

启动命令（如 ["codex", "app-server"]）。

***

### env?

> `readonly` `optional` **env?**: `Readonly`\<`Record`\<`string`, `string` \| `undefined`\>\>

Defined in: [peel-l0-agents/src/platform/agents/acp.ts:54](https://github.com/juli-os/agents/blob/main/src/platform/agents/acp.ts#L54)

传 process.env 即可；undefined 值在启动前被剔除。

***

### log

> `readonly` **log**: (`msg`) => `void`

Defined in: [peel-l0-agents/src/platform/agents/acp.ts:52](https://github.com/juli-os/agents/blob/main/src/platform/agents/acp.ts#L52)

#### Parameters

##### msg

`string`

#### Returns

`void`

***

### model

> `readonly` **model**: `string`

Defined in: [peel-l0-agents/src/platform/agents/acp.ts:49](https://github.com/juli-os/agents/blob/main/src/platform/agents/acp.ts#L49)
