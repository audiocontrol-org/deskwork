import { describe, it, expect } from 'vitest';
import {
  CommitScanError,
  extractReferencesFromCommit,
  groupReferencesByIssue,
  parseLogOutput,
  scanCommits,
} from '../close-shipped/commit-scanner.js';
import type { RunGit, ScannedCommit } from '../close-shipped/types.js';

const RECORD_SEPARATOR = '\x1e';
const FIELD_SEPARATOR = '\x1f';

function makeLogOutput(
  commits: ReadonlyArray<{
    readonly sha: string;
    readonly subject: string;
    readonly body: string;
  }>,
): string {
  return commits
    .map(
      (c) =>
        `${c.sha}${FIELD_SEPARATOR}${c.subject}${FIELD_SEPARATOR}${c.body}${RECORD_SEPARATOR}`,
    )
    .join('');
}

describe('parseLogOutput', () => {
  it('parses a single commit record', () => {
    const raw = makeLogOutput([
      {
        sha: 'abc1234567890abcdef',
        subject: 'feat: subject',
        body: 'body line one\nbody line two',
      },
    ]);
    const commits = parseLogOutput(raw);
    expect(commits.length).toBe(1);
    const first = commits[0];
    expect(first).toBeDefined();
    if (first === undefined) return;
    expect(first.sha).toBe('abc1234');
    expect(first.subject).toBe('feat: subject');
    expect(first.body).toBe('body line one\nbody line two');
  });

  it('parses multiple commits', () => {
    const raw = makeLogOutput([
      { sha: 'aaaaaaa0000000000000', subject: 's1', body: 'b1' },
      { sha: 'bbbbbbb0000000000000', subject: 's2', body: 'b2' },
      { sha: 'ccccccc0000000000000', subject: 's3', body: 'b3' },
    ]);
    const commits = parseLogOutput(raw);
    expect(commits.length).toBe(3);
    expect(commits.map((c) => c.subject)).toEqual(['s1', 's2', 's3']);
  });

  it('returns empty list on empty input', () => {
    expect(parseLogOutput('')).toEqual([]);
  });

  it('skips records with too few fields', () => {
    const raw = `abcdefg${FIELD_SEPARATOR}only-subject${RECORD_SEPARATOR}`;
    expect(parseLogOutput(raw)).toEqual([]);
  });

  it('preserves bodies that contain blank lines', () => {
    const raw = makeLogOutput([
      {
        sha: 'aaaaaaa0000000000000',
        subject: 'subject',
        body: 'line one\n\nline two after blank',
      },
    ]);
    const parsed = parseLogOutput(raw);
    expect(parsed.length).toBe(1);
    const first = parsed[0];
    expect(first).toBeDefined();
    if (first === undefined) return;
    expect(first.body).toBe('line one\n\nline two after blank');
  });
});

describe('scanCommits', () => {
  it('passes the correct args to git and parses the output', () => {
    const calls: string[][] = [];
    const runGit: RunGit = (args) => {
      calls.push([...args]);
      return makeLogOutput([
        { sha: 'abc1234zzzzzzzzzzzzz', subject: 'feat: x', body: '' },
      ]);
    };
    const commits = scanCommits({
      fromTag: 'v1.0.0',
      toTag: 'v1.1.0',
      runGit,
    });
    expect(commits.length).toBe(1);
    expect(calls.length).toBe(1);
    const first = calls[0];
    expect(first).toBeDefined();
    if (first === undefined) return;
    expect(first[0]).toBe('log');
    expect(first[1]).toBe('v1.0.0..v1.1.0');
    expect(first[2]).toMatch(/^--format=/);
  });

  it('wraps git failures in CommitScanError', () => {
    const runGit: RunGit = () => {
      throw new Error('fatal: bad revision');
    };
    expect(() =>
      scanCommits({ fromTag: 'vX', toTag: 'vY', runGit }),
    ).toThrow(CommitScanError);
  });
});

