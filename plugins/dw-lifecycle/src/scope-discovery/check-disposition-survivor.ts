/**
 * plugins/dw-lifecycle/src/scope-discovery/check-disposition-survivor.ts
 *
 * Pre-commit gate (TF-013 / AUDIT-20260525-06 / #289 — "Heavy" option).
 * Fails the commit when any clone-group's disposition reverts from a
 * protected non-pending state (`keep-with-reason`, `refactor`,
 * `ignore-with-justification`) back to `pending` without operator
 * acknowledgment via `--allow-disposition-loss`.
 *
 * Why this gate exists: the clone-detector's regen path can silently
 * wipe operator-curated dispositions in failure modes the unit-level
 * `mergeDispositions` contract doesn't catch (the original audit names
 * the malformed-baseline → silent-empty path; this gate catches THAT
 * failure mode AND any future regression of the same shape, regardless
 * of root cause). The gate is the architectural floor — even if every
 * upstream merge bug is fixed, the gate ensures a destructive diff
 * can never reach a commit without explicit operator override.
 *
 * Comparison semantics: reads the HEAD version of `<baseline>` (via
 * `git show HEAD:<baseline>`) and the working-tree version (via
 * `readFile`). For every entry in HEAD with `disposition ∈
 * {keep-with-reason, refactor, ignore-with-justification}`, look up
 * the same `id` in the working-tree version. A "destructive transition"
 * is:
 *   - same id present in BOTH versions, AND
 *   - HEAD disposition is non-pending, AND
 *   - working-tree disposition is `pending`.
 *
 * Entries that legitimately disappear (id removed from working tree)
 * or change id (membership/content change → fresh id) are NOT flagged
 * — those are either operator-driven refactors or content-driven id
 * rolls, both of which are visible in the standard pre-commit
 * clone-detector diff. This gate's narrow job is to catch the SILENT
 * loss path where the id stays the same but the disposition reverts.
 *
 * Invocation:
 *   dw-lifecycle check-disposition-survivor
 *   dw-lifecycle check-disposition-survivor --allow-disposition-loss
 *   dw-lifecycle check-disposition-survivor --baseline <path>
 *   dw-lifecycle check-disposition-survivor --head-ref <ref>
 *
 * Exit codes:
 *   0   no destructive transitions detected, OR working tree has no
 *       baseline file (vacuously satisfied), OR HEAD has no baseline
 *       (first commit; nothing to diff against), OR
 *       --allow-disposition-loss accepts the losses with a warning.
 *   1   one or more non-pending → pending transitions detected.
 *   2   I/O, parse, or git error.
 */

import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  type CloneGroup,
  type ClonesYaml,
  type Disposition,
  parseClonesYamlStrict,
} from './clones-yaml.js';
import { FeatureNotFoundError, resolveFeatureScope } from './resolve-feature-scope.js';
import { errorMessage, isEnoent } from './util/typeguards.js';

const DEFAULT_BASELINE = '.dw-lifecycle/scope-discovery/clones.yaml';
const DEFAULT_HEAD_REF = 'HEAD';

/**
 * The non-pending dispositions the gate protects. Centralised here so a
 * future disposition addition (e.g., 'deferred') can opt-in to survivor
 * protection by appending its identifier rather than scattering the set
 * across the predicate sites.
 */
const PROTECTED_DISPOSITIONS: readonly Disposition[] = [
  'keep-with-reason',
  'ignore-with-justification',
  'refactor',
];

function isProtected(disposition: Disposition): boolean {
  return (PROTECTED_DISPOSITIONS as readonly string[]).includes(disposition);
}

export interface Cli {
  readonly allowDispositionLoss: boolean;
  readonly baseline: string;
  readonly headRef: string;
  readonly repoRoot: string;
  /**
   * Phase 18: per-feature narrowing slug. When set, only clone-group
   * entries whose group has ≥1 member in feature-scope (per
   * resolveFeatureScope's hybrid scope-manifest-or-git-diff source)
   * are checked for the silent non-pending → pending reversion.
   * Refs #417.
   */
  readonly feature: string | null;
}

function parseCli(argv: readonly string[]): Cli {
  let allowDispositionLoss = false;
  let baseline = DEFAULT_BASELINE;
  let headRef = DEFAULT_HEAD_REF;
  let repoRoot = process.cwd();
  let feature: string | null = null;
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--allow-disposition-loss') allowDispositionLoss = true;
    else if (a === '--baseline') {
      const next = argv[++i];
      if (next === undefined) throw new Error('--baseline requires a path');
      baseline = next;
    } else if (a === '--head-ref') {
      const next = argv[++i];
      if (next === undefined) throw new Error('--head-ref requires a ref');
      headRef = next;
    } else if (a === '--repo') {
      const next = argv[++i];
      if (next === undefined) throw new Error('--repo requires a path');
      repoRoot = next;
    } else if (a === '--feature') {
      const next = argv[++i];
      if (next === undefined) throw new Error('--feature requires a slug');
      feature = next;
    } else if (a === '--help' || a === '-h') {
      printHelp();
      process.exit(0);
      throw new Error('unreachable');
    } else {
      throw new Error(`unknown arg: ${a}`);
    }
  }
  return { allowDispositionLoss, baseline, headRef, repoRoot, feature };
}

