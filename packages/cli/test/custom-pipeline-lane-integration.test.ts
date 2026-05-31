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
 *   4. Create two entries via `deskwork add --lane <id> --stage <s>` so
 *      the entry-creation path (calendar mutation + sidecar minting via
 *      `createFreshEntrySidecar`) is genuinely exercised — not a
 *      hand-rolled sidecar shape.
 *   5. Archive the lane — sidecars persist untouched.
 *   6. Restore the lane — sidecars persist untouched.
 *   7. Hard-delete (`lane purge`) is refused while entries reference the
 *      lane.
 *   8. State-intact: post-cycle sidecar JSON is byte-equivalent to the
 *      bytes captured immediately after `deskwork add`.
 *
 * No mocking — every CLI invocation is a real subprocess. The test
 * exercises the full surface implicated by Phase 6 Task 6.6's acceptance
 * criteria (CRUD CLI works end-to-end, soft-archive default, hard-delete
 * refusal when referenced) including the real entry-creation path.
 *
 * AUDIT-20260530-83 (cross-model: AUDIT-BARRAGE-claude-P6-3): prior to
 * Task 0.58, step 4 hand-wrote sidecar JSON via a local helper, which
 * made the byte-equivalence assertion in step 8 close to tautological —
 * lane operations never touch sidecars, so "bytes unchanged" would
 * hold even if entry binding were completely broken. Driving entry
 * creation through `deskwork add` closes that gap: the sidecar shape
 * comes from the real production path, and the byte-equivalence claim
 * has teeth because it asserts the lane-lifecycle ops don't perturb
 * sidecars produced by the canonical creation flow.
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
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
import { join } from 'node:path';
import {
  assertDeskworkBinPresent,
  deskworkBin,
} from './util/assert-deskwork-bin.ts';

interface RunResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
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

/**
 * Per-invocation timeout for every CLI subprocess in this file.
 *
 * AUDIT-20260530-84 (cross-model: AUDIT-BARRAGE-claude-P6-3): without an
 * explicit `timeout` on `spawnSync`, a hung CLI invocation blocks the
 * test until vitest's global timeout fires — which produces a useless
 * "test timed out" diagnostic with no indication of which subprocess
 * hung. Capping each subprocess at 30s gives the test a chance to fail
 * with a verb-named error message naming the offending args.
 */
const SUBPROCESS_TIMEOUT_MS = 30_000;

/**
 * Wrap `spawnSync` with a timeout + SIGTERM check. When `timeout`
 * elapses, Node sends SIGTERM and surfaces `r.signal === 'SIGTERM'`;
 * `r.status` is `null` in that case. Without this check the caller
 * would see `code: -1` (from `r.status ?? -1`) with no indication that
 * the cause was a timeout vs. a normal non-zero exit.
 */
function runDeskworkSubcommand(
  verb: string,
  argsAfterProject: readonly string[],
  project: string,
): RunResult {
  const fullArgs = [verb, project, ...argsAfterProject];
  const r = spawnSync(
    deskworkBin,
    fullArgs,
    { encoding: 'utf-8', timeout: SUBPROCESS_TIMEOUT_MS },
  );
  if (r.signal === 'SIGTERM') {
    throw new Error(
      `deskwork ${verb} subprocess timed out after ${SUBPROCESS_TIMEOUT_MS}ms (args: ${JSON.stringify(fullArgs)})`,
    );
  }
  return {
    code: r.status ?? -1,
    stdout: r.stdout ?? '',
    stderr: r.stderr ?? '',
  };
}

function pipeline(project: string, ...args: string[]): RunResult {
  return runDeskworkSubcommand('pipeline', args, project);
}

function lane(project: string, ...args: string[]): RunResult {
  return runDeskworkSubcommand('lane', args, project);
}

