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
 *
 * First-barrage auto-init (Phase 29 / #426): when the feature directory
 * exists but `audit-log.md` does not (the new-feature first-barrage
 * case), the verb auto-initializes the file from the bundled template
 * with `<feature-slug>` substitution and proceeds. The symmetric
 * `tooling-feedback.md` template is initialized at the same time.
 * Existing files are never overwritten.
 */

import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { basename, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { repoRoot } from '../repo.js';
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

/**
 * Locate the templates directory. Compiled output sits under
 * `dist/subcommands/audit-barrage-lift.js`; the templates live at
 * `templates/scope-discovery/<file>.md` two levels above.
 */
function templatesDir(): string {
  const here = fileURLToPath(import.meta.url);
  return resolve(here, '..', '..', '..', 'templates', 'scope-discovery');
}

export interface EnsureAuditArtifactsResult {
  readonly auditLogInitialized: boolean;
  readonly toolingFeedbackInitialized: boolean;
  /**
   * Templates the helper would have initialized but couldn't because the
   * bundled file is missing. Populated only in apply mode (writes were
   * actually attempted). The caller should surface this as an actionable
   * packaging defect.
   */
  readonly missingTemplates: readonly string[];
}

/**
 * Auto-initialize `audit-log.md` (and the symmetric `tooling-feedback.md`)
 * when missing from the feature directory. The bundled templates use
 * `<feature-slug>` as a placeholder; we substitute the live slug before
 * writing. Idempotent — existing files are left untouched.
 *
 * Per #426: every new feature's first barrage hit the "audit-log not
 * found" abort in `runAuditBarrageLift` because no setup-time path
 * seeded the file. Auto-init at lift time closes that gap without
 * touching the setup flow.
 *
 * Post-audit-barrage findings (AUDIT-BARRAGE-claude-01 + codex-01):
 *
 *   - `write` defaults to `false` — callers in dry-run mode get a
 *     "would have created X" diagnostic without disk mutation. Apply
 *     mode passes `write: true` to actually init.
 *   - Each template read is wrapped in try/catch so a missing bundled
 *     file (packaging defect) surfaces as a tracked `missingTemplates`
 *     entry instead of an unhandled ENOENT crash. The pre-#426 code
 *     returned a clean exit 2; this preserves that operator-facing
 *     diagnostic shape.
 */
export async function ensureAuditArtifactsExist(
  featureRoot: string,
  slug: string,
  write: boolean = false,
): Promise<EnsureAuditArtifactsResult> {
  const tdir = templatesDir();
  let auditLogInitialized = false;
  let toolingFeedbackInitialized = false;
  const missingTemplates: string[] = [];

  const tryInit = async (
    templateName: string,
    targetPath: string,
  ): Promise<boolean> => {
    if (existsSync(targetPath)) return false;
    let tmpl: string;
    try {
      tmpl = await readFile(join(tdir, templateName), 'utf8');
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        missingTemplates.push(templateName);
        return false;
      }
      throw err;
    }
    if (!write) return true; // dry-run: report intent without mutating.
    await writeFile(targetPath, substituteSlug(tmpl, slug), 'utf8');
    return true;
  };

  auditLogInitialized = await tryInit(
    'audit-log.md',
    join(featureRoot, 'audit-log.md'),
  );
  toolingFeedbackInitialized = await tryInit(
    'tooling-feedback.md',
    join(featureRoot, 'tooling-feedback.md'),
  );

  return { auditLogInitialized, toolingFeedbackInitialized, missingTemplates };
}

/**
 * Substitute the `<feature-slug>` placeholder. Templates may carry the
 * placeholder in plain form (`<feature-slug>`) or in HTML-escaped form
 * (`&lt;feature-slug&gt;`) — the tooling-feedback template uses the
 * escaped form so other illustrative angle-bracket placeholders in the
 * body render unchanged. Both forms substitute to the literal slug.
 */
function substituteSlug(template: string, slug: string): string {
  return template
    .replace(/<feature-slug>/g, slug)
    .replace(/&lt;feature-slug&gt;/g, slug);
}

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

// Per AUDIT-20260530-15: this verb's local `resolveFeatureRoot`
// walker was extracted into the shared `resolveFeatureRoot` helper
// (in scope-discovery/util/feature-root.ts). Both this file and
// workplan-aware-gate.ts now call the same function, so any future
// change to the resolution logic lives in one place.
async function resolveFeatureRoot(rootDir: string, slug: string): Promise<string | null> {
  const { root } = await resolveFeatureRootShared({ repoRoot: rootDir, slug });
  return root ?? null;
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
  // Per #426: auto-init audit-log.md + tooling-feedback.md if missing.
  // The first barrage of every new feature used to abort here because
  // no setup-time path seeded the files. Auto-init closes that gap.
  //
  // Post-barrage findings (AUDIT-BARRAGE-codex-01 + claude-01):
  //   - Init is gated on `opts.apply` so dry-run never mutates disk.
  //   - Missing-template ENOENT is converted to a clean exit 2 instead
  //     of an unhandled rejection.
  const initResult = await ensureAuditArtifactsExist(
    featureRoot,
    opts.featureSlug,
    opts.apply,
  );
  if (initResult.missingTemplates.length > 0) {
    stderr.write(
      `audit-barrage-lift: bundled template(s) missing from the plugin install: ${initResult.missingTemplates.join(', ')}. ` +
        `This indicates a packaging defect — file an issue against dw-lifecycle.\n`,
    );
    return 2;
  }
  if (opts.apply && initResult.auditLogInitialized) {
    stderr.write(
      `audit-barrage-lift: initialized empty audit-log.md from template (first barrage of this feature).\n`,
    );
  }
  if (opts.apply && initResult.toolingFeedbackInitialized) {
    stderr.write(
      `audit-barrage-lift: initialized empty tooling-feedback.md from template.\n`,
    );
  }
  if (!opts.apply && (initResult.auditLogInitialized || initResult.toolingFeedbackInitialized)) {
    // Dry-run intent line so the operator knows what apply would do.
    const wouldInit: string[] = [];
    if (initResult.auditLogInitialized) wouldInit.push('audit-log.md');
    if (initResult.toolingFeedbackInitialized) wouldInit.push('tooling-feedback.md');
    stderr.write(
      `audit-barrage-lift: dry-run — would auto-init ${wouldInit.join(' + ')} from template on --apply.\n`,
    );
  }
  const auditLogPath = join(featureRoot, 'audit-log.md');

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

  // In dry-run mode the audit-log.md may not exist (auto-init was
  // suppressed); fall through with an empty starting text so the
  // findings summary still renders correctly.
  let auditLogText: string;
  if (opts.apply) {
    auditLogText = await reader(auditLogPath);
  } else if (existsSync(auditLogPath)) {
    auditLogText = await reader(auditLogPath);
  } else {
    auditLogText = '';
  }
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
