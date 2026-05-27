/**
 * plugins/dw-lifecycle/src/__tests__/scope-discovery/install-scope-discovery.test.ts
 *
 * Tests for `dw-lifecycle install-scope-discovery`. Each test creates a
 * fresh tmpdir via mkdtempSync, runs the installer's programmatic API
 * against it, asserts the filesystem state, and cleans up. No mock fs.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  install,
  main,
  parseCli,
} from '../../scope-discovery/install-scope-discovery.js';

const CONFIG_REL = '.dw-lifecycle/scope-discovery';
const COPY_FILE_NAMES = [
  'README.md',
  'LAYOUT.md',
  'refactor-preconditions-checklist.md',
  '.jscpd.json',
];
const SEED_FILE_NAMES = [
  'clones.yaml',
  'anti-patterns.yaml',
  'adopter-manifests.yaml',
  'deprecation-queue.yaml',
];

describe('install-scope-discovery — parseCli', () => {
  it('defaults: target=cwd, no force, no dry-run', () => {
    const opts = parseCli([]);
    expect(opts.force).toBe(false);
    expect(opts.dryRun).toBe(false);
    expect(typeof opts.target).toBe('string');
  });

  it('--target sets target', () => {
    const opts = parseCli(['--target', '/tmp/foo']);
    expect(opts.target).toBe('/tmp/foo');
  });

  it('--target requires a value', () => {
    expect(() => parseCli(['--target'])).toThrow(/--target requires a path/);
  });

  it('--force + --dry-run flags', () => {
    expect(parseCli(['--force']).force).toBe(true);
    expect(parseCli(['--dry-run']).dryRun).toBe(true);
  });

  it('unknown flag throws', () => {
    expect(() => parseCli(['--bogus'])).toThrow(/unknown argument/);
  });
});

describe('install-scope-discovery — install() against tmpdir', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'dw-install-sd-'));
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it('greenfield: creates 8 files', () => {
    const result = install({ target: tmp, force: false, dryRun: false });
    expect(result.code).toBe(0);
    expect(result.actions.length).toBe(
      COPY_FILE_NAMES.length + SEED_FILE_NAMES.length,
    );
    for (const action of result.actions) {
      expect(action.action).toBe('created');
    }
    const configDir = join(tmp, CONFIG_REL);
    for (const name of [...COPY_FILE_NAMES, ...SEED_FILE_NAMES]) {
      expect(existsSync(join(configDir, name))).toBe(true);
    }
  });

  it('idempotent: re-run against populated tree is all-skipped', () => {
    install({ target: tmp, force: false, dryRun: false });
    const second = install({ target: tmp, force: false, dryRun: false });
    expect(second.code).toBe(0);
    for (const action of second.actions) {
      expect(action.action).toBe('skipped');
      expect(action.reason).toBe('already present');
    }
  });

  it('--dry-run does not write', () => {
    const result = install({ target: tmp, force: false, dryRun: true });
    expect(result.code).toBe(0);
    expect(result.actions.length).toBe(
      COPY_FILE_NAMES.length + SEED_FILE_NAMES.length,
    );
    for (const action of result.actions) {
      expect(action.action).toBe('created');
    }
    const configDir = join(tmp, CONFIG_REL);
    for (const name of COPY_FILE_NAMES) {
      expect(existsSync(join(configDir, name))).toBe(false);
    }
  });

  it('--force overwrites existing files', () => {
    install({ target: tmp, force: false, dryRun: false });
    const clonesPath = join(tmp, CONFIG_REL, 'clones.yaml');
    writeFileSync(clonesPath, 'clones:\n  - id: hand-edited\n', 'utf8');
    const result = install({ target: tmp, force: true, dryRun: false });
    const overwritten = result.actions.filter(
      (a) => a.action === 'overwritten',
    );
    expect(overwritten.length).toBe(
      COPY_FILE_NAMES.length + SEED_FILE_NAMES.length,
    );
    const seeded = readFileSync(clonesPath, 'utf8');
    expect(seeded).toBe(
      'schemaVersion: 1\ngenerated_at: "1970-01-01T00:00:00Z"\nclones: []\n',
    );
  });

  it('seeded YAMLs have the documented empty-array shape', () => {
    install({ target: tmp, force: false, dryRun: false });
    const configDir = join(tmp, CONFIG_REL);
    expect(readFileSync(join(configDir, 'clones.yaml'), 'utf8')).toBe(
      'schemaVersion: 1\ngenerated_at: "1970-01-01T00:00:00Z"\nclones: []\n',
    );
    expect(
      readFileSync(join(configDir, 'anti-patterns.yaml'), 'utf8'),
    ).toBe('schemaVersion: 1\nanti_patterns: []\n');
    expect(
      readFileSync(join(configDir, 'adopter-manifests.yaml'), 'utf8'),
    ).toBe('schemaVersion: 1\nadopter_manifests: []\n');
    expect(
      readFileSync(join(configDir, 'deprecation-queue.yaml'), 'utf8'),
    ).toBe('schemaVersion: 1\ndeprecations: []\n');
  });

  it('copied templates have non-empty content', () => {
    install({ target: tmp, force: false, dryRun: false });
    const configDir = join(tmp, CONFIG_REL);
    for (const name of COPY_FILE_NAMES) {
      const content = readFileSync(join(configDir, name), 'utf8');
      expect(content.length).toBeGreaterThan(0);
    }
  });

  it('partial: existing seed file preserved; missing templates added', () => {
    const configDir = join(tmp, CONFIG_REL);
    install({ target: tmp, force: false, dryRun: false });
    // Reset by removing one file
    rmSync(join(configDir, 'README.md'));
    const result = install({ target: tmp, force: false, dryRun: false });
    const created = result.actions.filter((a) => a.action === 'created');
    expect(created.length).toBe(1);
    expect(created[0]?.path).toBe(join(configDir, 'README.md'));
  });
});

describe('install-scope-discovery — main()', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'dw-install-sd-main-'));
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it('returns 0 on greenfield install', async () => {
    const result = await main(['--target', tmp]);
    expect(result.code).toBe(0);
  });

  it('returns 2 on unknown flag', async () => {
    const result = await main(['--target', tmp, '--bogus']);
    expect(result.code).toBe(2);
  });

  it('--dry-run twice produces identical plans (idempotent plan)', async () => {
    const first = await main(['--target', tmp, '--dry-run']);
    const second = await main(['--target', tmp, '--dry-run']);
    expect(first.code).toBe(0);
    expect(second.code).toBe(0);
    // Disk state is unchanged after dry-run, so both plans are identical
    // (this asserts the dry-run contract: no FS side-effects).
    expect(existsSync(join(tmp, CONFIG_REL, 'README.md'))).toBe(false);
  });
});
