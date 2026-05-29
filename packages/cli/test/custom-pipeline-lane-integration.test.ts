/**
 * End-to-end integration test for the custom-pipeline + lane lifecycle.
 *
 * Phase 6 Task 6.6 (graphical-entries). Drives the real `deskwork` CLI
 * binary via `spawnSync` against a tmp-fixture project:
 *
 *   1. Create a custom pipeline (`custom-blog`).
 *   2. Mark "Reviewed" locked + "Blocked,Cancelled" off-pipeline via
 *      mutually-exclusive `pipeline update` invocations.
 *   3. Create a lane (`blog-lane`) bound to that pipeline.
 *   4. Write two entry sidecars bound to the lane.
 *   5. Archive the lane — sidecars persist untouched.
 *   6. Restore the lane — sidecars persist untouched.
 *   7. Hard-delete (`lane purge`) is refused while entries reference the
 *      lane.
 *   8. State-intact: post-cycle sidecar JSON is byte-equivalent to the
 *      pre-cycle written bytes.
 *
 * No mocking — every CLI invocation is a real subprocess. The test
 * exercises the full surface implicated by Phase 6 Task 6.6's acceptance
 * criteria (CRUD CLI works end-to-end, soft-archive default, hard-delete
 * refusal when referenced).
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
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
const workspaceRoot = resolve(testDir, '../../..');
const deskworkBin = join(workspaceRoot, 'node_modules/.bin/deskwork');

interface RunResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

function assertDeskworkBinPresent(): void {
  if (!existsSync(deskworkBin)) {
    throw new Error(
      `deskwork binary not found at ${deskworkBin} — run npm install at the `
      + `workspace root before running the custom-pipeline-lane integration `
      + `test.`,
    );
  }
}

function makeProject(): string {
  const project = mkdtempSync(join(tmpdir(), 'dw-cpl-int-'));
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

function destroyProject(project: string): void {
  rmSync(project, { recursive: true, force: true });
}

function pipeline(project: string, ...args: string[]): RunResult {
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

function lane(project: string, ...args: string[]): RunResult {
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

function pipelinePath(project: string, id: string): string {
  return join(project, '.deskwork', 'pipelines', `${id}.json`);
}

function lanePath(project: string, id: string): string {
  return join(project, '.deskwork', 'lanes', `${id}.json`);
}

function sidecarPath(project: string, uuid: string): string {
  return join(project, '.deskwork', 'entries', `${uuid}.json`);
}

interface SidecarSeed {
  readonly uuid: string;
  readonly slug: string;
  readonly currentStage: string;
  readonly lane: string;
}

function writeSidecarFile(project: string, seed: SidecarSeed): string {
  const path = sidecarPath(project, seed.uuid);
  const now = new Date().toISOString();
  const payload = {
    uuid: seed.uuid,
    slug: seed.slug,
    title: seed.slug,
    keywords: [],
    source: 'manual',
    currentStage: seed.currentStage,
    iterationByStage: {},
    lane: seed.lane,
    createdAt: now,
    updatedAt: now,
  };
  // JSON.stringify with no indentation; the file's exact byte content is
  // what we round-trip-compare across the archive/restore cycle.
  writeFileSync(path, JSON.stringify(payload), 'utf-8');
  return path;
}

beforeAll(() => { assertDeskworkBinPresent(); });

describe('custom-pipeline + lane integration (Phase 6 Task 6.6)', () => {
  let project: string;
  beforeEach(() => { project = makeProject(); });
  afterEach(() => { destroyProject(project); });

  it('runs the full create → bind entries → archive → restore → refuse-purge cycle', () => {
    // 1. Create custom pipeline `custom-blog`.
    const created = pipeline(
      project,
      'create', 'custom-blog',
      '--shape', 'Idea,Drafting,Reviewed,Live',
      '--name', 'Custom Blog Pipeline',
      '--description', 'Test pipeline for graphical-entries Task 6.6',
    );
    expect(created.stderr).toBe('');
    expect(created.code).toBe(0);
    expect(existsSync(pipelinePath(project, 'custom-blog'))).toBe(true);

    const createdParsed = JSON.parse(created.stdout) as {
      created: boolean;
      id: string;
      linearStages: string[];
      lockedStages: string[];
      offPipelineStages: string[];
    };
    expect(createdParsed.created).toBe(true);
    expect(createdParsed.id).toBe('custom-blog');
    expect(createdParsed.linearStages).toEqual(
      ['Idea', 'Drafting', 'Reviewed', 'Live'],
    );
    expect(createdParsed.lockedStages).toEqual([]);
    expect(createdParsed.offPipelineStages).toEqual([]);

    // 2a. Mark "Reviewed" as a locked stage via `pipeline update --set-locked`.
    const locked = pipeline(
      project,
      'update', 'custom-blog',
      '--set-locked', 'Reviewed',
    );
    expect(locked.stderr).toBe('');
    expect(locked.code).toBe(0);
    const lockedParsed = JSON.parse(locked.stdout) as {
      updated: boolean;
      lockedStages: string[];
    };
    expect(lockedParsed.updated).toBe(true);
    expect(lockedParsed.lockedStages).toEqual(['Reviewed']);

    // 2b. Add off-pipeline stages via a second mutually-exclusive update.
    const offPipe = pipeline(
      project,
      'update', 'custom-blog',
      '--set-off-pipeline', 'Blocked,Cancelled',
    );
    expect(offPipe.stderr).toBe('');
    expect(offPipe.code).toBe(0);
    const offPipeParsed = JSON.parse(offPipe.stdout) as {
      updated: boolean;
      offPipelineStages: string[];
    };
    expect(offPipeParsed.updated).toBe(true);
    expect(offPipeParsed.offPipelineStages).toEqual(['Blocked', 'Cancelled']);

    // Verify the on-disk pipeline JSON reflects every mutation.
    const pipelineOnDisk = JSON.parse(
      readFileSync(pipelinePath(project, 'custom-blog'), 'utf-8'),
    ) as Record<string, unknown>;
    expect(pipelineOnDisk['id']).toBe('custom-blog');
    expect(pipelineOnDisk['name']).toBe('Custom Blog Pipeline');
    expect(pipelineOnDisk['description']).toBe(
      'Test pipeline for graphical-entries Task 6.6',
    );
    expect(pipelineOnDisk['linearStages']).toEqual(
      ['Idea', 'Drafting', 'Reviewed', 'Live'],
    );
    expect(pipelineOnDisk['lockedStages']).toEqual(['Reviewed']);
    expect(pipelineOnDisk['offPipelineStages']).toEqual(['Blocked', 'Cancelled']);

    // 3. Create a lane bound to the new pipeline.
    const laneRes = lane(
      project,
      'create', 'blog-lane',
      '--template', 'custom-blog',
      '--content-dir', 'content/blog',
      '--name', 'Blog',
    );
    expect(laneRes.stderr).toBe('');
    expect(laneRes.code).toBe(0);
    expect(existsSync(lanePath(project, 'blog-lane'))).toBe(true);

    const laneOnDisk = JSON.parse(
      readFileSync(lanePath(project, 'blog-lane'), 'utf-8'),
    ) as Record<string, unknown>;
    expect(laneOnDisk['id']).toBe('blog-lane');
    expect(laneOnDisk['name']).toBe('Blog');
    expect(laneOnDisk['pipelineTemplate']).toBe('custom-blog');
    expect(laneOnDisk['contentDir']).toBe('content/blog');

    // 4. Write two entry sidecars bound to the lane at a non-locked,
    //    non-terminal stage of the custom pipeline.
    const seeds: SidecarSeed[] = [
      {
        uuid: randomUUID(),
        slug: 'first-post',
        currentStage: 'Drafting',
        lane: 'blog-lane',
      },
      {
        uuid: randomUUID(),
        slug: 'second-post',
        currentStage: 'Drafting',
        lane: 'blog-lane',
      },
    ];
    const sidecarPreBytes = new Map<string, string>();
    for (const seed of seeds) {
      const path = writeSidecarFile(project, seed);
      expect(existsSync(path)).toBe(true);
      sidecarPreBytes.set(seed.uuid, readFileSync(path, 'utf-8'));
    }

    // 5. Archive the lane. Soft-archive: archivedAt populated; the lane
    //    JSON stays on disk; sidecars are untouched.
    const archived = lane(project, 'archive', 'blog-lane');
    expect(archived.stderr).toBe('');
    expect(archived.code).toBe(0);

    const laneAfterArchive = JSON.parse(
      readFileSync(lanePath(project, 'blog-lane'), 'utf-8'),
    ) as Record<string, unknown>;
    expect(typeof laneAfterArchive['archivedAt']).toBe('string');
    expect(String(laneAfterArchive['archivedAt'])).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    for (const seed of seeds) {
      expect(existsSync(sidecarPath(project, seed.uuid))).toBe(true);
      const post = readFileSync(sidecarPath(project, seed.uuid), 'utf-8');
      expect(post).toBe(sidecarPreBytes.get(seed.uuid));
    }

    // 6. Restore the lane. archivedAt cleared; sidecars STILL intact.
    const restored = lane(project, 'restore', 'blog-lane');
    expect(restored.stderr).toBe('');
    expect(restored.code).toBe(0);

    const laneAfterRestore = JSON.parse(
      readFileSync(lanePath(project, 'blog-lane'), 'utf-8'),
    ) as Record<string, unknown>;
    expect(laneAfterRestore['archivedAt']).toBeUndefined();
    expect(laneAfterRestore['id']).toBe('blog-lane');
    expect(laneAfterRestore['pipelineTemplate']).toBe('custom-blog');

    for (const seed of seeds) {
      expect(existsSync(sidecarPath(project, seed.uuid))).toBe(true);
    }

    // 7. Hard-delete (`lane purge`) is refused while entries reference the
    //    lane. The error message MUST name the bound entries; the lane
    //    JSON MUST remain on disk; sidecars MUST remain untouched.
    const purgeRefused = lane(project, 'purge', 'blog-lane');
    expect(purgeRefused.code).not.toBe(0);
    // Dependent-slug ordering reflects `readAllSidecars`' filesystem
    // walk order — not stable across runs. Assert both slugs appear
    // without committing to an order.
    expect(purgeRefused.stderr).toMatch(/2 entries reference it/);
    expect(purgeRefused.stderr).toContain('first-post');
    expect(purgeRefused.stderr).toContain('second-post');
    expect(existsSync(lanePath(project, 'blog-lane'))).toBe(true);

    // 8. State-intact verification: every sidecar's bytes are unchanged
    //    by the full archive → restore → refused-purge cycle.
    for (const seed of seeds) {
      const finalBytes = readFileSync(sidecarPath(project, seed.uuid), 'utf-8');
      expect(finalBytes).toBe(sidecarPreBytes.get(seed.uuid));

      const finalParsed = JSON.parse(finalBytes) as Record<string, unknown>;
      expect(finalParsed['uuid']).toBe(seed.uuid);
      expect(finalParsed['slug']).toBe(seed.slug);
      expect(finalParsed['currentStage']).toBe('Drafting');
      expect(finalParsed['lane']).toBe('blog-lane');
    }
  });
});
