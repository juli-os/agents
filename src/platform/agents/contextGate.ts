// CC context 门（wf_a79a6fcbf7ef，2026-10-05 用户定案）：
// 派发任务消息之前（宪法之前）按 decision 层判定执行 clear/compact——
//   切换 workflow → /clear（context 仅留新单注入，旧单上下文清场；
//     底层数据在共享数据库，context 长期保留价值有限）
//   同一 workflow 内 context 膨胀到阈值 → /compact（CC 就地压缩，
//     摘要由 CC 生成——设计上「摘要保留内容」交给 CC 原生 compact，
//     我们只管时机）
// 判定纯函数化（可单测）；副作用（发斜杠命令+等就绪）在 dispatch 挂点。

export type ContextAction = 'clear' | 'compact' | null;

export interface ContextGateState {
  /** 该会话当前 workflow id（空串=未知/无单）。 */
  wf: string;
  /** 该会话最近一次回合的 input tokens（≈当前 context 量级）。 */
  lastInputTokens: number;
  /** 上次真实执行 /compact 的时刻（ms epoch，十四跑 R1 P2-4 冷却起点）。
   * latestInputTokens 靠 60s 摄取，滞后窗内连续派发会对同一膨胀 context
   * 重复 /compact——冷却窗内不再重判 compact。 */
  compactAt?: number;
}

/** 阈值默认 600K（[1m] 模型全量重发架构下，超过此值单回合成本已显著）。 */
export const DEFAULT_COMPACT_THRESHOLD = 600_000;

/** compact 冷却窗（十四跑 R1 P2-4）：10 分钟。构成：compact 就绪轮询上限
 * 120s + latestInputTokens 的 60s 摄取滞后 + compact 后真实回合计分钟级，
 * 10 分钟稳超最坏滞后组合，又把重复压缩的误判上限压在 6 次/时。 */
export const DEFAULT_COMPACT_COOLDOWN_MS = 10 * 60_000;

/**
 * 判定（纯函数）：
 * - 本单与该会话当前单不同（切换 workflow）→ clear；
 * - 同一单且 lastInputTokens ≥ 阈值 → compact（但上次 compact 后冷却窗内
 *   不重判——摄取滞后的 stale 膨胀值不触发二次压缩）；
 * - 其余 → null（不动）。
 * 首见会话（prev=undefined）：无状态可比较 → null（宁可少 clear 一次，不
 * 误清）。prev.wf=''（曾发生无单派发/热身，有状态可比）不算首见：进入
 * 第一个 workflow 视为边界切换 → clear（context 只剩热身残渣，清场无害）。
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
        && nowMs - prev.compactAt < DEFAULT_COMPACT_COOLDOWN_MS) return null; // 冷却窗内不重判
    return 'compact';
  }
  return null;
};
