/**
 * plugins/stack-control/src/__tests__/scope-discovery/synthesis.test.ts
 *
 * 010 T030 (US3, FR-017) — synthesis characterization.
 *
 * Pins two contracts:
 *   1. `synthesize()` folds the discovery-agent findings into a
 *      schema-valid scope-manifest (it throws if the manifest fails the
 *      schema, so a successful return IS the validity assertion).
 *   2. FR-017 — a run that found novel / unmatched shapes is NOT
 *      reported all-clear: the deterministic clusters the pattern-matrix
 *      agent surfaces on `AstGrepMatrixFindings.discoveredCandidates`
 *      appear in the manifest's `discovered_candidates:` section. This
 *      replaces the dw-lifecycle LLM-mediation path (severed in the 010
 *      port) with the in-scope deterministic clustering path.
 *
 * Uses an on-disk PRD (deriveReferenceDocs reads it); never mocks fs.
 */

import { describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { synthesize } from '../../scope-discovery/synthesis.js';
import type { DiscoveryAgentFinding } from '../../scope-discovery/discovery-agents/types.js';

const PRD = [
  '# Feature: synth-fixture',
  '',
  '## Overview',
  '',
  'A fixture PRD whose widget term recurs so the prd-themed hunter has',
  'a baseline theme. widget widget widget.',
  '',
  '## References',
  '',
  '- a reference doc',
  '',
].join('\n');

interface Fixture {
  readonly root: string;
  readonly prdPath: string;
  cleanup(): Promise<void>;
}

async function makeFixture(): Promise<Fixture> {
  const root = await mkdtemp(join(tmpdir(), 'synth-'));
  const docsDir = join(root, 'docs', '1.0', '001-IN-PROGRESS', 'synth-fixture');
  await mkdir(docsDir, { recursive: true });
  const prdPath = join(docsDir, 'prd.md');
  await writeFile(prdPath, PRD, 'utf8');
  return {
    root,
    prdPath,
    async cleanup() {
      await rm(root, { recursive: true, force: true });
    },
  };
}

/**
 * A code-kind finding set: one AST finding (with at least one hit so
 * `kind` resolves to 'code'), a clone group, and a PRD theme. The
 * source paths are `src/widget/<file>` so deriveModules extracts a
 * non-null `widget` slug (kind=code requires >= 1 module).
 */
function baseFindings(): DiscoveryAgentFinding[] {
  return [
    {
      agent: 'ast-grep-matrix',
      featureSlug: 'synth-fixture',
      patterns: [
        {
          id: 'as-type-cast',
          description: 'as-type cast',
          regex: 'as \\w+',
          hits: [{ file: 'src/widget/a.ts', line: 3, snippet: 'x as Foo' }],
          provenance: 'registered-pattern',
        },
      ],
    },
    {
      agent: 'clone-detector-reader',
      featureSlug: 'synth-fixture',
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
    {
      agent: 'prd-themed-pattern-hunter',
      featureSlug: 'synth-fixture',
      themes: [
        {
          term: 'widget',
          occurrences: [
            { file: 'src/widget/a.ts', line: 1, snippet: 'widget here' },
          ],
        },
      ],
    },
  ];
}

describe('synthesis — folds agent findings into a schema-valid manifest (T030)', () => {
  it('returns a kind=code manifest with modules + themes', async () => {
    const fixture = await makeFixture();
    try {
      const out = await synthesize({
        featureSlug: 'synth-fixture',
        findings: baseFindings(),
        prdPath: fixture.prdPath,
        prdRelPath: 'docs/1.0/001-IN-PROGRESS/synth-fixture/prd.md',
        moduleRoot: 'src',
      });
      // synthesize() throws if the manifest fails the schema — a return
      // value IS the schema-validity assertion.
      expect(out.manifest.kind).toBe('code');
      expect(out.manifest.feature_slug).toBe('synth-fixture');
      expect(out.manifest.generated_by).toBe('strawman');
      // discovery_themes render as "<term> (<n> occurrence(s))".
      expect(
        out.manifest.discovery_themes.some((t) => t.startsWith('widget')),
      ).toBe(true);
      expect(out.manifest.modules).toBeDefined();
      expect((out.manifest.modules ?? []).length).toBeGreaterThan(0);
    } finally {
      await fixture.cleanup();
    }
  });
});

describe('synthesis — FR-017: novel shapes are NOT reported all-clear (T030)', () => {
  it('folds pattern-matrix discoveredCandidates into manifest.discovered_candidates', async () => {
    const fixture = await makeFixture();
    try {
      const findings = baseFindings();
      // Attach a deterministic unmatched-shape cluster to the AST
      // finding — exactly what pattern-matrix's clusterUnmatchedShapes
      // produces for a run that saw novel shapes.
      const ast = findings.find((f) => f.agent === 'ast-grep-matrix');
      if (ast === undefined || ast.agent !== 'ast-grep-matrix') {
        throw new Error('fixture invariant: ast finding missing');
      }
      const withCluster: DiscoveryAgentFinding = {
        ...ast,
        discoveredCandidates: [
          {
            // cluster_id must match the schema pattern ^cluster-[0-9]{4,}$.
            id: 'cluster-12345678',
            shapeSummary: 'novel repeated shape, foo bar baz',
            members: ['src/widget/x.ts', 'src/widget/y.ts', 'src/widget/z.ts'],
            memberCount: 3,
          },
        ],
      };
      const finalFindings = findings.map((f) =>
        f.agent === 'ast-grep-matrix' ? withCluster : f,
      );

      const out = await synthesize({
        featureSlug: 'synth-fixture',
        findings: finalFindings,
        prdPath: fixture.prdPath,
        prdRelPath: 'docs/1.0/001-IN-PROGRESS/synth-fixture/prd.md',
        moduleRoot: 'src',
      });

      const candidates = out.manifest.discovered_candidates;
      expect(candidates).toBeDefined();
      expect((candidates ?? []).length).toBe(1);
      const c = (candidates ?? [])[0];
      expect(c?.cluster_id).toBe('cluster-12345678');
      expect(c?.member_count).toBe(3);
      expect(c?.summary).toContain('novel repeated shape');
      expect(c?.exemplar_files).toContain('src/widget/x.ts');
    } finally {
      await fixture.cleanup();
    }
  });

  it('omits discovered_candidates when no agent surfaced any cluster', async () => {
    const fixture = await makeFixture();
    try {
      // baseFindings() has no discoveredCandidates on the AST finding.
      const out = await synthesize({
        featureSlug: 'synth-fixture',
        findings: baseFindings(),
        prdPath: fixture.prdPath,
        prdRelPath: 'docs/1.0/001-IN-PROGRESS/synth-fixture/prd.md',
        moduleRoot: 'src',
      });
      // Section is OPTIONAL in the schema; omitted (null/absent) when no
      // clusters were found. This is the legitimate all-clear path.
      expect(out.manifest.discovered_candidates).toBeUndefined();
    } finally {
      await fixture.cleanup();
    }
  });
});
