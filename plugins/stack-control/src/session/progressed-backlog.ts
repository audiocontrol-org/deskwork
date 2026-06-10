// 011 T019 — "progressed this session" = backlog items REFERENCED in the
// session's commits (research D6). Mechanical + re-derivable, mirroring
// dw-lifecycle's issues-touched-from-#NNN retargeted to backlog IDs. Surfaces the
// items as evidence with their CURRENT status verbatim: 0 status transitions, NO
// GitHub-issue query (FR-009 / SC-006). The backlog backend exposes no
// changed-since API, so commit references are the signal (plan § Scope-coordination).

import { commitsSince } from './git.js';

export interface BacklogItemRef {
  readonly id: string;
  readonly title: string;
  readonly status: string;
}

export interface ProgressedInput {
  readonly cwd: string;
  readonly boundary: string;
  readonly items: readonly BacklogItemRef[];
}

/** Escape a backlog id for a literal regex match. */
function escape(id: string): string {
  return id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** True iff `id` appears as a standalone token in the commit text (so TASK-1
 * does not match TASK-10, and XTASK-1 does not match TASK-1). */
function referenced(text: string, id: string): boolean {
  return new RegExp(`(?<![A-Za-z0-9-])${escape(id)}(?![0-9])`).test(text);
}

export function progressedBacklog(input: ProgressedInput): readonly BacklogItemRef[] {
  const commits = commitsSince(input.cwd, input.boundary);
  const text = commits.map((c) => `${c.subject}\n${c.body}`).join('\n');
  if (text.trim().length === 0) return [];
  return input.items.filter((item) => referenced(text, item.id));
}
