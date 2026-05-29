/**
 * Shared test helpers for the `deskwork pipeline` CLI tests.
 *
 * Phase 6 Task 6.2 (graphical-entries). Co-located with the per-verb
 * test files under `test/pipeline/`. Mirrors `test/lane/helpers.ts` —
 * tmp-fixture project, JSON writers for lanes / pipelines, sidecar
 * writer, subprocess runner. Each per-verb test file stays focused on
 * one verb's behavior.
 */

import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const testDir = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(testDir, '../../../..');
export const deskworkBin = join(workspaceRoot, 'node_modules/.bin/deskwork');

/**
 * Defensive precondition for the pipeline test suite: surface a clear
 * "run npm install" error rather than the confusing `code: -1` empty
 * stdout/stderr `spawnSync` returns when invoking a non-existent
 * binary. Mirrors `assertDeskworkBinPresent` in the lane suite.
 */
export function assertDeskworkBinPresent(): void {
  if (!existsSync(deskworkBin)) {
    throw new Error(
      `deskwork binary not found at ${deskworkBin} — run npm install at the `
      + `workspace root before running pipeline tests.`,
    );
  }
}

export interface RunResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

export function makeProject(): string {
  const project = mkdtempSync(join(tmpdir(), 'dw-pipeline-'));
  mkdirSync(join(project, '.deskwork', 'entries'), { recursive: true });
  writeFileSync(
    join(project, '.deskwork', 'config.json'),
    JSON.stringify({
      version: 1,
      sites: {
        main: { contentDir: 'docs', calendarPath: '.deskwork/calendar.md' },
      },
      defaultSite: 'main',
    }),
    'utf-8',
  );
  writeFileSync(
    join(project, '.deskwork', 'calendar.md'),
    '# Editorial Calendar\n\n## Ideas\n\n*No entries.*\n',
    'utf-8',
  );
  return project;
}

export function destroyProject(project: string): void {
  rmSync(project, { recursive: true, force: true });
}

export function pipeline(project: string, ...args: string[]): RunResult {
  const r = spawnSync(
    deskworkBin,
    ['pipeline', project, ...args],
    { encoding: 'utf-8' },
  );
  return {
    code: r.status ?? -1,
    stdout: r.stdout ?? '',
    stderr: r.stderr ?? '',
  };
}

export function customize(project: string, ...args: string[]): RunResult {
  const r = spawnSync(
    deskworkBin,
    ['customize', project, ...args],
    { encoding: 'utf-8' },
  );
  return {
    code: r.status ?? -1,
    stdout: r.stdout ?? '',
    stderr: r.stderr ?? '',
  };
}

export function writePipelineOverride(
  project: string,
  id: string,
  payload: Record<string, unknown>,
): void {
  const dir = join(project, '.deskwork', 'pipelines');
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, `${id}.json`),
    JSON.stringify(payload, null, 2),
    'utf-8',
  );
}

export function readPipelineOverride(
  project: string,
  id: string,
): Record<string, unknown> {
  return JSON.parse(
    readFileSync(
      join(project, '.deskwork', 'pipelines', `${id}.json`),
      'utf-8',
    ),
  );
}

export function pipelineOverrideExists(project: string, id: string): boolean {
  return existsSync(
    join(project, '.deskwork', 'pipelines', `${id}.json`),
  );
}

export function readPipelineRenames(
  project: string,
  id: string,
): { pipelineId: string; renames: Array<{ from: string; to: string; at: string }> } {
  const raw = readFileSync(
    join(project, '.deskwork', 'pipelines', 'migrations', `${id}.json`),
    'utf-8',
  );
  return JSON.parse(raw) as {
    pipelineId: string;
    renames: Array<{ from: string; to: string; at: string }>;
  };
}

export function pipelineRenamesExists(project: string, id: string): boolean {
  return existsSync(
    join(project, '.deskwork', 'pipelines', 'migrations', `${id}.json`),
  );
}

export function writeLaneJson(
  project: string,
  id: string,
  payload: Record<string, unknown>,
): void {
  const dir = join(project, '.deskwork', 'lanes');
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, `${id}.json`),
    JSON.stringify(payload, null, 2),
    'utf-8',
  );
}

export function readLaneJson(
  project: string,
  id: string,
): Record<string, unknown> {
  return JSON.parse(
    readFileSync(join(project, '.deskwork', 'lanes', `${id}.json`), 'utf-8'),
  );
}

export interface SidecarOverrides {
  readonly lane?: string;
  readonly currentStage?: string;
}

export function writeSidecar(
  project: string,
  uuid: string,
  slug: string,
  opts: SidecarOverrides = {},
): void {
  writeFileSync(
    join(project, '.deskwork', 'entries', `${uuid}.json`),
    JSON.stringify({
      uuid,
      slug,
      title: slug,
      keywords: [],
      source: 'manual',
      currentStage: opts.currentStage ?? 'Drafting',
      iterationByStage: {},
      ...(opts.lane !== undefined && { lane: opts.lane }),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
    'utf-8',
  );
}
