// T018 (008) — the one-time, idempotent GitHub-issue → backlog import (US3).
// READS `gh issue list --json …` (read-only — GitHub is never mutated, FR-010)
// and creates one `imported-issue` item per open issue, backlinked by a `gh-<n>`
// ref, carrying the issue's labels + body. Idempotent: an issue whose `gh-<n>`
// ref already exists is skipped (FR-012). Implemented in tsx with spawnSync's
// argv array (NOT a shell pipeline), so `#` and markdown control chars in issue
// bodies are passed verbatim and never trip the permission gate (FR-015).

import { spawnSync } from 'node:child_process';
import { BacklogError, type BacklogBackend } from './backend.js';
import { typeLabel } from './mappings.js';

/** The subset of a GitHub issue the import reads (gh issue list --json …). */
export interface GithubIssue {
  readonly number: number;
  readonly title: string;
  readonly body: string;
  readonly labels: readonly { readonly name: string }[];
  readonly url: string;
}

export interface ImportGithubResult {
  readonly applied: boolean;
  /** Task ids created (apply only). */
  readonly created: readonly string[];
  /** Issue numbers that would be / were imported (not already present). */
  readonly planned: readonly number[];
  /** Issue numbers skipped because their `gh-<n>` ref already exists. */
  readonly skipped: readonly number[];
}

const IMPORTED_TYPE = 'imported-issue';

/** The idempotency key / backlink for an imported issue. */
export function refForIssue(issueNumber: number): string {
  return `gh-${issueNumber}`;
}

/**
 * Import open issues into the backlog. Pure orchestration over an injected
 * issue set + the backend adapter — no network here (the verb supplies the
 * reader), so this is unit-testable against the real binary with fixture issues.
 */
export function importGithub(args: {
  backend: BacklogBackend;
  issues: readonly GithubIssue[];
  apply: boolean;
}): ImportGithubResult {
  const created: string[] = [];
  const planned: number[] = [];
  const skipped: number[] = [];
  for (const issue of args.issues) {
    const ref = refForIssue(issue.number);
    if (args.backend.exists(ref)) {
      skipped.push(issue.number);
      continue;
    }
    planned.push(issue.number);
    if (args.apply) {
      const labels = [typeLabel(IMPORTED_TYPE), ...issue.labels.map((l) => l.name)];
      const id = args.backend.create({
        title: issue.title,
        labels,
        refs: [ref],
        body: issue.body.length > 0 ? issue.body : undefined,
      });
      created.push(id);
    }
  }
  return { applied: args.apply, created, planned, skipped };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Parse + validate the `gh issue list --json …` payload (defensively typed). */
export function parseIssues(json: string): GithubIssue[] {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new BacklogError(`could not parse GitHub issue JSON: ${msg}`);
  }
  if (!Array.isArray(data)) {
    throw new BacklogError('GitHub issue JSON is not an array');
  }
  return data.map((raw, i) => {
    if (!isRecord(raw) || typeof raw.number !== 'number' || typeof raw.title !== 'string') {
      throw new BacklogError(`GitHub issue at index ${i} is missing a numeric number / string title`);
    }
    const labels = Array.isArray(raw.labels)
      ? raw.labels.flatMap((l) => (isRecord(l) && typeof l.name === 'string' ? [{ name: l.name }] : []))
      : [];
    return {
      number: raw.number,
      title: raw.title,
      body: typeof raw.body === 'string' ? raw.body : '',
      labels,
      url: typeof raw.url === 'string' ? raw.url : '',
    };
  });
}

/**
 * Read open issues via the GitHub CLI (read-only). Fail-loud (Principle V):
 * a missing/unauthenticated `gh` or a non-zero exit throws a descriptive
 * BacklogError — never a partial or empty-success import.
 */
export function readGhIssues(ghBin = 'gh'): GithubIssue[] {
  const res = spawnSync(
    ghBin,
    ['issue', 'list', '--state', 'open', '--json', 'number,title,body,labels,url', '--limit', '1000'],
    { encoding: 'utf8' },
  );
  if (res.error !== undefined) {
    const code = (isRecord(res.error) && res.error.code) || '';
    if (code === 'ENOENT') {
      throw new BacklogError(
        `GitHub CLI 'gh' not found (${ghBin}) — install it and run \`gh auth login\` before importing`,
      );
    }
    throw new BacklogError(`failed to run gh: ${res.error.message}`);
  }
  if (res.status !== 0) {
    throw new BacklogError(
      `gh issue list failed (exit ${res.status}) — is gh authenticated? \`gh auth status\`:\n${(res.stderr ?? '').trim()}`,
    );
  }
  return parseIssues(res.stdout ?? '');
}
