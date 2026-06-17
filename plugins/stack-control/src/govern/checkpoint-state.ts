import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  readdirSync,
  realpathSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

export interface PhaseCheckpointRecord {
  readonly version: 1;
  readonly featureSlug: string;
  readonly phaseId: string;
  readonly checkpoint: string;
  readonly auditLogSection: string;
  readonly scopeFingerprint: string;
  readonly passedAt: string;
  readonly governedPaths: readonly string[];
  /**
   * The files the phase's audit ACTUALLY covered — `git diff --name-only
   * <phaseBase> -- <governedPaths>` at write time. Distinct from `governedPaths`
   * (the tasks.md-declared scope, which may name DIRECTORIES): whole-feature
   * composition carries these EXACT files so a cross-cutting change under a
   * declared directory is not silently excluded (TASK-129). Optional for
   * back-compat: a checkpoint written before TASK-129 omits it and is
   * conservatively re-audited rather than carried.
   */
  readonly auditedFiles?: readonly string[];
}

interface ParsedCheckpointRecord {
  readonly version?: unknown;
  readonly featureSlug?: unknown;
  readonly phaseId?: unknown;
  readonly checkpoint?: unknown;
  readonly auditLogSection?: unknown;
  readonly scopeFingerprint?: unknown;
  readonly passedAt?: unknown;
  readonly governedPaths?: unknown;
  readonly auditedFiles?: unknown;
}

const CHECKPOINTS_REL = join('.stack-control', 'govern', 'phase-checkpoints');

function checkpointDir(installationRoot: string, featureSlug: string): string {
  return join(installationRoot, CHECKPOINTS_REL, safePathComponent(featureSlug, 'featureSlug'));
}

/**
 * The single source of truth for a phase's checkpoint/audit-log section key
 * (`phase-<id>`). Both the checkpoint `checkpoint`/`auditLogSection` fields and
 * the freshness comparison derive from this — so a format change can never drift
 * the writer (govern), the readers (the per-phase status resolver + US1 gate),
 * and the test fixtures out of sync (AUDIT-BARRAGE claude-02, 025 phase-1).
 */
export function phaseCheckpointSection(phaseId: string): string {
  return `phase-${phaseId}`;
}

export function checkpointPath(
  installationRoot: string,
  featureSlug: string,
  phaseId: string,
): string {
  return join(
    checkpointDir(installationRoot, featureSlug),
    `phase-${safePathComponent(phaseId, 'phaseId')}.json`,
  );
}

/**
 * Mark a phase checkpoint STALE (022 US8 / FR-032) — a `* → designing` re-entry
 * invalidates downstream audit work that re-design changed. Writes an additive
 * `.stale` sidecar next to the checkpoint (the record itself is preserved as
 * history); the next govern re-audits the phase. Returns the marker path.
 */
export function markCheckpointStale(
  installationRoot: string,
  featureSlug: string,
  phaseId: string,
  reason: string,
  at: string,
): string {
  const marker = `${checkpointPath(installationRoot, featureSlug, phaseId)}.stale`;
  assertCheckpointStoragePath(installationRoot, marker);
  mkdirSync(dirname(marker), { recursive: true });
  writeFileSync(marker, `${JSON.stringify({ reason, staledAt: at }, null, 2)}\n`, 'utf8');
  return marker;
}

/** True when a phase checkpoint has been marked stale by a re-design re-entry. */
export function isCheckpointStale(
  installationRoot: string,
  featureSlug: string,
  phaseId: string,
): boolean {
  return existsSync(`${checkpointPath(installationRoot, featureSlug, phaseId)}.stale`);
}

/** The phase ids of every checkpoint recorded for a feature ([] when none). */
export function listCheckpointPhaseIds(installationRoot: string, featureSlug: string): string[] {
  const dir = checkpointDir(installationRoot, featureSlug);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .map((name) => /^phase-(.+)\.json$/.exec(name))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => m[1]!);
}

export function writePhaseCheckpoint(
  installationRoot: string,
  record: PhaseCheckpointRecord,
): string {
  const path = checkpointPath(installationRoot, record.featureSlug, record.phaseId);
  assertCheckpointStoragePath(installationRoot, path);
  mkdirSync(dirname(path), { recursive: true });
  const tempPath = `${path}.tmp-${process.pid}-${randomUUID()}`;
  writeFileSync(tempPath, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
  renameSync(tempPath, path);
  return path;
}

export function readPhaseCheckpoint(
  installationRoot: string,
  featureSlug: string,
  phaseId: string,
): PhaseCheckpointRecord | null {
  const path = checkpointPath(installationRoot, featureSlug, phaseId);
  assertCheckpointStoragePath(installationRoot, path);
  if (!existsSync(path)) return null;
  let parsed: ParsedCheckpointRecord;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8')) as ParsedCheckpointRecord;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${path}: phase checkpoint is corrupt or torn; ${message}`);
  }
  return validateCheckpointRecord(parsed, path, featureSlug, phaseId);
}

