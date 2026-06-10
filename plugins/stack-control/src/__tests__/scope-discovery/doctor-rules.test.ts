/**
 * 010 T058 — scope-discovery doctor-rules unit tests.
 *
 * Flags a schema-violating registry, a refactor-incomplete entry, and override
 * drift; the rules are read-only (report-only). The `scope-doctor` runner
 * aggregates findings against the resolved installation and mutates only with
 * --fix (today: no rule mutates). On-disk fixtures only.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeFixture, type Fixture } from './fixture.js';
import { check as clonesSchemaViolation } from '../../scope-discovery/doctor-rules/clones-yaml-schema-violation.js';
import { check as refactorIncomplete } from '../../scope-discovery/doctor-rules/clones-yaml-refactor-incomplete.js';
import { check as overrideDrift } from '../../scope-discovery/doctor-rules/override-drift.js';
import { check as configMissing } from '../../scope-discovery/doctor-rules/scope-discovery-config-missing.js';
import { runScopeDoctor } from '../../scope-discovery/scope-doctor.js';

const SD_REL = '.stack-control/scope-discovery';

let fixtures: Fixture[] = [];
function fx(): Fixture {
  const f = makeFixture('sd-doctor-');
  fixtures.push(f);
  return f;
}
afterEach(() => {
  for (const f of fixtures.splice(0)) f.cleanup();
});

/** Seed an empty-but-valid scope-discovery config dir at the installation root. */
function seedConfigDir(f: Fixture): void {
  f.writeFile(`${SD_REL}/clones.yaml`, 'schemaVersion: 1\ngenerated_at: "2026-06-01T00:00:00Z"\nclones: []\n');
}

describe('clones-yaml-schema-violation rule', () => {
  it('passes when clones.yaml is absent', async () => {
    const f = fx();
    const root = f.install('.');
    const findings = await clonesSchemaViolation({ repoRoot: root });
    expect(findings).toEqual([]);
  });

  it('fires on a schema-violating clones.yaml (missing generated_at)', async () => {
    const f = fx();
    const root = f.install('.');
    f.writeFile(`${SD_REL}/clones.yaml`, 'clones: []\n');
    const findings = await clonesSchemaViolation({ repoRoot: root });
    expect(findings.length).toBeGreaterThanOrEqual(1);
    expect(findings[0]?.rule).toBe('clones-yaml-schema-violation');
    expect(findings[0]?.severity).toBe('error');
  });
});

describe('clones-yaml-refactor-incomplete rule', () => {
  it('fires on a refactor entry missing canonical_side', async () => {
    const f = fx();
    const root = f.install('.');
    f.writeFile(
      `${SD_REL}/clones.yaml`,
      [
        'generated_at: "2026-06-01T00:00:00Z"',
        'clones:',
        '  - id: abc123def456',
        '    lines: 10',
        '    members:',
        '      - foo.ts:1:10',
        '      - bar.ts:1:10',
        '    disposition: refactor',
        '    reason: null',
      ].join('\n') + '\n',
    );
    const findings = await refactorIncomplete({ repoRoot: root });
    expect(findings.length).toBeGreaterThanOrEqual(1);
    expect(findings.every((x) => x.rule === 'clones-yaml-refactor-incomplete')).toBe(true);
    expect(findings.some((x) => x.message.includes('canonical_side'))).toBe(true);
  });

  it('passes on a non-refactor entry', async () => {
    const f = fx();
    const root = f.install('.');
    f.writeFile(
      `${SD_REL}/clones.yaml`,
      [
        'generated_at: "2026-06-01T00:00:00Z"',
        'clones:',
        '  - id: aaaaaaaaaaaa',
        '    lines: 10',
        '    members:',
        '      - foo.ts:1:10',
        '      - bar.ts:1:10',
        '    disposition: pending',
        '    reason: null',
      ].join('\n') + '\n',
    );
    const findings = await refactorIncomplete({ repoRoot: root });
    expect(findings).toEqual([]);
  });
});

describe('override-drift rule', () => {
  it('fires when an override diverges from the plugin default by exports surface', async () => {
    const f = fx();
    const root = f.install('.');
    // An override named after a real plugin default (`summary.ts`) whose
    // exported-symbol surface differs → advisory fires.
    f.writeFile(`${SD_REL}/summary.ts`, 'export const totallyDifferent = 1;\n');
    const findings = await overrideDrift({ repoRoot: root });
    expect(findings.some((x) => x.rule === 'override-drift')).toBe(true);
  });

  it('passes when the override directory has no .ts overrides', async () => {
    const f = fx();
    const root = f.install('.');
    seedConfigDir(f);
    const findings = await overrideDrift({ repoRoot: root });
    expect(findings).toEqual([]);
  });
});

describe('scope-doctor runner — aggregation + read-only', () => {
  it('aggregates findings against the resolved installation and exits 1 on error severity', async () => {
    const f = fx();
    const root = f.install('.');
    f.writeFile(`${SD_REL}/clones.yaml`, 'clones: []\n'); // schema violation (error)
    const before = readFileSync(join(root, SD_REL, 'clones.yaml'), 'utf8');
    const result = await runScopeDoctor({ at: root, fix: false, json: false });
    expect(result.code).toBe(1);
    expect(result.installationRoot).toBe(root);
    expect(result.findings?.some((x) => x.rule === 'clones-yaml-schema-violation')).toBe(true);
    // Read-only: the registry was NOT mutated (no --fix wiring).
    expect(readFileSync(join(root, SD_REL, 'clones.yaml'), 'utf8')).toBe(before);
  });

  it('exits 0 when the config dir is well-formed (warnings only / none)', async () => {
    const f = fx();
    const root = f.install('.');
    seedConfigDir(f);
    f.writeFile(`${SD_REL}/anti-patterns.yaml`, 'schemaVersion: 1\nanti_patterns: []\n');
    f.writeFile(`${SD_REL}/adopter-manifests.yaml`, 'schemaVersion: 1\nadopter_manifests: []\n');
    const result = await runScopeDoctor({ at: root, fix: false, json: false });
    expect(result.code).toBe(0);
    expect(result.findings?.some((x) => x.severity === 'error')).toBe(false);
  });

  it('config-missing rule is inert on a freshly-installed dir with no scope-discovery references', async () => {
    const f = fx();
    const root = f.install('.');
    seedConfigDir(f);
    // Config dir present → config-missing rule does not fire.
    const findings = await configMissing({ repoRoot: root });
    expect(findings).toEqual([]);
  });
});
