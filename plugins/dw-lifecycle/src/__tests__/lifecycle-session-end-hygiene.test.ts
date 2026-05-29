import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  captureSessionEndHygiene,
  HYGIENE_OBSERVATIONS_HEADING,
  NEXT_RECOMMENDATION_HEADING,
} from '../lifecycle-integration/session-end-hygiene.js';

interface ProjectFixture {
  root: string;
  workplanPath: string;
}

function setupProject(): ProjectFixture {
  const root = mkdtempSync(join(tmpdir(), 'dw-session-end-hyg-'));
  const featureDir = join(root, 'docs', '1.0', '001-IN-PROGRESS', 'hygiene');
  mkdirSync(featureDir, { recursive: true });
  const workplanPath = join(featureDir, 'workplan.md');
  writeFileSync(
    workplanPath,
    [
      '# Workplan: hygiene',
      '',
      '## Phase 6',
      '',
      '- [ ] Task 1: modify session-end',
      '- [ ] Task 2: modify session-start TBD: need to wire helper',
      '- [x] Task 3: done (already promoted) [debt: #999]',
      '',
    ].join('\n'),
    'utf8',
  );
  return { root, workplanPath };
}

const stubGh = (raw: string) => () => raw;

// Build a commit-log payload in the format the new scanner consumes:
//   %H\x1f%s\x1f%b\x1e per record. Fields are SHA / subject / body.
function commitLogPayload(rows: { sha?: string; subject: string; body?: string }[]): string {
  return rows
    .map((row, idx) => {
      const sha = row.sha ?? `commit${idx}`.padEnd(12, '0');
      return `${sha}\x1f${row.subject}\x1f${row.body ?? ''}`;
    })
    .join('\x1e') + (rows.length > 0 ? '\x1e' : '');
}

// Build a runGh stub that answers `gh issue view <N> --json ...` with a
// payload derived from the issues map. Numbers not present in the map fall
// through to the empty string (which the scanner treats as "skip this ref").
function makeIssueViewStub(
  issues: Record<number, { title: string; state?: string }>,
): (args: readonly string[]) => string {
  return (args: readonly string[]) => {
    if (args[0] === 'issue' && args[1] === 'view') {
      const n = parseInt(args[2] ?? '', 10);
      const entry = issues[n];
      if (entry === undefined) return '';
      const payload: Record<string, unknown> = { number: n, title: entry.title };
      if (entry.state !== undefined) payload['state'] = entry.state;
      return JSON.stringify(payload);
    }
    return '';
  };
}