describe('extractReferencesFromCommit', () => {
  function mkCommit(subject: string, body = ''): ScannedCommit {
    return { sha: 'aaaaaaa', subject, body };
  }

  it('does NOT extract plain #NNN references (no fix verb)', () => {
    // Per Phase 13 / #366 — bare `#N` mentions are references, not fix-
    // shipped signals. The scanner only honors GitHub's own auto-close
    // grammar (Closes / Fixes / Resolves). Adopters who want the looser
    // behavior would compose their own walker on top of the raw commit
    // stream.
    const refs = extractReferencesFromCommit(mkCommit('see #42'));
    expect(refs.length).toBe(0);
  });

  it('extracts Closes #NNN as closes (case-insensitive)', () => {
    const refs = extractReferencesFromCommit(mkCommit('fix: thing\n\nCloses #123'));
    expect(refs.length).toBe(1);
    const first = refs[0];
    expect(first).toBeDefined();
    if (first === undefined) return;
    expect(first.issue).toBe(123);
    expect(first.verb).toBe('closes');

    const lower = extractReferencesFromCommit(mkCommit('fix: thing\n\ncloses #99'));
    const lowerFirst = lower[0];
    expect(lowerFirst).toBeDefined();
    if (lowerFirst === undefined) return;
    expect(lowerFirst.verb).toBe('closes');
  });

  it('extracts Fixes/Fixed/Resolves/Resolved variants', () => {
    expect(extractReferencesFromCommit(mkCommit('Fixes #10'))[0]?.verb).toBe(
      'fixes',
    );
    expect(extractReferencesFromCommit(mkCommit('Fixed #11'))[0]?.verb).toBe(
      'fixes',
    );
    expect(extractReferencesFromCommit(mkCommit('Resolves #12'))[0]?.verb).toBe(
      'resolves',
    );
    expect(extractReferencesFromCommit(mkCommit('Resolved #13'))[0]?.verb).toBe(
      'resolves',
    );
  });

  it('does NOT extract `Refs #NN` references (Refs is a citation, not a fix verb)', () => {
    // Per Phase 13 / #366 — `Refs:` cites an issue without claiming the
    // commit fixed it. close-shipped is about fix-shipping evidence, not
    // mere citation. Dropped along with `plain` and `parens`.
    const refs = extractReferencesFromCommit(mkCommit('docs: note\n\nRefs #88'));
    expect(refs.length).toBe(0);
  });

  it('does NOT extract `(#NNN)` at end of subject (GitHub-PR-merge marker, not a fix signal)', () => {
    // Per Phase 13 / #366 — the squash-merge convention `(#PR-NUMBER)` at
    // the end of a subject names the PR that landed the commit, not an
    // issue the commit fixed. Adopters who want PR-number tracking would
    // compose a separate walker.
    const refs = extractReferencesFromCommit(
      mkCommit('feat(area): subject (#7)'),
    );
    expect(refs.length).toBe(0);
  });

  it('surfaces only the fix-verb match when the same issue also appears as a bare mention', () => {
    // Bare `#50` in subject is dropped post-Phase-13; the `Closes #50`
    // in the body is the only fix-shipping signal. Pre-Phase-13 this
    // exercised the strongest-verb-wins selection between `plain` and
    // `closes`; post-Phase-13 the bare mention is silently ignored and
    // only the verb-prefixed match surfaces.
    const commit = mkCommit('mention #50 in passing', 'Closes #50');
    const refs = extractReferencesFromCommit(commit);
    expect(refs.length).toBe(1);
    const first = refs[0];
    expect(first).toBeDefined();
    if (first === undefined) return;
    expect(first.issue).toBe(50);
    expect(first.verb).toBe('closes');
  });

  it('skips numbers embedded in URLs', () => {
    const commit = mkCommit(
      'merge PR https://github.com/owner/repo/pull/9999',
      'no other refs here',
    );
    const refs = extractReferencesFromCommit(commit);
    expect(refs.length).toBe(0);
  });

  it('extracts only the fix-verb refs when the URL + parens marker also appear', () => {
    // Subject parens marker `(#42)` dropped (Phase 13). URL stripped pre-
    // match. Body's `Closes #43` survives. Pre-fix this returned [42, 43];
    // post-fix [43] is the correct fix-shipping signal set.
    const commit = mkCommit(
      'feat: subject (#42)',
      'Closes #43.\n\nSee https://github.com/owner/repo/pull/100 for context.',
    );
    const refs = extractReferencesFromCommit(commit);
    const issues = refs.map((r) => r.issue).sort((a, b) => a - b);
    expect(issues).toEqual([43]);
  });

  it('extracts only the explicitly-verb-prefixed issues from comma-separated lists', () => {
    // Pre-fix, `Closes #10, #11, #12.` matched all three (via plain). Per
    // Phase 13 / #366, only `#10` has the Closes verb prefix; #11 and #12
    // are bare mentions and get dropped. This aligns with GitHub's own
    // auto-close grammar, which requires the verb to precede each issue.
    const commit = mkCommit('chore: subject', 'Closes #10, #11, #12.');
    const refs = extractReferencesFromCommit(commit);
    const issues = refs.map((r) => r.issue).sort((a, b) => a - b);
    expect(issues).toEqual([10]);
  });

  it('ignores non-digit "#word" shapes', () => {
    const refs = extractReferencesFromCommit(mkCommit('docs: header #foo bar'));
    expect(refs.length).toBe(0);
  });

  // --- Phase 13 Task 1 acceptance cases (per workplan + #366) ---

  it('Phase 13 (a): subject with explicit Closes verb surfaces the ref', () => {
    // `feat: close #501 — actually fixes thing` → ref #501 (Closes verb).
    const refs = extractReferencesFromCommit(
      mkCommit('feat: close #501 — actually fixes thing'),
    );
    expect(refs.length).toBe(1);
    const first = refs[0];
    expect(first).toBeDefined();
    if (first === undefined) return;
    expect(first.issue).toBe(501);
    expect(first.verb).toBe('closes');
  });

  it('Phase 13 (b): body with Fixes verb surfaces the ref', () => {
    // `Fixes #502\n\nLonger body...` → ref #502 (Fixes verb).
    const refs = extractReferencesFromCommit(
      mkCommit('feat(x): add new thing', 'Fixes #502\n\nLonger body.'),
    );
    expect(refs.length).toBe(1);
    const first = refs[0];
    expect(first).toBeDefined();
    if (first === undefined) return;
    expect(first.issue).toBe(502);
    expect(first.verb).toBe('fixes');
  });

  it('Phase 13 (c): subject with bare mention (no fix verb) does NOT surface', () => {
    // `feat(x): scoping #503 into workplan` → no ref (bare mention).
    // Pre-fix this would have matched #503 as `plain`. Post-fix the bare
    // mention is correctly dropped because it doesn't claim a fix.
    const refs = extractReferencesFromCommit(
      mkCommit('feat(x): scoping #503 into workplan'),
    );
    expect(refs.length).toBe(0);
  });

  it('Phase 13 (d): PR-merge commit subject does NOT surface any ref', () => {
    // `Merge pull request #504 from foo/bar` → no PR-number ref surfaces.
    // The PR-merge convention is structurally meaningless as a fix-
    // shipped signal — the actual fix commits travel inside the merge.
    // The unconditional subject filter drops the whole commit's
    // contribution regardless of any body fix-keyword references too,
    // because merge-commit bodies typically restate the PR description
    // and the underlying squashed commits are the authoritative source.
    const refs = extractReferencesFromCommit(
      mkCommit('Merge pull request #504 from foo/bar'),
    );
    expect(refs.length).toBe(0);
  });

  it('Phase 13 (e): markdown link `[#505](https://...)` paired with `Resolves #505` surfaces #505', () => {
    // Markdown link `[#505](https://...)` is a body citation. The Resolves
    // verb elsewhere in the body is what claims the fix-shipped signal.
    // URL gets stripped pre-match; the bare `[#505]` token alone would
    // have matched `plain` (now dropped); `Resolves #505` matches the
    // fix-verb pattern and surfaces #505.
    const refs = extractReferencesFromCommit(
      mkCommit(
        'feat(x): subject',
        'See [#505](https://github.com/owner/repo/issues/505) for context.\n\nResolves #505',
      ),
    );
    expect(refs.length).toBe(1);
    const first = refs[0];
    expect(first).toBeDefined();
    if (first === undefined) return;
    expect(first.issue).toBe(505);
    expect(first.verb).toBe('resolves');
  });
});

