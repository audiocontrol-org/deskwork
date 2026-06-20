/**
 * plugins/stack-control/src/subcommands/audit-barrage-lift.ts
 *
 * Phase 15 Task 3 — `stackctl audit-barrage-lift` CLI verb.
 *
 *   stackctl audit-barrage-lift
 *     --feature <slug>
 *     --run-dir <path>
 *     [--date <YYYYMMDD>]      default: today UTC
 *     [--at <dir>]
 *     [--apply]                default is dry-run
 *     [--help]
 *
 * Walks the audit-barrage run directory via `extractBarrageFindings`,
 * assigns sequential `AUDIT-<date>-<NN>` IDs continuing from the highest
 * existing AUDIT-NN for `<date>` in the audit-log, and appends a new
 * `## <ISO-date> — audit-barrage lift (<run-dir-basename>)` section
 * with the formatted entries. Pre-existing audit-log content is
 * preserved verbatim (purely additive write — honors the preservation
 * rule in `.claude/rules/agent-discipline.md`).
 *
 * The lift is the bridge between the audit-barrage runner (raw model
 * markdown on disk) and Phase 13's promote-findings flow (which reads
 * `Status: open` audit-log entries). Without this verb, barrage
 * findings would stay in the run-dir as "evidence" that the operator
 * can't easily action — and the Phase 15 implement-loop hook (Task 4)
 * couldn't enforce the findings-as-next-work guardrail.
 *
 * Cross-model findings render with the
 * `(model-NN + model-NN; cross-model)` suffix on the Finding-ID line,
 * matching Phase 12's hand-curated style. The per-model IDs come from
 * `ExtractedFinding.sourceFindingIds` (e.g., `AUDIT-BARRAGE-claude-02`,
 * stripped to `claude-02`).
 */

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { resolveCodebaseBoundary } from '../scope-discovery/codebase-boundary.js';
import { errorMessage } from '../scope-discovery/util/typeguards.js';
import { extractBarrageFindings } from '../scope-discovery/promote-findings/extract-barrage-findings.js';
import {
  buildAuditLogHeader,
  renderSection,
  renderQuietSection,
} from './audit-barrage-lift-render.js';
import { atomicWriteFile } from '../scope-discovery/util/atomic-write-file.js';
import {
  computeFleetReportFromParsedLanes,
  IndexLaneParseError,
  parseIndexLaneStates,
  renderFleetReportLines,
  safeModelName,
  type ParsedIndexLane,
} from '../scope-discovery/audit-barrage/run-artifacts.js';
import {
  completedNonConvergedAnnotation,
  type FleetReport,
} from '../scope-discovery/audit-barrage/types.js';
import { resolveFeatureRoot as resolveFeatureRootShared } from '../scope-discovery/util/feature-root.js';

export interface AuditBarrageLiftCliOptions {
  readonly featureSlug: string;
  readonly runDir: string;
  readonly date: string;
  readonly apply: boolean;
  /** Walk-up start override (`--at <dir>`); default: cwd (R1/R2). */
  readonly at?: string;
  readonly help?: boolean;
}

export type ParseFlagsResult =
  | { readonly ok: true; readonly opts: AuditBarrageLiftCliOptions }
  | { readonly ok: false; readonly error: string };

const USAGE = [
  'Usage: stackctl audit-barrage-lift',
  '    --feature <slug>',
  '    --run-dir <path>',
  '    [--date <YYYYMMDD>]',
  '    [--at <dir>]',
  '    [--apply]',
  '    [--help]',
  '',
  '--feature <slug>   Required. Resolves the audit-log at',
  '                   docs/<v>/001-IN-PROGRESS/<slug>/audit-log.md.',
  '--run-dir <path>   Required. Path to the audit-barrage run directory',
  '                   (.stack-control/audit-runs/<stamp>-<slug>/).',
  '--date <YYYYMMDD>  Date stamp used for new AUDIT-<date>-NN IDs. Default: today UTC.',
  '--at <dir>         Resolve the installation enclosing <dir>. Default: cwd.',
  '--apply            Perform the audit-log write. Default is dry-run.',
  '',
  'Exit codes:',
  '  0  ok (dry-run reported or apply succeeded)',
  '  2  config error (missing flag, feature not found, run-dir not found)',
  '',
].join('\n');

