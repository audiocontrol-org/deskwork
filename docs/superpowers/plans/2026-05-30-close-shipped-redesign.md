# close-shipped redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `close-shipped`'s 4-walker prose-parsing architecture with mechanical narrowing + Agent-tool dispatch + operator-curated `propose | apply` flow. SKILL.md prose orchestrates per-candidate Agent dispatches; CLI helpers stay pure-mechanical.

**Architecture:** Three new CLI sub-verbs (`scan` / `propose` / `apply`) wrap pure mechanical helpers. The agent's Claude Code session dispatches one Agent tool call per candidate (parallel via single-message multi-tool-use) using the bundle JSON the `scan` helper emits, collects verdicts, and feeds them to the `propose` helper. Legacy single-command `close-shipped` flow stays as the default fall-through for one release cycle.

**Tech Stack:** TypeScript (Node16 ESM), Vitest, `child_process.execFileSync` for git/gh, `yaml` for config. No new deps.

**Reference design spec:** [`docs/superpowers/specs/2026-05-30-close-shipped-redesign.md`](../specs/2026-05-30-close-shipped-redesign.md)

---

## File structure

**Create:**
- `plugins/dw-lifecycle/src/close-shipped/mention-scanner.ts` — pure mention extractor (matches `/(?<![\w/])#(\d{1,7})\b/g` over arbitrary text; no verb filter, no URL exclusion needed beyond what stripIssueLikeUrls already does)
- `plugins/dw-lifecycle/src/close-shipped/bundle.ts` — pure bundle assembler: walks 4 sources, groups #N mentions, collects per-candidate evidence
- `plugins/dw-lifecycle/src/close-shipped/scan.ts` — verb runtime: takes CLI args + I/O callbacks, emits bundle set as JSON
- `plugins/dw-lifecycle/src/close-shipped/propose.ts` — verb runtime: takes bundles + verdicts paths, composes proposal JSON + markdown table
- `plugins/dw-lifecycle/src/close-shipped/apply-v2.ts` — verb runtime: pre-validates proposal, dispatches gh comment + label per accepted row
- `plugins/dw-lifecycle/src/close-shipped/apply-legacy.ts` — copy of current `apply.ts` content (renamed for clarity; legacy path retains this)
- `plugins/dw-lifecycle/src/__tests__/close-shipped-mention-scanner.test.ts`
- `plugins/dw-lifecycle/src/__tests__/close-shipped-bundle.test.ts`
- `plugins/dw-lifecycle/src/__tests__/close-shipped-scan.test.ts`
- `plugins/dw-lifecycle/src/__tests__/close-shipped-propose.test.ts`
- `plugins/dw-lifecycle/src/__tests__/close-shipped-apply-v2.test.ts`

**Modify:**
- `plugins/dw-lifecycle/src/close-shipped/types.ts` — add `CandidateBundle`, `BundleSet`, `Verdict`, `VerdictSet`, `ProposalItem`, `Proposal`, `ProposalDecision` types
- `plugins/dw-lifecycle/src/close-shipped/index.ts` — export new types + new runtime functions
- `plugins/dw-lifecycle/src/close-shipped/apply.ts` — replaced; current content moves to `apply-legacy.ts`
- `plugins/dw-lifecycle/src/subcommands/close-shipped.ts` — add verb dispatch (`scan` / `propose` / `apply` keywords route to new code; bare invocation routes to existing legacy flow)
- `plugins/dw-lifecycle/skills/close-shipped/SKILL.md` — heavy prose rewrite describing new flow + Agent-tool dispatch
- `scripts/smoke-hygiene.sh` — extend with new scan → propose → apply round-trip using canned verdicts

**Unchanged but loaded as dependencies:**
- `commit-scanner.ts`'s `scanCommits` + `stripIssueLikeUrls` — reused for raw commit fetching (the new mention scanner runs OVER the commits scanCommits returns; doesn't replace it)
- `audit-log-walker.ts`'s `walkAuditLogs` + entry splitter — reused (the new bundle assembler runs the walker, then collects mentions from each entry permissively)
- `tooling-feedback-walker.ts` + `workplan-walker.ts` — same pattern: existing walkers stay; bundle assembler collects mentions from their outputs
- `tag-resolver.ts` — unchanged
- `apply.ts`'s `buildEvidenceCommentBody` — extracted/exported for re-use in `apply-v2.ts`

---

### Task 1: Add new types to `close-shipped/types.ts`

**Files:**
- Modify: `plugins/dw-lifecycle/src/close-shipped/types.ts`

- [ ] **Step 1: Append new types after the existing `CloseShippedOptions` interface**

Add these exports at the end of the file:

```ts
// === Phase 14+ redesign types ===

/**
 * Per-candidate evidence bundle the agent reads to render a verdict.
 * Mechanically assembled by bundle.ts — no judgment, no filtering.
 */
export interface CandidateBundle {
  readonly issue: {
    readonly number: number;
    readonly title: string;
    readonly state: 'OPEN' | 'CLOSED' | 'UNKNOWN';
    readonly body: string; // truncated to ~1k chars with trailing ellipsis
    readonly recent_comments: readonly string[]; // up to 3, each ~300 chars
  };
  readonly commits: readonly {
    readonly sha: string;
    readonly subject: string;
    readonly body: string; // truncated to ~500 chars
    readonly diff_stat: string;
  }[];
  readonly pr: {
    readonly number: number;
    readonly title: string;
    readonly body: string; // truncated to ~1k chars
  } | null;
  readonly audit_log_entries: readonly {
    readonly finding_id: string | null;
    readonly status: string;
    readonly tracks_issue: number | null;
    readonly surface: string;
    readonly body: string; // truncated to ~500 chars
  }[];
  readonly workplan_backfills: readonly {
    readonly file: string;
    readonly line: number;
    readonly text: string;
  }[];
}

/** A bundle-set is the entire output of `close-shipped scan`. */
export interface BundleSet {
  readonly generated_at: string; // ISO-8601
  readonly from_tag: string;
  readonly to_tag: string;
  readonly repo: string;
  readonly bundles: readonly CandidateBundle[];
}

/** One verdict from one Agent dispatch. Filled in by SKILL.md prose. */
export interface Verdict {
  readonly issue: number;
  readonly verdict: 'shipped' | 'not-shipped' | 'uncertain' | 'error';
  readonly reason: string; // one sentence
}

export interface VerdictSet {
  readonly verdicts: readonly Verdict[];
}

/** Per-proposal item (verdict + operator decision slot). */
export interface ProposalItem {
  readonly issue: number;
  readonly issue_title: string;
  readonly issue_state: 'OPEN' | 'CLOSED' | 'UNKNOWN';
  readonly agent_verdict: Verdict['verdict'];
  readonly agent_reason: string;
  readonly evidence_summary: string; // mechanical: "<N commits>, <M audit entries>, <PR ref|no PR>"
  decision: ProposalDecision | '';
}

export type ProposalDecision =
  | 'accept-verdict'
  | 'override-shipped'
  | 'override-not-shipped'
  | 'skip';

export interface Proposal {
  readonly generated_at: string;
  readonly from_tag: string;
  readonly to_tag: string;
  readonly repo: string;
  readonly items: readonly ProposalItem[];
}
```

- [ ] **Step 2: Run typecheck**

```bash
cd /Users/orion/work/deskwork-work/hygiene/plugins/dw-lifecycle && npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/orion/work/deskwork-work/hygiene
git add plugins/dw-lifecycle/src/close-shipped/types.ts
git commit -m "feat(close-shipped): add Phase 15 redesign types (CandidateBundle, Verdict, Proposal)"
```

---

### Task 2: Mention scanner — extract every `#NNN` from arbitrary text

**Files:**
- Create: `plugins/dw-lifecycle/src/close-shipped/mention-scanner.ts`
- Test: `plugins/dw-lifecycle/src/__tests__/close-shipped-mention-scanner.test.ts`

- [ ] **Step 1: Write the failing test**

