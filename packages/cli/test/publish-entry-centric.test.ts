/**
 * Regression test for #150: deskwork CLI publish must dispatch
 * entry-centric (longform) publishes to `publishEntry`, not the legacy
 * calendar-mutation path which writes calendar.md without updating the
 * sidecar.
 *
 * Mirrors the dispatcher split shipped for `iterate.ts` (Phase 30) and
 * `approve.ts` (#147).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  mkdirSync,
  readFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const testDir = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(testDir, '../../..');
const deskworkBin = join(workspaceRoot, 'node_modules/.bin/deskwork');

let project: string;

beforeEach(() => {
  project = mkdtempSync(join(tmpdir(), 'dw-publish-entry-'));
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
});

afterEach(() => {
  rmSync(project, { recursive: true, force: true });
});

function writeSidecar(
  uuid: string,
  slug: string,
  currentStage: string,
  extras: Record<string, unknown> = {},
): void {
  writeFileSync(
    join(project, '.deskwork', 'entries', `${uuid}.json`),
    JSON.stringify({
      uuid,
      slug,
      title: slug,
      keywords: [],
      source: 'manual',
      currentStage,
      iterationByStage: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...extras,
    }),
    'utf-8',
  );
}

function readSidecar(uuid: string): { currentStage: string; datePublished?: string } {
  return JSON.parse(
    readFileSync(join(project, '.deskwork', 'entries', `${uuid}.json`), 'utf-8'),
  );
}

function publish(slug: string, ...flags: string[]): { code: number; stdout: string; stderr: string } {
  const r = spawnSync(deskworkBin, ['publish', project, ...flags, slug], {
    encoding: 'utf-8',
  });
  return { code: r.status ?? -1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

describe('deskwork publish — entry-centric dispatcher (#150)', () => {
  it('publishes a Final entry: sidecar updated, calendar regenerated, no crash', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440100';
    const slug = 'final-entry';
    writeSidecar(uuid, slug, 'Final', {
      artifactPath: 'docs/final-entry/index.md',
    });
    mkdirSync(join(project, 'docs', slug), { recursive: true });
    writeFileSync(join(project, 'docs', slug, 'index.md'), '# Final\n', 'utf-8');

    const res = publish(slug);

    expect(res.stderr).toBe('');
    expect(res.code).toBe(0);
    const out = JSON.parse(res.stdout);
    expect(out).toMatchObject({
      entryId: uuid,
      slug,
      fromStage: 'Final',
      toStage: 'Published',
    });
    expect(readSidecar(uuid).currentStage).toBe('Published');
    expect(readSidecar(uuid).datePublished).toBeDefined();

    const md = readFileSync(join(project, '.deskwork', 'calendar.md'), 'utf8');
    const publishedSection = md.match(/## Published[\s\S]*?(?=^## )/m)?.[0] ?? '';
    expect(publishedSection).toContain(uuid);
  });

  it('refuses to publish from Drafting (must approve through Final first)', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440101';
    writeSidecar(uuid, 'draft', 'Drafting');

    const res = publish('draft');

    expect(res.code).not.toBe(0);
    expect(res.stderr).toMatch(/cannot publish from stage Drafting/i);
    expect(readSidecar(uuid).currentStage).toBe('Drafting');
  });

  it('refuses to publish an already-Published entry', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440102';
    writeSidecar(uuid, 'pub', 'Published');

    const res = publish('pub');

    expect(res.code).not.toBe(0);
    expect(res.stderr).toMatch(/already Published/i);
  });

  it('rejects --content-url with a clear error on entry-centric data', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440103';
    writeSidecar(uuid, 'with-url', 'Final', {
      artifactPath: 'docs/with-url/index.md',
    });
    mkdirSync(join(project, 'docs', 'with-url'), { recursive: true });
    writeFileSync(join(project, 'docs/with-url/index.md'), '# x\n', 'utf-8');

    const res = publish('with-url', '--content-url', 'https://example.com');

    expect(res.code).not.toBe(0);
    expect(res.stderr).toMatch(/--content-url is not supported on entry-centric/i);
  });

  it('honors --date by stamping the requested publish date', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440104';
    writeSidecar(uuid, 'dated', 'Final', {
      artifactPath: 'docs/dated/index.md',
    });
    mkdirSync(join(project, 'docs', 'dated'), { recursive: true });
    writeFileSync(join(project, 'docs/dated/index.md'), '# x\n', 'utf-8');

    const res = publish('dated', '--date', '2025-12-31');

    expect(res.code).toBe(0);
    expect(readSidecar(uuid).datePublished).toBe('2025-12-31T00:00:00.000Z');
  });
});
