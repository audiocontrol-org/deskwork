/**
 * plugins/dw-lifecycle/src/scope-discovery/clone-detector.ts
 *
 * General TypeScript/TSX clone-detection gate for the scope-discovery
 * protocol. Wraps `jscpd` (configured at `.jscpd.json` in the adopter
 * project's repo root), parses its JSON report into stable clone-group
 * records, and compares against the committed baseline at
 * `.dw-lifecycle/scope-discovery/clones.yaml` (project-relative default;
 * configurable via `--baseline`).
 *
 * Engine choice — jscpd over AST-custom — rationale:
 *   1. Already installed and wired (root package.json devDep, .jscpd.json
 *      at repo root with the project's thresholds, three npm scripts
 *      anchoring the engine to repo conventions). Reinventing on AST
 *      would add a parser dependency, duplicate the
 *      ignore/threshold/format config, and fork the operator's mental
 *      model.
 *   2. jscpd's `--config` model is shared with `pnpm duplication:check`
 *      etc. — so this tool and the operator-facing scripts read the
 *      same config file. No second source of truth.
 *   3. The existing CSS-duplication gate (`tools/check-css-duplication.ts`)
 *      is hand-rolled because CSS rule-bodies have no off-the-shelf
 *      detector with the same selector/stem grouping semantics. TS/TSX
 *      clone detection does have one (jscpd) and we should use it.
 *   4. PRD §"No new package dependencies expected beyond the
 *      clone-detection engine. Confirm in Phase 2 T2.2." — confirmed:
 *      no new deps required; jscpd was already present.
 *
 * Wiring (downstream):
 *   T2.3 — .githooks/pre-commit invokes this with no --refresh-baseline
 *   T2.5 — adversarial validator at clone-detector.validate.ts
 *   T2.7 — `make refresh-clones-baseline` runs with --refresh-baseline
 *   T4.1 — first Phase-4 baseline run produces the dispositionable backlog
 *
 * Invocation:
 *   --root <path>             override .jscpd.json `path` (default: read from config)
 *   --quiet                   suppress per-clone output; print summary + exit
 *   --json                    emit JSON for tooling instead of human text
 *   --baseline <path>         override default .dw-lifecycle/scope-discovery/clones.yaml
 *   --refresh-baseline        rewrite the baseline from this run, carrying
 *                             forward operator-authored dispositions
 *   --diff                    print only NEW + DROPPED groups (subset of
 *                             default output); useful for CI-style diffing.
 *                             Implies --quiet for the headline; full per-group
 *                             listing is replaced by NEW/DROPPED sections only.
 *
 * Exit code:
 *   0   no NEW clone groups (or first-run baseline written)
 *   1   one or more NEW groups since the baseline
 *   2   I/O, parse, or jscpd-crash error
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
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
import { JSCPD_REPORT_PATH, parseJscpdReport, runJscpd } from './jscpd-runner.js';
import { errorMessage, isEnoent } from './util/typeguards.js';

const REPO_ROOT = process.cwd();
const DEFAULT_BASELINE = '.dw-lifecycle/scope-discovery/clones.yaml';

interface Cli {
  readonly root: string | null;
  readonly quiet: boolean;
  readonly json: boolean;
  readonly baselinePath: string;
  readonly refreshBaseline: boolean;
  readonly diff: boolean;
}

function parseCli(argv: readonly string[]): Cli {
  let root: string | null = null;
  let quiet = false;
  let json = false;
  let baselinePath = DEFAULT_BASELINE;
  let refreshBaseline = false;
  let diff = false;
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
    else throw new Error(`unknown arg: ${a}`);
  }
  return { root, quiet, json, baselinePath, refreshBaseline, diff };
}

/**
 * Read the baseline file.
 *
 * Returns null ONLY when the file is truly absent (ENOENT). When the file
 * exists but parses to a shape error, throws `ClonesYamlParseError` so
 * the detector exits 2 with an actionable diagnostic — silently treating
 * a malformed-but-present baseline as null would let the subsequent
 * `--refresh-baseline` write wipe every operator disposition without a
 * visible diff (AUDIT-20260524-14).
 *
 * `RefactorPreconditionError` from `parseClonesYamlStrict` also
 * propagates — refactor-only field errors were already loud and the
 * strict path preserves that contract.
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

interface ReportOpts {
  readonly groups: readonly CloneGroup[];
  readonly diff: CloneDiff;
  readonly quiet: boolean;
  readonly baselineExisted: boolean;
}

/**
 * Single-line summary shared by --refresh-baseline and --diff modes.
 * Shape: `summary: N dropped, M new (net X)` where net = new - dropped.
 * Distinct from the headline `K groups; N NEW; M DROPPED` so the two
 * lines can be grep-distinguished by downstream tooling.
 */
