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

/**
 * Extract the governed filesystem paths named in backtick spans of a tasks.md
 * phase body. A span is a path only when it contains `/`. 024 FR-012 / TASK-83: a
 * `/<plugin>:<verb>` skill-reference span (e.g. `/stack-control:define`) is NOT an
 * installation-relative path and crashed the governed-path validator — classify it
 * out here. But a precise filter is required (AUDIT-BARRAGE claude-01): a legitimate
 * `file:line[:col]` span (`src/govern/protocol.ts:141`) IS a real governed path — so
 * strip a trailing line/col suffix FIRST, then exclude any token still bearing a `:`
 * (a `<plugin>:<verb>` namespace, a URL scheme). A blunt `includes(':')` would
 * silently DROP real file:line paths — trading the loud crash for a silent
 * under-scope, which is worse.
 */
export function extractScopedPaths(body: string): readonly string[] {
  const matches: string[] = [];
  for (const match of body.matchAll(BACKTICK_TOKEN_RE)) {
    const raw = match[1]?.trim();
    if (raw === undefined || !raw.includes('/')) continue;
    // A LEADING-slash token is a slash-command (`/release`, `/code-review`) or an absolute
    // path — never an installation-relative governed scope path. Excluding it prevents the
    // "escapes the installation root" FATAL the validator (correctly) raises on absolutes
    // (round-4 finding; same FR-012/TASK-83 class as the `:`-bearing case below).
    if (raw.startsWith('/')) continue;
    // Strip a trailing `:<line>[:<col>]` suffix from a file:line span.
    const token = raw.replace(/:(\d+)(:\d+)?$/, '');
    // A remaining `:` marks a namespace/skill reference or URL — never a path.
    if (token.includes(':')) continue;
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

export interface ResolvePrePhaseDiffBaseArgs {
  /** The phase whose diff-base is being resolved. */
  readonly phaseId: string;
  /** Every phase id in tasks.md order (parsePhases order). */
  readonly orderedPhaseIds: readonly string[];
  /** governedSha by phase id (undefined for a phase with no recorded sha). */
  readonly governedShaByPhase: ReadonlyMap<string, string | undefined>;
  /** Used when no prior phase recorded a sha (phase 1 / pre-US5 checkpoints). */
  readonly fallbackBase: string;
}

/**
 * FR-020: resolve a phase's diff-base to the PRE-PHASE commit so the per-phase
 * payload audits the UNION of the phase's changed files across ALL its commits —
 * not just the `HEAD~1` delta (the under-scope that produced the TASK-263 "the
 * diff omits the fix" false HIGH when a phase's impl and test landed in separate
 * commits).
 *
 * The pre-phase commit is the governed HEAD of the LATEST prior phase (in tasks.md
 * order) that recorded one: each phase boundary commits + governs before the next
 * phase's work starts, so that prior phase's `governedSha` is exactly the tree
 * state at which THIS phase's work began. A prior phase with no recorded sha (a
 * pre-US5 legacy checkpoint, or one never governed) is skipped; when none qualifies
 * (phase 1, or every prior checkpoint is legacy) it falls back to `fallbackBase`
 * (the explicit `--diff-base`/`GOVERN_DIFF_BASE`/`HEAD~1`).
 */
export function resolvePrePhaseDiffBase(args: ResolvePrePhaseDiffBaseArgs): string {
  const idx = args.orderedPhaseIds.indexOf(args.phaseId);
  if (idx > 0) {
    for (let i = idx - 1; i >= 0; i -= 1) {
      const sha = args.governedShaByPhase.get(args.orderedPhaseIds[i]!);
      if (sha !== undefined && sha.length > 0) return sha;
    }
  }
  return args.fallbackBase;
}

// NOTE: the whole-feature `after_implement` unit is composed EXCLUSION-side by the
// govern command itself (specs/021 US1 true-composition): it carries converged +
// unchanged phases by adding their files to the payload `excludePaths`, so the
// audited scope is "the diff minus carried files" (re-audited phases + cross-cutting
// code). The earlier inclusion-based `resolveComposingFeatureUnit` primitive was
// removed (021 phase-2 audit AUDIT-BARRAGE-codex-01) — it returned an inclusion file
// list the command discarded, and inclusion silently dropped cross-cutting code.

/** One phase's composition input: its files and whether its checkpoint is current. */
export interface PhaseCompositionStatus {
  readonly files: readonly string[];
  readonly current: boolean;
}

/**
 * The files to CARRY (exclude from the whole-feature re-audit): those owned
 * EXCLUSIVELY by current phases. A file named by BOTH a current phase and a
 * missing/stale phase must NOT be carried — carrying it would hide the
 * non-current phase's still-unaudited work on that shared file, producing a
 * false-clean whole-feature gate (021 phase-7 audit AUDIT-BARRAGE-codex-01).
 * Phase file ownership is NOT disjoint in practice (e.g. `govern.ts` belongs to
 * several phases), so the exclusivity check is load-bearing, not defensive.
 */
export function carriedExclusivelyCurrentFiles(
  phases: readonly PhaseCompositionStatus[],
): readonly string[] {
  const nonCurrent = phases.filter((p) => !p.current).flatMap((p) => p.files);
  const carried = new Set<string>();
  for (const phase of phases) {
    if (!phase.current) continue;
    for (const file of phase.files) {
      // Shared ownership is PREFIX overlap in either direction, not just an exact
      // string match (021 after_implement audit AUDIT-BARRAGE-codex-01): a current
      // phase owning a directory `src/` must NOT carry it when a stale phase owns
      // `src/foo.ts` under it (the carried `:(exclude)src/` pathspec would hide the
      // stale file), and vice-versa.
      if (!nonCurrent.some((other) => pathsOverlap(file, other))) carried.add(file);
    }
  }
  return Array.from(carried);
}

/** One phase's composition input as seen from its durable checkpoint. */
export interface PhaseCompositionInput {
  readonly state: 'current' | 'missing' | 'stale';
  /** The tasks.md-declared scope (may name DIRECTORIES). */
  readonly declaredFiles: readonly string[];
  /**
   * The files the phase's audit ACTUALLY covered — recorded at checkpoint time as
   * `git diff --name-only <phaseBase> -- <declaredScope>`. Absent on checkpoints
   * written before TASK-129 (then the phase is conservatively re-audited).
   */
  readonly auditedFiles?: readonly string[];
}

/**
 * The files to CARRY (exclude from the whole-feature re-audit), composed from
 * durable checkpoints. TASK-129: a `current` phase contributes its ACTUAL audited
 * files — NEVER its declared directory scope. So a cross-cutting file living under
 * a current phase's declared directory but owned by no phase's audit is not in any
 * `auditedFiles` set, is therefore not carried, and is re-audited. A current phase
 * with no recorded `auditedFiles` (pre-TASK-129 checkpoint) carries nothing — the
 * safe direction, self-healing on the next govern run. Non-current phases still
 * contribute their DECLARED scope as a re-audit claim so a carried file overlapping
 * a stale/missing phase is dropped (the 021 phase-7 shared-ownership protection).
 */
export function carriedFilesForComposition(
  phases: readonly PhaseCompositionInput[],
): readonly string[] {
  return carriedExclusivelyCurrentFiles(
    phases.map((phase) =>
      phase.state === 'current'
        ? { current: true, files: phase.auditedFiles ?? [] }
        : { current: false, files: phase.declaredFiles },
    ),
  );
}

/** Two repo-relative paths overlap iff equal or one is a directory ancestor of
 * the other (POSIX `/` separators; trailing slashes normalized away). */
function pathsOverlap(a: string, b: string): boolean {
  const x = a.replace(/\/+$/, '');
  const y = b.replace(/\/+$/, '');
  return x === y || x.startsWith(`${y}/`) || y.startsWith(`${x}/`);
}
