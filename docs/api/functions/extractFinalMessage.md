[**@juli-os/agents**](../index.md)

***

[@juli-os/agents](../index.md) / extractFinalMessage

# Function: extractFinalMessage()

> **extractFinalMessage**(`transcriptPath`): `string` \| `null`

Defined in: [peel-l0-agents/src/platform/agents/transcript.ts:109](https://github.com/juli-os/agents/blob/main/src/platform/agents/transcript.ts#L109)

从 transcript JSONL 尾部提取最后一条 assistant 文本消息。
CC transcript 行形如 {"type":"assistant","message":{role,content:[{type:"text",text}]}}；
只有非空 text 块才算答复（tool_use/Thinking 不是）。找不到返回 null。

二段式扫描：① 尾窗（TAIL_BYTES）快路径——最后一条答复通常就在尾部；
② 兜底——重工具轮次（真实事故：PPT 生成 transcript 4.5MB）尾窗可能
整段被 tool 记录占据而扫不到文本，此时按整个文件再反查一次。全量读入
内存对数 MB 级 transcript 可接受，IO 失败同样返回 null（hook 兼容面：
绝不因提取失败阻塞 agent）。

## Parameters

### transcriptPath

`string`

## Returns

`string` \| `null`
