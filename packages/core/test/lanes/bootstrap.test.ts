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
    expect(result.lane.contentDir).toBe('src/content/blog');
  });

  it('writes a lane file that the loader can read back', async () => {
    writeConfig(projectRoot, {
      version: 1,
      sites: { only: { contentDir: 'docs', calendarPath: 'docs/cal.md' } },
      defaultSite: 'only',
    });

    await bootstrapDefaultLaneIfMissing(projectRoot);

    const lane = loadLaneConfig('default', projectRoot);
    expect(lane.contentDir).toBe('docs');
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
    const details = event.details as Record<string, string>;
    expect(details.legacySiteId).toBe('legacysite');
    expect(details.contentDir).toBe('content');
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
    expect(lane.contentDir).toBe('src/content/posts');
    expect(lane.pipelineTemplate).toBe('editorial');

    // A journal event landed.
    expect(readLaneMigrationEvents(projectRoot)).toHaveLength(1);
  });
});
