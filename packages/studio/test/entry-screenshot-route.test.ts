/**
 * Phase 8 Step 8.3.3 — HTTP routes for the screenshot persistence
 * endpoints (entry-anchored + orphan paths).
 *
 * Drives both routes against a real tmp project tree:
 *   - 200 on a valid upload; the bytes land at the documented path.
 *   - 404 on entry-anchored when the entry sidecar doesn't exist.
 *   - 400 on malformed entryId, missing file field, bad filename.
 *   - 409 on filename collision (refuses to overwrite).
 *   - Orphan path lives at <projectRoot>/.deskwork/screenshots-orphan/
 *     and respects the same filename validation rules.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeSidecar } from '@deskwork/core/sidecar';
import type { Entry } from '@deskwork/core/schema/entry';
import type { DeskworkConfig } from '@deskwork/core/config';
import { createApp } from '../src/server.ts';

const ENTRY_UUID = '11111111-1111-4111-8111-111111111111';
const COMMENT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const UNKNOWN_UUID = '99999999-9999-4999-8999-999999999999';

function makeConfig(): DeskworkConfig {
  return {
    version: 1,
    sites: { main: { contentDir: 'docs', calendarPath: '.deskwork/cal.md' } },
    defaultSite: 'main',
  };
}

function entryFixture(): Entry {
  return {
    uuid: ENTRY_UUID,
    slug: 'foo',
    title: 'foo',
    keywords: [],
    source: 'manual',
    currentStage: 'Drafting',
    iterationByStage: { Ideas: 1, Planned: 1, Outlining: 1 },
    artifactPath: 'docs/foo/index.md',
    createdAt: '2026-04-30T10:00:00.000Z',
    updatedAt: '2026-04-30T10:00:00.000Z',
  };
}

async function postScreenshot(
  app: ReturnType<typeof createApp>,
  url: string,
  filename: string,
  bytes: Uint8Array,
): Promise<{ status: number; body: unknown }> {
  const form = new FormData();
  const blob = new Blob([bytes], { type: 'image/png' });
  form.append('file', blob, filename);
  const res = await app.fetch(
    new Request(`http://x${url}`, { method: 'POST', body: form }),
  );
  return { status: res.status, body: await res.json() };
}

function asObj(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== 'object') throw new Error('expected object response');
  return v as Record<string, unknown>;
}

/**
 * PNG magic-bytes prefix. Used so the test writes something
 * recognisable as a real image, not arbitrary garbage.
 */
const PNG_MAGIC = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

function fakePngBytes(payload: number): Uint8Array {
  const buf = new Uint8Array(PNG_MAGIC.length + 4);
  buf.set(PNG_MAGIC, 0);
  buf[PNG_MAGIC.length + 0] = payload;
  buf[PNG_MAGIC.length + 1] = payload + 1;
  buf[PNG_MAGIC.length + 2] = payload + 2;
  buf[PNG_MAGIC.length + 3] = payload + 3;
  return buf;
}

