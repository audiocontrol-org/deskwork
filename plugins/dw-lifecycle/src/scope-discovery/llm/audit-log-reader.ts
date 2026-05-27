/**
 * plugins/dw-lifecycle/src/scope-discovery/llm/audit-log-reader.ts
 *
 * Audit-log read library (Phase 11 Task 7).
 *
 * Reads new entries from a feature's audit-log markdown file
 * (`docs/<v>/001-IN-PROGRESS/<slug>/audit-log.md`) since a durable
 * watermark. The watermark persists in
 * `<orchestratorRuntimeDir>/last-audit-read.json` (default
 * `.dw-lifecycle/scope-discovery/orchestrator-runtime/last-audit-read.json`).
 *
 * The audit-log format (see the file's own how-to-operate-this-log
 * preamble) is a sequence of `### <heading>` blocks with a body of
 * `<Field>:   <value>` lines + free-form markdown prose. Entries that
 * carry a `Finding-ID: AUDIT-<date>-<NN>` are surfaced.
 *
 * Phase 11 Task 7 extension: entries may also carry `Affects:` (catalog
 * entries the finding touches) and `Provenance:` (e.g.
 * `external-auditor (<model>)`). The reader extracts both when present.
 *
 * Watermark semantics:
 *   - Watermark is the lexicographically-largest Finding-ID seen on
 *     the previous read. New entries are those with Finding-ID
 *     strictly greater than the watermark (string-compare; the
 *     `YYYYMMDD-NN` format sorts correctly).
 *   - First-ever read uses an empty-string watermark (every entry is
 *     "new") UNLESS the watermark file exists.
 *
 * Persistence is the caller's job — `readAuditLogUpdates` returns the
 * NEW watermark in the result; the caller calls
 * `persistAuditWatermark` after acting on the entries.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { loadLlmConfig } from './config.js';
import { errorMessage, isEnoent, isPlainObject } from '../util/typeguards.js';
import type {
  AuditLogEntry,
  AuditLogReadResult,
  LlmConfig,
} from './types.js';

const WATERMARK_FILENAME = 'last-audit-read.json';

interface WatermarkFile {
  /** Last Finding-ID processed (or empty-string on first run). */
  readonly watermark: string;
  /** ISO timestamp the watermark was last persisted. */
  readonly persistedAt: string;
}

function watermarkPath(repoRoot: string, runtimeDir: string): string {
  return resolve(repoRoot, runtimeDir, WATERMARK_FILENAME);
}

/**
 * Load the durable watermark (empty string on first run / missing file).
 */
export async function loadAuditWatermark(
  repoRoot: string,
  configOverride?: LlmConfig,
): Promise<string> {
  const config = configOverride ?? (await loadLlmConfig(repoRoot));
  const path = watermarkPath(repoRoot, config.orchestratorRuntimeDir);
  try {
    const text = await readFile(path, 'utf8');
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (err) {
      throw new Error(
        `audit-log-reader: cannot parse watermark file ${path}: ${errorMessage(err)}`,
      );
    }
    if (!isPlainObject(parsed)) {
      throw new Error(
        `audit-log-reader: watermark ${path} did not parse to an object`,
      );
    }
    const w = parsed['watermark'];
    if (typeof w !== 'string') {
      throw new Error(
        `audit-log-reader: watermark ${path} missing string \`watermark\` field`,
      );
    }
    return w;
  } catch (err) {
    if (isEnoent(err)) return '';
    throw err;
  }
}

/**
 * Persist a new watermark to the durable runtime dir. Creates parent
 * directories as needed.
 */
