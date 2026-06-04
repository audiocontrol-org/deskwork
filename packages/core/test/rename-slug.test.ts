/**
 * Phase 39c-2b(a) — `renameSlug` derives the new path by detecting the
 * layout from the entry's stored `artifactPath` (spec AUDIT-36), not via
 * the slug-template `resolveBlogPostDir`. No naive slug-substring
 * replacement.
 *
 *   - `…/<slug>/index.<ext>`  → index layout  → move the per-post DIR
 *   - `…/<slug>/README.<ext>` → readme layout → move the per-post DIR
 *   - `…/<slug>.<ext>`        → flat layout   → move the FILE
 *
 * In every case the entry's sidecar `artifactPath` is rewritten to the
 * new location, and the calendar entry's slug is updated. UUID identity
 * is preserved.
 *
 * Phase 39c (c4 — spec Decision #23): the 301 `_redirects` append no
 * longer reads `SiteConfig.redirectsPath`. `redirectsPath` re-homed onto
 * the lane (`LaneConfig.redirectsPath`, sibling of `host`). renameSlug
 * resolves the renamed entry's lane (`sidecar.lane`) and reads
 * `lane.redirectsPath`. No lane / no redirectsPath → the redirect-append
 * step is skipped (optional website metadata, NOT an error).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  readFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renameSlug, buildRedirectBlock } from '../src/rename-slug.ts';
import { writeCalendar, readCalendar } from '../src/calendar.ts';
import { readSidecarSync } from '../src/sidecar/read.ts';
import type { DeskworkConfig } from '../src/config.ts';
import type { LaneConfig } from '../src/lanes/types.ts';

function config(): DeskworkConfig {
  return {
    version: 1,
    sites: { main: { contentDir: 'docs', calendarPath: '.deskwork/calendar.md' } },
    defaultSite: 'main',
  };
}

let root: string;
const UUID = '44444444-4444-4444-4444-444444444444';

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'dw-rename-'));
  mkdirSync(join(root, '.deskwork', 'entries'), { recursive: true });
  mkdirSync(join(root, '.deskwork', 'lanes'), { recursive: true });
  // Minimal editorial pipeline template so loadLaneConfig's pipeline
  // cross-validation resolves for the on-disk lane fixtures below.
  mkdirSync(join(root, '.deskwork', 'pipelines'), { recursive: true });
  writeFileSync(
    join(root, '.deskwork', 'pipelines', 'editorial.json'),
    JSON.stringify({
      id: 'editorial',
      name: 'Editorial',
      description: 'Editorial pipeline',
      linearStages: ['Ideas', 'Planned', 'Outlining', 'Drafting', 'Final', 'Published'],
      offPipelineStages: ['Blocked', 'Cancelled'],
    }),
    'utf-8',
  );
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

/**
 * Write a lane config to disk so `loadLaneConfig(id, root)` resolves.
 * `id` defaults to `main`; pass `redirectsPath` to exercise the redirect
 * step.
 */
function seedLane(id: string, overrides: Partial<LaneConfig> = {}): void {
  const lane: LaneConfig = {
    id,
    name: id,
    pipelineTemplate: 'editorial',
    ...overrides,
  };
  writeFileSync(
    join(root, '.deskwork', 'lanes', `${id}.json`),
    JSON.stringify(lane),
    'utf-8',
  );
}

function seed(slug: string, artifactPath: string, lane?: string): void {
  writeCalendar(join(root, '.deskwork', 'calendar.md'), {
    entries: [
      {
        id: UUID,
        slug,
        title: slug,
        description: '',
        stage: 'Drafting',
        targetKeywords: [],
        source: 'manual',
      },
    ],
    distributions: [],
  });
  writeFileSync(
    join(root, '.deskwork', 'entries', `${UUID}.json`),
    JSON.stringify({
      uuid: UUID,
      slug,
      title: slug,
      keywords: [],
      source: 'manual',
      currentStage: 'Drafting',
      iterationByStage: {},
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      artifactPath,
      ...(lane !== undefined ? { lane } : {}),
    }),
    'utf-8',
  );
}

