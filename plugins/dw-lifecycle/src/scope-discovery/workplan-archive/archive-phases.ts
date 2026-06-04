/**
 * plugins/dw-lifecycle/src/scope-discovery/workplan-archive/archive-phases.ts
 *
 * Phase 26 Task 2 — productize the manual archive operation.
 *
 * Moves `## Phase N:` sections from a feature's `workplan.md` to a
 * sibling `workplan-archive.md`; updates the workplan's
 * `<!-- workplan-archive-ledger -->` annotation with the new ranges.
 *
 * Per AUDIT-20260603-37: refuses partial-complete phases by default;
 * `--allow-vestigial <reason>` is the explicit escape for retired-
 * vestigial phases (the case the 2026-06-03 manual archive needed for
 * Phases 17/22/23). Reason is recorded in the ledger so future readers
 * see WHY an incomplete phase was archived.
 *
 * Pure-ish: takes options + a fs-shim-shaped pair, returns a structured
 * report. The orchestrator wraps it with real fs.
 */

import { readFile, writeFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import {
  parseLedgerContent,
  serializeLedger,
  findLedger,
  wrapLedgerBlock,
  mergeFixTaskIds,
  findMaxId,
  incrementId,
  compareIds,
  type Ledger,
  type IdRange,
} from './ledger.js';

export interface ArchivePhasesOptions {
  readonly repoRoot: string;
  readonly featureSlug: string;
  readonly phases: ReadonlyArray<number>;
  readonly apply: boolean;
  /**
   * When provided, allows archiving phases with ANY unchecked task.
   * Must be ≥40 chars of substantive prose (mirrors `check-fix-task-tdd`
   * substantive-reason validator). The reason is recorded in the ledger
   * next to the archived phase entry.
   */
  readonly allowVestigialReason?: string;
}

export interface PhaseAction {
  readonly phase: number;
  readonly action: 'archived' | 'not-found' | 'refused-incomplete' | 'allowed-vestigial';
  readonly uncheckedTaskCount?: number;
  readonly reason?: string;
}

export interface ArchivePhasesReport {
  readonly apply: boolean;
  readonly actions: ReadonlyArray<PhaseAction>;
  readonly workplanPath: string;
  readonly archivePath: string;
}

export class ArchivePhasesError extends Error {}

/** Substantive-reason validator (≥40 chars, no placeholders). */
export function validateVestigialReason(reason: string): void {
  if (reason.trim().length < 40) {
    throw new ArchivePhasesError(
      `--allow-vestigial reason must be ≥40 chars (got ${reason.trim().length})`,
    );
  }
  const placeholders = /\b(TBD|to be filled in|fix later|placeholder|todo)\b/i;
  if (placeholders.test(reason)) {
    throw new ArchivePhasesError(
      `--allow-vestigial reason contains a placeholder phrase; describe a concrete reason`,
    );
  }
}

/**
 * Locate a `## Phase N:` section. Returns the start line index (0-based)
 * + the end line index (exclusive; points at the next `## Phase` heading
 * or EOF). Returns null when the phase isn't found.
 */
export function locatePhaseSection(
  lines: ReadonlyArray<string>,
  phaseNumber: number,
): { start: number; end: number } | null {
  const headingPattern = new RegExp(`^## Phase ${phaseNumber}(?::|$|\\s)`);
  let startIdx = -1;
  for (let i = 0; i < lines.length; i += 1) {
    if (headingPattern.test(lines[i]!)) {
      startIdx = i;
      break;
    }
  }
  if (startIdx === -1) return null;
  // Walk forward to the next `## Phase ` heading OR EOF
  let endIdx = lines.length;
  const anyPhasePattern = /^## Phase \d+(?::|$|\s)/;
  for (let i = startIdx + 1; i < lines.length; i += 1) {
    if (anyPhasePattern.test(lines[i]!)) {
      endIdx = i;
      break;
    }
  }
  return { start: startIdx, end: endIdx };
}

/**
 * Enumerate every `## Phase N:` heading present in the workplan body in
 * the order they appear. Returns the phase numbers as a sorted unique
 * array. Used by `archive-phases --all` to pre-fill the phase range
 * without the operator enumerating each phase by hand.
 *
 * The matched shape is `^## Phase <integer>(?::|$|\s)` — identical to
 * `locatePhaseSection`'s probe so the two functions cannot drift.
 */
export function enumerateAllPhases(workplanBody: string): number[] {
  const lines = workplanBody.split('\n');
  const anyPhasePattern = /^## Phase (\d+)(?::|$|\s)/;
  const phases = new Set<number>();
  for (const line of lines) {
    const match = anyPhasePattern.exec(line);
    if (match === null) continue;
    const raw = match[1];
    if (typeof raw !== 'string') continue;
    const num = Number(raw);
    if (!Number.isInteger(num)) continue;
    phases.add(num);
  }
  return Array.from(phases).sort((a, b) => a - b);
}

/**
 * Count unchecked task boxes (`- [ ]`) within a section. Used to gate
 * `--allow-vestigial`-less archive.
 */
export function countUncheckedTasks(sectionLines: ReadonlyArray<string>): number {
  let count = 0;
  for (const line of sectionLines) {
    if (/^\s*- \[ \]/.test(line)) count += 1;
  }
  return count;
}

/**
 * Extract fix-task heading IDs from a phase section. Per AUDIT-20260603-89:
 * archive-phases must scan moved sections for `### Task N` headings and
 * synthesize their dotted-decimal `<phaseNum>.<taskInt>` form so they can
 * be merged into the ledger's `archived-fix-tasks` field.
 *
 * The heading shape matched is `### Task <integer>` followed by optional
 * `:`, ` (`, or whitespace. Examples that match: `### Task 1: Foo`,
 * `### Task 22 (fix-finding-AUDIT-20260603-86)`, `### Task 5 ` (trailing
 * space). Headings that do not begin with an integer task number (e.g.
 * `### Task X.Y` already in dotted form) are not matched here — the
 * auto-positioner emits integers and this scanner mirrors that contract.
 *
 * **Shared-namespace contract (AUDIT-20260603-94).** The regex matches
 * BOTH implementation tasks (`### Task 1: Setup`) AND fix-finding tasks
 * (`### Task 22 (fix-finding-AUDIT-20260603-86)`). This is intentional:
 * `promote-findings`'s auto-positioner numbers fix-tasks by scanning the
 * workplan's max integer task number under the target phase + 1, which
 * inherently shares the integer namespace with impl tasks. If
 * `scanFixTaskIds` excluded impl tasks, archiving Phase N would record
 * the fix-tasks but not the impl-tasks, and the next promote into Phase N
 * could emit a colliding integer matching an archived impl-task. The
 * field name `archived-fix-tasks` is a misnomer in the strict sense, but
 * the collision-avoidance semantic requires capturing every `### Task N`
 * heading the auto-positioner would later have to avoid.
 */
export function scanFixTaskIds(
  sectionLines: ReadonlyArray<string>,
  phaseNum: number,
): string[] {
  const out: string[] = [];
  const re = /^### Task (\d+)(?::|\s|\(|$)/;
  for (const line of sectionLines) {
    const m = re.exec(line);
    if (m === null) continue;
    out.push(`${phaseNum}.${m[1]}`);
  }
  return out;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/** Insert a new range into a sorted, non-overlapping range list. */
function mergeRange(ranges: ReadonlyArray<IdRange>, phaseNum: number): ReadonlyArray<IdRange> {
  const newId = String(phaseNum);
  const flat = ranges.flatMap((r) => {
    if (r.end === undefined) return [Number(r.start)];
    const out: number[] = [];
    for (let i = Number(r.start); i <= Number(r.end); i += 1) out.push(i);
    return out;
  });
  if (!flat.includes(phaseNum)) flat.push(phaseNum);
  flat.sort((a, b) => a - b);
  const dedup = Array.from(new Set(flat));
  // Recompact into ranges
  const compacted: IdRange[] = [];
  let runStart: number | null = null;
  let runEnd: number | null = null;
  for (const n of dedup) {
    if (runStart === null) {
      runStart = n;
      runEnd = n;
    } else if (n === runEnd! + 1) {
      runEnd = n;
    } else {
      compacted.push(runStart === runEnd ? { start: String(runStart) } : { start: String(runStart), end: String(runEnd) });
      runStart = n;
      runEnd = n;
    }
  }
  if (runStart !== null) {
    compacted.push(runStart === runEnd ? { start: String(runStart) } : { start: String(runStart), end: String(runEnd) });
  }
  void newId;
  return compacted;
}

/**
 * Orchestrator entry. Reads workplan + (optional existing) archive;
 * locates target phases; gates on unchecked-task count unless
 * `--allow-vestigial`; produces a report. When `apply: true`, writes
 * the updated workplan + archive + ledger.
 */
export async function archivePhases(
  opts: ArchivePhasesOptions,
): Promise<ArchivePhasesReport> {
  if (opts.allowVestigialReason !== undefined) {
    validateVestigialReason(opts.allowVestigialReason);
  }
  const featureDir = await resolveFeatureDir(opts.repoRoot, opts.featureSlug);
  const workplanPath = join(featureDir, 'workplan.md');
  const archivePath = join(featureDir, 'workplan-archive.md');
  if (!(await pathExists(workplanPath))) {
    throw new ArchivePhasesError(`workplan not found: ${workplanPath}`);
  }
  const workplanBody = await readFile(workplanPath, 'utf8');
  const lines = workplanBody.split('\n');
  const actions: PhaseAction[] = [];
  // Collect sections to remove (in reverse line order so splicing works).
  const sectionsToRemove: Array<{ phase: number; start: number; end: number; lines: string[] }> = [];
  for (const phaseNum of opts.phases) {
    const located = locatePhaseSection(lines, phaseNum);
    if (located === null) {
      actions.push({ phase: phaseNum, action: 'not-found' });
      continue;
    }
    const sectionLines = lines.slice(located.start, located.end);
    const unchecked = countUncheckedTasks(sectionLines);
    if (unchecked > 0 && opts.allowVestigialReason === undefined) {
      actions.push({
        phase: phaseNum,
        action: 'refused-incomplete',
        uncheckedTaskCount: unchecked,
      });
      continue;
    }
    actions.push({
      phase: phaseNum,
      action: unchecked > 0 ? 'allowed-vestigial' : 'archived',
      uncheckedTaskCount: unchecked,
      ...(opts.allowVestigialReason !== undefined ? { reason: opts.allowVestigialReason } : {}),
    });
    sectionsToRemove.push({
      phase: phaseNum,
      start: located.start,
      end: located.end,
      lines: sectionLines,
    });
  }
  if (!opts.apply) {
    return { apply: false, actions, workplanPath, archivePath };
  }
  // When apply: true but nothing to remove (all refused / not-found), write
  // nothing — preserve the workplan AND don't create an empty archive file.
  if (sectionsToRemove.length === 0) {
    return { apply: true, actions, workplanPath, archivePath };
  }
  // Build the new workplan (splice out sections in reverse order).
  sectionsToRemove.sort((a, b) => b.start - a.start);
  let newLines = lines.slice();
  for (const section of sectionsToRemove) {
    newLines = [...newLines.slice(0, section.start), ...newLines.slice(section.end)];
  }
  // Compute the new ledger.
  const existing = findLedger(newLines.join('\n'));
  const previousLedger: Ledger | null =
    existing === null ? null : parseLedgerContent(existing.content);
  const newArchivedPhases = sectionsToRemove
    .map((s) => s.phase)
    .reduce<ReadonlyArray<IdRange>>(
      (acc, phaseNum) => mergeRange(acc, phaseNum),
      previousLedger?.archivedPhases ?? [],
    );
  // Per AUDIT-20260603-89: scan each moved section for `### Task N` fix-task
  // headings and synthesize dotted `<phase>.<task>` IDs; merge them into
  // archivedFixTasks; advance nextFixTaskId so the auto-positioner's floor
  // honors the just-archived IDs.
  const movedFixTaskIds: string[] = [];
  for (const section of sectionsToRemove) {
    for (const id of scanFixTaskIds(section.lines, section.phase)) {
      movedFixTaskIds.push(id);
    }
  }
  const newArchivedFixTasks = mergeFixTaskIds(
    previousLedger?.archivedFixTasks ?? [],
    movedFixTaskIds,
  );
  const computedMax = findMaxId(newArchivedFixTasks);
  const previousNext = previousLedger?.nextFixTaskId ?? '1.1';
  const computedNext = computedMax === null ? previousNext : incrementId(computedMax);
  // Conservative: never shrink nextFixTaskId. If the prior value was already
  // larger than max(union)+1 (e.g. operator manually advanced it), preserve it.
  const newNextFixTaskId = compareIds(computedNext, previousNext) > 0 ? computedNext : previousNext;
  const newLedger: Ledger = {
    archivedPhases: newArchivedPhases,
    archivedFixTasks: newArchivedFixTasks,
    archiveFile: previousLedger?.archiveFile ?? 'workplan-archive.md',
    nextFixTaskId: newNextFixTaskId,
    ...(previousLedger?.note !== undefined ? { note: previousLedger.note } : {}),
  };
  const newLedgerBlock = wrapLedgerBlock(serializeLedger(newLedger));
  // Splice the new ledger block into the workplan (replace existing or
  // insert near the top).
  const bodyAfterRemoval = newLines.join('\n');
  let finalBody: string;
  const ledgerInBody = findLedger(bodyAfterRemoval);
  if (ledgerInBody !== null) {
    finalBody =
      bodyAfterRemoval.slice(0, ledgerInBody.start) +
      newLedgerBlock +
      bodyAfterRemoval.slice(ledgerInBody.end);
  } else {
    // Insert before the first `## Phase` heading.
    const firstPhaseMatch = /^## Phase /m.exec(bodyAfterRemoval);
    if (firstPhaseMatch !== null) {
      finalBody =
        bodyAfterRemoval.slice(0, firstPhaseMatch.index) +
        newLedgerBlock +
        '\n\n' +
        bodyAfterRemoval.slice(firstPhaseMatch.index);
    } else {
      finalBody = bodyAfterRemoval + '\n\n' + newLedgerBlock + '\n';
    }
  }
  await writeFile(workplanPath, finalBody);
  // Append moved sections to the archive file.
  const moved = sectionsToRemove
    .slice()
    .sort((a, b) => a.phase - b.phase)
    .map((s) => s.lines.join('\n'))
    .join('\n\n');
  let archiveBody = '';
  if (await pathExists(archivePath)) {
    archiveBody = await readFile(archivePath, 'utf8');
    if (!archiveBody.endsWith('\n')) archiveBody += '\n';
    archiveBody += '\n' + moved + '\n';
  } else {
    archiveBody = createArchiveFileHeader(opts.featureSlug) + moved + '\n';
  }
  await writeFile(archivePath, archiveBody);
  return { apply: true, actions, workplanPath, archivePath };
}

function createArchiveFileHeader(slug: string): string {
  return [
    `---`,
    `slug: ${slug}`,
    `kind: workplan-archive`,
    `archive-of: workplan.md`,
    `archived-at: ${new Date().toISOString().split('T')[0]}`,
    `---`,
    ``,
    `# Workplan archive — ${slug}`,
    ``,
    `This file holds Phase sections moved out of the active workplan once their tasks were complete (or once they became vestigial per a later phase's retirement decision, via \`dw-lifecycle archive-phases --allow-vestigial\`). The active workplan at \`workplan.md\` carries a \`<!-- workplan-archive-ledger -->\` annotation naming the archived ID ranges.`,
    ``,
    `**Append-only.** Do not edit historical entries.`,
    ``,
    `**Restoring an archived phase to active workplan**: \`dw-lifecycle unarchive-phases\`.`,
    ``,
    `---`,
    ``,
  ].join('\n');
}

/**
 * Probes `docs/1.0/{001-IN-PROGRESS,002-WAITING,003-COMPLETE}/<slug>/`
 * in order and returns the first that exists. Exported so callers
 * outside this module (e.g., the `--all` flag's pre-read of the
 * workplan in the CLI shim) can resolve through the same three-status
 * lookup the library uses internally — AUDIT-20260604-18 caught the
 * `--all` flag hardcoding `001-IN-PROGRESS` while the library walked
 * all three.
 */
export async function resolveFeatureDir(repoRoot: string, slug: string): Promise<string> {
  const candidates = [
    join(repoRoot, 'docs/1.0/001-IN-PROGRESS', slug),
    join(repoRoot, 'docs/1.0/002-WAITING', slug),
    join(repoRoot, 'docs/1.0/003-COMPLETE', slug),
  ];
  for (const candidate of candidates) {
    if (await pathExists(candidate)) return candidate;
  }
  throw new ArchivePhasesError(`feature dir not found for slug "${slug}"`);
}

/**
 * Convenience for the `--all` flag's pre-read step in the CLI shim.
 * Returns the absolute path of the feature's `workplan.md` after
 * resolving through `resolveFeatureDir`.
 */
export async function resolveFeatureWorkplanPath(
  repoRoot: string,
  slug: string,
): Promise<string> {
  const dir = await resolveFeatureDir(repoRoot, slug);
  return join(dir, 'workplan.md');
}
