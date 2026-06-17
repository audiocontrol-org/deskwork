// Fixtures for the un-skippable workflow protocol (025 T002). Not a *.test.ts, so
// vitest does not collect it. Builds an installation carrying a feature with N
// `tasks.md` phases (each `## Phase <id>` header naming its files in backtick
// spans), the phase files on disk, and writable per-phase checkpoints keyed
// IDENTICALLY to what `govern --phase` writes (021 checkpoint shape: checkpoint /
// auditLogSection = `phase-<id>`, scope fingerprint over the phase's governed
// paths). Reuses the 022 workflow fixture for the installation + roadmap + git.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  computeScopeFingerprint,
  phaseCheckpointSection,
  writePhaseCheckpoint,
} from '../../../govern/checkpoint-state.js';
import { parsePhases } from '../../../govern/incremental-audit.js';
import { makeWorkflowFixture, type FixtureNode, type WorkflowFixture } from './workflow-fixtures.js';

/** One phase of a fixture feature: its id and the files its tasks name. */
export interface FixturePhase {
  /**
   * The phase id, as it appears after `## Phase ` in the rendered tasks.md. MUST be
   * digit-led (`PHASE_HEADER_RE` in incremental-audit.ts selects only `[0-9][0-9A-Za-z.]*`)
   * — a non-digit-led id renders a header the parser silently ignores, so the phase would
   * vanish from enumeration (AUDIT-BARRAGE claude-01).
   */
  readonly id: string;
  /**
   * Each file's installation-relative path MUST contain a `/` and no `:` — the
   * `extractScopedPaths` grammar drops any other token, which would silently under-scope
   * the checkpoint fingerprint. `governedPathsFor` asserts written-vs-parsed equality so a
   * dropped path fails loud at construction rather than as a false-green staleness test.
   */
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
  /** Render the tasks.md checkboxes as checked (so the item derives at `governing`). */
  readonly tasksComplete?: boolean;
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
  const tasksText = renderTasks(opts.phases, opts.tasksComplete ?? false);
  const tasksPath = base.write(join(specDirRel, 'tasks.md'), tasksText);

  const writtenPathsFor = (phaseId: string): readonly string[] => {
    const phase = opts.phases.find((p) => p.id === phaseId);
    if (phase === undefined) throw new Error(`makeUnskippableFixture: no phase '${phaseId}'`);
    return phase.files.map((f) => f.path);
  };
  const allWrittenPaths = new Set(opts.phases.flatMap((p) => p.files.map((f) => f.path)));

  const governedPathsFor = (phaseId: string): readonly string[] => {
    const parsed = parsePhases(tasksText).find((p) => p.phaseId === phaseId);
    if (parsed === undefined) {
      throw new Error(`makeUnskippableFixture: phase '${phaseId}' not in fixture tasks.md`);
    }
    if (parsed.files.length === 0) {
      throw new Error(`makeUnskippableFixture: phase '${phaseId}' has no governed files`);
    }
    // claude-01: assert the parser saw EXACTLY the files we wrote. If extractScopedPaths
    // silently dropped a path (no `/`, leading `/`, or a `:`), the fingerprint would cover
    // a subset and a staleness test on the dropped file would falsely pass — fail loud here.
    const written = [...writtenPathsFor(phaseId)].sort();
    const seen = [...parsed.files].sort();
    if (written.length !== seen.length || written.some((p, i) => p !== seen[i])) {
      throw new Error(
        `makeUnskippableFixture: phase '${phaseId}' path-grammar drop — wrote [${written.join(', ')}] ` +
          `but tasks.md parsed [${seen.join(', ')}]; every fixture file path must contain '/' and no ':'`,
      );
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
        // claude-02: derive the section key from the shared helper so the fixture cannot
        // drift from govern's live write path (which keys freshness on the same value).
        checkpoint: phaseCheckpointSection(phaseId),
        auditLogSection: phaseCheckpointSection(phaseId),
        scopeFingerprint,
        passedAt,
        governedPaths,
      });
    },
    editPhaseFile: (path, content) => {
      // claude-04: a no-op edit (identical content) leaves the SHA-256 fingerprint unchanged,
      // so the "goes stale" promise would silently not hold; and editing a non-phase path
      // checkpoints nothing. Make both misuses loud.
      if (!allWrittenPaths.has(path)) {
        throw new Error(
          `makeUnskippableFixture.editPhaseFile: '${path}' is not a known phase file ` +
            `(known: ${[...allWrittenPaths].join(', ')})`,
        );
      }
      if (readFileSync(join(base.root, path), 'utf8') === content) {
        throw new Error(
          `makeUnskippableFixture.editPhaseFile: content for '${path}' is identical — ` +
            'an identical write does not change the fingerprint, so the checkpoint would NOT go stale',
        );
      }
      base.write(path, content);
    },
    cleanup: base.cleanup,
  };
}

/** Render a tasks.md with one `## Phase <id>` section per phase, files in backticks. */
function renderTasks(phases: readonly FixturePhase[], complete: boolean): string {
  const box = complete ? 'X' : ' ';
  const lines = ['# Tasks', ''];
  for (const phase of phases) {
    lines.push(`## Phase ${phase.id}: fixture phase ${phase.id}`, '');
    for (const file of phase.files) {
      lines.push(`- [${box}] T-${phase.id} touch \`${file.path}\``);
    }
    lines.push('');
  }
  return lines.join('\n');
}
