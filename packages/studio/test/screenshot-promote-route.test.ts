/**
 * Phase 8 Step 8.4.1 + 8.4.2 — integration test for the orphan-promote
 * server route (`POST /api/dev/editorial-review/screenshots/orphan/
 * :filename/promote-to-entry/:entryId/comment/:commentId`).
 *
 * Drives the route against a real tmp project tree:
 *   - 200 success: orphan file moved to entry-anchored path; comment's
 *     attachments[] updated with the new relative path; folded read
 *     reflects the attachment.
 *   - Cross-entry case (Task 8.4.2): `sourceEntry` body field triggers
 *     a `<filename>.meta.json` sidecar next to the moved file.
 *   - Same-entry case: no sidecar written when sourceEntry == entryId.
 *   - 400 on malformed entryId / commentId / filename / sourceEntry.
 *   - 404 on missing orphan / unknown entry sidecar / unknown
 *     commentId.
 *   - 409 on collision at the destination path.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeSidecar } from '@deskwork/core/sidecar';
import {
  addEntryAnnotation,
  listEntryAnnotations,
  mintEntryAnnotation,
} from '@deskwork/core/entry/annotations';
import type { DraftAnnotation } from '@deskwork/core/review/types';
import type { Entry } from '@deskwork/core/schema/entry';
import type { DeskworkConfig } from '@deskwork/core/config';
import { createApp } from '../src/server.ts';

const ENTRY_UUID = '11111111-1111-4111-8111-111111111111';
const SOURCE_ENTRY = '22222222-2222-4222-8222-222222222222';
const UNKNOWN_ENTRY = '99999999-9999-4999-8999-999999999999';
const FILENAME = '2026-05-31T15-32-04-500Z-deadbeef.png';

const PNG_MAGIC = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

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

async function seedComment(projectRoot: string): Promise<string> {
  const minted = mintEntryAnnotation({
    type: 'comment',
    workflowId: ENTRY_UUID,
    version: 1,
    range: { start: 0, end: 4 },
    text: 'note',
  });
  await addEntryAnnotation(projectRoot, ENTRY_UUID, minted as DraftAnnotation);
  return minted.id;
}

async function seedOrphan(projectRoot: string, filename: string): Promise<void> {
  const dir = join(projectRoot, '.deskwork', 'screenshots-orphan');
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, filename), PNG_MAGIC);
}

async function postPromote(
  app: ReturnType<typeof createApp>,
  filename: string,
  entryId: string,
  commentId: string,
  body?: unknown,
): Promise<{ status: number; body: unknown }> {
  const url = `http://x/api/dev/editorial-review/screenshots/orphan/${encodeURIComponent(filename)}/promote-to-entry/${entryId}/comment/${commentId}`;
  const init: RequestInit =
    body !== undefined
      ? {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        }
      : { method: 'POST' };
  const res = await app.fetch(new Request(url, init));
  const contentType = res.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().includes('application/json')) {
    return { status: res.status, body: { error: await res.text() } };
  }
  return { status: res.status, body: await res.json() };
}

function asObj(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== 'object') throw new Error('expected object response');
  return v as Record<string, unknown>;
}

describe('POST /api/dev/editorial-review/screenshots/orphan/:filename/promote-to-entry/:entryId/comment/:commentId', () => {
  let projectRoot: string;
  let cfg: DeskworkConfig;

  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), 'dw-promote-route-'));
    cfg = makeConfig();
    await mkdir(join(projectRoot, '.deskwork', 'review-journal', 'history'), {
      recursive: true,
    });
    await mkdir(join(projectRoot, 'docs', 'foo'), { recursive: true });
    await writeFile(
      join(projectRoot, '.deskwork', 'config.json'),
      JSON.stringify(cfg),
    );
    await writeFile(join(projectRoot, 'docs', 'foo', 'index.md'), '# foo\n');
    await writeSidecar(projectRoot, entryFixture());
  });

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  it('moves an orphan file to the entry-anchored path and attaches to the comment', async () => {
    const commentId = await seedComment(projectRoot);
    await seedOrphan(projectRoot, FILENAME);
    const app = createApp({ projectRoot, config: cfg });
    const { status, body } = await postPromote(
      app,
      FILENAME,
      ENTRY_UUID,
      commentId,
    );
    expect(status).toBe(200);
    const obj = asObj(body);
    expect(obj.relativeWrittenPath).toBe(
      `docs/foo/scrapbook/screenshots/${FILENAME}`,
    );
    expect(obj.attachments).toEqual([
      `docs/foo/scrapbook/screenshots/${FILENAME}`,
    ]);
    expect(obj.sidecarMetaPath).toBeNull();
    // The file moved (orphan path is gone, dest exists).
    const destInfo = await stat(
      join(projectRoot, 'docs', 'foo', 'scrapbook', 'screenshots', FILENAME),
    );
    expect(destInfo.size).toBe(PNG_MAGIC.length);
    await expect(
      stat(join(projectRoot, '.deskwork', 'screenshots-orphan', FILENAME)),
    ).rejects.toThrow();
    // Folded annotation list shows the attachment.
    const folded = await listEntryAnnotations(projectRoot, ENTRY_UUID);
    if (folded[0].type !== 'comment') throw new Error('expected comment');
    expect(folded[0].attachments).toEqual([
      `docs/foo/scrapbook/screenshots/${FILENAME}`,
    ]);
  });

  it('writes a sidecar .meta.json when sourceEntry differs (cross-entry case)', async () => {
    const commentId = await seedComment(projectRoot);
    await seedOrphan(projectRoot, FILENAME);
    const app = createApp({ projectRoot, config: cfg });
    const { status, body } = await postPromote(
      app,
      FILENAME,
      ENTRY_UUID,
      commentId,
      { sourceEntry: SOURCE_ENTRY },
    );
    expect(status).toBe(200);
    const obj = asObj(body);
    const sidecar = obj.sidecarMetaPath;
    if (typeof sidecar !== 'string') {
      throw new Error('expected sidecarMetaPath to be a string');
    }
    expect(sidecar.endsWith(`${FILENAME}.meta.json`)).toBe(true);
    const sidecarBody = JSON.parse(await readFile(sidecar, 'utf-8')) as Record<
      string,
      unknown
    >;
    expect(sidecarBody.sourceEntry).toBe(SOURCE_ENTRY);
  });

  it('omits the sidecar when sourceEntry == entryId (same-entry case)', async () => {
    const commentId = await seedComment(projectRoot);
    await seedOrphan(projectRoot, FILENAME);
    const app = createApp({ projectRoot, config: cfg });
    const { status, body } = await postPromote(
      app,
      FILENAME,
      ENTRY_UUID,
      commentId,
      { sourceEntry: ENTRY_UUID },
    );
    expect(status).toBe(200);
    const obj = asObj(body);
    expect(obj.sidecarMetaPath).toBeNull();
  });

  it('returns 400 on malformed filename', async () => {
    const commentId = await seedComment(projectRoot);
    const app = createApp({ projectRoot, config: cfg });
    const { status, body } = await postPromote(
      app,
      '../escape.png',
      ENTRY_UUID,
      commentId,
    );
    expect(status).toBe(400);
    expect(asObj(body).error).toMatch(/filename/);
  });

  it('returns 400 on malformed sourceEntry', async () => {
    const commentId = await seedComment(projectRoot);
    await seedOrphan(projectRoot, FILENAME);
    const app = createApp({ projectRoot, config: cfg });
    const { status } = await postPromote(
      app,
      FILENAME,
      ENTRY_UUID,
      commentId,
      { sourceEntry: 'not-a-uuid' },
    );
    expect(status).toBe(400);
  });

  it('returns 404 when the orphan file does not exist', async () => {
    const commentId = await seedComment(projectRoot);
    const app = createApp({ projectRoot, config: cfg });
    const { status, body } = await postPromote(
      app,
      FILENAME,
      ENTRY_UUID,
      commentId,
    );
    expect(status).toBe(404);
    expect(asObj(body).error).toMatch(/orphan screenshot not found/);
  });

  it('returns 404 on unknown entry sidecar', async () => {
    const commentId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    await seedOrphan(projectRoot, FILENAME);
    const app = createApp({ projectRoot, config: cfg });
    const { status, body } = await postPromote(
      app,
      FILENAME,
      UNKNOWN_ENTRY,
      commentId,
    );
    expect(status).toBe(404);
    expect(asObj(body).error).toMatch(/unknown entry/);
  });

  it('returns 404 when the commentId is not present in the entry stream', async () => {
    await seedOrphan(projectRoot, FILENAME);
    const app = createApp({ projectRoot, config: cfg });
    const missingComment = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    const { status, body } = await postPromote(
      app,
      FILENAME,
      ENTRY_UUID,
      missingComment,
    );
    expect(status).toBe(404);
    expect(asObj(body).error).toMatch(/unknown commentId/);
  });

  // AUDIT-20260602-01 — Bug-repro: the destructive file move MUST NOT
  // happen before the commentId existence check. Unknown-commentId is a
  // normal 404 path; if the orphan file is consumed before the 404
  // fires, the operator's screenshot is unrecoverable on retry.
  it(
    'preserves the orphan file when commentId is unknown (AUDIT-20260602-01)',
    async () => {
      await seedOrphan(projectRoot, FILENAME);
      const app = createApp({ projectRoot, config: cfg });
      const missingComment = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
      const orphanPath = join(
        projectRoot,
        '.deskwork',
        'screenshots-orphan',
        FILENAME,
      );
      const destPath = join(
        projectRoot,
        'docs',
        'foo',
        'scrapbook',
        'screenshots',
        FILENAME,
      );
      const { status } = await postPromote(
        app,
        FILENAME,
        ENTRY_UUID,
        missingComment,
      );
      expect(status).toBe(404);
      // The orphan still exists — operator can retry with the right
      // commentId.
      const orphanInfo = await stat(orphanPath);
      expect(orphanInfo.size).toBe(PNG_MAGIC.length);
      // The destination file was NOT written.
      await expect(stat(destPath)).rejects.toThrow();
    },
  );

  // AUDIT-20260602-01 — Regression-lock: the working-code invariant the
  // fix preserves — when every precondition holds, the orphan IS moved
  // to the entry-anchored path and the comment's attachments[] is
  // updated. Pins the success-path data flow so the validation reorder
  // can't accidentally bypass the move.
  it(
    'still moves the orphan to the destination on the success path (AUDIT-20260602-01 regression-lock)',
    async () => {
      const commentId = await seedComment(projectRoot);
      await seedOrphan(projectRoot, FILENAME);
      const orphanPath = join(
        projectRoot,
        '.deskwork',
        'screenshots-orphan',
        FILENAME,
      );
      const destPath = join(
        projectRoot,
        'docs',
        'foo',
        'scrapbook',
        'screenshots',
        FILENAME,
      );
      const app = createApp({ projectRoot, config: cfg });
      const { status, body } = await postPromote(
        app,
        FILENAME,
        ENTRY_UUID,
        commentId,
      );
      expect(status).toBe(200);
      // Orphan is gone (move semantics).
      await expect(stat(orphanPath)).rejects.toThrow();
      // Destination exists with the same byte count.
      const destInfo = await stat(destPath);
      expect(destInfo.size).toBe(PNG_MAGIC.length);
      // attachments[] now references the moved file.
      expect(asObj(body).attachments).toEqual([
        `docs/foo/scrapbook/screenshots/${FILENAME}`,
      ]);
    },
  );

  it('returns 409 when an entry-anchored file of the same name already exists', async () => {
    const commentId = await seedComment(projectRoot);
    await seedOrphan(projectRoot, FILENAME);
    // Pre-create the dest file.
    const destDir = join(projectRoot, 'docs', 'foo', 'scrapbook', 'screenshots');
    await mkdir(destDir, { recursive: true });
    await writeFile(join(destDir, FILENAME), PNG_MAGIC);
    const app = createApp({ projectRoot, config: cfg });
    const { status, body } = await postPromote(
      app,
      FILENAME,
      ENTRY_UUID,
      commentId,
    );
    expect(status).toBe(409);
    expect(asObj(body).error).toMatch(/already exists/);
  });
});
