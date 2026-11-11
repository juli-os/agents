[**@juli-os/agents**](../index.md)

***

[@juli-os/agents](../index.md) / parseSkillUsedStdin

# Function: parseSkillUsedStdin()

> **parseSkillUsedStdin**(`raw`): \{ `skill`: `string`; `tool_name`: `string`; \} \| `null`

Defined in: [peel-l0-agents/src/platform/agents/transcript.ts:39](https://github.com/juli-os/agents/blob/main/src/platform/agents/transcript.ts#L39)

skill-used 动词的 stdin 契约（PostToolUse，matcher ^(Skill$|skill__)）：
格式 A（Claude Code 实测 2026-10-04）：tool_name="Skill"（工具名），skill 名
在 tool_input.skill 参数——5895efd 假设的 skill__ 前缀是 agentskills.io 通用
规范格式而非 CC 实现，matcher ^skill__ 永不匹配导致频次恒 0（wf_d35bf3a1e198）。
格式 B（agentskills.io 规范，跨 agent 兼容保留）：tool_name=skill__<name>。
非法负载（无 skill 名/matcher 漏配/坏 stdin/非字符串）一律 null = 静默丢弃，
hook 永不阻塞 agent。返回值即上报负载。

## Parameters

### raw

`string`

## Returns

\{ `skill`: `string`; `tool_name`: `string`; \} \| `null`
