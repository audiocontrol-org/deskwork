/**
 * 010 T056 — install-scope-discovery unit tests.
 *
 * Creates empty-but-valid registries + schemas + config.yaml under
 * `<installation>/.stack-control/scope-discovery/`; idempotent + non-
 * destructive. Uses on-disk fixtures (makeFixture) — never mocks fs.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeFixture, type Fixture } from './fixture.js';
import { install, main, parseCli } from '../../scope-discovery/install-scope-discovery.js';

const SD_REL = '.stack-control/scope-discovery';
const SEED_FILE_NAMES = [
  'clones.yaml',
  'anti-patterns.yaml',
  'adopter-manifests.yaml',
  'deprecation-queue.yaml',
  'config.yaml',
];

let fixtures: Fixture[] = [];

function fx(): Fixture {
  const f = makeFixture('sd-install-');
  fixtures.push(f);
  return f;
}

afterEach(() => {
  for (const f of fixtures.splice(0)) f.cleanup();
});

describe('install-scope-discovery — parseCli', () => {
  it('defaults: no --at, no force, no dry-run', () => {
    const opts = parseCli([]);
    expect(opts.at).toBeNull();
    expect(opts.force).toBe(false);
    expect(opts.dryRun).toBe(false);
  });

  it('--at sets the explicit root', () => {
    expect(parseCli(['--at', '/tmp/foo']).at).toBe('/tmp/foo');
  });

  it('--at requires a value', () => {
    expect(() => parseCli(['--at'])).toThrow(/--at requires a path/);
  });

  it('--force + --dry-run flags', () => {
    expect(parseCli(['--force']).force).toBe(true);
    expect(parseCli(['--dry-run']).dryRun).toBe(true);
  });

  it('unknown flag throws', () => {
    expect(() => parseCli(['--bogus'])).toThrow(/unknown argument/);
  });
});

describe('install-scope-discovery — install() against a fixture installation', () => {
  it('greenfield: seeds registries + config + schemas, all created', () => {
    const f = fx();
    const root = f.install('.');
    const result = install({ startDir: root, at: root, force: false, dryRun: false });
    expect(result.code).toBe(0);
    expect(result.installationRoot).toBe(root);
    for (const action of result.actions) {
      expect(action.action).toBe('created');
    }
    const sdDir = join(root, SD_REL);
    for (const name of SEED_FILE_NAMES) {
      expect(existsSync(join(sdDir, name))).toBe(true);
    }
    // At least one schema copied.
    const schemaDir = join(sdDir, 'schema');
    const schemas = readdirSync(schemaDir).filter((n) => n.endsWith('.schema.json'));
    expect(schemas.length).toBeGreaterThan(0);
  });

  it('seeded registries have the documented empty-array shape', () => {
    const f = fx();
    const root = f.install('.');
    install({ startDir: root, at: root, force: false, dryRun: false });
    const sdDir = join(root, SD_REL);
    expect(readFileSync(join(sdDir, 'clones.yaml'), 'utf8')).toBe(
      'schemaVersion: 1\ngenerated_at: "1970-01-01T00:00:00Z"\nclones: []\n',
    );
    expect(readFileSync(join(sdDir, 'anti-patterns.yaml'), 'utf8')).toBe(
      'schemaVersion: 1\nanti_patterns: []\n',
    );
    expect(readFileSync(join(sdDir, 'adopter-manifests.yaml'), 'utf8')).toBe(
      'schemaVersion: 1\nadopter_manifests: []\n',
    );
    expect(readFileSync(join(sdDir, 'deprecation-queue.yaml'), 'utf8')).toBe(
      'schemaVersion: 1\ndeprecations: []\n',
    );
  });

  it('seeded config.yaml is a valid sd-config (schema_version present)', () => {
    const f = fx();
    const root = f.install('.');
    install({ startDir: root, at: root, force: false, dryRun: false });
    const body = readFileSync(join(root, SD_REL, 'config.yaml'), 'utf8');
    expect(body).toMatch(/schema_version:\s*1/);
  });

  it('idempotent: re-run is all-skipped, non-destructive', () => {
    const f = fx();
    const root = f.install('.');
    install({ startDir: root, at: root, force: false, dryRun: false });
    // Hand-edit a registry to prove the re-run does not clobber it.
    const clonesPath = join(root, SD_REL, 'clones.yaml');
    writeFileSync(clonesPath, 'schemaVersion: 1\nclones: []\n# operator note\n', 'utf8');
    const second = install({ startDir: root, at: root, force: false, dryRun: false });
    expect(second.code).toBe(0);
    for (const action of second.actions) {
      expect(action.action).toBe('skipped');
    }
    expect(readFileSync(clonesPath, 'utf8')).toContain('# operator note');
  });

  it('--dry-run writes nothing', () => {
    const f = fx();
    const root = f.install('.');
    const result = install({ startDir: root, at: root, force: false, dryRun: true });
    expect(result.code).toBe(0);
    expect(existsSync(join(root, SD_REL, 'clones.yaml'))).toBe(false);
  });

  it('--force overwrites a hand-edited registry', () => {
    const f = fx();
    const root = f.install('.');
    install({ startDir: root, at: root, force: false, dryRun: false });
    const clonesPath = join(root, SD_REL, 'clones.yaml');
    writeFileSync(clonesPath, 'clones:\n  - id: hand\n', 'utf8');
    const result = install({ startDir: root, at: root, force: true, dryRun: false });
    expect(result.actions.some((a) => a.action === 'overwritten')).toBe(true);
    expect(readFileSync(clonesPath, 'utf8')).toBe(
      'schemaVersion: 1\ngenerated_at: "1970-01-01T00:00:00Z"\nclones: []\n',
    );
  });

  it('resolves the installation via walk-up when --at is absent', () => {
    const f = fx();
    const root = f.install('.');
    f.writeFile('nested/deep/file.ts', 'export const x = 1;\n');
    const result = install({
      startDir: join(root, 'nested', 'deep'),
      at: null,
      force: false,
      dryRun: false,
    });
    expect(result.installationRoot).toBe(root);
    expect(existsSync(join(root, SD_REL, 'clones.yaml'))).toBe(true);
  });
});

describe('install-scope-discovery — main()', () => {
  it('returns 2 on unknown flag', async () => {
    const result = await main(['--bogus']);
    expect(result.code).toBe(2);
  });

  it('returns 0 on greenfield install against an explicit --at root', async () => {
    const f = fx();
    const root = f.install('.');
    const result = await main(['--at', root]);
    expect(result.code).toBe(0);
    expect(existsSync(join(root, SD_REL, 'config.yaml'))).toBe(true);
  });
});
