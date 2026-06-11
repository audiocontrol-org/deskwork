/**
 * plugins/stack-control/src/scope-discovery/audit-barrage/run-artifacts.ts
 *
 * Run-directory layout helpers for the audit-barrage verb.
 *
 * A barrage run lands at:
 *
 *   <repoRoot>/.stack-control/audit-runs/
 *     <YYYYMMDDTHHMMSSsssZ>-<safe-feature-slug>/
 *       PROMPT.md            -- the rendered audit prompt (verbatim)
 *       INDEX.md             -- per-run manifest (timestamp, models,
 *                               per-model exit code / duration / bytes)
 *       <model>.md           -- captured stdout for each model
 *       stderr/
 *         <model>.txt        -- captured stderr for each model
 *
 * Timestamp resolution is millisecond — `sss` is the 3-digit
 * fractional-second component. Second-resolution timestamps would
 * collide if two barrages for the same feature kicked off within the
 * same wall-clock second; `mkdir({recursive:true})` doesn't error on
 * an existing dir, so the second run would silently overwrite the
 * first. Millisecond resolution moves that collision window into
 * "operationally impossible" territory without introducing the
 * complexity of a separate "does this dir already exist?" probe.
 *
 * Functions here own the path-derivation + directory creation + manifest
 * writes. The orchestrator composes them; tests exercise them directly
 * over tmpdir fixtures.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  computeFleetReport,
  type BarrageRun,
  type EnforcementState,
  type FleetReport,
  type LivenessState,
  type ModelRunResult,
  type TerminalState,
} from './types.js';

/**
 * Encode a Date as the basic-format UTC stamp embedded in the run-dir
 * name: `YYYYMMDDTHHMMSSsssZ` with no separators. `sss` is the 3-digit
 * millisecond component. Basic format keeps the stamp filesystem-safe
 * across every OS we target without escaping; millisecond resolution
 * removes the per-second collision risk described in the file header.
 */
export function encodeTimestamp(timestamp: Date): string {
  const iso = timestamp.toISOString(); // 2026-05-28T12:34:56.789Z
  // Strip dashes from the date, colons from the time, and the
  // decimal point in the fractional-second portion.
  // Result: 20260528T123456789Z.
  const datePart = iso.slice(0, 10).replace(/-/g, '');
  const timePart = iso.slice(11, 19).replace(/:/g, '');
  const msPart = iso.slice(20, 23); // 'sss' (3-digit ms)
  return `${datePart}T${timePart}${msPart}Z`;
}

/**
 * Compose the run-dir name from a timestamp + feature slug. The slug is
 * lightly sanitized via `safeModelName` (which also covers slug-shaped
 * inputs) to guard against operator-supplied slugs with shell-meaningful
 * characters.
 */
export function generateRunDirName(
  timestamp: Date,
  featureSlug: string,
): string {
  return `${encodeTimestamp(timestamp)}-${safeModelName(featureSlug)}`;
}

/**
 * Normalize a model (or feature) name into a safe filename stem:
 * alphanumerics and hyphens pass through; everything else collapses to
 * underscore. Prevents path-traversal characters (`/`, `..`) from
 * landing in the filename and keeps the stem grep-friendly.
 */
export function safeModelName(modelName: string): string {
  return modelName.replace(/[^a-zA-Z0-9-]/g, '_');
}

/**
 * Create `<parent>/<dirName>/` and `<parent>/<dirName>/stderr/`. The
 * stderr subdirectory is materialized eagerly so the spawn helper's
 * createWriteStream targets exist before the subprocess starts writing.
 *
 * Returns the absolute path to the run dir.
 */
export async function createRunDir(
  parentRunsDir: string,
  dirName: string,
): Promise<string> {
  const runDir = join(parentRunsDir, dirName);
  const stderrDir = join(runDir, 'stderr');
  await mkdir(stderrDir, { recursive: true });
  return runDir;
}

/**
 * Write the rendered prompt to `<runDir>/PROMPT.md` verbatim. Returns
 * the absolute path of the written file.
 */
