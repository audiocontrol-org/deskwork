// plugins/stack-control/src/scope-discovery/clone-detector.ts
//
// Per-codebase TypeScript/TSX clone-detection gate. Ported from dw-lifecycle;
// the central GENERALIZATION (010 T016 / R1): the scan boundary is the resolved
// nearest-enclosing stack-control installation (codebase-boundary.ts), NOT
// `process.cwd()`/whole-repo. Nested child installations are added to jscpd's
// ignore list so a parent scan never reaches into a child codebase. This kills
// the cross-codebase false positive (e.g. audit-barrage vendored from
// dw-lifecycle into stack-control reported as a clone of its origin).
//
// Split (010): `detectCodebaseClones()` is the boundary-scoped pure-ish core
// (resolve boundary → jscpd → baseline diff; returns a result, never exits);
// `checkClones()` is the CLI wrapper (parse flags, render, write baseline,
// process.exit) used by the `stackctl check-clones` subcommand.
//
// The committed baseline lives at `<installation>/.stack-control/scope-discovery/
// clones.yaml` (per-codebase, R5); `--baseline` overrides.
//
// Exit code (checkClones): 0 no NEW groups (or first-run baseline written),
// 1 one or more NEW groups since the baseline, 2 I/O / parse / engine error.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import {
  type CloneDiff,
  type CloneGroup,
  type ClonesYaml,
  ClonesYamlParseError,
  diffClones,
  mergeDispositions,
  parseClonesYamlStrict,
  serializeClonesYaml,
} from './clones-yaml.js';
import { detectClonesViaJscpd } from './jscpd-runner.js';
import { resolveCodebaseBoundary, type CodebaseBoundary } from './codebase-boundary.js';
import { DEFAULT_BASELINE_REL } from './baseline-path.js';
import { errorMessage, isEnoent } from './util/typeguards.js';

export interface DetectCodebaseClonesOptions {
  /** Where to start the installation walk-up (default cwd for the CLI). */
  readonly startDir: string;
  /** `--root` override; when set, that path is the scan root verbatim. */
  readonly explicitRoot?: string | null;
  /** `--baseline` override; default = `<root>/.stack-control/scope-discovery/clones.yaml`. */
  readonly baselinePath?: string | null;
}

export interface DetectCodebaseClonesResult {
  readonly boundary: CodebaseBoundary;
  readonly groups: CloneGroup[];
  readonly diff: CloneDiff;
  readonly baseline: ClonesYaml | null;
  readonly baselineExisted: boolean;
  readonly baselineAbs: string;
}

/**
 * Resolve the codebase boundary, run jscpd scoped to it (excluding nested
 * children), read the committed baseline, and compute the NEW/DROPPED diff.
 * Pure of process state beyond filesystem reads — no `process.exit`, so it is
 * directly testable. Throws on malformed baseline / engine crash (callers map
 * to exit 2).
 */
export async function detectCodebaseClones(
  opts: DetectCodebaseClonesOptions,
): Promise<DetectCodebaseClonesResult> {
  const boundary = resolveCodebaseBoundary({
    startDir: opts.startDir,
    explicitRoot: opts.explicitRoot ?? null,
  });

  const groups = await detectClonesViaJscpd({
    root: boundary.installationRoot,
    ignore: boundary.excludedChildren,
  });

  const baselineAbs = resolve(
    boundary.installationRoot,
    opts.baselinePath ?? DEFAULT_BASELINE_REL,
  );
  const baseline = await readBaseline(baselineAbs);
  const baselineExisted = baseline !== null;
  const diff = diffClones(groups, baseline);

  return { boundary, groups, diff, baseline, baselineExisted, baselineAbs };
}

/**
 * Read the baseline file. Returns null ONLY when truly absent (ENOENT); a
 * present-but-malformed baseline throws `ClonesYamlParseError` so the gate
 * exits 2 rather than silently treating it as empty and wiping dispositions
 * on a subsequent refresh-write.
 */
async function readBaseline(path: string): Promise<ClonesYaml | null> {
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch (err) {
    if (isEnoent(err)) return null;
    throw err;
  }
  return parseClonesYamlStrict(text);
}

async function writeBaseline(path: string, doc: ClonesYaml): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, serializeClonesYaml(doc), 'utf8');
}

// ---- CLI wrapper ----------------------------------------------------------

interface Cli {
  readonly root: string | null;
  readonly quiet: boolean;
  readonly json: boolean;
  readonly baselinePath: string | null;
  readonly refreshBaseline: boolean;
  readonly diff: boolean;
  /** Accepted for symmetry with the other check-* verbs; check-clones already
   * exits 1 on NEW by default, so --gate-mode is a no-op here. */
  readonly gateMode: boolean;
}

function parseCli(argv: readonly string[]): Cli {
  let root: string | null = null;
  let quiet = false;
  let json = false;
  let baselinePath: string | null = null;
  let refreshBaseline = false;
  let diff = false;
  let gateMode = false;
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--root') {
      const next = argv[++i];
      if (next === undefined) throw new Error('--root requires a path');
      root = next;
    } else if (a === '--quiet') quiet = true;
    else if (a === '--json') json = true;
    else if (a === '--diff') diff = true;
    else if (a === '--baseline') {
      const next = argv[++i];
      if (next === undefined) throw new Error('--baseline requires a path');
      baselinePath = next;
    } else if (a === '--refresh-baseline') refreshBaseline = true;
    else if (a === '--gate-mode') gateMode = true;
    else throw new Error(`unknown arg: ${a}`);
  }
  return { root, quiet, json, baselinePath, refreshBaseline, diff, gateMode };
}

