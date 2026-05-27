/**
 * plugins/dw-lifecycle/src/__tests__/scope-discovery/loop-foundation.test.ts
 *
 * Phase 11 Task 2 — The Loop foundation cross-cutting tests. Exercises
 * `status:` + `provenance:` across every registry-driven scanner so
 * the Loop discriminator behaves uniformly:
 *
 *   1. Pre-Loop registries (no `status:` / `provenance:`) parse + the
 *      scanners enforce default-blessed entries.
 *   2. Explicit-status entries parse correctly across all six status
 *      values (pending / blessed / cursed / ignore / tracked-holdout /
 *      withdrawn).
 *   3. Scanners filter non-actively-enforced entries (pending, ignore,
 *      tracked-holdout, withdrawn).
 *   4. The `withdrawn-<finding-id>` reversibility primitive parses +
 *      requires `provenance.context: 'audit-finding-<id>'`.
 *   5. The `catalog-entry-missing-status` doctor rule fires on
 *      registries with entries that omit the `status:` field.
 *   6. clones.yaml's disposition→status mapping is honored.
 *
 * Per testing.md "use fixture project trees on disk, never mock the
 * filesystem" — every test plants real YAMLs in a tmpdir before
 * exercising the parsers + scanners.
 */

import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseRegistry as parseAntiPatternsRegistry } from '../../scope-discovery/anti-patterns-registry.js';
import { parseRegistry as parseAdopterManifestsRegistry } from '../../scope-discovery/adopter-manifests-registry.js';
import { parseClonesYamlStrict } from '../../scope-discovery/clones-yaml.parse.js';
import { dispositionToStatus } from '../../scope-discovery/clones-yaml.js';
import { loadOverridePatterns } from '../../scope-discovery/discovery-agents/pattern-handlers/loader.js';
import {
  filterActiveEntries,
  isActivelyEnforced,
  parseCatalogEntryMetadata,
  synthesizeDefaultProvenance,
  type CatalogStatus,
} from '../../scope-discovery/util/catalog-status.js';
import { check as catalogEntryMissingStatusRule } from '../../scope-discovery/doctor-rules/catalog-entry-missing-status.js';

// ---------------------------------------------------------------------------
// Tmpdir lifecycle — one fresh per test for isolation.
// ---------------------------------------------------------------------------

function makeTmpProject(): { root: string; cleanup: () => void } {
  const root = mkdtempSync(join(tmpdir(), 'loop-foundation-'));
  return {
    root,
    cleanup: () => {
      try {
        rmSync(root, { recursive: true, force: true });
      } catch {
        /* best-effort */
      }
    },
  };
}

function writeRegistry(root: string, relPath: string, content: string): string {
  const path = join(root, relPath);
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, content, 'utf8');
  return path;
}

// ---------------------------------------------------------------------------
// 1) Pre-Loop registries (back-compat) — entries WITHOUT status/provenance
//    parse + receive synthesized defaults.
// ---------------------------------------------------------------------------

