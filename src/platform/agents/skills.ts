// 技能（对应 Go internal/ai/agent/skills）：markdown 文件 + frontmatter。
// {{.Args}}/{{.ArgN}} 模板展开，激活后作为下一轮输入的强化提示词。

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ok, toResult, type Result } from '../shared/result.ts';

export interface Skill {
  readonly name: string;
  readonly description: string;
  readonly prompt: string;
  readonly allowedTools: readonly string[];
}

/** 解析一个 skill markdown：YAML 头（name/description/allowed-tools）+ 正文。 */
export const parseSkill = (raw: string): Skill | null => {
  const m = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(raw);
  if (!m) return null;
  const [, head, body] = m;
  const field = (k: string): string => {
    const fm = new RegExp(`^${k}:\\s*(.+)$`, 'm').exec(head ?? '');
    return fm?.[1]?.trim() ?? '';
  };
  const name = field('name');
  if (name === '') return null;
  const allowed = field('allowed-tools')
    .split(',').map((x) => x.trim()).filter(Boolean);
  return {
    name,
    description: field('description'),
    prompt: (body ?? '').trim(),
    allowedTools: allowed,
  };
};

/** 目录加载：坏文件跳过。 */
export const loadSkills = (dir: string): readonly Skill[] => {
  if (!existsSync(dir)) return [];
  const out: Skill[] = [];
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.md')).sort()) {
    try {
      const s = parseSkill(readFileSync(join(dir, f), 'utf8'));
      if (s) out.push(s);
    } catch { /* 单文件坏不影响其余 */ }
  }
  return out;
};

/** 模板展开：{{.Args}}（全参拼接）与 {{.Arg0}}/{{.Arg1}}…。 */
export const expandPrompt = (skill: Skill, args: readonly string[]): string =>
  skill.prompt
    .replace(/\{\{\.Args\}\}/g, args.join(' '))
    .replace(/\{\{\.Arg(\d+)\}\}/g, (_m, i: string) => args[Number(i)] ?? '');

export interface SkillRegistry {
  readonly all: readonly Skill[];
  find(name: string): Skill | null;
  activate(name: string, args: readonly string[]): Result<{ prompt: string; allowedTools: readonly string[] }, Error>;
  /** 取走激活态（单次语义：注入下一轮输入后即失效）。 */
  takeActive(): { prompt: string; allowedTools: readonly string[] } | null;
}

export const createSkillRegistry = (dir: string): SkillRegistry => {
  const skills = loadSkills(dir);
  let active: Skill | null = null;
  let activeArgs: readonly string[] = [];
  return {
    all: skills,
    find(name) { return skills.find((x) => x.name === name) ?? null; },
    activate(name, args) {
      const s = skills.find((x) => x.name === name);
      if (!s) return { ok: false, error: new Error(`unknown skill "${name}"（可用: ${skills.map((x) => x.name).join(', ') || '无'}）`) };
      active = s;
      activeArgs = args;
      return ok({ prompt: expandPrompt(s, args), allowedTools: s.allowedTools });
    },
    takeActive() {
      const r = active === null ? null : { prompt: expandPrompt(active, activeArgs), allowedTools: active.allowedTools };
      active = null;
      return r;
    },
  };
};
