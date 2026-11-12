[**@juli-os/agents**](../index.md)

***

[@juli-os/agents](../index.md) / HerdrManagedAgentStart

# Interface: HerdrManagedAgentStart

Defined in: [platform/agents/herdr.ts:190](https://github.com/juli-os/agents/blob/main/src/platform/agents/herdr.ts#L190)

agent.start 入参（herdr AgentStartParams 直译；name 规则=小写字母开头、
仅小写/数字/'-'/'_'、≤32 字符，kind 必须 herdr detect 名单内——两样都由
herdr 侧校验，这里不重复实现，错误原文透传可诊断）。

## Properties

### args?

> `readonly` `optional` **args?**: readonly `string`[]

Defined in: [platform/agents/herdr.ts:194](https://github.com/juli-os/agents/blob/main/src/platform/agents/herdr.ts#L194)

透传给 agent CLI 的参数（如 zcode 的 --cwd/--resume）。

***

### kind

> `readonly` **kind**: `string`

Defined in: [platform/agents/herdr.ts:192](https://github.com/juli-os/agents/blob/main/src/platform/agents/herdr.ts#L192)

***

### name

> `readonly` **name**: `string`

Defined in: [platform/agents/herdr.ts:191](https://github.com/juli-os/agents/blob/main/src/platform/agents/herdr.ts#L191)

***

### shellSettleMs?

> `readonly` `optional` **shellSettleMs?**: `number`

Defined in: [platform/agents/herdr.ts:200](https://github.com/juli-os/agents/blob/main/src/platform/agents/herdr.ts#L200)

pane shell 落回提示符的等待预算毫秒（新建 workspace 的 zsh 还在跑
启动文件时，herdr 侧 shell-idle 检查会先回 agent_pane_busy——本层按
此预算重试；缺省 15s）。

***

### timeoutMs?

> `readonly` `optional` **timeoutMs?**: `number`

Defined in: [platform/agents/herdr.ts:196](https://github.com/juli-os/agents/blob/main/src/platform/agents/herdr.ts#L196)

启动就绪等待预算毫秒（>3000 且 ≤300000，缺省 herdr 30s）。
