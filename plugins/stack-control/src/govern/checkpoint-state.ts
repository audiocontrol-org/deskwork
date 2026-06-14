import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  readdirSync,
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
}

const CHECKPOINTS_REL = join('.stack-control', 'govern', 'phase-checkpoints');

function checkpointDir(installationRoot: string, featureSlug: string): string {
  return join(installationRoot, CHECKPOINTS_REL, safePathComponent(featureSlug, 'featureSlug'));
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

export function writePhaseCheckpoint(
  installationRoot: string,
  record: PhaseCheckpointRecord,
): string {
  const path = checkpointPath(installationRoot, record.featureSlug, record.phaseId);
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
  scopeFingerprint: string,
): boolean {
  return record.scopeFingerprint === scopeFingerprint;
}

export function computeScopeFingerprint(
  installationRoot: string,
  paths: readonly string[],
): string {
  const digest = createHash('sha256');
  for (const rel of canonicalizeScopePaths(paths)) {
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
  return abs;
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
  return {
    version: 1,
    featureSlug: parsed.featureSlug,
    phaseId: parsed.phaseId,
    checkpoint: parsed.checkpoint,
    auditLogSection: parsed.auditLogSection,
    scopeFingerprint: parsed.scopeFingerprint,
    passedAt: parsed.passedAt,
    governedPaths: parsed.governedPaths,
  };
}
