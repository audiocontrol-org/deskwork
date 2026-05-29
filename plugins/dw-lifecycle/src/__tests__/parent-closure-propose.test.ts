import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  propose,
  ProposalOutputExistsError,
} from '../lifecycle-integration/parent-closure/propose.js';
import type { ProposalFile } from '../lifecycle-integration/parent-closure/types.js';

interface Fixture {
  root: string;
  workplanPath: string;
  featureDir: string;
}

function setup(): Fixture {
  const root = mkdtempSync(join(tmpdir(), 'dw-parent-closure-propose-'));
  const featureDir = join(root, 'docs', '1.0', '001-IN-PROGRESS', 'hygiene');
  return { root, workplanPath: join(root, 'workplan.md'), featureDir };
}

function makeWalkerStub(states: Record<number, { state: string; title: string }>) {
  return (args: readonly string[]): string => {
    if (args[0] === 'issue' && args[1] === 'list') {
      // Empty title-search to keep parent set to just the explicit parent.
      return '[]';
    }
    if (args[0] === 'api') {
      return '[]';
    }
    if (args[0] === 'issue' && args[1] === 'view') {
      const n = Number.parseInt(args[2] ?? '0', 10);
      const s = states[n];
      if (s === undefined) {
        return JSON.stringify({
          number: n,
          title: '',
          state: 'OPEN',
          url: '',
        });
      }
      return JSON.stringify({
        number: n,
        title: s.title,
        state: s.state,
        url: `u${n}`,
      });
    }
    return '';
  };
}

const FAKE_SHA = '1234567890abcdef1234567890abcdef12345678';

function makeGitStub(headSha: string = FAKE_SHA) {
  return (args: readonly string[]): string => {
    if (args[0] === 'rev-parse' && args[1] === 'HEAD') return `${headSha}\n`;
    return '';
  };
}

