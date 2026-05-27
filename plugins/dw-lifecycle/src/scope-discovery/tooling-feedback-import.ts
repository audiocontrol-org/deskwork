/**
 * plugins/dw-lifecycle/src/scope-discovery/tooling-feedback-import.ts
 *
 * Phase 11 Task 14 — closes the dogfood-feedback loop.
 *
 * Walks `docs/<v>/001-IN-PROGRESS/<slug>/tooling-feedback.md` for each
 * in-progress feature (or a single slug when `--slug` is given), parses
 * the TF entries, and promotes closure-marked entries into
 * `docs/1.0/001-IN-PROGRESS/scope-discovery/audit-log.md` as
 * `AUDIT-<YYYYMMDD>-<NN>` entries with cross-reference back to the TF
 * source.
 *
 * Closure-status grammar (mirrors the audit-log Status quick-reference
 * + the TF template's append-only contract):
 *   - addressed-<sha>            ← the operator-canonical "fix landed"
 *   - superseded-by-<TF-NN>      ← rolled into a later TF entry
 *   - verified-<date>            ← post-release re-exercise confirmed
 *
 * Idempotency: every imported TF entry is annotated with an
 *   `imported-as: AUDIT-<id>`
 * line in the source markdown. The presence of that annotation is the
 * watermark used to skip the entry on subsequent runs. The annotation
 * is also reflected in the audit-log entry's body as a forward link.
 *
 * Numbering: `AUDIT-<YYYYMMDD>-<NN>` is sequential per-date. The
 * algorithm reads existing audit-log entries, finds the highest `<NN>`
 * already used for today's date, and starts new imports at <NN>+1.
 *
 * CLI:
 *   --slug <slug>      restrict to one feature; default scans every
 *                      in-progress feature with a tooling-feedback.md.
 *   --dry-run          print intended imports; do not write. DEFAULT.
 *   --apply            perform the import + write the audit-log + the
 *                      TF annotations.
 *   --repo-root <path> override the repo root (default: cwd).
 *   --audit-log <path> override the audit-log path (default:
 *                      docs/1.0/001-IN-PROGRESS/scope-discovery/audit-log.md).
 *   --today <YYYYMMDD> override "today" for deterministic tests + audits
 *                      ahead-of-time.
 *   --quiet            suppress informational stderr.
 *
 * Exit codes:
 *   0   import succeeded (or no closure-ready entries found).
 *   2   invalid CLI args, missing audit-log, malformed TF entries.
 */

