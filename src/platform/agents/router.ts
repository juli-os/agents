// 会话路由器（复用优先）：模板/LLM 点名的会话若不存在，落回 default——
// 绝不因一次流水凭空造出新 agent（创建是显式动作：nodes claim 或人工建
// 会话）。名单取【同步快照】（execFileSync，resolve 低频、毫秒级，杜绝
// 异步刷新竞态——同步挡板看不到名单时原样放行，不误改道）。

import { execFileSync } from 'node:child_process';
import { TMUX_BIN } from './tmux.ts';

export interface SessionRouterDeps {
  /** 同步取活会话名单；异常按空名单处理。 */
  readonly listSync: () => readonly string[];
  /** 兜底会话（生产 = juli-reply）：点名不存在时的落点。空 = 不兜底。 */
  readonly defaultSession: string;
  /** 名单快照 TTL（毫秒）。 */
  readonly ttlMs?: number;
  readonly log?: (m: string) => void;
}

export interface SessionRouter {
  /** 别名解析：存在→原样（复用第一）；不存在→default。 */
  resolve(session: string): string;
  /** 真实活会话名单（triage 白名单/健康检查共用）。 */
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
        if (names.length > 0) cache = names; // 空名单（tmux 抖动）沿用上次
      } catch { /* 沿用上次 */ }
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
        deps.log?.(`路由复用: 会话 ${s} 不存在 → 落回 ${deps.defaultSession}（不新建 agent）`);
        return deps.defaultSession;
      }
      return s; // 名单未见（冷启动/全空）：放行，交由就绪派发兜底
    },
    available() {
      return snapshot();
    },
  };
};

/** 生产 listSync：tmux list-sessions（可选自定 socket）。 */
export const tmuxListSync = (socketPath?: string): readonly string[] => {
  const args = socketPath ? ['-S', socketPath, 'list-sessions', '-F', '#{session_name}']
    : ['list-sessions', '-F', '#{session_name}'];
  try {
    return execFileSync(TMUX_BIN, args, { encoding: 'utf8', timeout: 3000 })
      .split('\n').map((x) => x.trim()).filter(Boolean);
  } catch {
    return []; // 无 server / 无 tmux：空名单
  }
};
