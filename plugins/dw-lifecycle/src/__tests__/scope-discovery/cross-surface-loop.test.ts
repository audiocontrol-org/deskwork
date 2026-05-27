/**
 * plugins/dw-lifecycle/src/__tests__/scope-discovery/cross-surface-loop.test.ts
 *
 * Phase 11 Task 11 — cross-surface uniformity tests for The Loop's
 * status + provenance discriminators. Verifies that the Loop fields
 * behave UNIFORMLY across every registry-driven scanner:
 *
 *   anti-patterns, adopter-manifests, editor-symmetry,
 *   regime-holdout-detector, pattern-matrix (override loader),
 *   clones.yaml (disposition→status mapping)
 *
 * The uniformity contract has three load-bearing properties:
 *
 *   A. `blessed` + `cursed` entries enforce (scanners produce findings).
 *   B. `pending` entries surface as candidates but DO NOT gate
 *      (the orchestrator-agent uses them for triage; per Phase 11
 *      Task 3 they become operator-readable architectural summaries).
 *   C. `ignore` / `tracked-holdout` / `withdrawn` entries are
 *      SUPPRESSED — they never produce findings or matrix rows
 *      regardless of source.
 *
 * The cross-surface test asserts these properties hold the same way
 * for every scanner; a regression in any one scanner that re-enables
 * suppressed entries (or that drops the per-finding `status_provenance`
 * link) breaks a uniform invariant the orchestrator-agent relies on.
 *
 * Per testing.md "use fixture project trees on disk, never mock the
 * filesystem" — every test plants real YAMLs in a tmpdir before
 * exercising the parsers + scanners.
 */

import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  parseRegistry as parseAntiPatternsRegistry,
  type AntiPatternEntry,
} from '../../scope-discovery/anti-patterns-registry.js';
import {
  parseRegistry as parseAdopterManifestsRegistry,
  type AdopterManifestEntry,
} from '../../scope-discovery/adopter-manifests-registry.js';
import { parseClonesYamlStrict } from '../../scope-discovery/clones-yaml.parse.js';
import { loadOverridePatterns } from '../../scope-discovery/discovery-agents/pattern-handlers/loader.js';
import { scan as scanAntiPatterns } from '../../scope-discovery/check-anti-patterns.js';
import { scan as scanAdopters } from '../../scope-discovery/check-adopters.js';
import { computeMatrix } from '../../scope-discovery/editor-symmetry-matrix.js';
import { detectRegimeHoldouts } from '../../scope-discovery/discovery-agents/regime-holdout-detector.js';
import {
  filterActiveEntries,
  isActivelyEnforced,
  type CatalogStatus,
} from '../../scope-discovery/util/catalog-status.js';

// ---------------------------------------------------------------------------
// Tmpdir lifecycle.
// ---------------------------------------------------------------------------

interface TmpProject {
  readonly root: string;
  readonly cleanup: () => void;
}

function makeTmpProject(): TmpProject {
  const root = mkdtempSync(join(tmpdir(), 'cross-surface-'));
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

function writeFileEnsuringDirs(root: string, relPath: string, content: string): string {
  const path = join(root, relPath);
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, content, 'utf8');
  return path;
}

/**
 * Plant a `.dw-lifecycle/scope-discovery/` config dir containing one
 * registry-driven catalog per source bucket. Every catalog includes a
 * mix of statuses so the cross-surface assertions can verify uniform
 * filter behavior.
 *
 * Returns the full set of registry paths so individual tests can
 * choose which to read.
 */
