// L0 execution-substrate facade — the only public surface of this layer.
// Complete export surface of the source modules. Dependency rule:
// agents may depend on platform/shared, its own contracts/ports (type-only),
// and @juli-os/baton; consumers must never bypass this facade.
// 0.5.0：终端遥控器件（tmux/pty/herdr/backend）平移进 @juli-os/baton
//（2026-11-12 第 6 步）——本包专注派发管线，遥控面经 re-export 对外一字
// 不变（主仓零改动）。
export {
  resolveTmuxBin, TMUX_BIN, tmuxEnv, promptFingerprints, inputBoxState, createTmuxClient,
  type TmuxSessionInfo, type SubmitStats, type TmuxClient, type TerminalKey,
} from '@juli-os/baton';
// 2026-11-04 herdr 下沉（2026-11-12 起实现在 @juli-os/baton）：终端基底
//（tmux|herdr）的正交后端工厂——引擎消费面，聚合 terminal/hookSpecs/
// listSync/attach/bootCommand/applyEnv 六件「随后端变化的事」，差异不出包。
// createAgentBackend 是包装非裸 re-export：把本包 defaultHookSpecs 注入
// baton 的 hookSpecs 参数（baton 缺省空组——CC 注入语义留本包），行为与
// 剥离前逐字一致。
export {
  createHerdrClient, herdrSocketPath, HERDR_BIN,
  type HerdrClient, type HerdrManagedAgentStart, type HerdrAgentInfo,
} from '@juli-os/baton';
export {
  createPty, tmuxAttachCommand, attachTmuxPty, ptyAvailable,
  DEFAULT_PTY_COLS, DEFAULT_PTY_ROWS, type PtyOpts, type PtySession,
} from '@juli-os/baton';
import {
  createAgentBackend as createAgentBackendBase,
  type AgentBackend, type AgentBackendKind, type AgentBackendOpts,
} from '@juli-os/baton';
export type { AgentBackend, AgentBackendKind, AgentBackendOpts };
import { defaultHookSpecs } from './platform/agents/hooks.ts';

/** 终端后端工厂（tmux|herdr，实现在 @juli-os/baton）——同签名同行为：包装层
 * 把本包的 defaultHookSpecs 注入 baton 的 hookSpecs 参数（六事件表只此一处）。 */
export const createAgentBackend = (opts: AgentBackendOpts = {}): AgentBackend =>
  createAgentBackendBase({ ...opts, hookSpecs: opts.hookSpecs ?? defaultHookSpecs });
export {
  createSessionRouter,
  type SessionRouterDeps, type SessionRouter,
} from './platform/agents/router.ts';
export { tmuxListSync } from '@juli-os/baton';
export {
  createProvisioningDispatch,
  type ProvisioningOpts,
} from './platform/agents/dispatch.ts';
export {
  probePane, paneAwaitingInput, type PaneProbe,
} from './platform/agents/pane_probe.ts';
export {
  installClaudeHooks, defaultHookSpecs, normalizeStopStatus,
  type HookSpec,
} from './platform/agents/hooks.ts';
export {
  loadSnapshot, takeSnapshot, recoverFromSnapshot, startSnapshotLoop,
  type SessionSnapshot, type Snapshot, type SnapshotDeps,
} from './platform/agents/snapshot.ts';
export {
  parseHookStdin, parseSkillUsedStdin, extractFinalMessage,
} from './platform/agents/transcript.ts';
export {
  parseSkill, loadSkills, expandPrompt, createSkillRegistry,
  type Skill, type SkillRegistry,
} from './platform/agents/skills.ts';
export {
  createAcpExecutor, type AcpDeps, type AcpExecutor,
} from './platform/agents/acp.ts';
export {
  decideContextAction, DEFAULT_COMPACT_THRESHOLD, DEFAULT_COMPACT_COOLDOWN_MS,
  type ContextAction, type ContextGateState,
} from './platform/agents/contextGate.ts';
export {
  isBlockedCommand, toolSchemas, makeAllTools,
  type ToolParam, type Tool, type NotifierPort,
  type Assessment, type Assessor, type SessionHealer, type ToolsDeps,
} from './platform/agents/tools.ts';
export {
  createHookManager, createCommandRegistry, registerDefaultCommands,
  registerSkillCommands,
  DEFAULT_ASSESSOR_PROMPT, createSessionAssessor, createOrchestrator,
  type OrchestratorEvent, type Emit, type HookType, type HookPayload,
  type HookManager, type SlashCommand, type CommandRegistry,
  type OrchestratorDeps, type Orchestrator,
} from './platform/agents/orchestrator.ts';
export {
  parseCallMode, callModeConfigs, VOICE_BLOCKED_TOOLS, isConfirmPhrase,
  extractPlanBlock, createVoiceCall, voiceGateHook,
  type CallMode, type StagedPlan, type CallModeConfig,
  type CallPhase, type VoiceEvent, type VoiceCallDeps, type VoiceTurn, type VoiceCall,
} from './platform/agents/voice.ts';
export type {
  SyncDispatcherPort, ToolSchema, ToolCallRequest,
  ChatMessage, ChatResult, ChatLlmPort,
} from './contracts/ports.ts';
// 0.1.3: complete the pane-question surface — parsePaneQuestion (+ PaneQuestion
// types) was internal-only; the zombie watchdog in juli-service-ts consumes it
// (2026-10-10 oss-integration fix: local shadow retirement).
export {
  parsePaneQuestion, type PaneQuestion, type PaneQuestionOption,
} from './platform/shared/paneFingerprint.ts';
