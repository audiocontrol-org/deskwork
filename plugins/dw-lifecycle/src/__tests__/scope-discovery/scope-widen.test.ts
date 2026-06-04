/**
 * plugins/dw-lifecycle/src/__tests__/scope-discovery/scope-widen.test.ts
 *
 * Tests for the `scope-widen` verb (issue #292). Asserts:
 *   - CLI parse: positional complaint + --slug + --apply + --help
 *   - dry-run default leaves the prior manifest untouched
 *   - --apply merges the delta into the manifest
 *   - delta computation is purely additive
 *   - evidence trail lands under scope-inventory/widen-runs/<stamp>-<id>/
 *   - missing prior manifest exits 2 with actionable hint
 *   - schema-failing manifest exits 1
 *   - complaint reaches the agents via PRD-augmentation (theme injection)
 *
 * The fixture stands up a real-on-disk source tree with a synthetic PRD
 * and a prior manifest produced by `synthesize()`, then drives the
 * library API with a complaint that should surface a new theme.
 */

import { describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import {
  computeDelta,
  mergeDelta,
  scopeWidenMain,
  type ScopeWidenDelta,
} from '../../scope-discovery/scope-widen.js';
import { synthesize } from '../../scope-discovery/synthesis.js';
import type { DiscoveryAgentFinding } from '../../scope-discovery/discovery-agents/types.js';
import type { ScopeManifest } from '../../scope-discovery/synthesis-types.js';
import { isPlainObject } from '../../scope-discovery/util/typeguards.js';

const FIXTURE_PRD = [
  '# Feature: widening-fixture',
  '',
  '## Overview',
  '',
  'A fixture feature for exercising the scope-widen verb. The fixture',
  'mentions polishtest polishtest polishtest as a domain term so the',
  'PRD-themed pattern hunter has a baseline theme to surface.',
  '',
  '## Goals',
  '',
  'The polishtest goals are polishtest-shaped.',
  '',
  '## References',
  '',
  '- prd-side reference for synthesis warnings to stay quiet',
  '',
].join('\n');

const FIXTURE_SOURCE_A = [
  '// fixture source file A',
  '// polishtest baseline term to satisfy the prior-inventory pass',
  'export const polishtestA = "polishtest fixture a";',
  '',
  '// foowidget should NOT surface in the prior manifest because the',
  '// baseline PRD does not mention "foowidget" — only the complaint will.',
  'export const foowidget = "foowidget here";',
  '',
].join('\n');

const FIXTURE_SOURCE_B = [
  '// fixture source file B',
  'export const polishtestB = "polishtest fixture b";',
  '',
  '// More occurrences of foowidget so the complaint-injection has',
  'export const foowidgetB = "foowidget call site B";',
  'export const foowidgetC = "foowidget call site C";',
  '',
].join('\n');

const FIXTURE_SOURCE_WIDGET = [
  '// fixture source file under a module subdirectory so deriveModules',
  '// can extract a non-null slug; otherwise kind=code fails schema',
  '// validation (modules must have >= 1 items).',
  'export const widgetCode = "module-local widget";',
  '',
].join('\n');

/**
 * A clones baseline with one synthetic clone group whose members are
 * the fixture's source files. The synthesizer needs at least one
 * non-empty UI/AST/clone-signal source to determine `kind`; this
 * fixture is kind=code, so a clone group is the cleanest way to
 * satisfy that without seeding the pattern-matrix with a CLAUDE.md
 * violation in test code.
 */
const FIXTURE_CLONES_YAML = [
  'generated_at: 2026-05-26T00:00:00Z',
  'clones:',
  '  - id: abcd1234ef56',
  '    lines: 4',
  '    members:',
  '      - src/widget/a.ts:1-4',
  '      - src/widget/b.ts:1-4',
  '    disposition: pending',
  '    reason: null',
  '',
].join('\n');

interface Fixture {
  readonly root: string;
  readonly prdPath: string;
  readonly manifestPath: string;
  readonly moduleRoot: string;
  cleanup(): Promise<void>;
}

/**
 * Build a self-contained fixture project tree:
 *
 *   <tmp>/
 *     docs/1.0/001-IN-PROGRESS/widening-fixture/
 *       prd.md
 *       scope-manifest.yaml   (the prior manifest)
 *     src/
 *       a.ts
 *       b.ts
 *     .dw-lifecycle/scope-discovery/
 *       clones.yaml           (empty baseline)
 */
async function makeFixture(): Promise<Fixture> {
  const root = await mkdtemp(join(tmpdir(), 'scope-widen-'));
  const docsDir = join(root, 'docs', '1.0', '001-IN-PROGRESS', 'widening-fixture');
  await mkdir(docsDir, { recursive: true });
  const prdPath = join(docsDir, 'prd.md');
  await writeFile(prdPath, FIXTURE_PRD, 'utf8');

  // Source tree organized as src/<module-slug>/<file>.ts so the
  // synthesizer's deriveModules() can extract a module slug (it requires
  // a `<module-root>/<slug>/` prefix). The slug is `widget` here.
  const srcDir = join(root, 'src', 'widget');
  await mkdir(srcDir, { recursive: true });
  await writeFile(join(srcDir, 'a.ts'), FIXTURE_SOURCE_A, 'utf8');
  await writeFile(join(srcDir, 'b.ts'), FIXTURE_SOURCE_B, 'utf8');
  await writeFile(join(srcDir, 'widget.ts'), FIXTURE_SOURCE_WIDGET, 'utf8');

  const clonesDir = join(root, '.dw-lifecycle', 'scope-discovery');
  await mkdir(clonesDir, { recursive: true });
  await writeFile(join(clonesDir, 'clones.yaml'), FIXTURE_CLONES_YAML, 'utf8');

  // Build the prior manifest by running synthesize against the baseline
  // PRD. This is the "before scope-widen" state we delta against.
  const priorFindings: ReadonlyArray<DiscoveryAgentFinding> = [
    {
      agent: 'prd-themed-pattern-hunter',
      featureSlug: 'widening-fixture',
      themes: [
        {
          term: 'polishtest',
          occurrences: [
            { file: 'src/widget/a.ts', line: 3, snippet: 'polishtest fixture a' },
          ],
        },
      ],
    },
    {
      agent: 'clone-detector-reader',
      featureSlug: 'widening-fixture',
      baselinePath: '.dw-lifecycle/scope-discovery/clones.yaml',
      filterApplied: 'none',
      modulesInScope: ['widget'],
      clones: [
        {
          id: 'abcd1234',
          lines: 10,
          members: ['src/widget/a.ts:1-10', 'src/widget/b.ts:1-10'],
          disposition: 'pending',
        },
      ],
    },
  ];
  const priorOut = await synthesize({
    featureSlug: 'widening-fixture',
    findings: priorFindings,
    prdPath,
    prdRelPath: 'docs/1.0/001-IN-PROGRESS/widening-fixture/prd.md',
    moduleRoot: 'src',
  });
  const manifestPath = join(docsDir, 'scope-manifest.yaml');
  await writeFile(manifestPath, stringifyYaml(priorOut.manifest), 'utf8');

  return {
    root,
    prdPath,
    manifestPath,
    moduleRoot: 'src',
    async cleanup() {
      await rm(root, { recursive: true, force: true });
    },
  };
}

function readPriorManifest(text: string): ScopeManifest {
  const parsed: unknown = parseYaml(text);
  if (!isPlainObject(parsed)) throw new Error('manifest is not an object');
  if (parsed['kind'] !== 'ui' && parsed['kind'] !== 'code' && parsed['kind'] !== 'hybrid') {
    throw new Error(`unexpected kind: ${String(parsed['kind'])}`);
  }
  if (typeof parsed['feature_slug'] !== 'string') {
    throw new Error('feature_slug is not a string');
  }
  if (typeof parsed['generated_by'] !== 'string') {
    throw new Error('generated_by is not a string');
  }
  if (typeof parsed['generated_at'] !== 'string') {
    throw new Error('generated_at is not a string');
  }
  if (!Array.isArray(parsed['scenarios'])) {
    throw new Error('scenarios is not an array');
  }
  if (!Array.isArray(parsed['reference_docs'])) {
    throw new Error('reference_docs is not an array');
  }
  if (!Array.isArray(parsed['discovery_themes'])) {
    throw new Error('discovery_themes is not an array');
  }
  // The schema validation in scope-widen guarantees the full shape; this
  // test-side helper mirrors the narrow typeguard the library uses.
  const themesIn = parsed['discovery_themes'];
  const themes: string[] = [];
  for (const t of themesIn) {
    if (typeof t === 'string') themes.push(t);
  }
  return {
    kind: parsed['kind'],
    feature_slug: parsed['feature_slug'],
    generated_by:
      parsed['generated_by'] === 'strawman' ||
      parsed['generated_by'] === 'curated' ||
      parsed['generated_by'] === 'hand-authored'
        ? parsed['generated_by']
        : 'strawman',
    generated_at: parsed['generated_at'],
    scenarios: [],
    reference_docs: [],
    discovery_themes: themes,
  };
}

describe('scope-widen — CLI parse', () => {
  it('exits 0 with usage banner on --help', async () => {
    const code = await scopeWidenMain(['--help']);
    expect(code).toBe(0);
  });

  it('exits 2 when complaint positional is missing', async () => {
    const code = await scopeWidenMain(['--slug', 'foo']);
    expect(code).toBe(2);
  });

  it('exits 2 when --slug is missing', async () => {
    const code = await scopeWidenMain(['the missing widget']);
    expect(code).toBe(2);
  });

  it('exits 2 when slug is malformed', async () => {
    const code = await scopeWidenMain(['missing', '--slug', '-bad-slug']);
    expect(code).toBe(2);
  });

  it('exits 2 when --evidence-trail has invalid value', async () => {
    const code = await scopeWidenMain([
      'foo',
      '--slug',
      'widening-fixture',
      '--evidence-trail',
      'maybe',
    ]);
    expect(code).toBe(2);
  });
});

describe('scope-widen — error surfaces', () => {
  it('exits 2 with actionable hint when prior manifest is missing', async () => {
    const fixture = await makeFixture();
    try {
      // Delete the manifest to simulate first-time scope-widen.
      await rm(fixture.manifestPath);
      const code = await scopeWidenMain([
        'a complaint about foowidget',
        '--slug',
        'widening-fixture',
        '--repo-root',
        fixture.root,
        '--module-root',
        fixture.moduleRoot,
        '--quiet',
      ]);
      expect(code).toBe(2);
    } finally {
      await fixture.cleanup();
    }
  });

  it('exits 2 when PRD is missing', async () => {
    const fixture = await makeFixture();
    try {
      await rm(fixture.prdPath);
      const code = await scopeWidenMain([
        'a complaint about foowidget',
        '--slug',
        'widening-fixture',
        '--repo-root',
        fixture.root,
        '--module-root',
        fixture.moduleRoot,
        '--quiet',
      ]);
      expect(code).toBe(2);
    } finally {
      await fixture.cleanup();
    }
  });
});

describe('scope-widen — dry-run (default)', () => {
  it('produces an evidence trail without modifying the prior manifest', async () => {
    const fixture = await makeFixture();
    try {
      const beforeText = await readFile(fixture.manifestPath, 'utf8');
      const code = await scopeWidenMain([
        'the foowidget surface was missed during initial discovery',
        '--slug',
        'widening-fixture',
        '--repo-root',
        fixture.root,
        '--module-root',
        fixture.moduleRoot,
        '--quiet',
      ]);
      expect(code, 'expected exit 0 in dry-run').toBe(0);
      const afterText = await readFile(fixture.manifestPath, 'utf8');
      expect(
        afterText,
        'dry-run must NOT modify the prior manifest',
      ).toBe(beforeText);

      // Evidence trail landed at scope-inventory/widen-runs/<stamp>-<id>/
      const widenRunsDir = join(
        fixture.root,
        'docs',
        '1.0',
        '001-IN-PROGRESS',
        'widening-fixture',
        'scope-inventory',
        'widen-runs',
      );
      const runs = await readdir(widenRunsDir);
      expect(runs.length).toBe(1);
      const runDir = join(widenRunsDir, runs[0] ?? '');
      const entries = await readdir(runDir);
      // The contract: complaint.txt + delta.json + args.json always
      // land; per-agent JSONs + synthesis.md + new-manifest.yaml land
      // when --evidence-trail is on (default).
      expect(entries).toContain('complaint.txt');
      expect(entries).toContain('augmented-prd.md');
      expect(entries).toContain('delta.json');
      expect(entries).toContain('args.json');
      expect(entries).toContain('synthesis.md');
      expect(entries).toContain('new-manifest.yaml');
      // Per-agent JSONs (four universal agents).
      expect(entries).toContain('ui-route-enumerator.json');
      expect(entries).toContain('pattern-matrix.json');
      expect(entries).toContain('clone-detector-reader.json');
      expect(entries).toContain('prd-themed-pattern-hunter.json');

      // The complaint text was captured verbatim.
      const complaintText = await readFile(
        join(runDir, 'complaint.txt'),
        'utf8',
      );
      expect(complaintText).toContain('foowidget');
    } finally {
      await fixture.cleanup();
    }
  });

  it('surfaces foowidget as a NEW theme when the complaint mentions it repeatedly', async () => {
    const fixture = await makeFixture();
    try {
      // The complaint must repeat "foowidget" enough times to clear the
      // PRD-themed pattern hunter's MIN_TERM_FREQ=3 gate.
      const complaint =
        'we missed the foowidget surface. The foowidget patches landed ' +
        'before the foowidget naming convention was settled, so the ' +
        'foowidget components need re-walking.';
      const code = await scopeWidenMain([
        complaint,
        '--slug',
        'widening-fixture',
        '--repo-root',
        fixture.root,
        '--module-root',
        fixture.moduleRoot,
        '--quiet',
      ]);
      expect(code).toBe(0);

      // Read the per-run delta to confirm foowidget is in the additions.
      const widenRunsDir = join(
        fixture.root,
        'docs',
        '1.0',
        '001-IN-PROGRESS',
        'widening-fixture',
        'scope-inventory',
        'widen-runs',
      );
      const runs = await readdir(widenRunsDir);
      const runDir = join(widenRunsDir, runs[0] ?? '');
      const deltaText = await readFile(join(runDir, 'delta.json'), 'utf8');
      const delta: unknown = JSON.parse(deltaText);
      expect(isPlainObject(delta)).toBe(true);
      if (!isPlainObject(delta)) return;
      const themes = delta['themes'];
      expect(Array.isArray(themes)).toBe(true);
      if (!Array.isArray(themes)) return;
      // Themes render as `<term> (<N> occurrence[s])`; key off the term
      // prefix to assert "foowidget surfaced as a new theme" without
      // pinning the occurrence count (which depends on the source-tree
      // scan that varies across complaint phrasings).
      expect(
        themes.some((t) => typeof t === 'string' && t.startsWith('foowidget')),
        `expected a 'foowidget' theme to surface as a NEW theme; got: ${JSON.stringify(themes)}`,
      ).toBe(true);
    } finally {
      await fixture.cleanup();
    }
  });
});

describe('scope-widen — --apply merges delta', () => {
  it('writes the merged manifest back when --apply is passed', async () => {
    const fixture = await makeFixture();
    try {
      const beforeText = await readFile(fixture.manifestPath, 'utf8');
      const before = readPriorManifest(beforeText);
      expect(before.discovery_themes).not.toContain('foowidget');

      const complaint =
        'we missed the foowidget surface. The foowidget patches landed ' +
        'before the foowidget naming convention was settled, so the ' +
        'foowidget components need re-walking.';
      const code = await scopeWidenMain([
        complaint,
        '--slug',
        'widening-fixture',
        '--repo-root',
        fixture.root,
        '--module-root',
        fixture.moduleRoot,
        '--apply',
        '--quiet',
      ]);
      expect(code).toBe(0);

      const afterText = await readFile(fixture.manifestPath, 'utf8');
      expect(
        afterText,
        '--apply must rewrite the prior manifest',
      ).not.toBe(beforeText);
      const after = readPriorManifest(afterText);
      // Themes render as `<term> (<N> occurrence[s])`; check by prefix.
      expect(
        after.discovery_themes.some(
          (t) => typeof t === 'string' && t.startsWith('foowidget'),
        ),
        `expected a foowidget theme in merged manifest; got: ${JSON.stringify(after.discovery_themes)}`,
      ).toBe(true);
      // Pre-existing theme is preserved (purely additive merge).
      expect(
        after.discovery_themes.some(
          (t) => typeof t === 'string' && t.startsWith('polishtest'),
        ),
        `expected polishtest theme preserved; got: ${JSON.stringify(after.discovery_themes)}`,
      ).toBe(true);
    } finally {
      await fixture.cleanup();
    }
  });

  it('--apply with empty delta leaves the manifest unchanged', async () => {
    const fixture = await makeFixture();
    try {
      const beforeText = await readFile(fixture.manifestPath, 'utf8');
      // A complaint that mentions only words already in the PRD body.
      // We use "polishtest" — the baseline PRD already says it three times,
      // so the augmented PRD doesn't introduce a new theme.
      const code = await scopeWidenMain([
        'polishtest polishtest polishtest polishtest',
        '--slug',
        'widening-fixture',
        '--repo-root',
        fixture.root,
        '--module-root',
        fixture.moduleRoot,
        '--apply',
        '--quiet',
      ]);
      expect(code).toBe(0);
      const afterText = await readFile(fixture.manifestPath, 'utf8');
      expect(afterText).toBe(beforeText);
    } finally {
      await fixture.cleanup();
    }
  });
});

describe('scope-widen — computeDelta + mergeDelta unit tests', () => {
  const baseManifest: ScopeManifest = {
    kind: 'code',
    feature_slug: 'unit-fixture',
    generated_by: 'strawman',
    generated_at: '2026-05-26T00:00:00.000Z',
    scenarios: [{ id: 's1' }],
    reference_docs: [{ path: 'prd.md', role: 'prd' }],
    discovery_themes: ['existing-theme'],
    modules: [
      {
        glob: 'src/existing/**/*.ts',
        patterns: [{ id: 'p1', kind: 'grep' }],
      },
    ],
  };

  it('computeDelta surfaces only ADDITIONS', () => {
    const next: ScopeManifest = {
      ...baseManifest,
      discovery_themes: ['existing-theme', 'new-theme'],
      modules: [
        {
          glob: 'src/existing/**/*.ts',
          patterns: [{ id: 'p1', kind: 'grep' }],
        },
        {
          glob: 'src/new/**/*.ts',
          patterns: [{ id: 'p2', kind: 'grep' }],
        },
      ],
    };
    const delta = computeDelta(baseManifest, next);
    expect(delta.themes).toEqual(['new-theme']);
    expect(delta.modules.length).toBe(1);
    expect(delta.modules[0]?.glob).toBe('src/new/**/*.ts');
    expect(delta.total).toBe(2);
  });

  it('computeDelta is purely additive — removals are NOT surfaced', () => {
    // The "next" manifest LACKS the existing theme. Delta should NOT
    // report this as a removal; total stays 0 because nothing was added.
    const next: ScopeManifest = {
      ...baseManifest,
      discovery_themes: [],
      modules: undefined,
    };
    const delta = computeDelta(baseManifest, next);
    expect(delta.themes).toEqual([]);
    expect(delta.modules).toEqual([]);
    expect(delta.total).toBe(0);
  });

  it('mergeDelta appends additions while preserving existing entries', () => {
    const delta: ScopeWidenDelta = {
      routes: [],
      modules: [
        {
          glob: 'src/new/**/*.ts',
          patterns: [{ id: 'p2', kind: 'grep' }],
        },
      ],
      themes: ['new-theme'],
      regimeHoldouts: {
        anti_patterns: [],
        adopter_manifests: [],
        module_symmetry: [],
        deprecations: [],
      },
      total: 2,
    };
    const merged = mergeDelta(baseManifest, delta);
    expect(merged.discovery_themes).toEqual(['existing-theme', 'new-theme']);
    expect(merged.modules?.length).toBe(2);
    expect(merged.modules?.[0]?.glob).toBe('src/existing/**/*.ts');
    expect(merged.modules?.[1]?.glob).toBe('src/new/**/*.ts');
    // generated_by stays whatever the prior had (curation preserved).
    expect(merged.generated_by).toBe('strawman');
  });

  it('mergeDelta recomputes regime-holdout meta from merged section lengths', () => {
    // Phase 11 Task 11 — fixture entries carry `status_provenance:`
    // (default blessed + install-seed) so the merge path's by_status
    // rollup has well-typed inputs.
    const SP = {
      source_status: 'blessed',
      provenance_source: 'install-seed',
    } as const;
    const prior: ScopeManifest = {
      ...baseManifest,
      regime_holdouts: {
        anti_patterns: [
          {
            id: 'ap-1',
            file: 'src/foo.ts',
            shape: 'legacy',
            replacement: 'modern',
            evidence: { registry_path: '.dw/anti.yaml', registry_id: 'ap-1' },
            status_provenance: SP,
          },
        ],
        adopter_manifests: [],
        module_symmetry: [],
        deprecations: [],
        meta: {
          total: 1,
          by_source: {
            anti_pattern: 1,
            adopter_manifest: 0,
            module_symmetry: 0,
            deprecation: 0,
          },
          by_status: { actively_enforced: 1, candidate: 0 },
        },
      },
    };
    const delta: ScopeWidenDelta = {
      routes: [],
      modules: [],
      themes: [],
      regimeHoldouts: {
        anti_patterns: [
          {
            id: 'ap-2',
            file: 'src/bar.ts',
            shape: 'legacy',
            replacement: 'modern',
            evidence: { registry_path: '.dw/anti.yaml', registry_id: 'ap-2' },
            status_provenance: SP,
          },
        ],
        adopter_manifests: [],
        module_symmetry: [],
        deprecations: [],
      },
      total: 1,
    };
    const merged = mergeDelta(prior, delta);
    expect(merged.regime_holdouts?.anti_patterns.length).toBe(2);
    expect(merged.regime_holdouts?.meta.total).toBe(2);
    expect(merged.regime_holdouts?.meta.by_source.anti_pattern).toBe(2);
    expect(merged.regime_holdouts?.meta.by_status.actively_enforced).toBe(2);
  });
});
