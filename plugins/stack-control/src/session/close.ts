// 011 T020 — session-end close steps that are neither the journal nor the commit:
// (1) append surfaced tooling friction to the resolved tooling_feedback path
// (append-only; skip cleanly when none surfaced — FR-007); (2) run the advisory
// clone-snapshot over the resolved clone_scope, skip-with-note when the scope is
// unconfigured or the snapshot tool is absent (FR-008; never blocks). Per
// research D7 the per-codebase vendored detector arrives with
// migrate-scope-discovery; until its default-scoping lands, this consumes the
// interim repo-local snapshot script when present, else skips with a note.

import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import type { ResolvedPaths } from '../config/types.js';

export type CloneSnapshotResult =
  | { readonly ran: true; readonly newDuplication: number }
  | { readonly ran: false; readonly skipped: string };

export interface CloseResult {
  readonly toolingFrictionCaptured: boolean;
  readonly cloneSnapshot: CloneSnapshotResult;
}

export interface CloseInput {
  readonly resolved: ResolvedPaths;
  readonly repoRoot: string;
  /** Tooling-friction notes the agent surfaced this session (FR-007). */
  readonly friction: readonly string[];
  readonly date: string;
}

export function runClose(input: CloseInput): CloseResult {
  return {
    toolingFrictionCaptured: captureFriction(input),
    cloneSnapshot: runCloneSnapshot(input),
  };
}

/** Append surfaced friction (append-only) to the resolved tooling_feedback path.
 * No friction → false (skip cleanly), the file untouched. */
function captureFriction(input: CloseInput): boolean {
  if (input.friction.length === 0) return false;
  const path = input.resolved.toolingFeedback;
  const header = existsSync(path) ? '' : '# Tooling Feedback\n\n';
  const block =
    `\n## session-end ${input.date}\n` +
    input.friction.map((f) => `- ${f.trim()}`).join('\n') +
    '\n';
  if (header.length > 0) writeFileSync(path, header);
  appendFileSync(path, block);
  return true;
}

/** Advisory per-codebase clone snapshot over the resolved clone_scope. Consumes
 * the interim repo-local script when present; otherwise skips with a note. Never
 * throws — a snapshot failure degrades to a skip note (advisory; FR-008). */
function runCloneSnapshot(input: CloseInput): CloneSnapshotResult {
  const scope = input.resolved.cloneScope;
  if (!existsSync(scope)) {
    return { ran: false, skipped: `clone_scope ${scope} does not exist` };
  }
  const script = join(input.repoRoot, '.dw-lifecycle', 'scope-discovery', 'clone-snapshot.sh');
  if (!existsSync(script)) {
    return {
      ran: false,
      skipped:
        'no clone-snapshot tool available (the per-codebase detector arrives with migrate-scope-discovery)',
    };
  }
  try {
    const out = execFileSync('bash', [script, scope], {
      cwd: input.repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { ran: true, newDuplication: countGroups(out) };
  } catch {
    return { ran: false, skipped: 'clone-snapshot tool failed (advisory; not blocking)' };
  }
}

/** Count reported clone groups in the snapshot output (advisory metric). */
function countGroups(out: string): number {
  return out.split('\n').filter((l) => l.includes('<=>')).length;
}

/** Read a configured journal template, or null when none exists (FR-013). */
export function readJournalTemplate(repoRoot: string): string | null {
  const path = join(repoRoot, '.stack-control', 'journal-template.md');
  return existsSync(path) ? readFileSync(path, 'utf8') : null;
}
