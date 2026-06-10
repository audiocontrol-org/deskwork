// 011 T010 — orient(): assemble the read-only orientation inputs through the
// resolved installation config. Composes the 006 roadmap reasoner (ready/blocked),
// the latest journal entry, the open local backlog (008 list()), and the Spec Kit
// chain position (chain-position.ts). Every read goes through the installation's
// resolved paths — no hardcoded path, branch, or slug (#122). NEVER queries
// GitHub issues (FR-001). The staleness slot is added by US4 (T029).

import { existsSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Installation } from '../config/types.js';
import { createBacklogBackend } from '../backlog/backend.js';
import { loadRoadmap } from '../roadmap/roadmap-model.js';
import { isReady, isTerminal, ready } from '../roadmap/graph.js';
import { grammarOptsForRoot } from '../subcommands/document-verb-shared.js';
import { inferChainPosition, type ChainPosition } from './chain-position.js';
import { checkStaleness, type StalenessSignal } from './staleness.js';

/** A roadmap item projected for the report (the 006 WorkItem, narrowed). */
export interface RoadmapItemRef {
  readonly identifier: string;
  readonly status: string;
}

/** A backlog item projected from 008's BacklogItem. */
export interface BacklogItemRef {
  readonly id: string;
  readonly title: string;
  readonly status: string;
}

/** The latest journal entry, summarized (heading + a short body excerpt). */
export interface JournalEntrySummary {
  readonly heading: string;
  readonly excerpt: string;
}

export interface OrientationReport {
  readonly installationRoot: string;
  readonly roadmap: { readonly ready: readonly RoadmapItemRef[]; readonly blocked: readonly RoadmapItemRef[] };
  readonly activeSpec: ChainPosition | null;
  readonly latestJournalEntry: JournalEntrySummary | null;
  readonly openBacklog: readonly BacklogItemRef[];
  /** Branch-staleness advisory (US4); never blocks (FR-016/FR-017). */
  readonly staleness: StalenessSignal;
}

export interface OrientInput {
  readonly installation: Installation;
  readonly repoRoot: string;
}

export function orient(input: OrientInput): OrientationReport {
  const { installation, repoRoot } = input;
  return {
    installationRoot: installation.root,
    roadmap: gatherRoadmap(installation),
    activeSpec: inferChainPosition(repoRoot),
    latestJournalEntry: gatherLatestJournalEntry(installation.resolved.journal),
    openBacklog: gatherOpenBacklog(installation.resolved.backlog),
    staleness: checkStaleness(installation.root),
  };
}

/** ready frontier + blocked (non-terminal, not-ready) from the 006 reasoner. A
 * missing roadmap file is a clean empty result, not a crash (read-only orient). */
function gatherRoadmap(installation: Installation): OrientationReport['roadmap'] {
  const doc = installation.resolved.roadmap;
  if (!existsSync(doc)) return { ready: [], blocked: [] };
  const model = loadRoadmap(doc, grammarOptsForRoot(installation.root));
  const project = (id: string, status: string): RoadmapItemRef => ({ identifier: id, status });
  const readyRefs = ready(model).map((i) => project(i.identifier, i.status));
  const blockedRefs = model.items
    .filter((i) => !isTerminal(model, i) && !isReady(model, i))
    .map((i) => project(i.identifier, i.status));
  return { ready: readyRefs, blocked: blockedRefs };
}

/** The most recent journal entry = the first `## ` heading block (newest-first
 * convention, matching session-end's write order). null when none exists. */
function gatherLatestJournalEntry(journalPath: string): JournalEntrySummary | null {
  if (!existsSync(journalPath)) return null;
  const text = readFileSync(journalPath, 'utf8');
  const lines = text.split('\n');
  // Entries live AFTER the first horizontal-rule `---` preamble separator (where
  // session-end inserts them). A `## ` preamble title before it is not an entry.
  const sepIdx = lines.findIndex((l) => l.trim() === '---');
  const searchStart = sepIdx === -1 ? 0 : sepIdx + 1;
  const start = lines.findIndex((l, i) => i >= searchStart && l.startsWith('## '));
  if (start === -1) return null;
  const heading = lines[start]!.slice(3).trim();
  const body: string[] = [];
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i]!.startsWith('## ')) break;
    body.push(lines[i]!);
  }
  const excerpt = body.join('\n').trim().split('\n').slice(0, 3).join('\n');
  return { heading, excerpt };
}

/** Open backlog items via the 008 backend. The store dir's parent is the binary
 * cwd; a missing store yields [] (backend.list short-circuits on absence). */
function gatherOpenBacklog(backlogStore: string): readonly BacklogItemRef[] {
  const items = createBacklogBackend({ cwd: dirname(backlogStore) }).list();
  return items.map((i) => ({ id: i.id, title: i.title, status: i.status }));
}
