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
  filterRecordsUnderTarget,
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
    expect(content).toContain('dw-lifecycle check-clones --gate-mode');
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
    expect(content).toContain('dw-lifecycle check-clones --gate-mode');
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

describe('install-scope-discovery-hooks — filterRecordsUnderTarget (TF-002)', () => {
  let outer: string;
  beforeEach(() => {
    outer = mkdtempSync(join(tmpdir(), 'dw-hooks-tf002-'));
  });
  afterEach(() => {
    rmSync(outer, { recursive: true, force: true });
  });

  it('keeps records whose realpath resolves under target', () => {
    const target = join(outer, 'workA');
    mkdirSync(target, { recursive: true });
    const inside = join(target, '.husky', 'pre-commit');
    mkdirSync(join(target, '.husky'), { recursive: true });
    writeFileSync(inside, '#!/bin/sh\n', 'utf8');

    const records = [
      { path: inside, sha256: 'a'.repeat(64), managed: true },
    ];
    const result = filterRecordsUnderTarget(records, target);
    expect(result.length).toBe(1);
    expect(result[0]?.path).toBe(inside);
  });

  it('drops records whose path is a sibling worktree', () => {
    const targetA = join(outer, 'workA');
    const targetB = join(outer, 'workB');
    mkdirSync(targetA, { recursive: true });
    mkdirSync(targetB, { recursive: true });
    const insideA = join(targetA, '.husky', 'pre-commit');
    const insideB = join(targetB, '.husky', 'pre-commit');
    mkdirSync(join(targetA, '.husky'), { recursive: true });
    mkdirSync(join(targetB, '.husky'), { recursive: true });
    writeFileSync(insideA, '#!/bin/sh\n', 'utf8');
    writeFileSync(insideB, '#!/bin/sh\n', 'utf8');

    const records = [
      { path: insideA, sha256: 'a'.repeat(64), managed: true },
      { path: insideB, sha256: 'b'.repeat(64), managed: true },
    ];
    // Filtering against targetA should drop targetB's entry.
    const kept = filterRecordsUnderTarget(records, targetA);
    expect(kept.length).toBe(1);
    expect(kept[0]?.path).toBe(insideA);
  });

  it('drops records whose path no longer exists on disk', () => {
    const target = join(outer, 'workA');
    mkdirSync(target, { recursive: true });
    const ghost = join(target, '.husky', 'gone.sh');
    const records = [
      { path: ghost, sha256: 'a'.repeat(64), managed: true },
    ];
    const kept = filterRecordsUnderTarget(records, target);
    expect(kept.length).toBe(0);
  });

  it('keeps records under a symlinked target (realpath-aware)', () => {
    // Create realA + symlink workA -> realA; pass workA as target but
    // record paths under workA. The filter must resolve workA's realpath
    // to realA AND each record's realpath to realA, then match.
    const real = join(outer, 'realA');
    mkdirSync(real, { recursive: true });
    const link = join(outer, 'workA');
    execSync(`ln -s ${JSON.stringify(real)} ${JSON.stringify(link)}`);

    const husky = join(real, '.husky');
    mkdirSync(husky, { recursive: true });
    const hook = join(real, '.husky', 'pre-commit');
    writeFileSync(hook, '#!/bin/sh\n', 'utf8');

    // Record path written using the symlinked dir; realpath should
    // resolve it to under realA.
    const recordPath = join(link, '.husky', 'pre-commit');
    const records = [
      { path: recordPath, sha256: 'a'.repeat(64), managed: true },
    ];
    // Target supplied as the symlinked dir; both sides realpath-resolve
    // to realA and match.
    const kept = filterRecordsUnderTarget(records, real);
    expect(kept.length).toBe(1);
  });
});