import { readFile, readdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { errorMessage } from './util/typeguards.js';

const DEFAULT_AUDIT_LOG_REL =
  'docs/1.0/001-IN-PROGRESS/scope-discovery/audit-log.md';
const DOCS_ROOT_REL = 'docs';
const IN_PROGRESS_STAGE = '001-IN-PROGRESS';
const TOOLING_FEEDBACK_FILENAME = 'tooling-feedback.md';

export type ClosureStatusKind =
  | 'addressed'
  | 'superseded-by'
  | 'verified';

export interface ToolingFeedbackStatus {
  /** The discriminator; identifies the closure kind. */
  readonly kind: ClosureStatusKind;
  /**
   * Raw payload after the kind prefix — `<sha>` for `addressed`,
   * `TF-NN` for `superseded-by`, `<date>` for `verified`. Kept as a
   * single string so the audit-log entry can quote the operator's
   * literal status verbatim.
   */
  readonly payload: string;
  /**
   * The full literal status as it appears in the TF entry (e.g.
   * "addressed-d4ca597"). Used when writing the audit-log status
   * line so the operator's wording propagates without our reformat.
   */
  readonly literal: string;
}

export interface ToolingFeedbackEntry {
  /** TF-<NN> identifier, exactly as it appears in the heading. */
  readonly id: string;
  /** The heading text after the id (kept verbatim, includes category + severity + summary). */
  readonly heading: string;
  /**
   * The closure-marked status. `null` when the entry is open / not yet
   * closure-marked; such entries are NOT imported by this workflow.
   */
  readonly status: ToolingFeedbackStatus | null;
  /**
   * When non-null, the `imported-as: AUDIT-<id>` watermark already
   * exists on this TF entry. Idempotency check is exact-string against
   * this value.
   */
  readonly importedAs: string | null;
  /**
   * Severity extracted from the heading ("high" / "medium" / "low").
   * Falls through to `medium` when the heading is non-conforming.
   */
  readonly severity: 'high' | 'medium' | 'low';
  /**
   * Category letter (A / AM / CL / GATE / DSC / MISC) extracted from
   * the heading. Falls through to `MISC` when the heading is
   * non-conforming.
   */
  readonly category: string;
  /**
   * The full body block (everything between this heading and the next
   * `## ` heading or end-of-file, with leading/trailing whitespace
   * preserved). The audit-log entry's body re-includes this verbatim
   * so closure-rich TF entries don't need re-summarizing.
   */
  readonly body: string;
  /** Line-index of the heading in the source file (0-based). */
  readonly headingLineIndex: number;
  /**
   * Source path on disk — used by `--apply` mode to write the
   * `imported-as` annotation back to the TF file.
   */
  readonly sourcePath: string;
  /** Feature slug owning this TF entry (the directory containing the tooling-feedback.md). */
  readonly featureSlug: string;
}

const TF_HEADING_REGEX =
  /^##\s+(TF-\d+)\s*·\s*([A-Z]+)\s*·\s*(high|medium|low)\s*·\s*(.+)$/i;

const STATUS_LINE_REGEX =
  /^\*\*Status:\*\*\s*(addressed-([a-f0-9]{7,40})|superseded-by-(TF-\d+)|verified-(\d{4}-?\d{2}-?\d{2}|\d{8}))\s*$/i;

const IMPORTED_AS_REGEX = /^imported-as:\s*(AUDIT-\d{8}-\d{2,})\s*$/i;

/** AUDIT-<YYYYMMDD>-<NN> in either an existing finding or new emission. */
const AUDIT_ID_REGEX = /^Finding-ID:\s*(AUDIT-(\d{8})-(\d{2,}))\s*$/i;

/**
 * Parse a tooling-feedback.md file into structured entries. Returns
 * one entry per TF heading.
 */
export function parseToolingFeedback(args: {
  readonly text: string;
  readonly sourcePath: string;
  readonly featureSlug: string;
}): readonly ToolingFeedbackEntry[] {
  const { text, sourcePath, featureSlug } = args;
  const lines = text.split('\n');
  const entries: ToolingFeedbackEntry[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? '';
    const m = TF_HEADING_REGEX.exec(line);
    if (m === null) {
      i += 1;
      continue;
    }
    const headingLineIndex = i;
    const id = m[1] ?? '';
    const category = (m[2] ?? '').toUpperCase();
    const severityRaw = (m[3] ?? '').toLowerCase();
    const severity: 'high' | 'medium' | 'low' =
      severityRaw === 'high' || severityRaw === 'medium' || severityRaw === 'low'
        ? severityRaw
        : 'medium';
    const heading = `${id} · ${category} · ${severity} · ${(m[4] ?? '').trim()}`;

    // Body block: scan forward until the next "## " or EOF.
    let j = i + 1;
    while (j < lines.length && !(lines[j] ?? '').startsWith('## ')) {
      j += 1;
    }
    const bodyLines = lines.slice(i + 1, j);

    // Extract status + imported-as markers from the body.
    let status: ToolingFeedbackStatus | null = null;
    let importedAs: string | null = null;
    for (const bodyLine of bodyLines) {
      if (status === null) {
        const sm = STATUS_LINE_REGEX.exec(bodyLine.trim());
        if (sm !== null && sm[1] !== undefined) {
          const literal = sm[1];
          const lower = literal.toLowerCase();
          if (lower.startsWith('addressed-') && sm[2] !== undefined) {
            status = {
              kind: 'addressed',
              payload: sm[2],
              literal,
            };
          } else if (lower.startsWith('superseded-by-') && sm[3] !== undefined) {
            status = {
              kind: 'superseded-by',
              payload: sm[3],
              literal,
            };
          } else if (lower.startsWith('verified-') && sm[4] !== undefined) {
            status = {
              kind: 'verified',
              payload: sm[4],
              literal,
            };
          }
        }
      }
      if (importedAs === null) {
        const im = IMPORTED_AS_REGEX.exec(bodyLine.trim());
        if (im !== null && im[1] !== undefined) {
          importedAs = im[1];
        }
      }
    }

    entries.push({
      id,
      heading,
      status,
      importedAs,
      severity,
      category,
      body: bodyLines.join('\n'),
      headingLineIndex,
      sourcePath,
      featureSlug,
    });

    i = j;
  }
  return entries;
}

/**
 * Scan the audit-log text and find the highest `<NN>` already used for
 * `dateKey` (a YYYYMMDD string). Returns 0 when nothing matches; the
 * next emission then uses `<NN> = 1` (formatted as `01`).
 */
export function findHighestAuditCounter(args: {
  readonly auditLogText: string;
  readonly dateKey: string;
}): number {
  const { auditLogText, dateKey } = args;
  let highest = 0;
  for (const line of auditLogText.split('\n')) {
    const m = AUDIT_ID_REGEX.exec(line);
    if (m === null) continue;
    if (m[2] !== dateKey) continue;
    const counterStr = m[3];
    if (counterStr === undefined) continue;
    const counter = Number.parseInt(counterStr, 10);
    if (Number.isFinite(counter) && counter > highest) {
      highest = counter;
    }
  }
  return highest;
}

export interface ImportPlan {
  readonly tf: ToolingFeedbackEntry;
  readonly auditId: string;
  readonly auditBody: string;
}

/**
 * Render a single audit-log entry derived from a TF entry. Mirrors the
 * audit-log format established in
 * docs/1.0/001-IN-PROGRESS/scope-discovery/audit-log.md:
 *
 *   ### <title>
 *
 *   Finding-ID: <auditId>
 *   Status:     <tf status verbatim>
 *   Severity:   <tf severity>
 *   Surface:    docs/<v>/001-IN-PROGRESS/<slug>/tooling-feedback.md#<tf id>
 *
 *   Imported from tooling-feedback log entry <tf id> (...).
 *   <verbatim TF body>
 */
export function renderAuditEntry(args: {
  readonly tf: ToolingFeedbackEntry;
  readonly auditId: string;
  readonly tfSourceRel: string;
}): string {
  const { tf, auditId, tfSourceRel } = args;
  const status = tf.status?.literal ?? 'open';
  const title = `${tf.id} (${tf.featureSlug}) — ${tf.heading.split('·').slice(3).join('·').trim()}`;
  const surface = `${tfSourceRel}#${tf.id.toLowerCase()}`;
  const xref =
    `Imported from tooling-feedback log entry ${tf.id} ` +
    `(${tfSourceRel}); preserves the closure-status (${status}) and the ` +
    `TF entry's verbatim body below.`;
  const bodyTrimmed = tf.body.replace(/\s+$/u, '');
  const lines: string[] = [];
  lines.push(`### ${title}`);
  lines.push('');
  lines.push(`Finding-ID: ${auditId}`);
  lines.push(`Status:     ${status}`);
  lines.push(`Severity:   ${tf.severity}`);
  lines.push(`Surface:    ${surface}`);
  lines.push('');
  lines.push(xref);
  lines.push('');
  lines.push(bodyTrimmed);
  return lines.join('\n');
}

/**
 * Annotate a TF entry in the source markdown text with the
 * `imported-as: AUDIT-<id>` watermark. The annotation lands directly
 * BEFORE the closing-status line (or at the end of the entry body when
 * there's no closing-status line, though that shouldn't happen because
 * closure-status presence is a prerequisite for import).
 *
 * Returns the updated source text. Idempotent: if the entry already
 * carries an `imported-as:` line, the text is returned unchanged.
 */
export function annotateImportedAs(args: {
  readonly text: string;
  readonly tf: ToolingFeedbackEntry;
  readonly auditId: string;
}): string {
  const { text, tf, auditId } = args;
  if (tf.importedAs !== null) return text;
  const lines = text.split('\n');
  // Find the next line after the heading that has the Status: marker.
  let statusLineIndex = -1;
  for (let i = tf.headingLineIndex + 1; i < lines.length; i += 1) {
    const cur = lines[i] ?? '';
    if (cur.startsWith('## ')) break;
    if (STATUS_LINE_REGEX.test(cur.trim())) {
      statusLineIndex = i;
      break;
    }
  }
  const annotation = `imported-as: ${auditId}`;
  if (statusLineIndex === -1) {
    // No status line found — append at the very end of the TF entry's
    // body block. This is a defensive branch; the import flow excludes
    // entries without status lines.
    let endIndex = tf.headingLineIndex + 1;
    while (endIndex < lines.length && !(lines[endIndex] ?? '').startsWith('## ')) {
      endIndex += 1;
    }
    lines.splice(endIndex, 0, annotation, '');
    return lines.join('\n');
  }
  // Insert directly before the status line.
  lines.splice(statusLineIndex, 0, annotation);
  return lines.join('\n');
}

interface CliOptions {
  readonly slug: string | null;
  readonly apply: boolean;
  readonly dryRun: boolean;
  readonly repoRoot: string;
  readonly auditLogPath: string | null;
  readonly today: string | null;
  readonly quiet: boolean;
}

function parseCli(argv: readonly string[]): CliOptions {
  let slug: string | null = null;
  let apply = false;
  let dryRun = false;
  let repoRoot = process.cwd();
  let auditLogPath: string | null = null;
  let today: string | null = null;
  let quiet = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case '--slug': {
        const next = argv[i + 1];
        if (next === undefined) throw new Error('--slug requires a value');
        slug = next;
        i += 1;
        break;
      }
      case '--apply':
        apply = true;
        break;
      case '--dry-run':
        dryRun = true;
        break;
      case '--repo-root': {
        const next = argv[i + 1];
        if (next === undefined) throw new Error('--repo-root requires a path');
        repoRoot = next;
        i += 1;
        break;
      }
      case '--audit-log': {
        const next = argv[i + 1];
        if (next === undefined) throw new Error('--audit-log requires a path');
        auditLogPath = next;
        i += 1;
        break;
      }
      case '--today': {
        const next = argv[i + 1];
        if (next === undefined) throw new Error('--today requires YYYYMMDD');
        if (!/^\d{8}$/.test(next)) {
          throw new Error('--today must be YYYYMMDD (e.g. 20260526)');
        }
        today = next;
        i += 1;
        break;
      }
      case '--quiet':
        quiet = true;
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
        throw new Error('unreachable');
      default:
        throw new Error(`unknown argument: ${arg ?? '<empty>'}`);
    }
  }
  if (apply && dryRun) {
    throw new Error('--apply and --dry-run are mutually exclusive');
  }
  return {
    slug,
    apply,
    dryRun: !apply,
    repoRoot,
    auditLogPath,
    today,
    quiet,
  };
}

