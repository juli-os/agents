// Structured output from the CC transcript (equivalent of ReadStructuredOutput
// in PORTING#3). The Stop hook's stdin carries transcript_path — the final
// reply is extracted from the transcript's last assistant message; screen
// capture (capture-pane) is demoted to a fallback used only for zombie
// detection.

import { openSync, readSync, fstatSync, closeSync } from 'node:fs';

/** Tail-read window: the last assistant message is usually near the end of
 * the file; reading the whole file is both slow and pointless (transcripts
 * can reach several MB). The window is just a fast path — after heavy tool
 * turns (e.g. PPT generation) the tail may be nothing but tool records, in
 * which case extractFinalMessage falls back to its two-stage whole-file scan;
 * hence a 1MB window balances fast-path hit rate against single-read cost. */
const TAIL_BYTES = 1024 * 1024;

interface HookPayload {
  readonly transcript_path?: string;
  readonly session_id?: string;
  readonly stop_hook_active?: boolean;
}

/** Parse hook stdin JSON; empty/malformed input returns null (hook
 * compatibility surface: manual invocation or older CC carries no payload —
 * this must never block the agent). */
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

/** stdin contract for the skill-used verb (PostToolUse, matcher ^(Skill$|skill__)):
 * Format A (Claude Code as observed 2026-10-04): tool_name="Skill" (the tool
 * name), the skill name sits in the tool_input.skill parameter — the skill__
 * prefix 5895efd assumed is the agentskills.io generic spec format, not the
 * CC implementation, so a ^skill__ matcher never matched and counts stayed
 * at 0 (wf_d35bf3a1e198).
 * Format B (agentskills.io spec, kept for cross-agent compatibility):
 * tool_name=skill__<name>.
 * Malformed payloads (missing skill name / misconfigured matcher / bad
 * stdin / non-string) all return null = silently dropped; the hook never
 * blocks the agent. The return value is the report payload. */
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

/** Scan JSONL text backwards for the last assistant record with non-empty
 * text (shared by both the tail-window and whole-file stages). Returns null
 * when not found. */
const scanForFinalMessage = (text: string): string | null => {
  const lines = text.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]?.trim();
    if (line === undefined || line === '') continue;
    let obj: unknown;
    try {
      obj = JSON.parse(line);
    } catch {
      continue; // window-truncated first/half line
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

/** Extract the last assistant text message from the tail of a transcript
 * JSONL.
 * CC transcript lines look like {"type":"assistant","message":{role,content:[{type:"text",text}]}}; only non-empty text blocks count as the reply (tool_use/Thinking do not). Returns null when not found.
 *
 * Two-stage scan: ① tail window (TAIL_BYTES) fast path — the last reply is
 * usually right at the tail; ② fallback — after heavy tool turns (real
 * incident: a 4.5MB PPT-generation transcript) the tail window can be
 * entirely occupied by tool records with no text found, so the whole file is
 * scanned backwards once more. Reading the whole file into memory is
 * acceptable for transcripts of a few MB; IO failure likewise returns null
 * (hook compatibility surface: never block the agent because extraction
 * failed). */
export const extractFinalMessage = (transcriptPath: string): string | null => {
  try {
    const found = scanForFinalMessage(readTail(transcriptPath, TAIL_BYTES));
    if (found !== null) return found;
  } catch {
    return null; // file unreadable: skip stage two
  }
  try {
    // Stage-two fallback: passing MAX_SAFE_INTEGER to readTail reads the whole file (it mins size with maxBytes internally).
    return scanForFinalMessage(readTail(transcriptPath, Number.MAX_SAFE_INTEGER));
  } catch {
    return null;
  }
};
