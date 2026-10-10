// Session router (reuse-first): if a session named by the template/LLM does
// not exist, fall back to default — never conjure a new agent out of one
// pipeline flow (creation is an explicit act: a nodes claim or a manually
// created session). The name list comes from a synchronous snapshot
// (execFileSync; resolve is low-frequency and millisecond-scale, ruling out
// async refresh races — when the synchronous guard cannot see the list, it
// passes the name through unchanged instead of mis-diverting).

import { execFileSync } from 'node:child_process';
import { TMUX_BIN } from './tmux.ts';

export interface SessionRouterDeps {
  /** Synchronously fetch the live-session list; treat errors as an empty list. */
  readonly listSync: () => readonly string[];
  /** Fallback session (production = juli-reply): the resolved target when the named session is missing. Empty = no fallback. */
  readonly defaultSession: string;
  /** List snapshot TTL (milliseconds). */
  readonly ttlMs?: number;
  readonly log?: (m: string) => void;
}

export interface SessionRouter {
  /** Alias resolution: exists → unchanged (reuse first); missing → default. */
  resolve(session: string): string;
  /** Real live-session list (shared by the triage allowlist / health checks). */
  available(): readonly string[];
}

export const createSessionRouter = (deps: SessionRouterDeps): SessionRouter => {
  const ttl = deps.ttlMs ?? 15_000;
  let cache: readonly string[] = [];
  let cacheAt = 0;

  const snapshot = (): readonly string[] => {
    const now = Date.now();
    if (now - cacheAt > ttl) {
      cacheAt = now;
      try {
        const names = deps.listSync();
        if (names.length > 0) cache = names; // empty list (tmux hiccup) — keep the previous one
      } catch { /* keep the previous one */ }
    }
    return cache;
  };

  return {
    resolve(session) {
      const names = snapshot();
      const s = session.trim();
      if (s === '') return deps.defaultSession;
      if (names.includes(s)) return s;
      if (deps.defaultSession !== '' && names.includes(deps.defaultSession)) {
        deps.log?.(`Routing reuse: session ${s} does not exist → falling back to ${deps.defaultSession} (no new agent created)`);
        return deps.defaultSession;
      }
      return s; // not on the list (cold start / all empty): pass through; readiness dispatch is the fallback
    },
    available() {
      return snapshot();
    },
  };
};

/** Production listSync: tmux list-sessions (optional custom socket). */
export const tmuxListSync = (socketPath?: string): readonly string[] => {
  const args = socketPath ? ['-S', socketPath, 'list-sessions', '-F', '#{session_name}']
    : ['list-sessions', '-F', '#{session_name}'];
  try {
    return execFileSync(TMUX_BIN, args, { encoding: 'utf8', timeout: 3000 })
      .split('\n').map((x) => x.trim()).filter(Boolean);
  } catch {
    return []; // no server / no tmux: empty list
  }
};