Create `plugins/dw-lifecycle/src/__tests__/close-shipped-mention-scanner.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { extractMentions } from '../close-shipped/mention-scanner.js';

describe('extractMentions', () => {
  it('returns empty set on text with no #NNN', () => {
    expect(extractMentions('no refs here')).toEqual(new Set());
  });

  it('extracts a single bare #NNN', () => {
    expect(extractMentions('see #42')).toEqual(new Set([42]));
  });

  it('extracts multiple distinct issue numbers across one text', () => {
    const text = 'feat: subject (#42)\n\nCloses #43, refs #44 too';
    expect(extractMentions(text)).toEqual(new Set([42, 43, 44]));
  });

  it('deduplicates the same issue number mentioned multiple times', () => {
    const text = '#42 here #42 there #42';
    expect(extractMentions(text)).toEqual(new Set([42]));
  });

  it('excludes `#NNN` segments inside http(s) URLs', () => {
    expect(
      extractMentions('see https://github.com/owner/repo/pull/9999 only'),
    ).toEqual(new Set());
  });

  it('extracts numbers from end-of-subject parens, refs verbs, plain mentions equally', () => {
    expect(extractMentions('feat: x (#10)')).toEqual(new Set([10]));
    expect(extractMentions('Refs #11')).toEqual(new Set([11]));
    expect(extractMentions('plain #12 reference')).toEqual(new Set([12]));
  });

  it('does NOT extract id-fragment shapes like `section#NNN`', () => {
    // `s#42` has `s` before `#`, so the `[^\w/]` exclusion fires.
    expect(extractMentions('section#42 anchor')).toEqual(new Set());
  });

  it('does NOT extract cross-repo refs like `owner/repo#NNN`', () => {
    expect(extractMentions('see owner/repo#42 elsewhere')).toEqual(new Set());
  });

  it('caps issue numbers at 7 digits (GitHub upper bound + margin)', () => {
    expect(extractMentions('#1234567 fits; #12345678 does not')).toEqual(
      new Set([1234567]),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/orion/work/deskwork-work/hygiene/plugins/dw-lifecycle && npx vitest run src/__tests__/close-shipped-mention-scanner.test.ts
```

Expected: FAIL with "Cannot find module '../close-shipped/mention-scanner.js'"

- [ ] **Step 3: Write minimal implementation**

Create `plugins/dw-lifecycle/src/close-shipped/mention-scanner.ts`:

```ts
// Pure issue-mention extractor used by the close-shipped bundle
// assembler. Phase 15 redesign — replaces the per-walker verb-filtered
// extraction with one mechanical pattern. No grammar, no judgment; the
// agent dispatches downstream do the filtering.

const URL_PATTERN = /https?:\/\/\S*/g;

// Mirror of session-range.ts's regex: `(?:^|[^&\w/])#(\d{1,7})\b`.
// The `[^&\w/]` exclusion drops HTML entities, id fragments, and
// cross-repo refs. The `\d{1,7}` cap matches GitHub's issue-number bound
// with margin.
const MENTION_PATTERN = /(?:^|[^&\w/])#(\d{1,7})\b/g;

export function extractMentions(text: string): ReadonlySet<number> {
  const stripped = text.replace(URL_PATTERN, '');
  const out = new Set<number>();
  MENTION_PATTERN.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = MENTION_PATTERN.exec(stripped)) !== null) {
    const captured = m[1];
    if (captured === undefined) continue;
    const n = Number.parseInt(captured, 10);
    if (Number.isFinite(n) && n > 0) out.add(n);
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/__tests__/close-shipped-mention-scanner.test.ts
```

Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
cd /Users/orion/work/deskwork-work/hygiene
git add plugins/dw-lifecycle/src/close-shipped/mention-scanner.ts plugins/dw-lifecycle/src/__tests__/close-shipped-mention-scanner.test.ts
git commit -m "feat(close-shipped): mention-scanner — extract every #NNN regardless of context (Phase 15)"
```

---

### Task 3: Bundle assembler — group mentions into per-candidate evidence bundles

**Files:**
- Create: `plugins/dw-lifecycle/src/close-shipped/bundle.ts`
- Test: `plugins/dw-lifecycle/src/__tests__/close-shipped-bundle.test.ts`

- [ ] **Step 1: Write the failing test**

Create `plugins/dw-lifecycle/src/__tests__/close-shipped-bundle.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { assembleBundles } from '../close-shipped/bundle.js';
import type { ScannedCommit } from '../close-shipped/types.js';

describe('assembleBundles', () => {
  // Fixture: 2 commits, one mentions #42 + #43 (a Closes line + a parens),
  // the other mentions #43 only. Plus a stub issue-info resolver.

  const commits: readonly ScannedCommit[] = [
    {
      sha: 'aaa1234',
      subject: 'feat(x): subject (#42)',
      body: 'Closes #43',
    },
    { sha: 'bbb5678', subject: 'fix(y): another (#43)', body: '' },
  ];

  const issueInfo = (n: number) => ({
    number: n,
    title: `Issue ${n} title`,
    state: 'OPEN' as const,
    body: `Body of issue ${n}`,
    recent_comments: [`Comment 1 on ${n}`, `Comment 2 on ${n}`],
  });

  it('produces one bundle per distinct issue number', () => {
    const result = assembleBundles({
      commits,
      auditLogEntries: [],
      workplanBackfills: [],
      pr: null,
      issueInfo,
    });
    const issues = result.map((b) => b.issue.number).sort((a, b) => a - b);
    expect(issues).toEqual([42, 43]);
  });

  it('attaches every commit that mentions the issue (#42 → 1 commit; #43 → 2)', () => {
    const result = assembleBundles({
      commits,
      auditLogEntries: [],
      workplanBackfills: [],
      pr: null,
      issueInfo,
    });
    const b42 = result.find((b) => b.issue.number === 42);
    const b43 = result.find((b) => b.issue.number === 43);
    expect(b42?.commits.map((c) => c.sha)).toEqual(['aaa1234']);
    expect(b43?.commits.map((c) => c.sha).sort()).toEqual(['aaa1234', 'bbb5678']);
  });

  it('truncates commit body to ~500 chars with trailing ellipsis', () => {
    const longBody = 'x'.repeat(600);
    const result = assembleBundles({
      commits: [{ sha: 'ccc9012', subject: 'subj', body: `Closes #99\n${longBody}` }],
      auditLogEntries: [],
      workplanBackfills: [],
      pr: null,
      issueInfo,
    });
    const b99 = result.find((b) => b.issue.number === 99);
    expect(b99).toBeDefined();
    if (b99 === undefined) return;
    expect(b99.commits[0]?.body.length).toBeLessThanOrEqual(503); // 500 + "…"
    expect(b99.commits[0]?.body.endsWith('…')).toBe(true);
  });

  it('attaches audit-log entries whose body OR tracks_issue mentions the number', () => {
    const result = assembleBundles({
      commits: [],
      auditLogEntries: [
        {
          finding_id: 'AUDIT-1',
          status: 'fixed-aaa1234',
          tracks_issue: 42,
          surface: 'src/foo.ts',
          body: 'Body without #refs',
        },
        {
          finding_id: 'AUDIT-2',
          status: 'fixed-bbb5678',
          tracks_issue: null,
          surface: 'src/bar.ts',
          body: 'Mentions #43 in body',
        },
      ],
      workplanBackfills: [],
      pr: null,
      issueInfo,
    });
    expect(result.find((b) => b.issue.number === 42)?.audit_log_entries.length).toBe(1);
    expect(result.find((b) => b.issue.number === 43)?.audit_log_entries.length).toBe(1);
  });

  it('attaches workplan back-fills whose `text` mentions the issue number', () => {
    const result = assembleBundles({
      commits: [],
      auditLogEntries: [],
      workplanBackfills: [
        { file: 'docs/foo/workplan.md', line: 10, text: '[x] Step 1 · [#42](url)' },
      ],
      pr: null,
      issueInfo,
    });
    expect(result.find((b) => b.issue.number === 42)?.workplan_backfills.length).toBe(1);
  });

  it('returns empty bundle list when no source mentions any issue', () => {
    const result = assembleBundles({
      commits: [{ sha: 'aaa1234', subject: 'no refs', body: '' }],
      auditLogEntries: [],
      workplanBackfills: [],
      pr: null,
      issueInfo,
    });
    expect(result).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/__tests__/close-shipped-bundle.test.ts
```

Expected: FAIL with "Cannot find module '../close-shipped/bundle.js'"

- [ ] **Step 3: Write the implementation**

Create `plugins/dw-lifecycle/src/close-shipped/bundle.ts`:

```ts
// Bundle assembler. Walks the four close-shipped evidence sources
// (commits, audit-log entries, workplan back-fills, PR metadata),
// extracts every #NNN mention via the pure mention-scanner, and groups
// the evidence per-candidate into a CandidateBundle the agent reads.
//
// Phase 15 redesign — replaces the per-walker verb-filtered grammar
// approach with one mechanical aggregator. No judgment; bundles every
// referenced issue regardless of context. The agent dispatches
// downstream of this filter the noise.

import { extractMentions } from './mention-scanner.js';
import type { CandidateBundle, ScannedCommit } from './types.js';

const COMMIT_BODY_CAP = 500;
const ISSUE_BODY_CAP = 1000;
const PR_BODY_CAP = 1000;
const AUDIT_BODY_CAP = 500;
const COMMENT_CAP = 300;
const COMMENTS_PER_ISSUE_MAX = 3;

function truncate(s: string, cap: number): string {
  if (s.length <= cap) return s;
  return `${s.slice(0, cap)}…`;
}

export interface AuditLogEntryInput {
  readonly finding_id: string | null;
  readonly status: string;
  readonly tracks_issue: number | null;
  readonly surface: string;
  readonly body: string;
}

export interface WorkplanBackfillInput {
  readonly file: string;
  readonly line: number;
  readonly text: string;
}

export interface PrInput {
  readonly number: number;
  readonly title: string;
  readonly body: string;
}

export interface IssueInfo {
  readonly number: number;
  readonly title: string;
  readonly state: 'OPEN' | 'CLOSED' | 'UNKNOWN';
  readonly body: string;
  readonly recent_comments: readonly string[];
}

export interface AssembleArgs {
  readonly commits: readonly ScannedCommit[];
  readonly auditLogEntries: readonly AuditLogEntryInput[];
  readonly workplanBackfills: readonly WorkplanBackfillInput[];
  readonly pr: PrInput | null;
  readonly issueInfo: (n: number) => IssueInfo;
}

interface Aggregation {
  readonly commits: ScannedCommit[];
  readonly auditEntries: AuditLogEntryInput[];
  readonly workplan: WorkplanBackfillInput[];
}

export function assembleBundles(args: AssembleArgs): readonly CandidateBundle[] {
  const byIssue = new Map<number, Aggregation>();

  function ensure(issue: number): Aggregation {
    let a = byIssue.get(issue);
    if (a === undefined) {
      a = { commits: [], auditEntries: [], workplan: [] };
      byIssue.set(issue, a);
    }
    return a;
  }

  // Step 1: walk commits, extract mentions from subject+body, attach.
  for (const c of args.commits) {
    const mentions = extractMentions(`${c.subject}\n${c.body}`);
    for (const issue of mentions) {
      ensure(issue).commits.push(c);
    }
  }

  // Step 2: walk audit-log entries; tracks_issue OR body mentions count.
  for (const e of args.auditLogEntries) {
    const fromBody = extractMentions(e.body);
    const set = new Set<number>(fromBody);
    if (e.tracks_issue !== null) set.add(e.tracks_issue);
    for (const issue of set) {
      ensure(issue).auditEntries.push(e);
    }
  }

  // Step 3: walk workplan back-fills; text mentions count.
  for (const w of args.workplanBackfills) {
    const mentions = extractMentions(w.text);
    for (const issue of mentions) {
      ensure(issue).workplan.push(w);
    }
  }

  // Step 4: PR mentions attach to every issue the PR description references
  // (so a PR closing multiple issues attaches the PR to every bundle).
  const prIssues = args.pr === null ? new Set<number>() : extractMentions(args.pr.body);

  // Step 5: compose bundles.
  const out: CandidateBundle[] = [];
  for (const [issue, agg] of byIssue) {
    const info = args.issueInfo(issue);
    out.push({
      issue: {
        number: info.number,
        title: info.title,
        state: info.state,
        body: truncate(info.body, ISSUE_BODY_CAP),
        recent_comments: info.recent_comments
          .slice(0, COMMENTS_PER_ISSUE_MAX)
          .map((c) => truncate(c, COMMENT_CAP)),
      },
      commits: agg.commits.map((c) => ({
        sha: c.sha,
        subject: c.subject,
        body: truncate(c.body, COMMIT_BODY_CAP),
        diff_stat: '', // filled in by scan.ts; bundle.ts doesn't read disk
      })),
      pr:
        args.pr !== null && prIssues.has(issue)
          ? {
              number: args.pr.number,
              title: args.pr.title,
              body: truncate(args.pr.body, PR_BODY_CAP),
            }
          : null,
      audit_log_entries: agg.auditEntries.map((e) => ({
        finding_id: e.finding_id,
        status: e.status,
        tracks_issue: e.tracks_issue,
        surface: e.surface,
        body: truncate(e.body, AUDIT_BODY_CAP),
      })),
      workplan_backfills: agg.workplan.map((w) => ({
        file: w.file,
        line: w.line,
        text: w.text,
      })),
    });
  }

  out.sort((a, b) => a.issue.number - b.issue.number);
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/__tests__/close-shipped-bundle.test.ts
```

Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
cd /Users/orion/work/deskwork-work/hygiene
git add plugins/dw-lifecycle/src/close-shipped/bundle.ts plugins/dw-lifecycle/src/__tests__/close-shipped-bundle.test.ts
git commit -m "feat(close-shipped): bundle assembler — group mentions into per-candidate evidence (Phase 15)"
```

---

### Task 4: `scan` runtime — walk tag range + emit bundle set as JSON

**Files:**
- Create: `plugins/dw-lifecycle/src/close-shipped/scan.ts`
- Test: `plugins/dw-lifecycle/src/__tests__/close-shipped-scan.test.ts`

- [ ] **Step 1: Write the failing test**

Create `plugins/dw-lifecycle/src/__tests__/close-shipped-scan.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { runScan } from '../close-shipped/scan.js';
import type { BundleSet, ScannedCommit } from '../close-shipped/types.js';

const fixtureCommits: readonly ScannedCommit[] = [
  { sha: 'aaa1234', subject: 'feat(x): subject (#42)', body: '' },
  { sha: 'bbb5678', subject: 'fix(y): another', body: 'Closes #43' },
];

describe('runScan', () => {
  it('emits a BundleSet keyed by tag range with one bundle per candidate', () => {
    const result: BundleSet = runScan({
      fromTag: 'v1.0.0',
      toTag: 'v1.1.0',
      repo: 'owner/repo',
      now: new Date('2026-05-30T00:00:00Z'),
      scanCommitsForRange: () => fixtureCommits,
      walkAuditLogEntries: () => [],
      walkWorkplanBackfills: () => [],
      resolvePrForRange: () => null,
      issueInfo: (n) => ({
        number: n,
        title: `Issue ${n}`,
        state: 'OPEN',
        body: '',
        recent_comments: [],
      }),
      runGit: () => '',
    });
    expect(result.from_tag).toBe('v1.0.0');
    expect(result.to_tag).toBe('v1.1.0');
    expect(result.repo).toBe('owner/repo');
    expect(result.bundles.map((b) => b.issue.number).sort()).toEqual([42, 43]);
  });

  it('embeds diff_stat from a runGit shortlog per commit', () => {
    const result = runScan({
      fromTag: 'v1.0.0',
      toTag: 'v1.1.0',
      repo: 'owner/repo',
      now: new Date('2026-05-30T00:00:00Z'),
      scanCommitsForRange: () => [fixtureCommits[0]!],
      walkAuditLogEntries: () => [],
      walkWorkplanBackfills: () => [],
      resolvePrForRange: () => null,
      issueInfo: (n) => ({
        number: n,
        title: `Issue ${n}`,
        state: 'OPEN',
        body: '',
        recent_comments: [],
      }),
      runGit: (args) => {
        if (args[0] === 'show' && args.includes('--stat')) {
          return ' 5 files changed, 87 insertions(+), 23 deletions(-)';
        }
        return '';
      },
    });
    const b42 = result.bundles.find((b) => b.issue.number === 42);
    expect(b42?.commits[0]?.diff_stat).toContain('5 files changed');
  });

  it('attaches the PR to bundles for each issue referenced in the PR body', () => {
    const result = runScan({
      fromTag: 'v1.0.0',
      toTag: 'v1.1.0',
      repo: 'owner/repo',
      now: new Date('2026-05-30T00:00:00Z'),
      scanCommitsForRange: () => [],
      walkAuditLogEntries: () => [],
      walkWorkplanBackfills: () => [],
      resolvePrForRange: () => ({
        number: 99,
        title: 'PR title',
        body: 'Closes #42 and #43',
      }),
      issueInfo: (n) => ({
        number: n,
        title: `Issue ${n}`,
        state: 'OPEN',
        body: '',
        recent_comments: [],
      }),
      runGit: () => '',
    });
    expect(result.bundles.find((b) => b.issue.number === 42)?.pr?.number).toBe(99);
    expect(result.bundles.find((b) => b.issue.number === 43)?.pr?.number).toBe(99);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/__tests__/close-shipped-scan.test.ts
```

Expected: FAIL with "Cannot find module '../close-shipped/scan.js'"

- [ ] **Step 3: Write the implementation**

Create `plugins/dw-lifecycle/src/close-shipped/scan.ts`:

```ts
// scan runtime for `close-shipped scan` CLI verb. Pure: takes injected
// I/O callbacks, emits a BundleSet. The CLI wrapper in close-shipped.ts
// wires the real runGit / runGh / walkers into these callbacks.

import { assembleBundles } from './bundle.js';
import type {
  AuditLogEntryInput,
  IssueInfo,
  PrInput,
  WorkplanBackfillInput,
} from './bundle.js';
import type { BundleSet, RunGit, ScannedCommit } from './types.js';

export interface RunScanArgs {
  readonly fromTag: string;
  readonly toTag: string;
  readonly repo: string;
  readonly now: Date;
  readonly scanCommitsForRange: () => readonly ScannedCommit[];
  readonly walkAuditLogEntries: () => readonly AuditLogEntryInput[];
  readonly walkWorkplanBackfills: () => readonly WorkplanBackfillInput[];
  readonly resolvePrForRange: () => PrInput | null;
  readonly issueInfo: (n: number) => IssueInfo;
  readonly runGit: RunGit;
}

function diffStatFor(sha: string, runGit: RunGit): string {
  try {
    const raw = runGit(['show', '--stat', '--format=', sha]);
    const last = raw.trim().split('\n').filter((l) => l.trim().length > 0).pop();
    return last?.trim() ?? '';
  } catch {
    return '';
  }
}

export function runScan(args: RunScanArgs): BundleSet {
  const commits = args.scanCommitsForRange();
  const auditEntries = args.walkAuditLogEntries();
  const workplanBackfills = args.walkWorkplanBackfills();
  const pr = args.resolvePrForRange();

  // Bundle assembly without diff_stat (bundle.ts is pure).
  const initialBundles = assembleBundles({
    commits,
    auditLogEntries: auditEntries,
    workplanBackfills,
    pr,
    issueInfo: args.issueInfo,
  });

  // Backfill diff_stat per commit by running `git show --stat` for each SHA.
  const diffStats = new Map<string, string>();
  for (const b of initialBundles) {
    for (const c of b.commits) {
      if (!diffStats.has(c.sha)) {
        diffStats.set(c.sha, diffStatFor(c.sha, args.runGit));
      }
    }
  }

  const bundles = initialBundles.map((b) => ({
    ...b,
    commits: b.commits.map((c) => ({
      ...c,
      diff_stat: diffStats.get(c.sha) ?? '',
    })),
  }));

  return {
    generated_at: args.now.toISOString(),
    from_tag: args.fromTag,
    to_tag: args.toTag,
    repo: args.repo,
    bundles,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/__tests__/close-shipped-scan.test.ts
```

Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
cd /Users/orion/work/deskwork-work/hygiene
git add plugins/dw-lifecycle/src/close-shipped/scan.ts plugins/dw-lifecycle/src/__tests__/close-shipped-scan.test.ts
git commit -m "feat(close-shipped): scan runtime — emit BundleSet with diff stats per commit (Phase 15)"
```

---

### Task 5: Proposal composer — bundles + verdicts → proposal JSON + markdown table

**Files:**
- Create: `plugins/dw-lifecycle/src/close-shipped/propose.ts`
- Test: `plugins/dw-lifecycle/src/__tests__/close-shipped-propose.test.ts`

- [ ] **Step 1: Write the failing test**

Create `plugins/dw-lifecycle/src/__tests__/close-shipped-propose.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { composeProposal, renderMarkdownTable } from '../close-shipped/propose.js';
import type { BundleSet, VerdictSet } from '../close-shipped/types.js';

const FIXTURE_BUNDLES: BundleSet = {
  generated_at: '2026-05-30T03:15:22Z',
  from_tag: 'v0.27.0',
  to_tag: 'v0.28.1',
  repo: 'owner/repo',
  bundles: [
    {
      issue: { number: 361, title: 'session-end-hygiene sweep', state: 'OPEN', body: '', recent_comments: [] },
      commits: [
        { sha: 'aaa1234', subject: 'feat: x', body: '', diff_stat: '5 files' },
      ],
      pr: { number: 365, title: 'PR title', body: '' },
      audit_log_entries: [
        { finding_id: 'AUDIT-1', status: 'fixed-aaa1234', tracks_issue: 361, surface: 'src/foo.ts', body: '' },
      ],
      workplan_backfills: [],
    },
    {
      issue: { number: 353, title: 'audit-barrage Phase 12', state: 'OPEN', body: '', recent_comments: [] },
      commits: [{ sha: 'bbb5678', subject: 'docs: back-fill', body: '', diff_stat: '1 file' }],
      pr: null,
      audit_log_entries: [],
      workplan_backfills: [],
    },
  ],
};

const FIXTURE_VERDICTS: VerdictSet = {
  verdicts: [
    { issue: 361, verdict: 'shipped', reason: 'Phase 12 fix lands in 8841be9' },
    { issue: 353, verdict: 'not-shipped', reason: 'back-fill docs commit, not a fix' },
  ],
};

describe('composeProposal', () => {
  it('produces one item per bundle in issue-ascending order with empty decisions', () => {
    const p = composeProposal(FIXTURE_BUNDLES, FIXTURE_VERDICTS);
    expect(p.items.map((i) => i.issue)).toEqual([353, 361]);
    for (const item of p.items) expect(item.decision).toBe('');
  });

  it('mirrors tag range + generated_at + repo from the bundle set', () => {
    const p = composeProposal(FIXTURE_BUNDLES, FIXTURE_VERDICTS);
    expect(p.from_tag).toBe('v0.27.0');
    expect(p.to_tag).toBe('v0.28.1');
    expect(p.repo).toBe('owner/repo');
  });

  it('attaches the agent verdict + reason to each item', () => {
    const p = composeProposal(FIXTURE_BUNDLES, FIXTURE_VERDICTS);
    const i361 = p.items.find((i) => i.issue === 361);
    expect(i361?.agent_verdict).toBe('shipped');
    expect(i361?.agent_reason).toBe('Phase 12 fix lands in 8841be9');
  });

  it('writes a mechanical evidence_summary citing counts + PR linkage', () => {
    const p = composeProposal(FIXTURE_BUNDLES, FIXTURE_VERDICTS);
    const i361 = p.items.find((i) => i.issue === 361);
    expect(i361?.evidence_summary).toContain('1 commit');
    expect(i361?.evidence_summary).toContain('1 audit');
    expect(i361?.evidence_summary).toContain('PR #365');
    const i353 = p.items.find((i) => i.issue === 353);
    expect(i353?.evidence_summary).not.toContain('PR #');
  });

  it('marks a candidate `error` when there is no matching verdict in the set', () => {
    const orphan: BundleSet = {
      ...FIXTURE_BUNDLES,
      bundles: [...FIXTURE_BUNDLES.bundles, {
        issue: { number: 999, title: 'orphan', state: 'OPEN', body: '', recent_comments: [] },
        commits: [],
        pr: null,
        audit_log_entries: [],
        workplan_backfills: [],
      }],
    };
    const p = composeProposal(orphan, FIXTURE_VERDICTS);
    const i999 = p.items.find((i) => i.issue === 999);
    expect(i999?.agent_verdict).toBe('error');
    expect(i999?.agent_reason).toContain('no verdict');
  });
});

describe('renderMarkdownTable', () => {
  it('renders a header + one row per item', () => {
    const p = composeProposal(FIXTURE_BUNDLES, FIXTURE_VERDICTS);
    const table = renderMarkdownTable(p);
    expect(table).toContain('| Issue');
    expect(table).toContain('#361');
    expect(table).toContain('#353');
    expect(table).toContain('shipped');
    expect(table).toContain('not-shipped');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/__tests__/close-shipped-propose.test.ts
```

Expected: FAIL with "Cannot find module '../close-shipped/propose.js'"

- [ ] **Step 3: Write the implementation**

Create `plugins/dw-lifecycle/src/close-shipped/propose.ts`:

```ts
// Pure proposal composer: BundleSet + VerdictSet → Proposal. Also renders
// the markdown summary table the CLI emits after propose runs.
//
// No I/O — the CLI wrapper reads bundles + verdicts JSON files, calls
// this composer, writes the proposal JSON + prints the markdown.

import type { BundleSet, Proposal, ProposalItem, VerdictSet } from './types.js';

function evidenceSummary(bundle: BundleSet['bundles'][number]): string {
  const parts: string[] = [];
  const commitCount = bundle.commits.length;
  parts.push(`${commitCount} commit${commitCount === 1 ? '' : 's'}`);
  const auditCount = bundle.audit_log_entries.length;
  if (auditCount > 0) {
    parts.push(`${auditCount} audit entr${auditCount === 1 ? 'y' : 'ies'}`);
  }
  const workplanCount = bundle.workplan_backfills.length;
  if (workplanCount > 0) {
    parts.push(`${workplanCount} workplan back-fill${workplanCount === 1 ? '' : 's'}`);
  }
  if (bundle.pr !== null) {
    parts.push(`PR #${bundle.pr.number}`);
  }
  return parts.join(', ');
}

export function composeProposal(
  bundles: BundleSet,
  verdicts: VerdictSet,
): Proposal {
  const verdictByIssue = new Map<number, VerdictSet['verdicts'][number]>();
  for (const v of verdicts.verdicts) verdictByIssue.set(v.issue, v);

  const items: ProposalItem[] = bundles.bundles.map((b) => {
    const v = verdictByIssue.get(b.issue.number);
    return {
      issue: b.issue.number,
      issue_title: b.issue.title,
      issue_state: b.issue.state,
      agent_verdict: v?.verdict ?? 'error',
      agent_reason: v?.reason ?? 'no verdict returned for this candidate',
      evidence_summary: evidenceSummary(b),
      decision: '',
    };
  });

  items.sort((a, b) => a.issue - b.issue);

  return {
    generated_at: bundles.generated_at,
    from_tag: bundles.from_tag,
    to_tag: bundles.to_tag,
    repo: bundles.repo,
    items,
  };
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : `${s.slice(0, n - 1)}…`;
}

export function renderMarkdownTable(proposal: Proposal): string {
  const lines: string[] = [];
  lines.push(`# close-shipped proposal — ${proposal.from_tag}..${proposal.to_tag}`);
  lines.push('');
  lines.push(`Generated: ${proposal.generated_at}  ·  Repo: ${proposal.repo}`);
  lines.push('');
  lines.push('| #  | Issue | Title (truncated)             | State  | Verdict     | Reason (truncated)                  | Decision    |');
  lines.push('|----|-------|-------------------------------|--------|-------------|-------------------------------------|-------------|');
  proposal.items.forEach((item, idx) => {
    const title = truncate(item.issue_title, 30);
    const reason = truncate(item.agent_reason, 35);
    lines.push(
      `| ${idx + 1} | #${item.issue} | ${title} | ${item.issue_state} | ${item.agent_verdict} | ${reason} | _(operator)_ |`,
    );
  });
  return lines.join('\n');
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/__tests__/close-shipped-propose.test.ts
```

Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
cd /Users/orion/work/deskwork-work/hygiene
git add plugins/dw-lifecycle/src/close-shipped/propose.ts plugins/dw-lifecycle/src/__tests__/close-shipped-propose.test.ts
git commit -m "feat(close-shipped): propose composer — bundles + verdicts → Proposal JSON + markdown (Phase 15)"
```

---

### Task 6: New apply runtime — pre-validate proposal + dispatch gh mutations

**Files:**
- Create: `plugins/dw-lifecycle/src/close-shipped/apply-v2.ts`
- Test: `plugins/dw-lifecycle/src/__tests__/close-shipped-apply-v2.test.ts`

- [ ] **Step 1: Write the failing test**

Create `plugins/dw-lifecycle/src/__tests__/close-shipped-apply-v2.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { applyV2, InvalidProposalError } from '../close-shipped/apply-v2.js';
import type { Proposal } from '../close-shipped/types.js';

const baseProposal: Proposal = {
  generated_at: '2026-05-30T03:15:22Z',
  from_tag: 'v0.27.0',
  to_tag: 'v0.28.1',
  repo: 'owner/repo',
  items: [
    {
      issue: 361,
      issue_title: 'session-end-hygiene',
      issue_state: 'OPEN',
      agent_verdict: 'shipped',
      agent_reason: 'Phase 12 fix lands in 8841be9',
      evidence_summary: '1 commit, 1 audit entry, PR #365',
      decision: 'accept-verdict',
    },
    {
      issue: 353,
      issue_title: 'audit-barrage Phase 12',
      issue_state: 'OPEN',
      agent_verdict: 'not-shipped',
      agent_reason: 'back-fill docs commit',
      evidence_summary: '1 commit',
      decision: 'accept-verdict',
    },
  ],
};

describe('applyV2', () => {
  it('throws InvalidProposalError when any item has empty decision', () => {
    const bad: Proposal = {
      ...baseProposal,
      items: [{ ...baseProposal.items[0]!, decision: '' }],
    };
    expect(() => applyV2({ proposal: bad, runGh: () => '' })).toThrow(
      InvalidProposalError,
    );
  });

  it('throws InvalidProposalError when any item has an unknown decision', () => {
    const bad: Proposal = {
      ...baseProposal,
      items: [
        // @ts-expect-error: testing runtime validation of an invalid literal
        { ...baseProposal.items[0]!, decision: 'frobnicate' },
      ],
    };
    expect(() => applyV2({ proposal: bad, runGh: () => '' })).toThrow(
      InvalidProposalError,
    );
  });

  it('dispatches gh comment + label per accept-verdict-shipped item; skips others', () => {
    const ghCalls: readonly string[][] = [];
    const runGh = (args: readonly string[]): string => {
      (ghCalls as string[][]).push([...args]);
      return '';
    };
    const result = applyV2({ proposal: baseProposal, runGh });
    expect(result.applied.length).toBe(1);
    expect(result.applied[0]?.issue).toBe(361);
    expect(result.skipped.length).toBe(1);
    expect(result.skipped[0]?.issue).toBe(353);
    // 2 gh calls per applied item (comment + edit).
    expect(ghCalls.length).toBe(2);
    expect(ghCalls[0]?.includes('comment')).toBe(true);
    expect(ghCalls[1]?.includes('edit')).toBe(true);
  });

  it('override-shipped triggers gh dispatch regardless of agent verdict', () => {
    const overridden: Proposal = {
      ...baseProposal,
      items: [
        { ...baseProposal.items[0]!, decision: 'override-shipped' },
        { ...baseProposal.items[1]!, decision: 'override-shipped' },
      ],
    };
    const ghCalls: readonly string[][] = [];
    const result = applyV2({
      proposal: overridden,
      runGh: (args) => {
        (ghCalls as string[][]).push([...args]);
        return '';
      },
    });
    expect(result.applied.length).toBe(2);
  });

  it('records gh failures as failed items but keeps applying the rest', () => {
    let firstCall = true;
    const result = applyV2({
      proposal: baseProposal,
      runGh: () => {
        if (firstCall) {
          firstCall = false;
          throw new Error('gh: rate limit');
        }
        return '';
      },
    });
    expect(result.failed.length).toBe(1);
    expect(result.failed[0]?.error).toContain('rate limit');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/__tests__/close-shipped-apply-v2.test.ts
```

Expected: FAIL with "Cannot find module '../close-shipped/apply-v2.js'"

- [ ] **Step 3: Write the implementation**

Create `plugins/dw-lifecycle/src/close-shipped/apply-v2.ts`:

```ts
// New apply runtime for the Phase 15 close-shipped redesign. Consumes
// an operator-curated Proposal; pre-validates every item has a valid
// decision; dispatches gh comment + label per effectively-shipped row.

import type { Proposal, ProposalDecision, ProposalItem, RunGh } from './types.js';

export class InvalidProposalError extends Error {
  override name = 'InvalidProposalError';
}

const VALID_DECISIONS: ReadonlySet<ProposalDecision> = new Set([
  'accept-verdict',
  'override-shipped',
  'override-not-shipped',
  'skip',
]);

const LABEL = 'pending-verification';

export interface PerItemOutcome {
  readonly issue: number;
  readonly error?: string;
}

export interface ApplyV2Result {
  readonly applied: readonly PerItemOutcome[];
  readonly skipped: readonly PerItemOutcome[];
  readonly failed: readonly PerItemOutcome[];
}

export interface ApplyV2Args {
  readonly proposal: Proposal;
  readonly runGh: RunGh;
}

function effectiveVerdict(item: ProposalItem): 'shipped' | 'skip' {
  switch (item.decision) {
    case 'accept-verdict':
      return item.agent_verdict === 'shipped' ? 'shipped' : 'skip';
    case 'override-shipped':
      return 'shipped';
    case 'override-not-shipped':
    case 'skip':
      return 'skip';
    default:
      return 'skip';
  }
}

function validateProposal(proposal: Proposal): void {
  const errors: string[] = [];
  proposal.items.forEach((item, idx) => {
    if (item.decision === '' || !VALID_DECISIONS.has(item.decision as ProposalDecision)) {
      errors.push(
        `item ${idx + 1} (#${item.issue}): decision is "${item.decision || '<unset>'}"; ` +
          `must be one of: ${Array.from(VALID_DECISIONS).join(', ')}.`,
      );
    }
  });
  if (errors.length > 0) {
    throw new InvalidProposalError(
      `Proposal failed validation; refusing to apply.\n  ${errors.join('\n  ')}`,
    );
  }
}

function buildCommentBody(item: ProposalItem, proposal: Proposal): string {
  return [
    `Shipped in ${proposal.to_tag}. Please verify against an installed release before closing this issue.`,
    '',
    'Evidence: ' + item.evidence_summary,
    'Agent reason: ' + item.agent_reason,
    '',
    'Install / repro instructions (per the project rule "Issue closure requires verification in a formally-installed release"):',
    `1. Install / upgrade to ${proposal.to_tag}.`,
    '2. Reproduce the original issue.',
    '3. If the fix holds, close with a brief note.',
    '4. If not, comment with the surviving symptom.',
  ].join('\n');
}

export function applyV2(args: ApplyV2Args): ApplyV2Result {
  validateProposal(args.proposal);

  const applied: PerItemOutcome[] = [];
  const skipped: PerItemOutcome[] = [];
  const failed: PerItemOutcome[] = [];

  for (const item of args.proposal.items) {
    if (effectiveVerdict(item) === 'skip') {
      skipped.push({ issue: item.issue });
      continue;
    }
    const num = String(item.issue);
    try {
      const body = buildCommentBody(item, args.proposal);
      args.runGh(['issue', 'comment', num, '--repo', args.proposal.repo, '--body', body]);
      args.runGh([
        'issue',
        'edit',
        num,
        '--repo',
        args.proposal.repo,
        '--add-label',
        LABEL,
      ]);
      applied.push({ issue: item.issue });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      failed.push({ issue: item.issue, error: msg });
    }
  }

  return { applied, skipped, failed };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/__tests__/close-shipped-apply-v2.test.ts
```

Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
cd /Users/orion/work/deskwork-work/hygiene
git add plugins/dw-lifecycle/src/close-shipped/apply-v2.ts plugins/dw-lifecycle/src/__tests__/close-shipped-apply-v2.test.ts
git commit -m "feat(close-shipped): apply-v2 runtime — pre-validate Proposal + dispatch gh per accepted row (Phase 15)"
```

---

### Task 7: CLI verb dispatch — wire `scan` / `propose` / `apply` keywords into close-shipped.ts

**Files:**
- Modify: `plugins/dw-lifecycle/src/subcommands/close-shipped.ts`

- [ ] **Step 1: Read the current dispatcher**

```bash
sed -n '1,40p' /Users/orion/work/deskwork-work/hygiene/plugins/dw-lifecycle/src/subcommands/close-shipped.ts
```

Expected: imports + start of the `runCloseShipped` orchestration function.

- [ ] **Step 2: Add the three new sub-verb implementations at the top of the file (after imports)**

Insert these functions in `close-shipped.ts` immediately before the existing `runCloseShipped` function. Each one parses its own flags and calls into the corresponding runtime.

```ts
// --- Phase 15 sub-verbs ---

import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { runScan } from '../close-shipped/scan.js';
import { composeProposal, renderMarkdownTable } from '../close-shipped/propose.js';
import { applyV2, InvalidProposalError } from '../close-shipped/apply-v2.js';
import type { BundleSet, Proposal, VerdictSet } from '../close-shipped/types.js';

function parseScanArgs(args: readonly string[]): {
  fromTag: string | null;
  toTag: string | null;
  output: string | null;
  repo: string | null;
} {
  let fromTag: string | null = null;
  let toTag: string | null = null;
  let output: string | null = null;
  let repo: string | null = null;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--from-tag') { fromTag = args[++i] ?? null; continue; }
    if (a === '--to-tag') { toTag = args[++i] ?? null; continue; }
    if (a === '--output') { output = args[++i] ?? null; continue; }
    if (a === '--repo') { repo = args[++i] ?? null; continue; }
    throw new Error(`Unknown flag for scan: ${a}`);
  }
  return { fromTag, toTag, output, repo };
}

function runScanCli(args: readonly string[]): number {
  const opts = parseScanArgs(args);
  if (opts.fromTag === null || opts.toTag === null) {
    process.stderr.write('scan requires --from-tag <vA> --to-tag <vB>\n');
    return 2;
  }
  // For initial ship: scaffold the runtime stubs (full wiring lands in Task 8).
  process.stderr.write('scan: runtime wiring lands in Task 8\n');
  return 2;
}

function runProposeCli(args: readonly string[]): number {
  let bundlesPath: string | null = null;
  let verdictsPath: string | null = null;
  let output: string | null = null;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--bundles') { bundlesPath = args[++i] ?? null; continue; }
    if (a === '--verdicts') { verdictsPath = args[++i] ?? null; continue; }
    if (a === '--output') { output = args[++i] ?? null; continue; }
    throw new Error(`Unknown flag for propose: ${a}`);
  }
  if (bundlesPath === null || verdictsPath === null) {
    process.stderr.write('propose requires --bundles <path> --verdicts <path>\n');
    return 2;
  }
  const bundles: BundleSet = JSON.parse(readFileSync(bundlesPath, 'utf8'));
  const verdicts: VerdictSet = JSON.parse(readFileSync(verdictsPath, 'utf8'));
  const proposal = composeProposal(bundles, verdicts);
  const outputPath =
    output ??
    join(
      process.cwd(),
      '.dw-lifecycle',
      'close-shipped',
      `proposals-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
    );
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, JSON.stringify(proposal, null, 2));
  process.stdout.write(`Proposal written: ${outputPath}\n\n`);
  process.stdout.write(renderMarkdownTable(proposal));
  process.stdout.write('\n');
  return 0;
}

function runApplyCli(args: readonly string[]): number {
  let proposalPath: string | null = null;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--proposal') { proposalPath = args[++i] ?? null; continue; }
    throw new Error(`Unknown flag for apply: ${a}`);
  }
  if (proposalPath === null) {
    process.stderr.write('apply requires --proposal <path>\n');
    return 2;
  }
  const proposal: Proposal = JSON.parse(readFileSync(proposalPath, 'utf8'));
  const runGh = (gargs: readonly string[]): string => {
    return execFileSync('gh', gargs as string[], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  };
  try {
    const result = applyV2({ proposal, runGh });
    process.stdout.write(
      `Applied ${result.applied.length}, skipped ${result.skipped.length}, failed ${result.failed.length}.\n`,
    );
    for (const f of result.failed) {
      process.stderr.write(`failed #${f.issue}: ${f.error}\n`);
    }
    if (result.failed.length === proposal.items.length) return 1;
    return 0;
  } catch (err) {
    if (err instanceof InvalidProposalError) {
      process.stderr.write(`${err.message}\n`);
      return 2;
    }
    throw err;
  }
}
```

- [ ] **Step 3: Modify `closeShipped` (the exported entry function) to dispatch on first positional**

Find the `closeShipped` function in `close-shipped.ts`. Modify its entry to check argv[0]:

```ts
export async function closeShipped(args: string[]): Promise<void> {
  // Phase 15 redesign: verb dispatch.
  const first = args[0];
  if (first === 'scan') {
    process.exit(runScanCli(args.slice(1)));
  }
  if (first === 'propose') {
    process.exit(runProposeCli(args.slice(1)));
  }
  if (first === 'apply') {
    process.exit(runApplyCli(args.slice(1)));
  }
  // Bare invocation: existing legacy flow.
  // (keep all existing code below unchanged)
  // ... rest of existing closeShipped body ...
}
```

- [ ] **Step 4: Run typecheck + the broader test suite**

```bash
cd /Users/orion/work/deskwork-work/hygiene/plugins/dw-lifecycle && npx tsc --noEmit && npx vitest run src/__tests__/close-shipped 2>&1 | tail -10
```

Expected: zero TS errors; existing close-shipped tests still pass.

- [ ] **Step 5: Commit**

```bash
cd /Users/orion/work/deskwork-work/hygiene
git add plugins/dw-lifecycle/src/subcommands/close-shipped.ts
git commit -m "feat(close-shipped): CLI verb dispatch — scan|propose|apply keywords (Phase 15 wiring)"
```

---

### Task 8: Wire `scan` CLI verb's I/O callbacks to the real walkers + git

**Files:**
- Modify: `plugins/dw-lifecycle/src/subcommands/close-shipped.ts`

- [ ] **Step 1: Replace the placeholder `runScanCli` body with the real wiring**

Replace the `runScanCli` implementation from Task 7 with this fully-wired version. The runtime calls `scanCommits` for git history, `walkAuditLogs` for audit-log entries, `walkWorkplans` for workplan back-fills, and `gh issue view` for per-issue metadata.

```ts
function runScanCli(args: readonly string[]): number {
  const opts = parseScanArgs(args);
  if (opts.fromTag === null || opts.toTag === null) {
    process.stderr.write('scan requires --from-tag <vA> --to-tag <vB>\n');
    return 2;
  }
  const projectRoot = repoRoot();
  const config = loadConfig(projectRoot);
  const repo = opts.repo ?? detectRepoFromGit();
  if (repo === null) {
    process.stderr.write('scan: --repo not supplied and could not auto-detect\n');
    return 2;
  }
  const runGit: RunGit = (gargs) =>
    execFileSync('git', gargs as string[], { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] });
  const runGh: RunGh = (gargs) =>
    execFileSync('gh', gargs as string[], { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] });

  // Build the I/O callbacks for runScan.
  const scanCommitsForRange = () =>
    scanAndGroup({ fromTag: opts.fromTag!, toTag: opts.toTag!, runGit }).commits;

  const walkAuditLogEntriesAdapter = () => {
    // walkAuditLogs returns findings; for Phase 15 we want the raw
    // entry text + Tracks-Issue field so the bundle can attach the
    // entry by mention. Re-emit findings as AuditLogEntryInput[].
    const findings = walkAuditLogs({
      projectRoot,
      config,
      fromTag: opts.fromTag!,
      toTag: opts.toTag!,
      runGit,
    });
    return findings.map((f) => ({
      finding_id: f.findingId,
      status: `fixed-${f.sha}`,
      tracks_issue: f.issueNumber, // walker already resolves this
      surface: f.entryHeading,
      body: '', // walker doesn't expose body; sufficient for the bundle
    }));
  };

  const walkWorkplanBackfillsAdapter = () => {
    const findings = walkWorkplans({ projectRoot, config });
    return findings.map((f) => ({
      file: f.workplanPath,
      line: f.lineNumber,
      text: f.lineText,
    }));
  };

  const resolvePrForRange = (): null => {
    // v1: leave PR lookup out (would require gh pr list + filtering).
    // Bundles still work via commits / audit / workplan.
    return null;
  };

  const issueInfo = (n: number) => {
    try {
      const raw = runGh(['issue', 'view', String(n), '--repo', repo, '--json', 'number,title,state,body']);
      const data = JSON.parse(raw);
      return {
        number: n,
        title: typeof data.title === 'string' ? data.title : `Issue ${n}`,
        state: data.state === 'OPEN' || data.state === 'CLOSED' ? data.state : 'UNKNOWN',
        body: typeof data.body === 'string' ? data.body : '',
        recent_comments: [],
      };
    } catch {
      return { number: n, title: `Issue ${n}`, state: 'UNKNOWN' as const, body: '', recent_comments: [] };
    }
  };

  const bundleSet = runScan({
    fromTag: opts.fromTag,
    toTag: opts.toTag,
    repo,
    now: new Date(),
    scanCommitsForRange,
    walkAuditLogEntries: walkAuditLogEntriesAdapter,
    walkWorkplanBackfills: walkWorkplanBackfillsAdapter,
    resolvePrForRange,
    issueInfo,
    runGit,
  });

  const out = opts.output;
  if (out !== null) {
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify(bundleSet, null, 2));
    process.stderr.write(`Bundles written: ${out}\n`);
  } else {
    process.stdout.write(JSON.stringify(bundleSet, null, 2));
    process.stdout.write('\n');
  }
  return 0;
}