describe('POST /api/dev/editorial-review/entry/:entryId/screenshot', () => {
  let projectRoot: string;
  let cfg: DeskworkConfig;

  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), 'dw-screenshot-route-'));
    cfg = makeConfig();
    await mkdir(join(projectRoot, '.deskwork'), { recursive: true });
    await mkdir(join(projectRoot, 'docs', 'foo'), { recursive: true });
    await writeFile(join(projectRoot, '.deskwork', 'config.json'), JSON.stringify(cfg));
    await writeFile(join(projectRoot, 'docs', 'foo', 'index.md'), '# foo\n');
  });

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  it('writes bytes to <entryDir>/scrapbook/screenshots/<filename> and returns 200', async () => {
    await writeSidecar(projectRoot, entryFixture());
    const app = createApp({ projectRoot, config: cfg });
    const bytes = fakePngBytes(0x10);
    const filename = `${COMMENT_ID}-2026-05-31T15-32-04-500Z.png`;
    const { status, body } = await postScreenshot(
      app,
      `/api/dev/editorial-review/entry/${ENTRY_UUID}/screenshot`,
      filename,
      bytes,
    );
    expect(status).toBe(200);
    const obj = asObj(body);
    expect(obj.relativeWrittenPath).toBe(
      `docs/foo/scrapbook/screenshots/${filename}`,
    );
    const written = await readFile(
      join(projectRoot, 'docs', 'foo', 'scrapbook', 'screenshots', filename),
    );
    expect(written.length).toBe(bytes.length);
    expect(written[0]).toBe(PNG_MAGIC[0]);
  });

  it('returns 400 on a malformed entryId', async () => {
    const app = createApp({ projectRoot, config: cfg });
    const { status } = await postScreenshot(
      app,
      `/api/dev/editorial-review/entry/not-a-uuid/screenshot`,
      `${COMMENT_ID}-2026-05-31T15-32-04-500Z.png`,
      fakePngBytes(0x10),
    );
    expect(status).toBe(400);
  });

  it('returns 404 when the entry sidecar does not exist', async () => {
    const app = createApp({ projectRoot, config: cfg });
    const { status, body } = await postScreenshot(
      app,
      `/api/dev/editorial-review/entry/${UNKNOWN_UUID}/screenshot`,
      `${COMMENT_ID}-2026-05-31T15-32-04-500Z.png`,
      fakePngBytes(0x10),
    );
    expect(status).toBe(404);
    expect(asObj(body).error).toMatch(/unknown entry/);
  });

  it('returns 400 on a filename containing path-traversal', async () => {
    await writeSidecar(projectRoot, entryFixture());
    const app = createApp({ projectRoot, config: cfg });
    const { status, body } = await postScreenshot(
      app,
      `/api/dev/editorial-review/entry/${ENTRY_UUID}/screenshot`,
      '../../escape.png',
      fakePngBytes(0x10),
    );
    expect(status).toBe(400);
    expect(asObj(body).error).toMatch(/screenshot filename/);
  });

  it('returns 400 on a filename without the .png extension', async () => {
    await writeSidecar(projectRoot, entryFixture());
    const app = createApp({ projectRoot, config: cfg });
    const { status } = await postScreenshot(
      app,
      `/api/dev/editorial-review/entry/${ENTRY_UUID}/screenshot`,
      'no-extension',
      fakePngBytes(0x10),
    );
    expect(status).toBe(400);
  });

  it('returns 409 when the target filename already exists', async () => {
    await writeSidecar(projectRoot, entryFixture());
    const app = createApp({ projectRoot, config: cfg });
    const filename = `${COMMENT_ID}-2026-05-31T15-32-04-500Z.png`;
    // First write succeeds.
    const r1 = await postScreenshot(
      app,
      `/api/dev/editorial-review/entry/${ENTRY_UUID}/screenshot`,
      filename,
      fakePngBytes(0x10),
    );
    expect(r1.status).toBe(200);
    // Second write to the same filename is a 409.
    const r2 = await postScreenshot(
      app,
      `/api/dev/editorial-review/entry/${ENTRY_UUID}/screenshot`,
      filename,
      fakePngBytes(0x20),
    );
    expect(r2.status).toBe(409);
    expect(asObj(r2.body).error).toMatch(/already exists/);
  });

  it('returns 400 on a missing multipart file field', async () => {
    await writeSidecar(projectRoot, entryFixture());
    const app = createApp({ projectRoot, config: cfg });
    const form = new FormData();
    // Note: NO `file` field appended.
    form.append('other', 'value');
    const res = await app.fetch(
      new Request(
        `http://x/api/dev/editorial-review/entry/${ENTRY_UUID}/screenshot`,
        { method: 'POST', body: form },
      ),
    );
    expect(res.status).toBe(400);
  });
});

describe('POST /api/dev/editorial-review/screenshots/orphan', () => {
  let projectRoot: string;
  let cfg: DeskworkConfig;

  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), 'dw-orphan-screenshot-'));
    cfg = makeConfig();
    await mkdir(join(projectRoot, '.deskwork'), { recursive: true });
    await writeFile(join(projectRoot, '.deskwork', 'config.json'), JSON.stringify(cfg));
  });

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  it('writes bytes to <projectRoot>/.deskwork/screenshots-orphan/<filename> and returns 200', async () => {
    const app = createApp({ projectRoot, config: cfg });
    const bytes = fakePngBytes(0x30);
    const filename = '2026-05-31T15-32-04-500Z-deadbeef.png';
    const { status, body } = await postScreenshot(
      app,
      `/api/dev/editorial-review/screenshots/orphan`,
      filename,
      bytes,
    );
    expect(status).toBe(200);
    const obj = asObj(body);
    expect(obj.relativeWrittenPath).toBe(
      `.deskwork/screenshots-orphan/${filename}`,
    );
    const info = await stat(
      join(projectRoot, '.deskwork', 'screenshots-orphan', filename),
    );
    expect(info.size).toBe(bytes.length);
  });

  it('returns 400 on a filename with forbidden chars', async () => {
    const app = createApp({ projectRoot, config: cfg });
    const { status } = await postScreenshot(
      app,
      `/api/dev/editorial-review/screenshots/orphan`,
      '../escape.png',
      fakePngBytes(0x30),
    );
    expect(status).toBe(400);
  });

  it('returns 409 on a filename collision', async () => {
    const app = createApp({ projectRoot, config: cfg });
    const filename = '2026-05-31T15-32-04-500Z-cafebabe.png';
    const r1 = await postScreenshot(
      app,
      `/api/dev/editorial-review/screenshots/orphan`,
      filename,
      fakePngBytes(0x30),
    );
    expect(r1.status).toBe(200);
    const r2 = await postScreenshot(
      app,
      `/api/dev/editorial-review/screenshots/orphan`,
      filename,
      fakePngBytes(0x40),
    );
    expect(r2.status).toBe(409);
  });

  it('creates the orphan directory on first write', async () => {
    const app = createApp({ projectRoot, config: cfg });
    const filename = '2026-05-31T15-32-04-500Z-baddcafe.png';
    const { status } = await postScreenshot(
      app,
      `/api/dev/editorial-review/screenshots/orphan`,
      filename,
      fakePngBytes(0x50),
    );
    expect(status).toBe(200);
    const dirInfo = await stat(
      join(projectRoot, '.deskwork', 'screenshots-orphan'),
    );
    expect(dirInfo.isDirectory()).toBe(true);
  });
});
