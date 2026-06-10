/**
 * plugins/stack-control/src/scope-discovery/summary.ts
 *
 * Day-to-day "how many pending clone groups touch my surface?" reporter.
 * Reads the per-codebase clones baseline and a surface glob, expands the glob
 * via the shared compiler in `util/glob.ts`, and prints a 4-field summary on a
 * single line:
 *
 *   total: N | pending-touching: M | pending-intra: K | dispositioned-touching: L
 *
 * Vocabulary:
 *   - total                  : every clone group in clones.yaml.
 *   - pending-touching       : disposition == 'pending' AND at least one
 *                              member's bare path matches the surface glob.
 *   - pending-intra          : disposition == 'pending' AND ALL members'
 *                              bare paths match the surface glob.
 *   - dispositioned-touching : disposition != 'pending' AND at least one
 *                              member matches the glob.
 *
 * "intra" is a subset of "touching" by construction.
 *
 * Generalized from dw-lifecycle (010 / US6): the clones baseline defaults to
 * the PER-CODEBASE path under the nearest-enclosing installation root (via the
 * shared `resolveBaselinePath`) instead of a fixed
 * `.dw-lifecycle/scope-discovery/clones.yaml` relative to cwd. `--clones`
 * overrides; `--at <dir>` overrides the installation walk-up start.
 *
 * CLI:
 *   --surface <glob>   (required) the surface glob; matched against each
 *                      member's BARE file-path.
 *   --clones <path>    override the clones.yaml path (default: per-codebase).
 *   --at <dir>         installation walk-up start dir (default: cwd).
 *   --json             emit a JSON object with the four counts + paths.
 *   --verbose          additionally print each matching group to stderr.
 *
 * Exit codes:
 *   0   summary produced (regardless of count values).
 *   2   invalid CLI args, no enclosing installation, missing/malformed
 *       clones.yaml, or invalid glob.
 */

import { readFile } from 'node:fs/promises';
import { type CloneGroup, extractBarePath, parseClonesYaml } from './clones-yaml.js';
import { resolveBaselinePath } from './baseline-path.js';
import { globToRegex } from './util/glob.js';
import { errorMessage } from './util/typeguards.js';

export interface SummaryCounts {
  readonly total: number;
  readonly pendingTouching: number;
  readonly pendingIntra: number;
  readonly dispositionedTouching: number;
}

export interface MatchingGroup {
  readonly id: string;
  readonly matchingMembers: number;
  readonly totalMembers: number;
  readonly disposition: CloneGroup['disposition'];
  readonly allMatch: boolean;
}

export interface SummaryResult {
  readonly counts: SummaryCounts;
  /** Groups with at least one matching member, regardless of disposition. */
  readonly matchingGroups: readonly MatchingGroup[];
}

/**
 * Pure computation: given a list of clone groups + a compiled glob, return the
 * four counts and the per-group match details. Exported so tests can exercise
 * the math without subprocess overhead.
 */
export function computeSummary(
  clones: readonly CloneGroup[],
  surfaceRegex: RegExp,
): SummaryResult {
  let pendingTouching = 0;
  let pendingIntra = 0;
  let dispositionedTouching = 0;
  const matching: MatchingGroup[] = [];
  for (const group of clones) {
    const total = group.members.length;
    let matched = 0;
    for (const member of group.members) {
      const bare = extractBarePath(member);
      if (surfaceRegex.test(bare)) matched += 1;
    }
    if (matched === 0) continue;
    const allMatch = matched === total;
    matching.push({
      id: group.id,
      matchingMembers: matched,
      totalMembers: total,
      disposition: group.disposition,
      allMatch,
    });
    if (group.disposition === 'pending') {
      pendingTouching += 1;
      if (allMatch) pendingIntra += 1;
    } else {
      dispositionedTouching += 1;
    }
  }
  return {
    counts: {
      total: clones.length,
      pendingTouching,
      pendingIntra,
      dispositionedTouching,
    },
    matchingGroups: matching,
  };
}

/** Format the four-field summary line. Stable, machine-parseable. */
export function formatSummaryLine(counts: SummaryCounts): string {
  return (
    `total: ${counts.total} | ` +
    `pending-touching: ${counts.pendingTouching} | ` +
    `pending-intra: ${counts.pendingIntra} | ` +
    `dispositioned-touching: ${counts.dispositionedTouching}`
  );
}

interface ParsedArgs {
  readonly surface: string;
  /** `--clones` override (relative to installation root), or null for per-codebase default. */
  readonly clonesOverride: string | null;
  readonly at: string | null;
  readonly json: boolean;
  readonly verbose: boolean;
}

