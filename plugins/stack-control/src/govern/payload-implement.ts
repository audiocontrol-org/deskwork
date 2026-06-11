/**
 * plugins/stack-control/src/govern/payload-implement.ts
 *
 * Implement-mode payload assembly for `stackctl govern --mode implement`.
 *
 * Ported verbatim-in-behavior from
 * `spec-kit/deskwork-governance/scripts/bash/govern.sh` (the bash
 * orchestration this consolidation replaces). The audit unit is the diff of
 * the just-implemented work + the repo's untracked-but-not-ignored files
 * (minus the feature's own audit-log, other features' audit-logs/roots,
 * and caller-threaded governance-bookkeeping paths when a feature root is
 * resolved — see ImplementPayloadArgs.featureRoot / excludeRoots /
 * excludePaths; AUDIT-20260611-08).
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
import { realpathSync, statSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { GovernPayloadError } from './payload-spec.js';
import { deriveGitToplevel } from '../scope-discovery/util/git-toplevel.js';

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
  /**
   * The verb-entry-resolved installation root (specs/installation-isolation
   * R1/R3) — the diff engine's anchor. Never a free repo-root parameter.
   */
  readonly installationRoot: string;
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
   * fold, and the untracked fold drops files under OTHER features'
   * roots (`excludeRoots`) — everything else, including the feature's
   * own files and new untracked source modules, folds in (FR-007 /
   * FR-008 as amended by AUDIT-20260611-01; the original
   * inclusion-scoped filter silently dropped untracked src/** —
   * exactly the surfaces AUDIT-20260605-01 added the fold for). When
   * absent, behavior is byte-identical to the pre-014 assembler — but
   * note govern's implement mode now REFUSES to run without a
   * resolved feature root (AUDIT-20260611-04: it FATALs at the
   * decision site instead of silently shipping the self-referential
   * repo-wide payload), so the absent case exists only for
   * non-govern/library callers and legacy tests.
   */
  readonly featureRoot?: string;
  /**
   * Absolute paths of EVERY feature root in the repo (the caller
   * enumerates them via `discoverFeatureRoots(repoRoot)` — runGovern is
   * async; this assembler stays sync). Untracked files under any root
   * OTHER than `featureRoot` are excluded from the fold — each drop is
   * warned and recorded in `skippedOtherFeature` (never silent). The
   * audited feature's own root may appear in this list; it is skipped.
   * Only consulted when `featureRoot` is supplied (AUDIT-20260611-01).
   * AUDIT-20260611-08: also consulted by the COMMITTED-diff arm — each
   * other feature root's `audit-log.md` (and ONLY its audit-log.md; a
   * sibling's other committed files are legitimate diff content) is
   * pathspec-excluded, closing the sibling-lift-in-shared-range channel.
   */
  readonly excludeRoots?: readonly string[];
  /**
   * Absolute paths of governance-bookkeeping directories (or files) to
   * exclude from BOTH the committed-diff arm and the untracked fold
   * (AUDIT-20260611-08: the backlog task store lives at the plugin root,
   * not under the feature root, so the featureRel pathspec misses it —
   * its per-round bookkeeping commits re-fed prior findings to the model
   * fleet). The CALLER owns these paths (runGovern threads the backlog
   * store derived from the backlog root seam; this assembler hardcodes
   * nothing). Rel-ified the same way `featureRoot` is; paths outside the
   * repo are inert (nothing repo-relative to exclude). Fold drops are
   * silent-by-design like the feature's own audit-log — governance
   * plumbing, not auditable work — unlike the warned+ledgered
   * other-feature drops. Only consulted when `featureRoot` is supplied.
   */
  readonly excludePaths?: readonly string[];
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
   * Untracked files skipped because they live under ANOTHER feature's
   * root (specs/014 US5 / FR-008 as amended by AUDIT-20260611-01).
   */
  readonly skippedOtherFeature: readonly string[];
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
  const { installationRoot, base } = args;
  const budget = args.budgetBytes ?? DEFAULT_UNTRACKED_FOLD_BUDGET;
  const warn = args.warn ?? ((m: string) => process.stderr.write(`${m}\n`));

  // specs/014 US5: installation-relative feature root (POSIX separators
  // for git pathspecs) when the caller resolved one. Under the isolation
  // model (specs/installation-isolation R3) the feature root may lie
  // OUTSIDE the installation subtree (the transitional cross-tree
  // layout): its rel-ification then escapes (`../…`) and the feature
  // folds in via the labeled cross-tree arm below instead of arm-1
  // pathspecs.
  const relify = (abs: string): string =>
    relative(installationRoot, abs).split(sep).join('/');
  const inRepo = (rel: string): boolean =>
    rel.length > 0 && rel !== '..' && !rel.startsWith('../');
  const featureRel =
    args.featureRoot !== undefined ? relify(args.featureRoot) : undefined;
  const featureInside = featureRel !== undefined && inRepo(featureRel);
  const crossTreeFeatureRoot =
    args.featureRoot !== undefined && !featureInside
      ? args.featureRoot
      : undefined;
  const otherFeatureRels =
    args.featureRoot !== undefined
      ? (args.excludeRoots ?? [])
          .map(relify)
          .filter((root) => inRepo(root) && root !== featureRel)
      : [];
  const excludePathRels =
    args.featureRoot !== undefined
      ? (args.excludePaths ?? []).map(relify).filter(inRepo)
      : [];

  // specs/014 US5 (FR-007): exclude the feature's own audit-log from the
  // committed-diff arm — lift commits land inside the diff range, so
  // without the pathspec exclusion the payload quotes its own findings
  // back to the model fleet (the AUDIT-28/42/48 generator).
  // AUDIT-20260611-08 widened the exclusion to the FULL governance-
  // bookkeeping surface FR-007 promises: the backlog task store
  // (caller-threaded `excludePaths` — per-round bookkeeping commits land
  // in the range the same way lift commits do) and every OTHER feature
  // root's audit-log.md (sibling lift commits sharing the diff range).
  // Decision recorded: only the audit-log.md under each excludeRoot is
  // excluded from the committed arm — a sibling's other committed files
  // are legitimate diff content; the FOLD keeps excluding other-feature
  // roots wholesale (below, unchanged).
  // specs/installation-isolation R3: the committed arm runs AT the
  // installation with `--relative` — paths in the payload are
  // installation-relative and the arm covers only the installation
  // subtree (at a single-rooted repo the anchor and the toplevel
  // coincide, so this is byte-compatible with the pre-isolation shape).
  const diffArgs =
    args.featureRoot !== undefined
      ? [
          'diff',
          '--relative',
          base,
          '--',
          '.',
          ...(featureInside ? [`:(exclude)${featureRel}/audit-log.md`] : []),
          ...otherFeatureRels.map((root) => `:(exclude)${root}/audit-log.md`),
          ...excludePathRels.map((rel) => `:(exclude)${rel}`),
        ]
      : ['diff', '--relative', base];
  let diff = git(installationRoot, diffArgs);
  const committedDiffEmpty = diff.trim().length === 0;

  // AUDIT-20260605-01: fold untracked-but-not-ignored files so newly-added work
  // is audited too. AUDIT-20260605-06: bounded (binary-skip + byte cap).
  const skippedBinary: string[] = [];
  const skippedOverBudget: string[] = [];
  const skippedOtherFeature: string[] = [];
  let foldedBytes = 0;

  // specs/014 US5 (FR-008, amended by AUDIT-20260611-01): the fold's
  // scoping is EXCLUSION-based, not inclusion-based. The feature root
  // is the spec/docs dir, not the feature's code — an inclusion filter
  // ("only files under the feature root") silently dropped untracked
  // source modules (src/**), the very surfaces AUDIT-20260605-01 added
  // the fold for. With a feature root resolved we exclude only (a) the
  // feature's own audit-log, (b) files under OTHER features' roots
  // (the recorded parked-scaffold pull) — each (b) drop warned +
  // ledgered below — and (c) the caller-threaded governance-bookkeeping
  // paths (AUDIT-20260611-08), silent-by-design like (a). Everything
  // else folds.
  const underExcludePath = (rel: string): boolean =>
    excludePathRels.some((p) => rel === p || rel.startsWith(`${p}/`));

  const untracked = git(installationRoot, ['ls-files', '--others', '--exclude-standard'])
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    // specs/014 US5 (FR-007): the feature's own audit-log never folds.
    .filter((rel) => !featureInside || rel !== `${featureRel}/audit-log.md`)
    // AUDIT-20260611-08: governance-bookkeeping store never folds
    // (silent-by-design — governance plumbing, mirrors the audit-log).
    .filter((rel) => !underExcludePath(rel));

  for (const rel of untracked) {
    const abs = join(installationRoot, rel);
    if (otherFeatureRels.some((root) => rel.startsWith(`${root}/`))) {
      // AUDIT-20260611-01: another feature's untracked scaffold — out of
      // the audited payload, but VISIBLY (warn + ledger; the binary and
      // budget skips set the style).
      warn(
        `govern: skipping untracked file ${rel} (under another feature's root, ` +
          `not the feature under audit; not folded into the audit diff).`,
      );
      skippedOtherFeature.push(rel);
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
    // AUDIT-20260611-01: pass the repo-relative `rel` (NOT `abs`) — git runs
    // with `-C installationRoot`, so it resolves `rel` against that cwd and
    // ECHOES the relative path into the diff headers, keeping the payload
    // installation-relative (no absolute filesystem paths off-box; anchors
    // join with the committed arm's --relative paths). `abs` stays for the
    // isBinaryOrEmpty/fileSize checks above, which run in THIS process.
    const r = spawnSync(
      'git',
      ['-C', installationRoot, 'diff', '--no-index', '--no-color', '--', '/dev/null', rel],
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

  // specs/installation-isolation R3/R4: when the resolved feature root
  // lies outside the installation subtree (transitional layout), fold it
  // in as an explicit, LABELED second diff arm anchored at the derived
  // git toplevel — spec artifacts are never silently absent from the
  // governed payload (FR-005: a payload that cannot carry them is FATAL,
  // not partial). The cross-tree anchor is announced once (R4/SC-006).
  let crossTreeArm = '';
  if (crossTreeFeatureRoot !== undefined) {
    warn(
      `govern: feature anchor outside the installation: ${crossTreeFeatureRoot} ` +
        `(designated anchor — artifacts land there)`,
    );
    // AUDIT-20260611-03: the budget is per-PAYLOAD, so the arm shares the
    // main fold's running total (the main fold runs first; the arm
    // continues from where it left off) and its over-budget skips land in
    // the same skippedOverBudget ledger.
    const arm = assembleCrossTreeFeatureArm({
      installationRoot,
      base,
      featureRoot: crossTreeFeatureRoot,
      budgetBytes: budget,
      foldedBytes,
      warn,
    });
    crossTreeArm = arm.arm;
    foldedBytes = arm.foldedBytes;
    skippedOverBudget.push(...arm.skippedOverBudget);
    if (crossTreeArm.length > 0) {
      diff = `${diff}\n${crossTreeArm}`;
    }
  }

  const commitSubjects = git(installationRoot, ['log', `${base}..HEAD`, '--oneline']);

  const armEmpty = crossTreeArm.trim().length === 0;
  const empty = committedDiffEmpty && foldedBytes === 0 && armEmpty;
  return {
    diff: empty ? '' : diff,
    commitSubjects,
    empty,
    skippedBinary,
    skippedOverBudget,
    skippedOtherFeature,
  };
}

/**
 * Build the labeled cross-tree feature arm (R3): the committed diff +
 * untracked fold scoped to the feature root, anchored at the git
 * toplevel derived FROM the installation (FR-004 — the toplevel is read
 * from git's own marker, never accepted as a parameter). The feature's
 * own audit-log.md stays excluded from both halves (FR-007). Any
 * condition that would silently omit in-range feature artifacts is a
 * loud GovernPayloadError instead (FR-005).
 */
function assembleCrossTreeFeatureArm(args: {
  readonly installationRoot: string;
  readonly base: string;
  readonly featureRoot: string;
  /** Per-payload soft budget shared with the main fold (AUDIT-20260611-03). */
  readonly budgetBytes: number;
  /** Running folded-byte total carried over from the main fold. */
  readonly foldedBytes: number;
  readonly warn: (message: string) => void;
}): {
  readonly arm: string;
  readonly foldedBytes: number;
  readonly skippedOverBudget: readonly string[];
} {
  const { installationRoot, base, featureRoot, budgetBytes, warn } = args;
  let foldedBytes = args.foldedBytes;
  const skippedOverBudget: string[] = [];
  // Shared raw derivation (AUDIT-20260611-04); the arm needs the
  // toplevel even when it IS the installation root, so the distinct
  // variant doesn't apply here.
  const toplevel = deriveGitToplevel(installationRoot);
  if (toplevel === null) {
    throw new GovernPayloadError(
      `govern: FATAL — feature root ${featureRoot} lies outside the installation ` +
        `and no git toplevel could be derived to fold it; refusing a payload that ` +
        `would silently omit feature artifacts (FR-005).`,
    );
  }
  // Compare realpaths: git prints the symlink-resolved toplevel (macOS
  // /var → /private/var), while the caller's featureRoot may carry the
  // unresolved spelling.
  const real = (p: string): string => {
    try {
      return realpathSync(p);
    } catch {
      return p;
    }
  };
  const featureRelTop = relative(real(toplevel), real(featureRoot))
    .split(sep)
    .join('/');
  if (
    featureRelTop.length === 0 ||
    featureRelTop === '..' ||
    featureRelTop.startsWith('../')
  ) {
    throw new GovernPayloadError(
      `govern: FATAL — feature root ${featureRoot} lies outside the derived git ` +
        `toplevel ${toplevel}; refusing a payload that would silently omit feature ` +
        `artifacts (FR-005).`,
    );
  }
  const armDiff = spawnSync(
    'git',
    [
      '-C',
      toplevel,
      'diff',
      base,
      '--',
      featureRelTop,
      `:(exclude)${featureRelTop}/audit-log.md`,
    ],
    { encoding: 'utf8' },
  );
  if (armDiff.status !== 0 || typeof armDiff.stdout !== 'string') {
    throw new GovernPayloadError(
      `govern: FATAL — cross-tree feature arm diff failed (exit ${armDiff.status}) ` +
        `for ${featureRoot}; refusing a payload that would silently omit in-range ` +
        `feature artifacts (FR-005).`,
    );
  }
  // Untracked spec artifacts under the feature root fold too, under the
  // SAME rules as the installation fold: binary/empty skip + the shared
  // per-payload soft byte budget (AUDIT-20260611-03 — the arm previously
  // had no size bound, so an arbitrarily large untracked file under the
  // feature root folded in full). Over-budget files are skipped with the
  // AUDIT-20260605-12 semantics (warn + `continue` without consuming
  // budget, so later smaller files still fold) — every skip is warned,
  // never silent.
  let untrackedFold = '';
  const untracked = git(toplevel, [
    'ls-files',
    '--others',
    '--exclude-standard',
    '--',
    featureRelTop,
  ])
    .split('\n')
    .map((s2) => s2.trim())
    .filter((s2) => s2.length > 0)
    .filter((rel) => rel !== `${featureRelTop}/audit-log.md`);
  for (const rel of untracked) {
    const abs = join(toplevel, rel);
    if (isBinaryOrEmpty(abs)) {
      warn(
        `govern: skipping untracked binary/empty file ${rel} (cross-tree feature arm).`,
      );
      continue;
    }
    const sz = fileSize(abs);
    if (foldedBytes + sz > budgetBytes) {
      // AUDIT-20260611-03 / AUDIT-20260605-12: skip ONLY this oversized
      // file and keep packing smaller ones — `continue` (not `break`),
      // and do NOT increment foldedBytes. Logged (no silent cap).
      warn(
        `govern: untracked file ${rel} (${sz} bytes) would exceed the fold budget ` +
          `(${budgetBytes} bytes); skipping it but continuing with smaller files ` +
          `(not silently — audit it by committing first; cross-tree feature arm).`,
      );
      skippedOverBudget.push(rel);
      continue;
    }
    // AUDIT-20260611-01: same relative-operand rule as the installation
    // fold — git runs with `-C toplevel`, so passing `rel` makes the diff
    // headers toplevel-relative instead of leaking absolute paths.
    const r = spawnSync(
      'git',
      ['-C', toplevel, 'diff', '--no-index', '--no-color', '--', '/dev/null', rel],
      { encoding: 'utf8' },
    );
    const folded = typeof r.stdout === 'string' ? r.stdout : '';
    if (folded.length > 0) {
      untrackedFold += `\n${folded}`;
      foldedBytes += sz;
    }
  }
  const armBody = `${armDiff.stdout}${untrackedFold}`;
  if (armBody.trim().length === 0) {
    return { arm: '', foldedBytes, skippedOverBudget };
  }
  return {
    arm: `### cross-tree feature arm: ${featureRoot} ###\n${armBody}`,
    foldedBytes,
    skippedOverBudget,
  };
}