export function isCheckpointFresh(
  record: PhaseCheckpointRecord,
  current: {
    readonly version: number;
    readonly checkpoint: string;
    readonly auditLogSection: string;
    readonly scopeFingerprint: string;
  },
): boolean {
  return (
    record.version === current.version &&
    record.checkpoint === current.checkpoint &&
    record.auditLogSection === current.auditLogSection &&
    record.scopeFingerprint === current.scopeFingerprint
  );
}

export function computeScopeFingerprint(
  installationRoot: string,
  paths: readonly string[],
): string {
  const canonical = canonicalizeScopePaths(paths);
  if (canonical.length === 0) {
    // An empty scope hashes to the stable SHA-256 of nothing — a checkpoint bound
    // to it can never go stale against implementation edits, silently bypassing the
    // freshness contract (AUDIT-BARRAGE-codex-01). Reject it loudly instead.
    throw new Error(
      'phase checkpoint scope requires at least one governed path; ' +
        'an empty scope cannot produce a meaningful fingerprint',
    );
  }
  const digest = createHash('sha256');
  for (const rel of canonical) {
    digestScopedPath(digest, installationRoot, rel);
  }
  return digest.digest('hex');
}

function canonicalizeScopePaths(paths: readonly string[]): readonly string[] {
  const normalized = Array.from(
    new Set(
      paths
        .map((path) => path.split('\\').join('/').replace(/\/+$/, ''))
        .filter((path) => path.length > 0),
    ),
  ).sort();
  const canonical: string[] = [];
  for (const path of normalized) {
    if (canonical.some((kept) => path === kept || path.startsWith(`${kept}/`))) {
      continue;
    }
    canonical.push(path);
  }
  return canonical;
}

function digestScopedPath(
  digest: ReturnType<typeof createHash>,
  installationRoot: string,
  rel: string,
): void {
  const canonicalRel = rel.split('\\').join('/');
  const abs = resolveScopedPath(installationRoot, canonicalRel);
  digest.update('\0');
  digest.update(canonicalRel);
  if (!existsSync(abs)) {
    digest.update('\0MISSING\0');
    return;
  }
  const stat = lstatSync(abs);
  if (stat.isSymbolicLink()) {
    throw new Error(
      `phase checkpoint governed path must not be a symlink: ${canonicalRel} -> ${readlinkSync(abs)}`,
    );
  }
  if (stat.isDirectory()) {
    digest.update('\0DIR\0');
    for (const child of readdirSync(abs).sort()) {
      digestScopedPath(digest, installationRoot, join(canonicalRel, child));
    }
    return;
  }
  digest.update('\0');
  digest.update(readFileSync(abs));
}

function resolveScopedPath(installationRoot: string, rel: string): string {
  if (rel.length === 0) {
    throw new Error('phase checkpoint governed path must be non-empty');
  }
  if (rel === '.' || rel === '..') {
    throw new Error(`phase checkpoint governed path must not be '.' or '..': ${rel}`);
  }
  const components = rel.split(/[\\/]+/);
  if (components.some((component) => component === '.' || component === '..')) {
    throw new Error(`phase checkpoint governed path must not contain dot segments: ${rel}`);
  }
  const abs = resolve(installationRoot, rel);
  const relToRoot = relative(installationRoot, abs).split('\\').join('/');
  if (relToRoot === '..' || relToRoot.startsWith('../')) {
    throw new Error(`phase checkpoint governed path escapes the installation root: ${rel}`);
  }
  const rootReal = realpathSync(installationRoot);
  const currentSegments: string[] = [];
  for (const component of components) {
    currentSegments.push(component);
    const candidate = resolve(installationRoot, currentSegments.join('/'));
    if (!existsSync(candidate)) {
      continue;
    }
    const stat = lstatSync(candidate);
    if (stat.isSymbolicLink()) {
      throw new Error(
        `phase checkpoint governed path must not be a symlink: ${currentSegments.join('/')}` +
          ` -> ${readlinkSync(candidate)}`,
      );
    }
    const candidateReal = realpathSync(candidate);
    const relToRealRoot = relative(rootReal, candidateReal).split('\\').join('/');
    if (relToRealRoot === '..' || relToRealRoot.startsWith('../')) {
      throw new Error(`phase checkpoint governed path escapes the installation root: ${rel}`);
    }
  }
  return abs;
}