describe('groupReferencesByIssue', () => {
  it('groups multiple commits referencing the same issue', () => {
    const c1: ScannedCommit = { sha: 'aaa1', subject: 's1', body: '' };
    const c2: ScannedCommit = { sha: 'bbb2', subject: 's2', body: '' };
    const refs = [
      { issue: 5, sha: 'aaa1', subject: 's1', verb: 'closes' as const },
      { issue: 5, sha: 'bbb2', subject: 's2', verb: 'fixes' as const },
      { issue: 7, sha: 'aaa1', subject: 's1', verb: 'plain' as const },
    ];
    const groups = groupReferencesByIssue(refs, [c1, c2]);
    expect(groups.length).toBe(2);
    const g5 = groups.find((g) => g.issue === 5);
    expect(g5).toBeDefined();
    if (g5 === undefined) return;
    expect(g5.commits.length).toBe(2);
    expect(g5.verbs.includes('closes')).toBe(true);
    expect(g5.verbs.includes('fixes')).toBe(true);
    expect(g5.primarySubject).toBe('s1');
  });

  it('sorts groups by issue number ascending', () => {
    const c1: ScannedCommit = { sha: 'a', subject: 's', body: '' };
    const refs = [
      { issue: 100, sha: 'a', subject: 's', verb: 'plain' as const },
      { issue: 1, sha: 'a', subject: 's', verb: 'plain' as const },
      { issue: 50, sha: 'a', subject: 's', verb: 'plain' as const },
    ];
    const groups = groupReferencesByIssue(refs, [c1]);
    expect(groups.map((g) => g.issue)).toEqual([1, 50, 100]);
  });
});
