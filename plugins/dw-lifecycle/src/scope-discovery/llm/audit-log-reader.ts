/**
 * plugins/dw-lifecycle/src/scope-discovery/llm/audit-log-reader.ts
 *
 * Audit-log read library.
 *
 * Per-feature isolation: each feature owns its own watermark at
 * `<orchestratorRuntimeDir>/<featureSlug>/last-audit-read.json`. See TF-012.
 */

import { existsSync } from 'node:fs';
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
  readonly watermark: string;
  readonly persistedAt: string;
}

function watermarkPath(repoRoot: string, runtimeDir: string, featureSlug: string): string {
  return resolve(repoRoot, runtimeDir, featureSlug, WATERMARK_FILENAME);
}

function legacyWatermarkPath(repoRoot: string, runtimeDir: string): string {
  return resolve(repoRoot, runtimeDir, WATERMARK_FILENAME);
}

const warnedLegacyWatermarkPaths = new Set<string>();

function warnLegacyWatermark(legacyPath: string): void {
  if (warnedLegacyWatermarkPaths.has(legacyPath)) return;
  warnedLegacyWatermarkPaths.add(legacyPath);
  process.stderr.write(
    `audit-log-reader: legacy per-repo watermark at ${legacyPath} ignored — ` +
      'using empty per-feature watermark. Delete the legacy file when you have ' +
      'confirmed no other features depend on it.\n',
  );
}

function requireFeatureSlug(featureSlug: string, fn: string): void {
  if (featureSlug.length === 0) {
    throw new Error(`audit-log-reader: ${fn} requires a non-empty featureSlug`);
  }
}

export async function loadAuditWatermark(
  repoRoot: string,
  featureSlug: string,
  configOverride?: LlmConfig,
): Promise<string> {
  requireFeatureSlug(featureSlug, 'loadAuditWatermark');
  const config = configOverride ?? (await loadLlmConfig(repoRoot));
  const path = watermarkPath(repoRoot, config.orchestratorRuntimeDir, featureSlug);
  try {
    const text = await readFile(path, 'utf8');
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (err) {
      throw new Error(`audit-log-reader: cannot parse watermark file ${path}: ${errorMessage(err)}`);
    }
    if (!isPlainObject(parsed)) {
      throw new Error(`audit-log-reader: watermark ${path} did not parse to an object`);
    }
    const w = parsed['watermark'];
    if (typeof w !== 'string') {
      throw new Error(`audit-log-reader: watermark ${path} missing string \`watermark\` field`);
    }
    return w;
  } catch (err) {
    if (isEnoent(err)) {
      const legacy = legacyWatermarkPath(repoRoot, config.orchestratorRuntimeDir);
      if (existsSync(legacy)) warnLegacyWatermark(legacy);
      return '';
    }
    throw err;
  }
}

export async function persistAuditWatermark(
  repoRoot: string,
  featureSlug: string,
  watermark: string,
  configOverride?: LlmConfig,
): Promise<void> {
  requireFeatureSlug(featureSlug, 'persistAuditWatermark');
  const config = configOverride ?? (await loadLlmConfig(repoRoot));
  const path = watermarkPath(repoRoot, config.orchestratorRuntimeDir, featureSlug);
  await mkdir(dirname(path), { recursive: true });
  const data: WatermarkFile = {
    watermark,
    persistedAt: new Date().toISOString(),
  };
  await writeFile(path, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

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
      if (key === 'Finding-ID') { findingId = value; continue; }
      if (key === 'Status') { status = value; continue; }
      if (key === 'Severity') { severity = value; continue; }
      if (key === 'Surface') { surface = value; continue; }
      if (key === 'Affects') {
        affects = value.split(',').map((s) => s.trim()).filter((s) => s.length > 0);
        continue;
      }
      if (key === 'Provenance') { provenance = value; continue; }
    }
    bodyLines.push(line);
  }

  if (findingId === null) return null;
  if (status === null) status = '';

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

export async function readAuditLogFile(
  auditLogPath: string,
  watermark: string,
): Promise<AuditLogReadResult> {
  let text: string;
  try {
    text = await readFile(auditLogPath, 'utf8');
  } catch (err) {
    if (isEnoent(err)) {
      return { entries: [], watermark };
    }
    throw new Error(`audit-log-reader: cannot read ${auditLogPath}: ${errorMessage(err)}`);
  }
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

export async function readAuditLogUpdates(args: {
  readonly repoRoot: string;
  readonly featureSlug: string;
  readonly auditLogPath: string;
  readonly configOverride?: LlmConfig;
}): Promise<AuditLogReadResult> {
  const watermark = await loadAuditWatermark(args.repoRoot, args.featureSlug, args.configOverride);
  return readAuditLogFile(args.auditLogPath, watermark);
}
