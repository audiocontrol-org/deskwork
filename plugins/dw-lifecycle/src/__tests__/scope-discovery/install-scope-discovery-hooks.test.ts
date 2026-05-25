/**
 * plugins/dw-lifecycle/src/__tests__/scope-discovery/install-scope-discovery-hooks.test.ts
 *
 * Tests for `dw-lifecycle install-scope-discovery-hooks`. Each test
 * creates a fresh tmpdir (with `git init` for hooks-path config tests)
 * and asserts the filesystem state after the install. No mock fs.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  chooseMode,
  detectHusky,
  HOOK_BEGIN_MARKER,
  HOOK_END_MARKER,
  install,
  main,
  mergeFileRecords,
  parseCli,
  readExistingManifest,
} from '../../scope-discovery/install-scope-discovery-hooks.js';

function makeGitTmp(prefix: string): string {
  const tmp = mkdtempSync(join(tmpdir(), prefix));
  execSync('git init -q', { cwd: tmp });
  return tmp;
}

describe('install-scope-discovery-hooks — parseCli', () => {
  it('defaults', () => {
    const opts = parseCli([]);
    expect(opts.merge).toBe(false);
    expect(opts.replace).toBe(false);
    expect(opts.force).toBe(false);
    expect(opts.dryRun).toBe(false);
  });

  it('--merge / --replace / --force / --dry-run flags', () => {
    expect(parseCli(['--merge']).merge).toBe(true);
    expect(parseCli(['--replace']).replace).toBe(true);
    expect(parseCli(['--force']).force).toBe(true);
    expect(parseCli(['--dry-run']).dryRun).toBe(true);
  });

  it('--target requires a value', () => {
    expect(() => parseCli(['--target'])).toThrow(/--target requires a path/);
  });

  it('unknown flag throws', () => {
    expect(() => parseCli(['--bogus'])).toThrow(/unknown argument/);
  });
});

describe('install-scope-discovery-hooks — detectHusky', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'dw-hooks-husky-detect-'));
  });
  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it('returns false when neither .husky nor package.json present', () => {
    expect(detectHusky(tmp)).toBe(false);
  });

  it('returns true when .husky/ directory exists', () => {
    mkdirSync(join(tmp, '.husky'), { recursive: true });
    expect(detectHusky(tmp)).toBe(true);
  });

  it('returns true when package.json devDependencies lists husky', () => {
    writeFileSync(
      join(tmp, 'package.json'),
      JSON.stringify({
        name: 'x',
        devDependencies: { husky: '^9.0.0' },
      }),
      'utf8',
    );
    expect(detectHusky(tmp)).toBe(true);
  });

  it('returns true when dependencies lists husky', () => {
    writeFileSync(
      join(tmp, 'package.json'),
      JSON.stringify({ name: 'x', dependencies: { husky: '*' } }),
      'utf8',
    );
    expect(detectHusky(tmp)).toBe(true);
  });

  it('returns false when package.json has no husky', () => {
    writeFileSync(
      join(tmp, 'package.json'),
      JSON.stringify({ name: 'x' }),
      'utf8',
    );
    expect(detectHusky(tmp)).toBe(false);
  });
});

describe('install-scope-discovery-hooks — chooseMode', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'dw-hooks-mode-'));
  });
  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it('husky when .husky/ exists', () => {
    mkdirSync(join(tmp, '.husky'), { recursive: true });
    expect(
      chooseMode(tmp, {
        target: tmp,
        merge: false,
        replace: false,
        force: false,
        dryRun: false,
      }),
    ).toBe('husky');
  });

  it('fresh-githooks when no .githooks exists', () => {
    expect(
      chooseMode(tmp, {
        target: tmp,
        merge: false,
        replace: false,
        force: false,
        dryRun: false,
      }),
    ).toBe('fresh-githooks');
  });

  it('refuses when .githooks/pre-commit exists without --merge or --replace', () => {
    mkdirSync(join(tmp, '.githooks'), { recursive: true });
    writeFileSync(join(tmp, '.githooks', 'pre-commit'), '#!/bin/sh\nexit 0\n', 'utf8');
    expect(() =>
      chooseMode(tmp, {
        target: tmp,
        merge: false,
        replace: false,
        force: false,
        dryRun: false,
      }),
    ).toThrow(/already exists/);
  });

  it('merge-githooks when existing hook + --merge', () => {
    mkdirSync(join(tmp, '.githooks'), { recursive: true });
    writeFileSync(join(tmp, '.githooks', 'pre-commit'), '#!/bin/sh\n', 'utf8');
    expect(
      chooseMode(tmp, {
        target: tmp,
        merge: true,
        replace: false,
        force: false,
        dryRun: false,
      }),
    ).toBe('merge-githooks');
  });

  it('replace-githooks when existing hook + --replace', () => {
    mkdirSync(join(tmp, '.githooks'), { recursive: true });
    writeFileSync(join(tmp, '.githooks', 'pre-commit'), '#!/bin/sh\n', 'utf8');
    expect(
      chooseMode(tmp, {
        target: tmp,
        merge: false,
        replace: true,
        force: false,
        dryRun: false,
      }),
    ).toBe('replace-githooks');
  });

  it('replace-githooks when existing hook + --force (alias)', () => {
    mkdirSync(join(tmp, '.githooks'), { recursive: true });
    writeFileSync(join(tmp, '.githooks', 'pre-commit'), '#!/bin/sh\n', 'utf8');
    expect(
      chooseMode(tmp, {
        target: tmp,
        merge: false,
        replace: false,
        force: true,
        dryRun: false,
      }),
    ).toBe('replace-githooks');
  });
});

describe('install-scope-discovery-hooks — install() against tmpdir', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = makeGitTmp('dw-hooks-install-');
  });
  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it('greenfield fresh-githooks: writes hook + manifest + configures hooks path', () => {
    const result = install({
      target: tmp,
      merge: false,
      replace: false,
      force: false,
      dryRun: false,
    });
    expect(result.code).toBe(0);
    expect(result.mode).toBe('fresh-githooks');
    const hookPath = join(tmp, '.githooks', 'pre-commit');
    expect(existsSync(hookPath)).toBe(true);
    const content = readFileSync(hookPath, 'utf8');
    expect(content).toContain('#!/usr/bin/env bash');
    expect(content).toContain('dw-lifecycle detect-clones --gate-mode');
    expect(content).toContain('dw-lifecycle check-anti-patterns --gate-mode');
    expect(content).toContain('dw-lifecycle check-adopters --gate-mode');
    expect(content).toContain('dw-lifecycle check-disposition-survivor');
    expect(content).toContain('dw-lifecycle check-editor-symmetry --gate-mode');
    expect(content).toContain(HOOK_BEGIN_MARKER);
    expect(content).toContain(HOOK_END_MARKER);
    // Non-short-circuiting: each gate's failure increments a counter,
    // the hook only exits 1 after all gates have run.
    expect(content).toContain('dw_lifecycle_gate_failures=0');
    const manifestPath = join(
      tmp,
      '.dw-lifecycle',
      'scope-discovery',
      'hooks-installed.json',
    );
    expect(existsSync(manifestPath)).toBe(true);
    const hooksPath = execSync('git config --get core.hooksPath', {
      cwd: tmp,
    })
      .toString('utf8')
      .trim();
    expect(hooksPath).toBe('.githooks');
  });

  it('husky mode: writes hook to .husky/pre-commit', () => {
    mkdirSync(join(tmp, '.husky'), { recursive: true });
    const result = install({
      target: tmp,
      merge: false,
      replace: false,
      force: false,
      dryRun: false,
    });
    expect(result.mode).toBe('husky');
    const huskyPath = join(tmp, '.husky', 'pre-commit');
    expect(existsSync(huskyPath)).toBe(true);
    const content = readFileSync(huskyPath, 'utf8');
    expect(content).toContain('dw-lifecycle detect-clones --gate-mode');
  });

  it('merge mode: existing hook content preserved + managed block appended', () => {
    mkdirSync(join(tmp, '.githooks'), { recursive: true });
    const existing = '#!/bin/sh\necho "existing hook"\n';
    writeFileSync(join(tmp, '.githooks', 'pre-commit'), existing, 'utf8');
    const result = install({
      target: tmp,
      merge: true,
      replace: false,
      force: false,
      dryRun: false,
    });
    expect(result.mode).toBe('merge-githooks');
    const content = readFileSync(
      join(tmp, '.githooks', 'pre-commit'),
      'utf8',
    );
    expect(content).toContain('echo "existing hook"');
    expect(content).toContain(HOOK_BEGIN_MARKER);
  });

  it('idempotent merge: second --merge run does not duplicate block', () => {
    mkdirSync(join(tmp, '.githooks'), { recursive: true });
    writeFileSync(join(tmp, '.githooks', 'pre-commit'), '#!/bin/sh\n', 'utf8');
    install({
      target: tmp,
      merge: true,
      replace: false,
      force: false,
      dryRun: false,
    });
    install({
      target: tmp,
      merge: true,
      replace: false,
      force: false,
      dryRun: false,
    });
    const content = readFileSync(
      join(tmp, '.githooks', 'pre-commit'),
      'utf8',
    );
    const occurrences = content.split(HOOK_BEGIN_MARKER).length - 1;
    expect(occurrences).toBe(1);
  });

  it('replace mode: existing hook overwritten', () => {
    mkdirSync(join(tmp, '.githooks'), { recursive: true });
    writeFileSync(
      join(tmp, '.githooks', 'pre-commit'),
      '#!/bin/sh\necho "to be replaced"\n',
      'utf8',
    );
    install({
      target: tmp,
      merge: false,
      replace: true,
      force: false,
      dryRun: false,
    });
    const content = readFileSync(
      join(tmp, '.githooks', 'pre-commit'),
      'utf8',
    );
    expect(content).not.toContain('to be replaced');
    expect(content).toContain(HOOK_BEGIN_MARKER);
  });

  it('refuses (throws) when existing hook + no flag', () => {
    mkdirSync(join(tmp, '.githooks'), { recursive: true });
    writeFileSync(join(tmp, '.githooks', 'pre-commit'), '#!/bin/sh\n', 'utf8');
    expect(() =>
      install({
        target: tmp,
        merge: false,
        replace: false,
        force: false,
        dryRun: false,
      }),
    ).toThrow(/already exists/);
  });

  it('--dry-run does not write anything', () => {
    const result = install({
      target: tmp,
      merge: false,
      replace: false,
      force: false,
      dryRun: true,
    });
    expect(result.code).toBe(0);
    expect(existsSync(join(tmp, '.githooks', 'pre-commit'))).toBe(false);
    expect(
      existsSync(
        join(tmp, '.dw-lifecycle', 'scope-discovery', 'hooks-installed.json'),
      ),
    ).toBe(false);
  });

  it('manifest records the hook file + sha256', () => {
    install({
      target: tmp,
      merge: false,
      replace: false,
      force: false,
      dryRun: false,
    });
    const manifestPath = join(
      tmp,
      '.dw-lifecycle',
      'scope-discovery',
      'hooks-installed.json',
    );
    const manifest = readExistingManifest(manifestPath);
    expect(manifest).not.toBeNull();
    if (manifest === null) return;
    expect(manifest.files.length).toBe(1);
    expect(manifest.files[0]?.path).toBe(
      join(tmp, '.githooks', 'pre-commit'),
    );
    expect(manifest.files[0]?.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(manifest.files[0]?.managed).toBe(true);
  });
});

describe('install-scope-discovery-hooks — readExistingManifest', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'dw-hooks-readmf-'));
  });
  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it('returns null when missing', () => {
    expect(readExistingManifest(join(tmp, 'nope.json'))).toBeNull();
  });

  it('returns null on malformed JSON', () => {
    const path = join(tmp, 'bad.json');
    writeFileSync(path, 'not json', 'utf8');
    expect(readExistingManifest(path)).toBeNull();
  });

  it('parses a well-formed manifest', () => {
    const path = join(tmp, 'good.json');
    writeFileSync(
      path,
      JSON.stringify({
        installed_at: '2026-05-25T00:00:00Z',
        installed_by: 'test',
        husky_detected: false,
        files: [
          { path: '/foo', sha256: 'a'.repeat(64), managed: true },
        ],
      }),
      'utf8',
    );
    const parsed = readExistingManifest(path);
    expect(parsed?.files.length).toBe(1);
    expect(parsed?.files[0]?.path).toBe('/foo');
  });
});

describe('install-scope-discovery-hooks — mergeFileRecords', () => {
  it('upserts by path', () => {
    const existing = [
      { path: '/a', sha256: 'x'.repeat(64), managed: true },
      { path: '/b', sha256: 'y'.repeat(64), managed: true },
    ];
    const added = [
      { path: '/b', sha256: 'z'.repeat(64), managed: true },
      { path: '/c', sha256: 'w'.repeat(64), managed: false },
    ];
    const merged = mergeFileRecords(existing, added);
    expect(merged.length).toBe(3);
    const b = merged.find((r) => r.path === '/b');
    expect(b?.sha256).toBe('z'.repeat(64));
  });
});

describe('install-scope-discovery-hooks — main()', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = makeGitTmp('dw-hooks-main-');
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

  it('returns 2 when existing hook + no flag', async () => {
    mkdirSync(join(tmp, '.githooks'), { recursive: true });
    writeFileSync(join(tmp, '.githooks', 'pre-commit'), '#!/bin/sh\n', 'utf8');
    const result = await main(['--target', tmp]);
    expect(result.code).toBe(2);
  });
});
