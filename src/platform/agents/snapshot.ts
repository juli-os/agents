// Session snapshot/restore (counterpart of Go cmd/gui/snapshot.go):
// periodically capture the tmux session list (name/workspace/command) and
// merge it with the previous snapshot — an agent may be dead but its identity
// is retained, and a vanished session keeps its last-known state until it is
// rebuilt from the snapshot on restore. Atomic writes; the restore surface
// serves SnapshotHealer.

import { readFileSync, writeFileSync, existsSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { ok, type Result } from '../shared/result.ts';
import type { TmuxClient } from './tmux.ts';

export interface SessionSnapshot {
  readonly name: string;
  readonly workDir: string;
  readonly command: string;
  readonly activeAt: string;
  /** This session had an agent in the previous snapshot (identity retained after death for restore). */
  readonly hadAgent: boolean;
}

export interface Snapshot {
  readonly snapshotAt: string;
  readonly sessions: readonly SessionSnapshot[];
}

export interface SnapshotDeps {
  readonly tmux: TmuxClient;
  readonly file: string; // dataDir/sessions_snapshot.json
  readonly clock?: () => Date;
  readonly log?: (m: string) => void;
}

const AGENT_HINTS = ['claude', 'codex', 'copilot', 'aider'];

const hadAgentOf = (command: string): boolean =>
  AGENT_HINTS.some((h) => command.toLowerCase().includes(h));

export const loadSnapshot = (file: string): Snapshot | null => {
  try {
    if (!existsSync(file)) return null;
    const v = JSON.parse(readFileSync(file, 'utf8')) as Partial<Snapshot>;
    if (!Array.isArray(v.sessions)) return null;
    return { snapshotAt: v.snapshotAt ?? '', sessions: v.sessions as Snapshot['sessions'] };
  } catch {
    return null;
  }
};

const saveSnapshot = (file: string, snap: Snapshot): Result<void, Error> => {
  try {
    // Atomic write: temp file + rename (the snapshot is the sole basis for recovery; it must never be half-written).
    const tmp = `${file}.tmp`;
    writeFileSync(tmp, JSON.stringify(snap, null, 2), { mode: 0o600 });
    renameSync(tmp, file);
    return ok(undefined);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e : new Error(String(e)) };
  }
};

/** Capture and merge: on tmux failure keep the previous (stale) snapshot — recovery data must never be wiped. */
export const takeSnapshot = async (deps: SnapshotDeps): Promise<Result<Snapshot, Error>> => {
  const now = (deps.clock ?? (() => new Date()))();
  const prev = loadSnapshot(deps.file);
  const prevByName = new Map<string, SessionSnapshot>(
    (prev?.sessions ?? []).map((s) => [s.name, s]),
  );
  const listed = await deps.tmux.listSessions();
  const sessions: SessionSnapshot[] = [];
  const seen = new Set<string>();
  for (const name of listed) {
    seen.add(name);
    const workDir = await paneWorkDir(deps.tmux, name);
    const cmd = await paneCommand(deps.tmux, name);
    const prevS = prevByName.get(name);
    const agentNow = hadAgentOf(cmd);
    sessions.push({
      name,
      workDir,
      command: !agentNow && prevS?.hadAgent ? prevS.command : cmd,
      activeAt: now.toISOString(),
      hadAgent: agentNow || (prevS?.hadAgent ?? false),
    });
  }
  // Vanished sessions (server crash/restart) also keep their last-known state until tmux comes back.
  for (const [name, p] of prevByName) {
    if (!seen.has(name)) sessions.push(p);
  }
  const snap: Snapshot = { snapshotAt: now.toISOString(), sessions };
  const saved = saveSnapshot(deps.file, snap);
  if (!saved.ok) deps.log?.(`[snapshot] save failed: ${saved.error.message}`);
  return ok(snap);
};

const paneWorkDir = async (tmux: TmuxClient, session: string): Promise<string> => {
  const res = await tmux.exec(['display-message', '-p', '-t', session, '#{pane_current_path}']);
  return res.ok ? res.value.trim() : '';
};
const paneCommand = async (tmux: TmuxClient, session: string): Promise<string> => {
  const res = await tmux.exec(['display-message', '-p', '-t', session, '#{pane_current_command}']);
  return res.ok ? res.value.trim() : '';
};

/** Restore from snapshot: session missing → rebuild from the snapshot
 * (workspace + agent command); present but agent dead → re-send the start
 * command. Returns the number of restored sessions. */
export const recoverFromSnapshot = async (deps: SnapshotDeps): Promise<number> => {
  const snap = loadSnapshot(deps.file);
  if (!snap) return 0;
  let recovered = 0;
  for (const ss of snap.sessions) {
    const alive = await deps.tmux.hasSession(ss.name);
    if (alive) continue;
    if (ss.workDir === '' && ss.command === '') continue;
    const created = await deps.tmux.newSession(ss.name, ss.workDir || undefined);
    if (!created.ok) {
      deps.log?.(`[snapshot] failed to restore ${ss.name}: ${created.error.message}`);
      continue;
    }
    if (ss.hadAgent && ss.command !== '' && !ss.command.includes('zsh')) {
      // Agent identity retained: re-send its start command (claude/codex CLIs resume their sessions natively).
      await deps.tmux.sendText(ss.name, ss.command);
    }
    recovered++;
    deps.log?.(`[snapshot] restored session ${ss.name}`);
  }
  return recovered;
};

/** Periodic snapshot loop (aligned with Go StartSnapshotLoop). */
export const startSnapshotLoop = (deps: SnapshotDeps, intervalMs = 60_000): (() => void) => {
  let stopped = false;
  const tick = (): void => {
    if (stopped) return;
    void takeSnapshot(deps).catch(() => undefined);
  };
  tick();
  const timer = setInterval(tick, intervalMs);
  return () => {
    stopped = true;
    clearInterval(timer);
  };
};

