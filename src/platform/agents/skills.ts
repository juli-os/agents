// Skills (counterpart of Go internal/ai/agent/skills): markdown files +
// frontmatter. {{.Args}}/{{.ArgN}} template expansion; once activated, the
// skill acts as a reinforced prompt for the next input turn.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ok, toResult, type Result } from '../shared/result.ts';

export interface Skill {
  readonly name: string;
  readonly description: string;
  readonly prompt: string;
  readonly allowedTools: readonly string[];
}

/** Parse a skill markdown: YAML frontmatter (name/description/allowed-tools) + body. */
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

/** Load a directory: skip broken files. */
export const loadSkills = (dir: string): readonly Skill[] => {
  if (!existsSync(dir)) return [];
  const out: Skill[] = [];
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.md')).sort()) {
    try {
      const s = parseSkill(readFileSync(join(dir, f), 'utf8'));
      if (s) out.push(s);
    } catch { /* one broken file does not affect the rest */ }
  }
  return out;
};

/** Template expansion: {{.Args}} (all args joined) and {{.Arg0}}/{{.Arg1}}…. */
export const expandPrompt = (skill: Skill, args: readonly string[]): string =>
  skill.prompt
    .replace(/\{\{\.Args\}\}/g, args.join(' '))
    .replace(/\{\{\.Arg(\d+)\}\}/g, (_m, i: string) => args[Number(i)] ?? '');

export interface SkillRegistry {
  readonly all: readonly Skill[];
  find(name: string): Skill | null;
  activate(name: string, args: readonly string[]): Result<{ prompt: string; allowedTools: readonly string[] }, Error>;
  /** Take the activated state (one-shot semantics: invalidated right after injection into the next input turn). */
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
      if (!s) return { ok: false, error: new Error(`unknown skill "${name}" (available: ${skills.map((x) => x.name).join(', ') || 'none'})`) };
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