function summaryLine(diff: CloneDiff): string {
  const newCount = diff.newGroups.length;
  const droppedCount = diff.droppedGroups.length;
  const net = newCount - droppedCount;
  const netStr = net >= 0 ? `+${net}` : `${net}`;
  return `summary: ${droppedCount} dropped, ${newCount} new (net ${netStr})`;
}

/**
 * Per-NEW-group operator hint: a pre-filled `dw-lifecycle batch-dispose`
 * command the operator can paste-and-edit instead of hand-writing a YAML
 * entry at the right insertion point in .dw-lifecycle/scope-discovery/clones.yaml.
 *
 * The audiocontrol pilot named `tsx tools/scope-discovery/batch-dispose.ts`
 * directly. This port references the eventual subcommand shape
 * (`dw-lifecycle batch-dispose ...`); the subcommand itself is filed for
 * Phase 6 of the scope-discovery workplan.
 *
 * Emitted ADDITIVELY — every existing NEW-group line is preserved so
 * downstream consumers grepping for `NEW    <id>` or member paths
 * continue to work. DROPPED groups intentionally do NOT get this hint:
 * they are removed via the clones-yaml refresh (`dw-lifecycle refresh-clones-baseline`),
 * not via batch-dispose.
 *
 * The `indent` parameter matches each caller's existing per-group
 * indentation: `reportHuman` indents NEW lines by 2 spaces (default
 * mode); `reportDiff` does not indent (--diff mode is the strict
 * subset). The hint is indented one level deeper than the `NEW` line
 * itself so the visual hierarchy stays consistent within each caller.
 */
function batchDisposeHintLines(id: string, indent: string): readonly string[] {
  const lead = `${indent}  Run:  `;
  const cont = `${indent}          `;
  // TODO(scope-discovery #284): wire to the actual `dw-lifecycle batch-dispose`
  // subcommand once Phase 6 of the scope-discovery workplan lands. The
  // hint string emitted here is forward-compatible with the eventual
  // subcommand shape — adopters today read it and learn the workflow
  // even if the subcommand isn't yet implemented.
  return [
    `${lead}dw-lifecycle batch-dispose \\\n`,
    `${cont}--ids ${id} \\\n`,
    `${cont}--disposition <refactor|keep-with-reason|ignore-with-justification> \\\n`,
    `${cont}--reason "<one-line rationale>"\n`,
  ];
}

function writeBatchDisposeHint(id: string, indent: string): void {
  for (const line of batchDisposeHintLines(id, indent)) {
    process.stdout.write(line);
  }
}

