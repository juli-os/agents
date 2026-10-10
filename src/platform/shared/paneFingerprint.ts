// Pure-function family for pane text-fingerprint classification (2026-09-28
// question-card work-order fix): the probe in platform/agents and the zombie
// watchdog in business/workflow share one definition — "what counts as awaiting
// input" is a cross-layer contract and lives in shared, which has zero
// dependencies (arch fence: workflow must not import agents).

/** "Awaiting input" classification: numbered choice menus (permission/options)
 * plus the CC permission-question fingerprint. This is the healthy
 * waiting-for-a-human state, not a zombie — the watchdog exempts it and
 * notifies a human instead of interrupting. */
export const paneAwaitingInput = (pane: string): boolean =>
  /❯\s*\d|[1-9]\.\s+(yes|no|allow|deny)/i.test(pane)
  || /\b(do you want|would you like|waiting for your|awaiting your)\b/i.test(pane);

export interface PaneQuestionOption {
  readonly label: string; // approval-card button label (includes the number)
  readonly reply: string; // answer fed back into the session (menu = number, free-form = text)
}
export interface PaneQuestion {
  readonly question: string;
  readonly options: readonly PaneQuestionOption[];
}

/** Parse "the agent's question + options" from pane text (content source for
 * the question gate, 2026-09-28). CC permission/choice menus = numbered lines
 * (❯ 1. Yes / 2. No…) — option replies use the number (menu keyboard-selection
 * semantics); when there is no menu (open-ended question) fall back to generic
 * approve/deny plus a custom answer. */
export const parsePaneQuestion = (pane: string, fallbackMessage = ''): PaneQuestion => {
  const opts: PaneQuestionOption[] = [];
  const seen = new Set<string>();
  for (const raw of pane.split('\n')) {
    const m = /^\s*[❯>\s]*(\d)\.\s+(.{1,90})$/.exec(raw);
    if (m !== null) {
      const num = m[1] ?? '';
      const label = (m[2] ?? '').trim();
      if (num !== '' && !seen.has(num)) {
        seen.add(num);
        opts.push({ label: `${num}. ${label}`, reply: num });
      }
    }
    if (opts.length >= 5) break;
  }
  // Question text: prefer the hook message (CC's own human-readable
  // self-report); otherwise take the last non-option, non-empty line above the
  // menu.
  let question = fallbackMessage.trim();
  if (question === '') {
    const lines = pane.split('\n').map((l) => l.trim()).filter((l) => l !== '');
    for (let i = lines.length - 1; i >= 0; i--) {
      const ln = lines[i] ?? '';
      if (!/^\s*[❯>\s]*\d\./.test(ln)) { question = ln.slice(0, 200); break; }
    }
  }
  if (question === '') question = 'The agent is waiting for your answer';
  const options = opts.length >= 2 ? opts
    : [{ label: 'Approve and continue (yes)', reply: 'yes' }, { label: 'Deny (no)', reply: 'no' }];
  return { question, options };
};