describe('Phase 11 Task 2 — pre-Loop registries default to blessed + install-seed provenance', () => {
  it('anti-patterns.yaml: entries without status default to status=blessed', () => {
    const yaml = `
anti_patterns:
  - id: legacy-shape
    added_in: '1234567'
    primitive: useExportDialogLifecycle
    from: '@/hooks/useExportDialogLifecycle'
    shape_regex: 'legacyHook\\('
    message: replace with the primitive
`;
    const reg = parseAntiPatternsRegistry(yaml, '/synthetic/anti-patterns.yaml');
    expect(reg.entries).toHaveLength(1);
    const entry = reg.entries[0];
    expect(entry).toBeDefined();
    if (entry === undefined) return;
    expect(entry.status).toBe('blessed');
    expect(entry.provenance.source).toBe('install-seed');
    expect(entry.provenance.authored_at).toBe('1970-01-01T00:00:00Z');
  });

  it('adopter-manifests.yaml: entries without status default to status=blessed', () => {
    const yaml = `
adopter_manifests:
  - id: editor-symmetry
    introduced_in: '7654321'
    from: '@/components/Card'
    expected_adopters_glob:
      - 'src/editors/**/*.tsx'
    message: adopt the Card primitive
`;
    const reg = parseAdopterManifestsRegistry(yaml, '/synthetic/adopter-manifests.yaml');
    expect(reg.entries).toHaveLength(1);
    const entry = reg.entries[0];
    expect(entry).toBeDefined();
    if (entry === undefined) return;
    expect(entry.status).toBe('blessed');
    expect(entry.provenance.source).toBe('install-seed');
  });

  it('clones.yaml: entries without status derive status from disposition', () => {
    const yaml = `
generated_at: '2026-05-26T00:00:00Z'
clones:
  - id: aaaaaaaaaaaa
    lines: 10
    members:
      - src/a.ts:1:10
      - src/b.ts:1:10
    disposition: pending
    reason: null
  - id: bbbbbbbbbbbb
    lines: 12
    members:
      - src/c.ts:1:12
      - src/d.ts:1:12
    disposition: keep-with-reason
    reason: legitimately duplicated for clarity
`;
    const doc = parseClonesYamlStrict(yaml);
    expect(doc.clones).toHaveLength(2);
    const pending = doc.clones[0];
    const kept = doc.clones[1];
    expect(pending).toBeDefined();
    expect(kept).toBeDefined();
    if (pending === undefined || kept === undefined) return;
    expect(pending.status).toBe('pending');
    expect(kept.status).toBe('blessed');
  });
});

// ---------------------------------------------------------------------------
// 2) Explicit-status entries parse for all six status literals.
// ---------------------------------------------------------------------------

describe('Phase 11 Task 2 — explicit status parses for all six values', () => {
  const allStatuses: ReadonlyArray<CatalogStatus> = [
    'pending',
    'blessed',
    'cursed',
    'ignore',
    'tracked-holdout',
    'withdrawn',
  ];

  it.each(allStatuses)('anti-patterns: status=%s parses successfully', (status) => {
    // `withdrawn` requires provenance.context starting with audit-finding-.
    const provenance =
      status === 'withdrawn'
        ? `
    provenance:
      source: orchestrator-agent
      authored_at: '2026-05-26T00:00:00Z'
      context: 'audit-finding-AUDIT-001'`
        : `
    provenance:
      source: operator-authored
      authored_at: '2026-05-26T00:00:00Z'`;
    // Regex string uses single-quoted YAML so backslashes are literal
    // (no YAML-string escape processing). The regex must compile to
    // /testShape\(/ — one backslash before the paren.
    const yaml = `
anti_patterns:
  - id: test-entry
    added_in: '1234567'
    primitive: useTest
    from: '@/hooks/useTest'
    shape_regex: 'testShape\\('
    message: m
    status: ${status}${provenance}
`;
    const reg = parseAntiPatternsRegistry(yaml, '/synth.yaml');
    const entry = reg.entries[0];
    expect(entry).toBeDefined();
    if (entry === undefined) return;
    expect(entry.status).toBe(status);
  });

  it('rejects unknown status values', () => {
    const yaml = `
anti_patterns:
  - id: test
    added_in: '1234567'
    primitive: x
    from: '@/x'
    shape_regex: 'x'
    message: m
    status: not-a-real-status
`;
    expect(() => parseAntiPatternsRegistry(yaml, '/synth.yaml')).toThrow(
      /`status` must be one of/,
    );
  });
});

// ---------------------------------------------------------------------------
// 3) Scanner filter semantics — `isActivelyEnforced` + `filterActiveEntries`.
// ---------------------------------------------------------------------------

