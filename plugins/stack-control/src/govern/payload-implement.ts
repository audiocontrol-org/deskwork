/**
 * plugins/stack-control/src/govern/payload-implement.ts
 *
 * Implement-mode payload assembly for `stackctl govern --mode implement`.
 *
 * Ported verbatim-in-behavior from
 * `spec-kit/deskwork-governance/scripts/bash/govern.sh` (the bash
 * orchestration this consolidation replaces). The audit unit is the diff of
 * the just-implemented work + the feature's untracked-but-not-ignored files.
 *
 * Every ported edge-case fix carries its AUDIT-id (do NOT drop these — each
 * was earned by a cross-model audit-barrage finding against the bash):
 *
 *   - AUDIT-20260605-01: `git diff <base>` omits untracked files, so a barrage
 *     run before those files are committed cannot review the very surfaces most
 *     worth auditing (new modules, new tests). Fold each untracked file as an
 *     all-added diff via `git diff --no-index` WITHOUT mutating the index.
 *   - AUDIT-20260605-06: the folded content ships to external model CLIs, so the
 *     enumeration must not transmit arbitrary working-tree content off-box.
 *     `--exclude-standard` drops gitignored paths; we additionally (a) skip
 *     binary files (never ship binary blobs) and (b) cap total folded bytes,
 *     logging any drop (no silent truncation).
 *   - AUDIT-20260605-12: a single large file early in `git ls-files`'s sorted
 *     output must not suppress folding of the feature's smaller new source/test
 *     files that sort later. `continue` (not `break`) skips the over-budget file
 *     WITHOUT incrementing the running byte total, so later files that still fit
 *     are folded. The budget is a SOFT bound on transmitted working-tree
 *     content, not a hard byte ceiling on the wire (AUDIT-20260605-12 ack).
 */

