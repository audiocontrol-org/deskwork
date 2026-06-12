// specs/014 US7 (TASK-24 / 013 D5; gh-442 follow-up): scope-discovery +
// doctor consumers must route feature-file resolution through the
// layout-aware resolveFeatureRoot — no consumer constructs the legacy
// `docs/1.0/001-IN-PROGRESS/<slug>` path itself (FR-010).
//
// The recorded gh-442 instance: a widen against a `specs/NNN-slug`
// feature (with explicit --manifest/--prd-path) recreated a `docs/`
// tree just to hold its EVIDENCE dirs. The two CLIs' default
// --prd-path/--manifest, the inventory/widen run-dirs, scope-export's
// default manifest path, and the provenance doctor rule's audit-log
// walk all hardcoded the legacy layout. Legacy-layout resolution must
// stay byte-compatible (FR-011).

import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stringify as stringifyYaml } from 'yaml';
import { scopeWidenMain } from '../scope-discovery/scope-widen.js';
import { scopeInventoryMain } from '../scope-discovery/scope-inventory.js';
import { main as scopeExportMain } from '../scope-discovery/scope-export.js';
import { synthesize } from '../scope-discovery/synthesis.js';
import { check as provenanceCheck } from '../scope-discovery/doctor-rules/provenance-orphaned-entries.js';
import type { DiscoveryAgentFinding } from '../scope-discovery/discovery-agents/types.js';

const SLUG = 'widen-fixture';

const PRD = [
  '# Feature: widen-fixture',
  '',
  '## Overview',
  '',
  'The widget module is the surface. widget widget widget.',
  '',
].join('\n');

const EMPTY_CLONES =
  'schemaVersion: 1\ngenerated_at: "2026-06-10T00:00:00Z"\nclones: []\n';

interface Fixture {
  readonly root: string;
  /** The feature root for the chosen layout. */
  readonly featureRoot: string;
  readonly prdPath: string;
  readonly manifestPath: string;
  cleanup(): Promise<void>;
}

async function makeFixture(layout: 'speckit' | 'legacy-docs'): Promise<Fixture> {
  const root = await mkdtemp(join(tmpdir(), `layout-${layout}-`));
  const featureRoot =
    layout === 'speckit'
      ? join(root, 'specs', `001-${SLUG}`)
      : join(root, 'docs', '1.0', '001-IN-PROGRESS', SLUG);
  await mkdir(featureRoot, { recursive: true });
  const prdPath = join(featureRoot, 'prd.md');
  await writeFile(prdPath, PRD, 'utf8');

  const widgetDir = join(root, 'src', 'widget');
  await mkdir(widgetDir, { recursive: true });
  // `as Foo` feeds the pattern-matrix; `widget` tokens feed the
  // PRD-themed hunter (signal for synthesis with zero clones).
  await writeFile(
    join(widgetDir, 'a.ts'),
    'export const widget = (x: unknown) => x as Foo;\n',
    'utf8',
  );
  await writeFile(
    join(widgetDir, 'b.ts'),
    'export const widgetCount = 2; // widget helper\n',
    'utf8',
  );

  const sdDir = join(root, '.stack-control', 'scope-discovery');
  await mkdir(sdDir, { recursive: true });
  await writeFile(join(sdDir, 'clones.yaml'), EMPTY_CLONES, 'utf8');

  const priorFindings: ReadonlyArray<DiscoveryAgentFinding> = [
    {
      agent: 'prd-themed-pattern-hunter',
      featureSlug: SLUG,
      themes: [
        {
          term: 'widget',
          occurrences: [{ file: 'src/widget/a.ts', line: 1, snippet: 'widget' }],
        },
      ],
    },
    {
      agent: 'ast-grep-matrix',
      featureSlug: SLUG,
      patterns: [
        {
          id: 'as-type-cast',
          description: 'as-cast bypassing the type system',
          regex: '\\bas\\s+[A-Z]',
          hits: [{ file: 'src/widget/a.ts', line: 1, snippet: 'x as Foo' }],
        },
      ],
    },
  ];
  const priorOut = await synthesize({
    featureSlug: SLUG,
    findings: priorFindings,
    prdPath,
    prdRelPath: 'prd.md',
    moduleRoot: 'src',
  });
  const manifestPath = join(featureRoot, 'scope-manifest.yaml');
  await writeFile(manifestPath, stringifyYaml(priorOut.manifest), 'utf8');

  return {
    root,
    featureRoot,
    prdPath,
    manifestPath,
    async cleanup() {
      await rm(root, { recursive: true, force: true });
    },
  };
}

