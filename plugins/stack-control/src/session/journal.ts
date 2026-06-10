// 011 T018 — assemble a journal entry for session-end. Auto-derives the
// mechanical / quantitative sections from `git log <boundary>..HEAD` (commit
// count + subjects, files-changed, backlog items touched) and emits EMPTY
// narrative slots for the agent to compose (FR-006, research D5). The numbers are
// re-derived from source, never fabricated (the project's quantitative-reporting
// rule). The entry shape follows a configured template when provided, else the
// documented default (FR-013) — never a baked-in deskwork taxonomy beyond the
// default.

import { commitsSince, filesChangedSince } from './git.js';

export interface JournalInput {
  readonly cwd: string;
  readonly boundary: string;
  /** Backlog items referenced in the session commits (progressed-backlog.ts). */
  readonly backlogTouched: readonly { readonly id: string; readonly title: string }[];
  /** Entry date (default: today, ISO yyyy-mm-dd). */
  readonly date?: string;
  /** A configured template (placeholder substitution) — else the default. */
  readonly template?: string;
}

/** The default entry shape. Narrative slots are left for the agent to compose;
 * the Quantitative block is auto-derived and flagged for verification. */
const DEFAULT_TEMPLATE = `## {date}: <!-- session title -->

**Goal:** <!-- compose: what we set out to do -->

**Accomplished:**
- <!-- compose -->

**Didn't Work:**
- <!-- compose -->

**Course Corrections:**
- <!-- compose -->

**Insights:**
- <!-- compose -->

**Quantitative (auto-derived from git; verify before publishing):**
- Commits: {commit_count}
{commit_subjects}
- Files changed: {files_changed}
- Backlog touched: {backlog_touched}
`;

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function buildJournalEntry(input: JournalInput): string {
  const date = input.date ?? todayIso();
  const commits = commitsSince(input.cwd, input.boundary);
  const filesChanged = filesChangedSince(input.cwd, input.boundary);

  const subjectsBlock =
    commits.length === 0
      ? '  - (no commits this session)'
      : commits.map((c) => `  - ${c.subject}`).join('\n');
  const backlogBlock =
    input.backlogTouched.length === 0
      ? '(none)'
      : input.backlogTouched.map((b) => b.id).join(', ');

  const substitutions: ReadonlyMap<string, string> = new Map([
    ['date', date],
    ['commit_count', String(commits.length)],
    ['commit_subjects', subjectsBlock],
    ['files_changed', String(filesChanged)],
    ['backlog_touched', backlogBlock],
  ]);

  const template = input.template ?? DEFAULT_TEMPLATE;
  return substitute(template, substitutions);
}

/** Replace each `{key}` with its value. Unknown placeholders are left intact. */
function substitute(template: string, values: ReadonlyMap<string, string>): string {
  return template.replace(/\{([a-z_]+)\}/g, (whole, key: string) => values.get(key) ?? whole);
}
