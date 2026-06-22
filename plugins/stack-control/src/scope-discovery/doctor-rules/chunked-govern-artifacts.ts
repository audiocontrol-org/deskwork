/**
 * plugins/stack-control/src/scope-discovery/doctor-rules/chunked-govern-artifacts.ts
 *
 * 030 US7 doctor rule (FR-021): validate the on-disk artifacts the chunked
 * end-govern feature introduces — the whole-feature convergence record and the
 * chunk-set (chunks + split-cluster markers) — against the schemas in
 * `govern/chunk-artifacts.ts`, so a malformed / missing-field / dangling-reference
 * artifact is caught rather than silently trusted (SC-006). Read-only.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  validateChunk,
  validateSplitClusterMarker,
  validateWholeFeatureConvergenceRecord,
} from '../../govern/chunk-artifacts.js';
import type { DoctorRuleCheck, DoctorRuleOptions, ScopeDoctorFinding } from './types.js';

const RULE_ID = 'chunked-govern-artifacts';
const CONVERGENCE_REL = join('.stack-control', 'govern', 'convergence');
const CHUNK_SETS_REL = join('.stack-control', 'govern', 'chunk-sets');

function msg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function jsonFiles(dir: string): string[] {
  if (existsSync(dir) === false) return [];
  return readdirSync(dir).filter((f) => f.endsWith('.json'));
}

export const check: DoctorRuleCheck = async (opts: DoctorRuleOptions): Promise<readonly ScopeDoctorFinding[]> => {
  const findings: ScopeDoctorFinding[] = [];

  // 1. Whole-feature convergence records.
  const convDir = join(opts.repoRoot, CONVERGENCE_REL);
  for (const f of jsonFiles(convDir).filter((f) => f.startsWith('impl__'))) {
    try {
      validateWholeFeatureConvergenceRecord(JSON.parse(readFileSync(join(convDir, f), 'utf8')));
    } catch (err) {
      findings.push({
        rule: RULE_ID,
        severity: 'error',
        message: `malformed whole-feature convergence record ${f}: ${msg(err)} — re-run end-govern to regenerate it.`,
      });
    }
  }

  // 2. Chunk-set artifacts (chunks + split-cluster markers): validate each, then
  //    check every split-cluster marker's sub-chunk references resolve (no dangling).
  const csDir = join(opts.repoRoot, CHUNK_SETS_REL);
  for (const f of jsonFiles(csDir)) {
    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(join(csDir, f), 'utf8'));
    } catch (err) {
      findings.push({ rule: RULE_ID, severity: 'error', message: `unparseable chunk-set artifact ${f}: ${msg(err)}` });
      continue;
    }
    if (!isRecord(raw)) {
      findings.push({ rule: RULE_ID, severity: 'error', message: `chunk-set artifact ${f} is not an object` });
      continue;
    }
    // A persisted chunk-set MUST list the chunks it governed. end-govern FATALs on an
    // empty scope BEFORE writing a record (end-govern-pipeline AUDIT-20260622-23), so a
    // missing / empty / non-array `chunks` field is corrupt — not "valid, zero chunks"
    // (TASK-437). Previously both fields silently defaulted to [] and passed doctor.
    if (!Array.isArray(raw['chunks'])) {
      findings.push({
        rule: RULE_ID,
        severity: 'error',
        message: `chunk-set artifact ${f} is missing a valid 'chunks' array — a persisted chunk-set must list the chunks it governed.`,
      });
      continue;
    }
    if (raw['chunks'].length === 0) {
      findings.push({
        rule: RULE_ID,
        severity: 'error',
        message: `chunk-set artifact ${f} has an EMPTY 'chunks' array — end-govern FATALs on a zero-chunk scope, so a persisted empty chunk-set is corrupt; re-run end-govern to regenerate it.`,
      });
      continue;
    }
    if (raw['splitClusterMarkers'] !== undefined && !Array.isArray(raw['splitClusterMarkers'])) {
      findings.push({
        rule: RULE_ID,
        severity: 'error',
        message: `chunk-set artifact ${f} has a non-array 'splitClusterMarkers' field — it must be an array of markers (or absent).`,
      });
      continue;
    }
    const rawChunks = raw['chunks'];
    const rawMarkers = Array.isArray(raw['splitClusterMarkers']) ? raw['splitClusterMarkers'] : [];
    const chunkIds = new Set<string>();
    let shapeOk = true;
    for (const c of rawChunks) {
      try {
        chunkIds.add(validateChunk(c).id);
      } catch (err) {
        shapeOk = false;
        findings.push({ rule: RULE_ID, severity: 'error', message: `malformed chunk in ${f}: ${msg(err)}` });
      }
    }
    for (const m of rawMarkers) {
      let marker;
      try {
        marker = validateSplitClusterMarker(m);
      } catch (err) {
        findings.push({ rule: RULE_ID, severity: 'error', message: `malformed split-cluster marker in ${f}: ${msg(err)}` });
        continue;
      }
      if (shapeOk === false) continue;
      for (const sc of marker.subChunkIds) {
        if (chunkIds.has(sc) === false) {
          findings.push({
            rule: RULE_ID,
            severity: 'error',
            message: `split-cluster marker (cluster ${marker.clusterId}) references non-existent chunk '${sc}' in ${f} — dangling reference; the chunk-set is inconsistent.`,
          });
        }
      }
    }
  }

  return findings;
};
