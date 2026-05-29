/**
 * plugins/dw-lifecycle/src/__tests__/scope-discovery/mediation/propose-catalog-edits.test.ts
 *
 * Phase 11 Task 3 — propose-catalog-edits tests. Verifies the append-
 * vs-edit decision is correct + the produced catalog edits round-trip
 * through the YAML library + parse cleanly through the anti-patterns
 * + adopter-manifests registry parsers (proves they are wire-format
 * valid).
 */

import { describe, it, expect } from 'vitest';
import { stringify as yamlStringify } from 'yaml';
import type { Candidate } from '../../../scope-discovery/mediation/mediation-types.js';
import {
  deriveLiteralRegex,
  proposeCatalogEdits,
  type ProposeCatalogEditsInput,
} from '../../../scope-discovery/mediation/propose-catalog-edits.js';
import { parseRegistry as parseAntiPatternsRegistry } from '../../../scope-discovery/anti-patterns-registry.js';
import { parseRegistry as parseAdopterManifestsRegistry } from '../../../scope-discovery/adopter-manifests-registry.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeCluster(args: {
  readonly id?: string;
  readonly excerpt: string;
  readonly files: ReadonlyArray<string>;
}): Candidate {
  const id = args.id ?? 'cluster-0001';
  return {
    id,
    shapeFingerprint: ['fingerprint'],
    representativeExcerpt: args.excerpt,
    members: args.files.map((file, i) => ({
      file,
      line: i + 1,
      excerpt: args.excerpt,
      provenance: 'negative-space' as const,
    })),
    summary: `Test cluster ${id}`,
  };
}

const DEFAULT_NOW = '2026-05-26T12:00:00Z';
const DEFAULT_ADDED_IN = 'abc1234';

function defaults(): Pick<
  ProposeCatalogEditsInput,
  'now' | 'addedIn' | 'existingEntries'
> {
  return {
    now: DEFAULT_NOW,
    addedIn: DEFAULT_ADDED_IN,
    existingEntries: [],
  };
}

// ---------------------------------------------------------------------------
// deriveLiteralRegex()
// ---------------------------------------------------------------------------

describe('deriveLiteralRegex()', () => {
  it('escapes regex metacharacters', () => {
    expect(deriveLiteralRegex('a.b*c')).toBe('a\\.b\\*c');
    expect(deriveLiteralRegex('foo(bar)')).toBe('foo\\(bar\\)');
    expect(deriveLiteralRegex('a|b')).toBe('a\\|b');
  });

  it('returns a regex that matches the original string', () => {
    const original = 'className="flex absolute bg-slate-50"';
    const escaped = deriveLiteralRegex(original);
    const re = new RegExp(escaped);
    expect(re.test(original)).toBe(true);
  });

  it('escapes forward slashes (for regex literal compatibility)', () => {
    expect(deriveLiteralRegex('a/b')).toBe('a\\/b');
  });
});

// ---------------------------------------------------------------------------
// proposeCatalogEdits() — append (novelty) path
// ---------------------------------------------------------------------------

describe('proposeCatalogEdits() — append (novelty)', () => {
  it('proposes append for a cursed disposition with no matching existing entry', () => {
    const cluster = makeCluster({
      excerpt: 'className="flex absolute"',
      files: ['a.tsx', 'b.tsx'],
    });
    const result = proposeCatalogEdits({
      ...defaults(),
      clusters: [cluster],
      dispositions: [{ clusterId: cluster.id, disposition: 'cursed' }],
    });
    expect(result.length).toBe(1);
    expect(result[0]?.operation).toBe('append');
    expect(result[0]?.target_entry_id).toBeNull();
    expect(result[0]?.catalog_file).toBe('anti-patterns');
  });

  it('proposes append for a blessed disposition with no matching existing entry', () => {
    const cluster = makeCluster({
      excerpt: 'ac-primitive-shape',
      files: ['a.tsx'],
    });
    const result = proposeCatalogEdits({
      ...defaults(),
      clusters: [cluster],
      dispositions: [{ clusterId: cluster.id, disposition: 'blessed' }],
    });
    expect(result.length).toBe(1);
    expect(result[0]?.operation).toBe('append');
    expect(result[0]?.catalog_file).toBe('adopter-manifests');
  });
});

// ---------------------------------------------------------------------------
// proposeCatalogEdits() — edit (refinement) path
// ---------------------------------------------------------------------------

