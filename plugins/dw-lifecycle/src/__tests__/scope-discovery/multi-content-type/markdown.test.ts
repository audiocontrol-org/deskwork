/**
 * plugins/dw-lifecycle/src/__tests__/scope-discovery/multi-content-type/markdown.test.ts
 *
 * Phase 11 Task 13 — markdown content-type support across every pattern
 * primitive in the polymorphic dispatcher:
 *
 *   - regex          (heading conventions / frontmatter shapes)
 *   - negative-space (markdown files missing canonical structure)
 *   - coverage       (per-glob adoption of the canonical structure)
 *   - outlier        (token-composition with content_type='markdown')
 *
 * Per testing.md: prefer fixture trees + in-memory scans. The handlers
 * operate on `SourceFileView`s (path + text + lines); no FS mocking.
 */

import { describe, it, expect } from 'vitest';
import { regexHandler } from '../../../scope-discovery/discovery-agents/pattern-handlers/regex.js';
import { negativeSpaceHandler } from '../../../scope-discovery/discovery-agents/pattern-handlers/negative-space.js';
import { coverageHandler } from '../../../scope-discovery/discovery-agents/pattern-handlers/coverage.js';
import { outlierHandler } from '../../../scope-discovery/discovery-agents/pattern-handlers/outlier.js';
import type {
  CoverageEntry,
  NegativeSpaceEntry,
  OutlierEntry,
  RegexEntry,
} from '../../../scope-discovery/discovery-agents/pattern-handlers/types.js';
import {
  makeScan,
  TEST_CATALOG_PROVENANCE,
  TEST_CATALOG_STATUS,
} from '../discovery-agents/pattern-handlers/fixtures.js';

// A canonical markdown frontmatter snippet — the shape the catalog
// would treat as the "expected adopter" of a project convention.
const MD_WITH_FRONTMATTER = [
  '---',
  'title: A Post',
  'date: 2026-05-26',
  'deskwork:',
  '  id: 4e4d6912-3edf-4aeb-b6ed-ba455f362f14',
  '---',
  '',
  '# A Post',
  '',
  'Body.',
].join('\n');

const MD_WITHOUT_FRONTMATTER = ['# A Post', '', 'Body.'].join('\n');

const MD_WITH_BAD_HEADING = [
  '---',
  'title: x',
  '---',
  '',
  'A Post', // Setext-style (==/--), retired per design standards
  '======',
  '',
  'Body.',
].join('\n');

describe('Phase 11 Task 13 — markdown / regex handler', () => {
  it('fires on Setext-style heading (retired convention)', () => {
    const entry: RegexEntry = {
      type: 'regex',
      id: 'setext-heading-retired',
      description: 'Setext-style H1 headings (retired in favor of ATX `#`).',
      regex: /^={3,}\s*$/gm,
      extensions: ['.md', '.markdown'],
      status: TEST_CATALOG_STATUS,
      provenance: TEST_CATALOG_PROVENANCE,
    };
    const offending = makeScan('docs/post.md', MD_WITH_BAD_HEADING);
    const finding = regexHandler.apply({ entry, scans: [offending] });
    expect(finding.hits.length).toBeGreaterThan(0);
    const hit = finding.hits[0];
    if (hit === undefined) throw new Error('no hit');
    expect(hit.file).toBe('docs/post.md');
    expect(hit.snippet.startsWith('====')).toBe(true);
  });

  it('does NOT fire on .ts files even with matching text (extension filter)', () => {
    const entry: RegexEntry = {
      type: 'regex',
      id: 'setext-heading-retired',
      description: 'Setext heading regex; only valid in markdown.',
      regex: /^={3,}\s*$/gm,
      extensions: ['.md', '.markdown'],
      status: TEST_CATALOG_STATUS,
      provenance: TEST_CATALOG_PROVENANCE,
    };
    const tsScan = makeScan('src/comment.ts', '// =====\nconst x = 1;');
    const finding = regexHandler.apply({ entry, scans: [tsScan] });
    expect(finding.hits).toEqual([]);
  });
});

describe('Phase 11 Task 13 — markdown / negative-space handler', () => {
  const entry: NegativeSpaceEntry = {
    type: 'negative-space',
    id: 'post-without-deskwork-id',
    description:
      'Posts under docs/ that lack the `deskwork.id` frontmatter UUID — the canonical binding shape per deskwork conventions.',
    matchGlob: 'docs/**/*.md',
    // Match the literal `deskwork:` key followed by an `id:` line.
    mustContain: /deskwork:\s*\n\s*id:\s*[0-9a-fA-F-]+/g,
    threshold: 1,
    extensions: ['.md', '.markdown'],
    status: TEST_CATALOG_STATUS,
    provenance: TEST_CATALOG_PROVENANCE,
  };

  it('FIRES on a markdown file missing the deskwork.id binding', () => {
    const offending = makeScan('docs/posts/orphan.md', MD_WITHOUT_FRONTMATTER);
    const finding = negativeSpaceHandler.apply({ entry, scans: [offending] });
    expect(finding.hits).toHaveLength(1);
    expect(finding.hits[0]?.file).toBe('docs/posts/orphan.md');
    expect(finding.provenance).toBe('negative-space');
  });

  it('does NOT fire on a healthy sibling that has the deskwork.id binding', () => {
    const healthy = makeScan('docs/posts/bound.md', MD_WITH_FRONTMATTER);
    const finding = negativeSpaceHandler.apply({ entry, scans: [healthy] });
    expect(finding.hits).toEqual([]);
  });

  it('does NOT fire on a file outside the glob', () => {
    const offGlob = makeScan('README.md', MD_WITHOUT_FRONTMATTER);
    const finding = negativeSpaceHandler.apply({ entry, scans: [offGlob] });
    expect(finding.hits).toEqual([]);
  });
});