async function listRunDirs(parent: string): Promise<readonly string[]> {
  try {
    return await readdir(parent);
  } catch {
    return [];
  }
}

describe('US7 — scope-export default manifest path is layout-aware', () => {
  it('resolves the default manifest under a specs/NNN-slug fixture', async () => {
    const fixture = await makeFixture('speckit');
    try {
      const r = await scopeExportMain([
        '--slug',
        SLUG,
        '--repo-root',
        fixture.root,
        '--quiet',
      ]);
      expect(r.code).toBe(0);
      expect(r.resolvedPath).toBe(fixture.manifestPath);
    } finally {
      await fixture.cleanup();
    }
  });

  it('legacy-docs default manifest path is unchanged (FR-011)', async () => {
    const fixture = await makeFixture('legacy-docs');
    try {
      const r = await scopeExportMain([
        '--slug',
        SLUG,
        '--repo-root',
        fixture.root,
        '--quiet',
      ]);
      expect(r.code).toBe(0);
      expect(r.resolvedPath).toBe(fixture.manifestPath);
    } finally {
      await fixture.cleanup();
    }
  });
});

describe('US7 — scope-widen evidence lands under the resolved feature root', () => {
  it('widen EVIDENCE lands under the specs root even with explicit --manifest/--prd-path; no docs/ tree is recreated (gh-442)', async () => {
    const fixture = await makeFixture('speckit');
    try {
      const code = await scopeWidenMain([
        'gadget module is also affected by this change',
        '--slug',
        SLUG,
        '--repo-root',
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
      const widenRuns = await listRunDirs(
        join(fixture.featureRoot, 'scope-inventory', 'widen-runs'),
      );
      expect(widenRuns.length).toBeGreaterThan(0);
      expect(existsSync(join(fixture.root, 'docs'))).toBe(false);
    } finally {
      await fixture.cleanup();
    }
  });

  it('widen default --manifest/--prd-path resolve under the specs root', async () => {
    const fixture = await makeFixture('speckit');
    try {
      const code = await scopeWidenMain([
        'gadget module is also affected by this change',
        '--slug',
        SLUG,
        '--repo-root',
        fixture.root,
        '--evidence-trail',
        'off',
        '--quiet',
      ]);
      expect(code).toBe(0);
      expect(existsSync(join(fixture.root, 'docs'))).toBe(false);
    } finally {
      await fixture.cleanup();
    }
  });

  it('legacy-docs widen defaults + evidence are byte-compatible (FR-011)', async () => {
    const fixture = await makeFixture('legacy-docs');
    try {
      const code = await scopeWidenMain([
        'gadget module is also affected by this change',
        '--slug',
        SLUG,
        '--repo-root',
        fixture.root,
        '--evidence-trail',
        'off',
        '--quiet',
      ]);
      expect(code).toBe(0);
      const widenRuns = await listRunDirs(
        join(fixture.featureRoot, 'scope-inventory', 'widen-runs'),
      );
      expect(widenRuns.length).toBeGreaterThan(0);
    } finally {
      await fixture.cleanup();
    }
  });
});

describe('US7 — scope-inventory defaults + run-dirs are layout-aware', () => {
  it('default --prd-path/--out resolve under the specs root and the run-dir lands there (no docs/ tree)', async () => {
    const fixture = await makeFixture('speckit');
    try {
      const code = await scopeInventoryMain([
        '--slug',
        SLUG,
        '--repo-root',
        fixture.root,
        '--quiet',
      ]);
      expect(code).toBe(0);
      expect(existsSync(join(fixture.featureRoot, 'scope-manifest.yaml'))).toBe(true);
      const runs = await listRunDirs(join(fixture.featureRoot, 'scope-inventory', 'runs'));
      expect(runs.length).toBeGreaterThan(0);
      expect(existsSync(join(fixture.root, 'docs'))).toBe(false);
    } finally {
      await fixture.cleanup();
    }
  });

  it('legacy-docs inventory defaults are byte-compatible (FR-011)', async () => {
    const fixture = await makeFixture('legacy-docs');
    try {
      const code = await scopeInventoryMain([
        '--slug',
        SLUG,
        '--repo-root',
        fixture.root,
        '--quiet',
      ]);
      expect(code).toBe(0);
      expect(existsSync(join(fixture.featureRoot, 'scope-manifest.yaml'))).toBe(true);
      const runs = await listRunDirs(join(fixture.featureRoot, 'scope-inventory', 'runs'));
      expect(runs.length).toBeGreaterThan(0);
    } finally {
      await fixture.cleanup();
    }
  });
});

describe('US7 — provenance doctor rule walks the spec layout', () => {
  const AUDIT_LOG = [
    '# Audit Log',
    '',
    '## 2026-06-11 — audit-barrage lift (20260611T100000000Z-x-after_clarify)',
    '',
    '### A finding the catalog references',
    '',
    'Finding-ID: AUDIT-20260611-07',
    'Status:     open',
    'Severity:   low',
    'Surface:    src/widget/a.ts:1',
    '',
    'Body.',
    '',
  ].join('\n');

  const ANTI_PATTERNS = [
    'schemaVersion: 1',
    'anti_patterns:',
    '  - id: ap-1',
    '    audit_history:',
    '      - AUDIT-20260611-07',
    '',
  ].join('\n');

  it('an audit_history reference into a specs-layout audit-log resolves (no orphan warning)', async () => {
    const repo = await mkdtemp(join(tmpdir(), 'layout-doctor-'));
    try {
      const sdDir = join(repo, '.stack-control', 'scope-discovery');
      await mkdir(sdDir, { recursive: true });
      await writeFile(join(sdDir, 'anti-patterns.yaml'), ANTI_PATTERNS, 'utf8');
      const featureRoot = join(repo, 'specs', '001-feat');
      await mkdir(featureRoot, { recursive: true });
      await writeFile(join(featureRoot, 'audit-log.md'), AUDIT_LOG, 'utf8');

      const findings = await provenanceCheck({ repoRoot: repo });
      expect(findings.filter((f) => /audit_history/.test(f.message))).toEqual([]);
    } finally {
      await rm(repo, { recursive: true, force: true });
    }
  });

  it('legacy-docs audit-log discovery is unchanged (FR-011)', async () => {
    const repo = await mkdtemp(join(tmpdir(), 'layout-doctor-'));
    try {
      const sdDir = join(repo, '.stack-control', 'scope-discovery');
      await mkdir(sdDir, { recursive: true });
      await writeFile(join(sdDir, 'anti-patterns.yaml'), ANTI_PATTERNS, 'utf8');
      const featureRoot = join(repo, 'docs', '1.0', '001-IN-PROGRESS', 'feat');
      await mkdir(featureRoot, { recursive: true });
      await writeFile(join(featureRoot, 'audit-log.md'), AUDIT_LOG, 'utf8');

      const findings = await provenanceCheck({ repoRoot: repo });
      expect(findings.filter((f) => /audit_history/.test(f.message))).toEqual([]);
    } finally {
      await rm(repo, { recursive: true, force: true });
    }
  });
});