describe('Phase 11 Task 2 — scanner filter semantics', () => {
  it('isActivelyEnforced: blessed + cursed return true; everything else false', () => {
    expect(isActivelyEnforced('blessed')).toBe(true);
    expect(isActivelyEnforced('cursed')).toBe(true);
    expect(isActivelyEnforced('pending')).toBe(false);
    expect(isActivelyEnforced('ignore')).toBe(false);
    expect(isActivelyEnforced('tracked-holdout')).toBe(false);
    expect(isActivelyEnforced('withdrawn')).toBe(false);
  });

  it('filterActiveEntries: returns only blessed + cursed entries', () => {
    const entries: ReadonlyArray<{ id: string; status: CatalogStatus }> = [
      { id: 'a', status: 'blessed' },
      { id: 'b', status: 'cursed' },
      { id: 'c', status: 'pending' },
      { id: 'd', status: 'ignore' },
      { id: 'e', status: 'tracked-holdout' },
      { id: 'f', status: 'withdrawn' },
    ];
    const active = filterActiveEntries(entries);
    const ids = active.map((e) => e.id);
    expect(ids).toEqual(['a', 'b']);
  });

  it('anti-patterns: parsed registry surfaces non-blessed entries; filter drops them', () => {
    const yaml = `
anti_patterns:
  - id: blessed-entry
    added_in: '1234567'
    primitive: p1
    from: '@/p1'
    shape_regex: 'p1'
    message: m
    status: blessed
    provenance:
      source: operator-authored
      authored_at: '2026-05-26T00:00:00Z'
  - id: pending-entry
    added_in: '7654321'
    primitive: p2
    from: '@/p2'
    shape_regex: 'p2'
    message: m
    status: pending
    provenance:
      source: orchestrator-agent
      authored_at: '2026-05-26T00:00:00Z'
  - id: ignore-entry
    added_in: 'abcdef0'
    primitive: p3
    from: '@/p3'
    shape_regex: 'p3'
    message: m
    status: ignore
    provenance:
      source: operator-authored
      authored_at: '2026-05-26T00:00:00Z'
`;
    const reg = parseAntiPatternsRegistry(yaml, '/synth.yaml');
    expect(reg.entries).toHaveLength(3); // unfiltered: all entries parse
    const active = filterActiveEntries(reg.entries);
    expect(active).toHaveLength(1);
    expect(active[0]?.id).toBe('blessed-entry');
  });
});

// ---------------------------------------------------------------------------
// 4) Reversibility primitive — `withdrawn` requires
//    `provenance.context: 'audit-finding-<id>'`.
// ---------------------------------------------------------------------------

describe('Phase 11 Task 2 — withdrawn reversibility primitive', () => {
  it('parses withdrawn with audit-finding-<id> context', () => {
    const yaml = `
anti_patterns:
  - id: overturned
    added_in: '1234567'
    primitive: p
    from: '@/p'
    shape_regex: 'p'
    message: m
    status: withdrawn
    provenance:
      source: orchestrator-agent
      authored_at: '2026-05-26T00:00:00Z'
      context: 'audit-finding-AUDIT-20260526-01'
      evidence_link: 'docs/scope-discovery/audit-log.md#AUDIT-20260526-01'
`;
    const reg = parseAntiPatternsRegistry(yaml, '/synth.yaml');
    const entry = reg.entries[0];
    expect(entry).toBeDefined();
    if (entry === undefined) return;
    expect(entry.status).toBe('withdrawn');
    expect(entry.provenance.context).toBe('audit-finding-AUDIT-20260526-01');
  });

  it('rejects withdrawn without audit-finding context', () => {
    const yaml = `
anti_patterns:
  - id: bad
    added_in: '1234567'
    primitive: p
    from: '@/p'
    shape_regex: 'p'
    message: m
    status: withdrawn
    provenance:
      source: orchestrator-agent
      authored_at: '2026-05-26T00:00:00Z'
`;
    expect(() => parseAntiPatternsRegistry(yaml, '/synth.yaml')).toThrow(
      /`status: withdrawn` requires/,
    );
  });

  it('rejects withdrawn with non-audit-finding context', () => {
    const yaml = `
anti_patterns:
  - id: bad
    added_in: '1234567'
    primitive: p
    from: '@/p'
    shape_regex: 'p'
    message: m
    status: withdrawn
    provenance:
      source: orchestrator-agent
      authored_at: '2026-05-26T00:00:00Z'
      context: 'scan-run-id-12345'
`;
    expect(() => parseAntiPatternsRegistry(yaml, '/synth.yaml')).toThrow(
      /audit-finding-/,
    );
  });

  it('withdrawn entry stays in the registry; preserved-not-deleted invariant', () => {
    // The "preservation" invariant: a withdrawn entry must still
    // appear in `registry.entries` (the registry is the historical
    // record). filterActiveEntries drops it from enforcement; the
    // unfiltered list keeps it.
    const yaml = `
anti_patterns:
  - id: overturned
    added_in: '1234567'
    primitive: p
    from: '@/p'
    shape_regex: 'p'
    message: m
    status: withdrawn
    provenance:
      source: orchestrator-agent
      authored_at: '2026-05-26T00:00:00Z'
      context: 'audit-finding-AUDIT-X'
`;
    const reg = parseAntiPatternsRegistry(yaml, '/synth.yaml');
    expect(reg.entries.map((e) => e.id)).toContain('overturned');
    const active = filterActiveEntries(reg.entries);
    expect(active.map((e) => e.id)).not.toContain('overturned');
  });
});

