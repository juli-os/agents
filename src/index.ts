// L0 execution-substrate facade — the only public surface of this layer.
// Complete export surface of the fourteen source modules. Dependency rule:
// agents may depend on platform/shared and its own contracts/ports (type-only);
// consumers must never bypass this facade.
export {
  resolveTmuxBin, TMUX_BIN, promptFingerprints, inputBoxState, createTmuxClient,
  type TmuxSessionInfo, type SubmitStats, type TmuxClient,
} from './platform/agents/tmux.ts';
export {
  createPty, tmuxAttachCommand, attachTmuxPty, ptyAvailable,
  DEFAULT_PTY_COLS, DEFAULT_PTY_ROWS, type PtyOpts, type PtySession,
} from './platform/agents/pty.ts';
export {
  createSessionRouter, tmuxListSync,
  type SessionRouterDeps, type SessionRouter,
} from './platform/agents/router.ts';
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
  parseHookStdin, parseSkillUsedStdin,
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
