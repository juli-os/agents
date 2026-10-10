// ACP synchronous executor (counterpart of Go internal/runtime/acp): stdio
// newline-delimited JSON-RPC to the codex app-server. Protocol-level
// completion signals replace screen capture:
//
//	initialize {clientInfo} → initialized (notification without an id)
//	thread/start {cwd, model?}  → result.thread.id
//	turn/start {threadId, input:[{type:"text",text}]} → turn/started →
//	    item/* (the agentMessage item is the final reply) → turn/completed {turn:{status}}
//	turn/interrupt {threadId, turnId?}
//
// Completion is protocol-level: dispatchSync blocks until turn/completed and
// the final message lands directly — no hook/capture round trip.

import { spawn, type ChildProcess } from 'node:child_process';
import { err, ok, toResult, type Result } from '../shared/result.ts';
import type { SyncDispatcherPort } from '../../contracts/ports.ts';

const rpcTimeoutMs = 30_000;
const turnTimeoutMs = 30 * 60_000;

interface Notification {
  readonly method: string;
  readonly params?: {
    readonly threadId?: string;
    readonly turn?: { readonly id?: string; readonly status?: string };
    readonly item?: { readonly type?: string; readonly text?: string };
    readonly error?: { readonly message?: string };
  };
}

interface Pending {
  resolve: (r: { result?: unknown; error?: { code: number; message: string } }) => void;
  timer: NodeJS.Timeout;
}

interface AcptThread {
  readonly threadId: string;
  readonly cwd: string;
  turnId: string;
  lastMessage: string;
  lastError: string;
  waiters: ((status: string) => void)[];
  /** Completion that arrives early (on stdio, a notification may beat
   * dispatchSync's waiter registration) — counterpart of Go's buffered
   * turnDone channel; drained before prompting. */
  pendingCompletion: string | null;
}

export interface AcpDeps {
  /** Launch command (e.g. ["codex", "app-server"]). */
  readonly command: readonly string[];
  readonly model: string;
  /** Subprocess env injection (codex's GLM provider reads GLM_API_KEY). */
  readonly apiKey: string;
  readonly log: (msg: string) => void;
  /** Just pass process.env; undefined values are stripped before launch. */
  readonly env?: Readonly<Record<string, string | undefined>>;
}

export interface AcpExecutor {
  readonly dispatchSync: SyncDispatcherPort['dispatchSync'];
  interrupt(session: string): Promise<Result<void, Error>>;
  alive(): boolean;
  stop(): void;
}

