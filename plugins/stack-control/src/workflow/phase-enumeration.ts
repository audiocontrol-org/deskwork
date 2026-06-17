// Phase enumeration for the un-skippable workflow protocol (025 US-shared / T004).
//
// Derives the phase set + each phase's authoritative file list from a tasks.md's
// `## Phase <id>` headers, and FAILS LOUD (FR-004, Principle V) rather than
// scoping a partial or empty payload:
//   - zero derivable phases → FATAL (a feature is NOT trivially gate-met);
//   - a phase with no authoritative file list → FATAL naming the phase.
//
// This is the single shared enumeration substrate. The US2 execute cadence calls it with
// the default (zero phases → FATAL, since an agent actively governing must not proceed on
// a non-phased tasks.md). The US1 graduate gate reaches it through
// `resolvePhaseCheckpointStatuses` with `allowZeroPhases: true` — zero phases is a NAMED
// unmet verdict there, not a crash, because the read-only compass evaluates that gate
// (AUDIT codex-01/claude-01). The empty-file-list FATAL (a phase that masquerades as
// governed) is policed HERE for BOTH callers — one guard, no clone (AUDIT claude-03).
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

export interface EnumeratePhasesOptions {
  /**
   * When true, zero derivable phases returns `[]` instead of throwing — for the read-only
   * gate path, which reports zero phases as a named unmet verdict (the compass must not
   * crash). Default false: the execute/govern path fails loud on a non-phased tasks.md.
   */
  readonly allowZeroPhases?: boolean;
}

/**
 * Enumerate the phases of a tasks.md, each with its authoritative file list. Throws
 * `WorkflowError` (FATAL) when a phase EXISTS but has no file list (the masquerade danger,
 * FR-004) — always, for every caller. Zero phases throws by default, or returns `[]` when
 * `allowZeroPhases` is set (the gate path). Callers never proceed on a partial payload.
 */
export function enumeratePhases(
  tasksText: string,
  options: EnumeratePhasesOptions = {},
): EnumeratedPhase[] {
  const parsed = parsePhases(tasksText);
  if (parsed.length === 0) {
    if (options.allowZeroPhases === true) return [];
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
