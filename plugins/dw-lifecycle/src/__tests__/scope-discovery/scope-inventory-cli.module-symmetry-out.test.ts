/**
 * plugins/dw-lifecycle/src/__tests__/scope-discovery/scope-inventory-cli.module-symmetry-out.test.ts
 *
 * AUDIT-20260604-08 regression: Phase 25 Task 5's verb rename
 * (check-editor-symmetry → check-module-symmetry) advanced the
 * scope-inventory.ts COMMENT to the new term while the surviving CLI
 * flag `--editor-symmetry-out` + option field `editorSymmetryOut` + the
 * `writeEditorSymmetryArtifact` function kept the retired "editor"
 * term. The fix renames the surfaces with the same alias-for-one-cycle
 * pattern as the verb (operator muscle memory).
 *
 * This test exercises the CLI parser surface specifically:
 *
 *   - `--module-symmetry-out` (canonical) parses into the renamed
 *     `moduleSymmetryOut` option field.
 *   - `--editor-symmetry-out` (deprecated alias) STILL parses (back-
 *     compat for adopter muscle memory) into the same field.
 *
 * The internal `writeEditorSymmetryArtifact` → `writeModuleSymmetryArtifact`
 * function rename + `PHASE4_GATE_FILES.editorSymmetryArtifact` →
 * `moduleSymmetryArtifact` rename are exercised through the existing
 * scope-inventory integration tests (they call into the orchestrator
 * which threads the field through to the renamed call site); this
 * file pins the parser-level contract.
 */

import { describe, it, expect } from 'vitest';
import { parseCli } from '../../scope-discovery/scope-inventory-cli.js';

const REQUIRED_ARGS = ['--slug', 'demo-feature', '--repo-root', '/tmp/x'];

describe('scope-inventory parseCli — --module-symmetry-out (AUDIT-20260604-08)', () => {
  it('AUDIT-08 bug-repro: --module-symmetry-out is the canonical flag and populates moduleSymmetryOut', () => {
    const opts = parseCli([
      ...REQUIRED_ARGS,
      '--module-symmetry-out',
      '/tmp/x/out.md',
    ]);
    expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (opts as unknown as { readonly moduleSymmetryOut: string | null }).moduleSymmetryOut,
      'the canonical option field is moduleSymmetryOut',
    ).toBe('/tmp/x/out.md');
  });

  it('--editor-symmetry-out is preserved as a deprecated alias (adopter muscle memory)', () => {
    const opts = parseCli([
      ...REQUIRED_ARGS,
      '--editor-symmetry-out',
      '/tmp/x/legacy.md',
    ]);
    expect(
      (opts as unknown as { readonly moduleSymmetryOut: string | null }).moduleSymmetryOut,
      'the legacy alias still routes into the renamed canonical field',
    ).toBe('/tmp/x/legacy.md');
  });

  it('regression-lock: no --editor-symmetry-out usage is silently dropped', () => {
    // The alias-symmetry contract: same value, same downstream field.
    const canonical = parseCli([
      ...REQUIRED_ARGS,
      '--module-symmetry-out',
      '/tmp/x/o.md',
    ]);
    const alias = parseCli([
      ...REQUIRED_ARGS,
      '--editor-symmetry-out',
      '/tmp/x/o.md',
    ]);
    type WithModuleSymmetryOut = { readonly moduleSymmetryOut: string | null };
    expect((canonical as unknown as WithModuleSymmetryOut).moduleSymmetryOut).toBe(
      (alias as unknown as WithModuleSymmetryOut).moduleSymmetryOut,
    );
  });
});