describe('proposeCatalogEdits() — edit (refinement)', () => {
  it('proposes edit when an existing anti-patterns entry matches the cluster shape', () => {
    const cluster = makeCluster({
      excerpt: 'className="flex absolute"',
      files: ['a.tsx'],
    });
    const result = proposeCatalogEdits({
      ...defaults(),
      clusters: [cluster],
      dispositions: [{ clusterId: cluster.id, disposition: 'cursed' }],
      existingEntries: [
        {
          catalog_file: 'anti-patterns',
          entry_id: 'existing-flex-pattern',
          match_regex: /className="flex/,
          status: 'cursed',
        },
      ],
    });
    expect(result[0]?.operation).toBe('edit');
    expect(result[0]?.target_entry_id).toBe('existing-flex-pattern');
  });

  it('skips withdrawn entries when looking for a match', () => {
    const cluster = makeCluster({
      excerpt: 'className="flex absolute"',
      files: ['a.tsx'],
    });
    const result = proposeCatalogEdits({
      ...defaults(),
      clusters: [cluster],
      dispositions: [{ clusterId: cluster.id, disposition: 'cursed' }],
      existingEntries: [
        {
          catalog_file: 'anti-patterns',
          entry_id: 'withdrawn-entry',
          match_regex: /className="flex/,
          status: 'withdrawn',
        },
      ],
    });
    expect(result[0]?.operation).toBe('append');
    expect(result[0]?.target_entry_id).toBeNull();
  });

  it('respects catalog_file when matching existing entries (an adopter-manifest entry does not match an anti-pattern cluster)', () => {
    const cluster = makeCluster({
      excerpt: 'className="flex absolute"',
      files: ['a.tsx'],
    });
    const result = proposeCatalogEdits({
      ...defaults(),
      clusters: [cluster],
      dispositions: [{ clusterId: cluster.id, disposition: 'cursed' }],
      existingEntries: [
        // Lives in the wrong catalog file for a cursed disposition.
        {
          catalog_file: 'adopter-manifests',
          entry_id: 'unrelated-adopter-entry',
          match_regex: /className="flex/,
          status: 'blessed',
        },
      ],
    });
    expect(result[0]?.operation).toBe('append');
  });
});

// ---------------------------------------------------------------------------
// Proposed entry is valid YAML — round-trips through the registry parsers.
// ---------------------------------------------------------------------------

describe('proposed_entry — wire-format validity', () => {
  it('produces an anti-patterns entry that parses via parseAntiPatternsRegistry', () => {
    const cluster = makeCluster({
      excerpt: 'className="flex absolute bg-red-500"',
      files: ['modules/foo-editor/src/Bar.tsx'],
    });
    const result = proposeCatalogEdits({
      ...defaults(),
      clusters: [cluster],
      dispositions: [{ clusterId: cluster.id, disposition: 'cursed' }],
    });
    const yamlText = yamlStringify({ anti_patterns: [result[0]?.proposed_entry] });
    // Should parse cleanly through the actual registry parser — proves
    // the proposed entry is valid wire-format YAML, not just a JS
    // object that looks YAML-shaped.
    const parsed = parseAntiPatternsRegistry(yamlText, 'test.yaml');
    expect(parsed.entries.length).toBe(1);
    expect(parsed.entries[0]?.id).toBe(cluster.id);
    expect(parsed.entries[0]?.status).toBe('cursed');
    expect(parsed.entries[0]?.provenance.source).toBe('orchestrator-agent');
    expect(parsed.entries[0]?.provenance.authored_at).toBe(DEFAULT_NOW);
  });

  it('produces an adopter-manifests entry that parses via parseAdopterManifestsRegistry', () => {
    const cluster = makeCluster({
      excerpt: 'ac-canonical-primitive',
      files: ['modules/foo-editor/src/Good.tsx', 'modules/foo-editor/src/Better.tsx'],
    });
    const result = proposeCatalogEdits({
      ...defaults(),
      clusters: [cluster],
      dispositions: [{ clusterId: cluster.id, disposition: 'blessed' }],
    });
    const yamlText = yamlStringify({
      adopter_manifests: [result[0]?.proposed_entry],
    });
    const parsed = parseAdopterManifestsRegistry(yamlText, 'test.yaml');
    expect(parsed.entries.length).toBe(1);
    expect(parsed.entries[0]?.id).toBe(cluster.id);
    expect(parsed.entries[0]?.status).toBe('blessed');
    expect(parsed.entries[0]?.provenance.source).toBe('orchestrator-agent');
  });

  it('the ignore disposition produces a status=ignore anti-pattern entry that parses cleanly', () => {
    const cluster = makeCluster({
      excerpt: 'className="false-positive shape"',
      files: ['a.tsx'],
    });
    const result = proposeCatalogEdits({
      ...defaults(),
      clusters: [cluster],
      dispositions: [
        {
          clusterId: cluster.id,
          disposition: 'ignore',
          rationale: 'false-positive shape; operator acknowledged.',
        },
      ],
    });
    expect(result[0]?.catalog_file).toBe('anti-patterns');
    const yamlText = yamlStringify({
      anti_patterns: [result[0]?.proposed_entry],
    });
    const parsed = parseAntiPatternsRegistry(yamlText, 'test.yaml');
    expect(parsed.entries[0]?.status).toBe('ignore');
    expect(parsed.entries[0]?.provenance.context).toBe(
      'false-positive shape; operator acknowledged.',
    );
  });
});

