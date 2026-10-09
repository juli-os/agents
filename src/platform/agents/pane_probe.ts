// pane 探针（对应 Go tools/pane_probe.go）：一次 capture 推导面板的完整
// 交互状态——确定性启发式，零 LLM。发射器与发送方共用同一套"什么算就绪"。

import type { TmuxClient } from './tmux.ts';

export interface PaneProbe {
  readonly session: string;
  /** 裸 shell 占着面板（agent 未启动或已退出）。 */
  readonly foregroundIsShell: boolean;
  readonly agentAlive: boolean;
  readonly agent: string;
  /** CC 的信任/引导对话框——可程序化安全接受。 */
  readonly trustDialog: boolean;
  /** 任何带编号的选择项（权限菜单/模型选择器）——绝不盲点，需守护者评估。 */
  readonly liveSelection: boolean;
  /** agent 活着且输入光标在最后一行——可以派任务。 */
  readonly ready: boolean;
  readonly reason: string;
}

const AGENT_NAMES = ['claude', 'codex', 'copilot', 'aider'] as const;

import { paneAwaitingInput } from '../shared/paneFingerprint.ts';
export { paneAwaitingInput }; // 转发：探针消费方零改动

const paneCurrentCommand = async (tmux: TmuxClient, session: string): Promise<string> => {
  const res = await tmux.exec(['list-panes', '-t', session, '-F', '#{pane_current_command}']);
  return res.ok ? (res.value.trim().split('\n')[0] ?? '') : '';
};

export const probePane = async (tmux: TmuxClient, session: string): Promise<PaneProbe> => {
  const cmd = await paneCurrentCommand(tmux, session);
  const isShell = cmd === '' || ['zsh', 'bash', 'fish', 'sh'].includes(cmd);
  if (isShell) {
    return {
      session, foregroundIsShell: true, agentAlive: false, agent: '',
      trustDialog: false, liveSelection: false, ready: false,
      reason: 'shell holds the pane (agent not started or exited)',
    };
  }
  const cap = await tmux.capturePane(session, 30);
  if (!cap.ok || cap.value.trim() === '') {
    return {
      session, foregroundIsShell: false, agentAlive: false, agent: cmd,
      trustDialog: false, liveSelection: false, ready: false, reason: 'pane unreadable',
    };
  }
  const pane = cap.value;
  const lower = pane.toLowerCase();
  const agent = AGENT_NAMES.find((a) => cmd.includes(a) || lower.includes(a)) ?? cmd;
  const alive = true; // 前台命令非 shell 且 pane 可读 → 进程层面活着
  const trustDialog = lower.includes('do you trust') || lower.includes('trust this');
  const liveSelection = /❯\s*\d|[1-9]\.\s+(yes|no|allow|deny)/i.test(pane);
  const lastLine = pane.trimEnd().split('\n').at(-1) ?? '';
  const ready = alive && !trustDialog && !liveSelection && lastLine.length < 120;

  return {
    session, foregroundIsShell: false, agentAlive: alive, agent,
    trustDialog, liveSelection, ready,
    reason: trustDialog ? 'trust dialog up (safe to accept)'
      : liveSelection ? 'live selection menu — needs guardian assessment'
        : ready ? 'agent ready for a task' : 'agent mid-turn',
  };
};
