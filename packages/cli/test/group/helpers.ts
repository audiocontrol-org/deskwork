/**
 * Shared test helpers for the `deskwork group` CLI tests.
 *
 * Phase 7 Task 7.2 (graphical-entries). Co-located with the per-verb
 * test files under `test/group/`. The tmp-fixture project + lane JSON
 * writer + sidecar writer + subprocess runner are factored here so
 * each per-verb test file stays focused on one verb's behavior.
 *
 * The fixture intentionally creates a real lane config + the
 * editorial pipeline preset (resolves via the @deskwork/core
 * pipelines loader) so the group operations exercise the full
 * lane-template path. No mocks.
 */

import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  assertDeskworkBinPresent,
  deskworkBin,
} from '../util/assert-deskwork-bin.ts';

export { assertDeskworkBinPresent, deskworkBin };

export interface RunResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

/**
 * Tmp project root with a `default` lane bound to the editorial
 * preset. The default lane's contentDir is `docs/`; suitable for
 * tests that don't need a second lane.
 */
export function makeProject(): string {
  const project = mkdtempSync(join(tmpdir(), 'dw-group-'));
  mkdirSync(join(project, '.deskwork', 'entries'), { recursive: true });
  mkdirSync(join(project, '.deskwork', 'lanes'), { recursive: true });
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
  writeFileSync(
    join(project, '.deskwork', 'lanes', 'default.json'),
    JSON.stringify({
      id: 'default',
      name: 'Default',
      pipelineTemplate: 'editorial',
      contentDir: 'docs',
    }),
    'utf-8',
  );
  return project;
}

export function destroyProject(project: string): void {
  rmSync(project, { recursive: true, force: true });
}

/**
 * Write a second lane with a custom name. Useful for cross-lane
 * membership tests. Defaults to the editorial preset; pass a
 * `pipelineTemplate` override for tests that need a different
 * stage vocabulary. Pass `archivedAt` to write a lane marked as
 * archived.
 */
export function addLane(
  project: string,
  id: string,
  opts: {
    name?: string;
    pipelineTemplate?: string;
    contentDir?: string;
    archivedAt?: string;
  } = {},
): void {
  writeFileSync(
    join(project, '.deskwork', 'lanes', `${id}.json`),
    JSON.stringify({
      id,
      name: opts.name ?? id,
      pipelineTemplate: opts.pipelineTemplate ?? 'editorial',
      contentDir: opts.contentDir ?? `docs-${id}`,
      ...(opts.archivedAt !== undefined && { archivedAt: opts.archivedAt }),
    }),
    'utf-8',
  );
}

export function group(project: string, ...args: string[]): RunResult {
  const r = spawnSync(
    deskworkBin,
    ['group', project, ...args],
    { encoding: 'utf-8' },
  );
  return {
    code: r.status ?? -1,
    stdout: r.stdout ?? '',
    stderr: r.stderr ?? '',
  };
}

export function cancel(project: string, ...args: string[]): RunResult {
  const r = spawnSync(
    deskworkBin,
    ['cancel', project, ...args],
    { encoding: 'utf-8' },
  );
  return {
    code: r.status ?? -1,
    stdout: r.stdout ?? '',
    stderr: r.stderr ?? '',
  };
}

export interface SidecarShape {
  readonly uuid: string;
  readonly slug: string;
  readonly title?: string;
  readonly currentStage?: string;
  readonly lane?: string;
  readonly members?: readonly string[];
  readonly artifactPath?: string;
  readonly archivedAt?: string;
}

/**
 * Write a sidecar with sensible defaults. The default `currentStage`
 * is `Ideas` so the entry sits on the linear pipeline (cancel will
 * accept it without further setup).
 */
export function writeSidecar(
  project: string,
  uuid: string,
  slug: string,
  opts: Omit<SidecarShape, 'uuid' | 'slug'> = {},
): void {
  writeFileSync(
    join(project, '.deskwork', 'entries', `${uuid}.json`),
    JSON.stringify({
      uuid,
      slug,
      title: opts.title ?? slug,
      keywords: [],
      source: 'manual',
      currentStage: opts.currentStage ?? 'Ideas',
      iterationByStage: {},
      lane: opts.lane ?? 'default',
      ...(opts.members !== undefined && { members: opts.members }),
      ...(opts.artifactPath !== undefined && { artifactPath: opts.artifactPath }),
      ...(opts.archivedAt !== undefined && { archivedAt: opts.archivedAt }),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
    'utf-8',
  );
}

export function readSidecar(
  project: string,
  uuid: string,
): Record<string, unknown> {
  return JSON.parse(
    readFileSync(join(project, '.deskwork', 'entries', `${uuid}.json`), 'utf-8'),
  );
}

export function listJournalEvents(
  project: string,
): Array<Record<string, unknown>> {
  const dir = join(project, '.deskwork', 'review-journal', 'history');
  if (!existsSync(dir)) return [];
  return readdirSync(dir).map((name) =>
    JSON.parse(readFileSync(join(dir, name), 'utf-8')),
  );
}

/**
 * Convenience: enumerate the sidecar UUIDs in the project. Useful
 * for `create` tests that need to find the freshly-written sidecar
 * without knowing the generated UUID up front.
 */
export function listSidecarUuids(project: string): string[] {
  const dir = join(project, '.deskwork', 'entries');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.slice(0, -'.json'.length));
}
