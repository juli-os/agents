// 会话快照/恢复（对应 Go cmd/gui/snapshot.go）：周期抓取 tmux 会话清单
// （名字/工作区/命令），与上一份快照合并——agent 已死但身份保留、会话消失
// 也保留最后已知态，恢复时按快照重建。原子写；恢复面供 SnapshotHealer。

import { readFileSync, writeFileSync, existsSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { ok, type Result } from '../shared/result.ts';
import type { TmuxClient } from './tmux.ts';

export interface SessionSnapshot {
  readonly name: string;
  readonly workDir: string;
  readonly command: string;
  readonly activeAt: string;
  /** 上一份快照里该会话曾有 agent（死后保留身份供恢复）。 */
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
    // 原子写：临时文件 + rename（快照是恢复的唯一依据，绝不能写一半）。
    const tmp = `${file}.tmp`;
    writeFileSync(tmp, JSON.stringify(snap, null, 2), { mode: 0o600 });
    renameSync(tmp, file);
    return ok(undefined);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e : new Error(String(e)) };
  }
};

/** 抓取并合并：tmux 失败时保留上一份（stale）——恢复数据绝不能被清空。 */
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
  // 会话消失（server 崩溃/重启）也保留最后已知态，直到 tmux 回来。
  for (const [name, p] of prevByName) {
    if (!seen.has(name)) sessions.push(p);
  }
  const snap: Snapshot = { snapshotAt: now.toISOString(), sessions };
  const saved = saveSnapshot(deps.file, snap);
  if (!saved.ok) deps.log?.(`[snapshot] 保存失败: ${saved.error.message}`);
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

/** 从快照恢复：会话不在 → 按快照重建（工作区 + agent 命令）；在但 agent 死 →
 * 重发启动命令。返回恢复的会话数。 */
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
      deps.log?.(`[snapshot] 恢复 ${ss.name} 失败: ${created.error.message}`);
      continue;
    }
    if (ss.hadAgent && ss.command !== '' && !ss.command.includes('zsh')) {
      // agent 身份保留：重启其启动命令（claude/codex CLI 自带会话续接）。
      await deps.tmux.sendText(ss.name, ss.command);
    }
    recovered++;
    deps.log?.(`[snapshot] 已恢复会话 ${ss.name}`);
  }
  return recovered;
};

/** 周期快照循环（对齐 Go StartSnapshotLoop）。 */
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

