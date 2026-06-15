// specs/021-audit-protocol-friction-burndown — T025/T026 (US4), backlog TASK-47.
//
// Rename-aware payload scoping: a tree-move (file relocation) within the audited
// scope must be PAIRED as a rename in the committed-diff arm, not emitted as a
// full delete + full add. Without rename detection (`-M`) an endpoint diff across
// a relocation ships the entire file content twice, bloating the payload past the
// model context window — the exact failure TASK-47 names.

import { describe, expect, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { assembleImplementPayload } from '../../govern/payload-implement.js';
import { gitIn, makeNestedFixture } from '../_isolation-harness.js';

describe('US4 — rename-aware payload scoping (T025/T026 / TASK-47)', () => {
  it('pairs an in-scope tree-move as a rename instead of delete + add', () => {
    const fixture = makeNestedFixture();
    try {
      // A substantial, uniquely-marked source file at the original path.
      const body =
        Array.from({ length: 40 }, (_, i) => `export const RENAME_MARKER_${i} = ${i} * 7;`).join('\n') +
        '\n';
      fixture.writeInstallation('src/original.ts', body);
      gitIn(fixture.outerRoot, ['add', '.']);
      gitIn(fixture.outerRoot, ['commit', '-q', '-m', 'add original']);

      // Relocate it (a pure tree-move — 100% content similarity).
      gitIn(fixture.installationRoot, ['mv', 'src/original.ts', 'src/relocated.ts']);
      gitIn(fixture.outerRoot, ['add', '.']);
      gitIn(fixture.outerRoot, ['commit', '-q', '-m', 'relocate original -> relocated']);

      // Simulate an operator who has disabled git's default rename detection.
      // The payload must NOT depend on `diff.renames` — it forces `-M` itself, so
      // a tree-move pairs (small payload) regardless of the operator's git config.
      gitIn(fixture.outerRoot, ['config', 'diff.renames', 'false']);

      const payload = assembleImplementPayload({
        installationRoot: fixture.installationRoot,
        base: 'HEAD~1',
      });

      // GREEN (with -M): the move is paired as a rename — the diff carries the
      // rename headers and NOT the file body twice.
      expect(payload.diff).toContain('rename from src/original.ts');
      expect(payload.diff).toContain('rename to src/relocated.ts');

      // The unique marker content must NOT appear as added lines — a paired
      // rename of unchanged content ships zero body hunks. (Without -M the same
      // content would appear as both a `-` deletion and a `+` addition: doubled.)
      expect(payload.diff).not.toMatch(/^\+export const RENAME_MARKER_/m);
      expect(payload.diff).not.toMatch(/^-export const RENAME_MARKER_/m);
    } finally {
      fixture.cleanup();
    }
  });
});
