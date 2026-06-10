/**
 * plugins/dw-lifecycle/src/__tests__/scope-discovery/discovery-agents/prd-themed-pattern-hunter.relevance.test.ts
 *
 * Ported from the audiocontrol pilot's
 * `tools/scope-discovery/discovery-agents/prd-themed-pattern-hunter.relevance-scenarios.ts`
 * (AUDIT-20260524-11). Adversarial scenarios for the PRD-scope-based
 * module pruning. The agent extracts module relevance from the PRD's
 * "In Scope" / "Out of Scope" sections; the synthesizer's deriveModules
 * consumes the score to drop excluded modules + annotate low-relevance
 * ones. These scenarios assert both halves of that contract independently
 * AND end-to-end through `synthesize()`, plus a gutted-stub self-check
 * that confirms the harness has teeth.
 *
 * The fixture data references `modules/<slug>/src/...` paths verbatim;
 * the test passes `moduleRoot: 'modules'` to `synthesize()` so the
 * derive helpers parse the slug correctly. Fixture slugs (`foo`, `bar`,
 * `baz`, `qux`, `d110-editor`) are synthetic and unrelated to the
 * project's real codebase layout.
 */

import { describe, it, expect } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type {
  AstGrepMatrixFindings,
  CloneDetectorFindings,
  DiscoveryAgentFinding,
  PrdModuleRelevanceEntry,
  PrdThemedFindings,
} from '../../../scope-discovery/discovery-agents/types.js';
import { parseModuleRelevance } from '../../../scope-discovery/discovery-agents/prd-relevance.js';
import { synthesize } from '../../../scope-discovery/synthesis.js';

/**
 * Synthetic AST + clone + theme findings that route the synthesizer to
 * kind=code. Each module is referenced by at least one finding so it
 * lands in the strawman pre-pruning; the scenarios then assert which
 * survive PRD-scope filtering.
 */
function makeAstFindings(
  modulesTouched: ReadonlyArray<string>,
): AstGrepMatrixFindings {
  return {
    agent: 'ast-grep-matrix',
    featureSlug: 'relevance-fixture',
    patterns: [
      {
        id: 'as-type-cast',
        description: 'TypeScript `as Type` cast — relevance-fixture pattern.',
        regex: 'as Type',
        hits: modulesTouched.map((m) => ({
          file: `modules/${m}/src/index.ts`,
          line: 1,
          snippet: `value as Type // ${m}`,
        })),
      },
    ],
  };
}

function makeCloneFindings(modulesTouched: ReadonlyArray<string>): CloneDetectorFindings {
  return {
    agent: 'clone-detector-reader',
    featureSlug: 'relevance-fixture',
    baselinePath: 'docs/scope-discovery/clones.yaml',
    filterApplied: 'none',
    modulesInScope: modulesTouched,
    clones: [],
  };
}

function makeThemeFindings(
  moduleRelevance?: ReadonlyArray<PrdModuleRelevanceEntry>,
): PrdThemedFindings {
  return {
    agent: 'prd-themed-pattern-hunter',
    featureSlug: 'relevance-fixture',
    themes: [
      {
        term: 'relevance',
        occurrences: [
          { file: 'modules/foo/src/index.ts', line: 1, snippet: 'relevance probe' },
        ],
      },
    ],
    ...(moduleRelevance !== undefined ? { moduleRelevance } : {}),
  };
}

interface SynthFixture {
  readonly dir: string;
  readonly prdPath: string;
  readonly cleanup: () => Promise<void>;
}

async function makeSynthesisFixture(label: string): Promise<SynthFixture> {
  const dir = await mkdtemp(join(tmpdir(), `prd-relevance-${label}-`));
  await mkdir(dir, { recursive: true });
  const prdPath = join(dir, 'prd.md');
  // A tiny PRD with no References (so a separate warning fires but the
  // synthesizer still runs to completion).
  await writeFile(
    prdPath,
    '# Fixture\n\n## Goals\n\nThe relevance-fixture feature exists for testing.\n',
    'utf8',
  );
  return {
    dir,
    prdPath,
    cleanup: async () => rm(dir, { recursive: true, force: true }),
  };
}

describe('prd-themed-pattern-hunter — PRD-scope relevance parsing', () => {
  it('PRD with "In Scope" extracts modules at relevance=high', () => {
    const prd = [
      '# Fixture',
      '',
      '## In Scope',
      '',
      '- modules/foo',
      '- modules/bar — primary surface',
      '',
      '## Other section',
      '',
      'unrelated body.',
    ].join('\n');
    const result = parseModuleRelevance(prd, ['foo', 'bar', 'baz']);
    expect(result.scores.get('foo')).toBe('high');
    expect(result.scores.get('bar')).toBe('high');
    // baz was not mentioned
    expect(result.scores.get('baz')).toBeUndefined();
  });

  it('PRD with "Out of Scope" excludes modules (incl. bare-name detection)', () => {
    const prd = [
      '# Fixture',
      '',
      '## Out of Scope',
      '',
      '- modules/baz',
      '- The d110-editor surface is out of scope.',
      '',
    ].join('\n');
    const result = parseModuleRelevance(prd, ['foo', 'bar', 'baz', 'd110-editor']);
    expect(result.scores.get('baz')).toBe('excluded');
    expect(result.scores.get('d110-editor')).toBe('excluded');
  });

  it('PRD without In Scope/Out of Scope sections returns empty map', () => {
    const prd = [
      '# Fixture',
      '',
      '## Goals',
      '',
      'Nothing about scope here.',
      '',
      '## Acceptance Criteria',
      '',
      '- Some criterion that mentions modules/foo in passing.',
    ].join('\n');
    const result = parseModuleRelevance(prd, ['foo', 'bar']);
    // Synthesizer falls back to default-medium for every module when
    // the map is empty.
    expect(result.scores.size).toBe(0);
  });

  it('gutted-detector self-check: empty-map stub fails the production assertion (harness has teeth)', () => {
    const prd = '## In Scope\n\n- modules/foo\n\n## Out of Scope\n\n- modules/baz\n';
    // Stubbed parser: never finds anything. The "production scenarios"
    // (above) check `parseModuleRelevance(prd, ...).scores.get('foo') === 'high'`.
    // We assert that the stub does NOT satisfy that check.
    const stubResult = {
      scores: new Map<string, 'high' | 'medium' | 'low' | 'excluded'>(),
    };
    expect(stubResult.scores.get('foo')).not.toBe('high');
    // And confirm the REAL parser DOES satisfy it (so the production
    // assertions above are catching a regression, not a no-op).
    const realResult = parseModuleRelevance(prd, ['foo', 'baz']);
    expect(realResult.scores.get('foo')).toBe('high');
    expect(realResult.scores.get('baz')).toBe('excluded');
  });
});

