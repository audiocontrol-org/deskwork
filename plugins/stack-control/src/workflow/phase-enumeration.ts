// Phase enumeration for the un-skippable workflow protocol (025 US-shared / T004).
//
// Derives the phase set + each phase's authoritative file list from a tasks.md's
// `## Phase <id>` headers, and FAILS LOUD (FR-004, Principle V) rather than
// scoping a partial or empty payload:
//   - zero derivable phases → FATAL (a feature is NOT trivially gate-met);
//   - a phase with no authoritative file list → FATAL naming the phase.
//
// This is the shared substrate the US1 graduate gate (all-phase-checkpoints-current)
// and the US2 execute cadence both read — both need the SAME phase set + file lists,
// and both must refuse an empty phase rather than let it masquerade as governed
// (the AUDIT-class "empty phase approved" failure).
//
// Hard dependency: TASK-70 (per-phase govern scoping is unsound without authoritative
// file lists). When tasks.md does not name a phase's files, this fails loud rather
// than guessing — the gate's soundness rests on TASK-70 supplying those lists.

import { parsePhases } from '../govern/incremental-audit.js';
import { WorkflowError } from './workflow-types.js';

/** One enumerated tasks.md phase: its id and the repo-relative files it governs. */
export interface EnumeratedPhase {
  readonly phaseId: string;
  readonly files: readonly string[];
}

/**
 * Enumerate the phases of a tasks.md, each with its authoritative file list.
 * Throws `WorkflowError` (FATAL) on zero phases or a phase with no file list —
 * the gate / cadence callers surface the message; they never proceed on a
 * partial/empty payload (FR-004).
 */
export function enumeratePhases(tasksText: string): EnumeratedPhase[] {
  const parsed = parsePhases(tasksText);
  if (parsed.length === 0) {
    throw new WorkflowError(
      'tasks.md has no derivable phase headers (`## Phase <id> …`); ' +
        'the per-phase gate cannot treat a feature with no phases as trivially met',
    );
  }
  for (const phase of parsed) {
    if (phase.files.length === 0) {
      throw new WorkflowError(
        `tasks.md phase '${phase.phaseId}' has no authoritative file list; ` +
          'the per-phase gate refuses to scope a partial or empty payload ' +
          "(add the phase's governed files to tasks.md — TASK-70)",
      );
    }
  }
  return parsed.map((p) => ({ phaseId: p.phaseId, files: p.files }));
}