describe('renameSlug — 39c-2b(a) artifactPath layout detection (AUDIT-36)', () => {
  it('index layout: moves the per-post dir and rewrites artifactPath', () => {
    seed('old-post', 'docs/old-post/index.md');
    mkdirSync(join(root, 'docs', 'old-post'), { recursive: true });
    writeFileSync(join(root, 'docs/old-post/index.md'), '# Body\n', 'utf-8');
    writeFileSync(join(root, 'docs/old-post/cover.png'), 'x', 'utf-8');

    renameSlug({ projectRoot: root, config: config(), oldSlug: 'old-post', newSlug: 'new-post' });

    expect(existsSync(join(root, 'docs/old-post'))).toBe(false);
    expect(existsSync(join(root, 'docs/new-post/index.md'))).toBe(true);
    // Co-located assets travel with the dir.
    expect(existsSync(join(root, 'docs/new-post/cover.png'))).toBe(true);
    expect(readSidecarSync(root, UUID).artifactPath).toBe('docs/new-post/index.md');
    expect(readCalendar(join(root, '.deskwork', 'calendar.md')).entries[0].slug).toBe('new-post');
  });

  it('flat layout: moves the file and rewrites artifactPath', () => {
    seed('old-flat', 'docs/old-flat.md');
    mkdirSync(join(root, 'docs'), { recursive: true });
    writeFileSync(join(root, 'docs', 'old-flat.md'), '# Flat\n', 'utf-8');

    renameSlug({ projectRoot: root, config: config(), oldSlug: 'old-flat', newSlug: 'new-flat' });

    expect(existsSync(join(root, 'docs/old-flat.md'))).toBe(false);
    expect(existsSync(join(root, 'docs/new-flat.md'))).toBe(true);
    expect(readSidecarSync(root, UUID).artifactPath).toBe('docs/new-flat.md');
  });

  it('does NOT naively substring-replace a slug that recurs in the path', () => {
    // base dir literally contains the slug token; only the slug segment
    // must change, not the directory name.
    seed('blog', 'content/blog/blog/index.md');
    mkdirSync(join(root, 'content/blog/blog'), { recursive: true });
    writeFileSync(join(root, 'content/blog/blog/index.md'), '# B\n', 'utf-8');

    renameSlug({ projectRoot: root, config: config(), oldSlug: 'blog', newSlug: 'notes' });

    expect(readSidecarSync(root, UUID).artifactPath).toBe('content/blog/notes/index.md');
    expect(existsSync(join(root, 'content/blog/notes/index.md'))).toBe(true);
  });

  it('throws doctor --fix guidance (not a raw ENOENT) when the entry has a calendar row but no sidecar (AUDIT-20260604-02)', () => {
    // Calendar row only — no sidecar file written. renameSlug must surface
    // the same actionable doctor --fix guidance it gives for every other
    // drift case, not a raw `sidecar not found` ENOENT from readSidecarSync.
    writeCalendar(join(root, '.deskwork', 'calendar.md'), {
      entries: [
        {
          id: UUID,
          slug: 'no-sidecar',
          title: 'No Sidecar',
          description: '',
          stage: 'Drafting',
          targetKeywords: [],
          source: 'manual',
        },
      ],
      distributions: [],
    });

    expect(() =>
      renameSlug({ projectRoot: root, config: config(), oldSlug: 'no-sidecar', newSlug: 'renamed' }),
    ).toThrow(/doctor --fix/);
  });

  it('propagates the corrupt-sidecar diagnosis instead of misreporting it as "no sidecar" (AUDIT-20260604-05)', () => {
    // Sidecar file EXISTS but is invalid JSON. A bare catch would flatten
    // this into the "no sidecar on disk" message, sending the operator to
    // the wrong remedy. The corrupt-content diagnosis must survive.
    writeCalendar(join(root, '.deskwork', 'calendar.md'), {
      entries: [
        {
          id: UUID,
          slug: 'corrupt',
          title: 'Corrupt',
          description: '',
          stage: 'Drafting',
          targetKeywords: [],
          source: 'manual',
        },
      ],
      distributions: [],
    });
    writeFileSync(join(root, '.deskwork', 'entries', `${UUID}.json`), '{ not valid json', 'utf-8');

    expect(() =>
      renameSlug({ projectRoot: root, config: config(), oldSlug: 'corrupt', newSlug: 'renamed' }),
    ).toThrow(/invalid/i);
    expect(() =>
      renameSlug({ projectRoot: root, config: config(), oldSlug: 'corrupt', newSlug: 'renamed' }),
    ).not.toThrow(/no sidecar on disk/);
  });
});

