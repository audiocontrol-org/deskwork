// 030 cluster-payload — cheap non-audit-byte trim pre-pass (FR-006, R2). Drops
// lockfiles, generated/vendored output, whitespace-only hunks, and fixture bytes
// from a cluster's payload before measuring against the envelope, recording each
// dropped category + byte count (recorded, never silent — Principle V).
// Implemented in Phase 3 (T018).

import type { TrimCategory, TrimRecord } from '../chunk-artifacts.js';

/** A chunk of diff content keyed by its file path (the unit the trim pre-pass operates on). */
export interface FileDiff {
  readonly path: string;
  readonly diffText: string;
}

/** The result of the trim pre-pass: the surviving (auditable) diffs + what was dropped. */
export interface TrimResult {
  readonly kept: readonly FileDiff[];
  readonly trimApplied: readonly TrimRecord[];
}

const LOCKFILE = /^(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|Cargo\.lock|poetry\.lock|composer\.lock|Gemfile\.lock)$/;

function basename(p: string): string {
  const i = p.lastIndexOf('/');
  return i === -1 ? p : p.slice(i + 1);
}

/** Is a unified-diff's change set whitespace-only (the non-whitespace content unchanged)? */
function isWhitespaceOnly(diff: string): boolean {
  const added: string[] = [];
  const removed: string[] = [];
  for (const line of diff.split('\n')) {
    if (line.startsWith('+++') || line.startsWith('---')) continue;
    if (line.startsWith('+')) added.push(line.slice(1).replace(/\s+/g, ''));
    else if (line.startsWith('-')) removed.push(line.slice(1).replace(/\s+/g, ''));
  }
  if (added.length === 0 && removed.length === 0) return false; // no change content ⇒ not a trim candidate
  const na = added.filter((s) => s.length > 0).sort();
  const nr = removed.filter((s) => s.length > 0).sort();
  return na.length === nr.length && na.every((v, i) => v === nr[i]);
}

/** Classify a file as a non-audit category, or null if it is genuine auditable content. */
function classify(file: FileDiff): TrimCategory | null {
  const p = file.path;
  const base = basename(p);
  if (LOCKFILE.test(base)) return 'lockfile';
  if (/(^|\/)(node_modules|vendor)\//.test(p)) return 'vendored';
  if (/(^|\/)(dist|build|out|\.runtime-cache)\//.test(p) || /\.min\.(js|css)$/.test(base) || /\.generated\./.test(base)) return 'generated';
  if (/(^|\/)(fixtures|__fixtures__)\//.test(p)) return 'fixture';
  if (isWhitespaceOnly(file.diffText)) return 'whitespace';
  return null;
}

/** Drop non-audit bytes (lockfile/generated/vendored/whitespace/fixture), recording each category. */
export function trimNonAuditBytes(files: readonly FileDiff[]): TrimResult {
  const kept: FileDiff[] = [];
  const trimApplied: TrimRecord[] = [];
  for (const f of files) {
    const cat = classify(f);
    if (cat === null) kept.push(f);
    else trimApplied.push({ category: cat, bytes: f.diffText.length });
  }
  return { kept, trimApplied };
}
