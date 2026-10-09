// CC transcript 结构化输出（PORTING#3 的 ReadStructuredOutput 等价物）。
// Stop hook 的 stdin 携带 transcript_path——最终答复从 transcript 的最后一条
// assistant 消息提取，屏幕抓取（capture-pane）降级为僵尸检测专用回退。

import { openSync, readSync, fstatSync, closeSync } from 'node:fs';

/** 尾部读取窗口：最后一条 assistant 消息【通常】在文件尾部附近；整文件
 * 读取既慢也无谓（transcript 可达数 MB）。窗口只是快路径——重工具轮次
 * （如 PPT 生成）尾部可能全是 tool 记录，此时走 extractFinalMessage 的
 * 二段式全文件兜底，因此窗口取 1MB 平衡快路径命中与单次读取开销。 */
const TAIL_BYTES = 1024 * 1024;

interface HookPayload {
  readonly transcript_path?: string;
  readonly session_id?: string;
  readonly stop_hook_active?: boolean;
}

/** 解析 hook stdin JSON；空/畸形输入返回 null（hook 兼容面：手动调用、
 * 旧版 CC 不带 payload，绝不能因此阻塞 agent）。 */
export const parseHookStdin = (raw: string): HookPayload | null => {
  const s = raw.trim();
  if (s === '') return null;
  try {
    const v = JSON.parse(s) as unknown;
    return v !== null && typeof v === 'object' ? (v as HookPayload) : null;
  } catch {
    return null;
  }
};

/** skill-used 动词的 stdin 契约（PostToolUse，matcher ^(Skill$|skill__)）：
 * 格式 A（Claude Code 实测 2026-10-04）：tool_name="Skill"（工具名），skill 名
 * 在 tool_input.skill 参数——5895efd 假设的 skill__ 前缀是 agentskills.io 通用
 * 规范格式而非 CC 实现，matcher ^skill__ 永不匹配导致频次恒 0（wf_d35bf3a1e198）。
 * 格式 B（agentskills.io 规范，跨 agent 兼容保留）：tool_name=skill__<name>。
 * 非法负载（无 skill 名/matcher 漏配/坏 stdin/非字符串）一律 null = 静默丢弃，
 * hook 永不阻塞 agent。返回值即上报负载。 */
export const parseSkillUsedStdin = (raw: string): { skill: string; tool_name: string } | null => {
  const payload = parseHookStdin(raw) as { tool_name?: string; tool_input?: { skill?: string } } | null;
  const tool = typeof payload?.tool_name === 'string' ? payload.tool_name : '';
  if (tool === 'Skill') {
    const sk = typeof payload?.tool_input?.skill === 'string' ? payload.tool_input.skill : '';
    return sk === '' ? null : { skill: sk, tool_name: tool };
  }
  if (tool.startsWith('skill__')) return { skill: tool.slice('skill__'.length), tool_name: tool };
  return null;
};

const readTail = (path: string, maxBytes: number): string => {
  const fd = openSync(path, 'r');
  try {
    const size = fstatSync(fd).size;
    const len = Math.min(size, maxBytes);
    const buf = Buffer.alloc(len);
    const read = readSync(fd, buf, 0, len, Math.max(0, size - len));
    return buf.subarray(0, read).toString('utf8');
  } finally {
    closeSync(fd);
  }
};

/** 在 JSONL 文本中反查最后一条带非空 text 的 assistant 记录（尾窗与全文件
 * 两段共用）。找不到返回 null。 */
const scanForFinalMessage = (text: string): string | null => {
  const lines = text.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]?.trim();
    if (line === undefined || line === '') continue;
    let obj: unknown;
    try {
      obj = JSON.parse(line);
    } catch {
      continue; // 窗口截断的首行/半行
    }
    if (obj === null || typeof obj !== 'object') continue;
    const rec = obj as { type?: unknown; message?: unknown };
    if (rec.type !== 'assistant') continue;
    const msg = rec.message;
    if (msg === null || typeof msg !== 'object') continue;
    const content = (msg as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;
    const texts: string[] = [];
    for (const block of content) {
      if (block !== null && typeof block === 'object' &&
        (block as { type?: unknown }).type === 'text') {
        const t = (block as { text?: unknown }).text;
        if (typeof t === 'string' && t.trim() !== '') texts.push(t);
      }
    }
    const joined = texts.join('\n\n').trim();
    if (joined !== '') return joined;
  }
  return null;
};

/** 从 transcript JSONL 尾部提取最后一条 assistant 文本消息。
 * CC transcript 行形如 {"type":"assistant","message":{role,content:[{type:"text",text}]}}；
 * 只有非空 text 块才算答复（tool_use/Thinking 不是）。找不到返回 null。
 *
 * 二段式扫描：① 尾窗（TAIL_BYTES）快路径——最后一条答复通常就在尾部；
 * ② 兜底——重工具轮次（真实事故：PPT 生成 transcript 4.5MB）尾窗可能
 * 整段被 tool 记录占据而扫不到文本，此时按整个文件再反查一次。全量读入
 * 内存对数 MB 级 transcript 可接受，IO 失败同样返回 null（hook 兼容面：
 * 绝不因提取失败阻塞 agent）。 */
export const extractFinalMessage = (transcriptPath: string): string | null => {
  try {
    const found = scanForFinalMessage(readTail(transcriptPath, TAIL_BYTES));
    if (found !== null) return found;
  } catch {
    return null; // 文件不可读：不做第二段
  }
  try {
    // 二段式兜底：readTail 传 MAX_SAFE_INTEGER 即整个文件（内部 min(size, maxBytes)）。
    return scanForFinalMessage(readTail(transcriptPath, Number.MAX_SAFE_INTEGER));
  } catch {
    return null;
  }
};
