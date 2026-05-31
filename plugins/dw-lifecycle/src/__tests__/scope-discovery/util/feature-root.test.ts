/**
 * Tests for the shared `resolveFeatureRoot` helper.
 *
 * Per AUDIT-20260530-15: the gate (workplan-aware-gate.ts) and the
 * lift (audit-barrage-lift.ts) used to each carry their own copy of
 * the `docs/<v>/001-IN-PROGRESS/<slug>/` walker. Every change to one
 * had to be mirrored to the other (AUDIT-06/08/12 each patched two
 * copies in lockstep). Extracting one helper closes the split-brain
 * *class* of bug — divergence is impossible if the logic only lives
 * in one place.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveFeatureRoot } from '../../../scope-discovery/util/feature-root.js';

let workDir: string;

beforeAll(() => {
  workDir = mkdtempSync(join(tmpdir(), 'fr-'));
});

afterAll(() => {
  rmSync(workDir, { recursive: true, force: true });
});

function makeRepo(name: string, versions: ReadonlyArray<string>, slug: string): string {
  const repoRoot = join(workDir, name);
  for (const v of versions) {
    mkdirSync(join(repoRoot, 'docs', v, '001-IN-PROGRESS', slug), { recursive: true });
    writeFileSync(
      join(repoRoot, 'docs', v, '001-IN-PROGRESS', slug, 'workplan.md'),
      `# Workplan ${v}\n`,
      'utf8',
    );
  }
  return repoRoot;
}

describe('resolveFeatureRoot — shared helper (AUDIT-20260530-15)', () => {
  it('returns the resolved root + versionsChecked when the slug exists under one version', async () => {
    const repoRoot = makeRepo('single-version', ['1.0'], 'demo');
    const result = await resolveFeatureRoot({
      docsRoot: join(repoRoot, 'docs'),
      slug: 'demo',
    });
    expect(result.root).toBe(join(repoRoot, 'docs', '1.0', '001-IN-PROGRESS', 'demo'));
    expect(result.versionsChecked).toEqual(['1.0']);
  });

  it('picks the LEX-GREATEST version when the slug exists under multiple (AUDIT-08 carry-over)', async () => {
    const repoRoot = makeRepo('multi-version', ['0.x', '1.0', '0.19.0'], 'demo');
    const result = await resolveFeatureRoot({
      docsRoot: join(repoRoot, 'docs'),
      slug: 'demo',
    });
    // Lex-greatest of ['0.19.0', '0.x', '1.0'] is '1.0' (sorted desc).
    expect(result.root).toBe(join(repoRoot, 'docs', '1.0', '001-IN-PROGRESS', 'demo'));
  });

  it('returns root=undefined when the slug exists under no version', async () => {
    const repoRoot = makeRepo('no-match', ['1.0', '0.x'], 'wrong-slug');
    const result = await resolveFeatureRoot({
      docsRoot: join(repoRoot, 'docs'),
      slug: 'demo',
    });
    expect(result.root).toBeUndefined();
    // Both versions checked (only `001-IN-PROGRESS` dirs count).
    expect(result.versionsChecked.sort()).toEqual(['0.x', '1.0']);
  });

  it('returns root=undefined + empty versionsChecked when docsRoot is missing', async () => {
    const result = await resolveFeatureRoot({
      docsRoot: join(workDir, 'does-not-exist'),
      slug: 'demo',
    });
    expect(result.root).toBeUndefined();
    expect(result.versionsChecked).toEqual([]);
  });

  it('ignores version dirs that lack a `001-IN-PROGRESS` subdir', async () => {
    const repoRoot = join(workDir, 'mixed-shape');
    mkdirSync(join(repoRoot, 'docs', '0.x'), { recursive: true });
    // No 001-IN-PROGRESS under 0.x; should be skipped.
    mkdirSync(join(repoRoot, 'docs', '1.0', '001-IN-PROGRESS', 'demo'), { recursive: true });
    const result = await resolveFeatureRoot({
      docsRoot: join(repoRoot, 'docs'),
      slug: 'demo',
    });
    expect(result.root).toBe(join(repoRoot, 'docs', '1.0', '001-IN-PROGRESS', 'demo'));
    expect(result.versionsChecked).toEqual(['1.0']);
  });

  it('is deterministic across N invocations', async () => {
    const repoRoot = makeRepo('determinism', ['0.x', '1.0', '2.0', '0.5.0'], 'demo');
    const args = { docsRoot: join(repoRoot, 'docs'), slug: 'demo' };
    const r1 = await resolveFeatureRoot(args);
    const r2 = await resolveFeatureRoot(args);
    const r3 = await resolveFeatureRoot(args);
    expect(r1.root).toBe(r2.root);
    expect(r2.root).toBe(r3.root);
    // Lex-greatest of ['0.5.0', '0.x', '1.0', '2.0'] sorted desc = '2.0'.
    expect(r1.root).toBe(join(repoRoot, 'docs', '2.0', '001-IN-PROGRESS', 'demo'));
  });
});
