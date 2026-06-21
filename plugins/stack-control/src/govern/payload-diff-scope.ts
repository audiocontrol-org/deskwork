// 030 — committed-diff scoping (the FR-023 inclusion-based successor to the
// deleted exclusion-based composition plumbing). Scopes the governedSha..HEAD
// committed diff plus untracked-fold, producing a non-empty diffScope.files for
// a real committed-diff feature. Phase 1 stub (T002); implemented in Phase 3
// (T021).

/** The scoped diff: the changed file set + per-file diff text over governedSha..HEAD. */
export interface DiffScope {
  readonly base: string;
  readonly head: string;
  readonly files: readonly string[];
  readonly fileDiffs: ReadonlyMap<string, string>;
}

/** Scope the committed base..HEAD diff (plus untracked-fold) into an inclusion-based DiffScope. */
export function scopeCommittedDiff(_installationRoot: string, _base: string, _head: string): DiffScope {
  throw new Error('not implemented (030 payload-diff-scope stub — Phase 3 T021)');
}
