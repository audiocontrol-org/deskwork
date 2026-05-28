/**
 * lane create — write a new lane config to `.deskwork/lanes/<id>.json`.
 *
 * Phase 6 Task 6.1 (graphical-entries). The operation is project-level
 * (no entry mutation); it validates the lane via `LaneConfigSchema`
 * before writing and refuses to overwrite an existing file.
 *
 * The referenced pipeline template MUST resolve via
 * `loadPipelineTemplate` at create time — a lane bound to a
 * non-existent template is an invalid lane config. This is the same
 * cross-validation `loadLaneConfig` performs on read; doing it at
 * write time keeps the on-disk state consistent.
 */

import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { appendJournalEvent } from '../../journal/append.ts';
import { loadPipelineTemplate } from '../../pipelines/loader.ts';
import {
  assertSafeContentDir,
  assertSafeLaneId,
  laneConfigPath,
} from '../loader.ts';
import { type LaneConfig } from '../types.ts';
import { commitLaneConfig } from './commit.ts';

export interface CreateLaneOptions {
  readonly id: string;
  readonly name: string;
  readonly pipelineTemplate: string;
  readonly contentDir: string;
}

export interface CreateLaneResult {
  readonly lane: LaneConfig;
  readonly path: string;
}

/**
 * Write a new lane config. Refuses when:
 *   - `<projectRoot>/.deskwork/lanes/<id>.json` already exists (the
 *     operator must remove the existing file or use `lane update`).
 *   - The lane fails Zod validation (e.g. empty id / name).
 *   - The referenced pipeline template fails to resolve via
 *     `loadPipelineTemplate(opts.pipelineTemplate, projectRoot)`.
 *
 * Emits a `lane-create` journal event on success.
 */
export async function createLane(
  projectRoot: string,
  opts: CreateLaneOptions,
): Promise<CreateLaneResult> {
  assertSafeLaneId(projectRoot, opts.id);
  assertSafeContentDir(projectRoot, opts.contentDir);
  const target = laneConfigPath(projectRoot, opts.id);
  if (existsSync(target)) {
    throw new Error(
      `Cannot create lane "${opts.id}": file already exists at ${target}. `
      + `Either remove the file first, or use "deskwork lane update ${opts.id}" `
      + `to modify the existing lane.`,
    );
  }

  // Cross-validate the pipeline template before assembling the lane —
  // a lane bound to an unknown template is invalid by construction.
  try {
    loadPipelineTemplate(opts.pipelineTemplate, projectRoot);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Cannot create lane "${opts.id}": pipelineTemplate "${opts.pipelineTemplate}" `
      + `does not resolve:\n${detail}`,
    );
  }

  const candidate: LaneConfig = {
    id: opts.id,
    name: opts.name,
    pipelineTemplate: opts.pipelineTemplate,
    contentDir: opts.contentDir,
  };

  mkdirSync(dirname(target), { recursive: true });
  const { lane, path } = commitLaneConfig(projectRoot, opts.id, candidate, 'create');

  await appendJournalEvent(projectRoot, {
    kind: 'lane-create',
    at: new Date().toISOString(),
    laneId: opts.id,
    details: {
      name: opts.name,
      pipelineTemplate: opts.pipelineTemplate,
      contentDir: opts.contentDir,
    },
  });

  return { lane, path };
}