function printHelp(): void {
  process.stdout.write(
    [
      'dw-lifecycle check-disposition-survivor [options]',
      '',
      'Pre-commit gate that fails when an operator-curated disposition',
      '(keep-with-reason, refactor, ignore-with-justification) reverts',
      'silently to `pending` in the working tree.',
      '',
      'Options:',
      '  --allow-disposition-loss  Accept the losses with a warning (operator-conscious override).',
      '  --baseline <path>         Override baseline path (default: .dw-lifecycle/scope-discovery/clones.yaml).',
      '  --head-ref <ref>          Override git ref the working tree is compared against (default: HEAD).',
      '  --repo <path>             Override repo root (default: cwd).',
      '  --help, -h                Show this help.',
      '',
    ].join('\n'),
  );
}

/**
 * Discriminated result for `gitShowBlob`. The shape encodes the three
 * cases the caller distinguishes — file exists at the requested ref vs.
 * file missing from that ref vs. a real git error (repo not initialized,
 * bad ref, etc.). Keeps the caller branchable without an `isMissing`
 * heuristic on stderr text.
 */
type GitShowResult =
  | { readonly ok: true; readonly text: string }
  | { readonly ok: false; readonly missing: true }
  | { readonly ok: false; readonly missing: false; readonly stderr: string };

/**
 * Read a blob from git via `git show <spec>`. spec example:
 *   "HEAD:.dw-lifecycle/scope-discovery/clones.yaml"  — HEAD's version
 *
 * Distinguishes "blob does not exist at this ref" (missing) from "git
 * itself errored" (e.g., not a git repo). Missing is a normal branch
 * the caller handles; git error is exit 2.
 */
function gitShowBlob(spec: string, cwd: string): GitShowResult {
  const result = spawnSync('git', ['show', spec], {
    cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
  });
  if (result.status === 0) {
    return { ok: true, text: result.stdout };
  }
  const stderr = result.stderr;
  if (
    /exists on disk, but not in/.test(stderr) ||
    /does not exist/.test(stderr) ||
    /^fatal: path '.*' does not exist in/m.test(stderr) ||
    /unknown revision or path/.test(stderr)
  ) {
    return { ok: false, missing: true };
  }
  return { ok: false, missing: false, stderr };
}

export interface Transition {
  readonly id: string;
  readonly headDisposition: Disposition;
  readonly workingDisposition: Disposition;
  readonly headReason: string | null;
  readonly firstMember: string;
}

/**
 * Compute the destructive-transition list (HEAD non-pending → working
 * pending, matched by id). Pure function over two parsed `ClonesYaml`
 * documents; the I/O happens in `main()`. Exported for direct unit
 * testing without the git-side fixtures.
 *
 * Phase 18: when `featureScopeFiles` is provided, only HEAD entries
 * whose group has ≥1 member in scope are considered. Refs #417.
 */
export function findDestructiveTransitions(
  headDoc: ClonesYaml,
  workingDoc: ClonesYaml,
  featureScopeFiles?: ReadonlySet<string>,
): readonly Transition[] {
  const workingById = new Map<string, CloneGroup>();
  for (const g of workingDoc.clones) workingById.set(g.id, g);
  const out: Transition[] = [];
  for (const headEntry of headDoc.clones) {
    if (!isProtected(headEntry.disposition)) continue;
    if (featureScopeFiles !== undefined) {
      const inScope = headEntry.members.some((m) =>
        featureScopeFiles.has(stripMemberRange(m)),
      );
      if (!inScope) continue;
    }
    const workingEntry = workingById.get(headEntry.id);
    if (workingEntry === undefined) continue; // dropped entirely; not this gate's job
    if (workingEntry.disposition !== 'pending') continue; // disposition preserved (or changed but still non-pending)
    out.push({
      id: headEntry.id,
      headDisposition: headEntry.disposition,
      workingDisposition: workingEntry.disposition,
      headReason: headEntry.reason,
      firstMember: headEntry.members[0] ?? '<no-members>',
    });
  }
  return out;
}

/** Strip jscpd's `:start:end` suffix from a clone member entry. */
function stripMemberRange(member: string): string {
  const lastColon = member.lastIndexOf(':');
  if (lastColon < 0) return member;
  const prev = member.lastIndexOf(':', lastColon - 1);
  return prev < 0 ? member : member.slice(0, prev);
}