function plantUniformRegistries(root: string): {
  antiPatternsPath: string;
  adopterManifestsPath: string;
  clonesPath: string;
  patternMatrixPath: string;
} {
  const antiPatternsPath = writeFileEnsuringDirs(
    root,
    '.dw-lifecycle/scope-discovery/anti-patterns.yaml',
    `
anti_patterns:
  - id: blessed-ap
    added_in: '1234567'
    primitive: useFoo
    from: '@/hooks/useFoo'
    shape_regex: 'legacyFoo\\('
    message: replace with useFoo
    status: blessed
    provenance:
      source: operator-authored
      authored_at: '2026-05-26T00:00:00Z'
  - id: cursed-ap
    added_in: '2345678'
    primitive: useBar
    from: '@/hooks/useBar'
    shape_regex: 'legacyBar\\('
    message: replace with useBar
    status: cursed
    provenance:
      source: orchestrator-agent
      authored_at: '2026-05-26T00:00:00Z'
  - id: pending-ap
    added_in: '3456789'
    primitive: useBaz
    from: '@/hooks/useBaz'
    shape_regex: 'legacyBaz\\('
    message: replace with useBaz
    status: pending
    provenance:
      source: orchestrator-agent
      authored_at: '2026-05-26T00:00:00Z'
      context: 'scan-run-id-r-001'
  - id: ignore-ap
    added_in: '4567890'
    primitive: useQux
    from: '@/hooks/useQux'
    shape_regex: 'legacyQux\\('
    message: replace with useQux
    status: ignore
    provenance:
      source: operator-authored
      authored_at: '2026-05-26T00:00:00Z'
  - id: withdrawn-ap
    added_in: '5678901'
    primitive: useWab
    from: '@/hooks/useWab'
    shape_regex: 'legacyWab\\('
    message: replace with useWab
    status: withdrawn
    provenance:
      source: orchestrator-agent
      authored_at: '2026-05-26T00:00:00Z'
      context: 'audit-finding-AUDIT-20260526-01'
      evidence_link: 'docs/scope-discovery/audit-log.md#AUDIT-20260526-01'
`,
  );

  const adopterManifestsPath = writeFileEnsuringDirs(
    root,
    '.dw-lifecycle/scope-discovery/adopter-manifests.yaml',
    `
adopter_manifests:
  - id: blessed-am
    introduced_in: '1234567'
    from: '@/components/Card'
    expected_adopters_glob:
      - 'src/editors/**/*.tsx'
    message: adopt the Card primitive
    status: blessed
    provenance:
      source: operator-authored
      authored_at: '2026-05-26T00:00:00Z'
  - id: pending-am
    introduced_in: '2345678'
    from: '@/components/Drawer'
    expected_adopters_glob:
      - 'src/editors/**/*.tsx'
    message: adopt the Drawer primitive
    status: pending
    provenance:
      source: orchestrator-agent
      authored_at: '2026-05-26T00:00:00Z'
      context: 'scan-run-id-r-002'
  - id: ignore-am
    introduced_in: '3456789'
    from: '@/components/Banner'
    expected_adopters_glob:
      - 'src/editors/**/*.tsx'
    message: adopt the Banner primitive
    status: ignore
    provenance:
      source: operator-authored
      authored_at: '2026-05-26T00:00:00Z'
  - id: withdrawn-am
    introduced_in: '4567890'
    from: '@/components/Footer'
    expected_adopters_glob:
      - 'src/editors/**/*.tsx'
    message: adopt the Footer primitive
    status: withdrawn
    provenance:
      source: orchestrator-agent
      authored_at: '2026-05-26T00:00:00Z'
      context: 'audit-finding-AUDIT-20260526-02'
`,
  );

  const clonesPath = writeFileEnsuringDirs(
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
    reason: legitimately duplicated
  - id: bbbbbbbbbbbb
    lines: 12
    members:
      - src/c.ts:1:12
      - src/d.ts:1:12
    disposition: pending
    reason: null
  - id: cccccccccccc
    lines: 8
    members:
      - src/e.ts:1:8
      - src/f.ts:1:8
    disposition: ignore-with-justification
    reason: test fixture
`,
  );

  const patternMatrixPath = writeFileEnsuringDirs(
    root,
    '.dw-lifecycle/scope-discovery/pattern-matrix-patterns.yaml',
    `
patterns:
  - type: regex
    id: blessed-pm
    description: blessed pattern
    regex: '\\bas\\s+[A-Z]'
    status: blessed
    provenance:
      source: operator-authored
      authored_at: '2026-05-26T00:00:00Z'
  - type: regex
    id: pending-pm
    description: pending pattern
    regex: ':\\s*any\\b'
    status: pending
    provenance:
      source: orchestrator-agent
      authored_at: '2026-05-26T00:00:00Z'
      context: 'scan-run-id-r-003'
  - type: regex
    id: ignore-pm
    description: ignored pattern
    regex: '@ts-(?:ignore|expect-error)'
    status: ignore
    provenance:
      source: operator-authored
      authored_at: '2026-05-26T00:00:00Z'
  - type: regex
    id: withdrawn-pm
    description: withdrawn pattern
    regex: '\\d{4,}'
    status: withdrawn
    provenance:
      source: orchestrator-agent
      authored_at: '2026-05-26T00:00:00Z'
      context: 'audit-finding-AUDIT-20260526-03'
`,
  );

  return {
    antiPatternsPath,
    adopterManifestsPath,
    clonesPath,
    patternMatrixPath,
  };
}

// ---------------------------------------------------------------------------
// 1) Property A — `blessed` + `cursed` enforce uniformly across every parser.
// ---------------------------------------------------------------------------

describe('Phase 11 Task 11 — actively-enforced entries enforce uniformly', () => {
  it('every parser surfaces blessed + cursed entries in the active subset', async () => {
    const { root, cleanup } = makeTmpProject();
    try {
      const { antiPatternsPath, adopterManifestsPath, clonesPath } =
        plantUniformRegistries(root);

      // anti-patterns
      const apReg = parseAntiPatternsRegistry(
        readFileSync(antiPatternsPath, 'utf8'),
        antiPatternsPath,
      );
      const apActive = filterActiveEntries(apReg.entries);
      const apActiveIds = apActive.map((e: AntiPatternEntry) => e.id);
      expect(apActiveIds.sort()).toEqual(['blessed-ap', 'cursed-ap']);

      // adopter-manifests (no `cursed` fixture here; blessed-only is the
      // active set for this registry).
      const amReg = parseAdopterManifestsRegistry(
        readFileSync(adopterManifestsPath, 'utf8'),
        adopterManifestsPath,
      );
      const amActive = filterActiveEntries(amReg.entries);
      const amActiveIds = amActive.map((e: AdopterManifestEntry) => e.id);
      expect(amActiveIds).toEqual(['blessed-am']);

      // clones.yaml — `keep-with-reason` maps to `blessed`.
      const clonesDoc = parseClonesYamlStrict(readFileSync(clonesPath, 'utf8'));
      const clonesActive = filterActiveEntries(clonesDoc.clones);
      const clonesActiveIds = clonesActive.map((g) => g.id);
      expect(clonesActiveIds).toEqual(['aaaaaaaaaaaa']);

      // pattern-matrix override
      const patterns = await loadOverridePatterns(root);
      expect(patterns).not.toBeNull();
      if (patterns === null) return;
      const pmActive = filterActiveEntries(patterns);
      const pmActiveIds = pmActive.map((p) => p.id);
      expect(pmActiveIds).toEqual(['blessed-pm']);
    } finally {
      cleanup();
    }
  });

  it('isActivelyEnforced predicate is uniform across every status literal', () => {
    const allStatuses: ReadonlyArray<CatalogStatus> = [
      'pending',
      'blessed',
      'cursed',
      'ignore',
      'tracked-holdout',
      'withdrawn',
    ];
    for (const s of allStatuses) {
      const expected = s === 'blessed' || s === 'cursed';
      expect(isActivelyEnforced(s), `${s} should be ${expected}`).toBe(expected);
    }
  });
});

// ---------------------------------------------------------------------------
// 2) Property B — `pending` entries parse + are visible to the orchestrator
//    but DO NOT produce gate-blocking findings.
// ---------------------------------------------------------------------------

describe('Phase 11 Task 11 — pending entries surface as candidates, not gate findings', () => {
  it('parses pending entries on every registry; filterActiveEntries excludes them', async () => {
    const { root, cleanup } = makeTmpProject();
    try {
      const { antiPatternsPath, adopterManifestsPath } =
        plantUniformRegistries(root);

      const apReg = parseAntiPatternsRegistry(
        readFileSync(antiPatternsPath, 'utf8'),
        antiPatternsPath,
      );
      // pending-ap is in the registry but filtered out of active.
      expect(apReg.entries.map((e) => e.id)).toContain('pending-ap');
      const apActive = filterActiveEntries(apReg.entries);
      expect(apActive.map((e) => e.id)).not.toContain('pending-ap');

      const amReg = parseAdopterManifestsRegistry(
        readFileSync(adopterManifestsPath, 'utf8'),
        adopterManifestsPath,
      );
      expect(amReg.entries.map((e) => e.id)).toContain('pending-am');
      const amActive = filterActiveEntries(amReg.entries);
      expect(amActive.map((e) => e.id)).not.toContain('pending-am');

      const patterns = await loadOverridePatterns(root);
      expect(patterns).not.toBeNull();
      if (patterns === null) return;
      expect(patterns.map((p) => p.id)).toContain('pending-pm');
      const pmActive = filterActiveEntries(patterns);
      expect(pmActive.map((p) => p.id)).not.toContain('pending-pm');
    } finally {
      cleanup();
    }
  });
});

// ---------------------------------------------------------------------------
// 3) Property C — `ignore` / `tracked-holdout` / `withdrawn` entries are
//    SUPPRESSED uniformly. The withdrawn case also exercises the
//    audit-log linkage invariant.
// ---------------------------------------------------------------------------

describe('Phase 11 Task 11 — suppressed statuses never enforce', () => {
  it('ignore + withdrawn are present in registry but filtered from active set', async () => {
    const { root, cleanup } = makeTmpProject();
    try {
      const { antiPatternsPath, adopterManifestsPath } =
        plantUniformRegistries(root);

      const apReg = parseAntiPatternsRegistry(
        readFileSync(antiPatternsPath, 'utf8'),
        antiPatternsPath,
      );
      const apIds = apReg.entries.map((e) => e.id);
      expect(apIds).toContain('ignore-ap');
      expect(apIds).toContain('withdrawn-ap');
      const apActive = filterActiveEntries(apReg.entries);
      const apActiveIds = apActive.map((e) => e.id);
      expect(apActiveIds).not.toContain('ignore-ap');
      expect(apActiveIds).not.toContain('withdrawn-ap');

      const amReg = parseAdopterManifestsRegistry(
        readFileSync(adopterManifestsPath, 'utf8'),
        adopterManifestsPath,
      );
      const amIds = amReg.entries.map((e) => e.id);
      expect(amIds).toContain('ignore-am');
      expect(amIds).toContain('withdrawn-am');
      const amActive = filterActiveEntries(amReg.entries);
      const amActiveIds = amActive.map((e) => e.id);
      expect(amActiveIds).not.toContain('ignore-am');
      expect(amActiveIds).not.toContain('withdrawn-am');
    } finally {
      cleanup();
    }
  });

  it('withdrawn-<finding-id> carries the audit-finding context linkage on every registry', async () => {
    const { root, cleanup } = makeTmpProject();
    try {
      const { antiPatternsPath, adopterManifestsPath, patternMatrixPath } =
        plantUniformRegistries(root);

      const apReg = parseAntiPatternsRegistry(
        readFileSync(antiPatternsPath, 'utf8'),
        antiPatternsPath,
      );
      const apWithdrawn = apReg.entries.find((e) => e.id === 'withdrawn-ap');
      expect(apWithdrawn).toBeDefined();
      if (apWithdrawn === undefined) return;
      expect(apWithdrawn.status).toBe('withdrawn');
      expect(apWithdrawn.provenance.context).toBeDefined();
      expect(apWithdrawn.provenance.context?.startsWith('audit-finding-')).toBe(true);

      const amReg = parseAdopterManifestsRegistry(
        readFileSync(adopterManifestsPath, 'utf8'),
        adopterManifestsPath,
      );
      const amWithdrawn = amReg.entries.find((e) => e.id === 'withdrawn-am');
      expect(amWithdrawn).toBeDefined();
      if (amWithdrawn === undefined) return;
      expect(amWithdrawn.status).toBe('withdrawn');
      expect(amWithdrawn.provenance.context?.startsWith('audit-finding-')).toBe(true);

      // pattern-matrix
      const patterns = await loadOverridePatterns(root);
      expect(patterns).not.toBeNull();
      if (patterns === null) return;
      const pmWithdrawn = patterns.find((p) => p.id === 'withdrawn-pm');
      expect(pmWithdrawn).toBeDefined();
      if (pmWithdrawn === undefined) return;
      expect(pmWithdrawn.status).toBe('withdrawn');
      expect(pmWithdrawn.provenance.context?.startsWith('audit-finding-')).toBe(true);

      // The patternMatrixPath is asserted-on indirectly via
      // loadOverridePatterns; it appears here so the helper signature
      // stays uniform with the other registries.
      expect(patternMatrixPath.length).toBeGreaterThan(0);
    } finally {
      cleanup();
    }
  });
});

// ---------------------------------------------------------------------------
// 4) End-to-end scanner behavior — anti-pattern + adopter scanners
//    produce findings ONLY for blessed/cursed entries; the matching
//    findings inherit the catalog entry verbatim (status accessible).
// ---------------------------------------------------------------------------

describe('Phase 11 Task 11 — scanners filter on status at the registry boundary', () => {
  it('anti-pattern scanner: blessed/cursed entries fire; pending/ignore/withdrawn skipped', async () => {
    const { root, cleanup } = makeTmpProject();
    try {
      const { antiPatternsPath } = plantUniformRegistries(root);

      // Plant source files matching each of the five regexes. Use
      // distinct content per entry to avoid cross-matching.
      const srcDir = join(root, 'src');
      mkdirSync(srcDir, { recursive: true });
      writeFileSync(
        join(srcDir, 'foo.ts'),
        'export const x = legacyFoo();\n',
        'utf8',
      );
      writeFileSync(
        join(srcDir, 'bar.ts'),
        'export const x = legacyBar();\n',
        'utf8',
      );
      writeFileSync(
        join(srcDir, 'baz.ts'),
        'export const x = legacyBaz();\n',
        'utf8',
      );
      writeFileSync(
        join(srcDir, 'qux.ts'),
        'export const x = legacyQux();\n',
        'utf8',
      );
      writeFileSync(
        join(srcDir, 'wab.ts'),
        'export const x = legacyWab();\n',
        'utf8',
      );

      const result = await scanAntiPatterns({
        registryPath: antiPatternsPath,
        scanRoot: srcDir,
        quiet: true,
        json: true,
        gateMode: false,
      });
      const finalIds = result.findings.map((f) => f.entry.id).sort();
      expect(finalIds).toEqual(['blessed-ap', 'cursed-ap']);
      // The active entry count matches: 5 total → 2 actively-enforced
      // (blessed + cursed); the other 3 statuses are filtered.
      expect(result.entriesScanned).toBe(2);
    } finally {
      cleanup();
    }
  });

  it('adopter scanner: pending/ignore/withdrawn manifests are not scanned', async () => {
    const { root, cleanup } = makeTmpProject();
    try {
      const { adopterManifestsPath } = plantUniformRegistries(root);

      // Plant editor source that does NOT import any canonical primitive
      // (would be a holdout for every active manifest).
      const editorDir = join(root, 'src', 'editors', 'roland');
      mkdirSync(editorDir, { recursive: true });
      writeFileSync(
        join(editorDir, 'Sample.tsx'),
        'export const Sample = () => null;\n',
        'utf8',
      );

      const result = await scanAdopters({
        registryPath: adopterManifestsPath,
        scanRoot: root,
        quiet: true,
        json: true,
        gateMode: false,
      });
      // Only the blessed manifest scanned (4 total → 1 active).
      expect(result.entriesScanned).toBe(1);
      expect(result.manifests).toHaveLength(1);
      const m = result.manifests[0];
      expect(m).toBeDefined();
      if (m === undefined) return;
      expect(m.entry.id).toBe('blessed-am');
    } finally {
      cleanup();
    }
  });

  it('editor-symmetry matrix: only blessed/cursed adopter-manifest rows surface', async () => {
    const { root, cleanup } = makeTmpProject();
    try {
      const { adopterManifestsPath } = plantUniformRegistries(root);

      // Plant a module so discoverEditors finds something. The matrix's
      // row count is independent of editors discovered — what matters is
      // which adopter-manifest entries become rows.
      const editorDir = join(root, 'src', 'roland');
      mkdirSync(editorDir, { recursive: true });
      writeFileSync(
        join(editorDir, 'placeholder.tsx'),
        'export const x = null;\n',
        'utf8',
      );

      const matrix = await computeMatrix({
        registryPath: adopterManifestsPath,
        scanRoot: root,
        moduleRoot: 'src',
      });
      // 4 entries total, 1 active (blessed-am). The matrix has exactly
      // one row.
      expect(matrix.rows).toHaveLength(1);
      const row = matrix.rows[0];
      expect(row).toBeDefined();
      if (row === undefined) return;
      expect(row.entry.id).toBe('blessed-am');
      expect(row.status).toBe('blessed');
    } finally {
      cleanup();
    }
  });
});

// ---------------------------------------------------------------------------
// 5) regime-holdout-detector — surfaces `status_provenance` on every
//    finding; meta counts honor the per-status rollup.
// ---------------------------------------------------------------------------

describe('Phase 11 Task 11 — regime-holdout-detector status_provenance is uniform', () => {
  it('every finding carries status_provenance linked back to its catalog entry', async () => {
    const { root, cleanup } = makeTmpProject();
    try {
      plantUniformRegistries(root);

      // Plant a source file that matches blessed-ap's regex; ensure at
      // least one anti-pattern finding flows through to the detector.
      const moduleDir = join(root, 'src', 'roland');
      mkdirSync(moduleDir, { recursive: true });
      writeFileSync(
        join(moduleDir, 'Hit.tsx'),
        'export const x = legacyFoo();\n',
        'utf8',
      );

      const findings = await detectRegimeHoldouts({
        featureSlug: 'cross-surface-test',
        prdPath: 'irrelevant',
        repoRoot: root,
        moduleRoot: 'src',
      });

      // At minimum the anti-pattern finding should surface.
      expect(findings.findings.length).toBeGreaterThanOrEqual(1);
      const apHit = findings.findings.find((f) => f.source === 'anti-pattern');
      expect(apHit).toBeDefined();
      if (apHit === undefined) return;
      // status_provenance present and traces back to blessed-ap.
      expect(apHit.status_provenance).toBeDefined();
      expect(apHit.status_provenance.source_status).toBe('blessed');
      expect(apHit.status_provenance.provenance_source).toBe('operator-authored');

      // EVERY finding has status_provenance — the wire-shape invariant.
      for (const f of findings.findings) {
        expect(f.status_provenance).toBeDefined();
        // source_status is always a known literal — no `undefined` leak.
        expect([
          'pending',
          'blessed',
          'cursed',
          'ignore',
          'tracked-holdout',
          'withdrawn',
        ]).toContain(f.status_provenance.source_status);
        expect([
          'operator-authored',
          'orchestrator-agent',
          'llm-judge-proposed',
          'install-seed',
          'promoted-from-candidate',
        ]).toContain(f.status_provenance.provenance_source);
      }
    } finally {
      cleanup();
    }
  });

  it('meta.actively_enforced_count + candidate_count rollup is honored', async () => {
    const { root, cleanup } = makeTmpProject();
    try {
      plantUniformRegistries(root);

      const moduleDir = join(root, 'src', 'roland');
      mkdirSync(moduleDir, { recursive: true });
      writeFileSync(
        join(moduleDir, 'Hit.tsx'),
        'export const x = legacyFoo();\n',
        'utf8',
      );

      const findings = await detectRegimeHoldouts({
        featureSlug: 'cross-surface-test',
        prdPath: 'irrelevant',
        repoRoot: root,
        moduleRoot: 'src',
      });

      // Every surfaced finding is `blessed`/`cursed` (the scanner
      // filters upstream). actively_enforced_count must equal the
      // total finding count; candidate_count must be 0 (no `pending`
      // entry produces findings).
      expect(findings.meta.actively_enforced_count).toBe(
        findings.meta.total,
      );
      expect(findings.meta.candidate_count).toBe(0);
      // The candidate_count would only ever be non-zero if a scanner
      // is intentionally leaking `pending` entries (e.g., the future
      // orchestrator-agent surface). This assertion is the regression
      // gate: a scanner change that re-enables pending entries breaks
      // here.
    } finally {
      cleanup();
    }
  });

  it('suppressed-status entries (ignore/withdrawn) never surface as findings', async () => {
    const { root, cleanup } = makeTmpProject();
    try {
      plantUniformRegistries(root);

      const moduleDir = join(root, 'src', 'roland');
      mkdirSync(moduleDir, { recursive: true });
      // Plant source files matching ALL of the anti-pattern entries —
      // including the suppressed ones (ignore-ap, withdrawn-ap). If
      // the scanner were misfiltering, these would surface as findings.
      writeFileSync(
        join(moduleDir, 'Foo.tsx'),
        'export const x = legacyFoo();\n',
        'utf8',
      );
      writeFileSync(
        join(moduleDir, 'Bar.tsx'),
        'export const x = legacyBar();\n',
        'utf8',
      );
      writeFileSync(
        join(moduleDir, 'Baz.tsx'),
        'export const x = legacyBaz();\n',
        'utf8',
      );
      writeFileSync(
        join(moduleDir, 'Qux.tsx'),
        'export const x = legacyQux();\n',
        'utf8',
      );
      writeFileSync(
        join(moduleDir, 'Wab.tsx'),
        'export const x = legacyWab();\n',
        'utf8',
      );

      const findings = await detectRegimeHoldouts({
        featureSlug: 'cross-surface-test',
        prdPath: 'irrelevant',
        repoRoot: root,
        moduleRoot: 'src',
      });

      const apIds = findings.findings
        .filter((f) => f.source === 'anti-pattern')
        .map((f) => f.id);
      // blessed-ap + cursed-ap should fire (one finding each).
      expect(apIds).toContain('blessed-ap');
      expect(apIds).toContain('cursed-ap');
      // pending-ap, ignore-ap, withdrawn-ap should be absent.
      expect(apIds).not.toContain('pending-ap');
      expect(apIds).not.toContain('ignore-ap');
      expect(apIds).not.toContain('withdrawn-ap');
    } finally {
      cleanup();
    }
  });
});