function assertCheckpointStoragePath(
  installationRoot: string,
  checkpointFile: string,
): void {
  const rootReal = realpathSync(installationRoot);
  const rel = relative(installationRoot, checkpointFile).split('\\').join('/');
  const components = rel.split('/').filter((component) => component.length > 0);
  const existingPrefixes = components.slice(0, -1);
  const walked: string[] = [];
  for (const component of existingPrefixes) {
    walked.push(component);
    const candidate = resolve(installationRoot, walked.join('/'));
    if (!existsSync(candidate)) {
      continue;
    }
    const stat = lstatSync(candidate);
    if (stat.isSymbolicLink()) {
      throw new Error(
        `phase checkpoint storage path must not be a symlink: ${walked.join('/')} -> ${readlinkSync(candidate)}`,
      );
    }
    const candidateReal = realpathSync(candidate);
    const relToRealRoot = relative(rootReal, candidateReal).split('\\').join('/');
    if (relToRealRoot === '..' || relToRealRoot.startsWith('../')) {
      throw new Error(`phase checkpoint storage path escapes the installation root: ${rel}`);
    }
  }
  if (!existsSync(checkpointFile)) {
    return;
  }
  const stat = lstatSync(checkpointFile);
  if (stat.isSymbolicLink()) {
    throw new Error(
      `phase checkpoint storage path must not be a symlink: ${rel} -> ${readlinkSync(checkpointFile)}`,
    );
  }
  const checkpointReal = realpathSync(checkpointFile);
  const relToRealRoot = relative(rootReal, checkpointReal).split('\\').join('/');
  if (relToRealRoot === '..' || relToRealRoot.startsWith('../')) {
    throw new Error(`phase checkpoint storage path escapes the installation root: ${rel}`);
  }
}

function safePathComponent(value: string, field: 'featureSlug' | 'phaseId'): string {
  if (value.length === 0) {
    throw new Error(`phase checkpoint ${field} must be a non-empty string`);
  }
  if (value === '.' || value === '..' || value.includes('/') || value.includes('\\')) {
    throw new Error(
      `phase checkpoint ${field} must not contain path separators or dot segments`,
    );
  }
  return value;
}

function validateCheckpointRecord(
  parsed: ParsedCheckpointRecord,
  path: string,
  expectedFeatureSlug: string,
  expectedPhaseId: string,
): PhaseCheckpointRecord {
  if (parsed.version !== 1) {
    throw new Error(`${path}: phase checkpoint version must be 1`);
  }
  if (typeof parsed.featureSlug !== 'string' || parsed.featureSlug.length === 0) {
    throw new Error(`${path}: phase checkpoint featureSlug must be a non-empty string`);
  }
  if (typeof parsed.phaseId !== 'string' || parsed.phaseId.length === 0) {
    throw new Error(`${path}: phase checkpoint phaseId must be a non-empty string`);
  }
  if (parsed.featureSlug !== expectedFeatureSlug) {
    throw new Error(`${path}: phase checkpoint featureSlug mismatch (expected '${expectedFeatureSlug}')`);
  }
  if (parsed.phaseId !== expectedPhaseId) {
    throw new Error(`${path}: phase checkpoint phaseId mismatch (expected '${expectedPhaseId}')`);
  }
  if (typeof parsed.checkpoint !== 'string' || parsed.checkpoint.length === 0) {
    throw new Error(`${path}: phase checkpoint checkpoint must be a non-empty string`);
  }
  if (typeof parsed.auditLogSection !== 'string' || parsed.auditLogSection.length === 0) {
    throw new Error(`${path}: phase checkpoint auditLogSection must be a non-empty string`);
  }
  if (typeof parsed.scopeFingerprint !== 'string' || parsed.scopeFingerprint.length === 0) {
    throw new Error(`${path}: phase checkpoint scopeFingerprint must be a non-empty string`);
  }
  if (typeof parsed.passedAt !== 'string' || parsed.passedAt.length === 0) {
    throw new Error(`${path}: phase checkpoint passedAt must be a non-empty string`);
  }
  if (!Array.isArray(parsed.governedPaths) || !parsed.governedPaths.every((v) => typeof v === 'string')) {
    throw new Error(`${path}: phase checkpoint governedPaths must be a string array`);
  }
  // auditedFiles is optional (back-compat — pre-TASK-129 checkpoints omit it), but
  // when present it must be a well-formed string array; a malformed value fails loud
  // rather than being silently dropped.
  let auditedFiles: readonly string[] | undefined;
  if (parsed.auditedFiles !== undefined) {
    if (!Array.isArray(parsed.auditedFiles) || !parsed.auditedFiles.every((v) => typeof v === 'string')) {
      throw new Error(`${path}: phase checkpoint auditedFiles must be a string array when present`);
    }
    auditedFiles = parsed.auditedFiles;
  }
  return {
    version: 1,
    featureSlug: parsed.featureSlug,
    phaseId: parsed.phaseId,
    checkpoint: parsed.checkpoint,
    auditLogSection: parsed.auditLogSection,
    scopeFingerprint: parsed.scopeFingerprint,
    passedAt: parsed.passedAt,
    governedPaths: parsed.governedPaths,
    ...(auditedFiles !== undefined ? { auditedFiles } : {}),
  };
}