function printHelp(): void {
  process.stdout.write(
    [
      'Usage: dw-lifecycle tooling-feedback-import [options]',
      '',
      'Promote closure-marked TF entries from per-feature',
      'tooling-feedback.md files into the scope-discovery audit-log.',
      '',
      'Options:',
      '  --slug <slug>      Restrict to one feature (default: all in-progress).',
      '  --apply            Perform the import; writes audit-log + TF annotations.',
      '  --dry-run          Print intended imports; do not write (default).',
      '  --repo-root <path> Override repo root (default: cwd).',
      '  --audit-log <path> Override audit-log path.',
      '  --today <YYYYMMDD> Override "today" for deterministic numbering.',
      '  --quiet            Suppress informational stderr.',
      '  --help, -h         Show this help.',
      '',
      'Closure-status grammar:',
      '  addressed-<sha>           ← fix landed in commit <sha>',
      '  superseded-by-<TF-NN>     ← rolled into a later TF entry',
      '  verified-<date>           ← post-release re-exercise confirmed',
      '',
      'Idempotency: imported TF entries gain an `imported-as: AUDIT-<id>` line.',
      'Re-running the importer skips entries that already carry this marker.',
      '',
      'Exit codes: 0 ok, 2 invalid args / missing audit-log / I/O error.',
      '',
    ].join('\n'),
  );
}

