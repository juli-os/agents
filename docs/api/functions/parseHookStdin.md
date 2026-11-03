[**@juli-os/agents**](../index.md)

***

[@juli-os/agents](../index.md) / parseHookStdin

# Function: parseHookStdin()

> **parseHookStdin**(`raw`): `HookPayload` \| `null`

Defined in: [platform/agents/transcript.ts:21](https://github.com/juli-os/agents/blob/main/src/platform/agents/transcript.ts#L21)

解析 hook stdin JSON；空/畸形输入返回 null（hook 兼容面：手动调用、
旧版 CC 不带 payload，绝不能因此阻塞 agent）。

## Parameters

### raw

`string`

## Returns

`HookPayload` \| `null`