import { spawnSync } from 'node:child_process';
import { statSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/** 256 KB soft budget on transmitted untracked working-tree content. */
const DEFAULT_UNTRACKED_FOLD_BUDGET = 256 * 1024;

/**
 * Implement-mode audit lens — the prompt's "What to look for" section for a
 * CODE diff. This is the audit-barrage template's original 7-bullet checklist
 * verbatim, hoisted out so implement-mode behavior is byte-identical after the
 * lens becomes a per-mode VAR. The render is mode-agnostic; the lens is data.
 */
export const CODE_AUDIT_LENS = [
  '- **Correctness bugs** — logic errors, off-by-one, null/undefined paths, race conditions, missing error handling, swallowed exceptions.',
  '- **Design issues** — coupling between layers that should be independent, leaking abstractions, primitives that should compose but don\'t, configuration that should be data ending up as code.',
  '- **Missed edge cases** — what happens with empty input? Maximum input? Concurrent calls? Partial failure? Network unavailability? Operator interrupt mid-operation? What is the behavior on a fresh install vs. an upgrade?',
  '- **Code-quality concerns** — files growing past a reasonable cap, names that don\'t reveal intent, dead code, duplicated logic, magic numbers without explanation, tests that don\'t test the contract they claim to test.',
  '- **Cross-cutting impact** — does this diff touch a surface that other surfaces depend on? Are those other surfaces updated? Are migrations needed? Are doctor rules / schemas / validators updated to match the new shape?',
  '- **Documentation drift** — does the README / SKILL.md / PRD describe the behavior the code actually implements? If the spec changed, did the implementation? If the implementation changed, did the spec?',
  '- **Operator-discipline traps** — placeholder comments, swallowed errors, hardcoded paths/values that should be configurable, fallbacks that hide failure modes, mock data outside test code. These are bug-factories per project guidelines.',
].join('\n');

/**
 * Implement-mode artifact framing — the prompt's "Under audit" lead-in for a
 * CODE diff. Verbatim the audit-barrage template's original "Diff under audit"
 * descriptive paragraph.
 */
export const CODE_ARTIFACT_FRAMING =
  'The actual code under review. Read it carefully. The findings you emit must be anchored to specific files + line ranges in this diff (or call out a missing surface that should be in the diff but isn\'t).';

export interface ImplementPayloadArgs {
  readonly repoRoot: string;
  readonly base: string;
  /** Soft byte budget for the untracked fold (override for tests). */
  readonly budgetBytes?: number;
  /** Sink for the human-readable drop/skip notes (default: process.stderr). */
  readonly warn?: (message: string) => void;
  /**
   * Absolute path of the resolved feature root (specs/014 US5 —
   * TASK-37 / gh-431). When supplied, the payload is made
   * self-reference-free: the feature's `audit-log.md` is excluded from
   * BOTH the committed diff (git pathspec exclusion) and the untracked
   * fold, and the untracked fold is scoped to files under this root
   * (FR-007/FR-008 — the recorded generator pulled unrelated features'
   * parked scaffolds into the audited payload). When absent, behavior
   * is byte-identical to the pre-014 assembler (the caller has no
   * resolvable feature root to scope by).
   */
  readonly featureRoot?: string;
}

export interface ImplementPayload {
  readonly diff: string;
  readonly commitSubjects: string;
  /** True when the diff against the base is empty (edge case, not fatal). */
  readonly empty: boolean;
  /** Untracked files skipped because they were binary/empty. */
  readonly skippedBinary: readonly string[];
  /** Untracked files skipped because folding them would exceed the budget. */
  readonly skippedOverBudget: readonly string[];
}

function git(repoRoot: string, args: readonly string[]): string {
  const r = spawnSync('git', ['-C', repoRoot, ...args], { encoding: 'utf8' });
  // The bash used `|| true` on every git read so a missing base / empty repo
  // degrades to an empty string rather than aborting the run. Mirror that:
  // a non-zero git here means "nothing to fold," not a fatal error.
  return r.status === 0 && typeof r.stdout === 'string' ? r.stdout : '';
}

/**
 * Detect a binary-or-empty file the same way the bash did with `grep -Iq .`
 * (grep -I treats binary as non-matching; `.` matches any text line, so a
 * non-zero exit means "binary or empty"). We read the bytes and look for a
 * NUL — the canonical binary marker — and treat zero-length as skip too.
 */
function isBinaryOrEmpty(path: string): boolean {
  let buf: Buffer;
  try {
    buf = readFileSync(path);
  } catch {
    return true;
  }
  if (buf.length === 0) return true;
  return buf.includes(0x00);
}

function fileSize(path: string): number {
  try {
    return statSync(path).size;
  } catch {
    return 0;
  }
}

export function assembleImplementPayload(
  args: ImplementPayloadArgs,
): ImplementPayload {
  const { repoRoot, base } = args;
  const budget = args.budgetBytes ?? DEFAULT_UNTRACKED_FOLD_BUDGET;
  const warn = args.warn ?? ((m: string) => process.stderr.write(`${m}\n`));

  // specs/014 US5: repo-relative feature root (POSIX separators for git
  // pathspecs) when the caller resolved one.
  const featureRel =
    args.featureRoot !== undefined
      ? relative(repoRoot, args.featureRoot).split(sep).join('/')
      : undefined;

  // specs/014 US5 (FR-007): exclude the feature's own audit-log from the
  // committed-diff arm — lift commits land inside the diff range, so
  // without the pathspec exclusion the payload quotes its own findings
  // back to the model fleet (the AUDIT-28/42/48 generator).
  const diffArgs =
    featureRel !== undefined
      ? ['diff', base, '--', '.', `:(exclude)${featureRel}/audit-log.md`]
      : ['diff', base];
  let diff = git(repoRoot, diffArgs);
  const committedDiffEmpty = diff.trim().length === 0;

  // AUDIT-20260605-01: fold untracked-but-not-ignored files so newly-added work
  // is audited too. AUDIT-20260605-06: bounded (binary-skip + byte cap).
  const skippedBinary: string[] = [];
  const skippedOverBudget: string[] = [];
  let foldedBytes = 0;

  const untracked = git(repoRoot, ['ls-files', '--others', '--exclude-standard'])
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    // specs/014 US5 (FR-008): with a feature root resolved, the fold is
    // scoped to files under it — minus the audit-log itself. The
    // recorded defect swept unrelated features' untracked scaffolds
    // into the audited payload; the feature's own files still fold.
    .filter((rel) => {
      if (featureRel === undefined) return true;
      if (!rel.startsWith(`${featureRel}/`)) return false;
      return rel !== `${featureRel}/audit-log.md`;
    });

  for (const rel of untracked) {
    const abs = join(repoRoot, rel);
    if (isBinaryOrEmpty(abs)) {
      // AUDIT-20260605-06: never ship binary blobs off-box.
      warn(`govern: skipping untracked binary/empty file ${rel} (not folded into the audit diff).`);
      skippedBinary.push(rel);
      continue;
    }
    const sz = fileSize(abs);
    if (foldedBytes + sz > budget) {
      // AUDIT-20260605-12: skip ONLY this oversized file and keep packing
      // smaller ones — `continue` (not `break`), and do NOT increment
      // foldedBytes, so later files that still fit are folded. Logged (no
      // silent cap).
      warn(
        `govern: untracked file ${rel} (${sz} bytes) would exceed the fold budget ` +
          `(${budget} bytes); skipping it but continuing with smaller files ` +
          `(not silently — audit it by committing first).`,
      );
      skippedOverBudget.push(rel);
      continue;
    }
    // Render the untracked file as an all-added diff via --no-index WITHOUT
    // mutating the index (mirrors the bash `git diff --no-index -- /dev/null`).
    const r = spawnSync(
      'git',
      ['-C', repoRoot, 'diff', '--no-index', '--no-color', '--', '/dev/null', abs],
      { encoding: 'utf8' },
    );
    // `git diff --no-index` exits 1 when there IS a difference (always, for an
    // all-added file) — capture stdout regardless of the non-zero exit.
    const folded = typeof r.stdout === 'string' ? r.stdout : '';
    if (folded.length > 0) {
      diff = `${diff}\n${folded}`;
      foldedBytes += sz;
    }
  }

  const commitSubjects = git(repoRoot, ['log', `${base}..HEAD`, '--oneline']);

  return {
    diff: committedDiffEmpty && foldedBytes === 0 ? '' : diff,
    commitSubjects,
    empty: committedDiffEmpty && foldedBytes === 0,
    skippedBinary,
    skippedOverBudget,
  };
}