export async function persistAuditWatermark(
  repoRoot: string,
  watermark: string,
  configOverride?: LlmConfig,
): Promise<void> {
  const config = configOverride ?? (await loadLlmConfig(repoRoot));
  const path = watermarkPath(repoRoot, config.orchestratorRuntimeDir);
  await mkdir(dirname(path), { recursive: true });
  const data: WatermarkFile = {
    watermark,
    persistedAt: new Date().toISOString(),
  };
  await writeFile(path, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

/**
 * Parse a single `### <heading>` block + its following `Field: value`
 * lines + free-form body into an `AuditLogEntry`. Returns null when
 * the block has no `Finding-ID:` (not every `### ...` heading is a
 * finding; the audit-log also has section headings).
 */
function parseEntry(block: string): AuditLogEntry | null {
  const lines = block.split(/\r?\n/);
  if (lines.length === 0) return null;
  const headingLine = lines[0] ?? '';
  const headingMatch = /^###\s+(.+?)\s*$/.exec(headingLine);
  if (headingMatch === null) return null;
  const heading = headingMatch[1] ?? '';

  let findingId: string | null = null;
  let status: string | null = null;
  let severity: string | undefined;
  let surface: string | undefined;
  let affects: string[] | undefined;
  let provenance: string | undefined;
  const bodyLines: string[] = [];

  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    const fieldMatch = /^([A-Za-z][A-Za-z0-9 -]+):\s+(.+?)\s*$/.exec(line);
    if (fieldMatch !== null) {
      const key = (fieldMatch[1] ?? '').trim();
      const value = (fieldMatch[2] ?? '').trim();
      if (key === 'Finding-ID') {
        findingId = value;
        continue;
      }
      if (key === 'Status') {
        status = value;
        continue;
      }
      if (key === 'Severity') {
        severity = value;
        continue;
      }
      if (key === 'Surface') {
        surface = value;
        continue;
      }
      if (key === 'Affects') {
        affects = value
          .split(',')
          .map((s) => s.trim())
          .filter((s) => s.length > 0);
        continue;
      }
      if (key === 'Provenance') {
        provenance = value;
        continue;
      }
    }
    bodyLines.push(line);
  }

  if (findingId === null) return null;
  if (status === null) {
    // Malformed entry — surface but with empty status so the caller
    // can flag it. We don't throw; partial entries shouldn't break
    // a per-turn read of the whole log.
    status = '';
  }

  return {
    findingId,
    status,
    severity,
    surface,
    heading,
    affects,
    provenance,
    body: bodyLines.join('\n').trim(),
  };
}

/**
 * Read the audit-log markdown and surface entries strictly greater
 * than the watermark.
 */
export async function readAuditLogFile(
  auditLogPath: string,
  watermark: string,
): Promise<AuditLogReadResult> {
  let text: string;
  try {
    text = await readFile(auditLogPath, 'utf8');
  } catch (err) {
    if (isEnoent(err)) {
      // No audit-log file yet — first dispatch on a fresh feature.
      return { entries: [], watermark };
    }
    throw new Error(
      `audit-log-reader: cannot read ${auditLogPath}: ${errorMessage(err)}`,
    );
  }
  // Split on the `### ` heading boundary. Each chunk after split
  // starts with `### ` except the first (the preamble), which we
  // skip explicitly by `startsWith('### ')`.
  const chunks = text.split(/\n(?=### )/);
  const entries: AuditLogEntry[] = [];
  let newWatermark = watermark;
  for (const chunk of chunks) {
    if (!chunk.startsWith('### ')) continue;
    const entry = parseEntry(chunk);
    if (entry === null) continue;
    if (entry.findingId > newWatermark) {
      entries.push(entry);
      newWatermark = entry.findingId;
    }
  }
  return { entries, watermark: newWatermark };
}

/**
 * High-level public entry: read audit-log updates since the durable
 * watermark + return the new watermark (caller persists with
 * `persistAuditWatermark`).
 */
export async function readAuditLogUpdates(args: {
  readonly repoRoot: string;
  readonly auditLogPath: string;
  readonly configOverride?: LlmConfig;
}): Promise<AuditLogReadResult> {
  const watermark = await loadAuditWatermark(args.repoRoot, args.configOverride);
  return readAuditLogFile(args.auditLogPath, watermark);
}