function addEntry(project: string, ...args: string[]): RunResult {
  return runDeskworkSubcommand('add', args, project);
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

/**
 * Extract the UUID assigned to a slug by `deskwork add`. The add command
 * emits `{ slug, ... }` on stdout but does NOT echo the entry UUID
 * (calendar.md is the authoritative join from slug → UUID). We parse
 * calendar.md's table row for the slug and pull the UUID column out —
 * same shape as `add-lane-stage-integration.test.ts`'s helper.
 */
function uuidForSlug(project: string, slug: string): string {
  const calendarRaw = readFileSync(
    join(project, '.deskwork', 'calendar.md'),
    'utf-8',
  );
  const m = calendarRaw.match(
    new RegExp(`\\| ([0-9a-f-]{36}) \\| ${slug.replace(/[\/.]/g, '\\$&')} \\|`),
  );
  if (m === null) {
    throw new Error(
      `could not find UUID for slug "${slug}" in calendar.md`,
    );
  }
  return m[1];
}

interface AddedEntry {
  readonly slug: string;
  readonly uuid: string;
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

    // 4. Create two entries via `deskwork add` bound to the lane at a
    //    non-locked, non-terminal stage of the custom pipeline. Driving
    //    `add` (rather than hand-writing a sidecar) exercises the real
    //    creation path — calendar mutation + sidecar minting via
    //    `createFreshEntrySidecar` — so the byte-equivalence assertion
    //    in step 8 has teeth (the sidecar shape is the production
    //    shape, not a test-author-invented shape that would pass even
    //    if entry binding were broken).
    const slugs = ['first-post', 'second-post'] as const;
    const entries: AddedEntry[] = [];
    const sidecarPreBytes = new Map<string, string>();
    for (const slug of slugs) {
      const added = addEntry(
        project,
        '--lane', 'blog-lane',
        '--stage', 'Drafting',
        '--slug', slug,
        slug,
      );
      expect(added.stderr).toBe('');
      expect(added.code).toBe(0);
      const uuid = uuidForSlug(project, slug);
      const path = sidecarPath(project, uuid);
      expect(existsSync(path)).toBe(true);
      sidecarPreBytes.set(uuid, readFileSync(path, 'utf-8'));
      entries.push({ slug, uuid });

      // Sanity-check the sidecar shape produced by the real add path so
      // step 8's byte-equivalence claim is anchored to a known-good
      // baseline (lane bound, stage bound, source manual).
      const sidecar = JSON.parse(
        readFileSync(path, 'utf-8'),
      ) as Record<string, unknown>;
      expect(sidecar['uuid']).toBe(uuid);
      expect(sidecar['slug']).toBe(slug);
      expect(sidecar['lane']).toBe('blog-lane');
      expect(sidecar['currentStage']).toBe('Drafting');
      expect(sidecar['source']).toBe('manual');
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

    for (const entry of entries) {
      expect(existsSync(sidecarPath(project, entry.uuid))).toBe(true);
      const post = readFileSync(sidecarPath(project, entry.uuid), 'utf-8');
      expect(post).toBe(sidecarPreBytes.get(entry.uuid));
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

    for (const entry of entries) {
      expect(existsSync(sidecarPath(project, entry.uuid))).toBe(true);
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
    //    by the full archive → restore → refused-purge cycle. The
    //    pre-cycle bytes were captured immediately after `deskwork add`
    //    in step 4, so the claim is "lane-lifecycle ops do not perturb
    //    sidecars produced by the canonical creation path" — not the
    //    weaker tautology that held when sidecars were hand-rolled.
    for (const entry of entries) {
      const finalBytes = readFileSync(sidecarPath(project, entry.uuid), 'utf-8');
      expect(finalBytes).toBe(sidecarPreBytes.get(entry.uuid));

      const finalParsed = JSON.parse(finalBytes) as Record<string, unknown>;
      expect(finalParsed['uuid']).toBe(entry.uuid);
      expect(finalParsed['slug']).toBe(entry.slug);
      expect(finalParsed['currentStage']).toBe('Drafting');
      expect(finalParsed['lane']).toBe('blog-lane');
    }
  });
});
