/**
 * Shared test helpers for the `deskwork lane` CLI tests.
 *
 * Phase 6 Task 6.1 (graphical-entries). Co-located with the
 * per-verb test files under `test/lane/`. The wider helper surface
 * (tmp-fixture project, lane JSON writer, sidecar writer, subprocess
 * runner) lives here so each per-verb test file stays focused on one
 * verb's behavior.
 */

import { spawnSync } from 'node:child_process';
import {
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

export interface RunResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

export function makeProject(): string {
  const project = mkdtempSync(join(tmpdir(), 'dw-lane-'));
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

export function lane(project: string, ...args: string[]): RunResult {
  const r = spawnSync(
    deskworkBin,
    ['lane', project, ...args],
    { encoding: 'utf-8' },
  );
  return {
    code: r.status ?? -1,
    stdout: r.stdout ?? '',
    stderr: r.stderr ?? '',
  };
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

export function writeVisualPipeline(project: string): void {
  const dir = join(project, '.deskwork', 'pipelines');
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, 'visual.json'),
    JSON.stringify(
      {
        id: 'visual',
        name: 'Visual',
        description: 'Visual lane pipeline',
        linearStages: ['Sketch', 'Refine', 'Final', 'Published'],
        offPipelineStages: ['Blocked', 'Cancelled'],
      },
      null,
      2,
    ),
    'utf-8',
  );
}

export interface SidecarOverrides {
  readonly lane?: string;
  readonly currentStage?: string;
  readonly artifactPath?: string;
  readonly iterationByStage?: Record<string, number>;
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
      iterationByStage: opts.iterationByStage ?? {},
      ...(opts.lane !== undefined && { lane: opts.lane }),
      ...(opts.artifactPath !== undefined && { artifactPath: opts.artifactPath }),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
    'utf-8',
  );
}

export function readSidecarJson(
  project: string,
  uuid: string,
): Record<string, unknown> {
  return JSON.parse(
    readFileSync(join(project, '.deskwork', 'entries', `${uuid}.json`), 'utf-8'),
  );
}
