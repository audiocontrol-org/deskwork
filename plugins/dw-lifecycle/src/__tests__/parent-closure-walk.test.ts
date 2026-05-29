import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  classify,
  fetchIssueState,
  parentTimeline,
  titleSearch,
  walk,
  workplanAnchored,
} from '../lifecycle-integration/parent-closure/walk.js';

interface Fixture {
  root: string;
  workplanPath: string;
}

function setup(): Fixture {
  const root = mkdtempSync(join(tmpdir(), 'dw-parent-closure-walk-'));
  return { root, workplanPath: join(root, 'workplan.md') };
}

// Stubbed runGh recorder. Returns a routing closure that dispatches to
// per-arg-pattern responses; the recorder also stores every call for
// assertion.
interface GhStub {
  readonly calls: string[][];
  readonly runGh: (args: readonly string[]) => string;
}

function makeGhStub(handler: (args: readonly string[]) => string): GhStub {
  const calls: string[][] = [];
  const runGh = (args: readonly string[]): string => {
    calls.push([...args]);
    return handler(args);
  };
  return { calls, runGh };
}

describe('titleSearch', () => {
  it('issues a `gh issue list --search "<slug> in:title"` call', () => {
    const stub = makeGhStub(() =>
      JSON.stringify([
        { number: 323, title: 'feat(hygiene): parent', state: 'OPEN', url: 'u1' },
        { number: 324, title: 'feat(hygiene): Phase 0', state: 'CLOSED', url: 'u2' },
      ]),
    );
    const results = titleSearch({ slug: 'hygiene', repo: 'o/r', runGh: stub.runGh });
    expect(results).toHaveLength(2);
    expect(results[0]?.number).toBe(323);
    expect(stub.calls[0]).toEqual([
      'issue',
      'list',
      '--repo',
      'o/r',
      '--search',
      'hygiene in:title',
      '--state',
      'all',
      '--limit',
      '200',
      '--json',
      'number,title,state,url',
    ]);
  });

  it('throws on a non-JSON-array response', () => {
    const stub = makeGhStub(() => '{"oops": true}');
    expect(() =>
      titleSearch({ slug: 'hygiene', repo: 'o/r', runGh: stub.runGh }),
    ).toThrow(/not a JSON array/);
  });

  it('throws when an item is missing expected fields', () => {
    const stub = makeGhStub(() =>
      JSON.stringify([{ number: 1, title: 't', state: 'OPEN' }]),
    );
    expect(() =>
      titleSearch({ slug: 'hygiene', repo: 'o/r', runGh: stub.runGh }),
    ).toThrow(/missing expected fields/);
  });
});

