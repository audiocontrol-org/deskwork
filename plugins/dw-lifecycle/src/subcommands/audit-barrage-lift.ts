/**
 * plugins/dw-lifecycle/src/subcommands/audit-barrage-lift.ts
 *
 * Phase 15 Task 3 — `dw-lifecycle audit-barrage-lift` CLI verb.
 *
 *   dw-lifecycle audit-barrage-lift
 *     --feature <slug>
 *     --run-dir <path>
 *     [--date <YYYYMMDD>]      default: today UTC
 *     [--repo-root <path>]
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
import { readdir, readFile } from 'node:fs/promises';
import { basename, isAbsolute, join, resolve } from 'node:path';
import { repoRoot } from '../repo.js';
import {
  extractBarrageFindings,
  type ExtractedFinding,
} from '../scope-discovery/promote-findings/extract-barrage-findings.js';
import { atomicWriteFile } from '../scope-discovery/util/atomic-write-file.js';

export interface AuditBarrageLiftCliOptions {
  readonly featureSlug: string;
  readonly runDir: string;
  readonly date: string;
  readonly apply: boolean;
  readonly repoRoot?: string;
  readonly help?: boolean;
}

export type ParseFlagsResult =
  | { readonly ok: true; readonly opts: AuditBarrageLiftCliOptions }
  | { readonly ok: false; readonly error: string };

const USAGE = [
  'Usage: dw-lifecycle audit-barrage-lift',
  '    --feature <slug>',
  '    --run-dir <path>',
  '    [--date <YYYYMMDD>]',
  '    [--repo-root <path>]',
  '    [--apply]',
  '    [--help]',
  '',
  '--feature <slug>   Required. Resolves the audit-log at',
  '                   docs/<v>/001-IN-PROGRESS/<slug>/audit-log.md.',
  '--run-dir <path>   Required. Path to the audit-barrage run directory',
  '                   (.dw-lifecycle/scope-discovery/audit-runs/<stamp>-<slug>/).',
  '--date <YYYYMMDD>  Date stamp used for new AUDIT-<date>-NN IDs. Default: today UTC.',
  '--repo-root <path> Project root. Default: cwd.',
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
  '--repo-root',
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
  let repoRootOverride: string | undefined;
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
      else if (flag === '--repo-root') repoRootOverride = value;
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
    ...(repoRootOverride !== undefined ? { repoRoot: repoRootOverride } : {}),
  };
  return { ok: true, opts };
}

async function resolveFeatureRoot(rootDir: string, slug: string): Promise<string | null> {
  const docsRoot = join(rootDir, 'docs');
  if (!existsSync(docsRoot)) return null;
  let topEntries: ReadonlyArray<string>;
  try {
    // Per AUDIT-20260530-06: sort lexicographically (see same fix in
    // workplan-aware-gate.ts) so the gate and the lift always pick the
    // same version dir when a slug exists under multiple.
    topEntries = [...(await readdir(docsRoot))].sort();
  } catch {
    return null;
  }
  for (const version of topEntries) {
    const inProgress = join(docsRoot, version, '001-IN-PROGRESS');
    if (!existsSync(inProgress)) continue;
    const featureDir = join(inProgress, slug);
    if (existsSync(featureDir)) return featureDir;
  }
  return null;
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
  const repoRootResolved = opts.repoRoot ?? projectRoot;
  const featureRoot = await resolveFeatureRoot(repoRootResolved, opts.featureSlug);
  if (featureRoot === null) {
    stderr.write(
      `audit-barrage-lift: feature '${opts.featureSlug}' not found under docs/*/001-IN-PROGRESS/.\n`,
    );
    return 2;
  }
  if (!existsSync(opts.runDir)) {
    stderr.write(
      `audit-barrage-lift: run-dir not found at ${opts.runDir}.\n`,
    );
    return 2;
  }
  const auditLogPath = join(featureRoot, 'audit-log.md');
  if (!existsSync(auditLogPath)) {
    stderr.write(`audit-barrage-lift: audit-log not found at ${auditLogPath}.\n`);
    return 2;
  }

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

  const auditLogText = await reader(auditLogPath);
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
  let projectRoot: string;
  if (parsed.opts.repoRoot !== undefined) {
    projectRoot = isAbsolute(parsed.opts.repoRoot)
      ? parsed.opts.repoRoot
      : resolve(process.cwd(), parsed.opts.repoRoot);
  } else {
    projectRoot = repoRoot();
  }
  const exit = await runAuditBarrageLift({
    opts: parsed.opts,
    projectRoot,
    stdout: process.stdout,
    stderr: process.stderr,
  });
  if (exit !== 0) process.exit(exit);
}
