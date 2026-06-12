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
import { join } from 'node:path';

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
   * specs/015 (FR-006/D7): the AuditUnit's path scope. When provided and
   * non-empty, only untracked files UNDER one of these repo-relative prefixes are
   * folded — unrelated parked-feature scaffolds are excluded by a bounded,
   * explicit inclusion rule (not a wholesale sweep). Absent/empty → fold every
   * untracked file (the pre-015 whole-feature behavior).
   */
  readonly pathScope?: readonly string[];
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
  /**
   * specs/015 (FR-006): untracked files skipped because they fell OUTSIDE the
   * unit's path scope (unrelated parked-feature scaffolds). Empty when no path
   * scope was supplied.
   */
  readonly skippedOutOfScope: readonly string[];
}

/**
 * specs/015 (FR-006): is `rel` within the unit's path scope? A prefix is a
 * directory or file path; `rel` matches when it equals a prefix or sits under a
 * prefix directory. An empty scope means "no bound" (every file is in scope).
 */
function inPathScope(rel: string, pathScope: readonly string[] | undefined): boolean {
  if (pathScope === undefined || pathScope.length === 0) return true;
  return pathScope.some((p) => {
    const prefix = p.replace(/\/+$/, '');
    return rel === prefix || rel.startsWith(`${prefix}/`);
  });
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

  let diff = git(repoRoot, ['diff', base]);
  const committedDiffEmpty = diff.trim().length === 0;

  // AUDIT-20260605-01: fold untracked-but-not-ignored files so newly-added work
  // is audited too. AUDIT-20260605-06: bounded (binary-skip + byte cap).
  const skippedBinary: string[] = [];
  const skippedOverBudget: string[] = [];
  const skippedOutOfScope: string[] = [];
  let foldedBytes = 0;

  const untracked = git(repoRoot, ['ls-files', '--others', '--exclude-standard'])
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (const rel of untracked) {
    const abs = join(repoRoot, rel);
    // FR-006/D7: bound the untracked fold to the unit's path scope — an unrelated
    // parked-feature scaffold (outside the scope) is excluded, not swept in.
    if (!inPathScope(rel, args.pathScope)) {
      warn(
        `govern: untracked file ${rel} is outside the audit unit's path scope; ` +
          `excluding it from the folded payload (FR-006, parked-scaffold exclusion).`,
      );
      skippedOutOfScope.push(rel);
      continue;
    }
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
    skippedOutOfScope,
  };
}