// ---------------------------------------------------------------------------
// Reason field + diff preview
// ---------------------------------------------------------------------------

describe('reason field + diff preview', () => {
  it('reason names the cluster, disposition, and operation chosen', () => {
    const cluster = makeCluster({
      excerpt: 'utility-class shape',
      files: ['a.tsx', 'b.tsx'],
    });
    const result = proposeCatalogEdits({
      ...defaults(),
      clusters: [cluster],
      dispositions: [{ clusterId: cluster.id, disposition: 'cursed' }],
    });
    expect(result[0]?.reason).toContain(cluster.id);
    expect(result[0]?.reason).toContain('cursed');
    expect(result[0]?.reason).toContain('Appending new entry');
  });

  it('reason surfaces the operator rationale when supplied', () => {
    const cluster = makeCluster({ excerpt: 'shape', files: ['a.tsx'] });
    const result = proposeCatalogEdits({
      ...defaults(),
      clusters: [cluster],
      dispositions: [
        {
          clusterId: cluster.id,
          disposition: 'cursed',
          rationale: 'This shape leaks utility classes into design-system surfaces.',
        },
      ],
    });
    expect(result[0]?.reason).toContain(
      'This shape leaks utility classes into design-system surfaces.',
    );
  });

  it('reason for edit operations names the refined entry id', () => {
    const cluster = makeCluster({
      excerpt: 'className="flex"',
      files: ['a.tsx'],
    });
    const result = proposeCatalogEdits({
      ...defaults(),
      clusters: [cluster],
      dispositions: [{ clusterId: cluster.id, disposition: 'cursed' }],
      existingEntries: [
        {
          catalog_file: 'anti-patterns',
          entry_id: 'existing-flex-entry',
          match_regex: /className="flex/,
          status: 'cursed',
        },
      ],
    });
    expect(result[0]?.reason).toContain('Refining existing entry existing-flex-entry');
  });

  it('diff includes the catalog_file path for navigation', () => {
    const cluster = makeCluster({ excerpt: 'shape', files: ['a.tsx'] });
    const result = proposeCatalogEdits({
      ...defaults(),
      clusters: [cluster],
      dispositions: [{ clusterId: cluster.id, disposition: 'cursed' }],
    });
    expect(result[0]?.diff).toContain('.dw-lifecycle/scope-discovery/anti-patterns.yaml');
  });
});

// ---------------------------------------------------------------------------
// Validation — disposition referencing unknown cluster id
// ---------------------------------------------------------------------------

describe('validation', () => {
  it('throws on disposition referencing unknown cluster id', () => {
    const cluster = makeCluster({ excerpt: 'shape', files: ['a.tsx'] });
    expect(() =>
      proposeCatalogEdits({
        ...defaults(),
        clusters: [cluster],
        dispositions: [
          { clusterId: 'cluster-9999', disposition: 'cursed' },
        ],
      }),
    ).toThrow(/unknown cluster id/);
  });

  it('returns empty array when no dispositions are supplied', () => {
    const cluster = makeCluster({ excerpt: 'shape', files: ['a.tsx'] });
    const result = proposeCatalogEdits({
      ...defaults(),
      clusters: [cluster],
      dispositions: [],
    });
    expect(result).toEqual([]);
  });

  it('processes multiple dispositions independently (one cluster → one proposal each)', () => {
    const c1 = makeCluster({ id: 'cluster-0001', excerpt: 'shape-a', files: ['a.tsx'] });
    const c2 = makeCluster({ id: 'cluster-0002', excerpt: 'shape-b', files: ['b.tsx'] });
    const result = proposeCatalogEdits({
      ...defaults(),
      clusters: [c1, c2],
      dispositions: [
        { clusterId: c1.id, disposition: 'cursed' },
        { clusterId: c2.id, disposition: 'blessed' },
      ],
    });
    expect(result.length).toBe(2);
    expect(result[0]?.catalog_file).toBe('anti-patterns');
    expect(result[1]?.catalog_file).toBe('adopter-manifests');
  });

  it('skips clusters with no disposition (operator can triage them later)', () => {
    const c1 = makeCluster({ id: 'cluster-0001', excerpt: 'shape-a', files: ['a.tsx'] });
    const c2 = makeCluster({ id: 'cluster-0002', excerpt: 'shape-b', files: ['b.tsx'] });
    const result = proposeCatalogEdits({
      ...defaults(),
      clusters: [c1, c2],
      dispositions: [{ clusterId: c1.id, disposition: 'cursed' }],
    });
    expect(result.length).toBe(1);
    expect(result[0]?.target_entry_id).toBeNull();
  });
});
