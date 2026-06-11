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
import {
  extractBarrageFindings,
  type ExtractedFinding,
} from '../scope-discovery/promote-findings/extract-barrage-findings.js';
import { atomicWriteFile } from '../scope-discovery/util/atomic-write-file.js';
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

function isoDate(yyyymmdd: string): string {
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
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

/**
 * Spec 013 US2: the canonical audit-log header scaffolded at a
 * resolved feature root that has none yet. `targetVersion` carries the
 * legacy-docs version axis (derived from the resolved path); a speckit
 * feature has no version axis, so it is the empty string.
 */
function buildAuditLogHeader(slug: string, targetVersion: string): string {
  return [
    '---',
    `slug: ${slug}`,
    `targetVersion: "${targetVersion}"`,
    '---',
    '',
    `# Audit log — ${slug}`,
    '',
  ].join('\n');
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

function formatSourceSuffix(sourceFindingIds: readonly string[]): string {
  const stripped = sourceFindingIds.map((id) =>
    id.replace(/^AUDIT-BARRAGE-/i, ''),
  );
  return stripped.join(' + ');
}

function renderEntry(
  finding: ExtractedFinding,
  date: string,
  nn: number,
): string {
  const idPadded = nn.toString().padStart(2, '0');
  const fullId = `AUDIT-${date}-${idPadded}`;
  const suffix = finding.crossModelAgreement
    ? ` (${formatSourceSuffix(finding.sourceFindingIds)}; cross-model)`
    : '';
  const body = finding.body.length > 0 ? finding.body : '_(no body captured)_';
  return [
    `### ${fullId} — ${finding.heading}`,
    '',
    `Finding-ID: ${fullId}${suffix}`,
    `Status:     open`,
    `Severity:   ${finding.severity}`,
    `Surface:    ${finding.surface}`,
    '',
    body,
    '',
  ].join('\n');
}

function renderSection(
  findings: readonly ExtractedFinding[],
  date: string,
  startingNn: number,
  runDirBasename: string,
): { section: string; assignedIds: readonly string[] } {
  const isoDateStr = isoDate(date);
  const heading = `## ${isoDateStr} — audit-barrage lift (${runDirBasename})\n\n`;
  const assignedIds: string[] = [];
  const entries: string[] = [];
  for (let i = 0; i < findings.length; i += 1) {
    const nn = startingNn + i;
    const finding = findings[i]!;
    const idPadded = nn.toString().padStart(2, '0');
    assignedIds.push(`AUDIT-${date}-${idPadded}`);
    entries.push(renderEntry(finding, date, nn));
  }
  return { section: heading + entries.join('\n'), assignedIds };
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
  });
  if (findings.length === 0) {
    stderr.write(
      `audit-barrage-lift: extracted 0 findings from ${opts.runDir}; nothing to lift.\n`,
    );
    return 0;
  }

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
  const highest = highestExistingNn(auditLogText, opts.date);
  const startingNn = highest + 1;
  const { section, assignedIds } = renderSection(
    findings,
    opts.date,
    startingNn,
    basename(opts.runDir.replace(/\/$/, '')),
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