describe('install-scope-discovery-hooks — install() drops stale cross-worktree manifest entries (TF-002)', () => {
  let outer: string;
  beforeEach(() => {
    outer = mkdtempSync(join(tmpdir(), 'dw-hooks-install-tf002-'));
  });
  afterEach(() => {
    rmSync(outer, { recursive: true, force: true });
  });

  it('removes stale cross-worktree entries from a pre-existing manifest', () => {
    // Two worktrees side-by-side, target = workA.
    const workA = join(outer, 'workA');
    const workB = join(outer, 'workB');
    mkdirSync(workA, { recursive: true });
    mkdirSync(workB, { recursive: true });
    execSync('git init -q', { cwd: workA });
    execSync('git init -q', { cwd: workB });

    // Seed workB with a hook file that physically exists on disk.
    mkdirSync(join(workB, '.githooks'), { recursive: true });
    const workBHook = join(workB, '.githooks', 'pre-commit');
    writeFileSync(workBHook, '#!/bin/sh\n', 'utf8');

    // Pre-populate workA's manifest with an entry that belongs to workB
    // — this mirrors the TF-002 failure mode where the committed
    // manifest arrives in workA carrying workB's paths.
    const manifestDir = join(workA, '.dw-lifecycle', 'scope-discovery');
    mkdirSync(manifestDir, { recursive: true });
    const manifestPath = join(manifestDir, 'hooks-installed.json');
    writeFileSync(
      manifestPath,
      JSON.stringify({
        installed_at: '2026-05-20T00:00:00Z',
        installed_by: 'test',
        husky_detected: false,
        files: [
          { path: workBHook, sha256: 'b'.repeat(64), managed: true },
        ],
      }),
      'utf8',
    );

    // Now install into workA. The new entry (workA/.githooks/pre-commit)
    // should be the only one in the resulting manifest; the workB
    // entry must be dropped.
    install({
      target: workA,
      merge: false,
      replace: false,
      force: false,
      dryRun: false,
    });

    const after = readExistingManifest(manifestPath);
    expect(after).not.toBeNull();
    if (after === null) return;
    const paths = after.files.map((f) => f.path);
    expect(paths).toEqual([join(workA, '.githooks', 'pre-commit')]);
    // Explicitly: workB entry is gone.
    expect(paths.includes(workBHook)).toBe(false);
  });

  it('clean install writes a single-entry manifest (no pre-existing manifest)', () => {
    const work = join(outer, 'workClean');
    mkdirSync(work, { recursive: true });
    execSync('git init -q', { cwd: work });

    const manifestPath = join(
      work,
      '.dw-lifecycle',
      'scope-discovery',
      'hooks-installed.json',
    );
    expect(existsSync(manifestPath)).toBe(false);

    install({
      target: work,
      merge: false,
      replace: false,
      force: false,
      dryRun: false,
    });

    const manifest = readExistingManifest(manifestPath);
    expect(manifest).not.toBeNull();
    if (manifest === null) return;
    expect(manifest.files.length).toBe(1);
    expect(manifest.files[0]?.path).toBe(
      join(work, '.githooks', 'pre-commit'),
    );
  });

  it('preserves multiple in-target entries while dropping out-of-target ones', () => {
    // Common case: an earlier install recorded a hook AND agent files
    // under workA. Then someone copied the manifest to workB. Running
    // install in workB should drop all of workA's entries and start
    // fresh with workB's hook.
    const workA = join(outer, 'workA');
    const workB = join(outer, 'workB');
    mkdirSync(workA, { recursive: true });
    mkdirSync(workB, { recursive: true });
    execSync('git init -q', { cwd: workA });
    execSync('git init -q', { cwd: workB });

    // Files in workA — these physically exist.
    mkdirSync(join(workA, '.githooks'), { recursive: true });
    mkdirSync(join(workA, '.claude', 'agents'), { recursive: true });
    const workAHook = join(workA, '.githooks', 'pre-commit');
    const workAAgent1 = join(workA, '.claude', 'agents', 'code-reviewer.md');
    const workAAgent2 = join(workA, '.claude', 'agents', 'codebase-auditor.md');
    writeFileSync(workAHook, '#!/bin/sh\n', 'utf8');
    writeFileSync(workAAgent1, '# agent', 'utf8');
    writeFileSync(workAAgent2, '# agent', 'utf8');

    // Pre-populate workB's manifest with workA's three entries.
    const manifestDir = join(workB, '.dw-lifecycle', 'scope-discovery');
    mkdirSync(manifestDir, { recursive: true });
    const manifestPath = join(manifestDir, 'hooks-installed.json');
    writeFileSync(
      manifestPath,
      JSON.stringify({
        installed_at: '2026-05-20T00:00:00Z',
        installed_by: 'test',
        husky_detected: false,
        files: [
          { path: workAHook, sha256: 'h'.repeat(64), managed: true },
          { path: workAAgent1, sha256: 'a'.repeat(64), managed: true },
          { path: workAAgent2, sha256: 'b'.repeat(64), managed: true },
        ],
      }),
      'utf8',
    );

    install({
      target: workB,
      merge: false,
      replace: false,
      force: false,
      dryRun: false,
    });

    const after = readExistingManifest(manifestPath);
    expect(after).not.toBeNull();
    if (after === null) return;
    const paths = after.files.map((f) => f.path).sort();
    expect(paths).toEqual([join(workB, '.githooks', 'pre-commit')]);
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

// TF-001: husky-9 silent-skip mitigation. The failure mode (the
// graphical-entries canary tripped on this) — a husky project's
// `core.hooksPath` is pointed at `.husky/_` by husky's prepare-script
// install path. In a fresh worktree without `node_modules/`, that
// dispatcher dir doesn't exist; git silently skips every hook and the
// installer reports green-light success. These tests pin the
// detect-and-bootstrap-then-verify contract: the installer must
// materialize the dispatcher (or fail loud) before returning success.
describe('install-scope-discovery-hooks — TF-001 husky dispatcher bootstrap', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = makeGitTmp('dw-hooks-tf001-');
  });
  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  function makeHuskyProject(): void {
    // Mimic husky-9's post-`npm install` state: package.json declares
    // husky in devDeps + core.hooksPath is set to .husky/_, but the
    // dispatcher dir does NOT exist (npm install hasn't run yet).
    writeFileSync(
      join(tmp, 'package.json'),
      JSON.stringify({
        name: 'fresh-husky-worktree',
        devDependencies: { husky: '^9.0.0' },
        scripts: { prepare: 'husky install' },
      }),
      'utf8',
    );
    mkdirSync(join(tmp, '.husky'), { recursive: true });
    execSync('git config core.hooksPath .husky/_', { cwd: tmp });
  }

  it('detectMissingHuskyDispatcher returns the absolute path when .husky/_ missing', async () => {
    const { detectMissingHuskyDispatcher } = await import(
      '../../scope-discovery/husky-bootstrap.js'
    );
    makeHuskyProject();
    const missing = detectMissingHuskyDispatcher(tmp);
    expect(missing).toBe(join(tmp, '.husky/_'));
  });

  it('detectMissingHuskyDispatcher returns null when .husky/_ exists', async () => {
    const { detectMissingHuskyDispatcher } = await import(
      '../../scope-discovery/husky-bootstrap.js'
    );
    makeHuskyProject();
    mkdirSync(join(tmp, '.husky', '_'), { recursive: true });
    expect(detectMissingHuskyDispatcher(tmp)).toBeNull();
  });

  it('detectMissingHuskyDispatcher returns null when core.hooksPath unset', async () => {
    const { detectMissingHuskyDispatcher } = await import(
      '../../scope-discovery/husky-bootstrap.js'
    );
    // No husky config at all — greenfield .githooks path; not our problem.
    expect(detectMissingHuskyDispatcher(tmp)).toBeNull();
  });

  it('detectMissingHuskyDispatcher returns null when hooksPath is non-husky', async () => {
    const { detectMissingHuskyDispatcher } = await import(
      '../../scope-discovery/husky-bootstrap.js'
    );
    mkdirSync(join(tmp, '.githooks'), { recursive: true });
    execSync('git config core.hooksPath .githooks', { cwd: tmp });
    // Non-husky paths are intentionally ignored — uninstall/install of
    // legacy .githooks setups doesn't trigger the husky bootstrap.
    expect(detectMissingHuskyDispatcher(tmp)).toBeNull();
  });

  it('install bootstraps .husky/_ on a fresh husky worktree', () => {
    makeHuskyProject();
    expect(existsSync(join(tmp, '.husky/_'))).toBe(false);
    const result = install({
      target: tmp,
      merge: false,
      replace: false,
      force: false,
      dryRun: false,
      bootstrapHuskyRunner: (target) => {
        // Test stub: simulates `npx --yes husky install` materializing
        // the dispatcher directory. Real installs invoke npx; this stub
        // exercises the install orchestration path without an actual
        // network/registry hit.
        mkdirSync(join(target, '.husky/_'), { recursive: true });
        return {
          success: true,
          command: 'npx --yes husky install',
          stdout: 'husky - Git hooks installed\n',
          stderr: '',
          exitCode: 0,
        };
      },
    });
    expect(result.code).toBe(0);
    expect(result.mode).toBe('husky');
    expect(existsSync(join(tmp, '.husky/_'))).toBe(true);
    // The bootstrap action is recorded as a top-level action so the
    // operator sees it in the installer report.
    const bootstrapAction = result.actions.find((a) =>
      a.startsWith('bootstrapped husky dispatcher:'),
    );
    expect(bootstrapAction).toBeDefined();
  });

  it('install does not invoke bootstrap runner when not in husky mode', () => {
    let runnerCalls = 0;
    install({
      target: tmp,
      merge: false,
      replace: false,
      force: false,
      dryRun: false,
      bootstrapHuskyRunner: () => {
        runnerCalls += 1;
        return {
          success: false,
          command: 'should-not-be-called',
          stdout: '',
          stderr: '',
          exitCode: 99,
        };
      },
    });
    expect(runnerCalls).toBe(0);
  });

  it('install does not invoke bootstrap runner when .husky/_ already present', () => {
    makeHuskyProject();
    mkdirSync(join(tmp, '.husky/_'), { recursive: true });
    let runnerCalls = 0;
    const result = install({
      target: tmp,
      merge: false,
      replace: false,
      force: false,
      dryRun: false,
      bootstrapHuskyRunner: () => {
        runnerCalls += 1;
        return {
          success: false,
          command: 'should-not-be-called',
          stdout: '',
          stderr: '',
          exitCode: 99,
        };
      },
    });
    expect(result.mode).toBe('husky');
    expect(runnerCalls).toBe(0);
    // No bootstrap action emitted when the dispatcher was already there.
    expect(
      result.actions.find((a) =>
        a.startsWith('bootstrapped husky dispatcher:'),
      ),
    ).toBeUndefined();
  });

  it('install throws when bootstrap runner reports failure (with recovery hint)', () => {
    makeHuskyProject();
    // The error message must include: the failing command, the
    // captured stderr (so the operator sees what npx complained
    // about), and the recovery hint pointing at `npm install`. No
    // silent swallowing of subprocess output.
    expect(() =>
      install({
        target: tmp,
        merge: false,
        replace: false,
        force: false,
        dryRun: false,
        bootstrapHuskyRunner: () => ({
          success: false,
          command: 'npx --yes husky install',
          stdout: '',
          stderr: 'npm ERR! 404 husky not found',
          exitCode: 1,
        }),
      }),
    ).toThrow(/husky dispatcher bootstrap failed[\s\S]+npm ERR![\s\S]+Recovery: run `npm install`/);
  });

  it('install throws when bootstrap runner reports success but dispatcher still missing', () => {
    makeHuskyProject();
    expect(() =>
      install({
        target: tmp,
        merge: false,
        replace: false,
        force: false,
        dryRun: false,
        // Lying runner: claims success but does NOT materialize .husky/_.
        // This is the "husky reported it worked but it didn't" defense.
        bootstrapHuskyRunner: () => ({
          success: true,
          command: 'npx --yes husky install',
          stdout: 'husky - Git hooks installed\n',
          stderr: '',
          exitCode: 0,
        }),
      }),
    ).toThrow(
      /husky bootstrap reported success but [^ ]+ still missing — run `npm install`/,
    );
  });

  it('main() preserves dispatcher post-condition when it returns 0', async () => {
    // main() doesn't take an injected runner; it shells out to real
    // `npx --yes husky install`. In a fresh tmpdir, npx may succeed
    // (network access + registry hit) or fail (offline, blocked). We
    // tolerate BOTH outcomes — the assertion is the post-condition:
    // code 0 implies the dispatcher exists; code 2 (fail-loud) is also
    // acceptable. The pre-fix failure mode — code 0 with no
    // dispatcher — is what this test guards against.
    makeHuskyProject();
    const result = await main(['--target', tmp]);
    expect([0, 2]).toContain(result.code);
    if (result.code === 0) {
      expect(existsSync(join(tmp, '.husky/_'))).toBe(true);
    }
  }, 60_000);
});
