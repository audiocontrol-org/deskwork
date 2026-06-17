// Per-phase checkpoint status resolution (extracted from govern.ts, 025 US1 T008/T009).
//
// The single home of "is each tasks.md phase's checkpoint current?" — used by BOTH
// `govern` (which writes the checkpoints and composes the whole-feature payload) AND
// the US1 per-phase graduate gate / composed-convergence reader (which only reads
// them). Extracted so the two callers share ONE currency definition rather than
// cloning it (project anti-clone discipline); behaviour is unchanged from the prior
// private govern.ts copy. The `phase-<id>` section key derives from the shared
// `phaseCheckpointSection` helper so a format change can never drift writer vs reader.

import { existsSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { deriveDistinctGitToplevel } from '../scope-discovery/util/git-toplevel.js';
import { parsePhases } from './incremental-audit.js';
import {
  computeScopeFingerprint,
  isCheckpointFresh,
  phaseCheckpointSection,
  readPhaseCheckpoint,
} from './checkpoint-state.js';

export interface PhaseCheckpointStatus {
  readonly phaseId: string;
  /** The tasks.md-declared scope (may name directories) — used for freshness. */
  readonly files: readonly string[];
  /** The files the recorded checkpoint actually audited (TASK-129); undefined
   * when no record exists or a pre-TASK-129 checkpoint omitted them. */
  readonly auditedFiles: readonly string[] | undefined;
  readonly scopeFingerprint: string;
  readonly state: 'current' | 'missing' | 'stale';
}

export function normalizeGovernedPaths(
  installationRoot: string,
  paths: readonly string[],
): readonly string[] {
  const top = deriveDistinctGitToplevel(installationRoot);
  const installationRel =
    top !== null ? relative(top, installationRoot).split('\\').join('/') : null;
  return Array.from(
    new Set(
      paths.map((path) => {
        const normalized = path.split('\\').join('/');
        if (existsSync(join(installationRoot, normalized))) {
          return normalized;
        }
        if (
          installationRel !== null &&
          installationRel.length > 0 &&
          (normalized === installationRel || normalized.startsWith(`${installationRel}/`))
        ) {
          return normalized.slice(installationRel.length + 1);
        }
        return normalized;
      }),
    ),
  );
}

export function resolvePhaseCheckpointStatuses(
  installationRoot: string,
  slug: string,
  tasksPath: string,
): readonly PhaseCheckpointStatus[] {
  return parsePhases(readFileSync(tasksPath, 'utf8')).map((phase) => {
    const governedPaths = normalizeGovernedPaths(installationRoot, phase.files);
    if (governedPaths.length === 0) {
      throw new Error(
        `phase '${phase.phaseId}' in ${tasksPath} has no governed file list; ` +
          'a phase checkpoint cannot be scoped to an empty path set ' +
          "(add the phase's authoritative files to tasks.md)",
      );
    }
    const scopeFingerprint = computeScopeFingerprint(installationRoot, governedPaths);
    const section = phaseCheckpointSection(phase.phaseId);
    const record = readPhaseCheckpoint(installationRoot, slug, phase.phaseId);
    if (record === null) {
      return {
        phaseId: phase.phaseId,
        files: governedPaths,
        auditedFiles: undefined,
        scopeFingerprint,
        state: 'missing',
      };
    }
    return {
      phaseId: phase.phaseId,
      files: governedPaths,
      auditedFiles: record.auditedFiles,
      scopeFingerprint,
      state: isCheckpointFresh(record, {
        version: 1,
        checkpoint: section,
        auditLogSection: section,
        scopeFingerprint,
      })
        ? 'current'
        : 'stale',
    };
  });
}
