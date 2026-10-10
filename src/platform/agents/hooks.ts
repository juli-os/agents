// Claude Code hooks injection (counterpart of Go internal/ai/agent/hook_config.go):
// idempotently inject five hooks into ~/.claude/settings.json; event commands
// carry the tmux session name — any hook event from a working agent counts as
// a zombie heartbeat ("any notification counts").
// Event surface: Stop=settlement, SessionStart/Permission/UserPromptSubmit=heartbeat/activity.

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { err, ok, type Result } from '../shared/result.ts';
import { TMUX_BIN } from './tmux.ts';

export interface HookSpec {
  /** CC hook event name (Stop / SessionStart / PermissionRequest / UserPromptSubmit / PostToolUse). */
  readonly event: string;
  /** Tool-name allowlist (regex include filter, the official mechanism):
   * omitted = everything. PostToolUse pins `^skill__` so only skill tool
   * calls get through — high-frequency tools (Bash/Read/Edit) are filtered
   * out at the CC layer and the hook command costs nothing (2026-10-02 skill
   * tracing; binary inspection confirmed the skill tool name is the
   * `skill__<name>` prefix). */
  readonly matcher?: string;
  /** Full command line (usually = `node <dist>/cli/hook.js <verb> "$(tmux ...)" ...`). */
  readonly command: string;
}

/** Hook-group structure of CC settings.json (type: "command" is the official field). */
interface HookGroup {
  readonly hooks?: readonly { readonly type?: string; readonly command?: string }[];
  readonly matcher?: string;
}

/** "Managed by this service" detection: identified by the JULI_* env prefix,
 * not by a path substring. The 0923 incident: cleanup only recognized the
 * 'juli-service' substring — commands injected cross-repo (a skill-dash
 * worktree's dist) did not contain it, so they were never cleaned and one
 * more copy was appended on every restart (duplicated ×2); the dead port
 * (7472) and dead path (src/cli/hook.js, the culprit behind loader:1386)
 * survived across restarts this way. JULI_SERVICE_URL=/JULI_PASSWORD= is the
 * common fingerprint of all juli-variant injectors and never appears in
 * user-owned hooks; the 'juli-service' substring stays as a fallback. */
const isJuliManaged = (command: string): boolean =>
  command.includes('JULI_SERVICE_URL=') || command.includes('JULI_PASSWORD=') || command.includes('juli-service');

/** Idempotent injection: first drop the old hooks managed by this service
 * (stale values are fine — the whole set is rewritten), then write the new
 * set; the user's other hooks are untouched. After a port/address change, a
 * restart rewrites the stale entries. */
export const installClaudeHooks = (
  claudeDir: string,
  specs: readonly HookSpec[],
  readFile = (p: string): string | null => {
    try {
      return readFileSync(p, 'utf8');
    } catch {
      return null;
    }
  },
): Result<void, Error> => {
  try {
    const path = join(claudeDir, 'settings.json');
    let settings: Record<string, unknown> = {};
    const raw = readFile(path);
    if (raw !== null) {
      settings = JSON.parse(raw) as Record<string, unknown>;
    }
    const hooksSection = (settings['hooks'] ?? {}) as Record<string, unknown>;

    // Clean old: drop whole groups containing juli-managed command entries (cross-repo variants / dead ports / dead paths all go).
    const cleaned: Record<string, unknown> = {};
    for (const [event, groups] of Object.entries(hooksSection)) {
      if (!Array.isArray(groups)) {
        cleaned[event] = groups;
        continue;
      }
      const kept = (groups as HookGroup[]).filter((g) =>
        !Array.isArray(g?.hooks) || !g.hooks.some((h) => isJuliManaged(h.command ?? '')),
      );
      if (kept.length > 0) cleaned[event] = kept;
    }

    // Inject new. The matcher is written into the group verbatim (omitting the key = CC's match-everything semantics).
    for (const spec of specs) {
      const groups = (cleaned[spec.event] as HookGroup[] | undefined) ?? [];
      const group: HookGroup = spec.matcher !== undefined && spec.matcher !== ''
        ? { matcher: spec.matcher, hooks: [{ type: 'command', command: spec.command }] }
        : { hooks: [{ type: 'command', command: spec.command }] };
      groups.push(group);
      cleaned[spec.event] = groups;
    }
    settings['hooks'] = cleaned;
    writeFileSync(path, `${JSON.stringify(settings, null, 2)}\n`, { mode: 0o600 });
    return ok(undefined);
  } catch (e) {
    return err(e instanceof Error ? e : new Error(String(e)));
  }
};

/** The standard five-hook command set (the tmux session name is embedded in
 * the command line — CC's stdin does not carry it). The server's /api/*
 * requires Bearer auth everywhere, while hook processes spawned by claude
 * lack the JULI_PASSWORD env — the password must be embedded in the command
 * line, or Stop settlement 401s forever. */
export const defaultHookSpecs = (hookJsPath: string, password = '', serviceUrl = ''): readonly HookSpec[] => {
  // The tmux binary in the session-name subcommand is resolved at startup
  // from the same source as the engine (same sealing as the 2026-10-08
  // broken-GUI-PATH incident): hooks normally run inside the session's login
  // shell (profile already fixes PATH) so a bare name would work, but once
  // default-command is customized or the hook's spawn context changes, Stop
  // settlement and all five hooks die — pinned to an absolute path, it no
  // longer depends on the PATH of whatever spawned it.
  const session = `"$(${TMUX_BIN} display-message -p '#{session_name}')"`;
  const envPrefix = password !== '' ? `JULI_PASSWORD=${JSON.stringify(password)} ` : '';
  const urlPrefix = serviceUrl !== '' ? `JULI_SERVICE_URL=${JSON.stringify(serviceUrl)} ` : '';
  const run = (verb: string, extra = ''): string =>
    `${urlPrefix}${envPrefix}node ${JSON.stringify(hookJsPath)} ${verb} ${session}${extra}`;
  return [
    { event: 'Stop', command: run('notify', ' done') },
    { event: 'SessionStart', command: run('claude-start') },
    // Event name aligned with the current CC version: 'Permission' is
    // deprecated (new sessions pop a "settings warning → Continue" recovery
    // menu and agents get stuck on it) — the legal event is PermissionRequest.
    { event: 'PermissionRequest', command: run('permission') },
    { event: 'UserPromptSubmit', command: run('capture') },
    // Notification (2026-09-28 question-card work order): CC self-reports
    // when it "needs permission / awaits input" — a structured CLI signal
    // beats regexing screen text off the pane (output text containing "Do
    // you want" misjudges). hook → noteAwaiting: zombie exemption (sticky,
    // cleared by any heartbeat) + notify a human.
    { event: 'Notification', command: run('awaiting') },
    // PostToolUse + matcher ^(Skill$|skill__) (skill tracing 2026-10-02;
    // matcher fixed 2026-10-04 in wf_d35bf3a1e198): as observed on CC,
    // tool_name="Skill" (skill name in tool_input.skill); the
    // agentskills.io spec's skill__<name> is kept for compatibility — both
    // formats reach the hook and parseSkillUsedStdin decides. High-frequency
    // tools are blocked at the CC layer by the matcher, keeping volume on
    // par with the existing hooks.
    { event: 'PostToolUse', matcher: '^(Skill$|skill__)', command: run('skill-used') },
  ];
};

/** Parse the server-side status semantics of the CC Stop hook: Go's "done"=normal; an empty value normalizes to done. */
export const normalizeStopStatus = (raw: string): string => (raw === '' ? 'done' : raw);