describe('parentTimeline', () => {
  it('extracts cross-referenced issue numbers from timeline events', () => {
    const stub = makeGhStub(() =>
      JSON.stringify([
        {
          event: 'cross-referenced',
          source: { issue: { number: 324, state: 'closed', title: 'phase-0', url: 'u' } },
        },
        {
          event: 'cross-referenced',
          source: { issue: { number: 325, state: 'closed', title: 'phase-1', url: 'u' } },
        },
        { event: 'labeled' },
      ]),
    );
    const results = parentTimeline({ parentIssue: 323, repo: 'o/r', runGh: stub.runGh });
    expect(results.map((r) => r.number)).toEqual([324, 325]);
  });

  it('interpolates the resolved repo into the URL and does NOT pass --repo flag (#342)', () => {
    // Regression: pre-fix the URL carried literal `{owner}/{repo}`
    // placeholders that `gh api` does not substitute, AND the call passed
    // `--repo` (which `gh api` rejects with `unknown flag`). Both bugs
    // surfaced together as a CLI usage error that aborted the walker. The
    // fix interpolates the repo directly into the URL path and drops the
    // `--repo` flag.
    const stub = makeGhStub(() => '[]');
    parentTimeline({ parentIssue: 323, repo: 'owner/repo', runGh: stub.runGh });
    const argv = stub.calls[0] ?? [];
    expect(argv[0]).toBe('api');
    expect(argv[1]).toBe('/repos/owner/repo/issues/323/timeline');
    expect(argv).not.toContain('--repo');
    expect(argv.find((a) => a.includes('{owner}'))).toBeUndefined();
    expect(argv.find((a) => a.includes('{repo}'))).toBeUndefined();
  });

  it('recovers gracefully when the gh api call throws a usage error (#342)', () => {
    // Regression: pre-fix, the walker rejected on usage errors instead of
    // collapsing to "this source returned []". The recovery contract is
    // that ANY error from the timeline source backfills to empty + emits a
    // one-line stderr breadcrumb so the other two sources can still
    // contribute candidates.
    const stub = makeGhStub(() => {
      throw new Error('unknown flag: --repo\nUsage: gh api <endpoint> [flags]');
    });
    const errors: string[] = [];
    const origError = console.error;
    console.error = (...parts: unknown[]) => {
      errors.push(parts.map((p) => String(p)).join(' '));
    };
    try {
      const result = parentTimeline({
        parentIssue: 323,
        repo: 'owner/repo',
        runGh: stub.runGh,
      });
      expect(result).toEqual([]);
    } finally {
      console.error = origError;
    }
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/complete-parent-closure: timeline source failed/);
    expect(errors[0]).toMatch(/unknown flag/);
    expect(errors[0]).toMatch(/continuing with other sources/);
  });

  it('returns empty array on 404 (archived parent etc.)', () => {
    const stub = makeGhStub(() => {
      throw new Error('gh: HTTP 404 not found');
    });
    const origError = console.error;
    console.error = () => undefined;
    try {
      expect(
        parentTimeline({ parentIssue: 999, repo: 'o/r', runGh: stub.runGh }),
      ).toEqual([]);
    } finally {
      console.error = origError;
    }
  });

  it('returns empty array on empty output', () => {
    const stub = makeGhStub(() => '');
    expect(parentTimeline({ parentIssue: 1, repo: 'o/r', runGh: stub.runGh })).toEqual([]);
  });

  it('returns empty array (with diagnostic) when timeline output is not a JSON array', () => {
    const stub = makeGhStub(() => '{"oops": true}');
    const origError = console.error;
    const errors: string[] = [];
    console.error = (...parts: unknown[]) => {
      errors.push(parts.map((p) => String(p)).join(' '));
    };
    try {
      expect(
        parentTimeline({ parentIssue: 1, repo: 'o/r', runGh: stub.runGh }),
      ).toEqual([]);
    } finally {
      console.error = origError;
    }
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/response was not a JSON array/);
  });
});

describe('walk — recovery contract (#342)', () => {
  let fxRec: Fixture;
  beforeEach(() => {
    fxRec = setup();
  });
  afterEach(() => rmSync(fxRec.root, { recursive: true, force: true }));

  it('still returns a usable proposal when the gh api timeline call throws a usage error', () => {
    // Integration-level: the walker's recovery contract says "timeline
    // source backfills to [], the other two sources contribute the
    // candidate set." This test exercises that contract end-to-end -- the
    // gh api call throws a usage error, but title-search + workplan-
    // anchored sources still supply the parent + a child, and the
    // walker's classification carries through.
    writeFileSync(
      fxRec.workplanPath,
      [
        '## Phase 0: setup  ·  [#324](https://github.com/o/r/issues/324)',
      ].join('\n'),
      'utf8',
    );
    const runGh = (args: readonly string[]): string => {
      if (args[0] === 'issue' && args[1] === 'list') {
        return JSON.stringify([
          { number: 323, title: 'feat(hygiene): parent', state: 'OPEN', url: 'u323' },
        ]);
      }
      if (args[0] === 'api') {
        throw new Error('unknown flag: --repo');
      }
      if (args[0] === 'issue' && args[1] === 'view') {
        const n = Number.parseInt(args[2] ?? '0', 10);
        return JSON.stringify({
          number: n,
          title: `feat(hygiene): phase ${n}`,
          state: 'CLOSED',
          url: `u${n}`,
        });
      }
      return '';
    };
    const origError = console.error;
    console.error = () => undefined;
    try {
      const result = walk({
        slug: 'hygiene',
        parentIssue: 323,
        workplanPath: fxRec.workplanPath,
        repo: 'owner/repo',
        runGh,
      });
      const parent = result.find((r) => r.number === 323);
      expect(parent).toBeDefined();
      // Workplan-anchored child #324 still appears (timeline failure didn't
      // strand it) AND the parent classifies as close-all-children-closed
      // because its single child (#324) is CLOSED.
      expect(parent?.child_issues.map((c) => c.number)).toEqual([324]);
      expect(parent?.classification).toBe('close-all-children-closed');
    } finally {
      console.error = origError;
    }
  });
});

