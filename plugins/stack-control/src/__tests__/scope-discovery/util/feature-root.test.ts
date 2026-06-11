/**
 * Tests for the shared `resolveFeatureRoot` helper.
 *
 * Two layers:
 *
 *  1. The backward-compatibility wall (ported from the dw-lifecycle
 *     suite, AUDIT-20260530-15 / -08 / -05 / -10) — the legacy
 *     `docs/<v>/001-IN-PROGRESS/<slug>/` walker, including the
 *     lex-greatest-NOT-semver contract. These MUST stay green when the
 *     speckit branch is added (spec 013 FR-004 / SC-002).
 *
 *  2. Spec 013 — the layout-aware widening: `resolveFeatureRoot` also
 *     resolves a `specs/NNN-slug/` feature, with deterministic
 *     specs-first precedence and fail-loud on numeric-prefix ambiguity.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
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

function makeSpecRepo(name: string, specDirs: ReadonlyArray<string>): string {
  const repoRoot = join(workDir, name);
  for (const d of specDirs) {
    mkdirSync(join(repoRoot, 'specs', d), { recursive: true });
    writeFileSync(join(repoRoot, 'specs', d, 'spec.md'), `# ${d}\n`, 'utf8');
  }
  return repoRoot;
}

describe('resolveFeatureRoot — legacy-docs backward-compat wall (AUDIT-20260530-15)', () => {
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
    expect(result.root).toBe(join(repoRoot, 'docs', '1.0', '001-IN-PROGRESS', 'demo'));
  });

  it('returns root=undefined when the slug exists under no version', async () => {
    const repoRoot = makeRepo('no-match', ['1.0', '0.x'], 'wrong-slug');
    const result = await resolveFeatureRoot({
      docsRoot: join(repoRoot, 'docs'),
      slug: 'demo',
    });
    expect(result.root).toBeUndefined();
    expect(result.versionsChecked.slice().sort()).toEqual(['0.x', '1.0']);
  });

  it('returns root=undefined + empty versionsChecked when docsRoot is missing', async () => {
    const result = await resolveFeatureRoot({
      docsRoot: join(workDir, 'does-not-exist'),
      slug: 'demo',
    });
    expect(result.root).toBeUndefined();
    expect(result.versionsChecked).toEqual([]);
  });

  /**
   * AUDIT-20260531-04 regression — the lex-vs-semver divergence is the
   * specification, not a placeholder. This is the FR-004 / SC-002
   * backward-compatibility wall: the speckit widening must not touch it.
   */
  it('picks lex-greatest, NOT semver-greatest, when they diverge (AUDIT-20260531-04)', async () => {
    const repoRoot = makeRepo('lex-vs-semver', ['0.9.0', '0.10.0'], 'demo');
    const result = await resolveFeatureRoot({
      docsRoot: join(repoRoot, 'docs'),
      slug: 'demo',
    });
    expect(result.root).toBe(
      join(repoRoot, 'docs', '0.9.0', '001-IN-PROGRESS', 'demo'),
    );
  });

  it('reports layout="legacy-docs" on a docs-layout resolution', async () => {
    const repoRoot = makeRepo('legacy-layout-tag', ['1.0'], 'demo');
    const result = await resolveFeatureRoot({ repoRoot, slug: 'demo' });
    expect(result.root).toBe(join(repoRoot, 'docs', '1.0', '001-IN-PROGRESS', 'demo'));
    expect(result.layout).toBe('legacy-docs');
  });

  it('throws when neither docsRoot nor repoRoot is supplied', async () => {
    await expect(
      resolveFeatureRoot({ slug: 'demo' } as unknown as Parameters<typeof resolveFeatureRoot>[0]),
    ).rejects.toThrow(/docsRoot.*repoRoot/);
  });
});

describe('resolveFeatureRoot — layout-aware speckit resolution (spec 013)', () => {
  it('resolves a specs/NNN-<slug> feature and tags layout="speckit" (T003)', async () => {
    const repoRoot = makeSpecRepo('speckit-numeric', ['013-audit-protocol-hardening']);
    const result = await resolveFeatureRoot({ repoRoot, slug: 'audit-protocol-hardening' });
    expect(result.root).toBe(join(repoRoot, 'specs', '013-audit-protocol-hardening'));
    expect(result.layout).toBe('speckit');
  });

  it('resolves a specs/<slug> feature with no numeric prefix (T003 exact-name)', async () => {
    const repoRoot = makeSpecRepo('speckit-exact', ['audit-protocol-hardening']);
    const result = await resolveFeatureRoot({ repoRoot, slug: 'audit-protocol-hardening' });
    expect(result.root).toBe(join(repoRoot, 'specs', 'audit-protocol-hardening'));
    expect(result.layout).toBe('speckit');
  });

  it('prefers the speckit root when the slug exists under BOTH layouts, deterministically (T004 precedence)', async () => {
    // Build a repo with BOTH a specs/NNN-demo and a docs/1.0/.../demo.
    const repoRoot = makeRepo('both-layouts', ['1.0'], 'demo');
    mkdirSync(join(repoRoot, 'specs', '007-demo'), { recursive: true });
    writeFileSync(join(repoRoot, 'specs', '007-demo', 'spec.md'), '# demo\n', 'utf8');
    const r1 = await resolveFeatureRoot({ repoRoot, slug: 'demo' });
    const r2 = await resolveFeatureRoot({ repoRoot, slug: 'demo' });
    expect(r1.root).toBe(join(repoRoot, 'specs', '007-demo'));
    expect(r1.layout).toBe('speckit');
    expect(r2.root).toBe(r1.root); // deterministic, not iteration-order
  });

  it('fails loud naming the candidates when two specs dirs match ^\\d+-<slug>$ (T004 ambiguity)', async () => {
    const repoRoot = makeSpecRepo('speckit-ambiguous', ['007-demo', '013-demo']);
    await expect(
      resolveFeatureRoot({ repoRoot, slug: 'demo' }),
    ).rejects.toThrow(/007-demo[\s\S]*013-demo|013-demo[\s\S]*007-demo/);
  });

  it('returns root=undefined when the slug exists under neither layout (T004 neither)', async () => {
    const repoRoot = makeSpecRepo('speckit-none', ['999-other']);
    const result = await resolveFeatureRoot({ repoRoot, slug: 'demo' });
    expect(result.root).toBeUndefined();
  });
});
