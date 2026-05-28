import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { execSync } from 'node:child_process';
import {
  mkdtempSync,
  rmSync,
  existsSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, basename } from 'node:path';

// Stub the github surface so `issues` never invokes `gh` for real.
let parentCounter = 300;
let phaseCounter = 301;

vi.mock('../tracking-github.js', () => ({
  createParentIssue: vi.fn(() => {
    const number = parentCounter++;
    return {
      number,
      url: `https://github.com/audiocontrol-org/deskwork/issues/${number}`,
    };
  }),
  createPhaseIssues: vi.fn((args: { phases: Array<{ name: string }> }) =>
    args.phases.map(() => {
      const number = phaseCounter++;
      return {
        number,
        url: `https://github.com/audiocontrol-org/deskwork/issues/${number}`,
      };
    }),
  ),
}));

import { install } from '../subcommands/install.js';
import { setup } from '../subcommands/setup.js';
import { issues } from '../subcommands/issues.js';

describe('issues (smoke) — TF-003 prose back-fills', () => {
  let tmpRoot: string;
  let worktreePath: string;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let stderrWriteSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    parentCounter = 300;
    phaseCounter = 301;
    tmpRoot = realpathSync(mkdtempSync(join(tmpdir(), 'dw-lifecycle-issues-')));
    execSync('git init -b main', { cwd: tmpRoot });
    execSync('git config user.email "test@test"', { cwd: tmpRoot });
    execSync('git config user.name "Test"', { cwd: tmpRoot });
    execSync('git config commit.gpgsign false', { cwd: tmpRoot });
    // The issues verb calls `git remote get-url origin` to detect the
    // GitHub repo. Add a fake origin so detection succeeds.
    execSync(
      'git remote add origin git@github.com:audiocontrol-org/deskwork.git',
      { cwd: tmpRoot },
    );
    execSync('git commit --allow-empty -m "init"', { cwd: tmpRoot });
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    stderrWriteSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    stderrWriteSpy.mockRestore();
    if (worktreePath && existsSync(worktreePath)) {
      try {
        execSync(`git -C "${tmpRoot}" worktree remove "${worktreePath}" --force`);
      } catch {
        // best-effort
      }
      rmSync(worktreePath, { recursive: true, force: true });
    }
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  async function setupFeatureWithPhases(slug: string): Promise<{
    docsDir: string;
    workplanPath: string;
    readmePath: string;
  }> {
    await install([tmpRoot]);
    // Commit the install artifacts so the feature worktree inherits
    // `.dw-lifecycle/config.json` from HEAD. In production the operator
    // commits these between install and setup.
    execSync('git add .dw-lifecycle', { cwd: tmpRoot });
    execSync('git commit -m "install dw-lifecycle config"', { cwd: tmpRoot });

    const workplanPath = join(tmpRoot, `${slug}-workplan.md`);
    writeFileSync(
      workplanPath,
      [
        '# Workplan: Test',
        '',
        '**Goal:** Ship it.',
        '',
        '## Phase 1: Prior-art research',
        '',
        '**Deliverable:** Decision doc.',
        '',
        '- [ ] Step 1.1: survey',
        '',
        '## Phase 2: Pipeline template loader',
        '',
        '**Deliverable:** Loader module.',
        '',
        '- [ ] Step 2.1: parse template',
        '',
        '## Phase 3: Lane data model',
        '',
        '**Deliverable:** Schema.',
        '',
        '- [ ] Step 3.1: schema delta',
        '',
        '## Closing milestone: handoff',
        '',
        'Wrap up notes.',
      ].join('\n'),
      'utf8',
    );

    const origCwd = process.cwd();
    process.chdir(tmpRoot);
    try {
      await setup([
        slug,
        '--target',
        '1.0',
        '--title',
        'Test Feature',
        '--workplan',
        workplanPath,
      ]);
    } finally {
      process.chdir(origCwd);
    }

    worktreePath = join(dirname(tmpRoot), `${basename(tmpRoot)}-${slug}`);
    const docsDir = join(worktreePath, `docs/1.0/001-IN-PROGRESS/${slug}`);
    return {
      docsDir,
      workplanPath: join(docsDir, 'workplan.md'),
      readmePath: join(docsDir, 'README.md'),
    };
  }

  async function runIssuesInWorktree(slug: string): Promise<void> {
    const origCwd = process.cwd();
    process.chdir(worktreePath);
    try {
      await issues([slug, '--target', '1.0']);
    } finally {
      process.chdir(origCwd);
    }
  }

  it('back-fills workplan phase headings, README Status table, and Key Links parent line', async () => {
    const slug = 'tf003-test';
    const { workplanPath, readmePath } = await setupFeatureWithPhases(slug);
    await runIssuesInWorktree(slug);

    const wpAfter = readFileSync(workplanPath, 'utf8');
    expect(wpAfter).toContain(
      '## Phase 1: Prior-art research  ·  [#301](https://github.com/audiocontrol-org/deskwork/issues/301)',
    );
    expect(wpAfter).toContain(
      '## Phase 2: Pipeline template loader  ·  [#302](https://github.com/audiocontrol-org/deskwork/issues/302)',
    );
    expect(wpAfter).toContain(
      '## Phase 3: Lane data model  ·  [#303](https://github.com/audiocontrol-org/deskwork/issues/303)',
    );
    // Closing milestone is not a Phase — must not be touched.
    expect(wpAfter).toContain('## Closing milestone: handoff');
    expect(wpAfter).not.toMatch(/Closing milestone.*·.*\[#\d+\]/);

    const readmeAfter = readFileSync(readmePath, 'utf8');
    // Status table widened from 3 to 4 columns; per-phase rows generated.
    expect(readmeAfter).toContain('| Phase | Description | Issue | Status |');
    expect(readmeAfter).toContain(
      '| 1 | Prior-art research | [#301](https://github.com/audiocontrol-org/deskwork/issues/301) | Not started |',
    );
    expect(readmeAfter).toContain(
      '| 2 | Pipeline template loader | [#302](https://github.com/audiocontrol-org/deskwork/issues/302) | Not started |',
    );
    expect(readmeAfter).toContain(
      '| 3 | Lane data model | [#303](https://github.com/audiocontrol-org/deskwork/issues/303) | Not started |',
    );
    expect(readmeAfter).not.toContain('[Phase 1 name]');

    // Key Links parent line filled.
    expect(readmeAfter).toContain(
      '- Parent Issue: [#300](https://github.com/audiocontrol-org/deskwork/issues/300)',
    );

    // Frontmatter parent back-fill still applies.
    expect(readmeAfter).toMatch(/^---\n[\s\S]*parentIssue: "#300"/);
  });

  it('is idempotent — running issues twice does not double-append heading links or duplicate Status rows', async () => {
    const slug = 'tf003-idempotent';
    const { workplanPath, readmePath } = await setupFeatureWithPhases(slug);
    await runIssuesInWorktree(slug);

    const wpAfterFirst = readFileSync(workplanPath, 'utf8');
    const readmeAfterFirst = readFileSync(readmePath, 'utf8');

    // Reset gh stub counters so the second run gets fresh numbers, but
    // workplan / README idempotency is about replacement-not-duplication
    // even when the new issue numbers differ from the first run.
    parentCounter = 400;
    phaseCounter = 401;

    await runIssuesInWorktree(slug);

    const wpAfterSecond = readFileSync(workplanPath, 'utf8');
    const readmeAfterSecond = readFileSync(readmePath, 'utf8');

    // Workplan: each Phase heading carries exactly one issue link.
    const wpHeadings = wpAfterSecond
      .split('\n')
      .filter((l) => /^## Phase \d+/.test(l));
    expect(wpHeadings.length).toBeGreaterThan(0);
    for (const heading of wpHeadings) {
      expect((heading.match(/\[#\d+\]/g) ?? []).length).toBe(1);
    }
    // Heading links now point to the second-run issue numbers.
    expect(wpAfterSecond).toContain('[#401]');
    expect(wpAfterSecond).not.toContain('[#301]');

    // README Status table: still has exactly 3 phase rows, no duplicates.
    const phaseRows = readmeAfterSecond
      .split('\n')
      .filter((l) => /^\| \d+ \| .* \| \[#\d+\]/.test(l));
    expect(phaseRows).toHaveLength(3);
    // Issue numbers updated to the second-run values.
    expect(readmeAfterSecond).toContain('[#401]');
    expect(readmeAfterSecond).toContain('[#402]');
    expect(readmeAfterSecond).toContain('[#403]');

    // Sanity check: the first-run snapshot was different (numbers).
    expect(wpAfterFirst).not.toBe(wpAfterSecond);
    expect(readmeAfterFirst).not.toBe(readmeAfterSecond);
  });

  it('preserves an operator-rewritten README Status table; only fills the Issue column', async () => {
    const slug = 'tf003-operator-rewrite';
    const { readmePath } = await setupFeatureWithPhases(slug);

    // Operator has already rewritten the README's Status table.
    const original = readFileSync(readmePath, 'utf8');
    const rewritten = original.replace(
      /## Status[\s\S]*?(?=\n## )/,
      [
        '## Status',
        '',
        '| Phase | Description | Issue | Status |',
        '|---|---|---|---|',
        '| 1 | Operator description one | TBD | In progress — Task 1.1 done |',
        '| 2 | Operator description two | TBD | Not started |',
        '| 3 | Operator description three | TBD | Not started |',
        '| Closing | scope-discovery dogfood summary | — | Not started |',
        '',
        '',
      ].join('\n'),
    );
    writeFileSync(readmePath, rewritten, 'utf8');

    await runIssuesInWorktree(slug);

    const readmeAfter = readFileSync(readmePath, 'utf8');
    // Operator descriptions + statuses preserved verbatim.
    expect(readmeAfter).toContain('Operator description one');
    expect(readmeAfter).toContain('In progress — Task 1.1 done');
    expect(readmeAfter).toContain('Operator description two');
    expect(readmeAfter).toContain('Operator description three');
    expect(readmeAfter).toContain('scope-discovery dogfood summary');
    // Issue column back-filled for matching phase rows.
    expect(readmeAfter).toContain('[#301]');
    expect(readmeAfter).toContain('[#302]');
    expect(readmeAfter).toContain('[#303]');
    // No more TBD placeholders in the rows that match a phase.
    const matched = readmeAfter
      .split('\n')
      .filter((l) => /^\| [123] \|/.test(l));
    for (const row of matched) {
      expect(row).not.toMatch(/\|\s*TBD\s*\|/);
    }
    // Closing row preserved as-is (no phase number match).
    expect(readmeAfter).toContain('| Closing | scope-discovery dogfood summary | — |');
  });
});
