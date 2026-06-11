/**
 * plugins/stack-control/src/__tests__/scope-discovery/scope-widen.test.ts
 *
 * 010 T032 (US3, FR-016) — scope-widen surfaces a sibling surface that
 * is absent from the prior manifest, reconciled against it.
 *
 * Two layers:
 *   1. Deterministic unit: computeDelta() surfaces a NEW module (a
 *      sibling the prior manifest lacks); mergeDelta() reconciles it
 *      into the prior manifest WITHOUT dropping the prior module.
 *   2. End-to-end: scopeWidenMain() default dry-run exits 0 and leaves
 *      the on-disk prior manifest byte-identical (widen never mutates
 *      without --apply).
 *
 * Builds real fixtures on disk; never mocks fs.
 */

import { describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stringify as stringifyYaml } from 'yaml';
import {
  computeDelta,
  mergeDelta,
  scopeWidenMain,
} from '../../scope-discovery/scope-widen.js';
import { synthesize } from '../../scope-discovery/synthesis.js';
import type { DiscoveryAgentFinding } from '../../scope-discovery/discovery-agents/types.js';
import type { ScopeManifest } from '../../scope-discovery/synthesis-types.js';

const PRD = [
  '# Feature: widen-fixture',
  '',
  '## Overview',
  '',
  'The widget module is the surface. widget widget widget.',
  '',
  '## References',
  '',
  '- a reference doc',
  '',
].join('\n');

const CLONES_YAML = [
  'generated_at: 2026-06-10T00:00:00Z',
  'clones:',
  '  - id: abcd1234ef56',
  '    lines: 10',
  '    members:',
  '      - src/widget/a.ts:1-10',
  '      - src/widget/b.ts:1-10',
  '    disposition: pending',
  '    reason: null',
  '',
].join('\n');

interface Fixture {
  readonly root: string;
  readonly prdPath: string;
  readonly manifestPath: string;
  cleanup(): Promise<void>;
}

async function makeFixture(): Promise<Fixture> {
  const root = await mkdtemp(join(tmpdir(), 'widen-'));
  // The fixture root is an INSTALLATION (the marker the --at walk-up
  // resolves; specs/installation-isolation R2 retired --repo-root).
  await mkdir(join(root, '.stack-control'), { recursive: true });
  await writeFile(join(root, '.stack-control', 'config.yaml'), 'version: 1\n', 'utf8');
  const docsDir = join(root, 'docs', '1.0', '001-IN-PROGRESS', 'widen-fixture');
  await mkdir(docsDir, { recursive: true });
  const prdPath = join(docsDir, 'prd.md');
  await writeFile(prdPath, PRD, 'utf8');

  const widgetDir = join(root, 'src', 'widget');
  await mkdir(widgetDir, { recursive: true });
  await writeFile(join(widgetDir, 'a.ts'), 'export const a = (x: unknown) => x as Foo;\n', 'utf8');
  await writeFile(join(widgetDir, 'b.ts'), 'export const b = 2;\n', 'utf8');

  const sdDir = join(root, '.stack-control', 'scope-discovery');
  await mkdir(sdDir, { recursive: true });
  await writeFile(join(sdDir, 'clones.yaml'), CLONES_YAML, 'utf8');

  // Prior manifest synthesized from a baseline that knows ONLY the
  // widget module.
  const priorFindings: ReadonlyArray<DiscoveryAgentFinding> = [
    {
      agent: 'prd-themed-pattern-hunter',
      featureSlug: 'widen-fixture',
      themes: [
        {
          term: 'widget',
          occurrences: [{ file: 'src/widget/a.ts', line: 1, snippet: 'widget' }],
        },
      ],
    },
    {
      agent: 'clone-detector-reader',
      featureSlug: 'widen-fixture',
      baselinePath: '.stack-control/scope-discovery/clones.yaml',
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
    featureSlug: 'widen-fixture',
    findings: priorFindings,
    prdPath,
    prdRelPath: 'docs/1.0/001-IN-PROGRESS/widen-fixture/prd.md',
    moduleRoot: 'src',
  });
  const manifestPath = join(docsDir, 'scope-manifest.yaml');
  await writeFile(manifestPath, stringifyYaml(priorOut.manifest), 'utf8');

  return {
    root,
    prdPath,
    manifestPath,
    async cleanup() {
      await rm(root, { recursive: true, force: true });
    },
  };
}

function baseManifest(): ScopeManifest {
  return {
    kind: 'code',
    feature_slug: 'widen-fixture',
    generated_by: 'curated',
    generated_at: '2026-06-10T00:00:00Z',
    scenarios: [],
    reference_docs: [],
    discovery_themes: ['widget (1 occurrence)'],
    modules: [
      { glob: 'src/widget/**', label: 'widget', patterns: [] },
    ],
  };
}

describe('scope-widen — delta surfaces a sibling absent from the prior manifest (T032)', () => {
  it('computeDelta surfaces a NEW module the prior manifest lacks', () => {
    const prior = baseManifest();
    const next: ScopeManifest = {
      ...prior,
      modules: [
        ...(prior.modules ?? []),
        // The complaint-exposed sibling surface the original inventory missed.
        { glob: 'src/gadget/**', label: 'gadget', patterns: [] },
      ],
    };
    const delta = computeDelta(prior, next);
    expect(delta.modules.map((m) => m.glob)).toEqual(['src/gadget/**']);
    expect(delta.total).toBe(1);
  });

  it('mergeDelta reconciles the sibling in WITHOUT dropping the prior module', () => {
    const prior = baseManifest();
    const next: ScopeManifest = {
      ...prior,
      modules: [
        ...(prior.modules ?? []),
        { glob: 'src/gadget/**', label: 'gadget', patterns: [] },
      ],
    };
    const delta = computeDelta(prior, next);
    const merged = mergeDelta(prior, delta);
    const globs = (merged.modules ?? []).map((m) => m.glob).sort();
    expect(globs).toEqual(['src/gadget/**', 'src/widget/**']);
    // Reconciliation preserves the prior manifest's curation level.
    expect(merged.generated_by).toBe('curated');
  });

  it('computeDelta is purely additive — a removed prior module is NOT surfaced', () => {
    const prior = baseManifest();
    // next DROPS widget and has gadget only.
    const next: ScopeManifest = {
      ...prior,
      modules: [{ glob: 'src/gadget/**', label: 'gadget', patterns: [] }],
    };
    const delta = computeDelta(prior, next);
    // Only the addition (gadget) surfaces; the removal (widget) is not a delta.
    expect(delta.modules.map((m) => m.glob)).toEqual(['src/gadget/**']);
  });
});

describe('scope-widen — end-to-end dry-run leaves the prior manifest untouched (T032)', () => {
  it('exits 0 and does not mutate the on-disk manifest without --apply', async () => {
    const fixture = await makeFixture();
    try {
      const before = await readFile(fixture.manifestPath, 'utf8');
      const code = await scopeWidenMain([
        'gadget module is also affected by this change',
        '--slug',
        'widen-fixture',
        '--at',
        fixture.root,
        '--prd-path',
        fixture.prdPath,
        '--manifest',
        fixture.manifestPath,
        '--evidence-trail',
        'off',
        '--quiet',
      ]);
      expect(code).toBe(0);
      const after = await readFile(fixture.manifestPath, 'utf8');
      // Dry-run default: the on-disk manifest is byte-identical.
      expect(after).toBe(before);
    } finally {
      await fixture.cleanup();
    }
  });
});
