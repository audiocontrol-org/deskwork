import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaultConfig } from '../config.js';
import { runDebtReport } from '../debt-report/index.js';
import type { Config } from '../config.types.js';

const tmpRoots: string[] = [];

function createProjectRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'dw-debt-orch-'));
  tmpRoots.push(root);
  return root;
}

function writeWorkplan(root: string, slug: string, body: string): void {
  const dir = join(root, 'docs/1.0/001-IN-PROGRESS', slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'workplan.md'), body, 'utf8');
}

function writeConfigFile(root: string): Config {
  const cfg = defaultConfig();
  cfg.docs.knownVersions = ['1.0'];
  const dir = join(root, '.dw-lifecycle');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'config.json'), JSON.stringify(cfg, null, 2), 'utf8');
  return cfg;
}

afterEach(() => {
  while (tmpRoots.length > 0) {
    const root = tmpRoots.pop();
    if (root) rmSync(root, { recursive: true, force: true });
  }
});

const stubGhEmpty = () => '[]';
const stubGitNoBranches = () => '';
const stubGitMain = (args: readonly string[]): string => {
  if (args[0] === 'for-each-ref') return '';
  if (args[0] === 'rev-parse') return 'main\n';
  return '';
};

describe('runDebtReport orchestrator', () => {
  it('returns all three populated sections with a generated_at timestamp', async () => {
    const root = createProjectRoot();
    writeConfigFile(root);
    writeWorkplan(root, 'feature-x', '- TBD: a\n- defer b\n');

    const report = await runDebtReport({
      projectRoot: root,
      staleDays: 30,
      commentStaleDays: 7,
      parkedDays: 30,
      sampleSize: 5,
      issueLimit: 1000,
      includeGh: true,
      includeWorkplan: true,
      includeBranches: true,
      repo: 'foo/bar',
      now: new Date('2026-05-28T12:00:00.000Z'),
      runGh: stubGhEmpty,
      runGit: stubGitMain,
    });

    expect(report.generated_at).toBe('2026-05-28T12:00:00.000Z');
    expect(report.github_issues).not.toBeNull();
    expect(report.workplan_tbds).not.toBeNull();
    expect(report.parked_branches).not.toBeNull();
    expect(report.workplan_tbds?.total).toBe(2);
  });

  it('skips github_issues when includeGh=false', async () => {
    const root = createProjectRoot();
    writeConfigFile(root);
    const report = await runDebtReport({
      projectRoot: root,
      staleDays: 30,
      commentStaleDays: 7,
      parkedDays: 30,
      sampleSize: 5,
      issueLimit: 1000,
      includeGh: false,
      includeWorkplan: true,
      includeBranches: true,
      repo: 'foo/bar',
      now: new Date('2026-05-28T12:00:00.000Z'),
      runGh: () => {
        throw new Error('runGh must not be called when includeGh=false');
      },
      runGit: stubGitMain,
    });
    expect(report.github_issues).toBeNull();
  });

  it('skips workplan_tbds when includeWorkplan=false', async () => {
    const root = createProjectRoot();
    writeConfigFile(root);
    writeWorkplan(root, 'feature-x', '- TBD: a\n');
    const report = await runDebtReport({
      projectRoot: root,
      staleDays: 30,
      commentStaleDays: 7,
      parkedDays: 30,
      sampleSize: 5,
      issueLimit: 1000,
      includeGh: true,
      includeWorkplan: false,
      includeBranches: true,
      repo: 'foo/bar',
      now: new Date('2026-05-28T12:00:00.000Z'),
      runGh: stubGhEmpty,
      runGit: stubGitMain,
    });
    expect(report.workplan_tbds).toBeNull();
  });

  it('skips parked_branches when includeBranches=false', async () => {
    const root = createProjectRoot();
    writeConfigFile(root);
    const report = await runDebtReport({
      projectRoot: root,
      staleDays: 30,
      commentStaleDays: 7,
      parkedDays: 30,
      sampleSize: 5,
      issueLimit: 1000,
      includeGh: true,
      includeWorkplan: true,
      includeBranches: false,
      repo: 'foo/bar',
      now: new Date('2026-05-28T12:00:00.000Z'),
      runGh: stubGhEmpty,
      runGit: () => {
        throw new Error('runGit must not be called when includeBranches=false');
      },
    });
    expect(report.parked_branches).toBeNull();
  });

  it('throws when includeGh=true but no repo is provided AND auto-detect fails', async () => {
    const root = createProjectRoot();
    writeConfigFile(root);
    await expect(
      runDebtReport({
        projectRoot: root,
        staleDays: 30,
        commentStaleDays: 7,
        parkedDays: 30,
        sampleSize: 5,
        issueLimit: 1000,
        includeGh: true,
        includeWorkplan: true,
        includeBranches: true,
        // No repo, no remote — should throw.
        now: new Date('2026-05-28T12:00:00.000Z'),
        runGh: stubGhEmpty,
        runGit: (args: readonly string[]) => {
          if (args[0] === 'remote' && args[1] === 'get-url') {
            throw new Error('fatal: No such remote');
          }
          return stubGitMain(args);
        },
      }),
    ).rejects.toThrow(/Could not detect GitHub repo|No such remote/);
  });
});
