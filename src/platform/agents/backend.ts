// Agent 终端后端工厂（2026-11-04，herdr 下沉进包）：把「随终端基底变化的
// 全部事项」聚合到一个正交接缝——引擎（juli-service-ts 的 runtime 组合根）
// 只认 AgentBackend 这一个面，tmux/herdr 的差异不出本包：
//
//   terminal     派发/探测/快照管线消费的终端契约（TmuxClient——tmux 方言，
//                herdr 侧经封闭翻译面适配，见 herdr.ts）
//   hookSpecs    CC hook 命令组（会话名解析随后端：tmux=display-message
//                运行时反查；herdr=JULI_HERDR_SESSION env）
//   listSync     路由器会话名单同步源（失败/缺席归一空名单，两侧同语义）
//   attach       web 终端 PTY 附着（不存在明确报错不代建，两侧同契约）
//   bootCommand  就绪派发的引导命令包装（herdr 带 env 兜底前缀）
//   applyEnv     AI 段 env 注入（尽力语义：失败记日志不抛，两侧同形）
//
// 正交性约束：新增第三后端只改本文件 + 新适配层，引擎与派发管线零改动。
import { homedir } from 'node:os';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import type { Result } from '../shared/result.ts';
import {
  createHerdrClient, herdrAttach, herdrBootCommand, herdrHookSpecs, herdrListSync,
  writeAgentEnvFile,
} from './herdr.ts';
import { defaultHookSpecs, type HookSpec } from './hooks.ts';
import { attachTmuxPty, type PtyOpts, type PtySession } from './pty.ts';
import { tmuxListSync } from './router.ts';
import { createTmuxClient, type TmuxClient } from './tmux.ts';

export type AgentBackendKind = 'tmux' | 'herdr';

export interface AgentBackendOpts {
  /** 终端基底（默认 tmux——现状默认，零行为变化）。 */
  readonly backend?: AgentBackendKind;
  /** tmux 专属 socket 路径（undefined=default socket）。 */
  readonly socketPath?: string;
  /** herdr 命名 session namespace（默认 'juli'，与 tmux 专属 socket 同位的隔离位）。 */
  readonly herdrSession?: string;
  /** herdr socket 路径覆盖（缺省=命名 session 固定布局；测试指向 fake server）。 */
  readonly herdrSocketPath?: string;
  /** env 文件落盘目录（引擎 data_dir；缺省 ~/.juli-service）。tmux 后端忽略。 */
  readonly dataDir?: string;
  /** 终端覆盖位（测试/嵌入接缝，与 runtime 的 seams.tmux 同一语义）：提供时
   * 工厂不内建终端——产物 terminal、tmux 分枝的 applyEnv/attach 全走它，
   * 绝不触碰真实 tmux。herdr 分枝仍构造内部 client（applyEnv 的 setEnv
   * 落点），terminal 面返回覆盖值（该组合仅出现在测试，不同时配 herdr）。 */
  readonly terminal?: TmuxClient;
  readonly log?: (m: string) => void;
}

export interface AgentBackend {
  readonly kind: AgentBackendKind;
  /** 人读描述（warmup/诊断日志）：`tmux socket=default` / `herdr session=juli`。 */
  readonly describe: string;
  /** 终端契约——派发/探测/快照管线的唯一消费面。 */
  readonly terminal: TmuxClient;
  /** CC hook 命令组（installClaudeHooks 的入参）。 */
  hookSpecs(hookJsPath: string, password: string, serviceUrl: string): readonly HookSpec[];
  /** 会话名单同步源（router listSync；失败/缺席归一空名单）。 */
  listSync(): readonly string[];
  /** web 终端 attach：会话不存在明确报错、不代建。 */
  attach(session: string, opts: PtyOpts, onData?: (chunk: string) => void): Promise<Result<PtySession, Error>>;
  /** 引导命令包装：base=引擎选好的 claude 启动命令，session=目标会话名。 */
  bootCommand(base: string, session: string): string;
  /** AI 段 env 注入（[key, value] 对）。 */
  applyEnv(vars: readonly (readonly [string, string])[]): void;
}

export const createAgentBackend = (opts: AgentBackendOpts = {}): AgentBackend => {
  if (opts.backend === 'herdr') {
    const ns = opts.herdrSession ?? 'juli';
    const dataDir = opts.dataDir ?? join(homedir(), '.juli-service');
    const envFile = join(dataDir, 'agent-env.sh');
    const client = createHerdrClient({
      session: ns,
      socketPath: opts.herdrSocketPath,
      log: opts.log,
    });
    return {
      kind: 'herdr',
      describe: `herdr session=${ns}`,
      terminal: opts.terminal ?? client,
      hookSpecs: herdrHookSpecs,
      listSync: () => herdrListSync(ns),
      attach: herdrAttach({ client, session: ns }),
      bootCommand: (base, session) => herdrBootCommand(base, envFile, session),
      applyEnv: (vars) => {
        // 双通道落位（herdr 无 server 级全局 env API）：①写 0600 env 文件
        //（恢复态 boot 命令 source 它）；②更新新建 workspace 的 tab env
        // 注入面（client.setEnv）。已在跑的 workspace 不受影响——与 tmux
        // 全局环境的诚实边界同款。落盘失败=尽力语义（R2 复审 #1）：记日志
        // 不抛、注入面照常更新——与 tmux 分枝同形，HTTP 热改路径不炸。
        const record = Object.fromEntries(vars);
        try {
          mkdirSync(dataDir, { recursive: true });
          writeAgentEnvFile(envFile, record);
        } catch (e) {
          opts.log?.(`[ai] herdr agent-env.sh 落盘失败（${e instanceof Error ? e.message : String(e)}）——恢复态兜底缺失，新建面注入仍生效`);
        }
        client.setEnv(record);
      },
    };
  }
  const terminal = opts.terminal ?? createTmuxClient({ socketPath: opts.socketPath });
  return {
    kind: 'tmux',
    describe: `tmux socket=${opts.socketPath ?? 'default'}`,
    terminal,
    hookSpecs: defaultHookSpecs,
    listSync: () => tmuxListSync(opts.socketPath),
    attach: (session, ptyOpts, onData) => attachTmuxPty(terminal, session, ptyOpts, onData),
    bootCommand: (base) => base,
    applyEnv: (vars) => {
      void terminal.setEnv(Object.fromEntries(vars)).then((r) => {
        if (!r.ok) {
          opts.log?.(`[ai] tmux set-environment 跳过（${r.error.message}）——引擎 env 继承兜底`);
        }
      });
    },
  };
};
