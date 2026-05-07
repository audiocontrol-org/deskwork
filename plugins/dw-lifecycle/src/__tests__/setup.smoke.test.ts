import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, basename } from 'node:path';
import { install } from '../subcommands/install.js';
import { setup } from '../subcommands/setup.js';

describe('setup (smoke)', () => {
  let tmpRoot: string;
  let worktreePath: string;

  beforeEach(() => {
    // Resolve symlinks (macOS /var -> /private/var) so that paths derived
    // from `git rev-parse --show-toplevel` line up with paths derived from
    // `tmpRoot` directly.
    tmpRoot = realpathSync(mkdtempSync(join(tmpdir(), 'dw-lifecycle-setup-')));
    execSync('git init -b main', { cwd: tmpRoot });
    // Tests must not depend on the host's git identity.
    execSync('git config user.email "test@test"', { cwd: tmpRoot });
    execSync('git config user.name "Test"', { cwd: tmpRoot });
    execSync('git config commit.gpgsign false', { cwd: tmpRoot });
    execSync('git commit --allow-empty -m "init"', { cwd: tmpRoot });
  });

  afterEach(() => {
    if (worktreePath && existsSync(worktreePath)) {
      try {
        execSync(`git -C "${tmpRoot}" worktree remove "${worktreePath}" --force`);
      } catch {
        // Best-effort cleanup; rmSync below handles the directory regardless.
      }
      rmSync(worktreePath, { recursive: true, force: true });
    }
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('creates a worktree, branch, and scaffolded docs', async () => {
    await install([tmpRoot]);

    const origCwd = process.cwd();
    process.chdir(tmpRoot);
    try {
      await setup(['test-feature', '--target', '1.0', '--title', 'Test']);
    } finally {
      process.chdir(origCwd);
    }

    worktreePath = join(dirname(tmpRoot), `${basename(tmpRoot)}-test-feature`);
    expect(existsSync(worktreePath)).toBe(true);

    const docsDir = join(worktreePath, 'docs/1.0/001-IN-PROGRESS/test-feature');
    expect(existsSync(join(docsDir, 'prd.md'))).toBe(true);
    expect(existsSync(join(docsDir, 'workplan.md'))).toBe(true);
    expect(existsSync(join(docsDir, 'README.md'))).toBe(true);

    const prd = readFileSync(join(docsDir, 'prd.md'), 'utf8');
    expect(prd).toContain('test-feature');
    expect(prd).toMatch(/deskwork:\n  id: [0-9a-f-]{36}/);
  });

  it('seeds the PRD and workplan from a feature definition file', async () => {
    await install([tmpRoot]);

    const definitionPath = join(tmpRoot, 'feature-definition.md');
    writeFileSync(
      definitionPath,
      `# Feature Definition: Test Feature

## Problem

Current setup dumps definition content into the wrong file.

## Goal

Make the PRD the primary seeded document and keep the workplan derivative.

## Scope

**In:**
- write deskwork.id to PRD frontmatter

**Out:**
- redesign the entire workplan format

## Approach

Parse the definition headings and map them into scaffold templates.

## Tasks

- [ ] Import problem and approach into prd.md
- [ ] Seed workplan steps from the task checklist

## Acceptance Criteria

- [ ] PRD contains the imported problem text
- [ ] Workplan contains imported task steps
`,
      'utf8'
    );

    const origCwd = process.cwd();
    process.chdir(tmpRoot);
    try {
      await setup(['definition-seeded', '--target', '1.0', '--title', 'Definition Seeded', '--definition', definitionPath]);
    } finally {
      process.chdir(origCwd);
    }

    worktreePath = join(dirname(tmpRoot), `${basename(tmpRoot)}-definition-seeded`);
    const docsDir = join(worktreePath, 'docs/1.0/001-IN-PROGRESS/definition-seeded');
    const prd = readFileSync(join(docsDir, 'prd.md'), 'utf8');
    const workplan = readFileSync(join(docsDir, 'workplan.md'), 'utf8');

    expect(prd).toContain('Current setup dumps definition content into the wrong file.');
    expect(prd).toContain('Parse the definition headings and map them into scaffold templates.');
    expect(prd).toContain('- redesign the entire workplan format');
    expect(workplan).toContain('**Goal:** Make the PRD the primary seeded document and keep the workplan derivative.');
    expect(workplan).toContain('- [ ] Step 1: Import problem and approach into prd.md');
    expect(workplan).toContain('- [ ] PRD contains the imported problem text');
    expect(workplan).not.toContain('<!-- Definition imported from:');
  });

  it('--workplan replaces the rendered template with a pre-authored body (#212)', async () => {
    await install([tmpRoot]);

    const workplanPath = join(tmpRoot, 'pre-authored-workplan.md');
    writeFileSync(
      workplanPath,
      `# Workplan: Custom Plan

**Goal:** Ship the custom thing.

## Phase 1: First slice

Real content from writing-plans output here.

- [ ] Step 1: First step
- [ ] Step 2: Second step
`,
      'utf8',
    );

    const origCwd = process.cwd();
    process.chdir(tmpRoot);
    try {
      await setup([
        'workplan-flag-feature',
        '--target',
        '1.0',
        '--title',
        'Workplan Flag',
        '--workplan',
        workplanPath,
      ]);
    } finally {
      process.chdir(origCwd);
    }

    worktreePath = join(dirname(tmpRoot), `${basename(tmpRoot)}-workplan-flag-feature`);
    const wpPath = join(
      worktreePath,
      'docs/1.0/001-IN-PROGRESS/workplan-flag-feature/workplan.md',
    );
    expect(existsSync(wpPath)).toBe(true);
    const wp = readFileSync(wpPath, 'utf8');

    // Pre-authored body landed.
    expect(wp).toContain('Real content from writing-plans output here.');
    expect(wp).toContain('Step 1: First step');

    // Template stub did NOT land.
    expect(wp).not.toContain('[Phase 1 name]');
    expect(wp).not.toContain('[task name]');

    // Standard frontmatter prepended.
    expect(wp).toMatch(/^---\nslug: workplan-flag-feature\n/);
    expect(wp).toContain('targetVersion: "1.0"');
  });

  it('rejects a missing --workplan file before creating the worktree', async () => {
    await install([tmpRoot]);

    const origCwd = process.cwd();
    process.chdir(tmpRoot);
    try {
      await expect(
        setup([
          'missing-workplan-feature',
          '--target',
          '1.0',
          '--workplan',
          join(tmpRoot, 'does-not-exist.md'),
        ]),
      ).rejects.toThrow(/Workplan file not found/);
    } finally {
      process.chdir(origCwd);
    }

    worktreePath = join(dirname(tmpRoot), `${basename(tmpRoot)}-missing-workplan-feature`);
    expect(existsSync(worktreePath)).toBe(false);
  });

  it('reuses a pre-existing worktree+branch (#196 #209) instead of doubling or aborting', async () => {
    await install([tmpRoot]);

    // Simulate `superpowers:using-git-worktrees` having created the
    // branch + worktree before the helper runs (the skill's documented
    // step 2). The branch name MUST match the helper's computed name
    // (`<branchPrefix><slug>`) so the helper recognizes it as the
    // pre-created target.
    const branchName = 'feature/preexisting-feature';
    const preCreated = join(dirname(tmpRoot), `${basename(tmpRoot)}-different-layout`);
    execSync(`git -C "${tmpRoot}" worktree add "${preCreated}" -b ${branchName} HEAD`);
    worktreePath = preCreated;

    const origCwd = process.cwd();
    process.chdir(preCreated);
    try {
      await setup(['preexisting-feature', '--target', '1.0', '--title', 'Pre-existing']);
    } finally {
      process.chdir(origCwd);
    }

    // Helper should NOT have created a doubled-name worktree.
    const doubledPath = join(
      dirname(tmpRoot),
      `${basename(tmpRoot)}-preexisting-feature-preexisting-feature`,
    );
    expect(existsSync(doubledPath)).toBe(false);

    // Helper should have scaffolded into the pre-existing worktree.
    const docsDir = join(preCreated, 'docs/1.0/001-IN-PROGRESS/preexisting-feature');
    expect(existsSync(join(docsDir, 'prd.md'))).toBe(true);
    expect(existsSync(join(docsDir, 'README.md'))).toBe(true);

    // Helper should NOT have created a second branch.
    const branches = execSync(`git -C "${tmpRoot}" branch --list`, { encoding: 'utf8' });
    const matches = branches.split('\n').filter((b) => b.includes(branchName));
    expect(matches.length).toBe(1);
  });

  it('rejects invalid target versions before creating a worktree', async () => {
    await install([tmpRoot]);

    const origCwd = process.cwd();
    process.chdir(tmpRoot);
    try {
      await expect(setup(['test-feature', '--target', '../../etc', '--title', 'Test'])).rejects.toThrow(
        /Invalid target version/
      );
    } finally {
      process.chdir(origCwd);
    }

    worktreePath = join(dirname(tmpRoot), `${basename(tmpRoot)}-test-feature`);
    expect(existsSync(worktreePath)).toBe(false);
  });
});
