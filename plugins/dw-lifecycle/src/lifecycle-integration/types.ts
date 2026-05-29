// Shared types for the lifecycle-integration helpers
// (/dw-lifecycle:session-end, /dw-lifecycle:session-start, /dw-lifecycle:complete).
//
// The three modules share a small surface: they all read git history, read
// workplan markers, and emit operator-readable markdown that lands in the
// journal. Centralizing the shapes here keeps the per-module code focused on
// its mechanic.

export interface RunGit {
  (args: readonly string[]): string;
}

export interface RunGh {
  (args: readonly string[]): string;
}

export interface HygieneObservation {
  readonly category:
    | 'commit-marker'
    | 'workplan-tbd-introduced'
    | 'issue-filed-this-session';
  readonly sha?: string;
  readonly subject?: string;
  readonly markerText?: string;
  readonly issueNumber?: number;
  readonly issueTitle?: string;
  // Set on `issue-filed-this-session` observations: 'OPEN' | 'CLOSED' verbatim
  // from `gh issue list --json state` so the recommendation half can filter
  // OPEN issues for the forward-looking Triage line while observations stay
  // inclusive (closed-this-session issues are still historical signal).
  readonly issueState?: 'OPEN' | 'CLOSED';
  readonly path?: string;
  readonly lineNumber?: number;
}

export interface NextSessionRecommendation {
  readonly resumeTask: string | null;
  readonly triageItems: readonly string[];
  readonly addressTbdItems: readonly string[];
}

export interface SessionEndHygieneReport {
  readonly observations: readonly HygieneObservation[];
  readonly recommendation: NextSessionRecommendation;
  readonly markdownBlock: string;
}

export interface BareTbdLocation {
  readonly path: string;
  readonly lineNumber: number;
  readonly text: string;
}

export interface CompleteGateResult {
  readonly bareTbds: readonly BareTbdLocation[];
  readonly overrideUsed: boolean;
  readonly overrideReason: string | null;
}