describe('prd-themed-pattern-hunter — synthesizer end-to-end relevance', () => {
  it('synthesizer drops excluded modules AND emits a warning naming the module + section', async () => {
    const fixture = await makeSynthesisFixture('drop-warn');
    try {
      const ast = makeAstFindings(['foo', 'bar', 'baz']);
      const clones = makeCloneFindings(['foo', 'bar', 'baz']);
      const themes = makeThemeFindings([
        { module: 'foo', relevance: 'high', section: 'In Scope' },
        { module: 'bar', relevance: 'high', section: 'In Scope' },
        { module: 'baz', relevance: 'excluded', section: 'Out of Scope' },
      ]);
      const findings: DiscoveryAgentFinding[] = [ast, clones, themes];
      const result = await synthesize({
        featureSlug: 'relevance-fixture',
        findings,
        prdPath: fixture.prdPath,
        prdRelPath: 'prd.md',
        moduleRoot: 'modules',
      });
      const moduleSlugs = (result.manifest.modules ?? []).map((m) => m.label);
      expect(
        moduleSlugs.includes('baz'),
        `expected manifest to omit baz; got modules=[${moduleSlugs.join(', ')}]`,
      ).toBe(false);
      expect(moduleSlugs).toContain('foo');
      expect(moduleSlugs).toContain('bar');
      const exclusionWarning = result.metadata.warnings.find((w) =>
        /excluded.*module/i.test(w) && w.includes('baz'),
      );
      expect(
        exclusionWarning,
        `expected warning naming baz; got: ${result.metadata.warnings.join(' / ')}`,
      ).toBeDefined();
      expect(exclusionWarning).toContain('Out of Scope');
    } finally {
      await fixture.cleanup();
    }
  });

  it('synthesizer annotates low-relevance modules; high-relevance modules carry no annotation', async () => {
    const fixture = await makeSynthesisFixture('annotate-low');
    try {
      const ast = makeAstFindings(['foo', 'qux']);
      const clones = makeCloneFindings(['foo', 'qux']);
      const themes = makeThemeFindings([
        { module: 'foo', relevance: 'high', section: 'In Scope' },
        { module: 'qux', relevance: 'low', section: 'Scope' },
      ]);
      const findings: DiscoveryAgentFinding[] = [ast, clones, themes];
      const result = await synthesize({
        featureSlug: 'relevance-fixture',
        findings,
        prdPath: fixture.prdPath,
        prdRelPath: 'prd.md',
        moduleRoot: 'modules',
      });
      const qux = (result.manifest.modules ?? []).find((m) => m.label === 'qux');
      expect(
        qux,
        `expected qux to appear in manifest; got modules=[${(result.manifest.modules ?? []).map((m) => m.label).join(', ')}]`,
      ).toBeDefined();
      expect(qux?.relevance).toBe('low');
      const foo = (result.manifest.modules ?? []).find((m) => m.label === 'foo');
      expect(foo).toBeDefined();
      // 'high' is the default emphasis; no annotation.
      expect(foo?.relevance).toBeUndefined();
    } finally {
      await fixture.cleanup();
    }
  });

  it('back-compat: agent without moduleRelevance returns pre-AUDIT-11 behavior (no annotations, no exclusion warning)', async () => {
    const fixture = await makeSynthesisFixture('backcompat');
    try {
      const ast = makeAstFindings(['foo', 'bar', 'baz']);
      const clones = makeCloneFindings(['foo', 'bar', 'baz']);
      // No moduleRelevance field. Mirrors a pre-AUDIT-11 agent output.
      const themes = makeThemeFindings(undefined);
      const findings: DiscoveryAgentFinding[] = [ast, clones, themes];
      const result = await synthesize({
        featureSlug: 'relevance-fixture',
        findings,
        prdPath: fixture.prdPath,
        prdRelPath: 'prd.md',
        moduleRoot: 'modules',
      });
      const moduleSlugs = (result.manifest.modules ?? []).map((m) => m.label);
      expect(moduleSlugs).toContain('foo');
      expect(moduleSlugs).toContain('bar');
      expect(moduleSlugs).toContain('baz');
      for (const m of result.manifest.modules ?? []) {
        expect(
          m.relevance,
          `module ${String(m.label)} unexpectedly carries relevance=${String(m.relevance)}`,
        ).toBeUndefined();
      }
      const sawExclusionWarning = result.metadata.warnings.some((w) =>
        /excluded.*module/i.test(w),
      );
      expect(sawExclusionWarning).toBe(false);
    } finally {
      await fixture.cleanup();
    }
  });
});
