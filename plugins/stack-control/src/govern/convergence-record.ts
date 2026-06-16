// Mode-keyed govern-convergence record (022 US6 / TASK-19, FR-028).
//
// A single SYMMETRIC mechanism keyed by `mode` (`spec` | `impl`) records that
// governance converged for a roadmap item. Written inside the installation
// domain (FR-030); durable across sessions; reuses the 021 checkpoint scope
// fingerprint shape so a later in-scope change can mark it stale. Phase
// derivation + the `governing → shipped` exit gate read it; no agent assertion or
// tasks-completion may substitute (FR-029).
//
// Gate-enforcement policy (2026-06-16): the `impl` record is the required,
// mechanical `governing → shipped` signal; the `spec` record is RETAINED but its
// gate is opt-in (spec audit-barrage parked, TASK-138). This module is the
// mechanism — symmetric for both modes — independent of which gate is enforced.

import { existsSync, mkdirSync, readFileSync, realpathSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { GovernConvergenceRecord } from '../workflow/workflow-types.js';

export type GovernMode = GovernConvergenceRecord['mode'];

const CONVERGENCE_REL = join('.stack-control', 'govern', 'convergence');

/** A filesystem-safe component derived from a roadmap node id (`multi:feature/x`). */
function safeItem(item: string): string {
  const safe = item.replace(/[^a-zA-Z0-9._-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  if (safe.length === 0) {
    throw new Error(`govern-convergence record: item id '${item}' has no filesystem-safe characters`);
  }
  return safe;
}

/** Absolute path of the mode-keyed record for an item, anchored in the installation. */
export function convergenceRecordPath(
  installationRoot: string,
  mode: GovernMode,
  item: string,
): string {
  return join(installationRoot, CONVERGENCE_REL, `${mode}__${safeItem(item)}.json`);
}

/** Fail loud if the record path escapes the installation root (FR-030 anchor invariant). */
function assertAnchored(installationRoot: string, recordPath: string): void {
  const rel = relative(resolve(installationRoot), resolve(recordPath)).split('\\').join('/');
  if (rel === '..' || rel.startsWith('../')) {
    throw new Error(`govern-convergence record escapes the installation root: ${recordPath}`);
  }
}

/**
 * Write a convergence record atomically (temp + rename). `anchorRoot` is stamped
 * as the installation root the record lives under so a reader can confirm it.
 */
export function writeGovernConvergenceRecord(
  installationRoot: string,
  record: Omit<GovernConvergenceRecord, 'anchorRoot'>,
): string {
  const path = convergenceRecordPath(installationRoot, record.mode, record.item);
  assertAnchored(installationRoot, path);
  const full: GovernConvergenceRecord = { ...record, anchorRoot: installationRoot };
  mkdirSync(dirname(path), { recursive: true });
  const tempPath = `${path}.tmp-${process.pid}-${randomUUID()}`;
  writeFileSync(tempPath, `${JSON.stringify(full, null, 2)}\n`, 'utf8');
  renameSync(tempPath, path);
  return path;
}

interface ParsedRecord {
  readonly version?: unknown;
  readonly mode?: unknown;
  readonly item?: unknown;
  readonly scopeFingerprint?: unknown;
  readonly converged?: unknown;
  readonly recordedAt?: unknown;
  readonly anchorRoot?: unknown;
}

/** Read the mode-keyed record for an item; null when none exists. Fail loud on corruption. */
export function readGovernConvergenceRecord(
  installationRoot: string,
  mode: GovernMode,
  item: string,
): GovernConvergenceRecord | null {
  const path = convergenceRecordPath(installationRoot, mode, item);
  if (!existsSync(path)) return null;
  let parsed: ParsedRecord;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8')) as ParsedRecord;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`${path}: govern-convergence record is corrupt or torn; ${message}`);
  }
  return validate(parsed, path, mode, item);
}

function validate(
  parsed: ParsedRecord,
  path: string,
  expectedMode: GovernMode,
  expectedItem: string,
): GovernConvergenceRecord {
  if (parsed.version !== 1) throw new Error(`${path}: govern-convergence record version must be 1`);
  if (parsed.mode !== 'spec' && parsed.mode !== 'impl') {
    throw new Error(`${path}: govern-convergence record mode must be 'spec' or 'impl'`);
  }
  if (parsed.mode !== expectedMode) {
    throw new Error(`${path}: govern-convergence record mode mismatch (expected '${expectedMode}')`);
  }
  if (typeof parsed.item !== 'string' || parsed.item.length === 0) {
    throw new Error(`${path}: govern-convergence record item must be a non-empty string`);
  }
  if (parsed.item !== expectedItem) {
    throw new Error(`${path}: govern-convergence record item mismatch (expected '${expectedItem}')`);
  }
  if (typeof parsed.scopeFingerprint !== 'string' || parsed.scopeFingerprint.length === 0) {
    throw new Error(`${path}: govern-convergence record scopeFingerprint must be a non-empty string`);
  }
  if (typeof parsed.converged !== 'boolean') {
    throw new Error(`${path}: govern-convergence record converged must be a boolean`);
  }
  if (typeof parsed.recordedAt !== 'string' || parsed.recordedAt.length === 0) {
    throw new Error(`${path}: govern-convergence record recordedAt must be a non-empty string`);
  }
  if (typeof parsed.anchorRoot !== 'string' || parsed.anchorRoot.length === 0) {
    throw new Error(`${path}: govern-convergence record anchorRoot must be a non-empty string`);
  }
  return {
    version: 1,
    mode: parsed.mode,
    item: parsed.item,
    scopeFingerprint: parsed.scopeFingerprint,
    converged: parsed.converged,
    recordedAt: parsed.recordedAt,
    anchorRoot: parsed.anchorRoot,
  };
}

/** True when an item has a recorded ∧ converged record for the mode (the gate signal). */
export function isModeConverged(
  installationRoot: string,
  mode: GovernMode,
  item: string,
): boolean {
  const record = readGovernConvergenceRecord(installationRoot, mode, item);
  return record !== null && record.converged;
}