export async function writePromptFile(
  runDir: string,
  prompt: string,
): Promise<string> {
  const promptPath = join(runDir, 'PROMPT.md');
  await writeFile(promptPath, prompt, 'utf8');
  return promptPath;
}

/**
 * Render the INDEX.md manifest body from a completed BarrageRun and
 * write it. The body lists the per-model outcomes in the same order
 * the models were configured, so triage walks have a stable layout.
 *
 * Returns the absolute path of the written file.
 */
export async function writeIndexFile(
  runDir: string,
  run: BarrageRun,
): Promise<string> {
  const indexPath = join(runDir, 'INDEX.md');
  const body = renderIndexBody(run);
  await writeFile(indexPath, body, 'utf8');
  return indexPath;
}

/**
 * Pure render of the INDEX.md body. Exported for tests so the
 * assertions can pin the manifest shape without re-reading the file.
 */
export function renderIndexBody(run: BarrageRun): string {
  // specs/014 FR-007: only completed lanes count as attempts — the
  // "models attempted" framing polluted the dampener accounting when a
  // lane failed every round (the design-control 17-run incident), so
  // the header states configured-vs-completed explicitly.
  const completed = run.results.filter((r) => r.terminalState === 'completed').length;
  const header = [
    '# Audit-barrage run',
    '',
    `- timestamp: ${run.timestamp}`,
    `- feature: ${run.featureSlug}`,
    `- run dir: ${run.runDir}`,
    `- prompt: PROMPT.md`,
    `- models configured: ${run.results.length}`,
    `- models completed: ${completed}`,
    '',
    '## Per-model results',
    '',
  ].join('\n');
  const rows = run.results.map(renderModelRow).join('\n');
  // FR-007: a run where fewer lanes produced than configured renders the
  // fleet report block so degradation is readable from the artifact alone.
  const fleet = computeFleetReport(run.results);
  const fleetBlock =
    fleet.produced < fleet.configured
      ? `\n${renderFleetReportLines(fleet).join('\n')}\n`
      : '';
  return `${header}${rows}${fleetBlock}\n`;
}

/**
 * specs/014 FR-007: the fleet report — the one vocabulary every consumer
 * (INDEX.md, fire-time stderr, lift output, govern loop status) prints for
 * configured-vs-produced degradation. The quorum line renders only when
 * cross-model agreement is structurally impossible (produced ≤ 1).
 */
export function renderFleetReportLines(fleet: FleetReport): string[] {
  const lines: string[] = ['## Fleet report', ''];
  const degraded = fleet.produced < fleet.configured;
  lines.push(
    `- configured: ${fleet.configured}, produced: ${fleet.produced}${degraded ? '  ⚠ DEGRADED' : ''}`,
  );
  for (const lane of fleet.perLane) {
    lines.push(`- ${lane.name}: ${lane.terminalState} [${lane.enforcement}, ${lane.liveness}]`);
  }
  if (fleet.quorumCollapsed) {
    lines.push('- quorum: cross-model agreement impossible (produced ≤ 1)');
  }
  return lines;
}

/**
 * One lane's state as read back from a v2 INDEX.md — the reader-side
 * vocabulary lift and the govern loop consume (FR-007). Field values
 * mirror the writer's per-model rows.
 */
export interface ParsedIndexLane {
  readonly name: string;
  readonly exitCode: number;
  readonly reportBytes: number;
  readonly terminalState: TerminalState;
  readonly enforcement: EnforcementState;
  readonly liveness: LivenessState;
}

function parseTerminalState(raw: string): TerminalState | undefined {
  switch (raw) {
    case 'completed':
    case 'timed-out':
    case 'spawn-failed':
    case 'killed-no-liveness':
      return raw;
    default:
      return undefined;
  }
}

/**
 * Thrown by `parseIndexLaneStates` for a MIXED INDEX — at least one lane
 * carries v2 rows but some lane fails to parse completely. Named so the
 * lift verb and the govern loop can wrap it in their own error discipline
 * (exit-2 stderr line / GovernProtocolError) without matching on message
 * text (AUDIT-20260611-07).
 */
export class IndexLaneParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IndexLaneParseError';
  }
}

