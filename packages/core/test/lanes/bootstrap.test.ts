/**
 * bootstrapDefaultLaneIfMissing integration tests (Phase 3 Task 3.4).
 *
 * Tests use a fresh tmp project root for each case. The legacy
 * `sites.<defaultSite>.contentDir` is written by hand into
 * `.deskwork/config.json`; the bootstrap reads that, writes
 * `.deskwork/lanes/default.json`, and emits a journal event the test
 * confirms by walking the on-disk journal directory.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { bootstrapDefaultLaneIfMissing } from '../../src/lanes/bootstrap.ts';
import { loadLaneConfig, laneConfigPath } from '../../src/lanes/loader.ts';

function writeConfig(
  projectRoot: string,
  payload: Record<string, unknown>,
): void {
  const dir = join(projectRoot, '.deskwork');
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, 'config.json'),
    JSON.stringify(payload, null, 2),
    'utf8',
  );
}

function readLaneMigrationEvents(projectRoot: string): unknown[] {
  const dir = join(projectRoot, '.deskwork', 'review-journal', 'history');
  if (!existsSync(dir)) return [];
  const events: unknown[] = [];
  for (const name of readdirSync(dir)) {
    if (!name.endsWith('.json')) continue;
    const raw = readFileSync(join(dir, name), 'utf8');
    const parsed: unknown = JSON.parse(raw);
    if (
      parsed
      && typeof parsed === 'object'
      && (parsed as { kind?: unknown }).kind === 'lane-migration'
    ) {
      events.push(parsed);
    }
  }
  return events;
}

describe('bootstrapDefaultLaneIfMissing', () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), 'deskwork-lanes-bootstrap-'));
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
  });

  it('creates .deskwork/lanes/default.json from the legacy sites block', async () => {
    writeConfig(projectRoot, {
      version: 1,
      sites: {
        primary: {
          contentDir: 'src/content/blog',
          calendarPath: 'docs/calendar.md',
        },
      },
      defaultSite: 'primary',
    });

    const result = await bootstrapDefaultLaneIfMissing(projectRoot);

    expect(result.created).toBe(true);
    if (!result.created) throw new Error('result.created should be true');
    expect(result.path).toBe(laneConfigPath(projectRoot, 'default'));
    expect(result.lane.id).toBe('default');
    expect(result.lane.name).toBe('Default');
    expect(result.lane.pipelineTemplate).toBe('editorial');
    // Phase 39: a lane carries no contentDir — the legacy site's dir
    // becomes the lane's add-time scaffoldDefaults.markdown.
    expect(result.lane.scaffoldDefaults).toEqual({ markdown: 'src/content/blog' });
  });

  it('writes a lane file that the loader can read back', async () => {
    writeConfig(projectRoot, {
      version: 1,
      sites: { only: { contentDir: 'docs', calendarPath: 'docs/cal.md' } },
      defaultSite: 'only',
    });

    await bootstrapDefaultLaneIfMissing(projectRoot);

    const lane = loadLaneConfig('default', projectRoot);
    expect(lane.scaffoldDefaults).toEqual({ markdown: 'docs' });
    expect(lane.pipelineTemplate).toBe('editorial');
  });

  it('emits a lane-migration journal event identifying the legacy site', async () => {
    writeConfig(projectRoot, {
      version: 1,
      sites: {
        legacysite: {
          contentDir: 'content',
          calendarPath: 'content/cal.md',
        },
      },
      defaultSite: 'legacysite',
    });

    await bootstrapDefaultLaneIfMissing(projectRoot);

    const events = readLaneMigrationEvents(projectRoot);
    expect(events).toHaveLength(1);
    const event = events[0] as Record<string, unknown>;
    expect(event.kind).toBe('lane-migration');
    expect(event.migration).toBe('default-lane-from-legacy-site');
    expect(event.source).toBe('sites.legacysite');
    expect(event.target).toBe('lanes.default');
    const details = event.details as Record<string, unknown>;
    expect(details.legacySiteId).toBe('legacysite');
    // Phase 39: new lane-migration events emit scaffoldDefaults, not a
    // top-level contentDir detail key.
    expect(details.scaffoldDefaults).toEqual({ markdown: 'content' });
    expect(details.pipelineTemplate).toBe('editorial');
  });

  it('is idempotent: a second call with the lane already present returns "already-exists" without side effects', async () => {
    writeConfig(projectRoot, {
      version: 1,
      sites: { primary: { contentDir: 'docs', calendarPath: 'docs/cal.md' } },
      defaultSite: 'primary',
    });

    const first = await bootstrapDefaultLaneIfMissing(projectRoot);
    expect(first.created).toBe(true);
    const eventsAfterFirst = readLaneMigrationEvents(projectRoot);
    expect(eventsAfterFirst).toHaveLength(1);

    const second = await bootstrapDefaultLaneIfMissing(projectRoot);
    expect(second.created).toBe(false);
    if (second.created) throw new Error('second.created should be false');
    expect(second.reason).toBe('already-exists');
    // No additional journal event written on the second call.
    const eventsAfterSecond = readLaneMigrationEvents(projectRoot);
    expect(eventsAfterSecond).toHaveLength(1);
  });

  it('returns "no-config" when the project has no .deskwork/config.json (does NOT throw)', async () => {
    // No config written for this projectRoot.
    const result = await bootstrapDefaultLaneIfMissing(projectRoot);
    expect(result.created).toBe(false);
    if (result.created) throw new Error('result.created should be false');
    expect(result.reason).toBe('no-config');
    // No lane file written.
    expect(existsSync(laneConfigPath(projectRoot, 'default'))).toBe(false);
  });

  /**
   * AUDIT-20260530-10 regression: the docblock pre-fix said "no
   * readable config → no-config", but the code only guarded
   * existsSync — a CORRUPT config made readConfig throw. The fix
   * locks the corrupt-config-throws contract by clarifying the doc
   * (says "absent", adds @throws note) and this test asserts the
   * loud failure mode survives any future re-wording of the
   * function.
   */
  it('throws when .deskwork/config.json exists but is malformed JSON (AUDIT-20260530-10)', async () => {
    const dir = join(projectRoot, '.deskwork');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'config.json'), '{not-valid-json', 'utf8');

    let captured: unknown;
    try {
      await bootstrapDefaultLaneIfMissing(projectRoot);
    } catch (err) {
      captured = err;
    }
    expect(captured).toBeInstanceOf(Error);
    // The thrown error MUST come from the config-parse failure (loud,
    // actionable) — not from the bootstrap silently returning no-config.
    expect(existsSync(laneConfigPath(projectRoot, 'default'))).toBe(false);
  });

  /**
   * AUDIT-20260530-13 regression: writes default.json BEFORE
   * appending the lane-migration journal event. If journal append
   * fails after the write, the project is left with a lane file but
   * no migration audit record; next invocation returns
   * `already-exists` and never repairs the missing event.
   *
   * The fix is a compensating operation: when journal append fails,
   * unlink the just-created lane file and rethrow. The project
   * returns to its pre-bootstrap state; the next invocation tries
   * again from scratch.
   *
   * Triggering the failure: the journal-append path writes to
   * `.deskwork/review-journal/history/`. If we pre-create that path
   * as a FILE (instead of a directory), mkdir of the dir fails with
   * ENOTDIR / EEXIST and the bootstrap throws.
   */
  it('rolls back the lane file when journal append fails (AUDIT-20260530-13)', async () => {
    writeConfig(projectRoot, {
      version: 1,
      sites: { primary: { contentDir: 'docs', calendarPath: 'docs/cal.md' } },
      defaultSite: 'primary',
    });
    // Pre-create the journal path as a FILE (not directory) to make
    // mkdir of the journal directory fail. The append code first
    // `mkdir(... { recursive: true })`s its parent, which throws
    // ENOTDIR / EEXIST when the path is a non-directory file.
    const journalParent = join(projectRoot, '.deskwork', 'review-journal');
    mkdirSync(journalParent, { recursive: true });
    writeFileSync(join(journalParent, 'history'), 'not-a-dir', 'utf8');

    let captured: unknown;
    try {
      await bootstrapDefaultLaneIfMissing(projectRoot);
    } catch (err) {
      captured = err;
    }
    expect(captured).toBeInstanceOf(Error);

    // Per the fix: the lane file MUST NOT remain on disk after the
    // failed bootstrap, so a subsequent invocation can retry from
    // a clean state. Pre-fix this assertion failed — the lane file
    // was orphaned.
    expect(existsSync(laneConfigPath(projectRoot, 'default'))).toBe(false);

    // And the next invocation, with the journal-blocker removed,
    // succeeds and produces a complete bootstrap (lane file + at
    // least one lane-migration journal event).
    rmSync(join(journalParent, 'history'), { force: true });
    const second = await bootstrapDefaultLaneIfMissing(projectRoot);
    expect(second.created).toBe(true);
    expect(existsSync(laneConfigPath(projectRoot, 'default'))).toBe(true);
    expect(readLaneMigrationEvents(projectRoot)).toHaveLength(1);
  });

  it('integration smoke: pre-feature project → first invocation → default lane exists + loadable', async () => {
    // Mirrors the workplan's Task 3.5.2 acceptance criterion: a
    // pre-feature project's first invocation lands the default lane
    // and the loader resolves it cleanly.
    writeConfig(projectRoot, {
      version: 1,
      sites: {
        audiocontrol: {
          host: 'audiocontrol.org',
          contentDir: 'src/content/posts',
          calendarPath: 'docs/editorial-calendar.md',
        },
      },
      defaultSite: 'audiocontrol',
    });

    // No .deskwork/lanes/ exists yet.
    expect(existsSync(laneConfigPath(projectRoot, 'default'))).toBe(false);

    const result = await bootstrapDefaultLaneIfMissing(projectRoot);
    expect(result.created).toBe(true);

    // The lane file exists and the loader resolves it (cross-validating
    // the editorial pipeline template).
    const lane = loadLaneConfig('default', projectRoot);
    expect(lane.id).toBe('default');
    expect(lane.scaffoldDefaults).toEqual({ markdown: 'src/content/posts' });
    expect(lane.pipelineTemplate).toBe('editorial');

    // A journal event landed.
    expect(readLaneMigrationEvents(projectRoot)).toHaveLength(1);
  });
});
