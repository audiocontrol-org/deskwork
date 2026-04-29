/**
 * Editorial review pipeline — workflow + version API.
 *
 * Ported from audiocontrol.org's scripts/lib/editorial-review/pipeline.ts.
 * Storage: two journal directories under `<journalDir>/` — a `pipeline/`
 * dir holding one file per workflow (latest state) and a `history/` dir
 * holding one file per event (versions, annotations, state transitions).
 *
 * The default `journalDir` is `.deskwork/review-journal`. Host projects
 * migrating from a prior layout can override via the top-level
 * `reviewJournalDir` config field (e.g. audiocontrol points it at
 * `journal/editorial` to read existing data).
 */

import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { appendJournal, readJournal } from '../journal.ts';
import type { Platform } from '../types.ts';
import type { DeskworkConfig } from '../config.ts';
import {
  envelopeFor,
  unwrap,
  type JournaledHistoryEntry,
} from './journal-mappers.ts';
import {
  isValidTransition,
  type ContentKind,
  type DraftAnnotation,
  type DraftHistoryEntry,
  type DraftVersion,
  type DraftWorkflowItem,
  type DraftWorkflowState,
  type OriginatedBy,
} from './types.ts';

const DEFAULT_JOURNAL_DIR = '.deskwork/review-journal';
const PIPELINE_SUBDIR = 'pipeline';
const HISTORY_SUBDIR = 'history';

/** Absolute path to the review journal root for a project. */
export function reviewJournalRoot(
  projectRoot: string,
  config: DeskworkConfig,
): string {
  return join(projectRoot, config.reviewJournalDir ?? DEFAULT_JOURNAL_DIR);
}

/** Path to the pipeline journal (one file per workflow). */
export function pipelinePath(projectRoot: string, config: DeskworkConfig): string {
  return join(reviewJournalRoot(projectRoot, config), PIPELINE_SUBDIR);
}

/** Path to the history journal (one file per event). */
export function historyPath(projectRoot: string, config: DeskworkConfig): string {
  return join(reviewJournalRoot(projectRoot, config), HISTORY_SUBDIR);
}

/**
 * Read every workflow (one record per id by construction — state transitions
 * overwrite the existing file in place).
 */
export function readWorkflows(
  projectRoot: string,
  config: DeskworkConfig,
): DraftWorkflowItem[] {
  return readJournal<DraftWorkflowItem>(pipelinePath(projectRoot, config), {
    timestampField: 'createdAt',
  });
}

/** Read the full history log, oldest first. */
export function readHistory(
  projectRoot: string,
  config: DeskworkConfig,
): DraftHistoryEntry[] {
  const envelopes = readJournal<JournaledHistoryEntry>(
    historyPath(projectRoot, config),
  );
  return envelopes.map(unwrap);
}

export function readWorkflow(
  projectRoot: string,
  config: DeskworkConfig,
  id: string,
): DraftWorkflowItem | null {
  return readWorkflows(projectRoot, config).find((w) => w.id === id) ?? null;
}

function writeWorkflow(
  projectRoot: string,
  config: DeskworkConfig,
  workflow: DraftWorkflowItem,
): void {
  appendJournal(pipelinePath(projectRoot, config), workflow, {
    idField: 'id',
    timestampField: 'createdAt',
  });
}

function writeHistory(
  projectRoot: string,
  config: DeskworkConfig,
  entry: DraftHistoryEntry,
): void {
  appendJournal(historyPath(projectRoot, config), envelopeFor(entry), {
    idField: 'id',
    timestampField: 'timestamp',
  });
}

export interface CreateWorkflowParams {
  /**
   * Stable UUID of the target calendar entry. Preferred over `slug` as
   * the natural key so renames don't split a single entry's workflow
   * history across two keys. Optional for callers that haven't migrated
   * yet; when present, it replaces the (site, slug) match in idempotent
   * lookup.
   */
  entryId?: string;
  site: string;
  slug: string;
  contentKind: ContentKind;
  platform?: Platform;
  channel?: string;
  initialMarkdown: string;
  initialOriginatedBy?: OriginatedBy;
}

function matchesKey(w: DraftWorkflowItem, k: CreateWorkflowParams): boolean {
  // Prefer entryId when both sides have it — stable identity survives
  // slug renames. Fall back to (site, slug) otherwise so legacy
  // workflows remain matchable.
  const idMatch =
    k.entryId && w.entryId
      ? w.entryId === k.entryId
      : w.site === k.site && w.slug === k.slug;
  return (
    idMatch &&
    w.contentKind === k.contentKind &&
    (w.platform ?? null) === (k.platform ?? null) &&
    (w.channel ?? null) === (k.channel ?? null)
  );
}

function findOpenByKey(
  projectRoot: string,
  config: DeskworkConfig,
  params: CreateWorkflowParams,
): DraftWorkflowItem | null {
  return (
    readWorkflows(projectRoot, config).find(
      (w) =>
        matchesKey(w, params) &&
        w.state !== 'applied' &&
        w.state !== 'cancelled',
    ) ?? null
  );
}

/**
 * Create a new workflow plus its v1. Idempotent on the natural key
 * (site, slug, contentKind, platform?, channel?) — if a non-terminal
 * workflow already exists for that tuple, returns it unchanged.
 */
