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
import { basename, join, relative } from 'node:path';
import { deriveDistinctGitToplevel } from '../scope-discovery/util/git-toplevel.js';
import { enumeratePhases } from '../workflow/phase-enumeration.js';
import {
  computeScopeFingerprint,
  isCheckpointFresh,
  phaseCheckpointSection,
  readPhaseCheckpoint,
} from './checkpoint-state.js';

/**
 * The CANONICAL per-phase checkpoint namespace key for a feature (025 AUDIT codex-01 /
 * claude-02, HIGH): the basename of the feature's spec/root directory. BOTH the writer
 * (`govern`, keyed off the resolved feature ROOT) and the reader (the US1 graduate gate,
 * keyed off the spec dir) MUST derive the key through THIS one function — so a govern run
 * and the gate can never address different `.stack-control/govern/phase-checkpoints/<key>/`
 * directories (which would make a fully-governed feature un-graduatable and loop). The key
 * is spec-anchored and branch-independent — NOT `resolveFeatureSlug` (which may return a
 * branch/explicit slug that differs from the spec dir name).
 */
export function featureCheckpointKey(featureDir: string): string {
  return basename(featureDir.replace(/[/\\]+$/, ''));
}

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
  // Single enumeration substrate (AUDIT claude-01/claude-03): enumeratePhases polices the
  // FR-004 empty-file-list FATAL for ALL callers (no clone); allowZeroPhases keeps a
  // non-phased tasks.md a soft [] here so the gate reports a named unmet, not a crash.
  return enumeratePhases(readFileSync(tasksPath, 'utf8'), { allowZeroPhases: true }).map((phase) => {
    const governedPaths = normalizeGovernedPaths(installationRoot, phase.files);
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
