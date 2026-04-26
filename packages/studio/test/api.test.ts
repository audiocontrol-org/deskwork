/**
 * In-process integration tests for the studio HTTP API. Builds the Hono
 * app against a tmp project (no real port binding), then drives it via
 * `app.fetch(request)` calls. Verifies each endpoint returns the same
 * shape that lib/review/handlers produces — the routing layer is just
 * plumbing.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { DeskworkConfig } from '@deskwork/core/config';
import { createWorkflow } from '@deskwork/core/review/pipeline';
import { createApp } from '../src/server.ts';

function makeConfig(): DeskworkConfig {
  return {
    version: 1,
    sites: {
      a: {
        host: 'a.example',
        contentDir: 'src/sites/a/content/blog',
        calendarPath: 'docs/cal-a.md',
        blogFilenameTemplate: '{slug}.md',
      },
    },
    defaultSite: 'a',
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
      headers: { 'content-type': 'application/json' },
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

async function getText(
  app: ReturnType<typeof createApp>,
  path: string,
): Promise<{ status: number; text: string }> {
  const res = await app.fetch(new Request(`http://x${path}`));
  return { status: res.status, text: await res.text() };
}

describe('studio API', () => {
  let root: string;
  let app: ReturnType<typeof createApp>;
  let cfg: DeskworkConfig;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'deskwork-studio-test-'));
    cfg = makeConfig();
    app = createApp({ projectRoot: root, config: cfg });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  describe('POST /annotate', () => {
    it('mints a comment annotation and returns it', async () => {
      const w = createWorkflow(root, cfg, {
        site: 'a',
        slug: 'p',
        contentKind: 'longform',
        initialMarkdown: '# v1',
      });
      const r = await postJson(app, '/api/dev/editorial-review/annotate', {
        type: 'comment',
        workflowId: w.id,
        version: 1,
        range: { start: 0, end: 3 },
        text: 'tighten',
      });
      expect(r.status).toBe(200);
      const body = r.body as { annotation: { id: string } };
      expect(body.annotation.id).toMatch(/./);
    });

    it('returns 400 for invalid JSON', async () => {
      const res = await app.fetch(
        new Request('http://x/api/dev/editorial-review/annotate', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{ broken',
        }),
      );
      expect(res.status).toBe(400);
    });

    it('returns 404 for unknown workflow', async () => {
      const r = await postJson(app, '/api/dev/editorial-review/annotate', {
        type: 'approve',
        workflowId: 'no-such',
        version: 1,
      });
      expect(r.status).toBe(404);
    });
  });

  describe('GET /annotations', () => {
    it('lists annotations filtered by workflowId', async () => {
      const w = createWorkflow(root, cfg, {
        site: 'a',
        slug: 'p',
        contentKind: 'longform',
        initialMarkdown: '#',
      });
      await postJson(app, '/api/dev/editorial-review/annotate', {
        type: 'comment',
        workflowId: w.id,
        version: 1,
        range: { start: 0, end: 1 },
        text: 'a',
      });
      const r = await getJson(
        app,
        `/api/dev/editorial-review/annotations?workflowId=${w.id}`,
      );
      expect(r.status).toBe(200);
      expect((r.body as { annotations: unknown[] }).annotations).toHaveLength(1);
    });
  });

  describe('POST /decision', () => {
    it('advances workflow state', async () => {
      const w = createWorkflow(root, cfg, {
        site: 'a',
        slug: 'p',
        contentKind: 'longform',
        initialMarkdown: '#',
      });
      const r = await postJson(app, '/api/dev/editorial-review/decision', {
        workflowId: w.id,
        to: 'in-review',
      });
      expect(r.status).toBe(200);
      expect((r.body as { workflow: { state: string } }).workflow.state).toBe(
        'in-review',
      );
    });
  });

  describe('GET /workflow', () => {
    it('looks up by (site, slug)', async () => {
      const w = createWorkflow(root, cfg, {
        site: 'a',
        slug: 'lookup-me',
        contentKind: 'longform',
        initialMarkdown: '#',
      });
      const r = await getJson(
        app,
        `/api/dev/editorial-review/workflow?site=a&slug=lookup-me`,
      );
      expect(r.status).toBe(200);
      expect((r.body as { workflow: { id: string } }).workflow.id).toBe(w.id);
    });
  });

  describe('POST /version', () => {
    it('writes disk + appends a version + records edit annotation', async () => {
      const slug = 'savable';
      const blogFile = join(root, 'src/sites/a/content/blog', `${slug}.md`);
      mkdirSync(dirname(blogFile), { recursive: true });
      writeFileSync(blogFile, '# v1\n', 'utf-8');
      const w = createWorkflow(root, cfg, {
        site: 'a',
        slug,
        contentKind: 'longform',
        initialMarkdown: '# v1\n',
      });
      const r = await postJson(app, '/api/dev/editorial-review/version', {
        workflowId: w.id,
        beforeVersion: 1,
        afterMarkdown: '# v1\n\nnew content\n',
      });
      expect(r.status).toBe(200);
      expect(readFileSync(blogFile, 'utf-8')).toContain('new content');
    });
  });

  describe('POST /start-longform', () => {
    it('enqueues a longform workflow from a blog file', async () => {
      const slug = 'startable';
      const blogFile = join(root, 'src/sites/a/content/blog', `${slug}.md`);
      mkdirSync(dirname(blogFile), { recursive: true });
      writeFileSync(blogFile, '# Body', 'utf-8');
      const r = await postJson(app, '/api/dev/editorial-review/start-longform', {
        site: 'a',
        slug,
      });
      expect(r.status).toBe(200);
      expect((r.body as { workflow: { slug: string } }).workflow.slug).toBe(
        slug,
      );
    });

    it('returns 404 when the blog file does not exist', async () => {
      const r = await postJson(app, '/api/dev/editorial-review/start-longform', {
        site: 'a',
        slug: 'missing',
      });
      expect(r.status).toBe(404);
    });
  });
});

describe('studio pages', () => {
  let root: string;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'deskwork-studio-pages-'));
    app = createApp({ projectRoot: root, config: makeConfig() });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('GET /dev/editorial-studio renders the dashboard', async () => {
    const r = await getText(app, '/dev/editorial-studio');
    expect(r.status).toBe(200);
    expect(r.text).toContain('Editorial Studio');
    expect(r.text).toContain('id="studio-state"');
  });

  it('GET /dev/editorial-review-shortform renders', async () => {
    const r = await getText(app, '/dev/editorial-review-shortform');
    expect(r.status).toBe(200);
    expect(r.text).toContain('Shortform Review');
  });

  it('GET / redirects to the dashboard', async () => {
    const res = await app.fetch(new Request('http://x/'), {});
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/dev/editorial-studio');
  });
});