export function createWorkflow(
  projectRoot: string,
  config: DeskworkConfig,
  params: CreateWorkflowParams,
): DraftWorkflowItem {
  const existing = findOpenByKey(projectRoot, config, params);
  if (existing) return existing;

  const now = new Date().toISOString();
  const item: DraftWorkflowItem = {
    id: randomUUID(),
    site: params.site,
    slug: params.slug,
    contentKind: params.contentKind,
    state: 'open',
    currentVersion: 1,
    createdAt: now,
    updatedAt: now,
  };
  if (params.entryId !== undefined) item.entryId = params.entryId;
  if (params.platform !== undefined) item.platform = params.platform;
  if (params.channel !== undefined) item.channel = params.channel;

  writeWorkflow(projectRoot, config, item);
  writeHistory(projectRoot, config, {
    kind: 'workflow-created',
    at: now,
    workflow: item,
  });

  const v1: DraftVersion = {
    version: 1,
    markdown: params.initialMarkdown,
    createdAt: now,
    originatedBy: params.initialOriginatedBy ?? 'agent',
  };
  writeHistory(projectRoot, config, {
    kind: 'version',
    at: now,
    workflowId: item.id,
    version: v1,
  });

  return item;
}

/** List workflows in non-terminal states; optionally scoped to a site. */
export function listOpen(
  projectRoot: string,
  config: DeskworkConfig,
  site?: string,
): DraftWorkflowItem[] {
  return readWorkflows(projectRoot, config).filter(
    (w) =>
      w.state !== 'applied' &&
      w.state !== 'cancelled' &&
      (!site || w.site === site),
  );
}

/**
 * Transition a workflow to a new state. Validates against VALID_TRANSITIONS
 * and appends a history event. The workflow's file is overwritten in place.
 */
export function transitionState(
  projectRoot: string,
  config: DeskworkConfig,
  workflowId: string,
  to: DraftWorkflowState,
): DraftWorkflowItem {
  const current = readWorkflow(projectRoot, config, workflowId);
  if (!current) throw new Error(`Unknown workflow: ${workflowId}`);
  if (!isValidTransition(current.state, to)) {
    throw new Error(
      `Invalid transition for workflow ${workflowId}: ${current.state} → ${to}`,
    );
  }
  const now = new Date().toISOString();
  const updated: DraftWorkflowItem = { ...current, state: to, updatedAt: now };
  writeWorkflow(projectRoot, config, updated);
  writeHistory(projectRoot, config, {
    kind: 'workflow-state',
    at: now,
    workflowId,
    from: current.state,
    to,
  });
  return updated;
}

/**
 * Append a new version. Increments currentVersion on the workflow.
 * Does not transition state — callers combine with transitionState().
 */
export function appendVersion(
  projectRoot: string,
  config: DeskworkConfig,
  workflowId: string,
  markdown: string,
  originatedBy: OriginatedBy,
): DraftVersion {
  const current = readWorkflow(projectRoot, config, workflowId);
  if (!current) throw new Error(`Unknown workflow: ${workflowId}`);
  const now = new Date().toISOString();
  const version: DraftVersion = {
    version: current.currentVersion + 1,
    markdown,
    createdAt: now,
    originatedBy,
  };
  writeHistory(projectRoot, config, {
    kind: 'version',
    at: now,
    workflowId,
    version,
  });
  const updated: DraftWorkflowItem = {
    ...current,
    currentVersion: version.version,
    updatedAt: now,
  };
  writeWorkflow(projectRoot, config, updated);
  return version;
}

/** Append an annotation to history. Does not transition state. */
export function appendAnnotation(
  projectRoot: string,
  config: DeskworkConfig,
  annotation: DraftAnnotation,
): void {
  writeHistory(projectRoot, config, {
    kind: 'annotation',
    at: annotation.createdAt,
    annotation,
  });
}

export function readVersions(
  projectRoot: string,
  config: DeskworkConfig,
  workflowId: string,
): DraftVersion[] {
  const versions: DraftVersion[] = [];
  for (const entry of readHistory(projectRoot, config)) {
    if (entry.kind === 'version' && entry.workflowId === workflowId) {
      versions.push(entry.version);
    }
  }
  return versions.sort((a, b) => a.version - b.version);
}

/**
 * Annotations for a workflow, optionally filtered to a specific version.
 * comment/approve/reject match by `version`; edit matches by `beforeVersion`.
 */
export function readAnnotations(
  projectRoot: string,
  config: DeskworkConfig,
  workflowId: string,
  version?: number,
): DraftAnnotation[] {
  const anns: DraftAnnotation[] = [];
  for (const entry of readHistory(projectRoot, config)) {
    if (entry.kind !== 'annotation') continue;
    const a = entry.annotation;
    if (a.workflowId !== workflowId) continue;
    if (version === undefined) {
      anns.push(a);
      continue;
    }
    const matchesVersion =
      (a.type === 'comment' && a.version === version) ||
      (a.type === 'approve' && a.version === version) ||
      (a.type === 'reject' && a.version === version) ||
      (a.type === 'edit' && a.beforeVersion === version);
    if (matchesVersion) anns.push(a);
  }
  return anns;
}

/** Mint an annotation with a server-assigned id and timestamp. */
export function mintAnnotation<
  T extends Omit<DraftAnnotation, 'id' | 'createdAt'>,
>(partial: T): T & { id: string; createdAt: string } {
  return {
    ...partial,
    id: randomUUID(),
    createdAt: new Date().toISOString(),
  };
}