function formatTodayUtc(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

async function findInProgressFeatures(
  repoRoot: string,
  slug: string | null,
): Promise<readonly string[]> {
  const docsRoot = join(repoRoot, DOCS_ROOT_REL);
  if (!existsSync(docsRoot)) return [];
  const out: string[] = [];
  const versions = await readdir(docsRoot, { withFileTypes: true });
  for (const versionEntry of versions) {
    if (!versionEntry.isDirectory()) continue;
    const stageDir = join(docsRoot, versionEntry.name, IN_PROGRESS_STAGE);
    if (!existsSync(stageDir)) continue;
    const features = await readdir(stageDir, { withFileTypes: true });
    for (const featureEntry of features) {
      if (!featureEntry.isDirectory()) continue;
      if (slug !== null && featureEntry.name !== slug) continue;
      const tfPath = join(stageDir, featureEntry.name, TOOLING_FEEDBACK_FILENAME);
      if (existsSync(tfPath)) out.push(tfPath);
    }
  }
  return out;
}

export interface ImportSummary {
  readonly totalEntries: number;
  readonly closureReady: number;
  readonly alreadyImported: number;
  readonly imported: readonly ImportPlan[];
  readonly auditLogPath: string;
}

function resolvePath(repoRoot: string, p: string): string {
  return isAbsolute(p) ? p : resolve(repoRoot, p);
}

function relativeFromRepoRoot(repoRoot: string, abs: string): string {
  const rooted = resolve(repoRoot);
  const target = resolve(abs);
  if (target.startsWith(rooted + '/')) {
    return target.slice(rooted.length + 1);
  }
  return abs;
}

export interface MainResult {
  readonly code: 0 | 2;
  readonly summary?: ImportSummary;
}

/**
 * Programmatic entrypoint. Tests drive this directly. The CLI shim
 * wraps it with a process.exit on the result code.
 */
export async function main(argv: readonly string[]): Promise<MainResult> {
  let opts: CliOptions;
  try {
    opts = parseCli(argv);
  } catch (err) {
    process.stderr.write(`tooling-feedback-import: ${errorMessage(err)}\n`);
    return { code: 2 };
  }
  const auditLogPath = resolvePath(
    opts.repoRoot,
    opts.auditLogPath ?? DEFAULT_AUDIT_LOG_REL,
  );
  if (!existsSync(auditLogPath)) {
    process.stderr.write(
      `tooling-feedback-import: audit-log missing at ${auditLogPath}\n`,
    );
    return { code: 2 };
  }
  let auditLogText: string;
  try {
    auditLogText = await readFile(auditLogPath, 'utf8');
  } catch (err) {
    process.stderr.write(
      `tooling-feedback-import: failed to read audit-log: ${errorMessage(err)}\n`,
    );
    return { code: 2 };
  }

  const tfPaths = await findInProgressFeatures(opts.repoRoot, opts.slug);
  if (!opts.quiet) {
    process.stderr.write(
      `tooling-feedback-import: scanning ${tfPaths.length} tooling-feedback.md file(s)\n`,
    );
  }

  const today = opts.today ?? formatTodayUtc(new Date());
  let counter = findHighestAuditCounter({
    auditLogText,
    dateKey: today,
  });

  const allEntries: ToolingFeedbackEntry[] = [];
  // Map each tfPath → the (mutable) source text we'll write back.
  const updatedTfTexts = new Map<string, string>();
  for (const tfPath of tfPaths) {
    const text = await readFile(tfPath, 'utf8');
    updatedTfTexts.set(tfPath, text);
    const featureSlug = tfPath.split('/').slice(-2)[0] ?? '<unknown>';
    const entries = parseToolingFeedback({
      text,
      sourcePath: tfPath,
      featureSlug,
    });
    allEntries.push(...entries);
  }

  const closureReady = allEntries.filter((e) => e.status !== null);
  const alreadyImported = closureReady.filter((e) => e.importedAs !== null);
  const pendingImport = closureReady.filter((e) => e.importedAs === null);

  const imported: ImportPlan[] = [];
  let nextAuditLogText = auditLogText;
  for (const tf of pendingImport) {
    counter += 1;
    const auditId = `AUDIT-${today}-${String(counter).padStart(2, '0')}`;
    const tfSourceRel = relativeFromRepoRoot(opts.repoRoot, tf.sourcePath);
    const auditBody = renderAuditEntry({ tf, auditId, tfSourceRel });
    imported.push({ tf, auditId, auditBody });

    // Splice the audit body onto the end of the audit-log text.
    if (!nextAuditLogText.endsWith('\n')) nextAuditLogText += '\n';
    nextAuditLogText += '\n' + auditBody + '\n';

    // Update the TF source text in-memory.
    const current = updatedTfTexts.get(tf.sourcePath) ?? '';
    const updated = annotateImportedAs({ text: current, tf, auditId });
    updatedTfTexts.set(tf.sourcePath, updated);
  }

  const summary: ImportSummary = {
    totalEntries: allEntries.length,
    closureReady: closureReady.length,
    alreadyImported: alreadyImported.length,
    imported,
    auditLogPath,
  };

  if (opts.apply && imported.length > 0) {
    await writeFile(auditLogPath, nextAuditLogText, 'utf8');
    for (const [path, text] of updatedTfTexts.entries()) {
      // Only write back the TFs we modified.
      const touched = imported.some((p) => p.tf.sourcePath === path);
      if (!touched) continue;
      await writeFile(path, text, 'utf8');
    }
  }

  if (!opts.quiet) {
    const mode = opts.apply ? 'APPLIED' : 'DRY-RUN';
    process.stderr.write(
      `tooling-feedback-import: ${mode} — ` +
        `${imported.length} imported, ` +
        `${alreadyImported.length} already imported, ` +
        `${closureReady.length} closure-ready, ` +
        `${allEntries.length} total\n`,
    );
    for (const plan of imported) {
      process.stderr.write(
        `  ${plan.tf.id} (${plan.tf.featureSlug}) → ${plan.auditId} ` +
          `[${plan.tf.status?.literal ?? '?'}]\n`,
      );
    }
  }

  return { code: 0, summary };
}