const VALUED_FLAGS: ReadonlySet<string> = new Set([
  '--feature',
  '--run-dir',
  '--date',
  '--at',
]);

const DATE_RE = /^\d{8}$/;

function todayYYYYMMDD(now: Date = new Date()): string {
  const y = now.getUTCFullYear().toString().padStart(4, '0');
  const m = (now.getUTCMonth() + 1).toString().padStart(2, '0');
  const d = now.getUTCDate().toString().padStart(2, '0');
  return `${y}${m}${d}`;
}

export function parseFlags(argv: ReadonlyArray<string>): ParseFlagsResult {
  let featureSlug: string | undefined;
  let runDir: string | undefined;
  let date: string | undefined;
  let at: string | undefined;
  let apply = false;
  let help = false;

  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === '--help' || flag === '-h') {
      help = true;
      continue;
    }
    if (flag === '--apply') {
      apply = true;
      continue;
    }
    if (flag === undefined) {
      return { ok: false, error: 'unexpected empty flag' };
    }
    if (VALUED_FLAGS.has(flag)) {
      const value = argv[i + 1];
      if (value === undefined) {
        return { ok: false, error: `${flag} requires a value` };
      }
      i += 1;
      if (flag === '--feature') featureSlug = value;
      else if (flag === '--run-dir') runDir = value;
      else if (flag === '--date') date = value;
      else if (flag === '--at') at = value;
      continue;
    }
    return { ok: false, error: `unknown flag: ${flag}` };
  }

  if (help) {
    return {
      ok: true,
      opts: {
        featureSlug: featureSlug ?? '',
        runDir: runDir ?? '',
        date: date ?? '',
        apply,
        help: true,
      },
    };
  }
  if (featureSlug === undefined) {
    return { ok: false, error: '--feature <slug> is required' };
  }
  if (runDir === undefined) {
    return { ok: false, error: '--run-dir <path> is required' };
  }
  if (date !== undefined && !DATE_RE.test(date)) {
    return {
      ok: false,
      error: `--date '${date}' must be YYYYMMDD (8 digits)`,
    };
  }
  const opts: AuditBarrageLiftCliOptions = {
    featureSlug,
    runDir,
    date: date ?? todayYYYYMMDD(),
    apply,
    ...(at !== undefined ? { at } : {}),
  };
  return { ok: true, opts };
}

// Per AUDIT-20260530-15: this verb's local `resolveFeatureRoot`
// walker was extracted into the shared `resolveFeatureRoot` helper
// (in scope-discovery/util/feature-root.ts). Both this file and
// workplan-aware-gate.ts now call the same function, so any future
// change to the resolution logic lives in one place. Spec 013: the
// shared helper now reports which `layout` produced the root, which
// the scaffold uses to decide the header's `targetVersion`.
interface ResolvedFeature {
  readonly root: string;
  readonly layout?: 'legacy-docs' | 'speckit';
}

async function resolveFeatureRoot(
  rootDir: string,
  slug: string,
): Promise<ResolvedFeature | null> {
  const { root, layout } = await resolveFeatureRootShared({ repoRoot: rootDir, slug });
  if (root === undefined) return null;
  return { root, ...(layout !== undefined ? { layout } : {}) };
}

/** The legacy-docs version is the dir between `docs/` and `001-IN-PROGRESS`
 * in `<docs>/<version>/001-IN-PROGRESS/<slug>`; a speckit root has no
 * version axis (empty string). */
function deriveTargetVersion(feature: ResolvedFeature): string {
  if (feature.layout !== 'legacy-docs') return '';
  return basename(dirname(dirname(feature.root)));
}