// ---------------------------------------------------------------------------
// 5) Doctor rule — `catalog-entry-missing-status`.
// ---------------------------------------------------------------------------

describe('Phase 11 Task 2 — catalog-entry-missing-status doctor rule', () => {
  it('fires on anti-patterns entry without explicit status', async () => {
    const { root, cleanup } = makeTmpProject();
    try {
      writeRegistry(
        root,
        '.dw-lifecycle/scope-discovery/anti-patterns.yaml',
        `
anti_patterns:
  - id: no-status
    added_in: '1234567'
    primitive: p
    from: '@/p'
    shape_regex: 'p'
    message: m
`,
      );
      const findings = await catalogEntryMissingStatusRule({ repoRoot: root });
      expect(findings).toHaveLength(1);
      const finding = findings[0];
      expect(finding).toBeDefined();
      if (finding === undefined) return;
      expect(finding.rule).toBe('catalog-entry-missing-status');
      expect(finding.severity).toBe('warning');
      expect(finding.message).toContain('no-status');
      expect(finding.message).toContain('anti-pattern');
    } finally {
      cleanup();
    }
  });

  it('does NOT fire on entries with explicit status', async () => {
    const { root, cleanup } = makeTmpProject();
    try {
      writeRegistry(
        root,
        '.dw-lifecycle/scope-discovery/anti-patterns.yaml',
        `
anti_patterns:
  - id: declared
    added_in: '1234567'
    primitive: p
    from: '@/p'
    shape_regex: 'p'
    message: m
    status: blessed
    provenance:
      source: operator-authored
      authored_at: '2026-05-26T00:00:00Z'
`,
      );
      const findings = await catalogEntryMissingStatusRule({ repoRoot: root });
      expect(findings).toHaveLength(0);
    } finally {
      cleanup();
    }
  });

  it('fires across multiple registries when all have missing-status entries', async () => {
    const { root, cleanup } = makeTmpProject();
    try {
      writeRegistry(
        root,
        '.dw-lifecycle/scope-discovery/anti-patterns.yaml',
        `
anti_patterns:
  - id: a1
    added_in: '1234567'
    primitive: p
    from: '@/p'
    shape_regex: 'p'
    message: m
`,
      );
      writeRegistry(
        root,
        '.dw-lifecycle/scope-discovery/adopter-manifests.yaml',
        `
adopter_manifests:
  - id: am1
    introduced_in: '1234567'
    from: '@/x'
    expected_adopters_glob:
      - 'src/**/*.tsx'
    message: m
`,
      );
      writeRegistry(
        root,
        '.dw-lifecycle/scope-discovery/clones.yaml',
        `
generated_at: '2026-05-26T00:00:00Z'
clones:
  - id: aaaaaaaaaaaa
    lines: 10
    members:
      - src/a.ts:1:10
      - src/b.ts:1:10
    disposition: keep-with-reason
    reason: x
`,
      );
      const findings = await catalogEntryMissingStatusRule({ repoRoot: root });
      // One aggregate finding per registry = 3 findings total.
      expect(findings).toHaveLength(3);
      expect(findings.map((f) => f.message).join('\n')).toContain('a1');
      expect(findings.map((f) => f.message).join('\n')).toContain('am1');
      expect(findings.map((f) => f.message).join('\n')).toContain('aaaaaaaaaaaa');
    } finally {
      cleanup();
    }
  });

  it('produces no findings when the config dir is absent (separate rule covers that)', async () => {
    const { root, cleanup } = makeTmpProject();
    try {
      // Don't create the config dir.
      const findings = await catalogEntryMissingStatusRule({ repoRoot: root });
      expect(findings).toHaveLength(0);
    } finally {
      cleanup();
    }
  });
});

