[**@juli-os/agents**](../index.md)

***

[@juli-os/agents](../index.md) / TerminalKey

# Type Alias: TerminalKey

> **TerminalKey** = `"Enter"` \| `"Down"` \| `"Up"` \| `"Left"` \| `"Right"` \| `"C-c"` \| `"C-z"` \| `"C-d"` \| `"Escape"` \| `"Tab"`

Defined in: [platform/agents/tmux.ts:112](https://github.com/juli-os/agents/blob/main/src/platform/agents/tmux.ts#L112)

终端按键的中性闭合集（sendKey 的入参）：tmux 侧原样进 send-keys，herdr
侧经 translateKey 翻译——新键必须两侧同补（编译期闭合，不走字符串）。
