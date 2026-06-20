// 011 T009 — infer the Spec Kit authoring-chain position from the tool's OWN
// pointer (.specify/feature.json) + the artifact set present in the feature dir
// (research D4 / FR-003 / FR-005). Pure function over the repo root: read the
// pointer, inspect which artifacts exist, map the present-set to the next
// /speckit-* step. No active feature (missing pointer, or it points nowhere) →
// null, surfaced as "no active spec" (not an error). Reads the authoring tool's
// pointer rather than inventing a parallel "active feature" notion (Principle VIII).

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export type SpecKitArtifact =
  | 'spec'
  | 'plan'
  | 'research'
  | 'data-model'
  | 'contracts'
  | 'checklists'
  | 'tasks';

export type SpecKitStep =
  | 'clarify'
  | 'plan'
  | 'checklist'
  | 'tasks'
  | 'analyze'
  | 'implement'
  | 'complete';

export interface ChainPosition {
  readonly featureDir: string;
  readonly artifactsPresent: readonly SpecKitArtifact[];
  readonly nextStep: SpecKitStep;
}

/** Each artifact → the relative path (file or dir) that evidences it. */
const ARTIFACT_PATHS: ReadonlyArray<readonly [SpecKitArtifact, string]> = [
  ['spec', 'spec.md'],
  ['plan', 'plan.md'],
  ['research', 'research.md'],
  ['data-model', 'data-model.md'],
  ['contracts', 'contracts'],
  ['checklists', 'checklists'],
  ['tasks', 'tasks.md'],
];

/** Read `.specify/feature.json`'s `feature_directory`, or null if absent/unreadable. */
function readFeatureDir(repoRoot: string): string | null {
  const pointer = join(repoRoot, '.specify', 'feature.json');
  if (!existsSync(pointer)) return null;
  try {
    const parsed: unknown = JSON.parse(readFileSync(pointer, 'utf8'));
    if (typeof parsed === 'object' && parsed !== null) {
      const dir = (parsed as Record<string, unknown>)['feature_directory'];
      if (typeof dir === 'string' && dir.length > 0) return dir;
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * The next /speckit-* step from the present-artifact set (research D4). tasks
 * present ⇒ analyze (then implement; the artifact set can't distinguish the two,
 * since analyze leaves no on-disk trace). The optional `checklist` step is a side
 * artifact, not a gate between plan and tasks (plan-no-tasks → tasks).
 */
function nextStep(present: ReadonlySet<SpecKitArtifact>): SpecKitStep {
  if (present.has('tasks')) return 'analyze';
  if (present.has('plan')) return 'tasks';
  if (present.has('spec')) return 'plan';
  // feature.json points at a dir with no spec.md — a feature.json implies
  // specify already ran, so this is a degenerate/recovery state.
  return 'clarify';
}

/**
 * Whether a tasks.md is fully implemented: it has at least one task checkbox AND
 * none remain unchecked (`- [ ]`). A tasks.md with zero checkboxes is degenerate
 * (not "complete"); a single unchecked box means work remains (TASK-130).
 */
function isFullyImplemented(tasksAbs: string): boolean {
  if (!existsSync(tasksAbs)) return false;
  const body = readFileSync(tasksAbs, 'utf8');
  const checkboxes = body.match(/^\s*-\s*\[[ xX]\]/gm);
  if (checkboxes === null || checkboxes.length === 0) return false;
  return !/^\s*-\s*\[ \]/m.test(body);
}

export function inferChainPosition(repoRoot: string): ChainPosition | null {
  const featureDir = readFeatureDir(repoRoot);
  if (featureDir === null) return null;

  const featureAbs = join(repoRoot, featureDir);
  if (!existsSync(featureAbs)) return null;

  const present = new Set<SpecKitArtifact>();
  for (const [artifact, rel] of ARTIFACT_PATHS) {
    if (existsSync(join(featureAbs, rel))) present.add(artifact);
  }

  // A fully-implemented spec is NOT "active work" — reporting it as active with a
  // next /speckit-* step is the TASK-130 bug. Treat it as no-active-spec (FR-006).
  if (present.has('tasks') && isFullyImplemented(join(featureAbs, 'tasks.md'))) {
    return null;
  }

  return {
    featureDir,
    artifactsPresent: [...present],
    nextStep: nextStep(present),
  };
}