describe('workplanAnchored', () => {
  let fx: Fixture;
  beforeEach(() => {
    fx = setup();
  });
  afterEach(() => rmSync(fx.root, { recursive: true, force: true }));

  it('parses every per-phase heading and emits the issue number', () => {
    writeFileSync(
      fx.workplanPath,
      [
        '# Workplan',
        '## Phase 0: setup  ·  [#324](https://github.com/o/r/issues/324)',
        '',
        '## Phase 1: baseline  ·  [#325](https://github.com/o/r/issues/325)',
        '',
        '## Phase 2: triage  ·  [#326](https://github.com/o/r/issues/326)',
      ].join('\n'),
      'utf8',
    );
    const result = workplanAnchored({ workplanPath: fx.workplanPath });
    expect(result).toEqual([324, 325, 326]);
  });

  it('returns empty array when no per-phase headings present', () => {
    writeFileSync(fx.workplanPath, '# Workplan\n\nNo phase headings here.\n', 'utf8');
    expect(workplanAnchored({ workplanPath: fx.workplanPath })).toEqual([]);
  });

  it('returns empty array when workplan does not exist', () => {
    expect(
      workplanAnchored({ workplanPath: join(fx.root, 'missing.md') }),
    ).toEqual([]);
  });
});

describe('classify', () => {
  it('returns close-all-children-closed when every child is CLOSED', () => {
    expect(
      classify({
        parentState: 'OPEN',
        childStates: ['CLOSED', 'CLOSED', 'CLOSED'],
        matchesFeature: true,
      }),
    ).toBe('close-all-children-closed');
  });

  it('returns close-with-open-children when at least one child is OPEN', () => {
    expect(
      classify({
        parentState: 'OPEN',
        childStates: ['CLOSED', 'OPEN'],
        matchesFeature: true,
      }),
    ).toBe('close-with-open-children');
  });

  it('returns skip-already-closed when parent is CLOSED', () => {
    expect(
      classify({
        parentState: 'CLOSED',
        childStates: ['CLOSED'],
        matchesFeature: true,
      }),
    ).toBe('skip-already-closed');
  });

  it('returns skip-not-this-feature when matchesFeature is false', () => {
    expect(
      classify({
        parentState: 'OPEN',
        childStates: [],
        matchesFeature: false,
      }),
    ).toBe('skip-not-this-feature');
  });

  it('treats UNKNOWN child states as not-OPEN (does not block closure)', () => {
    expect(
      classify({
        parentState: 'OPEN',
        childStates: ['CLOSED', 'UNKNOWN'],
        matchesFeature: true,
      }),
    ).toBe('close-all-children-closed');
  });
});

describe('fetchIssueState', () => {
  it('returns the parsed view fields when gh succeeds', () => {
    const stub = makeGhStub(() =>
      JSON.stringify({ number: 42, title: 'X', state: 'OPEN', url: 'u' }),
    );
    const result = fetchIssueState({ issueNumber: 42, repo: 'o/r', runGh: stub.runGh });
    expect(result.state).toBe('OPEN');
    expect(result.title).toBe('X');
  });

  it('returns UNKNOWN state on 404', () => {
    const stub = makeGhStub(() => {
      throw new Error('HTTP 404: Not Found');
    });
    const result = fetchIssueState({ issueNumber: 99, repo: 'o/r', runGh: stub.runGh });
    expect(result.state).toBe('UNKNOWN');
  });

  it('returns UNKNOWN state on unparseable JSON', () => {
    const stub = makeGhStub(() => 'this is not json');
    const result = fetchIssueState({ issueNumber: 1, repo: 'o/r', runGh: stub.runGh });
    expect(result.state).toBe('UNKNOWN');
  });
});