function printHelp(): void {
  process.stdout.write(
    [
      'Usage: stackctl scope-summary --surface <glob> [options]',
      '',
      'Day-to-day reporter: how many clone groups touch a surface.',
      '',
      'Required:',
      '  --surface <glob>   Surface glob (matched against bare member paths)',
      '',
      'Options:',
      '  --clones <path>    Override clones.yaml path (default: per-codebase baseline)',
      '  --at <dir>         Installation walk-up start dir (default: cwd)',
      '  --json             Emit a JSON object with the four counts',
      '  --verbose          Print each matching group id + match count to stderr',
      '  --help, -h         Show this help',
      '',
      'Exit codes: 0 summary produced, 2 invalid args / no install / missing clones.yaml.',
      '',
    ].join('\n'),
  );
}

/**
 * CLI argument parser. Throws on missing required arg or unknown flag; the
 * caller catches and exits 2.
 */
function parseArgs(argv: readonly string[]): ParsedArgs {
  let surface: string | null = null;
  let clonesOverride: string | null = null;
  let at: string | null = null;
  let json = false;
  let verbose = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else if (arg === '--surface') {
      const next = argv[i + 1];
      if (next === undefined) throw new Error(`--surface requires a value`);
      surface = next;
      i += 1;
    } else if (arg === '--clones') {
      const next = argv[i + 1];
      if (next === undefined) throw new Error(`--clones requires a path value`);
      clonesOverride = next;
      i += 1;
    } else if (arg === '--at') {
      const next = argv[i + 1];
      if (next === undefined) throw new Error(`--at requires a path value`);
      at = next;
      i += 1;
    } else if (arg === '--json') {
      json = true;
    } else if (arg === '--verbose') {
      verbose = true;
    } else {
      throw new Error(`unknown flag: ${arg}`);
    }
  }
  if (surface === null) {
    throw new Error(
      `--surface <glob> is required (e.g. --surface 'plugins/stack-control/src/**')`,
    );
  }
  return { surface, clonesOverride, at, json, verbose };
}

async function loadClones(path: string): Promise<readonly CloneGroup[]> {
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch (err) {
    throw new Error(`failed to read clones file at ${path}: ${errorMessage(err)}`);
  }
  const parsed = parseClonesYaml(text);
  if (parsed === null) {
    throw new Error(
      `clones file at ${path} has malformed shape (missing top-level keys or wrong types)`,
    );
  }
  return parsed.clones;
}

interface MainResult {
  readonly code: 0 | 2;
  readonly summary?: SummaryResult;
  readonly resolvedClonesPath?: string;
}

/**
 * Programmatic entrypoint. Exported so tests can drive it without spawning a
 * subprocess. Catches user-input errors (bad args, missing files, bad glob)
 * and converts them to exit code 2 + an actionable stderr message.
 */
export async function runSummary(argv: readonly string[]): Promise<MainResult> {
  let args: ParsedArgs;
  try {
    args = parseArgs(argv);
  } catch (err) {
    process.stderr.write(`error: ${errorMessage(err)}\n`);
    return { code: 2 };
  }
  let regex: RegExp;
  try {
    regex = globToRegex(args.surface);
  } catch (err) {
    process.stderr.write(`error: invalid --surface glob: ${errorMessage(err)}\n`);
    return { code: 2 };
  }
  let clonesPath: string;
  try {
    clonesPath = resolveBaselinePath({
      startDir: args.at ?? process.cwd(),
      override: args.clonesOverride,
      explicitRoot: args.at,
    });
  } catch (err) {
    process.stderr.write(`error: ${errorMessage(err)}\n`);
    return { code: 2 };
  }
  let clones: readonly CloneGroup[];
  try {
    clones = await loadClones(clonesPath);
  } catch (err) {
    process.stderr.write(`error: ${errorMessage(err)}\n`);
    return { code: 2, resolvedClonesPath: clonesPath };
  }
  const summary = computeSummary(clones, regex);
  if (args.json) {
    const payload = {
      surface: args.surface,
      clones: clonesPath,
      total: summary.counts.total,
      'pending-touching': summary.counts.pendingTouching,
      'pending-intra': summary.counts.pendingIntra,
      'dispositioned-touching': summary.counts.dispositionedTouching,
    };
    process.stdout.write(`${JSON.stringify(payload)}\n`);
  } else {
    process.stdout.write(`${formatSummaryLine(summary.counts)}\n`);
  }
  if (args.verbose) {
    for (const g of summary.matchingGroups) {
      const tag = g.allMatch ? 'intra' : 'touching';
      process.stderr.write(
        `  ${g.id}  ${g.disposition}  ${tag}  ${g.matchingMembers}/${g.totalMembers}\n`,
      );
    }
  }
  return { code: 0, summary, resolvedClonesPath: clonesPath };
}

/**
 * Subcommand entry. Bridges the MainResult's numeric code into a process.exit
 * so the dispatcher's contract (handlers exit the process) is honored.
 */
export async function scopeSummaryMain(args: string[]): Promise<void> {
  const result = await runSummary(args);
  process.exit(result.code);
}