/** Lane block under construction while scanning INDEX lines. */
interface RawIndexLane {
  readonly name: string;
  exitCode?: number;
  reportBytes?: number;
  terminalState?: TerminalState;
  enforcement?: EnforcementState;
  liveness?: LivenessState;
}

/**
 * A lane carries v2 vocabulary when ANY of the v2-specific rows parsed.
 * `exit code` predates the v2 writer, so it does not count toward
 * v2-ness (only toward completeness).
 */
function hasAnyV2Row(lane: RawIndexLane): boolean {
  return (
    lane.reportBytes !== undefined ||
    lane.terminalState !== undefined ||
    lane.enforcement !== undefined ||
    lane.liveness !== undefined
  );
}

function missingLaneFields(lane: RawIndexLane): string[] {
  const missing: string[] = [];
  if (lane.exitCode === undefined) missing.push('exit code');
  if (lane.reportBytes === undefined) missing.push('report bytes');
  if (lane.terminalState === undefined) missing.push('terminal state');
  if (lane.enforcement === undefined) missing.push('enforcement');
  if (lane.liveness === undefined) missing.push('liveness');
  return missing;
}

/**
 * Parse the per-model terminal-state rows back out of an INDEX.md body.
 * Returns `null` for a pre-014 INDEX (no v2 rows on ANY lane) — the
 * compatibility contract: readers require the new fields only for runs
 * produced by the v2 writer (no synthetic backfill, Constitution V).
 *
 * MIXED-INDEX constraint (AUDIT-20260611-07): once ANY lane carries a v2
 * row, EVERY `###` lane block must parse completely (exit code / report
 * bytes / terminal state / enforcement / liveness). An incomplete lane —
 * writer drift, hand-edited or forensically-rebuilt INDEX — THROWS
 * `IndexLaneParseError` naming the lane and the missing field(s).
 * Silently dropping the lane would lower `configured` in
 * `computeFleetReportFromParsedLanes` until it equals `produced`, making
 * a degraded fleet read healthy at the lift and govern surfaces — the
 * same outage-masquerading shape as AUDIT-20260611-01, one level up.
 */
export function parseIndexLaneStates(indexText: string): ParsedIndexLane[] | null {
  const lines = indexText.split(/\r?\n/);
  const raw: RawIndexLane[] = [];
  let current: RawIndexLane | null = null;

  for (const line of lines) {
    const heading = /^###\s+(.+?)\s*$/.exec(line);
    if (heading !== null) {
      if (current !== null) raw.push(current);
      current = { name: heading[1]! };
      continue;
    }
    if (current === null) continue;
    const exit = /^- exit code:\s*(-?\d+)\s*$/.exec(line);
    if (exit !== null) {
      current.exitCode = Number.parseInt(exit[1]!, 10);
      continue;
    }
    const reportBytes = /^- report bytes:\s*(\d+)\s*$/.exec(line);
    if (reportBytes !== null) {
      current.reportBytes = Number.parseInt(reportBytes[1]!, 10);
      continue;
    }
    const state = /^- terminal state:\s*(\S+)\s*$/.exec(line);
    if (state !== null) {
      const parsed = parseTerminalState(state[1]!);
      if (parsed !== undefined) current.terminalState = parsed;
      continue;
    }
    const enforcement = /^- enforcement:\s*(enforced|unenforced)\s*$/.exec(line);
    if (enforcement !== null) {
      current.enforcement = enforcement[1] === 'enforced' ? 'enforced' : 'unenforced';
      continue;
    }
    const liveness = /^- liveness:\s*(monitored|unmonitored)/.exec(line);
    if (liveness !== null) {
      current.liveness = liveness[1] === 'monitored' ? 'monitored' : 'unmonitored';
    }
  }
  if (current !== null) raw.push(current);

  if (raw.length === 0) return null;
  // Genuinely pre-014: zero v2 rows anywhere in the manifest.
  if (!raw.some(hasAnyV2Row)) return null;

  // v2 INDEX: every lane block must be complete — fail loud, never drop.
  const problems = raw
    .map((lane) => ({ lane, missing: missingLaneFields(lane) }))
    .filter(({ missing }) => missing.length > 0)
    .map(({ lane, missing }) => `lane '${lane.name}' is missing: ${missing.join(', ')}`);
  if (problems.length > 0) {
    throw new IndexLaneParseError(
      `mixed v2 INDEX — ${problems.join('; ')}. At least one lane carries v2 rows, ` +
        `so every lane must parse completely; dropping a lane would lower ` +
        `'configured' and mask fleet degradation (AUDIT-20260611-07).`,
    );
  }

  return raw.map((lane) => ({
    name: lane.name,
    exitCode: lane.exitCode!,
    reportBytes: lane.reportBytes!,
    terminalState: lane.terminalState!,
    enforcement: lane.enforcement!,
    liveness: lane.liveness!,
  }));
}

