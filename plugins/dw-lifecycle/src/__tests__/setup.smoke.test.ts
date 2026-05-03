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
});
