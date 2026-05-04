/**
 * Entry-keyed longform endpoints (the surviving subset, post-#189).
 *
 * Drives the routes nested under `/api/dev/editorial-review/entry/:entryId/`:
 *   POST /annotate, GET /annotations.
 *
 * The state-mutating routes (/decision, /version, /approve, /block,
 * /cancel, /induct) were retired in #189 — those mutations belong to
 * `/deskwork:<verb>` skills the operator runs from a Claude Code
 * session, not to the studio's HTTP surface. The review-surface
 * buttons now copy `/deskwork:approve <slug>` / `/deskwork:iterate <slug>`
 * etc. to the operator's clipboard via `copyOrShowFallback`. See
 * `THESIS.md` Consequence 2.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeSidecar, readSidecar } from '@deskwork/core/sidecar';
import type { Entry } from '@deskwork/core/schema/entry';
import type { DeskworkConfig } from '@deskwork/core/config';
import { createApp } from '../src/server.ts';

const ENTRY_UUID = '11111111-1111-4111-8111-111111111111';
const UNKNOWN_UUID = '99999999-9999-4999-8999-999999999999';

function makeConfig(): DeskworkConfig {
  return {
    version: 1,
    sites: {
      a: {
        host: 'a.example',
        contentDir: 'docs',
        calendarPath: 'docs/cal-a.md',
      },
    },
    defaultSite: 'a',
  };
}

function entry(stage: Entry['currentStage'], overrides: Partial<Entry> = {}): Entry {
  return {
    uuid: ENTRY_UUID,
    slug: 'foo',
    title: 'Foo',
    keywords: [],
    source: 'manual',
    currentStage: stage,
    iterationByStage: {},
    createdAt: '2026-04-30T10:00:00.000Z',
    updatedAt: '2026-04-30T10:00:00.000Z',
    ...overrides,
  };
}

async function postJson(
  app: ReturnType<typeof createApp>,
  path: string,
  body: unknown,
): Promise<{ status: number; body: unknown }> {
  const res = await app.fetch(
    new Request(`http://x${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
  return { status: res.status, body: await res.json() };
}

async function getJson(
  app: ReturnType<typeof createApp>,
  path: string,
): Promise<{ status: number; body: unknown }> {
  const res = await app.fetch(new Request(`http://x${path}`));
  return { status: res.status, body: await res.json() };
}

function asObj(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== 'object') throw new Error('expected object response');
  return v as Record<string, unknown>;
}

describe('POST /api/dev/editorial-review/entry/:entryId/annotate', () => {
  let projectRoot: string;
  let cfg: DeskworkConfig;

  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), 'dw-entry-api-annot-'));
    cfg = makeConfig();
    await mkdir(join(projectRoot, '.deskwork'), { recursive: true });
    await writeFile(join(projectRoot, '.deskwork', 'config.json'), JSON.stringify(cfg));
  });

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  it('mints + persists a comment annotation and returns it', async () => {
    await writeSidecar(projectRoot, entry('Drafting'));
    const app = createApp({ projectRoot, config: cfg });
    const { status, body } = await postJson(
      app,
      `/api/dev/editorial-review/entry/${ENTRY_UUID}/annotate`,
      {
        type: 'comment',
        workflowId: ENTRY_UUID,
        version: 1,
        range: { start: 0, end: 5 },
        text: 'tighten this',
      },
    );
    expect(status).toBe(200);
    const obj = asObj(body);
    const ann = asObj(obj.annotation);
    expect(ann.type).toBe('comment');
    expect(typeof ann.id).toBe('string');
    expect(typeof ann.createdAt).toBe('string');
    expect(ann.text).toBe('tighten this');
  });

  it('returns 400 on missing type', async () => {
    await writeSidecar(projectRoot, entry('Drafting'));
    const app = createApp({ projectRoot, config: cfg });
    const { status, body } = await postJson(
      app,
      `/api/dev/editorial-review/entry/${ENTRY_UUID}/annotate`,
      { workflowId: ENTRY_UUID },
    );
    expect(status).toBe(400);
    const obj = asObj(body);
    expect(typeof obj.error).toBe('string');
    expect((obj.error as string)).toMatch(/type/i);
  });

  it('returns 400 on bad JSON body', async () => {
    await writeSidecar(projectRoot, entry('Drafting'));
    const app = createApp({ projectRoot, config: cfg });
    const res = await app.fetch(
      new Request(`http://x/api/dev/editorial-review/entry/${ENTRY_UUID}/annotate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not-json',
      }),
    );
    expect(res.status).toBe(400);
  });

  it('returns 404 when the entry does not exist', async () => {
    const app = createApp({ projectRoot, config: cfg });
    const { status } = await postJson(
      app,
      `/api/dev/editorial-review/entry/${UNKNOWN_UUID}/annotate`,
      {
        type: 'comment',
        workflowId: UNKNOWN_UUID,
        version: 1,
        range: { start: 0, end: 1 },
        text: 'x',
      },
    );
    expect(status).toBe(404);
  });

  it('rejects an unknown annotation type with 400', async () => {
    await writeSidecar(projectRoot, entry('Drafting'));
    const app = createApp({ projectRoot, config: cfg });
    const { status } = await postJson(
      app,
      `/api/dev/editorial-review/entry/${ENTRY_UUID}/annotate`,
      { type: 'frob', workflowId: ENTRY_UUID },
    );
    expect(status).toBe(400);
  });
});

describe('GET /api/dev/editorial-review/entry/:entryId/annotations', () => {
  let projectRoot: string;
  let cfg: DeskworkConfig;

  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), 'dw-entry-api-list-'));
    cfg = makeConfig();
    await mkdir(join(projectRoot, '.deskwork'), { recursive: true });
    await writeFile(join(projectRoot, '.deskwork', 'config.json'), JSON.stringify(cfg));
  });

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  it('returns an empty list for an entry with no annotations', async () => {
    await writeSidecar(projectRoot, entry('Drafting'));
    const app = createApp({ projectRoot, config: cfg });
    const { status, body } = await getJson(
      app,
      `/api/dev/editorial-review/entry/${ENTRY_UUID}/annotations`,
    );
    expect(status).toBe(200);
    const obj = asObj(body);
    expect(obj.annotations).toEqual([]);
  });

  it('returns annotations the annotate endpoint just wrote (round-trip)', async () => {
    await writeSidecar(projectRoot, entry('Drafting'));
    const app = createApp({ projectRoot, config: cfg });
    await postJson(app, `/api/dev/editorial-review/entry/${ENTRY_UUID}/annotate`, {
      type: 'comment',
      workflowId: ENTRY_UUID,
      version: 1,
      range: { start: 0, end: 3 },
      text: 'note 1',
    });
    await postJson(app, `/api/dev/editorial-review/entry/${ENTRY_UUID}/annotate`, {
      type: 'comment',
      workflowId: ENTRY_UUID,
      version: 1,
      range: { start: 4, end: 7 },
      text: 'note 2',
    });

    const { status, body } = await getJson(
      app,
      `/api/dev/editorial-review/entry/${ENTRY_UUID}/annotations`,
    );
    expect(status).toBe(200);
    const obj = asObj(body);
    const list = obj.annotations;
    expect(Array.isArray(list)).toBe(true);
    if (!Array.isArray(list)) throw new Error('expected annotations array');
    expect(list).toHaveLength(2);
    const texts = list.map((a) => asObj(a).text);
    expect(texts).toContain('note 1');
    expect(texts).toContain('note 2');
  });
});