describe('renameSlug — 39c c4 lane.redirectsPath (spec Decision #23)', () => {
  it('appends the 301 block to the file named by the entry lane\'s redirectsPath', () => {
    seed('old-post', 'docs/old-post/index.md', 'main');
    seedLane('main', { redirectsPath: 'public/_redirects' });
    mkdirSync(join(root, 'docs', 'old-post'), { recursive: true });
    writeFileSync(join(root, 'docs/old-post/index.md'), '# Body\n', 'utf-8');
    // The _redirects publish dir exists (Netlify deploy dir); the file
    // itself may or may not — renameSlug creates it when absent, appends
    // when present.
    mkdirSync(join(root, 'public'), { recursive: true });

    const result = renameSlug({
      projectRoot: root,
      config: config(),
      oldSlug: 'old-post',
      newSlug: 'new-post',
    });

    // The redirect-append action is planned…
    expect(result.actions.some((a) => a.kind === 'redirect-append')).toBe(true);
    // …and the file contains the exact 301 block the helper builds.
    const redirectsFile = join(root, 'public', '_redirects');
    expect(existsSync(redirectsFile)).toBe(true);
    const block = buildRedirectBlock('old-post', 'new-post');
    expect(readFileSync(redirectsFile, 'utf-8')).toContain(block);
  });

  it('skips the redirect step when the entry lane has no redirectsPath', () => {
    seed('old-post', 'docs/old-post/index.md', 'main');
    seedLane('main'); // lane exists but carries no redirectsPath
    mkdirSync(join(root, 'docs', 'old-post'), { recursive: true });
    writeFileSync(join(root, 'docs/old-post/index.md'), '# Body\n', 'utf-8');

    const result = renameSlug({
      projectRoot: root,
      config: config(),
      oldSlug: 'old-post',
      newSlug: 'new-post',
    });

    // No redirect-append action, no _redirects file written anywhere.
    expect(result.actions.some((a) => a.kind === 'redirect-append')).toBe(false);
    expect(existsSync(join(root, 'public', '_redirects'))).toBe(false);
    expect(existsSync(join(root, '_redirects'))).toBe(false);
  });

  it('skips the redirect step when the entry has no lane', () => {
    seed('old-post', 'docs/old-post/index.md'); // no lane on the sidecar
    mkdirSync(join(root, 'docs', 'old-post'), { recursive: true });
    writeFileSync(join(root, 'docs/old-post/index.md'), '# Body\n', 'utf-8');

    const result = renameSlug({
      projectRoot: root,
      config: config(),
      oldSlug: 'old-post',
      newSlug: 'new-post',
    });

    expect(result.actions.some((a) => a.kind === 'redirect-append')).toBe(false);
    expect(existsSync(join(root, '_redirects'))).toBe(false);
  });

  // AUDIT-20260604-08 (HIGH, cross-model) + AUDIT-20260604-09: a sidecar
  // naming a lane whose config is ABSENT (archived / purged / legacy-stale)
  // must NOT crash the rename. The redirect append is optional website
  // metadata; an unresolvable lane skips it. And the rename must COMPLETE
  // (artifact moved, calendar slug updated) — never a partial-apply where
  // a post-mutation lane-resolution throw leaves disk + calendar changed
  // but the command errored.
  it('completes the rename and skips redirects when the sidecar names a lane with no config on disk (archived/purged)', () => {
    seed('old-post', 'docs/old-post/index.md', 'ghost'); // lane 'ghost' has no lanes/ghost.json
    mkdirSync(join(root, 'docs', 'old-post'), { recursive: true });
    writeFileSync(join(root, 'docs/old-post/index.md'), '# Body\n', 'utf-8');

    const result = renameSlug({
      projectRoot: root,
      config: config(),
      oldSlug: 'old-post',
      newSlug: 'new-post',
    });

    // Rename succeeded end-to-end.
    expect(existsSync(join(root, 'docs/old-post/index.md'))).toBe(false);
    expect(existsSync(join(root, 'docs/new-post/index.md'))).toBe(true);
    expect(readSidecarSync(root, UUID).artifactPath).toBe('docs/new-post/index.md');
    const cal = readCalendar(join(root, '.deskwork', 'calendar.md'));
    expect(cal.entries.find((e) => e.id === UUID)?.slug).toBe('new-post');
    // Redirect step skipped (no lane config to read redirectsPath from).
    expect(result.actions.some((a) => a.kind === 'redirect-append')).toBe(false);
    expect(existsSync(join(root, '_redirects'))).toBe(false);
  });

  // AUDIT-20260604-08: a sidecar naming a lane whose config is PRESENT but
  // CORRUPT is operator-actionable — renameSlug may throw, but it must do
  // so BEFORE any filesystem/calendar mutation (no partial-apply). The
  // throw happens at lane-resolution, which now runs before step 1.
  it('throws on a present-but-corrupt lane config WITHOUT mutating disk or calendar', () => {
    seed('old-post', 'docs/old-post/index.md', 'broken');
    mkdirSync(join(root, 'docs', 'old-post'), { recursive: true });
    writeFileSync(join(root, 'docs/old-post/index.md'), '# Body\n', 'utf-8');
    writeFileSync(join(root, '.deskwork', 'lanes', 'broken.json'), '{ not valid json', 'utf-8');

    expect(() =>
      renameSlug({ projectRoot: root, config: config(), oldSlug: 'old-post', newSlug: 'new-post' }),
    ).toThrow();
    // No partial-apply: the artifact and calendar are untouched.
    expect(existsSync(join(root, 'docs/old-post/index.md'))).toBe(true);
    expect(existsSync(join(root, 'docs/new-post/index.md'))).toBe(false);
    const cal = readCalendar(join(root, '.deskwork', 'calendar.md'));
    expect(cal.entries.find((e) => e.id === UUID)?.slug).toBe('old-post');
  });
});
