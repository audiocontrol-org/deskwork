// End-to-end smoke for the debt-report orchestrator + formatters against a
// real on-disk fixture project tree. The gh/git CLIs are stubbed at the
// runGh / runGit callback boundary so the test doesn't shell out.
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaultConfig } from '../config.js';
import { runDebtReport } from '../debt-report/index.js';
import { formatJson, formatMarkdown } from '../debt-report/formatters.js';

const tmpRoots: string[] = [];

function createProjectRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'dw-debt-smoke-'));
  tmpRoots.push(root);
  return root;
}

afterEach(() => {
  while (tmpRoots.length > 0) {
    const root = tmpRoots.pop();
    if (root) rmSync(root, { recursive: true, force: true });
  }
});

function writeFixtureProject(root: string): void {
  const cfg = defaultConfig();
  cfg.docs.knownVersions = ['1.0'];
  mkdirSync(join(root, '.dw-lifecycle'), { recursive: true });
  writeFileSync(
    join(root, '.dw-lifecycle/config.json'),
    JSON.stringify(cfg, null, 2),
    'utf8',
  );

  // Two in-progress features with workplans carrying TBD markers.
  const featA = join(root, 'docs/1.0/001-IN-PROGRESS/feat-a');
  mkdirSync(featA, { recursive: true });
  writeFileSync(
    join(featA, 'workplan.md'),
    [
      '# Workplan: feat-a',
      '- TBD: investigate retry policy',
      '- defer cache eviction tune-up',
      '- follow-up: wire telemetry',
      '- (already promoted) defer thumbnail rebuild [debt: #999]',
    ].join('\n'),
    'utf8',
  );

  const featB = join(root, 'docs/1.0/001-IN-PROGRESS/feat-b');
  mkdirSync(featB, { recursive: true });
  writeFileSync(
    join(featB, 'workplan.md'),
    '- out of scope for now\n- TBD: handle empty input\n',
    'utf8',
  );
}

const now = new Date('2026-05-28T12:00:00.000Z');

function ghStub(): string {
  // Two open issues; one labeled 'bug', one unlabeled and very stale.
  return JSON.stringify([
    {
      number: 100,
      title: 'recently-updated bug',
      url: 'https://example.com/100',
      updatedAt: new Date(now.getTime() - 1 * 86400_000).toISOString(),
      labels: [{ name: 'bug' }],
      comments: [],
    },
    {
      number: 101,
      title: 'old unlabeled issue',
      url: 'https://example.com/101',
      updatedAt: new Date(now.getTime() - 90 * 86400_000).toISOString(),
      labels: [],
      comments: [],
    },
  ]);
}

function gitStub(args: readonly string[]): string {
  if (args[0] === 'for-each-ref') {
    const old = new Date(now.getTime() - 120 * 86400_000).toISOString();
    const recent = new Date(now.getTime() - 2 * 86400_000).toISOString();
    return [
      `feature/parked|origin/main|aaaaaaaa|${old}`,
      `feature/active|origin/main|bbbbbbbb|${recent}`,
      `main|origin/main|cccccccc|${recent}`,
    ].join('\n');
  }
  if (args[0] === 'rev-parse') return 'main\n';
  if (args[0] === 'rev-list') return '5\t3\n';
  if (args[0] === 'remote') return 'git@github.com:foo/bar.git\n';
  return '';
}

describe('debt-report end-to-end smoke', () => {
  it('produces a markdown report with all three sections populated', async () => {
    const root = createProjectRoot();
    writeFixtureProject(root);

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
      now,
      runGh: ghStub,
      runGit: gitStub,
    });

    expect(report.github_issues?.total_open).toBe(2);
    // 3 markers on feat-a (the [debt: #999] line is excluded) + 2 on feat-b.
    expect(report.workplan_tbds?.total).toBe(5);
    expect(report.parked_branches?.parked).toHaveLength(1);
    expect(report.parked_branches?.parked[0]?.refname).toBe('feature/parked');

    const md = formatMarkdown(report);
    expect(md).toContain('# Debt report');
    expect(md).toContain('## GitHub issues');
    expect(md).toContain('| bug | 1 |');
    expect(md).toContain('## Workplan TBDs');
    expect(md).toContain('| feat-a | 1.0 |');
    expect(md).toContain('| feat-b | 1.0 |');
    expect(md).toContain('## Parked branches');
    expect(md).toContain('feature/parked');

    const json = formatJson(report);
    const parsed = JSON.parse(json);
    expect(parsed.generated_at).toBe(now.toISOString());
    expect(parsed.github_issues.by_label.bug).toBe(1);
    expect(parsed.workplan_tbds.features).toHaveLength(2);
    expect(parsed.parked_branches.parked).toHaveLength(1);
  });

  it('skips gh + branches when both excluded; still emits workplan section', async () => {
    const root = createProjectRoot();
    writeFixtureProject(root);

    const report = await runDebtReport({
      projectRoot: root,
      staleDays: 30,
      commentStaleDays: 7,
      parkedDays: 30,
      sampleSize: 5,
      issueLimit: 1000,
      includeGh: false,
      includeWorkplan: true,
      includeBranches: false,
      now,
      runGh: () => {
        throw new Error('should not be called');
      },
      runGit: () => {
        throw new Error('should not be called');
      },
    });

    expect(report.github_issues).toBeNull();
    expect(report.parked_branches).toBeNull();
    expect(report.workplan_tbds?.total).toBe(5);

    const md = formatMarkdown(report);
    expect(md).toContain('(skipped via --no-gh)');
    expect(md).toContain('(skipped via --no-branches)');
  });
});