function detectRepoFromGit(): string | null {
  try {
    const url = execFileSync('git', ['remote', 'get-url', 'origin'], { encoding: 'utf-8' }).trim();
    const m = /github\.com[:/]([^/]+)\/([^/.]+)(?:\.git)?$/.exec(url);
    if (m && m[1] && m[2]) return `${m[1]}/${m[2]}`;
  } catch { /* fall through */ }
  return null;
}
```

The `walkWorkplans` function may need a wrapper if its return shape doesn't match `WorkplanBackfillInput`. Confirm the shape by running the command in step 2 below before committing.

- [ ] **Step 2: Confirm walkWorkplans + walkAuditLogs return-types match**

```bash
grep -n "export function walkWorkplans\|export function walkAuditLogs" /Users/orion/work/deskwork-work/hygiene/plugins/dw-lifecycle/src/close-shipped/*.ts
```

Expected: signatures named. Adjust the adapter shapes in step 1 if the return-type fields don't match (`lineText`, `lineNumber`, `workplanPath`, etc.) — the names there are placeholders; replace with the actual field names returned by the existing walker.

- [ ] **Step 3: Live-test the scan against the local v0.26.5..v0.27.0 range**

```bash
cd /Users/orion/work/deskwork-work/hygiene
npx tsx plugins/dw-lifecycle/src/cli.ts close-shipped scan --from-tag v0.26.5 --to-tag v0.27.0 2>&1 | tail -20
```

Expected: JSON output (BundleSet) with bundles for #356, #361, #364, and any other issues mentioned in the range.

- [ ] **Step 4: Run typecheck + tests**

```bash
cd /Users/orion/work/deskwork-work/hygiene/plugins/dw-lifecycle && npx tsc --noEmit && npx vitest run 2>&1 | tail -5
```

Expected: zero TS errors; full plugin suite still green.

- [ ] **Step 5: Commit**

```bash
cd /Users/orion/work/deskwork-work/hygiene
git add plugins/dw-lifecycle/src/subcommands/close-shipped.ts
git commit -m "feat(close-shipped): wire scan CLI verb to real walkers + git (Phase 15)"
```

---

### Task 9: SKILL.md rewrite — Agent-tool dispatch flow

**Files:**
- Modify: `plugins/dw-lifecycle/skills/close-shipped/SKILL.md`

- [ ] **Step 1: Read the current SKILL.md to understand its current shape**

```bash
wc -l /Users/orion/work/deskwork-work/hygiene/plugins/dw-lifecycle/skills/close-shipped/SKILL.md
```

Expected: ~200 lines. Read the file to confirm its structure (frontmatter + ## sections).

- [ ] **Step 2: Replace the "Steps" section with the new agent-dispatch orchestration**

Find the existing `## Steps` heading in the SKILL.md and replace its body (everything between `## Steps` and the next `## ` heading) with:

```markdown
## Steps

The skill operates in three phases (`scan` → agent dispatch → `propose`) followed by an operator review and a final `apply` invocation. The Agent-tool dispatch is what the agent (you) does in the middle; the rest is CLI helpers the agent invokes.

### Phase A — scan + agent dispatch + propose

1. Resolve `--from-tag` and `--to-tag` (or accept the defaults: previous + most-recent `v*` tags).
2. Run the scan helper to emit the candidate bundle set:

   ```bash
   dw-lifecycle close-shipped scan --from-tag <vA> --to-tag <vB> --output /tmp/close-shipped-bundles.json
   ```

3. Read the bundles JSON. Count `bundles.length`. If the count exceeds the configured threshold (default 50), surface the count to the operator and confirm before continuing.
4. **Dispatch one Agent tool call per bundle, in parallel.** Single message with N `Agent({...})` tool_use blocks. Each agent gets:
   - `subagent_type: 'general-purpose'`
   - A prompt composed from the bundle using this template:

     ```
     You are evaluating whether a GitHub issue's fix was shipped in a specific release range.

     Issue #{number}: {title}
     State: {state}
     Body:
     {body}

     Recent comments:
     {recent_comments_joined}

     Evidence from the release (commits, PR, audit-log, workplan):
     {bundle_as_yaml}

     Question: Did the work above actually CLOSE this issue?

     A commit/PR closes an issue if its work made the issue's reported problem go
     away. References, back-links, cross-cites, and "tracks #N for context"
     patterns are NOT closes. Mere mentions, back-fill links, or docs commits that
     cite the issue number for context are NOT closes.

     Return strict JSON only:
     {"verdict": "shipped" | "not-shipped" | "uncertain", "reason": "<one sentence>"}
     ```

5. Collect the verdicts. For each candidate, parse the agent's response as JSON. If the first parse fails, re-dispatch ONCE with a short correction note (e.g. "your previous response was not valid JSON; return only the verdict JSON"). If the second response also fails to parse, record `agent_verdict: "error"` with the raw response excerpt.

6. Write the verdicts JSON to `/tmp/close-shipped-verdicts.json` with shape `{ "verdicts": [{ "issue": <number>, "verdict": "...", "reason": "..." }, ...] }`.

7. Run the propose helper:

   ```bash
   dw-lifecycle close-shipped propose \
     --bundles /tmp/close-shipped-bundles.json \
     --verdicts /tmp/close-shipped-verdicts.json
   ```

   This writes the proposal JSON under `.dw-lifecycle/close-shipped/proposals-<timestamp>.json` and prints the markdown summary table.

8. Stop. Surface the proposal path + markdown table to the operator. The operator reviews the proposal file, fills in the `decision` field per item (`accept-verdict` / `override-shipped` / `override-not-shipped` / `skip`), then re-invokes the skill in apply mode.

### Phase B — apply

1. Run the apply helper:

   ```bash
   dw-lifecycle close-shipped apply --proposal <path-from-phase-A>
   ```

2. Pre-validation: every item must have a non-empty `decision`. If any is empty, the helper exits 2 and the operator re-edits the proposal.

3. Per-item dispatch: each `accept-verdict`-shipped or `override-shipped` item posts a `pending-verification` comment + adds the label via `gh`. Failures recorded per-item; partial-success surfaces with per-row reasons.

4. Report `applied: N, skipped: M, failed: P` to the operator.

## Legacy fallback

A bare `dw-lifecycle close-shipped --from-tag <vA> --to-tag <vB>` invocation (no sub-verb) still runs the pre-Phase-15 4-walker flow. The legacy path is preserved for one release cycle to give adopters time to migrate; in a later version it will require an explicit `--legacy` flag, then be removed entirely.
```

- [ ] **Step 3: Adjust the description in the frontmatter**

Find the YAML frontmatter at the top of the SKILL.md and update the `description` to:

```yaml
description: "Release-time pending-verification labeling. Phase 15 redesign: mechanical narrowing → per-candidate Agent dispatch (parallel, via the Agent tool from within the agent's Claude Code session) → operator-curated propose | apply. Does NOT close the issue — closure waits for operator verification per the project rule."
```

- [ ] **Step 4: Run plugin tests to confirm SKILL.md prose changes don't break anything**

```bash
cd /Users/orion/work/deskwork-work/hygiene/plugins/dw-lifecycle && npx vitest run 2>&1 | tail -5
```

Expected: full suite still passes.

- [ ] **Step 5: Commit**

```bash
cd /Users/orion/work/deskwork-work/hygiene
git add plugins/dw-lifecycle/skills/close-shipped/SKILL.md
git commit -m "docs(close-shipped): SKILL.md rewrite — agent-tool dispatch orchestration (Phase 15)"
```

---

### Task 10: Extend smoke-hygiene.sh with the new scan → propose → apply round-trip

**Files:**
- Modify: `scripts/smoke-hygiene.sh`

- [ ] **Step 1: Add a new section to the smoke script after the existing `dismantle-worktrees apply` section**

Append this block before the final `echo "OK"` line:

```bash
# -------- Phase 15: close-shipped scan/propose/apply round-trip --------

echo "== smoke-hygiene: close-shipped scan =="
CS_BUNDLES="$FIXTURE/close-shipped-bundles.json"
"$DW_BIN" close-shipped scan --from-tag v0.1.0 --to-tag v0.2.0 --repo example/repo \
    --output "$CS_BUNDLES" 2>/dev/null || true
test -s "$CS_BUNDLES" \
  || fail "close-shipped scan produced no bundle output"
python3 -c "import json,sys; d=json.loads(open('$CS_BUNDLES').read()); assert 'bundles' in d, 'missing bundles'" \
  || fail "close-shipped scan emitted malformed BundleSet"

echo "== smoke-hygiene: close-shipped propose (with canned verdicts) =="
CS_VERDICTS="$FIXTURE/close-shipped-verdicts.json"
python3 - "$CS_BUNDLES" "$CS_VERDICTS" <<'PY'
import json, sys
from pathlib import Path
bundles = json.loads(Path(sys.argv[1]).read_text())
verdicts = {"verdicts": []}
for b in bundles.get("bundles", []):
    verdicts["verdicts"].append({
        "issue": b["issue"]["number"],
        "verdict": "shipped",
        "reason": "smoke fixture: marked all candidates as shipped",
    })
Path(sys.argv[2]).write_text(json.dumps(verdicts, indent=2))
PY
"$DW_BIN" close-shipped propose --bundles "$CS_BUNDLES" --verdicts "$CS_VERDICTS" >/dev/null 2>&1 \
  || fail "close-shipped propose failed"
CS_PROPOSAL=$(find "$FIXTURE/.dw-lifecycle/close-shipped" -name 'proposals-*.json' | head -n1)
test -n "$CS_PROPOSAL" \
  || fail "close-shipped propose did not write a proposal JSON"

echo "== smoke-hygiene: close-shipped apply (all-skip via decision flip) =="
python3 - "$CS_PROPOSAL" <<'PY'
import json, sys
from pathlib import Path
p = Path(sys.argv[1])
data = json.loads(p.read_text())
for item in data["items"]:
    item["decision"] = "skip"
p.write_text(json.dumps(data, indent=2))
PY
"$DW_BIN" close-shipped apply --proposal "$CS_PROPOSAL" >/dev/null 2>&1 \
  || fail "close-shipped apply (all-skip) failed"
```

The smoke uses the fixture's existing v0.1.0/v0.2.0 tags + the canned `gh` stub. Decision is flipped to `skip` so apply runs through pre-validation + dispatch logic without actually firing comments/labels.

- [ ] **Step 2: Run the extended smoke**

```bash
cd /Users/orion/work/deskwork-work/hygiene
bash scripts/smoke-hygiene.sh 2>&1 | tail -10
```

Expected: 13 verb sections complete with `OK` on the last line.

- [ ] **Step 3: Commit**

```bash
cd /Users/orion/work/deskwork-work/hygiene
git add scripts/smoke-hygiene.sh
git commit -m "feat(smoke-hygiene): extend with close-shipped scan|propose|apply round-trip (Phase 15)"
```

---

### Task 11: Live verification + workplan tick

**Files:**
- Modify: `docs/1.0/001-IN-PROGRESS/hygiene/workplan.md` (add Phase 15 section if not yet added)

- [ ] **Step 1: Run the full new flow against this project's v0.27.0..v0.28.1 range**

```bash
cd /Users/orion/work/deskwork-work/hygiene
npx tsx plugins/dw-lifecycle/src/cli.ts close-shipped scan \
  --from-tag v0.27.0 --to-tag v0.28.1 \
  --output /tmp/close-shipped-bundles.json
wc -l /tmp/close-shipped-bundles.json
```

Expected: JSON file with multiple bundles. Count the bundles (`jq '.bundles | length' /tmp/close-shipped-bundles.json` or `python3 -c "..."`). Confirm #361, #364 (the genuine Phase 12 Task 2 + Phase 13 Task 1 fixes that shipped in v0.28.1) appear.

- [ ] **Step 2: Hand-write a canned verdicts JSON**

For the live-verify pass (no Agent dispatches), write verdicts marking the known-shipped issues `shipped` and the rest `not-shipped`:

```bash
python3 - <<'PY'
import json
from pathlib import Path
bundles = json.loads(Path("/tmp/close-shipped-bundles.json").read_text())
verdicts = {"verdicts": []}
shipped_set = {361, 364}  # known v0.28.1 ships
for b in bundles["bundles"]:
    n = b["issue"]["number"]
    verdicts["verdicts"].append({
        "issue": n,
        "verdict": "shipped" if n in shipped_set else "not-shipped",
        "reason": "live-verify canned verdict",
    })
Path("/tmp/close-shipped-verdicts.json").write_text(json.dumps(verdicts, indent=2))
PY
```

- [ ] **Step 3: Run propose**

```bash
npx tsx plugins/dw-lifecycle/src/cli.ts close-shipped propose \
  --bundles /tmp/close-shipped-bundles.json \
  --verdicts /tmp/close-shipped-verdicts.json 2>&1 | tail -20
```

Expected: markdown table with the verdicts; proposal file under `.dw-lifecycle/close-shipped/proposals-<ts>.json`.

- [ ] **Step 4: Tick the Phase 15 acceptance criteria in the workplan + add an audit-log entry**

Add a Phase 15 section to `docs/1.0/001-IN-PROGRESS/hygiene/workplan.md` if not already there (this plan assumes the workplan extension lands as part of the implementation; see the design spec for the section text). Tick the four mechanical acceptance criteria (`scan` works, `propose` works, `apply` works, SKILL.md prose updated). Leave the verify-in-installed-release criterion open per the project rule.

Add an `AUDIT-20260530-02` entry to `audit-log.md`:

```markdown
## AUDIT-20260530-02 — Phase 15 close-shipped redesign (commits per task)

Finding-ID: AUDIT-20260530-02
Status:     fixed-pending-verification
Severity:   informational
Surface:    plugins/dw-lifecycle/src/close-shipped/{scan,propose,apply-v2,bundle,mention-scanner}.ts + SKILL.md
Tracks-Issue: 366

Phase 15 redesign of close-shipped: replaced the prose-grammar 4-walker
architecture with mechanical narrowing + Agent-tool dispatch from within
the agent's Claude Code session + operator-curated propose|apply flow.
Closes the unbounded patching cycle that motivated #366's Medium fix
proposal.

Live verification: scan against v0.27.0..v0.28.1 produces bundles for
the genuine shipping candidates (#361, #364) + the back-fill /
adjacent-mention noise; canned verdicts pass through propose; apply
round-trip works on the smoke fixture. Pending-verification status
closes when the next release ships the redesign + an operator runs
the full agent-dispatch flow against an installed version.
```

- [ ] **Step 5: Commit**

```bash
cd /Users/orion/work/deskwork-work/hygiene
git add docs/1.0/001-IN-PROGRESS/hygiene/workplan.md docs/1.0/001-IN-PROGRESS/hygiene/audit-log.md
git commit -m "docs(hygiene): Phase 15 live-verify pass + audit-log entry (#366 follow-up)"
```

---

## Self-review notes

**Spec coverage:** every acceptance criterion in `docs/superpowers/specs/2026-05-30-close-shipped-redesign.md` is covered:
- `scan` CLI verb → Tasks 2, 3, 4, 7, 8
- `propose` CLI verb → Tasks 5, 7
- `apply` CLI verb → Tasks 6, 7
- SKILL.md prose orchestration → Task 9
- Live verification → Task 11
- Candidate-count threshold confirmation → Task 9 (in SKILL.md prose, step 3 of Phase A)
- Vitest + smoke green → Tasks 8, 10
- Legacy flag preservation → Task 7 (bare invocation falls through to existing legacy code)
- SKILL.md prose names the flow → Task 9

**Placeholder scan:** no TODOs, no "implement later" phrases. Every step has actual code or actual commands. The one note about checking `walkWorkplans` return-type names (Task 8 Step 2) is a concrete grep, not a placeholder.

**Type consistency:** `CandidateBundle`, `BundleSet`, `Verdict`, `VerdictSet`, `ProposalItem`, `Proposal`, `ProposalDecision` are defined in Task 1 and referenced consistently in Tasks 3–7. `applyV2`, `InvalidProposalError`, `composeProposal`, `renderMarkdownTable`, `runScan`, `extractMentions`, `assembleBundles` are the exported symbols used across tasks.

**Open questions about wiring:**
- Task 8 depends on the existing `walkAuditLogs` and `walkWorkplans` return shapes. The adapter code in Task 8 Step 1 names placeholder field names (`lineText`, `workplanPath`); Step 2 verifies and adjusts. Implementation engineer must confirm by reading the existing walker exports before completing the wiring.
- The `repoRoot()` and `loadConfig()` imports are assumed to exist at the top of `subcommands/close-shipped.ts` (they're used by the existing legacy code). If not, the implementer adds the imports from `../repo.js` and `../config.js`.