describe('walk (combiner)', () => {
  let fx: Fixture;
  beforeEach(() => {
    fx = setup();
  });
  afterEach(() => rmSync(fx.root, { recursive: true, force: true }));

  // Helper: build a runGh that routes based on argv shape.
  function routedRunGh(routes: {
    titleSearch: () => string;
    timeline: () => string;
    issueView: (issueNumber: number) => string;
  }) {
    return (args: readonly string[]): string => {
      if (args[0] === 'issue' && args[1] === 'list') return routes.titleSearch();
      if (args[0] === 'api') return routes.timeline();
      if (args[0] === 'issue' && args[1] === 'view') {
        const n = Number.parseInt(args[2] ?? '0', 10);
        return routes.issueView(n);
      }
      return '';
    };
  }

  it('unions the three sources and classifies the parent as close-all-children-closed when every child is closed', () => {
    writeFileSync(
      fx.workplanPath,
      [
        '## Phase 0: setup  ·  [#324](https://github.com/o/r/issues/324)',
        '## Phase 1: baseline  ·  [#325](https://github.com/o/r/issues/325)',
      ].join('\n'),
      'utf8',
    );
    const childStates: Record<number, string> = { 324: 'CLOSED', 325: 'CLOSED' };
    const runGh = routedRunGh({
      titleSearch: () =>
        JSON.stringify([
          { number: 323, title: 'feat(hygiene): parent', state: 'OPEN', url: 'u' },
        ]),
      timeline: () => JSON.stringify([]),
      issueView: (n) =>
        JSON.stringify({
          number: n,
          title: n === 323 ? 'feat(hygiene): parent' : `feat(hygiene): phase ${n}`,
          state: n === 323 ? 'OPEN' : (childStates[n] ?? 'CLOSED'),
          url: `https://github.com/o/r/issues/${n}`,
        }),
    });
    const result = walk({
      slug: 'hygiene',
      parentIssue: 323,
      workplanPath: fx.workplanPath,
      repo: 'o/r',
      runGh,
    });
    const parent = result.find((r) => r.number === 323);
    expect(parent).toBeDefined();
    expect(parent?.classification).toBe('close-all-children-closed');
    expect(parent?.child_issues.map((c) => c.number)).toEqual([324, 325]);
  });

  it('classifies parent as close-with-open-children when some children are still open', () => {
    writeFileSync(
      fx.workplanPath,
      ['## Phase 0: setup  ·  [#324](https://github.com/o/r/issues/324)'].join('\n'),
      'utf8',
    );
    const runGh = routedRunGh({
      titleSearch: () =>
        JSON.stringify([
          { number: 323, title: 'feat(hygiene): parent', state: 'OPEN', url: 'u' },
        ]),
      timeline: () => '[]',
      issueView: (n) =>
        JSON.stringify({
          number: n,
          title: 'feat(hygiene): something',
          state: n === 323 ? 'OPEN' : 'OPEN',
          url: 'u',
        }),
    });
    const result = walk({
      slug: 'hygiene',
      parentIssue: 323,
      workplanPath: fx.workplanPath,
      repo: 'o/r',
      runGh,
    });
    const parent = result.find((r) => r.number === 323);
    expect(parent?.classification).toBe('close-with-open-children');
  });

  it('emits skip-already-closed when the parent itself is closed', () => {
    const runGh = routedRunGh({
      titleSearch: () => '[]',
      timeline: () => '[]',
      issueView: (n) =>
        JSON.stringify({
          number: n,
          title: 'feat(hygiene): parent',
          state: 'CLOSED',
          url: 'u',
        }),
    });
    const result = walk({
      slug: 'hygiene',
      parentIssue: 323,
      workplanPath: fx.workplanPath,
      repo: 'o/r',
      runGh,
    });
    const parent = result.find((r) => r.number === 323);
    expect(parent?.classification).toBe('skip-already-closed');
  });

  it('emits skip-not-this-feature for a title-search hit whose title omits the slug', () => {
    // The title-search response carries title+state directly; the walker
    // uses that title (no `gh issue view` round trip for title-search hits).
    // For matchesFeature=false, the hit's own title must not contain the
    // slug substring.
    const runGh = routedRunGh({
      titleSearch: () =>
        JSON.stringify([
          { number: 999, title: 'unrelated mention only', state: 'OPEN', url: 'u' },
        ]),
      timeline: () => '[]',
      issueView: (n) =>
        JSON.stringify({
          number: n,
          title: 'feat(hygiene): parent',
          state: 'OPEN',
          url: 'u',
        }),
    });
    const result = walk({
      slug: 'hygiene',
      parentIssue: 323,
      workplanPath: fx.workplanPath,
      repo: 'o/r',
      runGh,
    });
    const unrelated = result.find((r) => r.number === 999);
    expect(unrelated?.classification).toBe('skip-not-this-feature');
  });

  it('reuses title-search payload instead of round-tripping `gh issue view` per hit', () => {
    // Fixture: 5 title-search hits (each carrying title+state) + 1 workplan-
    // anchored child issue with NO accompanying title-search hit. The walker
    // should only `gh issue view` the workplan-only child (1 view call).
    // Title-search hits supply title+state directly; no view call for them.
    writeFileSync(
      fx.workplanPath,
      [
        '## Phase 0: setup  ·  [#400](https://github.com/o/r/issues/400)',
      ].join('\n'),
      'utf8',
    );
    const viewCalls: number[] = [];
    const runGh = (args: readonly string[]): string => {
      if (args[0] === 'issue' && args[1] === 'list') {
        return JSON.stringify([
          { number: 323, title: 'feat(hygiene): parent', state: 'OPEN', url: 'u323' },
          { number: 324, title: 'feat(hygiene): phase A', state: 'CLOSED', url: 'u324' },
          { number: 325, title: 'feat(hygiene): phase B', state: 'CLOSED', url: 'u325' },
          { number: 326, title: 'feat(hygiene): phase C', state: 'CLOSED', url: 'u326' },
          { number: 327, title: 'feat(hygiene): phase D', state: 'CLOSED', url: 'u327' },
        ]);
      }
      if (args[0] === 'api') return '[]';
      if (args[0] === 'issue' && args[1] === 'view') {
        const n = Number.parseInt(args[2] ?? '0', 10);
        viewCalls.push(n);
        return JSON.stringify({
          number: n,
          title: `feat(hygiene): workplan-only #${n}`,
          state: 'CLOSED',
          url: `u${n}`,
        });
      }
      return '';
    };
    const result = walk({
      slug: 'hygiene',
      parentIssue: 323,
      workplanPath: fx.workplanPath,
      repo: 'o/r',
      runGh,
    });
    // Only the workplan-anchored child #400 is fetched via `gh issue view`.
    // The parent #323 + its 4 sibling title-search hits supply their payload
    // directly via the title-search response.
    expect(viewCalls).toEqual([400]);
    // Sanity: the walker produced 5 parent-candidate rows.
    expect(result.map((r) => r.number).sort((a, b) => a - b)).toEqual([
      323, 324, 325, 326, 327,
    ]);
    // Parent should classify as close-all-children-closed: every enumerated
    // child (the 4 title-search siblings + the 1 workplan-anchored phase)
    // is CLOSED.
    const parent = result.find((r) => r.number === 323);
    expect(parent?.classification).toBe('close-all-children-closed');
  });

  it('dedupes parent candidates across sources (same number from search + parentIssue)', () => {
    const runGh = routedRunGh({
      titleSearch: () =>
        JSON.stringify([
          { number: 323, title: 'feat(hygiene): parent', state: 'OPEN', url: 'u' },
          { number: 323, title: 'feat(hygiene): parent', state: 'OPEN', url: 'u' },
        ]),
      timeline: () => '[]',
      issueView: (n) =>
        JSON.stringify({
          number: n,
          title: 'feat(hygiene): parent',
          state: 'OPEN',
          url: 'u',
        }),
    });
    const result = walk({
      slug: 'hygiene',
      parentIssue: 323,
      workplanPath: fx.workplanPath,
      repo: 'o/r',
      runGh,
    });
    const matching = result.filter((r) => r.number === 323);
    expect(matching).toHaveLength(1);
  });
});
