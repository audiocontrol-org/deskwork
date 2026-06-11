/**
 * Spec 013 (T005 / T009) — the spec-governance-gate consumer's
 * fail-loud path must name BOTH searched layouts when a feature
 * resolves under neither. The gate routes through the widened
 * `resolveFeatureRoot`; when it returns `undefined` the operator needs
 * to know both the `specs/<NNN>-<slug>` and the
 * `docs/<version>/001-IN-PROGRESS/<slug>` locations were searched (no
 * silent wrong-target; Constitution Principle V).
 *
 * Composes the REAL verb via the stackctl dispatcher against a tmp
 * fixture (no fs mocking, per .claude/rules/testing.md).
 */

import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCli } from './_run-helpers.js';

describe('spec-governance-gate — layout-aware fail-loud (spec 013)', () => {
  it('exits 2 naming BOTH specs/ and docs/001-IN-PROGRESS when the feature resolves under neither', () => {
    const repo = mkdtempSync(join(tmpdir(), 'gate-neither-'));
    // A repo with an unrelated specs/ dir so the specs root exists but
    // the slug matches nothing there, and no docs/ feature either.
    mkdirSync(join(repo, 'specs', '999-unrelated'), { recursive: true });
    try {
      const r = runCli([
        'spec-governance-gate',
        '--feature',
        'nonexistent-feature',
        '--repo-root',
        repo,
      ]);
      expect(r.status).toBe(2);
      // The FATAL message names BOTH layouts that were searched.
      expect(r.stderr).toMatch(/specs\//);
      expect(r.stderr).toMatch(/001-IN-PROGRESS/);
      // stdout stays a clean machine channel — no spurious decision token.
      expect(r.stdout.trim()).toBe('');
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});
