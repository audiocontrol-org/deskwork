/**
 * Phase 8 Step 8.4.1 — integration test for the attach-to-comment
 * server route (`POST /api/dev/editorial-review/entry/:entryId/
 * comment/:commentId/attach`).
 *
 * Drives the route against a real tmp project tree:
 *   - 200 success: an `edit-comment` annotation is appended with the
 *     full intended attachments[] list, and the folded read shows the
 *     comment's updated attachments.
 *   - Empty-prior case: a comment with no prior attachments yields a
 *     single-element attachments[] after attach.
 *   - Append-on-existing case: prior attachments are preserved + the
 *     new path appended.
 *   - 400 on malformed entryId / commentId / missing or empty
 *     relativePath / non-JSON body.
 *   - 404 on unknown entry sidecar.
 *   - 404 on unknown commentId.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
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
const UNKNOWN_ENTRY = '99999999-9999-4999-8999-999999999999';
const SCREENSHOT_PATH =
  'docs/foo/scrapbook/screenshots/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa-A.png';

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

async function seedComment(
  projectRoot: string,
  text: string,
  attachments?: string[],
): Promise<string> {
  const draft: Parameters<typeof mintEntryAnnotation>[0] = {
    type: 'comment',
    workflowId: ENTRY_UUID,
    version: 1,
    range: { start: 0, end: 4 },
    text,
    ...(attachments !== undefined ? { attachments } : {}),
  };
  const minted = mintEntryAnnotation(draft);
  await addEntryAnnotation(projectRoot, ENTRY_UUID, minted as DraftAnnotation);
  return minted.id;
}

async function postAttach(
  app: ReturnType<typeof createApp>,
  entryId: string,
  commentId: string,
  body: unknown,
): Promise<{ status: number; body: unknown }> {
  const res = await app.fetch(
    new Request(
      `http://x/api/dev/editorial-review/entry/${entryId}/comment/${commentId}/attach`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: typeof body === 'string' ? body : JSON.stringify(body),
      },
    ),
  );
  return { status: res.status, body: await res.json() };
}

function asObj(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== 'object') throw new Error('expected object response');
  return v as Record<string, unknown>;
}

describe('POST /api/dev/editorial-review/entry/:entryId/comment/:commentId/attach', () => {
  let projectRoot: string;
  let cfg: DeskworkConfig;

  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), 'dw-attach-route-'));
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

  it('attaches a screenshot path to a comment without prior attachments', async () => {
    const commentId = await seedComment(projectRoot, 'note');
    const app = createApp({ projectRoot, config: cfg });
    const { status, body } = await postAttach(app, ENTRY_UUID, commentId, {
      relativePath: SCREENSHOT_PATH,
    });
    expect(status).toBe(200);
    const obj = asObj(body);
    expect(obj.attachments).toEqual([SCREENSHOT_PATH]);
    const ann = asObj(obj.annotation);
    expect(ann.type).toBe('edit-comment');
    expect(ann.commentId).toBe(commentId);
    // Folded view reflects the new attachment list on the comment.
    const folded = await listEntryAnnotations(projectRoot, ENTRY_UUID);
    expect(folded).toHaveLength(1);
    const c = folded[0];
    if (c.type !== 'comment') throw new Error('expected comment');
    expect(c.attachments).toEqual([SCREENSHOT_PATH]);
  });

  it('appends to existing attachments instead of replacing', async () => {
    const commentId = await seedComment(projectRoot, 'note', [
      'docs/foo/scrapbook/screenshots/existing.png',
    ]);
    const app = createApp({ projectRoot, config: cfg });
    const { status, body } = await postAttach(app, ENTRY_UUID, commentId, {
      relativePath: SCREENSHOT_PATH,
    });
    expect(status).toBe(200);
    const obj = asObj(body);
    expect(obj.attachments).toEqual([
      'docs/foo/scrapbook/screenshots/existing.png',
      SCREENSHOT_PATH,
    ]);
    const folded = await listEntryAnnotations(projectRoot, ENTRY_UUID);
    const c = folded[0];
    if (c.type !== 'comment') throw new Error('expected comment');
    expect(c.attachments).toEqual([
      'docs/foo/scrapbook/screenshots/existing.png',
      SCREENSHOT_PATH,
    ]);
  });

  it('returns 400 on malformed entryId', async () => {
    const commentId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const app = createApp({ projectRoot, config: cfg });
    const { status } = await postAttach(app, 'not-a-uuid', commentId, {
      relativePath: SCREENSHOT_PATH,
    });
    expect(status).toBe(400);
  });

  it('returns 400 on malformed commentId', async () => {
    const app = createApp({ projectRoot, config: cfg });
    const { status } = await postAttach(app, ENTRY_UUID, 'not-a-uuid', {
      relativePath: SCREENSHOT_PATH,
    });
    expect(status).toBe(400);
  });

  it('returns 400 on missing relativePath', async () => {
    const commentId = await seedComment(projectRoot, 'note');
    const app = createApp({ projectRoot, config: cfg });
    const { status, body } = await postAttach(app, ENTRY_UUID, commentId, {});
    expect(status).toBe(400);
    expect(asObj(body).error).toMatch(/relativePath/);
  });

  it('returns 400 on empty relativePath', async () => {
    const commentId = await seedComment(projectRoot, 'note');
    const app = createApp({ projectRoot, config: cfg });
    const { status } = await postAttach(app, ENTRY_UUID, commentId, {
      relativePath: '',
    });
    expect(status).toBe(400);
  });

  it('returns 400 on a non-JSON body', async () => {
    const commentId = await seedComment(projectRoot, 'note');
    const app = createApp({ projectRoot, config: cfg });
    const { status } = await postAttach(app, ENTRY_UUID, commentId, 'not json');
    expect(status).toBe(400);
  });

  it('returns 404 on unknown entry sidecar', async () => {
    const commentId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const app = createApp({ projectRoot, config: cfg });
    const { status, body } = await postAttach(app, UNKNOWN_ENTRY, commentId, {
      relativePath: SCREENSHOT_PATH,
    });
    expect(status).toBe(404);
    expect(asObj(body).error).toMatch(/unknown entry/);
  });

  it('returns 404 when commentId is not in the entry stream', async () => {
    const app = createApp({ projectRoot, config: cfg });
    const missingComment = 'cccccccc-cccc-4ccc-8ccc-ccccccccccccc'.slice(0, 36);
    const { status, body } = await postAttach(app, ENTRY_UUID, missingComment, {
      relativePath: SCREENSHOT_PATH,
    });
    expect(status).toBe(404);
    expect(asObj(body).error).toMatch(/unknown commentId/);
  });
});