interface ReportOpts {
  readonly groups: readonly CloneGroup[];
  readonly diff: CloneDiff;
  readonly quiet: boolean;
  readonly baselineExisted: boolean;
}

/** `summary: N dropped, M new (net X)` — grep-distinct from the headline. */
function summaryLine(diff: CloneDiff): string {
  const newCount = diff.newGroups.length;
  const droppedCount = diff.droppedGroups.length;
  const net = newCount - droppedCount;
  const netStr = net >= 0 ? `+${net}` : `${net}`;
  return `summary: ${droppedCount} dropped, ${newCount} new (net ${netStr})`;
}

/** A paste-and-edit `stackctl batch-dispose` hint per NEW group. */
function batchDisposeHintLines(id: string, indent: string): readonly string[] {
  const lead = `${indent}  Run:  `;
  const cont = `${indent}          `;
  return [
    `${lead}stackctl batch-dispose \\\n`,
    `${cont}--ids ${id} \\\n`,
    `${cont}--disposition <keep-with-reason|ignore-with-justification> \\\n`,
    `${cont}--reason "<one-line rationale>"\n`,
  ];
}

function writeBatchDisposeHint(id: string, indent: string): void {
  for (const line of batchDisposeHintLines(id, indent)) process.stdout.write(line);
}

function reportDiff(diff: CloneDiff): void {
  for (const g of diff.newGroups) {
    process.stdout.write(`NEW    ${g.id} (${g.lines} lines)\n`);
    for (const m of g.members) process.stdout.write(`         ${m}\n`);
    writeBatchDisposeHint(g.id, '');
  }
  for (const g of diff.droppedGroups) {
    process.stdout.write(`DROPPED ${g.id} (${g.lines} lines)\n`);
    for (const m of g.members) process.stdout.write(`         ${m}\n`);
  }
  process.stdout.write(`${summaryLine(diff)}\n`);
}

function reportHuman(opts: ReportOpts): void {
  const { groups, diff, quiet, baselineExisted } = opts;
  if (quiet) {
    process.stdout.write(
      `${groups.length} groups; ${diff.newGroups.length} NEW; ${diff.droppedGroups.length} DROPPED\n`,
    );
    return;
  }
  if (groups.length === 0) {
    process.stdout.write('No clone groups detected.\n');
  } else {
    const minLines = groups.reduce((m, g) => Math.min(m, g.lines), Infinity);
    process.stdout.write(`Detected ${groups.length} clone group(s) (>= ${minLines} lines).\n`);
  }
  if (!baselineExisted) return;
  process.stdout.write(
    `Baseline diff: ${diff.newGroups.length} NEW, ${diff.droppedGroups.length} DROPPED.\n`,
  );
  for (const g of diff.newGroups) {
    process.stdout.write(`  NEW    ${g.id} (${g.lines} lines)\n`);
    for (const m of g.members) process.stdout.write(`           ${m}\n`);
    writeBatchDisposeHint(g.id, '  ');
  }
}

function reportJson(groups: readonly CloneGroup[], diff: CloneDiff): void {
  process.stdout.write(`${JSON.stringify({ groups, ...diff }, null, 2)}\n`);
}

/**
 * `stackctl check-clones` handler — parse flags, detect per-codebase clones,
 * render, optionally (re)write the baseline, and exit with the documented code.
 * `cwd` is injectable for tests/integration; defaults to `process.cwd()`.
 */
export async function checkClones(args: string[], cwd: string = process.cwd()): Promise<void> {
  let cli: Cli;
  try {
    cli = parseCli(args);
  } catch (err) {
    console.error(errorMessage(err));
    process.exit(2);
  }

  let result: DetectCodebaseClonesResult;
  try {
    result = await detectCodebaseClones({
      startDir: cwd,
      explicitRoot: cli.root,
      baselinePath: cli.baselinePath,
    });
  } catch (err) {
    if (err instanceof ClonesYamlParseError) {
      console.error(
        `baseline exists but is malformed:\n  ${err.reason}\n\n` +
          `Refusing to silently overwrite operator-curated dispositions. ` +
          `Hand-fix the YAML and re-run, OR remove the file to regenerate.`,
      );
      process.exit(2);
    }
    console.error(`clone detection failed: ${errorMessage(err)}`);
    process.exit(2);
  }

  const { groups, diff, baselineExisted, baselineAbs, baseline } = result;

  const shouldWrite = !baselineExisted || cli.refreshBaseline;
  if (shouldWrite) {
    const merged = mergeDispositions(groups, baseline);
    const doc: ClonesYaml = { generated_at: new Date().toISOString(), clones: merged };
    await writeBaseline(baselineAbs, doc);
    if (cli.json) {
      reportJson(merged, diff);
    } else {
      const rel = relative(result.boundary.installationRoot, baselineAbs);
      if (!cli.quiet) {
        process.stdout.write(
          `Wrote ${baselineExisted ? 'refreshed' : 'initial'} baseline to ${rel} (${merged.length} group(s)).\n`,
        );
      }
      reportHuman({ groups: merged, diff, quiet: cli.quiet, baselineExisted });
      if (cli.refreshBaseline) process.stdout.write(`${summaryLine(diff)}\n`);
    }
    process.exit(0);
  }

  if (cli.json) reportJson(groups, diff);
  else if (cli.diff) reportDiff(diff);
  else reportHuman({ groups, diff, quiet: cli.quiet, baselineExisted });

  process.exit(diff.newGroups.length > 0 ? 1 : 0);
}
