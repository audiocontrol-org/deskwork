// Walk the closing feature's GitHub issue tree from three sources, union the
// results, dedupe by issue number, and classify each candidate parent.
//
// Three sources are combined to keep the walker robust against any single
// source going stale:
//   (a) title-search via `gh issue list --search "<slug> in:title"`
//   (b) parent-children via `gh api /repos/.../issues/<parent>/timeline`
//   (c) workplan-anchored child enumeration from the workplan's per-phase
//       headings `## Phase N: ... · [#NNN](...)`
// The workplan-anchored source is the most authoritative because it is
// authored by the operator at planning time; the GitHub sources backfill
// anything the workplan missed.
//
// Classification is purely heuristic; the operator picks the final
// disposition in the proposal markdown table. The classifier exists to
// seed the table with the obvious choice.

import { existsSync, readFileSync } from 'node:fs';
import type {
  ChildIssueRef,
  ClassificationKind,
  RawIssueForSearch,
  RunGh,
} from './types.js';

// --- helpers ---------------------------------------------------------------

function isRawIssue(value: unknown): value is RawIssueForSearch {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.number === 'number' &&
    typeof v.title === 'string' &&
    typeof v.state === 'string' &&
    typeof v.url === 'string'
  );
}

function parseIssueList(raw: string): RawIssueForSearch[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Could not parse gh issue list output as JSON: ${message}`);
  }
  if (!Array.isArray(parsed)) {
    throw new Error(
      `gh issue list output was not a JSON array (got ${typeof parsed}).`,
    );
  }
  const issues: RawIssueForSearch[] = [];
  for (const item of parsed) {
    if (!isRawIssue(item)) {
      throw new Error(
        `gh issue list output contained an item missing expected fields: ${JSON.stringify(item).slice(0, 200)}`,
      );
    }
    issues.push(item);
  }
  return issues;
}

function normalizeState(raw: string): 'OPEN' | 'CLOSED' | 'UNKNOWN' {
  const upper = raw.toUpperCase();
  if (upper === 'OPEN' || upper === 'CLOSED') return upper;
  return 'UNKNOWN';
}

// --- source (a): title-search ---------------------------------------------

export interface TitleSearchArgs {
  readonly slug: string;
  readonly repo: string;
  readonly runGh: RunGh;
}

export function titleSearch(
  args: TitleSearchArgs,
): readonly RawIssueForSearch[] {
  const ghArgs: readonly string[] = [
    'issue',
    'list',
    '--repo',
    args.repo,
    '--search',
    `${args.slug} in:title`,
    '--state',
    'all',
    '--limit',
    '200',
    '--json',
    'number,title,state,url',
  ];
  const raw = args.runGh(ghArgs);
  return parseIssueList(raw);
}

// --- source (b): parent timeline ------------------------------------------
//
// `gh api /repos/<owner>/<repo>/issues/<n>/timeline` surfaces cross-reference
// events the parent has received. Filter to issues referencing the parent.
// We don't need every event -- just the issue numbers that referenced the
// parent so we can include them in the candidate set.

interface RawTimelineEvent {
  readonly event?: unknown;
  readonly source?: unknown;
}

interface RawSource {
  readonly issue?: unknown;
}

interface RawIssueRef {
  readonly number?: unknown;
  readonly state?: unknown;
  readonly title?: unknown;
  readonly url?: unknown;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export interface ParentTimelineArgs {
  readonly parentIssue: number;
  readonly repo: string;
  readonly runGh: RunGh;
}

export function parentTimeline(
  args: ParentTimelineArgs,
): readonly RawIssueForSearch[] {
  // Use `gh api --paginate` so we walk every page; the timeline can carry
  // hundreds of events on long-running features. The repo is interpolated
  // directly into the URL path -- `gh api` doesn't accept a `--repo` flag
  // (that flag is for `gh issue` / `gh pr`), and `gh api` won't substitute
  // `{owner}/{repo}` placeholders the way some other gh subcommands do.
  // Both bugs surfaced in #342: literal placeholders in the URL +
  // `--repo` flag together produced a `gh api: unknown flag` failure that
  // aborted the walker before the recovery contract could engage.
  const ghArgs: readonly string[] = [
    'api',
    `/repos/${args.repo}/issues/${args.parentIssue}/timeline`,
    '--paginate',
    '-H',
    'Accept: application/vnd.github+json',
  ];
  // `gh api --paginate` concatenates JSON arrays per page WITHOUT outer
  // wrapping them into a single array. Each page is a self-contained JSON
  // array on its own line(s). Split on the boundary `][` (a closing bracket
  // followed by an opening bracket) and re-wrap to parse as one stream.
  //
  // The recovery contract: ANY failure from `runGh` (404 on archived repos,
  // CLI usage error from a flag mismatch, network failure, malformed JSON
  // pagination, etc.) collapses to "this source contributed zero
  // candidates." The walker depends on the union of the three sources, not
  // on every source succeeding. A one-line stderr breadcrumb names the
  // failure mode so the operator can tell silent backfill apart from a
  // genuinely-empty timeline; the diagnostic pattern mirrors
  // session-end-hygiene.ts's resolveSessionBoundaryIso error handling.
  let raw: string;
  try {
    raw = args.runGh(ghArgs);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `complete-parent-closure: timeline source failed (${message.split('\n')[0]}); continuing with other sources`,
    );
    return [];
  }
  if (raw.trim() === '') return [];
  const concatenated = raw.replace(/\]\s*\[/g, ',');
  let parsed: unknown;
  try {
    parsed = JSON.parse(concatenated);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `complete-parent-closure: timeline source failed (json-parse: ${message.split('\n')[0]}); continuing with other sources`,
    );
    return [];
  }
  if (!Array.isArray(parsed)) {
    console.error(
      'complete-parent-closure: timeline source failed (response was not a JSON array); continuing with other sources',
    );
    return [];
  }
  const refs: RawIssueForSearch[] = [];
  for (const event of parsed) {
    if (!isPlainObject(event)) continue;
    const ev = event as RawTimelineEvent;
    if (ev.event !== 'cross-referenced') continue;
    if (!isPlainObject(ev.source)) continue;
    const source = ev.source as RawSource;
    if (!isPlainObject(source.issue)) continue;
    const issue = source.issue as RawIssueRef;
    if (typeof issue.number !== 'number') continue;
    refs.push({
      number: issue.number,
      title: typeof issue.title === 'string' ? issue.title : '',
      state: typeof issue.state === 'string' ? issue.state : 'unknown',
      url: typeof issue.url === 'string' ? issue.url : '',
    });
  }
  return refs;
}

// --- source (c): workplan-anchored ----------------------------------------
//
// The workplan's per-phase headings carry the issue number for each phase.
// Convention: `## Phase N: ... · [#NNN](https://github.com/.../issues/NNN)`.
// This source enumerates the EXPECTED child phase issues regardless of
// whether GitHub still sees them in the parent's timeline.

const PHASE_HEADING_RE = /^##\s+Phase\s+\d+:.*?·\s*\[#(\d+)\]/;

export interface WorkplanAnchoredArgs {
  readonly workplanPath: string;
}

export function workplanAnchored(
  args: WorkplanAnchoredArgs,
): readonly number[] {
  const { workplanPath } = args;
  if (!existsSync(workplanPath)) return [];
  const content = readFileSync(workplanPath, 'utf8');
  const lines = content.split('\n');
  const numbers: number[] = [];
  for (const line of lines) {
    const match = PHASE_HEADING_RE.exec(line);
    if (!match || !match[1]) continue;
    const n = Number.parseInt(match[1], 10);
    if (Number.isFinite(n) && n > 0) numbers.push(n);
  }
  return numbers;
}

// --- classifier ------------------------------------------------------------

export interface ClassifyArgs {
  readonly parentState: 'OPEN' | 'CLOSED' | 'UNKNOWN';
  readonly childStates: readonly ('OPEN' | 'CLOSED' | 'UNKNOWN')[];
  readonly matchesFeature: boolean;
}

export function classify(args: ClassifyArgs): ClassificationKind {
  if (!args.matchesFeature) return 'skip-not-this-feature';
  if (args.parentState === 'CLOSED') return 'skip-already-closed';
  // Only consider an OPEN child as "still open" -- UNKNOWN states are
  // treated as closed for the purposes of classification (the walker
  // already excluded any catastrophic lookup failures upstream). This
  // keeps the heuristic from blocking closure on a transient gh hiccup.
  const hasOpenChild = args.childStates.some((s) => s === 'OPEN');
  if (hasOpenChild) return 'close-with-open-children';
  return 'close-all-children-closed';
}

// --- combiner --------------------------------------------------------------

export interface FetchIssueStateArgs {
  readonly issueNumber: number;
  readonly repo: string;
  readonly runGh: RunGh;
}

export interface FetchedIssueState {
  readonly number: number;
  readonly title: string;
  readonly state: 'OPEN' | 'CLOSED' | 'UNKNOWN';
  readonly url: string;
}

export function fetchIssueState(args: FetchIssueStateArgs): FetchedIssueState {
  const ghArgs: readonly string[] = [
    'issue',
    'view',
    String(args.issueNumber),
    '--repo',
    args.repo,
    '--json',
    'number,title,state,url',
  ];
  let raw: string;
  try {
    raw = args.runGh(ghArgs);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/HTTP 404/i.test(message) || /not found/i.test(message)) {
      return {
        number: args.issueNumber,
        title: '',
        state: 'UNKNOWN',
        url: '',
      };
    }
    throw err;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { number: args.issueNumber, title: '', state: 'UNKNOWN', url: '' };
  }
  if (!isPlainObject(parsed)) {
    return { number: args.issueNumber, title: '', state: 'UNKNOWN', url: '' };
  }
  const v = parsed as RawIssueRef;
  return {
    number: typeof v.number === 'number' ? v.number : args.issueNumber,
    title: typeof v.title === 'string' ? v.title : '',
    state: typeof v.state === 'string' ? normalizeState(v.state) : 'UNKNOWN',
    url: typeof v.url === 'string' ? v.url : '',
  };
}

