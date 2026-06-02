/**
 * lane archive / lane restore — flip the `archivedAt` field on a lane.
 *
 * Phase 6 Task 6.1 (graphical-entries). Soft-archive shape: the
 * `archivedAt` field carries an ISO datetime that doubles as the
 * boolean signal and the audit trail. Archive sets the field;
 * restore clears it.
 *
 * Both operations are project-level config edits — no entries are
 * touched. Entries that reference an archived lane keep their
 * `lane` field intact; the dashboard / studio renderers skip
 * archived lanes by default (because `listLaneConfigs` filters them
 * out at the default call). To purge an archived lane completely,
 * use `lane purge` — which refuses when entries still reference the
 * lane, so the archive → purge path forces the operator through a
 * `lane move` of every dependent entry first.
 *
 * Per the project's "content-management databases preserve, they
 * don't delete" rule, archive is the preferred disposition for a
 * lane the operator no longer wants surfaced.
 */

import { appendJournalEvent } from '../../journal/append.ts';
import { loadLaneConfig } from '../loader.ts';
import { type LaneConfig } from '../types.ts';
import { commitLaneConfig } from './commit.ts';

export interface ArchiveLaneResult {
  readonly lane: LaneConfig;
  readonly path: string;
}

export async function archiveLane(
  projectRoot: string,
  id: string,
): Promise<ArchiveLaneResult> {
  const existing = loadLaneConfig(id, projectRoot);
  if (
    typeof existing.archivedAt === 'string'
    && existing.archivedAt.length > 0
  ) {
    throw new Error(
      `Cannot archive lane "${id}": already archived (archivedAt=${existing.archivedAt}).`,
    );
  }

  const at = new Date().toISOString();
  const updated: LaneConfig = { ...existing, archivedAt: at };

  const { lane, path } = commitLaneConfig(projectRoot, id, updated, 'archive');
  await appendJournalEvent(projectRoot, {
    kind: 'lane-archive',
    at,
    laneId: id,
  });
  return { lane, path };
}

export async function restoreLane(
  projectRoot: string,
  id: string,
): Promise<ArchiveLaneResult> {
  const existing = loadLaneConfig(id, projectRoot);
  if (
    existing.archivedAt === undefined
    || (typeof existing.archivedAt === 'string' && existing.archivedAt.length === 0)
  ) {
    throw new Error(
      `Cannot restore lane "${id}": not archived (no archivedAt field).`,
    );
  }

  // Strip archivedAt; keep every other field including any
  // passthrough extras (e.g. $rationale). `archivedAt` is schema-
  // optional, so the destructured `rest` is structurally assignable
  // to `LaneConfig` without an explicit cast.
  const { archivedAt: _drop, ...rest } = existing;
  void _drop;
  const updated: LaneConfig = rest;

  const { lane, path } = commitLaneConfig(projectRoot, id, updated, 'restore');
  await appendJournalEvent(projectRoot, {
    kind: 'lane-restore',
    at: new Date().toISOString(),
    laneId: id,
  });
  return { lane, path };
}
