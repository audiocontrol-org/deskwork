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

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import type { GovernConvergenceRecord } from '../workflow/workflow-types.js';
import { computeScopeFingerprint } from './checkpoint-state.js';

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
  readonly override?: unknown;
  readonly overrideReason?: unknown;
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
  return validate(parsed, path, mode, item, installationRoot);
}

function validate(
  parsed: ParsedRecord,
  path: string,
  expectedMode: GovernMode,
  expectedItem: string,
  installationRoot: string,
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
  // F3 (governance MEDIUM, cross-model): the stamped anchorRoot is authoritative —
  // a copied/stale record from ANOTHER installation must not be accepted (it would
  // open the shipped gate against the wrong tree). Compare to the reading root.
  if (resolve(parsed.anchorRoot) !== resolve(installationRoot)) {
    throw new Error(
      `${path}: govern-convergence record anchorRoot '${parsed.anchorRoot}' does not match the ` +
        `installation root '${installationRoot}' (a record from another installation is not authoritative)`,
    );
  }
  // specs/029 US4 (FR-018): optional override attribution. When present, `override`
  // must be boolean and `overrideReason` a non-empty string — a malformed marker is
  // a corrupt record (fail loud), not silently dropped.
  if (parsed.override !== undefined && typeof parsed.override !== 'boolean') {
    throw new Error(`${path}: govern-convergence record override must be a boolean when present`);
  }
  if (
    parsed.overrideReason !== undefined &&
    (typeof parsed.overrideReason !== 'string' || parsed.overrideReason.length === 0)
  ) {
    throw new Error(
      `${path}: govern-convergence record overrideReason must be a non-empty string when present`,
    );
  }
  // specs/029 US4 (FINDING 3, codex MEDIUM): the writer only ever emits the two
  // fields TOGETHER (`override: true` + a non-empty `overrideReason`) or NEITHER.
  // Reject the impossible combinations a corrupt/hand-edited record could carry —
  // `override: true` REQUIRES a reason; a present `overrideReason` REQUIRES
  // `override === true` — so they cannot silently desync the gate signal.
  if (parsed.override === true && parsed.overrideReason === undefined) {
    throw new Error(
      `${path}: govern-convergence record override is true but overrideReason is absent ` +
        `(an override graduation must carry its reason)`,
    );
  }
  if (parsed.overrideReason !== undefined && parsed.override !== true) {
    throw new Error(
      `${path}: govern-convergence record carries an overrideReason without override: true ` +
        `(a reason is only valid on an override graduation)`,
    );
  }
  return {
    version: 1,
    mode: parsed.mode,
    item: parsed.item,
    scopeFingerprint: parsed.scopeFingerprint,
    converged: parsed.converged,
    recordedAt: parsed.recordedAt,
    anchorRoot: parsed.anchorRoot,
    ...(parsed.override === true ? { override: true } : {}),
    ...(typeof parsed.overrideReason === 'string' && parsed.overrideReason.length > 0
      ? { overrideReason: parsed.overrideReason }
      : {}),
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

/**
 * Compute the scope fingerprint for a convergence record, reusing the 021
 * checkpoint fingerprint shape over the governed paths. When no governed path
 * resolves inside the installation (e.g. the spec dir is absent), fall back to a
 * stable digest of the item id so the record always carries a non-empty
 * fingerprint (a later in-scope change re-fingerprints when paths DO resolve).
 */
function convergenceFingerprint(
  installationRoot: string,
  item: string,
  scopePaths: readonly string[],
): string {
  const usable = scopePaths
    .map((p) => (isAbsolute(p) ? relative(installationRoot, p) : p))
    .filter((rel) => rel.length > 0 && !rel.startsWith('..') && existsSync(resolve(installationRoot, rel)));
  if (usable.length > 0) {
    return computeScopeFingerprint(installationRoot, usable);
  }
  return createHash('sha256').update(`\0item\0${item}`).digest('hex');
}

/**
 * Record that governance converged for an item (the govern emit-site seam, T029).
 * Writes a `converged: true` record keyed by mode, fingerprinting the governed
 * scope. `recordedAt` is supplied by the caller (the CLI stamps the time).
 */
export function recordGovernConvergence(
  installationRoot: string,
  mode: GovernMode,
  item: string,
  scopePaths: readonly string[],
  recordedAt: string,
  // specs/029 US4 (FR-018): when present, this graduation is an operator
  // `--override` short-circuit, recorded durably so a downstream consumer can
  // DISTINGUISH it from a real convergence (the record is the only durable
  // artifact — FR-017 fires zero barrage).
  overrideReason?: string,
): string {
  return writeGovernConvergenceRecord(installationRoot, {
    version: 1,
    mode,
    item,
    scopeFingerprint: convergenceFingerprint(installationRoot, item, scopePaths),
    converged: true,
    recordedAt,
    ...(overrideReason !== undefined
      ? { override: true, overrideReason }
      : {}),
  });
}
