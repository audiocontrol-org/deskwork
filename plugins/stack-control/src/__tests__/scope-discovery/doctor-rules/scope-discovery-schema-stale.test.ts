/**
 * Tests for the `scope-discovery-schema-stale` doctor rule.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { check } from '../../../scope-discovery/doctor-rules/scope-discovery-schema-stale.js';
import { CURRENT_SCHEMA_VERSION } from '../../../scope-discovery/doctor-rules/types.js';

const tmpRoots: string[] = [];

function mkProject(): string {
  const root = mkdtempSync(join(tmpdir(), 'sc-doctor-schema-stale-'));
  tmpRoots.push(root);
  mkdirSync(join(root, '.stack-control/scope-discovery'), { recursive: true });
  return root;
}

function planted(root: string, name: string, body: string): void {
  writeFileSync(join(root, '.stack-control/scope-discovery', name), body, 'utf8');
}

afterEach(() => {
  for (const root of tmpRoots.splice(0)) {
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      // best-effort cleanup
    }
  }
});

describe('scope-discovery-schema-stale doctor rule', () => {
  it('passes silently when the config dir is absent', async () => {
    const root = mkdtempSync(join(tmpdir(), 'sc-doctor-no-config-'));
    tmpRoots.push(root);
    const findings = await check({ repoRoot: root });
    expect(findings).toEqual([]);
  });

  it('passes silently when all YAMLs declare the current version', async () => {
    const root = mkProject();
    planted(root, 'clones.yaml', `schemaVersion: ${CURRENT_SCHEMA_VERSION}\nclones: []\n`);
    planted(root, 'anti-patterns.yaml', `schemaVersion: ${CURRENT_SCHEMA_VERSION}\nanti_patterns: []\n`);
    planted(
      root,
      'adopter-manifests.yaml',
      `schemaVersion: ${CURRENT_SCHEMA_VERSION}\nadopter_manifests: []\n`,
    );
    const findings = await check({ repoRoot: root });
    expect(findings).toEqual([]);
  });

  it('warns when schemaVersion is missing on a present YAML', async () => {
    const root = mkProject();
    planted(root, 'clones.yaml', 'clones: []\n');
    const findings = await check({ repoRoot: root });
    expect(findings).toHaveLength(1);
    expect(findings[0].rule).toBe('scope-discovery-schema-stale');
    expect(findings[0].message).toMatch(/schemaVersion.*missing/);
    expect(findings[0].message).toMatch(/clones\.yaml/);
  });

  it('warns when schemaVersion is older than current', async () => {
    const root = mkProject();
    planted(root, 'clones.yaml', `schemaVersion: 0\nclones: []\n`);
    const findings = await check({ repoRoot: root });
    expect(findings).toHaveLength(1);
    expect(findings[0].message).toMatch(/does not match/);
    expect(findings[0].message).toMatch(/Upgrade the file/);
  });

  it('warns when schemaVersion is newer than current (plugin behind)', async () => {
    const root = mkProject();
    planted(
      root,
      'anti-patterns.yaml',
      `schemaVersion: ${CURRENT_SCHEMA_VERSION + 99}\nanti_patterns: []\n`,
    );
    const findings = await check({ repoRoot: root });
    expect(findings).toHaveLength(1);
    expect(findings[0].message).toMatch(/newer schema/);
  });

  it('warns when schemaVersion is malformed (string instead of number)', async () => {
    const root = mkProject();
    planted(root, 'clones.yaml', `schemaVersion: "not-a-number"\nclones: []\n`);
    const findings = await check({ repoRoot: root });
    expect(findings).toHaveLength(1);
    expect(findings[0].message).toMatch(/malformed/);
  });

  it('emits one finding per stale YAML', async () => {
    const root = mkProject();
    planted(root, 'clones.yaml', 'clones: []\n');
    planted(root, 'anti-patterns.yaml', 'anti_patterns: []\n');
    planted(root, 'adopter-manifests.yaml', 'adopter_manifests: []\n');
    const findings = await check({ repoRoot: root });
    expect(findings).toHaveLength(3);
    expect(new Set(findings.map((f) => f.rule))).toEqual(
      new Set(['scope-discovery-schema-stale']),
    );
  });

  it('skips files that are not present', async () => {
    const root = mkProject();
    // Only clones.yaml exists, with a stale version.
    planted(root, 'clones.yaml', 'schemaVersion: 0\nclones: []\n');
    const findings = await check({ repoRoot: root });
    expect(findings).toHaveLength(1);
    expect(findings[0].message).toMatch(/clones\.yaml/);
  });
});