/**
 * Emit only NEW + DROPPED group sections plus the summary line. Subset
 * of the default-mode output; the full per-group listing is omitted.
 */
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
      `${groups.length} groups; ${diff.newGroups.length} NEW; ` +
        `${diff.droppedGroups.length} DROPPED\n`,
    );
    return;
  }
  if (groups.length === 0) {
    process.stdout.write('No clone groups detected.\n');
  } else {
    const minLines = groups.reduce((m, g) => Math.min(m, g.lines), Infinity);
    process.stdout.write(
      `Detected ${groups.length} clone group(s) (>= ${minLines} lines).\n`,
    );
  }
  if (!baselineExisted) return;
  process.stdout.write(
    `Baseline diff: ${diff.newGroups.length} NEW, ` +
      `${diff.droppedGroups.length} DROPPED.\n`,
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
 * Run the clone-detection logic and exit the process with the
 * appropriate code (0 = no new groups, 1 = new groups exist, 2 = I/O
 * or parse error). Matches the dw-lifecycle subcommand-handler shape
 * used by sibling subcommands (doctor, setup, etc.) — args[] replaces
 * process.argv.slice(2); process.exit is called directly inside.
 *
 * Exported for the subcommands/detect-clones.ts dispatch shim; not
 * intended to be invoked except via the `dw-lifecycle detect-clones`
 * subcommand.
 */
export async function detectClones(args: string[]): Promise<void> {
  let cli: Cli;
  try {
    cli = parseCli(args);
  } catch (err) {
    console.error(errorMessage(err));
    process.exit(2);
  }
  try {
    await runJscpd({ repoRoot: REPO_ROOT, rootOverride: cli.root });
  } catch (err) {
    console.error(`jscpd invocation failed: ${errorMessage(err)}`);
    process.exit(2);
  }
  // Each I/O / parse step gets its own try/catch so the documented
  // exit-code contract (1 = NEW clone groups exist; 2 = I/O or parse
  // failure) holds. Letting these throws bubble up to the cli.ts
  // main().catch(... exit(1)) would conflate "I/O failed" with "clones
  // gate tripped" — a CI script reading exit-1-as-clones would false-
  // positive on a missing report.
  let reportText: string;
  try {
    reportText = await readFile(join(REPO_ROOT, JSCPD_REPORT_PATH), 'utf8');
  } catch (err) {
    console.error(`failed to read jscpd report: ${errorMessage(err)}`);
    process.exit(2);
  }
  let detectedGroups: CloneGroup[];
  try {
    detectedGroups = parseJscpdReport(reportText);
  } catch (err) {
    console.error(`failed to parse jscpd report: ${errorMessage(err)}`);
    process.exit(2);
  }

  const baselineAbs = resolve(REPO_ROOT, cli.baselinePath);
  let baseline: ClonesYaml | null;
  try {
    baseline = await readBaseline(baselineAbs);
  } catch (err) {
    if (err instanceof ClonesYamlParseError) {
      // AUDIT-20260524-14: refuse to silently overwrite an existing-but-
      // malformed baseline. The previous lenient behavior treated this
      // as `null` and the subsequent refresh-write erased every operator
      // disposition without a diff. Fail loud with the structured reason
      // so the operator can hand-fix the YAML.
      console.error(
        `baseline ${baselineAbs} exists but is malformed:\n  ${err.reason}\n` +
          `\nRefusing to silently overwrite operator-curated dispositions. ` +
          `Hand-fix the YAML and re-run, OR explicitly remove the file to ` +
          `regenerate from scratch.`,
      );
      process.exit(2);
    }
    throw err;
  }
  const baselineExisted = baseline !== null;
  const diff = diffClones(detectedGroups, baseline);

  // Baseline-write modes:
  //   - First run (no baseline file): write the baseline with every
  //     detected group at disposition: pending. Exit 0.
  //   - --refresh-baseline: rewrite preserving non-pending dispositions.
  //     Exit 0.
  // Compare mode (normal):
  //   - Don't touch the file. Exit 1 if NEW, else 0.
  const shouldWrite = !baselineExisted || cli.refreshBaseline;
  if (shouldWrite) {
    const merged = mergeDispositions(detectedGroups, baseline);
    const doc: ClonesYaml = {
      generated_at: new Date().toISOString(),
      clones: merged,
    };
    await writeBaseline(baselineAbs, doc);
    if (cli.json) {
      reportJson(merged, diff);
    } else {
      const rel = relative(REPO_ROOT, baselineAbs);
      if (!cli.quiet) {
        process.stdout.write(
          `Wrote ${baselineExisted ? 'refreshed' : 'initial'} baseline to ${rel} (${merged.length} group(s)).\n`,
        );
      }
      reportHuman({ groups: merged, diff, quiet: cli.quiet, baselineExisted });
      // Polish T7.5: --refresh-baseline always trails with a single-line
      // summary in the `summary: N dropped, M new (net X)` shape, distinct
      // from the headline above. Survives --quiet for grep-friendliness.
      if (cli.refreshBaseline) {
        process.stdout.write(`${summaryLine(diff)}\n`);
      }
    }
    process.exit(0);
  }

  if (cli.json) {
    reportJson(detectedGroups, diff);
  } else if (cli.diff) {
    reportDiff(diff);
  } else {
    reportHuman({ groups: detectedGroups, diff, quiet: cli.quiet, baselineExisted });
  }
  const failing = diff.newGroups.length;
  process.exit(failing > 0 ? 1 : 0);
}