describe('propose', () => {
  let fx: Fixture;
  beforeEach(() => {
    fx = setup();
  });
  afterEach(() => rmSync(fx.root, { recursive: true, force: true }));

  it('writes proposal JSON + markdown table; closure_comment cites feature-complete SHA', () => {
    writeFileSync(
      fx.workplanPath,
      [
        '## Phase 0: setup  ·  [#324](https://github.com/o/r/issues/324)',
        '## Phase 1: baseline  ·  [#325](https://github.com/o/r/issues/325)',
      ].join('\n'),
      'utf8',
    );
    const runGh = makeWalkerStub({
      323: { state: 'OPEN', title: 'feat(hygiene): parent' },
      324: { state: 'CLOSED', title: 'feat(hygiene): phase 0' },
      325: { state: 'CLOSED', title: 'feat(hygiene): phase 1' },
    });
    const outputPath = join(fx.root, 'p.json');
    const result = propose({
      slug: 'hygiene',
      parentIssue: 323,
      workplanPath: fx.workplanPath,
      featureDir: fx.featureDir,
      repo: 'o/r',
      projectRoot: fx.root,
      now: new Date('2026-05-28T12:00:00.000Z'),
      runGh,
      runGit: makeGitStub(),
      outputPath,
    });
    expect(existsSync(outputPath)).toBe(true);
    const parsed: ProposalFile = JSON.parse(readFileSync(outputPath, 'utf8'));
    expect(parsed.parent_issue).toBe(323);
    expect(parsed.feature_complete_sha).toBe(FAKE_SHA);
    expect(parsed.items).toHaveLength(1);
    const parent = parsed.items[0];
    expect(parent?.classification).toBe('close-all-children-closed');
    expect(parent?.closure_comment).toBeTruthy();
    // Closure comment cites the SHA AND the closed child list.
    expect(parent?.closure_comment).toContain(FAKE_SHA);
    expect(parent?.closure_comment).toContain('#324');
    expect(parent?.closure_comment).toContain('#325');
    // Markdown table has the FILL IN columns.
    expect(result.markdownTable).toContain('Disposition (FILL IN)');
    expect(result.markdownTable).toContain('Closure comment (FILL IN');
    expect(result.markdownTable).toContain('#323');
  });

  it('filters skip-* rows out of the proposal items but reports them in `skipped`', () => {
    writeFileSync(fx.workplanPath, '', 'utf8');
    const runGh = (args: readonly string[]): string => {
      if (args[0] === 'issue' && args[1] === 'list') {
        return JSON.stringify([
          {
            number: 700,
            // Title without `hygiene` substring -> skip-not-this-feature.
            // The title-search response IS the canonical title source for
            // walker classification; the walker no longer round-trips via
            // `gh issue view` for title-search hits.
            title: 'unrelated work',
            state: 'OPEN',
            url: 'u',
          },
        ]);
      }
      if (args[0] === 'api') return '[]';
      if (args[0] === 'issue' && args[1] === 'view') {
        const n = Number.parseInt(args[2] ?? '0', 10);
        if (n === 323)
          return JSON.stringify({
            number: 323,
            title: 'feat(hygiene): parent',
            state: 'OPEN',
            url: 'u',
          });
        if (n === 700)
          return JSON.stringify({
            number: 700,
            title: 'unrelated work',
            state: 'OPEN',
            url: 'u',
          });
      }
      return '';
    };
    const outputPath = join(fx.root, 'p.json');
    const result = propose({
      slug: 'hygiene',
      parentIssue: 323,
      workplanPath: fx.workplanPath,
      featureDir: fx.featureDir,
      repo: 'o/r',
      projectRoot: fx.root,
      now: new Date(),
      runGh,
      runGit: makeGitStub(),
      outputPath,
    });
    // Parent #323 stays; #700 is filtered into `skipped`.
    expect(result.proposalFile.items.map((i) => i.number)).toEqual([323]);
    expect(result.skipped.find((s) => s.number === 700)).toBeTruthy();
  });

  it('throws ProposalOutputExistsError when the output exists and --force is not set', () => {
    writeFileSync(fx.workplanPath, '', 'utf8');
    const outputPath = join(fx.root, 'p.json');
    writeFileSync(outputPath, '{}', 'utf8');
    const runGh = makeWalkerStub({
      323: { state: 'OPEN', title: 'feat(hygiene): parent' },
    });
    expect(() =>
      propose({
        slug: 'hygiene',
        parentIssue: 323,
        workplanPath: fx.workplanPath,
        featureDir: fx.featureDir,
        repo: 'o/r',
        projectRoot: fx.root,
        now: new Date(),
        runGh,
        runGit: makeGitStub(),
        outputPath,
      }),
    ).toThrow(ProposalOutputExistsError);
  });

  it('overwrites an existing output file when --force is set', () => {
    writeFileSync(fx.workplanPath, '', 'utf8');
    const outputPath = join(fx.root, 'p.json');
    writeFileSync(outputPath, '{"stale": true}', 'utf8');
    const runGh = makeWalkerStub({
      323: { state: 'OPEN', title: 'feat(hygiene): parent' },
    });
    propose({
      slug: 'hygiene',
      parentIssue: 323,
      workplanPath: fx.workplanPath,
      featureDir: fx.featureDir,
      repo: 'o/r',
      projectRoot: fx.root,
      now: new Date(),
      runGh,
      runGit: makeGitStub(),
      outputPath,
      force: true,
    });
    const parsed = JSON.parse(readFileSync(outputPath, 'utf8'));
    expect(parsed.stale).toBeUndefined();
    expect(parsed.parent_issue).toBe(323);
  });

  it('routes failures from runGit through a descriptive error', () => {
    writeFileSync(fx.workplanPath, '', 'utf8');
    const runGh = makeWalkerStub({
      323: { state: 'OPEN', title: 'feat(hygiene): parent' },
    });
    const failingGit = (): string => {
      throw new Error('git: not a git repository');
    };
    expect(() =>
      propose({
        slug: 'hygiene',
        parentIssue: 323,
        workplanPath: fx.workplanPath,
        featureDir: fx.featureDir,
        repo: 'o/r',
        projectRoot: fx.root,
        now: new Date(),
        runGh,
        runGit: failingGit,
        outputPath: join(fx.root, 'p.json'),
      }),
    ).toThrow(/Could not resolve feature-complete commit SHA/);
  });
});