// ---------------------------------------------------------------------------
// 6) clones.yaml disposition→status mapping.
// ---------------------------------------------------------------------------

describe('Phase 11 Task 2 — clones.yaml disposition→status mapping', () => {
  it('maps each disposition to the documented status', () => {
    expect(dispositionToStatus('pending')).toBe('pending');
    expect(dispositionToStatus('keep-with-reason')).toBe('blessed');
    expect(dispositionToStatus('refactor')).toBe('blessed');
    expect(dispositionToStatus('ignore-with-justification')).toBe('ignore');
  });

  it('parses operator-supplied status that overrides the disposition default', () => {
    // Operator opts a `pending` clone into `tracked-holdout` to keep
    // it visible but out of enforcement.
    const yaml = `
generated_at: '2026-05-26T00:00:00Z'
clones:
  - id: aaaaaaaaaaaa
    lines: 10
    members:
      - src/a.ts:1:10
      - src/b.ts:1:10
    disposition: pending
    reason: null
    status: tracked-holdout
    provenance:
      source: operator-authored
      authored_at: '2026-05-26T00:00:00Z'
      context: 'tracking: gh-issue-#999'
`;
    const doc = parseClonesYamlStrict(yaml);
    const entry = doc.clones[0];
    expect(entry).toBeDefined();
    if (entry === undefined) return;
    expect(entry.disposition).toBe('pending');
    expect(entry.status).toBe('tracked-holdout'); // operator's override wins
  });
});

// ---------------------------------------------------------------------------
// 7) pattern-matrix override loader — Loop fields plumbed through.
// ---------------------------------------------------------------------------