/**
 * Reader-side fleet report from parsed INDEX lanes (FR-007). `produced`
 * counts converged-eligible lanes only: completed settle, exit 0, AND a
 * non-empty report artifact (`report bytes > 0`, the row the writer
 * renders from `reportBytes`) — the writer-side `isModelRunConverged`
 * semantics. The gate reads the INDEX row, never `existsSync`: spawn-cli
 * eagerly creates the text-lane stdout stream, so an EMPTY <model>.md
 * exists on disk even when the lane emitted zero bytes — existence is
 * not production (AUDIT-20260611-01). A fast non-zero exit (CLI-rejected
 * model pin) or a killed lane is degradation, not production. Shared by
 * the lift verb and the govern loop so both surfaces print the same
 * vocabulary.
 */
export function computeFleetReportFromParsedLanes(
  lanes: ReadonlyArray<ParsedIndexLane>,
): FleetReport {
  const produced = lanes.filter(
    (lane) =>
      lane.terminalState === 'completed' &&
      lane.exitCode === 0 &&
      lane.reportBytes > 0,
  ).length;
  return {
    configured: lanes.length,
    produced,
    perLane: lanes.map((lane) => ({
      name: lane.name,
      terminalState: lane.terminalState,
      enforcement: lane.enforcement,
      liveness: lane.liveness,
    })),
    quorumCollapsed: produced <= 1,
  };
}

function renderTimeoutBasis(result: ModelRunResult): string {
  const basis = result.timeoutBasis;
  if (basis.mode === 'override') {
    return `override → ${basis.effectiveTimeoutSeconds} s`;
  }
  return (
    `derived (payload ${basis.payloadBytes} bytes × ${basis.secsPerKb} s/KB, ` +
    `floor ${basis.floorSeconds}) → ${basis.effectiveTimeoutSeconds} s`
  );
}

function renderModelRow(result: ModelRunResult): string {
  const lines: string[] = [];
  lines.push(`### ${result.name}`);
  lines.push('');
  lines.push(`- exit code: ${result.exitCode}`);
  lines.push(`- duration: ${result.durationMs} ms`);
  lines.push(`- stdout bytes: ${result.stdoutBytes}`);
  lines.push(`- stderr bytes: ${result.stderrBytes}`);
  lines.push(`- report bytes: ${result.reportBytes}`);
  lines.push(`- stdout path: ${result.stdoutPath}`);
  lines.push(`- stderr path: ${result.stderrPath}`);
  if (result.eventsPath !== undefined) {
    lines.push(`- events path: ${result.eventsPath}`);
  }
  lines.push(`- timed out: ${result.timedOut ? 'yes' : 'no'}`);
  // specs/014 FR-002/FR-006 row vocabulary (run-artifacts contract).
  lines.push(`- terminal state: ${result.terminalState}`);
  lines.push(`- enforcement: ${result.enforcement}`);
  lines.push(
    result.liveness === 'monitored'
      ? `- liveness: monitored (window ${result.livenessWindowSeconds}s)`
      : '- liveness: unmonitored',
  );
  if (result.stalenessAtKillMs !== undefined) {
    lines.push(`- staleness at kill: ${(result.stalenessAtKillMs / 1000).toFixed(1)} s`);
  }
  lines.push(`- timeout basis: ${renderTimeoutBasis(result)}`);
  if (result.spawnError !== undefined) {
    lines.push(`- spawn error: ${result.spawnError}`);
  }
  lines.push('');
  return lines.join('\n');
}
