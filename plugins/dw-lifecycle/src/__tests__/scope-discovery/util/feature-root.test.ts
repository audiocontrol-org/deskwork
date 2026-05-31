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

  /**
   * AUDIT-20260531-04 regression: the lex-vs-semver divergence is
   * the specification, not a placeholder. With versions
   * ['0.9.0', '0.10.0'] the semver-greatest is `0.10.0` but the
   * lex-greatest is `0.9.0` (because `'1' < '9'` character-wise).
   * The helper picks lex-greatest. Changing the sort changes the
   * contract; both the implementation AND this test would have to
   * change in lockstep.
   */
  it('picks lex-greatest, NOT semver-greatest, when they diverge (AUDIT-20260531-04)', async () => {
    const repoRoot = makeRepo('lex-vs-semver', ['0.9.0', '0.10.0'], 'demo');
    const result = await resolveFeatureRoot({
      docsRoot: join(repoRoot, 'docs'),
      slug: 'demo',
    });
    // Lex compares char-by-char: '0' === '0', '.' === '.', '9' > '1'
    // so '0.9.0' > '0.10.0' in lex order. The walker picks lex-
    // greatest. Semver-greatest WOULD be `0.10.0`.
    expect(result.root).toBe(
      join(repoRoot, 'docs', '0.9.0', '001-IN-PROGRESS', 'demo'),
    );
  });

  /**
   * AUDIT-20260531-05 regression: the helper accepts `repoRoot` and
   * constructs `docs/` internally, so callers don't have to mirror
   * `join(repoRoot, 'docs')` independently.
   */
  it('accepts repoRoot and constructs the docs/ subpath internally (AUDIT-20260531-05)', async () => {
    const repoRoot = makeRepo('repo-root-shape', ['1.0'], 'demo');
    const result = await resolveFeatureRoot({
      repoRoot,
      slug: 'demo',
    });
    expect(result.root).toBe(
      join(repoRoot, 'docs', '1.0', '001-IN-PROGRESS', 'demo'),
    );
  });

  it('throws when neither docsRoot nor repoRoot is supplied', async () => {
    await expect(
      resolveFeatureRoot({ slug: 'demo' } as unknown as Parameters<typeof resolveFeatureRoot>[0]),
    ).rejects.toThrow(/docsRoot.*repoRoot/);
  });

  /**
   * AUDIT-20260531-10 regression: AUDIT-06 was a doc-prose fix
   * (remove forbidden-deferral phrases from the helper's docblock)
   * with no automated guard against the phrases creeping back. This
   * test reads the SOURCE file verbatim and asserts none of the
   * project's canonical forbidden-deferral phrases appear. Scope is
   * intentionally limited to the source — the test file itself
   * stores the phrase list as DATA (this `forbiddenPhrases` array
   * below), which would self-trigger if scanned.
   *
   * The phrase list is a subset of FORBIDDEN_DEFERRAL_PHRASES
   * (defined in dispatch-wrapper). Stored here as data to keep this
   * test self-contained; if the canonical list grows, this test can
   * be migrated to import it directly.
   */
  it('feature-root source file contains NO forbidden-deferral phrases (AUDIT-20260531-10)', () => {
    const sourcePath = join(
      __dirname,
      '..',
      '..',
      '..',
      'scope-discovery',
      'util',
      'feature-root.ts',
    );
    const sourceText = readFileSync(sourcePath, 'utf8');
    // Phrases assembled via concat so the test file's data array
    // doesn't trigger an accidental self-scan if a future change
    // widens the scope to include test files.
    const forbiddenPhrases = [
      'for ' + 'now',
      'will fix ' + 'later',
      'until.*lands',
      'until.*ships',
      'deferred to v',
      'follow-up if ' + 'needed',
      'follow-up ' + 'later',
      'come back ' + 'to',
      'address in a ' + 'follow-up',
      'TO' + 'DO',
    ];
    for (const phrase of forbiddenPhrases) {
      const re = new RegExp(phrase, 'i');
      expect(sourceText, `forbidden phrase "${phrase}" in feature-root.ts`).not.toMatch(re);
    }
  });
});