function reportTransitions(
  transitions: readonly Transition[],
  baseline: string,
): void {
  process.stderr.write(
    `check-disposition-survivor: ${transitions.length} entries would silently revert ` +
      `to \`pending\` in this commit's ${baseline} diff:\n\n`,
  );
  for (const t of transitions) {
    process.stderr.write(`  id: ${t.id}\n`);
    process.stderr.write(`    HEAD disposition:    ${t.headDisposition}\n`);
    process.stderr.write(`    working disposition: ${t.workingDisposition}\n`);
    process.stderr.write(`    first member:        ${t.firstMember}\n`);
    if (t.headReason !== null) {
      const firstLine = t.headReason.split('\n')[0] ?? '';
      const truncated = firstLine.slice(0, 120);
      const ellipsis = firstLine.length > 120 ? '…' : '';
      process.stderr.write(`    HEAD reason:         ${truncated}${ellipsis}\n`);
    }
    process.stderr.write('\n');
  }
  process.stderr.write(
    `If the disposition loss is intentional (e.g., you are converting the entry to\n` +
      `\`pending\` deliberately), re-run with --allow-disposition-loss to override the\n` +
      `gate. Otherwise, restore the disposition in ${baseline} before committing — the\n` +
      `previous reason is in HEAD's version of the file ` +
      `(\`git show HEAD:${baseline}\`).\n`,
  );
}

function reportAllowed(
  transitions: readonly Transition[],
): void {
  process.stderr.write(
    `check-disposition-survivor: --allow-disposition-loss override; ` +
      `${transitions.length} non-pending → pending transition(s) accepted.\n`,
  );
  for (const t of transitions) {
    process.stderr.write(
      `  ${t.id}: ${t.headDisposition} → ${t.workingDisposition}\n`,
    );
  }
}

async function readWorkingTree(absPath: string): Promise<string | null> {
  try {
    return await readFile(absPath, 'utf8');
  } catch (err) {
    if (isEnoent(err)) return null;
    throw err;
  }
}

/**
 * Programmatic entrypoint. Exported so the adversarial validator harness
 * can drive the gate without subprocess overhead. Returns the exit code
 * (0/1/2) the CLI should produce.
 */
export async function runCheck(cli: Cli): Promise<number> {
  const headSpec = `${cli.headRef}:${cli.baseline}`;
  const headResult = gitShowBlob(headSpec, cli.repoRoot);
  if (!headResult.ok && !headResult.missing) {
    process.stderr.write(
      `check-disposition-survivor: git show ${headSpec} failed:\n${headResult.stderr}\n`,
    );
    return 2;
  }
  if (!headResult.ok) {
    // No HEAD version of the baseline — nothing to compare against.
    return 0;
  }

  const absPath = resolve(cli.repoRoot, cli.baseline);
  let workingText: string | null;
  try {
    workingText = await readWorkingTree(absPath);
  } catch (err) {
    process.stderr.write(
      `check-disposition-survivor: failed to read ${absPath}: ${errorMessage(err)}\n`,
    );
    return 2;
  }
  if (workingText === null) {
    // Working tree doesn't have the file — file was deleted. Outside
    // this gate's remit (the standard pre-commit diff already surfaces
    // a deletion).
    return 0;
  }

  let headDoc: ClonesYaml;
  let workingDoc: ClonesYaml;
  try {
    headDoc = parseClonesYamlStrict(headResult.text);
  } catch (err) {
    process.stderr.write(
      `check-disposition-survivor: failed to parse HEAD's ${cli.baseline}: ${errorMessage(err)}\n`,
    );
    return 2;
  }
  try {
    workingDoc = parseClonesYamlStrict(workingText);
  } catch (err) {
    process.stderr.write(
      `check-disposition-survivor: failed to parse working-tree ${cli.baseline}: ${errorMessage(err)}\n`,
    );
    return 2;
  }

  // Phase 18: when --feature is set, narrow the survivor check to
  // clone groups whose ≥1 member is in feature-scope. Refs #417.
  let featureScopeFiles: ReadonlySet<string> | undefined;
  if (cli.feature !== null && cli.feature !== undefined) {
    try {
      const scope = await resolveFeatureScope({
        slug: cli.feature,
        repoRoot: cli.repoRoot,
      });
      featureScopeFiles = new Set(scope.files);
    } catch (err) {
      if (err instanceof FeatureNotFoundError) {
        process.stderr.write(`check-disposition-survivor: ${err.message}\n`);
        return 2;
      }
      throw err;
    }
  }

  const transitions = findDestructiveTransitions(headDoc, workingDoc, featureScopeFiles);
  if (transitions.length === 0) return 0;

  if (cli.allowDispositionLoss) {
    reportAllowed(transitions);
    return 0;
  }

  reportTransitions(transitions, cli.baseline);
  return 1;
}

export async function main(argv: readonly string[]): Promise<number> {
  let cli: Cli;
  try {
    cli = parseCli(argv);
  } catch (err) {
    process.stderr.write(
      `check-disposition-survivor: ${errorMessage(err)}\n`,
    );
    return 2;
  }
  return runCheck(cli);
}

function isCliEntryPoint(): boolean {
  if (typeof process === 'undefined' || process.argv.length < 2) return false;
  const invoked = process.argv[1];
  if (invoked === undefined) return false;
  return invoked === fileURLToPath(import.meta.url);
}

if (isCliEntryPoint()) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (err: unknown) => {
      process.stderr.write(
        `check-disposition-survivor: fatal: ${errorMessage(err)}\n`,
      );
      process.exit(2);
    },
  );
}
