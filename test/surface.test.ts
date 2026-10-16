// Facade 表面快照：显式名单断言（非盲快照）——增删导出必须显式改这份名单。
// 教训：漏导出此前靠主仓 typecheck 才发现（d02a891 "main-repo typecheck caught
// the gap"、47c72e7 补 parsePaneQuestion 等 4+ 次）；本测试把围栏前移到本仓 CI 红。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as facade from '../src/index.ts';

test('facade value-export surface matches the explicit snapshot list', () => {
  const expected = [
    // tmux
    'resolveTmuxBin', 'TMUX_BIN', 'tmuxEnv', 'promptFingerprints', 'inputBoxState', 'createTmuxClient',
    // pty
    'createPty', 'tmuxAttachCommand', 'attachTmuxPty', 'ptyAvailable', 'DEFAULT_PTY_COLS', 'DEFAULT_PTY_ROWS',
    // router
    'createSessionRouter', 'tmuxListSync',
    // dispatch
    'createProvisioningDispatch',
    // pane_probe
    'probePane', 'paneAwaitingInput',
    // hooks
    'installClaudeHooks', 'defaultHookSpecs', 'normalizeStopStatus',
    // snapshot
    'loadSnapshot', 'takeSnapshot', 'recoverFromSnapshot', 'startSnapshotLoop',
    // transcript
    'parseHookStdin', 'parseSkillUsedStdin', 'extractFinalMessage',
    // skills
    'parseSkill', 'loadSkills', 'expandPrompt', 'createSkillRegistry',
    // acp
    'createAcpExecutor',
    // contextGate
    'decideContextAction', 'DEFAULT_COMPACT_THRESHOLD', 'DEFAULT_COMPACT_COOLDOWN_MS',
    // tools
    'isBlockedCommand', 'toolSchemas', 'makeAllTools',
    // orchestrator
    'createHookManager', 'createCommandRegistry', 'registerDefaultCommands',
    'registerSkillCommands', 'DEFAULT_ASSESSOR_PROMPT', 'createSessionAssessor', 'createOrchestrator',
    // voice
    'parseCallMode', 'callModeConfigs', 'VOICE_BLOCKED_TOOLS', 'isConfirmPhrase',
    'extractPlanBlock', 'createVoiceCall', 'voiceGateHook',
    // paneFingerprint
    'parsePaneQuestion',
  ];
  assert.deepEqual(Object.keys(facade).sort(), [...expected].sort());
});
