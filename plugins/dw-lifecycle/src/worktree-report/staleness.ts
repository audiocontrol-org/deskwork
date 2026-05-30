// Pure staleness evaluator. Composes the nine PRD-named signals into a
// verdict + recommended disposition. No I/O — every signal arrives as
// pre-computed input.

import type {
  PerSignalCheck,
  RecommendedDisposition,
  StalenessSignal,
  WorktreeVerdict,
} from './types.js';

export interface EvaluateInput {
  /** All nine signals, in canonical order. The evaluator assumes each is computed. */
  readonly signals: readonly PerSignalCheck[];
  /** Minimum count of `held: true` signals to flag stale (default 3). */
  readonly thresholdCount: number;
  /** Disambiguators that override the verdict-from-count logic. */
  readonly isCurrent: boolean;
  readonly isMain: boolean;
  readonly isOrphan: boolean;
  readonly isDivergent: boolean;
  readonly isCorrupt: boolean;
  /** Whether the branch has commits ahead of `main`. Drives dismantle vs archive-then-dismantle. */
  readonly hasNovelCommitsAheadOfMain: boolean;
}

export interface EvaluateResult {
  readonly verdict: WorktreeVerdict;
  readonly disposition: RecommendedDisposition;
}

const CANONICAL_SIGNAL_ORDER: readonly StalenessSignal[] = [
  'branch-fully-merged',
  'pr-merged-or-closed',
  'feature-doc-complete',
  'no-recent-commits',
  'branch-gone-from-origin',
  'working-tree-clean',
  'commits-on-origin',
  'prunable',
  'orphan-directory',
] as const;

export { CANONICAL_SIGNAL_ORDER };

export function evaluateStaleness(input: EvaluateInput): EvaluateResult {
  // Overriding verdicts surface before the count gate. The current
  // worktree and main worktree are never dismantle candidates; the
  // operator can't run the verb from inside a worktree it's trying to
  // remove, and the main worktree is the project's anchor.
  if (input.isCurrent) {
    return { verdict: 'current', disposition: 'keep' };
  }
  if (input.isMain) {
    return { verdict: 'main', disposition: 'keep' };
  }
  if (input.isCorrupt) {
    return { verdict: 'corrupt', disposition: 'operator-triage' };
  }
  if (input.isDivergent) {
    return { verdict: 'divergent', disposition: 'operator-triage' };
  }
  if (input.isOrphan) {
    return { verdict: 'orphan', disposition: 'prune-orphan' };
  }

  const heldCount = input.signals.filter((s) => s.held).length;
  if (heldCount >= input.thresholdCount) {
    const disposition: RecommendedDisposition = input.hasNovelCommitsAheadOfMain
      ? 'archive-then-dismantle'
      : 'dismantle';
    return { verdict: 'stale', disposition };
  }

  return { verdict: 'keep', disposition: 'keep' };
}

/**
 * Build the canonical `PerSignalCheck[]` from a raw boolean record.
 * Surfaces every signal in the canonical order regardless of which
 * ones held, so the report shows the per-criterion verdict even on
 * keep-verdict entries (per PRD acceptance criteria).
 */
export function buildSignals(
  raw: Readonly<Record<StalenessSignal, boolean>>,
  notes: Readonly<Partial<Record<StalenessSignal, string>>> = {},
): readonly PerSignalCheck[] {
  return CANONICAL_SIGNAL_ORDER.map((signal): PerSignalCheck => {
    const held = raw[signal];
    const note = notes[signal];
    if (note !== undefined) {
      return { signal, held, note };
    }
    return { signal, held };
  });
}