describe('captureSessionEndHygiene', () => {
  let fx: ProjectFixture;

  beforeEach(() => {
    fx = setupProject();
  });
  afterEach(() => rmSync(fx.root, { recursive: true, force: true }));

  it('flags commit subjects with hygiene-relevant tokens', () => {
    const runGit = () =>
      [
        'abc123def456\tfeat(x): add thing TBD wire up later',
        'fff999aaa888\tfix(y): close [debt: #123] reference',
        'ccc555bbb444\tchore: ordinary commit',
      ].join('\n');
    const report = captureSessionEndHygiene({
      projectRoot: fx.root,
      featureSlug: 'hygiene',
      targetVersion: '1.0',
      inProgressDirName: '001-IN-PROGRESS',
      sessionStartSha: 'abc000',
      runGit,
      runGh: stubGh('[]'),
      now: new Date('2026-05-28T00:00:00Z'),
    });
    const commits = report.observations.filter((o) => o.category === 'commit-marker');
    expect(commits).toHaveLength(2);
    expect(commits[0]?.markerText).toContain('TBD');
    expect(commits[1]?.markerText).toContain('[debt: #NNN]');
  });

  it('captures workplan TBD markers from the feature workplan', () => {
    // sessionStartSha=null + runGit stubbed to always return "" — the
    // boundary resolver returns ok:false, so the session-diff filter is
    // skipped and the whole-file scan is the fallback. This preserves the
    // pre-Phase-12 behavior on greenfield repos + fixtures without git.
    const runGit = () => '';
    const report = captureSessionEndHygiene({
      projectRoot: fx.root,
      featureSlug: 'hygiene',
      targetVersion: '1.0',
      inProgressDirName: '001-IN-PROGRESS',
      sessionStartSha: null,
      runGit,
      runGh: stubGh('[]'),
      now: new Date('2026-05-28T00:00:00Z'),
    });
    const tbd = report.observations.filter((o) => o.category === 'workplan-tbd-introduced');
    expect(tbd.length).toBeGreaterThan(0);
    expect(tbd[0]?.markerText).toContain('TBD');
  });

  it('derives the issues-filed list from #NNN refs in commit subjects (commit-range scan)', () => {
    // Phase 12 Medium fix: the issue scan walks `git log <sha>..HEAD` and
    // gh-issue-views each unique #NNN ref. The old shape queried
    // `gh issue list --author @me --search "created:>=<iso>"` and swept in
    // same-user issues filed from other branches.
    const runGit = (args: readonly string[]) => {
      if (args[0] === 'rev-parse' && args[1] === '--verify') return 'abc000\n';
      if (args[0] === 'log' && (args[1] ?? '').startsWith('--format=')) {
        return commitLogPayload([
          { subject: 'feat(x): close #401 fix the thing' },
          { subject: 'fix(y): address #402' },
        ]);
      }
      return '';
    };
    const runGh = makeIssueViewStub({
      401: { title: 'Test issue one', state: 'OPEN' },
      402: { title: 'Test issue two', state: 'OPEN' },
    });
    const report = captureSessionEndHygiene({
      projectRoot: fx.root,
      featureSlug: 'hygiene',
      targetVersion: '1.0',
      inProgressDirName: '001-IN-PROGRESS',
      sessionStartSha: 'abc000',
      runGit,
      runGh,
      now: new Date('2026-05-28T00:00:00Z'),
    });
    const issues = report.observations.filter((o) => o.category === 'issue-filed-this-session');
    expect(issues).toHaveLength(2);
    expect(issues[0]?.issueNumber).toBe(401);
    expect(issues[1]?.issueNumber).toBe(402);
  });

  it('renders a markdown block with both headings', () => {
    const runGit = () => '';
    const report = captureSessionEndHygiene({
      projectRoot: fx.root,
      featureSlug: 'hygiene',
      targetVersion: '1.0',
      inProgressDirName: '001-IN-PROGRESS',
      sessionStartSha: null,
      runGit,
      runGh: stubGh('[]'),
      now: new Date('2026-05-28T00:00:00Z'),
    });
    expect(report.markdownBlock).toContain(HYGIENE_OBSERVATIONS_HEADING);
    expect(report.markdownBlock).toContain(NEXT_RECOMMENDATION_HEADING);
  });

  it('finds the first unchecked workplan task as the Resume hint', () => {
    const runGit = () => '';
    const report = captureSessionEndHygiene({
      projectRoot: fx.root,
      featureSlug: 'hygiene',
      targetVersion: '1.0',
      inProgressDirName: '001-IN-PROGRESS',
      sessionStartSha: null,
      runGit,
      runGh: stubGh('[]'),
      now: new Date('2026-05-28T00:00:00Z'),
    });
    expect(report.recommendation.resumeTask).toContain('Task 1');
  });

  it('handles an empty session range gracefully', () => {
    const runGit = () => '';
    const report = captureSessionEndHygiene({
      projectRoot: fx.root,
      featureSlug: 'no-such-feature',
      targetVersion: '1.0',
      inProgressDirName: '001-IN-PROGRESS',
      sessionStartSha: null,
      runGit,
      runGh: stubGh(''),
      now: new Date('2026-05-28T00:00:00Z'),
    });
    expect(report.observations).toHaveLength(0);
    expect(report.markdownBlock).toContain('no hygiene-relevant signals');
  });

  it('gracefully degrades when gh fails during per-issue view', () => {
    // Resolve a boundary SHA + return a commit referencing #501 so the
    // gh-view path is actually exercised. gh throws on view; observation
    // list ends empty.
    const runGit = (args: readonly string[]) => {
      if (args[0] === 'rev-parse' && args[1] === '--verify') return 'abc000\n';
      if (args[0] === 'log' && (args[1] ?? '').startsWith('--format=')) {
        return commitLogPayload([{ subject: 'fix: close #501' }]);
      }
      return '';
    };
    const failingGh = () => {
      throw new Error('gh: not installed');
    };
    const report = captureSessionEndHygiene({
      projectRoot: fx.root,
      featureSlug: 'hygiene',
      targetVersion: '1.0',
      inProgressDirName: '001-IN-PROGRESS',
      sessionStartSha: 'abc000',
      runGit,
      runGh: failingGh,
      now: new Date('2026-05-28T00:00:00Z'),
    });
    const issues = report.observations.filter((o) => o.category === 'issue-filed-this-session');
    expect(issues).toHaveLength(0);
  });

  it('uses `git log <sha>..HEAD` as the range when --session-start-sha is supplied (real git fixture)', () => {
    // Real git fixture: init a repo, one commit, take its SHA. The new
    // scanner verifies the SHA via `rev-parse --verify` and walks
    // `git log <sha>..HEAD --format=...`. Pre-Phase-12 this called
    // `git show -s --format=%cI <sha>` and passed the ISO to gh; the test
    // asserts the new range shape lands in the log invocation.
    const gitRoot = mkdtempSync(join(tmpdir(), 'dw-session-end-git-'));
    try {
      const runRepoGit = (args: readonly string[]) =>
        execFileSync('git', [...args], {
          cwd: gitRoot,
          encoding: 'utf8',
          env: { ...process.env, LC_ALL: 'C' },
        });
      runRepoGit(['init', '--quiet']);
      runRepoGit(['config', 'user.email', 'test@example.com']);
      runRepoGit(['config', 'user.name', 'Test']);
      runRepoGit(['commit', '--allow-empty', '-m', 'initial commit']);
      const sha = runRepoGit(['rev-parse', 'HEAD']).trim();

      const seenArgvs: string[][] = [];
      const runGit = (args: readonly string[]): string => {
        seenArgvs.push([...args]);
        return runRepoGit(args);
      };
      const runGh = stubGh('');

      captureSessionEndHygiene({
        projectRoot: fx.root,
        featureSlug: 'hygiene',
        targetVersion: '1.0',
        inProgressDirName: '001-IN-PROGRESS',
        sessionStartSha: sha,
        runGit,
        runGh,
        now: new Date('2026-05-28T00:00:00Z'),
      });

      const logCall = seenArgvs.find(
        (argv) =>
          argv[0] === 'log' &&
          (argv[1] ?? '').startsWith('--format=') &&
          argv[2] === `${sha}..HEAD`,
      );
      expect(logCall).toBeDefined();

      // The pre-Phase-12 ISO-search shape MUST NOT appear: confirm no gh
      // search invocation was prepared via a `git show -s --format=%cI`
      // detour. (The new scan-pipeline only uses `rev-parse --verify` /
      // `merge-base` / `log` / `diff` against git.)
      const isoLookup = seenArgvs.find(
        (argv) => argv[0] === 'show' && argv[1] === '-s' && argv[2] === '--format=%cI',
      );
      expect(isoLookup).toBeUndefined();
    } finally {
      rmSync(gitRoot, { recursive: true, force: true });
    }
  });

  it('partitions OPEN and CLOSED issues — Triage line lists only OPEN', () => {
    const runGit = (args: readonly string[]) => {
      if (args[0] === 'rev-parse' && args[1] === '--verify') return 'abc000\n';
      if (args[0] === 'log' && (args[1] ?? '').startsWith('--format=')) {
        return commitLogPayload([
          { subject: 'fix: close #501 — open issue' },
          { subject: 'fix: close #502 — already closed' },
        ]);
      }
      return '';
    };
    const runGh = makeIssueViewStub({
      501: { title: 'Open issue still triageable', state: 'OPEN' },
      502: { title: 'Closed by merged PR', state: 'CLOSED' },
    });
    const report = captureSessionEndHygiene({
      projectRoot: fx.root,
      featureSlug: 'hygiene',
      targetVersion: '1.0',
      inProgressDirName: '001-IN-PROGRESS',
      sessionStartSha: 'abc000',
      runGit,
      runGh,
      now: new Date('2026-05-28T00:00:00Z'),
    });
    const issues = report.observations.filter((o) => o.category === 'issue-filed-this-session');
    expect(issues).toHaveLength(2);
    expect(report.markdownBlock).toContain('#501');
    expect(report.markdownBlock).toContain('[OPEN]');
    expect(report.markdownBlock).toContain('#502');
    expect(report.markdownBlock).toContain('[CLOSED]');
    expect(report.recommendation.triageItems).toHaveLength(1);
    expect(report.recommendation.triageItems[0]).toContain('#501');
    expect(report.recommendation.triageItems.join(' ')).not.toContain('#502');
  });

  it('coalesces a multi-marker workplan line into one observation entry', () => {
    writeFileSync(
      fx.workplanPath,
      [
        '# Workplan: hygiene',
        '',
        '## Phase X',
        '',
        '- [ ] Step 2: TBD: / defer / follow-up: / out of scope',
        '',
      ].join('\n'),
      'utf8',
    );
    const runGit = () => '';
    const report = captureSessionEndHygiene({
      projectRoot: fx.root,
      featureSlug: 'hygiene',
      targetVersion: '1.0',
      inProgressDirName: '001-IN-PROGRESS',
      sessionStartSha: null,
      runGit,
      runGh: stubGh('[]'),
      now: new Date('2026-05-28T00:00:00Z'),
    });
    const tbd = report.observations.filter((o) => o.category === 'workplan-tbd-introduced');
    expect(tbd).toHaveLength(1);
    const text = tbd[0]?.markerText ?? '';
    expect(text).toContain('TBD');
    expect(text).toContain('defer');
    expect(text).toContain('follow-up');
    expect(text).toContain('out-of-scope');
  });

  it('excludes undefined-state issues from the Triage line', () => {
    const runGit = (args: readonly string[]) => {
      if (args[0] === 'rev-parse' && args[1] === '--verify') return 'abc000\n';
      if (args[0] === 'log' && (args[1] ?? '').startsWith('--format=')) {
        return commitLogPayload([
          { subject: 'feat: ref #601 — drift payload, no state field' },
          { subject: 'fix: ref #602 — healthy open issue' },
        ]);
      }
      return '';
    };
    // Issue 601 ships without a `state` field → issueState=undefined.
    const runGh = makeIssueViewStub({
      601: { title: 'Stateless issue (schema drift)' },
      602: { title: 'Healthy open issue', state: 'OPEN' },
    });
    const report = captureSessionEndHygiene({
      projectRoot: fx.root,
      featureSlug: 'hygiene',
      targetVersion: '1.0',
      inProgressDirName: '001-IN-PROGRESS',
      sessionStartSha: 'abc000',
      runGit,
      runGh,
      now: new Date('2026-05-28T00:00:00Z'),
    });
    expect(report.recommendation.triageItems).toHaveLength(1);
    expect(report.recommendation.triageItems[0]).toContain('#602');
    expect(report.recommendation.triageItems.join(' ')).not.toContain('#601');
    const issues = report.observations.filter((o) => o.category === 'issue-filed-this-session');
    expect(issues.map((i) => i.issueNumber)).toContain(601);
  });

  it('falls back to merge-base SHA when no --session-start-sha (real git fixture)', () => {
    const gitRoot = mkdtempSync(join(tmpdir(), 'dw-session-end-mb-'));
    try {
      const runRepoGit = (args: readonly string[]) =>
        execFileSync('git', [...args], {
          cwd: gitRoot,
          encoding: 'utf8',
          env: { ...process.env, LC_ALL: 'C' },
        });
      runRepoGit(['init', '--quiet']);
      runRepoGit(['config', 'user.email', 'test@example.com']);
      runRepoGit(['config', 'user.name', 'Test']);
      runRepoGit(['commit', '--allow-empty', '-m', 'initial commit']);
      const baseSha = runRepoGit(['rev-parse', 'HEAD']).trim();
      runRepoGit(['update-ref', 'refs/remotes/origin/main', baseSha]);
      runRepoGit(['commit', '--allow-empty', '-m', 'second commit']);
      runRepoGit(['commit', '--allow-empty', '-m', 'third commit']);

      const seenArgvs: string[][] = [];
      const runGit = (args: readonly string[]): string => {
        seenArgvs.push([...args]);
        return runRepoGit(args);
      };
      const runGh = stubGh('');

      captureSessionEndHygiene({
        projectRoot: fx.root,
        featureSlug: 'hygiene',
        targetVersion: '1.0',
        inProgressDirName: '001-IN-PROGRESS',
        sessionStartSha: null,
        runGit,
        runGh,
        now: new Date('2026-05-28T00:00:00Z'),
      });

      const logCall = seenArgvs.find(
        (argv) =>
          argv[0] === 'log' &&
          (argv[1] ?? '').startsWith('--format=') &&
          argv[2] === `${baseSha}..HEAD`,
      );
      expect(logCall).toBeDefined();
    } finally {
      rmSync(gitRoot, { recursive: true, force: true });
    }
  });

  it('falls back to HEAD~10 SHA when origin/main is absent (real git fixture)', () => {
    const gitRoot = mkdtempSync(join(tmpdir(), 'dw-session-end-h10-'));
    try {
      const runRepoGit = (args: readonly string[]) =>
        execFileSync('git', [...args], {
          cwd: gitRoot,
          encoding: 'utf8',
          env: { ...process.env, LC_ALL: 'C' },
        });
      runRepoGit(['init', '--quiet']);
      runRepoGit(['config', 'user.email', 'test@example.com']);
      runRepoGit(['config', 'user.name', 'Test']);
      for (let i = 0; i < 15; i += 1) {
        runRepoGit(['commit', '--allow-empty', '-m', `commit ${i}`]);
      }
      const head10Sha = runRepoGit(['rev-parse', '--verify', 'HEAD~10']).trim();

      const seenArgvs: string[][] = [];
      const runGit = (args: readonly string[]): string => {
        seenArgvs.push([...args]);
        return runRepoGit(args);
      };
      const runGh = stubGh('');

      captureSessionEndHygiene({
        projectRoot: fx.root,
        featureSlug: 'hygiene',
        targetVersion: '1.0',
        inProgressDirName: '001-IN-PROGRESS',
        sessionStartSha: null,
        runGit,
        runGh,
        now: new Date('2026-05-28T00:00:00Z'),
      });

      const logCall = seenArgvs.find(
        (argv) =>
          argv[0] === 'log' &&
          (argv[1] ?? '').startsWith('--format=') &&
          argv[2] === `${head10Sha}..HEAD`,
      );
      expect(logCall).toBeDefined();
    } finally {
      rmSync(gitRoot, { recursive: true, force: true });
    }
  });

  // --- Phase 12 Step 3: acceptance tests for #361 / commit-range scoping ---

  it('Phase 12 (a): same-user issue NOT referenced by a session commit is excluded', () => {
    // The classic #340-shaped failure mode: two issues exist in the
    // session-boundary time window authored by the same GitHub user, but
    // only ONE was actually touched by this session. The old scanner
    // surfaced both; the Phase 12 scanner surfaces only the referenced one.
    //
    // In the new shape, the implementation NEVER queries the time window at
    // all — it derives the candidate set from #NNN refs in commit subjects
    // + bodies. The test makes the runGh stub fail loudly for the
    // unreferenced number (#999) to prove the scanner never asks about it.
    const runGit = (args: readonly string[]) => {
      if (args[0] === 'rev-parse' && args[1] === '--verify') return 'abc000\n';
      if (args[0] === 'log' && (args[1] ?? '').startsWith('--format=')) {
        // Only #501 is referenced. #999 was filed in the same time window
        // from another branch but is not part of THIS session's commits.
        return commitLogPayload([{ subject: 'fix: close #501 — actually this session' }]);
      }
      return '';
    };
    const seenViews: number[] = [];
    const runGh = (args: readonly string[]) => {
      if (args[0] === 'issue' && args[1] === 'view') {
        const n = parseInt(args[2] ?? '', 10);
        seenViews.push(n);
        if (n === 999) {
          throw new Error('Phase 12: scanner must NOT ask about unreferenced #999');
        }
        if (n === 501) {
          return JSON.stringify({
            number: 501,
            title: 'Real session work',
            state: 'OPEN',
          });
        }
      }
      return '';
    };
    const report = captureSessionEndHygiene({
      projectRoot: fx.root,
      featureSlug: 'hygiene',
      targetVersion: '1.0',
      inProgressDirName: '001-IN-PROGRESS',
      sessionStartSha: 'abc000',
      runGit,
      runGh,
      now: new Date('2026-05-28T00:00:00Z'),
    });
    expect(seenViews).toEqual([501]);
    const issues = report.observations.filter((o) => o.category === 'issue-filed-this-session');
    expect(issues).toHaveLength(1);
    expect(issues[0]?.issueNumber).toBe(501);
  });

  it('Phase 12 (b): #NNN in a commit BODY (not subject) is still surfaced', () => {
    // Commit subjects don't always carry every issue reference. The
    // `Closes #NNN` line often lives in the body. The scanner must walk
    // BOTH halves of each commit record.
    const runGit = (args: readonly string[]) => {
      if (args[0] === 'rev-parse' && args[1] === '--verify') return 'abc000\n';
      if (args[0] === 'log' && (args[1] ?? '').startsWith('--format=')) {
        return commitLogPayload([
          {
            subject: 'feat(x): add new thing',
            body: 'Closes #777\n\nLonger body with context.',
          },
        ]);
      }
      return '';
    };
    const runGh = makeIssueViewStub({
      777: { title: 'Body-referenced issue', state: 'OPEN' },
    });
    const report = captureSessionEndHygiene({
      projectRoot: fx.root,
      featureSlug: 'hygiene',
      targetVersion: '1.0',
      inProgressDirName: '001-IN-PROGRESS',
      sessionStartSha: 'abc000',
      runGit,
      runGh,
      now: new Date('2026-05-28T00:00:00Z'),
    });
    const issues = report.observations.filter((o) => o.category === 'issue-filed-this-session');
    expect(issues).toHaveLength(1);
    expect(issues[0]?.issueNumber).toBe(777);
  });

  it('Phase 12 (c): TBD-scanner reports only markers introduced by the session diff', () => {
    // Real git fixture. The workplan starts with a TBD on line 5
    // (pre-existing prose). A subsequent commit adds a NEW TBD on line 7.
    // The session-diff filter must surface ONLY line 7 — not line 5.
    const gitRoot = mkdtempSync(join(tmpdir(), 'dw-session-end-diff-'));
    try {
      const runRepoGit = (args: readonly string[]) =>
        execFileSync('git', [...args], {
          cwd: gitRoot,
          encoding: 'utf8',
          env: { ...process.env, LC_ALL: 'C' },
        });
      runRepoGit(['init', '--quiet']);
      runRepoGit(['config', 'user.email', 'test@example.com']);
      runRepoGit(['config', 'user.name', 'Test']);

      // Stage 1: workplan with pre-existing TBD on line 5.
      const featureDir = join(gitRoot, 'docs', '1.0', '001-IN-PROGRESS', 'hygiene');
      mkdirSync(featureDir, { recursive: true });
      const workplanPath = join(featureDir, 'workplan.md');
      writeFileSync(
        workplanPath,
        [
          '# Workplan: hygiene',
          '',
          '## Phase A (pre-existing)',
          '',
          '- [ ] Task 1: pre-existing TBD: from older session',
          '',
        ].join('\n'),
        'utf8',
      );
      runRepoGit(['add', '-A']);
      runRepoGit(['commit', '-m', 'pre-existing workplan']);
      const baseSha = runRepoGit(['rev-parse', 'HEAD']).trim();

      // Stage 2: append a new TBD on line 7.
      writeFileSync(
        workplanPath,
        [
          '# Workplan: hygiene',
          '',
          '## Phase A (pre-existing)',
          '',
          '- [ ] Task 1: pre-existing TBD: from older session',
          '',
          '- [ ] Task 2: NEW TBD: introduced this session',
          '',
        ].join('\n'),
        'utf8',
      );
      runRepoGit(['add', '-A']);
      runRepoGit(['commit', '-m', 'add new TBD this session']);

      const runGit = (args: readonly string[]): string => runRepoGit(args);
      const runGh = stubGh('');

      const report = captureSessionEndHygiene({
        projectRoot: gitRoot,
        featureSlug: 'hygiene',
        targetVersion: '1.0',
        inProgressDirName: '001-IN-PROGRESS',
        sessionStartSha: baseSha,
        runGit,
        runGh,
        now: new Date('2026-05-28T00:00:00Z'),
      });
      const tbd = report.observations.filter((o) => o.category === 'workplan-tbd-introduced');
      // The pre-existing line 5 marker MUST NOT appear; the line 7 marker MUST.
      expect(tbd).toHaveLength(1);
      expect(tbd[0]?.lineNumber).toBe(7);
      expect(tbd[0]?.markerText).toContain('NEW TBD');
    } finally {
      rmSync(gitRoot, { recursive: true, force: true });
    }
  });

  it('Phase 12 (d): no-SHA fallback does not sweep in spurious issues', () => {
    // sessionStartSha=null + stubbed runGit that returns "" for every
    // command → resolver returns ok:false → scanner skips the gh path
    // entirely. The pre-Phase-12 failure mode was that the no-SHA path
    // still issued a `created:>=<today>` query that swept the entire user's
    // issue history; the new path emits zero observations instead.
    const runGit = () => '';
    const ghWasCalled: string[][] = [];
    const runGh = (args: readonly string[]) => {
      ghWasCalled.push([...args]);
      // Even if gh WERE called, simulate a population of unrelated issues.
      return JSON.stringify([{ number: 999, title: 'Unrelated', state: 'OPEN' }]);
    };
    const report = captureSessionEndHygiene({
      projectRoot: fx.root,
      featureSlug: 'hygiene',
      targetVersion: '1.0',
      inProgressDirName: '001-IN-PROGRESS',
      sessionStartSha: null,
      runGit,
      runGh,
      now: new Date('2026-05-28T00:00:00Z'),
    });
    const issues = report.observations.filter((o) => o.category === 'issue-filed-this-session');
    expect(issues).toHaveLength(0);
    expect(ghWasCalled).toHaveLength(0);
  });
});
