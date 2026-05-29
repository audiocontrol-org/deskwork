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
    // The promoted `[debt: #999]` line is filtered by the scanner; the bare
    // TBD line is captured.
    expect(tbd.length).toBeGreaterThan(0);
    expect(tbd[0]?.markerText).toContain('TBD');
  });

  it('surfaces gh-listed issues filed this session', () => {
    // Stub git so the session-boundary resolver yields a usable ISO
    // timestamp from --session-start-sha. Each step of the resolver hits
    // git with a specific argv shape; the stub returns the timestamp for
    // the `show -s --format=%cI <sha>` form.
    const runGit = (args: readonly string[]) => {
      if (args[0] === 'show' && args[1] === '-s' && args[2] === '--format=%cI') {
        return '2026-05-28T15:00:00+00:00\n';
      }
      return '';
    };
    const ghJson = JSON.stringify([
      { number: 401, title: 'Test issue one', state: 'OPEN' },
      { number: 402, title: 'Test issue two', state: 'OPEN' },
    ]);
    const report = captureSessionEndHygiene({
      projectRoot: fx.root,
      featureSlug: 'hygiene',
      targetVersion: '1.0',
      inProgressDirName: '001-IN-PROGRESS',
      sessionStartSha: 'abc000',
      runGit,
      runGh: stubGh(ghJson),
      now: new Date('2026-05-28T00:00:00Z'),
    });
    const issues = report.observations.filter((o) => o.category === 'issue-filed-this-session');
    expect(issues).toHaveLength(2);
    expect(issues[0]?.issueNumber).toBe(401);
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

  it('gracefully degrades when gh fails', () => {
    // Resolve a session boundary so the gh call is actually exercised
    // (otherwise the helper short-circuits before reaching gh and the
    // "gh failure" path is never tested).
    const runGit = (args: readonly string[]) => {
      if (args[0] === 'show' && args[1] === '-s' && args[2] === '--format=%cI') {
        return '2026-05-28T15:00:00+00:00\n';
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

  it('builds a session-scope gh search from --session-start-sha (real git fixture)', () => {
    // Real git fixture: init a repo, make one commit, take its SHA. The
    // session-end helper translates that SHA to an ISO committer-date
    // timestamp via `git show -s --format=%cI <sha>` and passes
    // `created:>=<iso>` to gh — the bug at #340 was that it passed
    // `created:<today>` instead.
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
      const expectedIso = runRepoGit(['show', '-s', '--format=%cI', sha]).trim();

      let capturedSearch: string | null = null;
      const runGh = (args: readonly string[]): string => {
        const idx = args.indexOf('--search');
        if (idx >= 0 && args[idx + 1] !== undefined) {
          capturedSearch = args[idx + 1] ?? null;
        }
        return '[]';
      };

      captureSessionEndHygiene({
        projectRoot: fx.root,
        featureSlug: 'hygiene',
        targetVersion: '1.0',
        inProgressDirName: '001-IN-PROGRESS',
        sessionStartSha: sha,
        runGit: runRepoGit,
        runGh,
        now: new Date('2026-05-28T00:00:00Z'),
      });
      expect(capturedSearch).not.toBeNull();
      expect(capturedSearch).toContain(`created:>=${expectedIso}`);
      expect(capturedSearch).not.toMatch(/created:\d{4}-\d{2}-\d{2}\s*$/);
    } finally {
      rmSync(gitRoot, { recursive: true, force: true });
    }
  });

  it('partitions OPEN and CLOSED issues — Triage line lists only OPEN', () => {
    const runGit = (args: readonly string[]) => {
      if (args[0] === 'show' && args[1] === '-s' && args[2] === '--format=%cI') {
        return '2026-05-28T15:00:00+00:00\n';
      }
      return '';
    };
    const ghJson = JSON.stringify([
      { number: 501, title: 'Open issue still triageable', state: 'OPEN' },
      { number: 502, title: 'Closed by merged PR', state: 'CLOSED' },
    ]);
    const report = captureSessionEndHygiene({
      projectRoot: fx.root,
      featureSlug: 'hygiene',
      targetVersion: '1.0',
      inProgressDirName: '001-IN-PROGRESS',
      sessionStartSha: 'abc000',
      runGit,
      runGh: stubGh(ghJson),
      now: new Date('2026-05-28T00:00:00Z'),
    });
    // Observations cite BOTH issues (historical signal) with state badges.
    const issues = report.observations.filter((o) => o.category === 'issue-filed-this-session');
    expect(issues).toHaveLength(2);
    expect(report.markdownBlock).toContain('#501');
    expect(report.markdownBlock).toContain('[OPEN]');
    expect(report.markdownBlock).toContain('#502');
    expect(report.markdownBlock).toContain('[CLOSED]');
    // Triage line lists ONLY the open issue.
    expect(report.recommendation.triageItems).toHaveLength(1);
    expect(report.recommendation.triageItems[0]).toContain('#501');
    expect(report.recommendation.triageItems.join(' ')).not.toContain('#502');
  });

  it('coalesces a multi-marker workplan line into one observation entry', () => {
    // Replace the fixture workplan with one whose Step 2 line carries
    // every TBD-style marker. Pre-#340 this emitted 4 near-identical
    // observation entries; post-fix it emits exactly 1 entry naming all 4.
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
    // Marker display casing mirrors the spec brief
    // (TBD uppercase as a proper noun; the rest lowercase / hyphen-joined).
    expect(text).toContain('TBD');
    expect(text).toContain('defer');
    expect(text).toContain('follow-up');
    expect(text).toContain('out-of-scope');
  });

  it('excludes undefined-state issues from the Triage line', () => {
    // A gh JSON entry with no `state` field (malformed payload or schema
    // drift) lands as `issueState: undefined` on the observation. The
    // Triage line gates strictly on OPEN, so this entry must NOT appear
    // there. It IS still surfaced in the observations block (historical
    // signal) but with no state badge attached.
    const runGit = (args: readonly string[]) => {
      if (args[0] === 'show' && args[1] === '-s' && args[2] === '--format=%cI') {
        return '2026-05-28T15:00:00+00:00\n';
      }
      return '';
    };
    const ghJson = JSON.stringify([
      { number: 601, title: 'Stateless issue (schema drift)' },
      { number: 602, title: 'Healthy open issue', state: 'OPEN' },
    ]);
    const report = captureSessionEndHygiene({
      projectRoot: fx.root,
      featureSlug: 'hygiene',
      targetVersion: '1.0',
      inProgressDirName: '001-IN-PROGRESS',
      sessionStartSha: 'abc000',
      runGit,
      runGh: stubGh(ghJson),
      now: new Date('2026-05-28T00:00:00Z'),
    });
    expect(report.recommendation.triageItems).toHaveLength(1);
    expect(report.recommendation.triageItems[0]).toContain('#602');
    expect(report.recommendation.triageItems.join(' ')).not.toContain('#601');
    // Observations block still cites #601 for historical signal.
    const issues = report.observations.filter((o) => o.category === 'issue-filed-this-session');
    expect(issues.map((i) => i.issueNumber)).toContain(601);
  });

  it('falls back to merge-base committer-date when no --session-start-sha (real git fixture)', () => {
    // Init a repo, point `refs/remotes/origin/main` at the initial commit,
    // then add two more commits on HEAD. The session-boundary resolver
    // should land on step 2 (merge-base of HEAD with origin/main) and pass
    // the initial commit's committer-date to gh's `created:>=` filter.
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
      const expectedIso = runRepoGit(['show', '-s', '--format=%cI', baseSha]).trim();

      let capturedSearch: string | null = null;
      const runGh = (args: readonly string[]): string => {
        const idx = args.indexOf('--search');
        if (idx >= 0 && args[idx + 1] !== undefined) {
          capturedSearch = args[idx + 1] ?? null;
        }
        return '[]';
      };

      captureSessionEndHygiene({
        projectRoot: fx.root,
        featureSlug: 'hygiene',
        targetVersion: '1.0',
        inProgressDirName: '001-IN-PROGRESS',
        sessionStartSha: null,
        runGit: runRepoGit,
        runGh,
        now: new Date('2026-05-28T00:00:00Z'),
      });
      expect(capturedSearch).not.toBeNull();
      expect(capturedSearch).toContain(`created:>=${expectedIso}`);
    } finally {
      rmSync(gitRoot, { recursive: true, force: true });
    }
  });

  it('falls back to HEAD~10 committer-date when origin/main is absent (real git fixture)', () => {
    // Init a repo with 15 commits and DO NOT set up `refs/remotes/origin/main`.
    // The session-boundary resolver should skip step 2 (merge-base fails)
    // and land on step 3 (HEAD~10 committer-date).
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
      const expectedIso = runRepoGit(['show', '-s', '--format=%cI', 'HEAD~10']).trim();

      let capturedSearch: string | null = null;
      const runGh = (args: readonly string[]): string => {
        const idx = args.indexOf('--search');
        if (idx >= 0 && args[idx + 1] !== undefined) {
          capturedSearch = args[idx + 1] ?? null;
        }
        return '[]';
      };

      captureSessionEndHygiene({
        projectRoot: fx.root,
        featureSlug: 'hygiene',
        targetVersion: '1.0',
        inProgressDirName: '001-IN-PROGRESS',
        sessionStartSha: null,
        runGit: runRepoGit,
        runGh,
        now: new Date('2026-05-28T00:00:00Z'),
      });
      expect(capturedSearch).not.toBeNull();
      expect(capturedSearch).toContain(`created:>=${expectedIso}`);
    } finally {
      rmSync(gitRoot, { recursive: true, force: true });
    }
  });
});