describe('Phase 11 Task 13 — markdown / coverage handler', () => {
  it('emits adoption ratio for markdown files', () => {
    const entry: CoverageEntry = {
      type: 'coverage',
      id: 'deskwork-id-adoption',
      description: 'Fraction of docs/ markdown files carrying deskwork.id.',
      matchGlob: 'docs/**/*.md',
      mustContain: /deskwork:\s*\n\s*id:\s*[0-9a-fA-F-]+/g,
      extensions: ['.md', '.markdown'],
      status: TEST_CATALOG_STATUS,
      provenance: TEST_CATALOG_PROVENANCE,
    };
    const a = makeScan('docs/posts/a.md', MD_WITH_FRONTMATTER);
    const b = makeScan('docs/posts/b.md', MD_WITHOUT_FRONTMATTER);
    const c = makeScan('docs/posts/c.md', MD_WITH_FRONTMATTER);
    const ts = makeScan('src/ignored.ts', 'deskwork: \n  id: abc');
    const finding = coverageHandler.apply({
      entry,
      scans: [a, b, c, ts],
    });
    expect(finding.metrics).toBeDefined();
    expect(finding.metrics?.['denominator']).toBe(3);
    expect(finding.metrics?.['numerator']).toBe(2);
    const ratio = finding.metrics?.['ratio'] ?? 0;
    expect(ratio).toBeCloseTo(2 / 3, 5);
  });
});

describe('Phase 11 Task 13 — markdown / outlier handler', () => {
  const entry: OutlierEntry = {
    type: 'outlier',
    id: 'markdown-token-outlier',
    description:
      'Markdown files whose word composition diverges from siblings.',
    matchGlob: 'docs/**/*.md',
    distanceMetric: 'token-composition',
    thresholdSigma: 1.2,
    contentType: 'markdown',
    extensions: ['.md', '.markdown'],
    status: TEST_CATALOG_STATUS,
    provenance: TEST_CATALOG_PROVENANCE,
  };

  it('fires on a file whose vocabulary diverges from siblings', () => {
    // Three siblings discussing the same topic …
    const sib1 = makeScan(
      'docs/posts/a.md',
      'audio control synthesizer keyboard sampling envelope filter.',
    );
    const sib2 = makeScan(
      'docs/posts/b.md',
      'audio control synthesizer keyboard sampling envelope amplifier.',
    );
    const sib3 = makeScan(
      'docs/posts/c.md',
      'audio control synthesizer keyboard sampling oscillator filter.',
    );
    // … and one outlier on a completely different topic.
    const outlier = makeScan(
      'docs/posts/d.md',
      'cooking recipes bread sourdough kitchen baking flour yeast dough.',
    );
    const finding = outlierHandler.apply({
      entry,
      scans: [sib1, sib2, sib3, outlier],
    });
    expect(finding.provenance).toBe('outlier');
    const flagged = finding.hits.map((h) => h.file);
    expect(flagged).toContain('docs/posts/d.md');
    expect(flagged).not.toContain('docs/posts/a.md');
  });

  it('auto-infers content_type from .md extension when content_type unset (defaults to "auto")', () => {
    const autoEntry: OutlierEntry = {
      type: 'outlier',
      id: 'auto-markdown',
      description: 'Auto-infer markdown',
      matchGlob: 'docs/**/*.md',
      distanceMetric: 'token-composition',
      thresholdSigma: 1.2,
      // contentType omitted — should infer 'markdown' from .md extension
      status: TEST_CATALOG_STATUS,
      provenance: TEST_CATALOG_PROVENANCE,
    };
    const sib1 = makeScan(
      'docs/posts/a.md',
      'alpha beta gamma delta epsilon. extra1',
    );
    const sib2 = makeScan(
      'docs/posts/b.md',
      'alpha beta gamma delta zeta. extra2',
    );
    const sib3 = makeScan(
      'docs/posts/c.md',
      'alpha beta gamma delta eta. extra3',
    );
    const outlier = makeScan(
      'docs/posts/d.md',
      'completely unrelated tokens here forever.',
    );
    const finding = outlierHandler.apply({
      entry: autoEntry,
      scans: [sib1, sib2, sib3, outlier],
    });
    expect(finding.hits.length).toBeGreaterThan(0);
  });
});
