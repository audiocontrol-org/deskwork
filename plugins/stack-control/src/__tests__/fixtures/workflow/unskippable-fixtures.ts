// Fixtures for the un-skippable workflow protocol (025 T002). Not a *.test.ts, so
// vitest does not collect it. Builds an installation carrying a feature with N
// `tasks.md` phases (each `## Phase <id>` header naming its files in backtick
// spans), the phase files on disk, and writable per-phase checkpoints keyed
// IDENTICALLY to what `govern --phase` writes (021 checkpoint shape: checkpoint /
// auditLogSection = `phase-<id>`, scope fingerprint over the phase's governed
// paths). Reuses the 022 workflow fixture for the installation + roadmap + git.

import { join } from 'node:path';
import { computeScopeFingerprint, writePhaseCheckpoint } from '../../../govern/checkpoint-state.js';
import { parsePhases } from '../../../govern/incremental-audit.js';
import { makeWorkflowFixture, type FixtureNode, type WorkflowFixture } from './workflow-fixtures.js';

/** One phase of a fixture feature: its id and the files its tasks name. */
export interface FixturePhase {
  readonly id: string;
  /** Installation-relative paths (must contain `/`, no `:`), each a real file. */
  readonly files: readonly { readonly path: string; readonly content: string }[];
}

export interface UnskippableFixture {
  readonly base: WorkflowFixture;
  readonly root: string;
  readonly slug: string;
  readonly specDirRel: string;
  readonly tasksPath: string;
  /** Write a current checkpoint for one phase (matches govern's currency keys). */
  checkpointPhase(phaseId: string, passedAt?: string): string;
  /** Overwrite a phase file's content → its checkpoint fingerprint goes stale. */
  editPhaseFile(path: string, content: string): void;
  cleanup(): void;
}

/**
 * Build a multi-phase fixture. `slug` is the feature slug the checkpoints key on;
 * the spec dir is `specs/<slug>` and its `tasks.md` carries the phases. Each
 * phase's files are written to disk so the scope fingerprint is computable.
 */
export function makeUnskippableFixture(opts: {
  readonly slug: string;
  readonly phases: readonly FixturePhase[];
  readonly node?: FixtureNode;
  readonly git?: boolean;
}): UnskippableFixture {
  const base = makeWorkflowFixture(opts.node !== undefined ? [opts.node] : [], {
    git: opts.git ?? false,
  });
  const specDirRel = join('specs', opts.slug);

  // Write each phase's files, then a tasks.md whose `## Phase <id>` bodies name
  // those files in backtick spans (the grammar parsePhases / extractScopedPaths read).
  for (const phase of opts.phases) {
    for (const file of phase.files) base.write(file.path, file.content);
  }
  const tasksText = renderTasks(opts.phases);
  const tasksPath = base.write(join(specDirRel, 'tasks.md'), tasksText);

  const governedPathsFor = (phaseId: string): readonly string[] => {
    const parsed = parsePhases(tasksText).find((p) => p.phaseId === phaseId);
    if (parsed === undefined) {
      throw new Error(`makeUnskippableFixture: phase '${phaseId}' not in fixture tasks.md`);
    }
    if (parsed.files.length === 0) {
      throw new Error(`makeUnskippableFixture: phase '${phaseId}' has no governed files`);
    }
    return parsed.files;
  };

  return {
    base,
    root: base.root,
    slug: opts.slug,
    specDirRel,
    tasksPath,
    checkpointPhase: (phaseId, passedAt = '2026-06-16T00:00:00.000Z') => {
      const governedPaths = governedPathsFor(phaseId);
      const scopeFingerprint = computeScopeFingerprint(base.root, governedPaths);
      return writePhaseCheckpoint(base.root, {
        version: 1,
        featureSlug: opts.slug,
        phaseId,
        checkpoint: `phase-${phaseId}`,
        auditLogSection: `phase-${phaseId}`,
        scopeFingerprint,
        passedAt,
        governedPaths,
      });
    },
    editPhaseFile: (path, content) => base.write(path, content),
    cleanup: base.cleanup,
  };
}

/** Render a tasks.md with one `## Phase <id>` section per phase, files in backticks. */
function renderTasks(phases: readonly FixturePhase[]): string {
  const lines = ['# Tasks', ''];
  for (const phase of phases) {
    lines.push(`## Phase ${phase.id}: fixture phase ${phase.id}`, '');
    for (const file of phase.files) {
      lines.push(`- [ ] T-${phase.id} touch \`${file.path}\``);
    }
    lines.push('');
  }
  return lines.join('\n');
}
