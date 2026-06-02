/**
 * Phase 8 Step 8.6.1 + 8.6.2 — HTTP route for the diff-slice endpoint
 * (`GET /api/dev/editorial-review/entry/:entryId/diff-slice`).
 *
 * Drives the route against a real tmp project tree with an entry,
 * iteration journal events, and an `address` annotation on disk.
 * Verifies the response shape the client (`fetchDiffSlice`) consumes,
 * plus the input-validation paths (malformed entryId / commentId /
 * revision query param; missing entry → 404; missing address → 404).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeSidecar } from '@deskwork/core/sidecar';
import { iterateEntry } from '@deskwork/core/iterate';
import {
  addEntryAnnotation,
  mintEntryAnnotation,
} from '@deskwork/core/entry/annotations';
import type { Entry } from '@deskwork/core/schema/entry';
import type { DeskworkConfig } from '@deskwork/core/config';
import type { DraftAnnotation } from '@deskwork/core/review/types';
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

describe('GET /api/dev/editorial-review/entry/:entryId/diff-slice', () => {
  let projectRoot: string;
  let cfg: DeskworkConfig;

  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), 'dw-diff-slice-route-'));
    cfg = makeConfig();
    await mkdir(join(projectRoot, '.deskwork'), { recursive: true });
    await mkdir(join(projectRoot, '.deskwork', 'review-journal', 'history'), {
      recursive: true,
    });
    await mkdir(join(projectRoot, 'docs', 'foo'), { recursive: true });
    await writeFile(join(projectRoot, '.deskwork', 'config.json'), JSON.stringify(cfg));
  });

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  async function setupEntryWithIterations(): Promise<void> {
    await writeSidecar(projectRoot, entryFixture());
    const indexPath = join(projectRoot, 'docs', 'foo', 'index.md');
    const v1 =
      `---\ndeskwork:\n  id: ${ENTRY_UUID}\n---\n\n` +
      '# heading\n\nfirst paragraph that needs tightening\nsecond paragraph stays put\n';
    await writeFile(indexPath, v1);
    await iterateEntry(projectRoot, { uuid: ENTRY_UUID });
    const v2 =
      `---\ndeskwork:\n  id: ${ENTRY_UUID}\n---\n\n` +
      '# heading\n\nfirst paragraph — TIGHTENED via deletion of fluff\nsecond paragraph stays put\n';
    await writeFile(indexPath, v2);
    await iterateEntry(projectRoot, { uuid: ENTRY_UUID });

    // `v2` already includes frontmatter (it's the full file contents
    // written to disk and captured by `iterateEntry` into the journal
    // as `markdown`). Compute the character offset against that
    // exact string so the comment's `range` lands on the same line as
    // the journal's revision-2 markdown.
    const start = v2.indexOf('first paragraph');
    const end = start + 'first paragraph'.length;
    const comment: DraftAnnotation = {
      id: COMMENT_ID,
      createdAt: '2026-04-30T10:00:00.000Z',
      type: 'comment',
      workflowId: ENTRY_UUID,
      version: 2,
      range: { start, end },
      text: 'tighten this',
    };
    await addEntryAnnotation(projectRoot, ENTRY_UUID, comment);
    const addressed = mintEntryAnnotation({
      type: 'address',
      workflowId: ENTRY_UUID,
      commentId: COMMENT_ID,
      version: 2,
      disposition: 'addressed',
      reason: 'tightened by deleting redundant fluff in paragraph one',
    });
    await addEntryAnnotation(projectRoot, ENTRY_UUID, addressed);
  }

  it('returns 200 with reason + non-empty hunks when the addressed paragraph changed', async () => {
    await setupEntryWithIterations();
    const app = createApp({ projectRoot, config: cfg });
    const { status, body } = await getJson(
      app,
      `/api/dev/editorial-review/entry/${ENTRY_UUID}/diff-slice?commentId=${COMMENT_ID}&revision=2`,
    );
    expect(status).toBe(200);
    const obj = asObj(body);
    expect(obj.reason).toBe('tightened by deleting redundant fluff in paragraph one');
    expect(Array.isArray(obj.hunks)).toBe(true);
    const hunks = obj.hunks as unknown[];
    expect(hunks.length).toBeGreaterThan(0);
    expect(obj.notes).toBeUndefined();
  });

  it('returns 400 on a malformed entryId', async () => {
    const app = createApp({ projectRoot, config: cfg });
    const { status } = await getJson(
      app,
      `/api/dev/editorial-review/entry/not-a-uuid/diff-slice?commentId=${COMMENT_ID}&revision=2`,
    );
    expect(status).toBe(400);
  });

  it('returns 400 on a malformed commentId', async () => {
    await writeSidecar(projectRoot, entryFixture());
    const app = createApp({ projectRoot, config: cfg });
    const { status } = await getJson(
      app,
      `/api/dev/editorial-review/entry/${ENTRY_UUID}/diff-slice?commentId=not-a-uuid&revision=2`,
    );
    expect(status).toBe(400);
  });

  it('returns 400 on a missing revision query param', async () => {
    await writeSidecar(projectRoot, entryFixture());
    const app = createApp({ projectRoot, config: cfg });
    const { status } = await getJson(
      app,
      `/api/dev/editorial-review/entry/${ENTRY_UUID}/diff-slice?commentId=${COMMENT_ID}`,
    );
    expect(status).toBe(400);
  });

  it('returns 400 on a zero or negative revision', async () => {
    await writeSidecar(projectRoot, entryFixture());
    const app = createApp({ projectRoot, config: cfg });
    const { status: s1 } = await getJson(
      app,
      `/api/dev/editorial-review/entry/${ENTRY_UUID}/diff-slice?commentId=${COMMENT_ID}&revision=0`,
    );
    expect(s1).toBe(400);
    const { status: s2 } = await getJson(
      app,
      `/api/dev/editorial-review/entry/${ENTRY_UUID}/diff-slice?commentId=${COMMENT_ID}&revision=-1`,
    );
    expect(s2).toBe(400);
  });

  it('returns 400 on a non-numeric revision', async () => {
    await writeSidecar(projectRoot, entryFixture());
    const app = createApp({ projectRoot, config: cfg });
    const { status } = await getJson(
      app,
      `/api/dev/editorial-review/entry/${ENTRY_UUID}/diff-slice?commentId=${COMMENT_ID}&revision=abc`,
    );
    expect(status).toBe(400);
  });

  it('returns 404 when the entry sidecar does not exist', async () => {
    const app = createApp({ projectRoot, config: cfg });
    const { status } = await getJson(
      app,
      `/api/dev/editorial-review/entry/${UNKNOWN_UUID}/diff-slice?commentId=${COMMENT_ID}&revision=2`,
    );
    expect(status).toBe(404);
  });

  it('returns 404 when the comment has no addressed annotation on that revision', async () => {
    await writeSidecar(projectRoot, entryFixture());
    const app = createApp({ projectRoot, config: cfg });
    const { status } = await getJson(
      app,
      `/api/dev/editorial-review/entry/${ENTRY_UUID}/diff-slice?commentId=${COMMENT_ID}&revision=2`,
    );
    // sidecar exists, but no comment + no address on it.
    expect(status).toBe(404);
  });
});
