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
import { renameSlug } from '../src/rename-slug.ts';
import { writeCalendar, readCalendar } from '../src/calendar.ts';
import { readSidecarSync } from '../src/sidecar/read.ts';
import type { DeskworkConfig } from '../src/config.ts';

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
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

function seed(slug: string, artifactPath: string): void {
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

    renameSlug({ projectRoot: root, config: config(), site: 'main', oldSlug: 'old-post', newSlug: 'new-post' });

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

    renameSlug({ projectRoot: root, config: config(), site: 'main', oldSlug: 'old-flat', newSlug: 'new-flat' });

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

    renameSlug({ projectRoot: root, config: config(), site: 'main', oldSlug: 'blog', newSlug: 'notes' });

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
      renameSlug({ projectRoot: root, config: config(), site: 'main', oldSlug: 'no-sidecar', newSlug: 'renamed' }),
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
      renameSlug({ projectRoot: root, config: config(), site: 'main', oldSlug: 'corrupt', newSlug: 'renamed' }),
    ).toThrow(/invalid/i);
    expect(() =>
      renameSlug({ projectRoot: root, config: config(), site: 'main', oldSlug: 'corrupt', newSlug: 'renamed' }),
    ).not.toThrow(/no sidecar on disk/);
  });
});
