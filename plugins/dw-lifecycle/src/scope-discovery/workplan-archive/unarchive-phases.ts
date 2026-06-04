/**
 * plugins/dw-lifecycle/src/scope-discovery/workplan-archive/unarchive-phases.ts
 *
 * Phase 26 Task 3 — symmetric reversal of archive-phases.
 *
 * Moves `## Phase N:` sections from `workplan-archive.md` BACK to
 * `workplan.md` at the correct numeric position; removes the phase
 * from the ledger's `archived-phases` range. Does NOT decrement
 * `next-fix-task-id` (IDs are forever-allocated per the design spec).
 *
 * Reversibility: archive → unarchive → archive should round-trip
 * cleanly when nothing else changed (the workplan-archive.test.ts
 * round-trip case in Task 1 exercises this end-to-end).
 */

import { readFile, writeFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import {
  parseLedgerContent,
  serializeLedger,
  findLedger,
  wrapLedgerBlock,
  type Ledger,
  type IdRange,
} from './ledger.js';
import { locatePhaseSection } from './archive-phases.js';

export interface UnarchivePhasesOptions {
  readonly repoRoot: string;
  readonly featureSlug: string;
  readonly phases: ReadonlyArray<number>;
  readonly apply: boolean;
}

export interface UnarchivePhaseAction {
  readonly phase: number;
  readonly action: 'restored' | 'not-found-in-archive';
}

export interface UnarchivePhasesReport {
  readonly apply: boolean;
  readonly actions: ReadonlyArray<UnarchivePhaseAction>;
  readonly workplanPath: string;
  readonly archivePath: string;
}

export class UnarchivePhasesError extends Error {}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Remove a phase ID from a range list. Splits ranges as needed:
 * removing 5 from [1-3, 5, 7-10] → [1-3, 7-10]; removing 5 from [3-7]
 * → [3-4, 6-7].
 */
function removeFromRanges(
  ranges: ReadonlyArray<IdRange>,
  phaseNum: number,
): ReadonlyArray<IdRange> {
  const flat: number[] = [];
  for (const r of ranges) {
    if (r.end === undefined) {
      flat.push(Number(r.start));
    } else {
      for (let i = Number(r.start); i <= Number(r.end); i += 1) flat.push(i);
    }
  }
  const filtered = flat.filter((n) => n !== phaseNum);
  filtered.sort((a, b) => a - b);
  // Recompact
  const compacted: IdRange[] = [];
  let runStart: number | null = null;
  let runEnd: number | null = null;
  for (const n of filtered) {
    if (runStart === null) {
      runStart = n;
      runEnd = n;
    } else if (n === runEnd! + 1) {
      runEnd = n;
    } else {
      compacted.push(
        runStart === runEnd ? { start: String(runStart) } : { start: String(runStart), end: String(runEnd) },
      );
      runStart = n;
      runEnd = n;
    }
  }
  if (runStart !== null) {
    compacted.push(
      runStart === runEnd ? { start: String(runStart) } : { start: String(runStart), end: String(runEnd) },
    );
  }
  return compacted;
}

/**
 * Find the correct insertion line in the active workplan for a given
 * phase number. Insert BEFORE the first `## Phase M:` with M > phaseNum,
 * or at end-of-file if no later phase exists.
 */
export function findInsertionLine(
  lines: ReadonlyArray<string>,
  phaseNum: number,
): number {
  const phaseHeadingRe = /^## Phase (\d+)(?::|$|\s)/;
  for (let i = 0; i < lines.length; i += 1) {
    const m = phaseHeadingRe.exec(lines[i]!);
    if (m !== null) {
      const existing = Number(m[1]);
      if (existing > phaseNum) return i;
    }
  }
  return lines.length;
}

async function resolveFeatureDir(repoRoot: string, slug: string): Promise<string> {
  const candidates = [
    join(repoRoot, 'docs/1.0/001-IN-PROGRESS', slug),
    join(repoRoot, 'docs/1.0/002-WAITING', slug),
    join(repoRoot, 'docs/1.0/003-COMPLETE', slug),
  ];
  for (const candidate of candidates) {
    if (await pathExists(candidate)) return candidate;
  }
  throw new UnarchivePhasesError(`feature dir not found for slug "${slug}"`);
}

export async function unarchivePhases(
  opts: UnarchivePhasesOptions,
): Promise<UnarchivePhasesReport> {
  const featureDir = await resolveFeatureDir(opts.repoRoot, opts.featureSlug);
  const workplanPath = join(featureDir, 'workplan.md');
  const archivePath = join(featureDir, 'workplan-archive.md');
  if (!(await pathExists(workplanPath))) {
    throw new UnarchivePhasesError(`workplan not found: ${workplanPath}`);
  }
  if (!(await pathExists(archivePath))) {
    throw new UnarchivePhasesError(`archive file not found: ${archivePath}`);
  }
  const workplanBody = await readFile(workplanPath, 'utf8');
  const archiveBody = await readFile(archivePath, 'utf8');
  const actions: UnarchivePhaseAction[] = [];
  const sectionsToRestore: Array<{ phase: number; lines: string[] }> = [];
  const archiveLines = archiveBody.split('\n');
  // Sections to splice out of the archive (collect in reverse for safe splicing)
  const archiveSpliceRanges: Array<{ phase: number; start: number; end: number }> = [];
  for (const phaseNum of opts.phases) {
    const located = locatePhaseSection(archiveLines, phaseNum);
    if (located === null) {
      actions.push({ phase: phaseNum, action: 'not-found-in-archive' });
      continue;
    }
    actions.push({ phase: phaseNum, action: 'restored' });
    sectionsToRestore.push({
      phase: phaseNum,
      lines: archiveLines.slice(located.start, located.end),
    });
    archiveSpliceRanges.push({ phase: phaseNum, start: located.start, end: located.end });
  }
  if (!opts.apply) {
    return { apply: false, actions, workplanPath, archivePath };
  }
  if (sectionsToRestore.length === 0) {
    return { apply: true, actions, workplanPath, archivePath };
  }
  // Insert each restored section into the workplan at the correct
  // numeric position. Process phases in ascending order so each
  // insertion sees a clean numeric ordering.
  const workplanLines = workplanBody.split('\n');
  sectionsToRestore.sort((a, b) => a.phase - b.phase);
  let mutatedLines = workplanLines.slice();
  for (const section of sectionsToRestore) {
    const insertAt = findInsertionLine(mutatedLines, section.phase);
    // Trim trailing blank lines from the section to avoid stacking blanks
    const sectionToInsert = section.lines.slice();
    while (
      sectionToInsert.length > 0 &&
      sectionToInsert[sectionToInsert.length - 1]!.trim() === ''
    ) {
      sectionToInsert.pop();
    }
    // Add one trailing blank before the next phase (if any follows)
    if (insertAt < mutatedLines.length) {
      sectionToInsert.push('');
    }
    mutatedLines = [
      ...mutatedLines.slice(0, insertAt),
      ...sectionToInsert,
      ...mutatedLines.slice(insertAt),
    ];
  }
  // Splice the restored sections OUT of the archive (in reverse line order)
  archiveSpliceRanges.sort((a, b) => b.start - a.start);
  let newArchiveLines = archiveLines.slice();
  for (const sp of archiveSpliceRanges) {
    newArchiveLines = [...newArchiveLines.slice(0, sp.start), ...newArchiveLines.slice(sp.end)];
  }
  // Update the workplan's ledger: remove each restored phase from
  // archived-phases.
  const existing = findLedger(mutatedLines.join('\n'));
  let finalWorkplanBody = mutatedLines.join('\n');
  if (existing !== null) {
    const previousLedger: Ledger = parseLedgerContent(existing.content);
    let newArchivedPhases = previousLedger.archivedPhases;
    for (const section of sectionsToRestore) {
      newArchivedPhases = removeFromRanges(newArchivedPhases, section.phase);
    }
    const newLedger: Ledger = {
      archivedPhases: newArchivedPhases,
      archivedFixTasks: previousLedger.archivedFixTasks,
      archiveFile: previousLedger.archiveFile,
      nextFixTaskId: previousLedger.nextFixTaskId,
      ...(previousLedger.note !== undefined ? { note: previousLedger.note } : {}),
    };
    const newLedgerBlock = wrapLedgerBlock(serializeLedger(newLedger));
    const ledgerInMutated = findLedger(finalWorkplanBody)!;
    finalWorkplanBody =
      finalWorkplanBody.slice(0, ledgerInMutated.start) +
      newLedgerBlock +
      finalWorkplanBody.slice(ledgerInMutated.end);
  }
  await writeFile(workplanPath, finalWorkplanBody);
  await writeFile(archivePath, newArchiveLines.join('\n'));
  return { apply: true, actions, workplanPath, archivePath };
}
