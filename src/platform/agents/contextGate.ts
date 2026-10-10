// CC context gate (wf_a79a6fcbf7ef, user's final call on 2026-10-05):
// before the task message is dispatched (before the constitution), the
// decision layer picks clear/compact:
//   switching workflow → /clear (context keeps only the new work order
//     injection; the old work order's context is cleared — underlying data
//     lives in the shared database, so long-term retention in context has
//     limited value)
//   same workflow with context bloated past the threshold → /compact (CC
//     compresses in place; the summary is produced by CC — by design, "what
//     the summary keeps" is left to CC's native compact; we only control
//     timing)
// The decision is a pure function (unit-testable); side effects (sending the
// slash command + waiting for readiness) live at the dispatch hook.

export type ContextAction = 'clear' | 'compact' | null;

export interface ContextGateState {
  /** Workflow id currently active in this session (empty string = unknown / no work order). */
  wf: string;
  /** Input tokens of this session's most recent turn (≈ current context magnitude). */
  lastInputTokens: number;
  /** When /compact was last actually executed (ms epoch; cooldown origin for
   * run-14 R1 P2-4). latestInputTokens is ingested on a 60s cadence, so
   * consecutive dispatches inside the lag window would re-run /compact on the
   * same bloated context — do not re-judge compact inside the cooldown
   * window. */
  compactAt?: number;
}

/** Default threshold 600K (under the [1m] model's resend-everything architecture, a single turn past this point already costs significantly). */
export const DEFAULT_COMPACT_THRESHOLD = 600_000;

/** compact cooldown window (run-14 R1 P2-4): 10 minutes. Composition: the
 * compact readiness polling cap of 120s + the 60s ingestion lag of
 * latestInputTokens + post-compact real turns taking minutes; 10 minutes
 * safely exceeds the worst lag combination while capping repeat-compaction
 * misjudgment at 6 per hour. */
export const DEFAULT_COMPACT_COOLDOWN_MS = 10 * 60_000;

/**
 * Decision (pure function):
 * - This work order differs from the session's current one (workflow switch) → clear;
 * - Same work order and lastInputTokens ≥ threshold → compact (but not
 *   re-judged inside the cooldown window after the last compact — a stale
 *   bloated value from ingestion lag must not trigger a second compaction);
 * - Otherwise → null (do nothing).
 * First-seen session (prev=undefined): no state to compare → null (rather
 * miss one clear than clear by mistake). prev.wf='' (a no-work-order dispatch
 * or warm-up happened before, so there is state to compare) does not count as
 * first-seen: entering the first workflow is treated as a boundary switch →
 * clear (context holds only warm-up residue; clearing is harmless).
 */
export const decideContextAction = (
  prev: ContextGateState | undefined,
  currentWf: string,
  lastInputTokens: number,
  threshold: number = DEFAULT_COMPACT_THRESHOLD,
  nowMs?: number,
): ContextAction => {
  if (prev === undefined) return null;
  const switching = currentWf !== '' && prev.wf !== currentWf;
  if (switching) return 'clear';
  if (prev.wf === currentWf && currentWf !== '' && lastInputTokens >= threshold) {
    if (prev.compactAt !== undefined && nowMs !== undefined
        && nowMs - prev.compactAt < DEFAULT_COMPACT_COOLDOWN_MS) return null; // no re-judge inside the cooldown window
    return 'compact';
  }
  return null;
};
