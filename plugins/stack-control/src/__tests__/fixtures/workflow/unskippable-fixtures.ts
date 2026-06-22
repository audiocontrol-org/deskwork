// Fixtures for the un-skippable workflow protocol (025 T002). Not a *.test.ts, so
// vitest does not collect it. Builds an installation carrying a feature with N
// `tasks.md` phases (each `## Phase <id>` header naming its files in backtick spans)
// and the phase files on disk. Reuses the 022 workflow fixture for the installation +
// roadmap + git.
//
// 030 (FR-017): per-phase checkpoints are retired. This fixture is now a pure
// multi-phase scaffold — convergence is the whole-feature record, written via
// `base.writeRecord({ mode: 'impl', ... })`.

import { join } from 'node:path';
import { makeWorkflowFixture, type FixtureNode, type WorkflowFixture } from './workflow-fixtures.js';

/** One phase of a fixture feature: its id and the files its tasks name. */
export interface FixturePhase {
  /**
   * The phase id, as it appears after `## Phase ` in the rendered tasks.md. Use a
   * digit-led id (`1`, `2`, …) so the rendered header reads as a well-formed
   * `## Phase <n>` boundary.
   */
  readonly id: string;
  /** Each file's installation-relative path + content (written to disk for scoping). */
  readonly files: readonly { readonly path: string; readonly content: string }[];
}

export interface UnskippableFixture {
  readonly base: WorkflowFixture;
  readonly root: string;
  readonly slug: string;
  readonly specDirRel: string;
  readonly tasksPath: string;
  cleanup(): void;
}

/**
 * Build a multi-phase fixture. `slug` is the feature slug; the spec dir is
 * `specs/<slug>` and its `tasks.md` carries the phases. Each phase's files are written
 * to disk so a scope can be computed.
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
  // those files in backtick spans.
  for (const phase of opts.phases) {
    for (const file of phase.files) base.write(file.path, file.content);
  }
  const tasksText = renderTasks(opts.phases, opts.tasksComplete ?? false);
  const tasksPath = base.write(join(specDirRel, 'tasks.md'), tasksText);

  return {
    base,
    root: base.root,
    slug: opts.slug,
    specDirRel,
    tasksPath,
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