function highestExistingNn(auditLogText: string, date: string): number {
  const re = new RegExp(`AUDIT-${date}-(\\d+)`, 'g');
  let highest = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(auditLogText)) !== null) {
    const n = Number.parseInt(m[1] ?? '0', 10);
    if (Number.isFinite(n) && n > highest) highest = n;
  }
  return highest;
}

export interface RunAuditBarrageLiftArgs {
  readonly opts: AuditBarrageLiftCliOptions;
  readonly projectRoot: string;
  readonly stdout: NodeJS.WriteStream | NodeJS.WritableStream;
  readonly stderr: NodeJS.WriteStream | NodeJS.WritableStream;
  readonly read?: (path: string) => Promise<string>;
  readonly write?: (path: string, content: string) => Promise<void>;
}

export async function runAuditBarrageLift(
  args: RunAuditBarrageLiftArgs,
): Promise<number> {
  const { opts, projectRoot, stdout, stderr } = args;
  const feature = await resolveFeatureRoot(projectRoot, opts.featureSlug);
  if (feature === null) {
    stderr.write(
      `audit-barrage-lift: feature '${opts.featureSlug}' not found under ` +
        `${join(projectRoot, 'specs')}/<NNN>-${opts.featureSlug} (speckit) or ` +
        `${join(projectRoot, 'docs')}/*/001-IN-PROGRESS/${opts.featureSlug} (legacy-docs).\n`,
    );
    return 2;
  }
  if (!existsSync(opts.runDir)) {
    stderr.write(
      `audit-barrage-lift: run-dir not found at ${opts.runDir}.\n`,
    );
    return 2;
  }

  // specs/014 FR-007: consume the run's terminal states from the v2 INDEX.
  // A lane that did not settle `completed` contributes ZERO findings and is
  // reported with its state; per-lane enforcement prints UNCONDITIONALLY
  // (FR-004's at-synthesis marking always fires, not only on degradation).
  // A pre-014 run dir (no v2 rows) keeps the old lift-everything behavior.
  const indexPath = join(opts.runDir, 'INDEX.md');
  let lanes: ParsedIndexLane[] | null = null;
  if (existsSync(indexPath)) {
    const indexText = await (args.read ?? ((p: string) => readFile(p, 'utf8')))(indexPath);
    try {
      lanes = parseIndexLaneStates(indexText);
    } catch (err) {
      // AUDIT-20260611-07: a mixed v2 INDEX is a corruption signal — the
      // barrage's v2 writer never produces one. Abort the lift loudly
      // instead of lifting over a fleet report whose `configured` count
      // silently dropped the unparseable lane.
      if (err instanceof IndexLaneParseError) {
        stderr.write(
          `audit-barrage-lift: corrupt INDEX at ${indexPath} — ${err.message}\n`,
        );
        return 2;
      }
      throw err;
    }
  }
  let includeModels: ReadonlySet<string> | undefined;
  let fleet: FleetReport | undefined;
  if (lanes !== null) {
    for (const lane of lanes) {
      const status = `audit-barrage-lift: lane ${lane.name} — ${lane.terminalState} [${lane.enforcement}, ${lane.liveness}]`;
      if (lane.terminalState !== 'completed') {
        stderr.write(`${status} — contributes ZERO findings (non-completed lane)\n`);
      } else {
        // AUDIT-20260611-09: a lane can settle `completed` yet not be
        // converged-eligible (nonzero exit or empty report) — the fleet
        // report excludes it from `produced`, so the status line must say
        // why, or the operator sees "completed" next to "⚠ DEGRADED" with
        // nothing connecting them. AUDIT-20260611-11: the annotation is the
        // shared one-vocabulary helper every fleet surface prints from.
        stderr.write(`${status}${completedNonConvergedAnnotation(lane)}\n`);
      }
    }
    includeModels = new Set(
      lanes
        .filter((lane) => lane.terminalState === 'completed')
        .map((lane) => safeModelName(lane.name)),
    );
    fleet = computeFleetReportFromParsedLanes(lanes);
    // AUDIT-20260611-15: render the fleet report when degraded OR when
    // quorum collapsed (produced ≤ 1) — a healthy single-lane run must
    // still state that cross-model agreement was structurally impossible.
    if (fleet.produced < fleet.configured || fleet.quorumCollapsed) {
      stderr.write(`${renderFleetReportLines(fleet).join('\n')}\n`);
    }
  }
  // specs/029 US3 (AUDIT-BARRAGE-codex-01): read the audited code epoch from the
  // run-dir's `tip.sha` (a single 40-hex line the barrage writes when the tip was
  // resolvable). An outage run omits the file; a missing/empty tip.sha is NOT an
  // error — it is plumbed as `undefined` and the section omits the `Code-sha:`
  // marker, isolating the run's epoch in the dampener (never cross-suppressing).
  const tipShaPath = join(opts.runDir, 'tip.sha');
  let tipSha: string | undefined;
  if (existsSync(tipShaPath)) {
    const raw = (await (args.read ?? ((p: string) => readFile(p, 'utf8')))(tipShaPath)).trim();
    if (raw.length > 0) tipSha = raw;
  }

  const auditLogPath = join(feature.root, 'audit-log.md');
  // Spec 013 US2: a brand-new feature's first barrage has no audit-log
  // yet. Instead of aborting (the old `return 2`), scaffold the
  // canonical header at the resolved root and continue to the append
  // path. This only triggers once a root RESOLVED — it is not a
  // fallback for an unresolved feature (which still fails loud above).
  const auditLogMissing = !existsSync(auditLogPath);

  const findings = await extractBarrageFindings({
    runDir: opts.runDir,
    warn: (m) => stderr.write(`${m}\n`),
    ...(includeModels !== undefined ? { includeModels } : {}),
  });
  const reader = args.read ?? ((p: string) => readFile(p, 'utf8'));
  // Per AUDIT-20260530-04: the audit-log is precious historical
  // record under the project's preservation rule. Use the atomic
  // temp-file+rename pattern so a crash mid-write leaves either the
  // old file or the new file, never a truncated one. Tests still
  // supply their own write seam.
  const writer = args.write ?? atomicWriteFile;

  // When the audit-log is absent, the scaffolded canonical header is
  // the base the run section appends to (and what gets written on
  // --apply); an existing file keeps its header untouched (idempotent).
  const auditLogText = auditLogMissing
    ? buildAuditLogHeader(opts.featureSlug, deriveTargetVersion(feature))
    : await reader(auditLogPath);

  // A 0-finding run ALWAYS records a lift section so the convergence dampener
  // (which counts SECTIONS) sees it as the most-recent run:
  //   - HEALTHY fleet → a QUIET section (0 Severity lines) the dampener counts
  //     as a clean run (claude-20260612-r3).
  //   - DEGRADED fleet → a section carrying the `Fleet: DEGRADED` marker, so the
  //     dampener flags it and NEVER counts it as quiet (FR-007 / AUDIT-BARRAGE-
  //     codex-01). Recording NOTHING for a degraded clean run (the prior
  //     behavior) left a STALE prior clean section as "most recent", letting
  //     single-run-clean dampen on it — exactly "degraded is convergence", the
  //     failure this feature exists to remove.
  if (findings.length === 0) {
    const degradedFleet =
      fleet !== undefined && fleet.produced < fleet.configured ? fleet : undefined;
    stderr.write(
      degradedFleet !== undefined
        ? `audit-barrage-lift: extracted 0 findings from ${opts.runDir} over a DEGRADED ` +
            `fleet (produced ${degradedFleet.produced} of ${degradedFleet.configured} ` +
            `configured) — absence over non-completed lanes is NOT a clean signal; recording ` +
            `a DEGRADED-marked section so the dampener never counts it as quiet (FR-007).\n`
        : `audit-barrage-lift: extracted 0 findings from ${opts.runDir} over a healthy ` +
            `fleet; recording a quiet run section so the convergence dampener counts it.\n`,
    );
    if (!opts.apply) {
      stderr.write('audit-barrage-lift: dry-run (re-run with --apply to write).\n');
      return 0;
    }
    const trimmedExisting = auditLogText.replace(/\s+$/, '');
    const separator = trimmedExisting.length > 0 ? '\n\n' : '\n';
    const quiet = renderQuietSection(
      opts.date,
      basename(opts.runDir.replace(/\/$/, '')),
      degradedFleet !== undefined
        ? { produced: degradedFleet.produced, configured: degradedFleet.configured }
        : undefined,
      tipSha,
    );
    const quietContent = `${trimmedExisting}${separator}${quiet}`;
    await writer(auditLogPath, quietContent.endsWith('\n') ? quietContent : `${quietContent}\n`);
    stderr.write(
      `audit-barrage-lift: recorded a ${degradedFleet !== undefined ? 'DEGRADED' : 'quiet'} ` +
        `run section in ${auditLogPath}.\n`,
    );
    return 0;
  }

  const highest = highestExistingNn(auditLogText, opts.date);
  const startingNn = highest + 1;
  // specs/029 US2 (FR-007): when this findings-section is recorded over a
  // DEGRADED fleet (a surviving lane found something while others were killed),
  // stamp the `Fleet: DEGRADED` marker so the dampener never counts this run as
  // quiet (the degraded+0-findings branch above already records nothing; this
  // covers degraded+findings, where 0 HIGH+ from the survivors is not clean).
  const { section, assignedIds } = renderSection(
    findings,
    opts.date,
    startingNn,
    basename(opts.runDir.replace(/\/$/, '')),
    fleet !== undefined ? { produced: fleet.produced, configured: fleet.configured } : undefined,
    tipSha,
  );

  stderr.write(
    `audit-barrage-lift: extracted ${findings.length} finding(s) from ${opts.runDir}; ` +
      `assigning ${assignedIds[0]}..${assignedIds[assignedIds.length - 1]}.\n`,
  );
  for (let i = 0; i < findings.length; i += 1) {
    const f = findings[i]!;
    const id = assignedIds[i]!;
    const cm = f.crossModelAgreement
      ? ` (cross-model: ${f.sourceModels.join(' + ')})`
      : ` (${f.sourceModels[0]})`;
    stdout.write(`  ${id}  ${f.severity}  ${f.heading}${cm}\n`);
  }

  if (!opts.apply) {
    stderr.write('audit-barrage-lift: dry-run (re-run with --apply to write).\n');
    return 0;
  }

  const trimmedExisting = auditLogText.replace(/\s+$/, '');
  const separator = trimmedExisting.length > 0 ? '\n\n' : '\n';
  const newContent = `${trimmedExisting}${separator}${section}`;
  await writer(auditLogPath, newContent.endsWith('\n') ? newContent : `${newContent}\n`);
  stderr.write(
    `audit-barrage-lift: wrote ${findings.length} new entry(ies) to ${auditLogPath}.\n`,
  );
  return 0;
}

export async function auditBarrageLiftCli(rawArgs: string[]): Promise<void> {
  const parsed = parseFlags(rawArgs);
  if (parsed.ok && parsed.opts.help === true) {
    process.stdout.write(USAGE);
    return;
  }
  if (!parsed.ok) {
    process.stderr.write(`${parsed.error}\n\n${USAGE}`);
    process.exit(2);
  }
  // specs/installation-isolation US1 (R1): the lift's anchor is the
  // nearest-enclosing installation (walk-up from --at <dir>, else the
  // cwd) — never the git toplevel (an external anchor; FR-004) and
  // never a free repo-root parameter (R2: retired).
  let projectRoot: string;
  try {
    projectRoot = resolveCodebaseBoundary({
      startDir: parsed.opts.at ?? process.cwd(),
      explicitRoot: null,
    }).installationRoot;
  } catch (err) {
    process.stderr.write(`audit-barrage-lift: FATAL — ${errorMessage(err)}\n`);
    process.exit(2);
  }
  const exit = await runAuditBarrageLift({
    opts: parsed.opts,
    projectRoot,
    stdout: process.stdout,
    stderr: process.stderr,
  });
  if (exit !== 0) process.exit(exit);
}
