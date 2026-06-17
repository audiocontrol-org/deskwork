// 025 US1 (T007) — the composed `record-converged impl` signal is DERIVED from the
// union of current per-phase checkpoints (FR-001a); composing it assembles NO
// whole-feature payload and runs no whole-feature govern pass. RED first.

import { afterEach, describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { composeConvergedImpl } from '../../govern/compose-convergence.js';
import {
  makeUnskippableFixture,
  type UnskippableFixture,
} from '../fixtures/workflow/unskippable-fixtures.js';

let fixtures: UnskippableFixture[] = [];
function twoPhase(): UnskippableFixture {
  const f = makeUnskippableFixture({
    slug: '025-compose',
    phases: [
      { id: '1', files: [{ path: 'src/feat/a.ts', content: 'export const a = 1;\n' }] },
      { id: '2', files: [{ path: 'src/feat/b.ts', content: 'export const b = 2;\n' }] },
    ],
  });
  fixtures.push(f);
  return f;
}
afterEach(() => {
  for (const f of fixtures) f.cleanup();
  fixtures = [];
});

describe('composed convergence signal (FR-001a)', () => {
  it('is converged IFF every phase has a current checkpoint (union derivation)', () => {
    const f = twoPhase();
    expect(composeConvergedImpl(f.root, f.slug, f.tasksPath)).toBe(false);
    f.checkpointPhase('1');
    expect(composeConvergedImpl(f.root, f.slug, f.tasksPath)).toBe(false);
    f.checkpointPhase('2');
    expect(composeConvergedImpl(f.root, f.slug, f.tasksPath)).toBe(true);
  });

  it('assembles NO whole-feature payload / audit-run when composing the signal', () => {
    const f = twoPhase();
    f.checkpointPhase('1');
    f.checkpointPhase('2');
    composeConvergedImpl(f.root, f.slug, f.tasksPath);
    // A composed signal is a pure read of checkpoints — it must not trigger a
    // whole-feature govern run (the boundary-too-large path this feature removes).
    expect(existsSync(join(f.root, '.stack-control', 'audit-runs'))).toBe(false);
  });
});