export const createAcpExecutor = (deps: AcpDeps): AcpExecutor => {
  let proc: ChildProcess | null = null;
  let nextId = 0;
  let initialized = false;
  const pending = new Map<number, Pending>();
  const threads = new Map<string, AcptThread>(); // session name → ACP thread

  const writeJson = (v: unknown): Promise<void> =>
    new Promise((resolve, reject) => {
      if (!proc?.stdin?.writable) {
        reject(new Error('acp: agent process not running'));
        return;
      }
      proc.stdin.write(`${JSON.stringify(v)}\n`, (e) => (e ? reject(e) : resolve()));
    });

  const call = async (method: string, params: unknown, timeoutMs: number): Promise<Result<unknown, Error>> => {
    const id = ++nextId;
    const res = await toResult(new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`acp: rpc timeout after ${timeoutMs}ms (id ${id})`));
      }, timeoutMs);
      pending.set(id, {
        resolve: (r) => {
          clearTimeout(timer);
          if (r.error) reject(new Error(`acp: rpc error ${r.error.code}: ${r.error.message}`));
          else resolve(r.result);
        },
        timer,
      });
      void writeJson({ id, method, params }).catch((e) => {
        clearTimeout(timer);
        pending.delete(id);
        reject(e);
      });
    }), `acp: ${method} failed`);
    if (!res.ok) return res;
    return ok(res.value);
  };

  const onNotify = (n: Notification): void => {
    const threadId = n.params?.threadId ?? '';
    const t = [...threads.values()].find((x) => x.threadId === threadId);
    switch (n.method) {
      case 'turn/started': {
        if (t) t.turnId = n.params?.turn?.id ?? '';
        break;
      }
      case 'turn/completed': {
        const status = n.params?.turn?.status ?? 'completed';
        if (t) {
          t.turnId = '';
          t.pendingCompletion = status;
          for (const w of t.waiters.splice(0)) w(status);
        }
        break;
      }
      case 'item/*': case 'item/agentMessage/delta': {
        // The agentMessage item's text is the final reply (Go setLastMessage semantics: overwrite).
        if (t && n.params?.item?.type === 'agentMessage' && typeof n.params.item.text === 'string') {
          t.lastMessage = n.params.item.text;
        }
        break;
      }
      case 'error': {
        if (t && n.params?.error?.message) t.lastError = n.params.error.message;
        break;
      }
      default:
        break;
    }
  };

  const kill = (): void => {
    try {
      proc?.kill('SIGKILL');
    } catch { /* already dead */ }
    proc = null;
    initialized = false;
  };

  const startChild = async (): Promise<Result<void, Error>> => {
    if (proc?.exitCode === null && proc?.stdin?.writable && initialized) return ok(undefined);
    kill();
    const env: Record<string, string> = Object.fromEntries(
      Object.entries(deps.env ?? {}).filter((entry): entry is [string, string] => entry[1] !== undefined),
    );
    if (deps.apiKey !== '' && env['GLM_API_KEY'] === undefined) {
      env['GLM_API_KEY'] = deps.apiKey; // codex's GLM provider reads this
    }
    proc = spawn(deps.command[0] ?? '', deps.command.slice(1), { env, stdio: ['pipe', 'pipe', 'pipe'] });
    // spawn itself failing (ENOENT etc.) fires an 'error' event: without a handler the whole process crashes.
    proc.on('error', (e) => {
      for (const p of pending.values()) {
        p.resolve({ error: { code: -32000, message: `acp: spawn failed: ${e.message}` } });
      }
      pending.clear();
      initialized = false;
      proc = null;
    });
    proc.on('exit', () => {
      // Child process death: every in-flight call fails immediately (no silent hang).
      for (const p of pending.values()) {
        p.resolve({ error: { code: -32000, message: 'acp: agent process exited' } });
      }
      pending.clear();
      initialized = false;
    });
    let out = '';
    proc.stdout?.on('data', (chunk: Buffer) => {
      out += chunk.toString('utf8');
      let idx: number;
      while ((idx = out.indexOf('\n')) >= 0) {
        const line = out.slice(0, idx).trim();
        out = out.slice(idx + 1);
        if (line === '') continue;
        try {
          const v = JSON.parse(line) as { id?: number; result?: unknown; error?: { code: number; message: string }; method?: string; params?: Notification['params'] };
          if (typeof v.id === 'number' && (v.result !== undefined || v.error !== undefined)) {
            pending.get(v.id)?.resolve({ result: v.result, error: v.error });
            pending.delete(v.id);
          } else if (typeof v.method === 'string') {
            onNotify({ method: v.method, params: v.params });
          }
        } catch { /* skip malformed lines */ }
      }
    });
    const init = await call('initialize', {
      clientInfo: { name: 'juli-service', title: 'juli-service', version: '0.1.0' },
    }, 15_000);
    if (!init.ok) return err(init.error);
    const hand = await toResult(writeJson({ method: 'initialized' }), 'acp: handshake failed');
    if (!hand.ok) return err(hand.error);
    initialized = true;
    return ok(undefined);
  };

  const ensureThread = async (session: string, cwd: string): Promise<Result<AcptThread, Error>> => {
    const existing = threads.get(session);
    if (existing) return ok(existing);
    const params: Record<string, unknown> = { cwd };
    if (deps.model !== '') params['model'] = deps.model;
    const res = await call('thread/start', params, rpcTimeoutMs);
    if (!res.ok) return err(res.error);
    const threadId = (res.value as { thread?: { id?: string } })?.thread?.id ?? '';
    if (threadId === '') return err(new Error('acp: thread/start: bad response'));
    const t: AcptThread = {
      threadId, cwd, turnId: '', lastMessage: '', lastError: '', waiters: [],
      pendingCompletion: null,
    };
    threads.set(session, t);
    return ok(t);
  };

  const dispatchSync: SyncDispatcherPort['dispatchSync'] = async (source, session, text) => {
    void source;
    const started = await startChild();
    if (!started.ok) return err(started.error);
    // The session name is the agent profile name; cwd falls back to the home
    // directory (Go: registered project directory first).
    const t = await ensureThread(session, deps.env?.['JULI_ACP_CWD'] ?? process.cwd());
    if (!t.ok) return err(t.error);
    const thread = t.value;
    thread.lastMessage = '';
    thread.lastError = '';
    thread.pendingCompletion = null; // drain a stale completion (Go Prompt's drain semantics)
    const prompt = await call('turn/start', {
      threadId: thread.threadId,
      input: [{ type: 'text', text }],
    }, rpcTimeoutMs);
    if (!prompt.ok) return err(prompt.error);

    // Check for an early completion first (the notification can arrive in the
    // same stdio batch as the RPC response, before the waiter registers);
    // otherwise park a waiter on the protocol signal.
    const status = await toResult(
      thread.pendingCompletion !== null
        ? Promise.resolve(thread.pendingCompletion)
        : new Promise<string>((resolve, reject) => {
          thread.waiters.push(resolve);
          setTimeout(() => {
            const i = thread.waiters.indexOf(resolve);
            if (i >= 0) {
              thread.waiters.splice(i, 1);
              reject(new Error(`acp: turn timeout after ${turnTimeoutMs}ms`));
            }
          }, turnTimeoutMs);
        }),
      'acp: turn failed');
    thread.pendingCompletion = null;
    if (!status.ok) return err(status.error);
    if (status.value !== 'completed') {
      return err(new Error(`acp: turn ended with status "${status.value}"${thread.lastError ? `: ${thread.lastError}` : ''}`));
    }
    return ok(thread.lastMessage);
  };

  const interrupt = async (session: string): Promise<Result<void, Error>> => {
    const t = threads.get(session);
    if (!t) return err(new Error(`acp: unknown thread for session ${session}`));
    const params: Record<string, unknown> = { threadId: t.threadId };
    if (t.turnId !== '') params['turnId'] = t.turnId;
    const res = await call('turn/interrupt', params, 15_000);
    return res.ok ? ok(undefined) : err(res.error);
  };

  return {
    dispatchSync,
    interrupt,
    alive: () => proc !== null && proc.exitCode === null && initialized,
    stop: kill,
  };
};
