import { describe, it, expect, beforeEach, afterEach } from 'vitest';
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
    const runGit = () => '';
    const ghJson = JSON.stringify([
      { number: 401, title: 'Test issue one' },
      { number: 402, title: 'Test issue two' },
    ]);
    const report = captureSessionEndHygiene({
      projectRoot: fx.root,
      featureSlug: 'hygiene',
      targetVersion: '1.0',
      inProgressDirName: '001-IN-PROGRESS',
      sessionStartSha: null,
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
    const runGit = () => '';
    const failingGh = () => {
      throw new Error('gh: not installed');
    };
    const report = captureSessionEndHygiene({
      projectRoot: fx.root,
      featureSlug: 'hygiene',
      targetVersion: '1.0',
      inProgressDirName: '001-IN-PROGRESS',
      sessionStartSha: null,
      runGit,
      runGh: failingGh,
      now: new Date('2026-05-28T00:00:00Z'),
    });
    const issues = report.observations.filter((o) => o.category === 'issue-filed-this-session');
    expect(issues).toHaveLength(0);
  });
});