describe('Phase 11 Task 2 — pattern-matrix override loader applies Loop fields', () => {
  it('parses status + provenance on each pattern variant', async () => {
    const { root, cleanup } = makeTmpProject();
    try {
      writeRegistry(
        root,
        '.dw-lifecycle/scope-discovery/pattern-matrix-patterns.yaml',
        `
patterns:
  - type: regex
    id: legacy-cast
    description: legacy as-cast
    regex: '\\\\bas\\\\s+[A-Z]'
    status: blessed
    provenance:
      source: operator-authored
      authored_at: '2026-05-26T00:00:00Z'
  - type: negative-space
    id: editor-no-canon
    description: editor file with zero canonical
    match_glob: 'src/editors/**/*.tsx'
    must_contain: 'ac-[a-z]+'
    status: pending
    provenance:
      source: orchestrator-agent
      authored_at: '2026-05-26T00:00:00Z'
      context: 'scan-run-id-r-001'
`,
      );
      const patterns = await loadOverridePatterns(root);
      expect(patterns).not.toBeNull();
      if (patterns === null) return;
      expect(patterns).toHaveLength(2);
      const regex = patterns[0];
      const negSpace = patterns[1];
      expect(regex).toBeDefined();
      expect(negSpace).toBeDefined();
      if (regex === undefined || negSpace === undefined) return;
      expect(regex.status).toBe('blessed');
      expect(regex.provenance.source).toBe('operator-authored');
      expect(negSpace.status).toBe('pending');
      expect(negSpace.provenance.source).toBe('orchestrator-agent');
      expect(negSpace.provenance.context).toBe('scan-run-id-r-001');
    } finally {
      cleanup();
    }
  });

  it('synthesizes defaults when override entries omit Loop fields', async () => {
    const { root, cleanup } = makeTmpProject();
    try {
      writeRegistry(
        root,
        '.dw-lifecycle/scope-discovery/pattern-matrix-patterns.yaml',
        `
patterns:
  - type: regex
    id: legacy-cast
    description: legacy as-cast
    regex: '\\\\bas\\\\s+[A-Z]'
`,
      );
      const patterns = await loadOverridePatterns(root);
      expect(patterns).not.toBeNull();
      if (patterns === null) return;
      const entry = patterns[0];
      expect(entry).toBeDefined();
      if (entry === undefined) return;
      expect(entry.status).toBe('blessed');
      expect(entry.provenance.source).toBe('install-seed');
    } finally {
      cleanup();
    }
  });
});

// ---------------------------------------------------------------------------
// 8) parseCatalogEntryMetadata helper unit tests.
// ---------------------------------------------------------------------------

describe('Phase 11 Task 2 — parseCatalogEntryMetadata helper', () => {
  it('synthesizes both defaults on empty input', () => {
    const result = parseCatalogEntryMetadata({}, 'test-ctx', 'test-ns');
    expect(result.statusSynthesized).toBe(true);
    expect(result.provenanceSynthesized).toBe(true);
    expect(result.metadata.status).toBe('blessed');
    expect(result.metadata.provenance.source).toBe('install-seed');
  });

  it('parses explicit status + provenance', () => {
    const result = parseCatalogEntryMetadata(
      {
        status: 'pending',
        provenance: {
          source: 'orchestrator-agent',
          authored_at: '2026-05-26T00:00:00Z',
          authored_by: 'agent-1',
          context: 'scan-run-id-r-002',
          evidence_link: 'docs/x.md',
        },
      },
      'test-ctx',
      'test-ns',
    );
    expect(result.statusSynthesized).toBe(false);
    expect(result.provenanceSynthesized).toBe(false);
    expect(result.metadata.status).toBe('pending');
    expect(result.metadata.provenance.source).toBe('orchestrator-agent');
    expect(result.metadata.provenance.authored_by).toBe('agent-1');
    expect(result.metadata.provenance.context).toBe('scan-run-id-r-002');
    expect(result.metadata.provenance.evidence_link).toBe('docs/x.md');
  });

  it('rejects malformed provenance.source', () => {
    expect(() =>
      parseCatalogEntryMetadata(
        {
          status: 'blessed',
          provenance: {
            source: 'not-a-source',
            authored_at: '2026-05-26T00:00:00Z',
          },
        },
        'test-ctx',
        'test-ns',
      ),
    ).toThrow(/`provenance.source` must be one of/);
  });

  it('rejects provenance missing authored_at', () => {
    expect(() =>
      parseCatalogEntryMetadata(
        {
          status: 'blessed',
          provenance: { source: 'operator-authored' },
        },
        'test-ctx',
        'test-ns',
      ),
    ).toThrow(/`provenance.authored_at`/);
  });

  it('synthesizeDefaultProvenance returns install-seed + epoch', () => {
    const prov = synthesizeDefaultProvenance();
    expect(prov.source).toBe('install-seed');
    expect(prov.authored_at).toBe('1970-01-01T00:00:00Z');
  });
});
