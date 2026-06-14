/**
 * plugins/stack-control/src/govern/incremental-audit.ts
 *
 * specs/015-audit-protocol-convergence — Phase 6 / US4 (T024).
 *
 * Per-phase incremental audit-unit resolution (FR-007/008 / D6). The audit unit
 * shrinks from the whole-feature diff to a completed tasks.md phase — a bounded
 * payload that attacks the plateau (fewer findings/round), the fix-debt
 * compounding, and the model-latency wall at once. The whole-feature
 * `after_implement` pass COMPOSES from already-converged phases: it re-audits only
 * changed + cross-cutting code, carrying phases whose code is unchanged since
 * their unit-audit converged. contracts/incremental-audit.md is the authority.
 *
 * A `phase` unit flows the SAME convergence protocol / loop as a `feature` unit
 * (FR-007) — the boundary changes the payload, not the protocol.
 */

import { readFileSync } from 'node:fs';
import type { AuditUnit } from './audit-unit-types.js';

/**
 * `## Phase <id>[<sep> <title>]` header grammar (US4 / TASK-71). The id is the
 * digit-led token after `Phase`; the optional title may follow a colon, dash,
 * en-dash, or em-dash separator — or nothing at all. A colon appearing inside the
 * TITLE never splits the id (the id stops at the first non-`[0-9A-Za-z.]` char),
 * and a digit-led id keeps a prose `## Phase notes` line from being selectable.
 */
const PHASE_HEADER_RE = /^##\s+Phase\s+([0-9][0-9A-Za-z.]*)\b.*$/;
const TOP_HEADER_RE = /^##\s+/;
/** Backticked path-like tokens from tasks prose; directories carry a slash. */
const BACKTICK_TOKEN_RE = /`([^`\n]+)`/g;

interface ParsedPhase {
  readonly phaseId: string;
  readonly files: readonly string[];
}

/**
 * Parse a tasks.md into its phases, each with the repo-relative file paths its
 * task lines name. The phase id is the token between `Phase` and `:` (e.g. `1`,
 * `2`), trimmed — so a caller selects a phase by its number.
 */
export function parsePhases(tasksText: string): ParsedPhase[] {
  const lines = tasksText.split(/\r?\n/);
  const phases: { phaseId: string; start: number }[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const m = PHASE_HEADER_RE.exec(lines[i] ?? '');
    if (m !== null) phases.push({ phaseId: m[1]!.trim(), start: i });
  }
  return phases.map((p, idx) => {
    const end =
      idx + 1 < phases.length
        ? phases[idx + 1]!.start
        : nextTopHeaderOrEnd(lines, p.start + 1);
    const body = lines.slice(p.start + 1, end).join('\n');
    const files = Array.from(new Set(extractScopedPaths(body)));
    return { phaseId: p.phaseId, files };
  });
}

function extractScopedPaths(body: string): readonly string[] {
  const matches: string[] = [];
  for (const match of body.matchAll(BACKTICK_TOKEN_RE)) {
    const token = match[1]?.trim();
    if (token === undefined || !token.includes('/')) continue;
    matches.push(token.replace(/\/+$/, ''));
  }
  return matches;
}

function nextTopHeaderOrEnd(lines: readonly string[], from: number): number {
  for (let i = from; i < lines.length; i += 1) {
    if (TOP_HEADER_RE.test(lines[i] ?? '')) return i;
  }
  return lines.length;
}

export interface ResolvePhaseUnitArgs {
  readonly tasksPath: string;
  /** A `## Phase N …` header id (the digit-led token after `Phase`, any separator). */
  readonly phaseId: string;
  /** The ref the phase's work started from. */
  readonly diffBase: string;
}

/**
 * Resolve one tasks.md phase to a diff-scoped `AuditUnit` (FR-007). The
 * `diffScope.files` contains ONLY that phase's files (not the whole feature —
 * SC-006); findings are recorded under the per-phase checkpoint section of the
 * one per-feature audit-log (FR-008 same store).
 */
export function resolvePhaseUnit(args: ResolvePhaseUnitArgs): AuditUnit {
  const phases = parsePhases(readFileSync(args.tasksPath, 'utf8'));
  const phase = phases.find((p) => p.phaseId === args.phaseId);
  if (phase === undefined) {
    throw new Error(
      `resolvePhaseUnit: phase '${args.phaseId}' not found in ${args.tasksPath} ` +
        `(available: ${phases.map((p) => p.phaseId).join(', ') || 'none'}).`,
    );
  }
  return {
    granularity: 'phase',
    phaseId: args.phaseId,
    diffScope: { base: args.diffBase, files: phase.files },
    auditLogSection: `phase-${args.phaseId}`,
  };
}

/** One phase's convergence/change status, supplied by the composing caller. */
export interface PhaseStatus {
  readonly phaseId: string;
  /** Did this phase's unit-audit already reach `converged`? */
  readonly converged: boolean;
  /** Has the phase's code changed since that convergence? */
  readonly changed: boolean;
}

export interface ResolveComposingFeatureUnitArgs {
  readonly tasksPath: string;
  readonly diffBase: string;
  /** Per-phase convergence/change status (FR-008 composition inputs). */
  readonly phases: readonly PhaseStatus[];
}

/**
 * Resolve the whole-feature `after_implement` unit by COMPOSITION (FR-008): its
 * `diffScope` EXCLUDES any phase whose code is unchanged since that phase's
 * unit-audit converged (carried), and INCLUDES changed phases (and any phase
 * with no recorded convergence — cross-cutting / never-audited code). The
 * composing pass is the final safety net, not a from-scratch re-audit.
 */
export function resolveComposingFeatureUnit(
  args: ResolveComposingFeatureUnitArgs,
): AuditUnit {
  const parsed = parsePhases(readFileSync(args.tasksPath, 'utf8'));
  const statusOf = new Map(args.phases.map((s) => [s.phaseId, s]));
  const files: string[] = [];
  for (const phase of parsed) {
    const status = statusOf.get(phase.phaseId);
    // Carry a phase ONLY when it converged AND is unchanged since; otherwise its
    // code is changed or never-converged (cross-cutting) → re-audit it.
    const carried = status !== undefined && status.converged && !status.changed;
    if (!carried) files.push(...phase.files);
  }
  return {
    granularity: 'feature',
    diffScope: { base: args.diffBase, files: Array.from(new Set(files)) },
    auditLogSection: 'after_implement',
  };
}
