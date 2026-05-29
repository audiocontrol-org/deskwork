/**
 * plugins/dw-lifecycle/src/scope-discovery/promote-findings/auto-flip-from-commit.ts
 *
 * Phase 13 Task 4 Step 2 — closure-side automation library: parse
 * `Closes AUDIT-<id>` references out of commit messages and propose
 * Status flips for the matching audit-log entries.
 *
 * Pure functions only — no fs, no git, no audit-log writing. The CLI
 * verb at `subcommands/apply-audit-flips.ts` composes this with
 * `flipAuditLogStatus` from `audit-log-editor.ts`.
 *
 * Grammar accepted:
 *   - `Closes AUDIT-YYYYMMDD-NN` anywhere in subject or body.
 *   - `Closes: AUDIT-X, AUDIT-Y, AUDIT-Z` trailer with comma-separated
 *     ids (the canonical multi-finding form, per Phase 13 Open scoping
 *     question #3 — the comma-separated trailer is the chosen syntax).
 *   - Case-insensitive on the verb (`closes` / `Closes` / `CLOSES`).
 *   - Deduplicates same-id references across subject + body within ONE
 *     commit; across multiple commits, the FIRST occurrence wins
 *     (the first commit to cite an id is treated as its closing commit).
 */

export interface CommitInput {
  /** Commit SHA — full or short; the SHA prefix is preserved verbatim in `fixed-<sha>`. */
  readonly sha: string;
  /** Full commit message (subject + blank line + body), as `git log -1 --format=%B`. */
  readonly message: string;
}

export interface ProposedFlip {
  readonly findingId: string;
  /** Always `fixed-<sha>` for the closure-automation path. */
  readonly newStatus: string;
}

const CLOSES_AUDIT_RE = /\bcloses\b[\s:]+((?:AUDIT-\d{8}-\d+(?:[\s,]+)?)+)/gi;
const AUDIT_ID_RE = /AUDIT-\d{8}-\d+/g;

/**
 * Extract every `Closes AUDIT-<id>` (or `Closes: AUDIT-X, AUDIT-Y`)
 * reference from a commit message. Deduplicates within the input;
 * preserves order of first occurrence.
 */
export function parseClosesAuditTrailers(text: string): readonly string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const matches = text.matchAll(CLOSES_AUDIT_RE);
  for (const m of matches) {
    const idsList = m[1] ?? '';
    const ids = idsList.matchAll(AUDIT_ID_RE);
    for (const idMatch of ids) {
      const id = idMatch[0];
      if (!seen.has(id)) {
        seen.add(id);
        out.push(id);
      }
    }
  }
  return out;
}

export function proposeFlipsForCommit(
  commit: CommitInput,
): readonly ProposedFlip[] {
  const ids = parseClosesAuditTrailers(commit.message);
  return ids.map((findingId) => ({
    findingId,
    newStatus: `fixed-${commit.sha}`,
  }));
}

/**
 * Walk a chronologically-ordered list of commits (oldest first or
 * newest first — same result either way because dedup keeps the FIRST
 * occurrence). Returns a deduplicated proposal list: each AUDIT id
 * appears once, attributed to the first commit in the input that
 * cited it.
 */
export function proposeFlipsForCommits(
  commits: ReadonlyArray<CommitInput>,
): readonly ProposedFlip[] {
  const seen = new Set<string>();
  const out: ProposedFlip[] = [];
  for (const commit of commits) {
    const flips = proposeFlipsForCommit(commit);
    for (const flip of flips) {
      if (seen.has(flip.findingId)) continue;
      seen.add(flip.findingId);
      out.push(flip);
    }
  }
  return out;
}