export interface WalkArgs {
  readonly slug: string;
  readonly parentIssue: number;
  readonly workplanPath: string;
  readonly repo: string;
  readonly runGh: RunGh;
}

export interface WalkedCandidate {
  readonly number: number;
  readonly title: string;
  readonly state: 'OPEN' | 'CLOSED' | 'UNKNOWN';
  readonly url: string;
  readonly child_issues: readonly ChildIssueRef[];
  readonly classification: ClassificationKind;
}

// Convert a RawIssueForSearch payload (carried by title-search or timeline
// sources) into the FetchedIssueState shape the walker consumes. The title-
// search response already provides every field the walker needs to classify
// the candidate; round-tripping via `gh issue view` would only re-fetch
// what we already have.
function rawToFetched(raw: RawIssueForSearch): FetchedIssueState {
  return {
    number: raw.number,
    title: raw.title,
    state: normalizeState(raw.state),
    url: raw.url,
  };
}

// Walks the three sources, builds a candidate-parent set, then for each
// candidate uses the title/state already carried by the originating source
// when available; only falls back to `gh issue view` for candidates whose
// source provided number-only data (the workplan-anchored source). Returns
// the full classified set; the propose layer filters out `skip-*` rows
// before emitting the proposal file.
export function walk(args: WalkArgs): readonly WalkedCandidate[] {
  // (a) title-search.
  const searchHits = titleSearch({
    slug: args.slug,
    repo: args.repo,
    runGh: args.runGh,
  });
  // (b) parent timeline.
  const timelineHits = parentTimeline({
    parentIssue: args.parentIssue,
    repo: args.repo,
    runGh: args.runGh,
  });
  // (c) workplan-anchored.
  const workplanChildNumbers = new Set(
    workplanAnchored({ workplanPath: args.workplanPath }),
  );

  // The parent-candidate set: the explicit parentIssue plus every
  // title-search hit. Timeline hits are recorded as POTENTIAL CHILDREN,
  // not as additional parent candidates -- a cross-reference from issue
  // #X to the parent does not make #X a parent.
  //
  // Each candidate's value holds the title-search payload (when the source
  // carried it). The explicit parentIssue is seeded as null because the
  // operator-supplied frontmatter only gives us a number.
  const parentCandidates = new Map<number, RawIssueForSearch | null>();
  parentCandidates.set(args.parentIssue, null);
  for (const hit of searchHits) {
    // Prefer the populated title-search payload over a null seed. When the
    // explicit parentIssue ALSO appears in title-search (the common case
    // for the feature's own parent), this upgrades the null seed to the
    // populated payload so the walker can skip the `gh issue view` round
    // trip for the parent too.
    const existing = parentCandidates.get(hit.number);
    if (existing === undefined || existing === null) {
      parentCandidates.set(hit.number, hit);
    }
  }

  // The expected child set per parent candidate is the union of:
  //   - workplan-anchored phase issue numbers
  //   - timeline cross-references (carry title/state in the payload)
  //   - title-search hits OTHER than the parent itself (carry title/state)
  // We collapse all three into one map per pass; map values hold the
  // already-known title/state payload when the originating source provided
  // it, so child enumeration can skip the `gh issue view` round trip for
  // those rows.
  const expectedChildren = new Map<number, RawIssueForSearch | null>();
  for (const n of workplanChildNumbers) {
    if (!expectedChildren.has(n)) expectedChildren.set(n, null);
  }
  for (const hit of timelineHits) {
    // Prefer a populated payload over the workplan-anchored null seed.
    const existing = expectedChildren.get(hit.number);
    if (existing === undefined || existing === null) {
      expectedChildren.set(hit.number, hit);
    }
  }
  for (const hit of searchHits) {
    // Title-search hits also carry title/state -- prefer over workplan null.
    const existing = expectedChildren.get(hit.number);
    if (existing === undefined || existing === null) {
      expectedChildren.set(hit.number, hit);
    }
  }

  // Memoize per-child-number view fetches across parent candidates. The
  // same workplan-anchored child appears in every parent's child set; without
  // memoization N parent candidates × M shared children = N×M view calls,
  // which dwarfs the savings from reusing title-search payloads. Memoization
  // collapses repeated fetches of the same number to a single call.
  const fetchedChildCache = new Map<number, FetchedIssueState>();
  const resolveChild = (
    n: number,
    payload: RawIssueForSearch | null,
  ): FetchedIssueState => {
    if (payload !== null) return rawToFetched(payload);
    const cached = fetchedChildCache.get(n);
    if (cached !== undefined) return cached;
    const fresh = fetchIssueState({
      issueNumber: n,
      repo: args.repo,
      runGh: args.runGh,
    });
    fetchedChildCache.set(n, fresh);
    return fresh;
  };

  const results: WalkedCandidate[] = [];
  for (const [parentNumber, parentRaw] of parentCandidates) {
    // Don't enumerate the parent as its own child.
    const childEntries: [number, RawIssueForSearch | null][] = [];
    for (const [n, payload] of expectedChildren) {
      if (n !== parentNumber) childEntries.push([n, payload]);
    }

    // Resolve the parent's current state. Reuse the title-search payload
    // when present; only round-trip via `gh issue view` when the candidate
    // was seeded number-only (the explicit parentIssue case).
    const parentState =
      parentRaw !== null
        ? rawToFetched(parentRaw)
        : fetchIssueState({
            issueNumber: parentNumber,
            repo: args.repo,
            runGh: args.runGh,
          });

    // Decide whether this candidate belongs to the feature. Two signals:
    //   - It IS the explicit parentIssue (always matches).
    //   - Its title contains the slug (case-insensitive substring) OR at
    //     least one workplan-anchored phase issue cross-references it via
    //     a child relationship. The slug-match is sufficient for the
    //     title-search hits; the parentIssue is exempt because we trust
    //     the operator-supplied frontmatter.
    let matchesFeature: boolean;
    if (parentNumber === args.parentIssue) {
      matchesFeature = true;
    } else {
      const title = parentState.title;
      matchesFeature = title.toLowerCase().includes(args.slug.toLowerCase());
    }

    // Resolve each child's state. Reuse the carried payload when present;
    // fall back to `gh issue view` only for workplan-only children whose
    // source provided just a number, and memoize that fallback across
    // parent candidates so the same child isn't re-fetched per parent.
    const childRefs: ChildIssueRef[] = [];
    for (const [childNumber, childRaw] of childEntries) {
      const childState = resolveChild(childNumber, childRaw);
      // Filter out children whose title doesn't reference the feature
      // unless they came from the workplan-anchored source (which is
      // authoritative). This keeps unrelated cross-references from
      // polluting the child set.
      const fromWorkplan = workplanChildNumbers.has(childNumber);
      const titleMatches = childState.title
        .toLowerCase()
        .includes(args.slug.toLowerCase());
      if (!fromWorkplan && !titleMatches && childState.title !== '') continue;
      childRefs.push({
        number: childState.number,
        state: childState.state,
        title: childState.title === '' ? null : childState.title,
      });
    }
    childRefs.sort((a, b) => a.number - b.number);

    const classification = classify({
      parentState: parentState.state,
      childStates: childRefs.map((c) => c.state),
      matchesFeature,
    });

    results.push({
      number: parentState.number,
      title: parentState.title,
      state: parentState.state,
      url: parentState.url,
      child_issues: childRefs,
      classification,
    });
  }
  results.sort((a, b) => a.number - b.number);
  return results;
}
