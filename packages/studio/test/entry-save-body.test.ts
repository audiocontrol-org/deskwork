/**
 * Issue #174 — Save endpoint regression coverage.
 *
 * `PUT /api/dev/editorial-review/entry/:entryId/body` is the dumb
 * file-write surface for in-browser edits. State-machine work
 * (versioning, journal, in-review flips) belongs to `/deskwork:iterate`.
 *
 * Coverage:
 *   - Happy path: writes the supplied markdown to the entry's canonical
 *     `index.md` on disk; returns 200 + relative `writtenPath`.
 *   - Resolves through the SAME path the read path uses (T1's
 *     index.md-canonical preference). Verified by writing through a
 *     legacy `artifactPath` shape and checking that the write lands on
 *     `<dir>/index.md`, not the legacy path.
 *   - 400 on malformed entryId (UUID regex mismatch).
 *   - 404 on unknown entryId.
 *   - 400 on missing body / wrong content-type.
 *   - 400 on JSON without a `markdown` (string) field.
 *   - Atomic write semantic: the tmp filename embeds the PID, then is
 *     renamed atomically into place. We assert the final file exists
 *     with the expected content; the absence of leftover `*.tmp` files
 *     in the directory proves the rename completed.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeSidecar } from '@deskwork/core/sidecar';
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

function makeEntry(overrides: Partial<Entry> = {}): Entry {
  return {
    uuid: ENTRY_UUID,
    slug: 'my-doc',
    title: 'My Doc',
    keywords: [],
    source: 'manual',
    currentStage: 'Drafting',
    iterationByStage: { Drafting: 1 },
    artifactPath: 'docs/my-doc/index.md',
    createdAt: '2026-04-30T10:00:00.000Z',
    updatedAt: '2026-04-30T10:00:00.000Z',
    ...overrides,
  };
}

async function seedConfig(projectRoot: string, cfg: DeskworkConfig): Promise<void> {
  await mkdir(join(projectRoot, '.deskwork'), { recursive: true });
  await writeFile(join(projectRoot, '.deskwork', 'config.json'), JSON.stringify(cfg));
}

async function putJson(
  app: ReturnType<typeof createApp>,
  path: string,
  body: unknown,
  init?: { contentType?: string; rawBody?: string },
): Promise<{ status: number; body: unknown }> {
  const headers: Record<string, string> = {
    'content-type': init?.contentType ?? 'application/json',
  };
  const res = await app.fetch(
    new Request(`http://x${path}`, {
      method: 'PUT',
      headers,
      body: init?.rawBody ?? JSON.stringify(body),
    }),
  );
  return { status: res.status, body: await res.json() };
}

function asObj(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== 'object') throw new Error('expected object response');
  // Build a fresh record by copying own keys; avoids an `as`-cast on
  // the unknown value while still surfacing each field by name.
  const out: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(v)) {
    out[k] = val;
  }
  return out;
}

describe('PUT /api/dev/editorial-review/entry/:entryId/body (#174)', () => {
  let projectRoot: string;
  let cfg: DeskworkConfig;

  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), 'dw-entry-save-body-'));
    cfg = makeConfig();
    await seedConfig(projectRoot, cfg);
    await mkdir(join(projectRoot, 'docs', 'my-doc'), { recursive: true });
    await writeFile(join(projectRoot, 'docs', 'my-doc', 'index.md'), '# original\n');
    await writeSidecar(projectRoot, makeEntry());
  });

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  it('writes the supplied markdown to <dir>/index.md and returns 200', async () => {
    const app = createApp({ projectRoot, config: cfg });
    const next = '# rewritten\n\nbody text\n';
    const { status, body } = await putJson(
      app,
      `/api/dev/editorial-review/entry/${ENTRY_UUID}/body`,
      { markdown: next },
    );
    expect(status).toBe(200);
    const obj = asObj(body);
    expect(obj.ok).toBe(true);
    expect(obj.writtenPath).toBe(join('docs', 'my-doc', 'index.md'));
    const onDisk = await readFile(join(projectRoot, 'docs', 'my-doc', 'index.md'), 'utf8');
    expect(onDisk).toBe(next);
  });

  it('round-trips an empty-string save (idempotent file rewrite is fine)', async () => {
    const app = createApp({ projectRoot, config: cfg });
    const { status } = await putJson(
      app,
      `/api/dev/editorial-review/entry/${ENTRY_UUID}/body`,
      { markdown: '' },
    );
    expect(status).toBe(200);
    const onDisk = await readFile(join(projectRoot, 'docs', 'my-doc', 'index.md'), 'utf8');
    expect(onDisk).toBe('');
  });

  it('resolves the same canonical path the read path resolves (legacy artifactPath case)', async () => {
    // Sidecar carries a legacy per-stage artifactPath
    // (`scrapbook/outline.md`); the resolver prefers `<dir>/index.md`
    // when it exists. Save must follow the same rule so the write lands
    // on the file the editor actually shows.
    const u2 = '22222222-2222-4222-8222-222222222222';
    await mkdir(join(projectRoot, 'docs', 'legacy-doc', 'scrapbook'), {
      recursive: true,
    });
    await writeFile(join(projectRoot, 'docs', 'legacy-doc', 'index.md'), '# index canonical\n');
    await writeFile(
      join(projectRoot, 'docs', 'legacy-doc', 'scrapbook', 'outline.md'),
      'STALE outline\n',
    );
    await writeSidecar(
      projectRoot,
      makeEntry({
        uuid: u2,
        slug: 'legacy-doc',
        artifactPath: 'docs/legacy-doc/scrapbook/outline.md',
      }),
    );

    const app = createApp({ projectRoot, config: cfg });
    const next = '# saved through legacy resolver\n';
    const { status, body } = await putJson(
      app,
      `/api/dev/editorial-review/entry/${u2}/body`,
      { markdown: next },
    );
    expect(status).toBe(200);
    const obj = asObj(body);
    expect(obj.writtenPath).toBe(join('docs', 'legacy-doc', 'index.md'));
    // The legacy outline file must be untouched — Save writes to
    // index.md, not to the per-stage scrapbook file.
    const indexOnDisk = await readFile(
      join(projectRoot, 'docs', 'legacy-doc', 'index.md'),
      'utf8',
    );
    expect(indexOnDisk).toBe(next);
    const outlineOnDisk = await readFile(
      join(projectRoot, 'docs', 'legacy-doc', 'scrapbook', 'outline.md'),
      'utf8',
    );
    expect(outlineOnDisk).toBe('STALE outline\n');
  });

  it('returns 400 on a malformed entryId', async () => {
    const app = createApp({ projectRoot, config: cfg });
    const { status, body } = await putJson(
      app,
      `/api/dev/editorial-review/entry/not-a-uuid/body`,
      { markdown: 'x' },
    );
    expect(status).toBe(400);
    const obj = asObj(body);
    expect(typeof obj.error).toBe('string');
    if (typeof obj.error !== 'string') throw new Error('expected string error');
    expect(obj.error).toMatch(/malformed/i);
  });

  it('returns 404 when the entry does not exist', async () => {
    const app = createApp({ projectRoot, config: cfg });
    const { status, body } = await putJson(
      app,
      `/api/dev/editorial-review/entry/${UNKNOWN_UUID}/body`,
      { markdown: 'x' },
    );
    expect(status).toBe(404);
    const obj = asObj(body);
    expect(typeof obj.error).toBe('string');
  });

  it('returns 400 when body is missing the markdown field', async () => {
    const app = createApp({ projectRoot, config: cfg });
    const { status, body } = await putJson(
      app,
      `/api/dev/editorial-review/entry/${ENTRY_UUID}/body`,
      { somethingElse: 'x' },
    );
    expect(status).toBe(400);
    const obj = asObj(body);
    if (typeof obj.error !== 'string') throw new Error('expected string error');
    expect(obj.error).toMatch(/markdown/i);
  });

  it('returns 400 when markdown is not a string', async () => {
    const app = createApp({ projectRoot, config: cfg });
    const { status } = await putJson(
      app,
      `/api/dev/editorial-review/entry/${ENTRY_UUID}/body`,
      { markdown: 42 },
    );
    expect(status).toBe(400);
  });

  it('returns 400 on bad JSON body', async () => {
    const app = createApp({ projectRoot, config: cfg });
    const { status } = await putJson(
      app,
      `/api/dev/editorial-review/entry/${ENTRY_UUID}/body`,
      null,
      { rawBody: 'not-json' },
    );
    expect(status).toBe(400);
  });

  it('returns 400 on the wrong content-type', async () => {
    const app = createApp({ projectRoot, config: cfg });
    const { status, body } = await putJson(
      app,
      `/api/dev/editorial-review/entry/${ENTRY_UUID}/body`,
      null,
      { contentType: 'text/plain', rawBody: '# hi' },
    );
    expect(status).toBe(400);
    const obj = asObj(body);
    expect(typeof obj.error).toBe('string');
  });

  it('atomic write: leaves no .tmp files behind on success', async () => {
    const app = createApp({ projectRoot, config: cfg });
    await putJson(
      app,
      `/api/dev/editorial-review/entry/${ENTRY_UUID}/body`,
      { markdown: '# atomic\n' },
    );
    const dir = join(projectRoot, 'docs', 'my-doc');
    const entries = await readdir(dir);
    const tmpFiles = entries.filter((e) => e.includes('.tmp'));
    expect(tmpFiles).toEqual([]);
  });

  it('does NOT bump the iterationByStage counter (state-machine untouched)', async () => {
    const app = createApp({ projectRoot, config: cfg });
    await putJson(
      app,
      `/api/dev/editorial-review/entry/${ENTRY_UUID}/body`,
      { markdown: '# hi\n' },
    );
    // Re-read the sidecar; the iteration counter must be unchanged.
    const sidecarPath = join(
      projectRoot,
      '.deskwork',
      'entries',
      `${ENTRY_UUID}.json`,
    );
    const raw = await readFile(sidecarPath, 'utf8');
    const json: unknown = JSON.parse(raw);
    expect(typeof json).toBe('object');
    if (typeof json !== 'object' || json === null) throw new Error('expected sidecar object');
    const iter = Reflect.get(json, 'iterationByStage');
    expect(iter).toEqual({ Drafting: 1 });
  });
});
