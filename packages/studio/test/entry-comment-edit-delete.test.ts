/**
 * Phase 35 (issue #199) — entry-keyed comment edit + delete routes.
 *
 * Drives:
 *   PATCH  /api/dev/editorial-review/entry/:entryId/comments/:commentId
 *   DELETE /api/dev/editorial-review/entry/:entryId/comments/:commentId
 *
 * Both routes append-only-journal an edit-comment / delete-comment
 * annotation; the GET /annotations route folds them into the
 * active-comment view (no mutation of the original `comment`
 * annotation).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeSidecar } from '@deskwork/core/sidecar';
import type { Entry } from '@deskwork/core/schema/entry';
import type { DeskworkConfig } from '@deskwork/core/config';
import { createApp } from '../src/server.ts';

const ENTRY_UUID = '11111111-1111-4111-8111-111111111111';
const UNKNOWN_UUID = '99999999-9999-4999-8999-999999999999';
const UNKNOWN_COMMENT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const MALFORMED_UUID = 'not-a-uuid';

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

function makeEntry(stage: Entry['currentStage'] = 'Drafting'): Entry {
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

async function patchJson(
  app: ReturnType<typeof createApp>,
  path: string,
  body: unknown,
): Promise<{ status: number; body: unknown }> {
  const res = await app.fetch(
    new Request(`http://x${path}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
  return { status: res.status, body: await res.json() };
}

async function deleteReq(
  app: ReturnType<typeof createApp>,
  path: string,
): Promise<{ status: number; body: unknown }> {
  const res = await app.fetch(
    new Request(`http://x${path}`, { method: 'DELETE' }),
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

async function seedComment(
  app: ReturnType<typeof createApp>,
  text = 'orginal',
): Promise<string> {
  const { status, body } = await postJson(
    app,
    `/api/dev/editorial-review/entry/${ENTRY_UUID}/annotate`,
    {
      type: 'comment',
      workflowId: ENTRY_UUID,
      version: 1,
      range: { start: 0, end: 5 },
      text,
    },
  );
  if (status !== 200) {
    throw new Error(`failed to seed comment: status=${status} body=${JSON.stringify(body)}`);
  }
  const id = asObj(asObj(body).annotation).id;
  if (typeof id !== 'string') throw new Error('seeded annotation missing id');
  return id;
}

describe('PATCH /api/dev/editorial-review/entry/:entryId/comments/:commentId', () => {
  let projectRoot: string;
  let cfg: DeskworkConfig;

  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), 'dw-entry-comment-edit-'));
    cfg = makeConfig();
    await mkdir(join(projectRoot, '.deskwork'), { recursive: true });
    await writeFile(
      join(projectRoot, '.deskwork', 'config.json'),
      JSON.stringify(cfg),
    );
    await writeSidecar(projectRoot, makeEntry());
  });

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  it('appends an edit-comment annotation and the folded read shows the new text', async () => {
    const app = createApp({ projectRoot, config: cfg });
    const commentId = await seedComment(app, 'orginal');
    const { status, body } = await patchJson(
      app,
      `/api/dev/editorial-review/entry/${ENTRY_UUID}/comments/${commentId}`,
      { text: 'original' },
    );
    expect(status).toBe(200);
    const ann = asObj(asObj(body).annotation);
    expect(ann.type).toBe('edit-comment');
    expect(ann.commentId).toBe(commentId);
    expect(ann.text).toBe('original');

    // Folded read shows the rebased comment text.
    const list = await getJson(
      app,
      `/api/dev/editorial-review/entry/${ENTRY_UUID}/annotations`,
    );
    const annotations = asObj(list.body).annotations;
    if (!Array.isArray(annotations)) throw new Error('expected array');
    expect(annotations).toHaveLength(1);
    const c = asObj(annotations[0]);
    expect(c.type).toBe('comment');
    expect(c.id).toBe(commentId);
    expect(c.text).toBe('original');
  });

  it('accepts a partial payload (text-only) and preserves other fields', async () => {
    const app = createApp({ projectRoot, config: cfg });
    const commentId = await seedComment(app, 'before');
    // First seed includes range. Edit only the text.
    const { status } = await patchJson(
      app,
      `/api/dev/editorial-review/entry/${ENTRY_UUID}/comments/${commentId}`,
      { text: 'after' },
    );
    expect(status).toBe(200);

    const list = await getJson(
      app,
      `/api/dev/editorial-review/entry/${ENTRY_UUID}/annotations`,
    );
    const annotations = asObj(list.body).annotations;
    if (!Array.isArray(annotations)) throw new Error('expected array');
    const c = asObj(annotations[0]);
    expect(c.text).toBe('after');
    expect(c.range).toEqual({ start: 0, end: 5 });
  });

  it('accepts a range-only payload', async () => {
    const app = createApp({ projectRoot, config: cfg });
    const commentId = await seedComment(app);
    const { status } = await patchJson(
      app,
      `/api/dev/editorial-review/entry/${ENTRY_UUID}/comments/${commentId}`,
      { range: { start: 7, end: 12 } },
    );
    expect(status).toBe(200);
    const list = await getJson(
      app,
      `/api/dev/editorial-review/entry/${ENTRY_UUID}/annotations`,
    );
    const annotations = asObj(list.body).annotations;
    if (!Array.isArray(annotations)) throw new Error('expected array');
    const c = asObj(annotations[0]);
    expect(c.range).toEqual({ start: 7, end: 12 });
  });

  it('returns 400 when the payload has no editable fields', async () => {
    const app = createApp({ projectRoot, config: cfg });
    const commentId = await seedComment(app);
    const { status, body } = await patchJson(
      app,
      `/api/dev/editorial-review/entry/${ENTRY_UUID}/comments/${commentId}`,
      {},
    );
    expect(status).toBe(400);
    const obj = asObj(body);
    expect(typeof obj.error).toBe('string');
  });

  it('returns 400 when entryId is malformed', async () => {
    const app = createApp({ projectRoot, config: cfg });
    const { status, body } = await patchJson(
      app,
      `/api/dev/editorial-review/entry/${MALFORMED_UUID}/comments/${UNKNOWN_COMMENT}`,
      { text: 'x' },
    );
    expect(status).toBe(400);
    expect(asObj(body).error).toMatch(/entryId/i);
  });

  it('returns 400 when commentId is malformed', async () => {
    const app = createApp({ projectRoot, config: cfg });
    const { status, body } = await patchJson(
      app,
      `/api/dev/editorial-review/entry/${ENTRY_UUID}/comments/${MALFORMED_UUID}`,
      { text: 'x' },
    );
    expect(status).toBe(400);
    expect(asObj(body).error).toMatch(/commentId/i);
  });

  it('returns 404 when the entry sidecar does not exist', async () => {
    const app = createApp({ projectRoot, config: cfg });
    const { status } = await patchJson(
      app,
      `/api/dev/editorial-review/entry/${UNKNOWN_UUID}/comments/${UNKNOWN_COMMENT}`,
      { text: 'x' },
    );
    expect(status).toBe(404);
  });

  it('returns 404 when the commentId is not present in the entry stream', async () => {
    const app = createApp({ projectRoot, config: cfg });
    // Sidecar exists; comment does not.
    const { status, body } = await patchJson(
      app,
      `/api/dev/editorial-review/entry/${ENTRY_UUID}/comments/${UNKNOWN_COMMENT}`,
      { text: 'x' },
    );
    expect(status).toBe(404);
    expect(asObj(body).error).toMatch(/unknown commentId/i);
  });

  it('returns 400 on bad JSON body', async () => {
    const app = createApp({ projectRoot, config: cfg });
    const commentId = await seedComment(app);
    const res = await app.fetch(
      new Request(
        `http://x/api/dev/editorial-review/entry/${ENTRY_UUID}/comments/${commentId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: 'not-json',
        },
      ),
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 when text is not a string', async () => {
    const app = createApp({ projectRoot, config: cfg });
    const commentId = await seedComment(app);
    const { status, body } = await patchJson(
      app,
      `/api/dev/editorial-review/entry/${ENTRY_UUID}/comments/${commentId}`,
      { text: 42 },
    );
    expect(status).toBe(400);
    expect(asObj(body).error).toMatch(/text/i);
  });

  it('returns 400 when range is malformed', async () => {
    const app = createApp({ projectRoot, config: cfg });
    const commentId = await seedComment(app);
    const { status, body } = await patchJson(
      app,
      `/api/dev/editorial-review/entry/${ENTRY_UUID}/comments/${commentId}`,
      { range: { start: 'a' } },
    );
    expect(status).toBe(400);
    expect(asObj(body).error).toMatch(/range/i);
  });

  // Phase 7 / issue #204 — category-only edit. Mirrors the text-only
  // and range-only cases above. The folded read should reflect the
  // new category while preserving the original text + range.
  it('accepts a category-only payload and the folded read reflects the new category', async () => {
    const app = createApp({ projectRoot, config: cfg });
    const commentId = await seedComment(app, 'leave-as-is');
    const { status, body } = await patchJson(
      app,
      `/api/dev/editorial-review/entry/${ENTRY_UUID}/comments/${commentId}`,
      { category: 'voice-drift' },
    );
    expect(status).toBe(200);
    const ann = asObj(asObj(body).annotation);
    expect(ann.type).toBe('edit-comment');
    expect(ann.commentId).toBe(commentId);
    expect(ann.category).toBe('voice-drift');
    // text/range should not be on the edit-comment payload (no edit
    // for those fields was sent).
    expect(ann.text).toBeUndefined();
    expect(ann.range).toBeUndefined();

    const list = await getJson(
      app,
      `/api/dev/editorial-review/entry/${ENTRY_UUID}/annotations`,
    );
    const annotations = asObj(list.body).annotations;
    if (!Array.isArray(annotations)) throw new Error('expected array');
    expect(annotations).toHaveLength(1);
    const c = asObj(annotations[0]);
    expect(c.type).toBe('comment');
    expect(c.text).toBe('leave-as-is');
    expect(c.range).toEqual({ start: 0, end: 5 });
    expect(c.category).toBe('voice-drift');
  });

  it('accepts a combined text + category payload and the folded read reflects both', async () => {
    const app = createApp({ projectRoot, config: cfg });
    const commentId = await seedComment(app, 'before');
    const { status } = await patchJson(
      app,
      `/api/dev/editorial-review/entry/${ENTRY_UUID}/comments/${commentId}`,
      { text: 'after', category: 'structural' },
    );
    expect(status).toBe(200);

    const list = await getJson(
      app,
      `/api/dev/editorial-review/entry/${ENTRY_UUID}/annotations`,
    );
    const annotations = asObj(list.body).annotations;
    if (!Array.isArray(annotations)) throw new Error('expected array');
    const c = asObj(annotations[0]);
    expect(c.text).toBe('after');
    expect(c.category).toBe('structural');
    expect(c.range).toEqual({ start: 0, end: 5 });
  });

  it('returns 400 when category is not in the known enum', async () => {
    const app = createApp({ projectRoot, config: cfg });
    const commentId = await seedComment(app);
    const { status, body } = await patchJson(
      app,
      `/api/dev/editorial-review/entry/${ENTRY_UUID}/comments/${commentId}`,
      { category: 'made-up-category' },
    );
    expect(status).toBe(400);
    expect(asObj(body).error).toMatch(/category/i);
  });
});

describe('DELETE /api/dev/editorial-review/entry/:entryId/comments/:commentId', () => {
  let projectRoot: string;
  let cfg: DeskworkConfig;

  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), 'dw-entry-comment-delete-'));
    cfg = makeConfig();
    await mkdir(join(projectRoot, '.deskwork'), { recursive: true });
    await writeFile(
      join(projectRoot, '.deskwork', 'config.json'),
      JSON.stringify(cfg),
    );
    await writeSidecar(projectRoot, makeEntry());
  });

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  it('appends a delete-comment annotation and the folded read drops the comment', async () => {
    const app = createApp({ projectRoot, config: cfg });
    const commentId = await seedComment(app);

    const { status, body } = await deleteReq(
      app,
      `/api/dev/editorial-review/entry/${ENTRY_UUID}/comments/${commentId}`,
    );
    expect(status).toBe(200);
    const ann = asObj(asObj(body).annotation);
    expect(ann.type).toBe('delete-comment');
    expect(ann.commentId).toBe(commentId);

    // Folded read shows no comments.
    const list = await getJson(
      app,
      `/api/dev/editorial-review/entry/${ENTRY_UUID}/annotations`,
    );
    const annotations = asObj(list.body).annotations;
    if (!Array.isArray(annotations)) throw new Error('expected array');
    expect(annotations).toHaveLength(0);
  });

  it('preserves the original comment in the journal (audit trail)', async () => {
    const app = createApp({ projectRoot, config: cfg });
    const commentId = await seedComment(app, 'mistake');

    await deleteReq(
      app,
      `/api/dev/editorial-review/entry/${ENTRY_UUID}/comments/${commentId}`,
    );
    // Folded read drops the comment, but if we were to read raw events
    // we'd still see the original. The folded GET /annotations is the
    // route we have here; we verify the live store via a second journal
    // event being present using a follow-up edit (which would 404 if
    // the comment had been physically removed).
    const followup = await patchJson(
      app,
      `/api/dev/editorial-review/entry/${ENTRY_UUID}/comments/${commentId}`,
      { text: 'still findable on raw' },
    );
    // A delete-comment doesn't remove the original comment from the
    // journal — the validator on edit-comment can still find it. The
    // edit lands fine; only the folded view drops the comment.
    expect(followup.status).toBe(200);
  });

  it('returns 400 when entryId is malformed', async () => {
    const app = createApp({ projectRoot, config: cfg });
    const { status, body } = await deleteReq(
      app,
      `/api/dev/editorial-review/entry/${MALFORMED_UUID}/comments/${UNKNOWN_COMMENT}`,
    );
    expect(status).toBe(400);
    expect(asObj(body).error).toMatch(/entryId/i);
  });

  it('returns 400 when commentId is malformed', async () => {
    const app = createApp({ projectRoot, config: cfg });
    const { status, body } = await deleteReq(
      app,
      `/api/dev/editorial-review/entry/${ENTRY_UUID}/comments/${MALFORMED_UUID}`,
    );
    expect(status).toBe(400);
    expect(asObj(body).error).toMatch(/commentId/i);
  });

  it('returns 404 when the entry sidecar does not exist', async () => {
    const app = createApp({ projectRoot, config: cfg });
    const { status } = await deleteReq(
      app,
      `/api/dev/editorial-review/entry/${UNKNOWN_UUID}/comments/${UNKNOWN_COMMENT}`,
    );
    expect(status).toBe(404);
  });

  it('returns 404 when the commentId is not present in the entry stream', async () => {
    const app = createApp({ projectRoot, config: cfg });
    const { status, body } = await deleteReq(
      app,
      `/api/dev/editorial-review/entry/${ENTRY_UUID}/comments/${UNKNOWN_COMMENT}`,
    );
    expect(status).toBe(404);
    expect(asObj(body).error).toMatch(/unknown commentId/i);
  });
});
