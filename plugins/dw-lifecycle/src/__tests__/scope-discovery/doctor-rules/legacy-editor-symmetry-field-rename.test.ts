/**
 * plugins/dw-lifecycle/src/__tests__/scope-discovery/doctor-rules/legacy-editor-symmetry-field-rename.test.ts
 *
 * Phase 25 Task 8 — doctor rule detects adopter scope-manifest YAML
 * files still carrying the legacy `editor_symmetry:` field name
 * (renamed to `module_symmetry:` in Phase 25 Task 3).
 *
 * Scenarios:
 *   - Empty repo (no docs/, no .dw-lifecycle/scope-discovery/) → 0
 *     findings.
 *   - Single feature-doc scope-manifest with the legacy field → 1
 *     finding citing the file + line numbers + the canonical-key
 *     migration hint.
 *   - Project-root scope-manifest at
 *     .dw-lifecycle/scope-discovery/scope-manifest.yaml with the
 *     legacy field → finding picked up by the same walker.
 *   - Manifest with `module_symmetry:` (already migrated) → 0
 *     findings.
 *   - Manifest with BOTH `module_symmetry:` AND `editor_symmetry:` →
 *     1 finding (only the legacy key flagged).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { check } from '../../../scope-discovery/doctor-rules/legacy-editor-symmetry-field-rename.js';

const LEGACY_MANIFEST = `schemaVersion: 1
slug: demo
modules: []
adopter_manifests: []
anti_patterns: []
clones: []
regime_holdouts:
  anti_patterns: []
  adopter_manifests: []
  editor_symmetry: []
  deprecations: []
  summary:
    by_source:
      anti_patterns: 0
      adopter_manifests: 0
      editor_symmetry: 0
      deprecations: 0
`;

const MIGRATED_MANIFEST = `schemaVersion: 1
slug: demo
modules: []
adopter_manifests: []
anti_patterns: []
clones: []
regime_holdouts:
  anti_patterns: []
  adopter_manifests: []
  module_symmetry: []
  deprecations: []
  summary:
    by_source:
      anti_patterns: 0
      adopter_manifests: 0
      module_symmetry: 0
      deprecations: 0
`;

let repoRoot: string;

beforeEach(async () => {
  repoRoot = await mkdtemp(join(tmpdir(), 'legacy-symmetry-rule-'));
});

afterEach(async () => {
  await rm(repoRoot, { recursive: true, force: true });
});

describe('legacy-editor-symmetry-field-rename doctor rule', () => {
  it('empty repo (no docs/, no .dw-lifecycle/) → 0 findings', async () => {
    const findings = await check({ repoRoot });
    expect(findings).toEqual([]);
  });

  it('feature-doc scope-manifest with legacy field → 1 finding citing file + lines', async () => {
    const slugDir = join(repoRoot, 'docs', '1.0', '001-IN-PROGRESS', 'demo-feature');
    await mkdir(slugDir, { recursive: true });
    const manifestPath = join(slugDir, 'scope-manifest.yaml');
    await writeFile(manifestPath, LEGACY_MANIFEST, 'utf8');
    const findings = await check({ repoRoot });
    expect(findings).toHaveLength(1);
    const finding = findings[0];
    expect(finding).toBeDefined();
    if (finding === undefined) return;
    expect(finding.rule).toBe('legacy-editor-symmetry-field-rename');
    expect(finding.severity).toBe('warning');
    expect(finding.message).toContain(manifestPath);
    expect(finding.message).toContain('2 legacy');
    expect(finding.message).toContain('module_symmetry');
    expect(finding.message).toMatch(/line.*10.*16|line.*16.*10/);
  });

  it('project-root .dw-lifecycle/scope-discovery/scope-manifest.yaml with legacy field → finding emitted', async () => {
    const projectConfigDir = join(repoRoot, '.dw-lifecycle', 'scope-discovery');
    await mkdir(projectConfigDir, { recursive: true });
    const manifestPath = join(projectConfigDir, 'scope-manifest.yaml');
    await writeFile(manifestPath, LEGACY_MANIFEST, 'utf8');
    const findings = await check({ repoRoot });
    expect(findings).toHaveLength(1);
    const finding = findings[0];
    expect(finding).toBeDefined();
    if (finding === undefined) return;
    expect(finding.message).toContain(manifestPath);
  });

  it('already-migrated manifest (module_symmetry only) → 0 findings', async () => {
    const slugDir = join(repoRoot, 'docs', '1.0', '001-IN-PROGRESS', 'demo');
    await mkdir(slugDir, { recursive: true });
    await writeFile(
      join(slugDir, 'scope-manifest.yaml'),
      MIGRATED_MANIFEST,
      'utf8',
    );
    const findings = await check({ repoRoot });
    expect(findings).toEqual([]);
  });

  it('regression-lock: detects the legacy key even when surrounded by similar-shaped sibling fields', async () => {
    // The detection MUST be line-anchored: a comment or value that
    // mentions `editor_symmetry` somewhere mid-line should not
    // false-positive. Only the literal YAML key shape
    // `[ \t]*editor_symmetry\s*:` counts.
    const mixed =
      'schemaVersion: 1\n' +
      '# adopter migration note: editor_symmetry has been renamed to module_symmetry.\n' +
      'regime_holdouts:\n' +
      '  module_symmetry: []\n' +
      '  editor_symmetry: []\n' + // ← this is the only legacy key
      '  notes:\n' +
      '    - context: was editor_symmetry; now module_symmetry\n';
    const slugDir = join(repoRoot, 'docs', '1.0', '001-IN-PROGRESS', 'demo');
    await mkdir(slugDir, { recursive: true });
    await writeFile(join(slugDir, 'scope-manifest.yaml'), mixed, 'utf8');
    const findings = await check({ repoRoot });
    expect(findings).toHaveLength(1);
    const finding = findings[0];
    expect(finding).toBeDefined();
    if (finding === undefined) return;
    expect(finding.message).toContain('1 legacy');
    expect(finding.message).toMatch(/line.*5/);
  });
});
