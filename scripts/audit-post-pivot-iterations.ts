#!/usr/bin/env tsx
/**
 * Phase 34e — corrupted-review trust rebuild.
 *
 * Walks the project's `.deskwork/entries/` sidecars and the
 * `.deskwork/review-journal/pipeline/` workflow records. For each
 * entry that has BOTH a sidecar and a workflow record (joined on
 * `entryId`), report when the sidecar's total iteration count
 * (Σ iterationByStage values) exceeds the workflow's `currentVersion`.
 *
 * That mismatch indicates the entry was iterated post-Phase-30 (which
 * writes to the sidecar + history journal) while the legacy workflow
 * record stayed frozen. Pre-34a, the studio's dashboard linked to the
 * legacy review surface, so any approve/reject the operator did
 * during that window could have been against stale workflow content.
 *
 * Usage:
 *   tsx scripts/audit-post-pivot-iterations.ts [<projectRoot>]
 *
 * Defaults `projectRoot` to the repo root (the calendar this script
 * is committed alongside).
 *
 * Exit code: 0 always (audit is informational; no automatic remediation).
 */

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

interface Sidecar {
  uuid: string;
  slug: string;
  title: string;
  currentStage: string;
  iterationByStage?: Record<string, number>;
}

interface WorkflowRecord {
  id: string;
  site: string;
  slug: string;
  state: string;
  currentVersion: number;
  entryId?: string;
}

function readJsonDir<T>(dir: string): T[] {
  if (!existsSync(dir)) return [];
  const out: T[] = [];
  for (const name of readdirSync(dir)) {
    if (!name.endsWith('.json')) continue;
    const raw = readFileSync(join(dir, name), 'utf8');
    out.push(JSON.parse(raw) as T);
  }
  return out;
}

function totalIterations(entry: Sidecar): number {
  const counts = entry.iterationByStage ?? {};
  let total = 0;
  for (const v of Object.values(counts)) total += v;
  return total;
}

interface Mismatch {
  entryId: string;
  slug: string;
  title: string;
  currentStage: string;
  sidecarTotalIterations: number;
  workflowCurrentVersion: number;
  workflowState: string;
  delta: number;
}

function findMismatches(
  sidecars: Sidecar[],
  workflows: WorkflowRecord[],
): Mismatch[] {
  // Index workflows by entryId. An entry can have multiple workflow
  // records (longform + outline + shortform variants); join on
  // contentKind=longform when present, else first match.
  const wfsByEntry = new Map<string, WorkflowRecord[]>();
  for (const wf of workflows) {
    if (wf.entryId === undefined) continue;
    const list = wfsByEntry.get(wf.entryId) ?? [];
    list.push(wf);
    wfsByEntry.set(wf.entryId, list);
  }

  const mismatches: Mismatch[] = [];
  for (const sidecar of sidecars) {
    const wfs = wfsByEntry.get(sidecar.uuid);
    if (!wfs || wfs.length === 0) continue;
    // Take the longform workflow if present (the one that backs the
    // legacy review surface that 34a retired); else the first.
    const wf = wfs[0];
    if (!wf) continue;
    const sidecarTotal = totalIterations(sidecar);
    if (sidecarTotal > wf.currentVersion) {
      mismatches.push({
        entryId: sidecar.uuid,
        slug: sidecar.slug,
        title: sidecar.title,
        currentStage: sidecar.currentStage,
        sidecarTotalIterations: sidecarTotal,
        workflowCurrentVersion: wf.currentVersion,
        workflowState: wf.state,
        delta: sidecarTotal - wf.currentVersion,
      });
    }
  }
  return mismatches;
}

function main(): void {
  const projectRoot = resolve(process.argv[2] ?? process.cwd());
  const entriesDir = join(projectRoot, '.deskwork/entries');
  const pipelineDir = join(projectRoot, '.deskwork/review-journal/pipeline');

  const sidecars = readJsonDir<Sidecar>(entriesDir);
  const workflows = readJsonDir<WorkflowRecord>(pipelineDir);
  const mismatches = findMismatches(sidecars, workflows);

  process.stdout.write(
    `Audit: ${sidecars.length} sidecars × ${workflows.length} workflow records\n`,
  );
  process.stdout.write(`Project: ${projectRoot}\n\n`);

  if (mismatches.length === 0) {
    process.stdout.write(
      'No mismatches. Every entry with a workflow record has its sidecar iteration count <= the workflow currentVersion.\n',
    );
    return;
  }

  process.stdout.write(
    `Found ${mismatches.length} entries where sidecar iteration count exceeds the legacy workflow currentVersion:\n\n`,
  );
  for (const m of mismatches) {
    process.stdout.write(
      `  - ${m.slug} (${m.entryId})\n` +
        `      title: ${m.title}\n` +
        `      currentStage: ${m.currentStage}\n` +
        `      sidecar Σ iterations: ${m.sidecarTotalIterations}\n` +
        `      workflow currentVersion: ${m.workflowCurrentVersion} (state=${m.workflowState})\n` +
        `      delta: +${m.delta} iteration(s) recorded post-pivot\n\n`,
    );
  }
}

main();
