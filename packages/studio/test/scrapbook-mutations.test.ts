/**
 * Integration tests for the standalone scrapbook viewer's mutation
 * endpoints. Boots the studio app against a tmp project, drives each
 * endpoint via app.fetch(), and asserts both the happy path and the
 * error shapes (400 on traversal, 404 on unknown site/missing file,
 * 409 on rename/create collisions).
 *
 * Issue #21 — closes the Phase 13 / Phase 16d gap where the client
 * had save/rename/delete/create/upload handlers but no server.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DeskworkConfig } from '@deskwork/core/config';
import { createApp } from '../src/server.ts';

function makeConfig(): DeskworkConfig {
  return {
    version: 1,
    sites: {
      wc: {
        host: 'wc.example',
        contentDir: 'src/content/projects',
        calendarPath: 'docs/cal.md',
        blogFilenameTemplate: '{slug}/index.md',
      },
    },
    defaultSite: 'wc',
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

describe('scrapbook mutation API (#21)', () => {
  let root: string;
  let app: ReturnType<typeof createApp>;
  let cfg: DeskworkConfig;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'deskwork-scrap-mut-'));
    cfg = makeConfig();
    app = createApp({ projectRoot: root, config: cfg });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function scrapbookDirFor(slug: string): string {
    return join(root, 'src/content/projects', slug, 'scrapbook');
  }

  function seedScrapbookFile(slug: string, name: string, body: string): void {
    const dir = scrapbookDirFor(slug);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, name), body);
  }

  // -------------------------------------------------------------------
  // /save
  // -------------------------------------------------------------------

  describe('POST /api/dev/scrapbook/save', () => {
    it('overwrites an existing file and returns the updated item', async () => {
      const slug = 'the-outbound';
      seedScrapbookFile(slug, 'notes.md', '# old\n');
      const r = await postJson(app, '/api/dev/scrapbook/save', {
        site: 'wc',
        slug,
        filename: 'notes.md',
        body: '# new body\n',
      });
      expect(r.status).toBe(200);
      const onDisk = readFileSync(
        join(scrapbookDirFor(slug), 'notes.md'),
        'utf-8',
      );
      expect(onDisk).toBe('# new body\n');
      expect((r.body as { item: { name: string } }).item.name).toBe('notes.md');
    });

    it('creates a new markdown file when it does not exist', async () => {
      const slug = 'first-save';
      mkdirSync(join(root, 'src/content/projects', slug), { recursive: true });
      const r = await postJson(app, '/api/dev/scrapbook/save', {
        site: 'wc',
        slug,
        filename: 'fresh.md',
        body: '# fresh\n',
      });
      expect(r.status).toBe(200);
      expect(existsSync(join(scrapbookDirFor(slug), 'fresh.md'))).toBe(true);
    });

    it('rejects path traversal in filename with 400', async () => {
      const r = await postJson(app, '/api/dev/scrapbook/save', {
        site: 'wc',
        slug: 'whatever',
        filename: '../escape.md',
        body: 'x',
      });
      expect(r.status).toBe(400);
      expect((r.body as { error: string }).error).toMatch(/path separator/i);
    });

    it('rejects unknown site with 404', async () => {
      const r = await postJson(app, '/api/dev/scrapbook/save', {
        site: 'nope',
        slug: 'p',
        filename: 'a.md',
        body: 'x',
      });
      expect(r.status).toBe(404);
    });

    it('rejects missing filename with 400', async () => {
      const r = await postJson(app, '/api/dev/scrapbook/save', {
        site: 'wc',
        slug: 'p',
        body: 'x',
      });
      expect(r.status).toBe(400);
    });

    it('rejects invalid JSON with 400', async () => {
      const res = await app.fetch(
        new Request('http://x/api/dev/scrapbook/save', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{not json',
        }),
      );
      expect(res.status).toBe(400);
    });
  });

  // -------------------------------------------------------------------
  // /rename
  // -------------------------------------------------------------------

  describe('POST /api/dev/scrapbook/rename', () => {
    it('renames a file in place', async () => {
      const slug = 'rename-me';
      seedScrapbookFile(slug, 'old.md', '# x\n');
      const r = await postJson(app, '/api/dev/scrapbook/rename', {
        site: 'wc',
        slug,
        oldName: 'old.md',
        newName: 'new.md',
      });
      expect(r.status).toBe(200);
      const dir = scrapbookDirFor(slug);
      expect(existsSync(join(dir, 'old.md'))).toBe(false);
      expect(existsSync(join(dir, 'new.md'))).toBe(true);
    });

    it('returns 409 when newName already exists', async () => {
      const slug = 'collide';
      seedScrapbookFile(slug, 'a.md', 'A');
      seedScrapbookFile(slug, 'b.md', 'B');
      const r = await postJson(app, '/api/dev/scrapbook/rename', {
        site: 'wc',
        slug,
        oldName: 'a.md',
        newName: 'b.md',
      });
      expect(r.status).toBe(409);
    });

    it('returns 404 when oldName is missing', async () => {
      const slug = 'missing';
      mkdirSync(scrapbookDirFor(slug), { recursive: true });
      const r = await postJson(app, '/api/dev/scrapbook/rename', {
        site: 'wc',
        slug,
        oldName: 'gone.md',
        newName: 'new.md',
      });
      expect(r.status).toBe(404);
    });

    it('rejects traversal in newName', async () => {
      const slug = 'trav';
      seedScrapbookFile(slug, 'a.md', 'A');
      const r = await postJson(app, '/api/dev/scrapbook/rename', {
        site: 'wc',
        slug,
        oldName: 'a.md',
        newName: '../../escape.md',
      });
      expect(r.status).toBe(400);
    });
  });

  // -------------------------------------------------------------------
  // /delete
  // -------------------------------------------------------------------

  describe('POST /api/dev/scrapbook/delete', () => {
    it('unlinks an existing file', async () => {
      const slug = 'del';
      seedScrapbookFile(slug, 'gone.md', '# gone\n');
      const r = await postJson(app, '/api/dev/scrapbook/delete', {
        site: 'wc',
        slug,
        filename: 'gone.md',
      });
      expect(r.status).toBe(200);
      expect(existsSync(join(scrapbookDirFor(slug), 'gone.md'))).toBe(false);
    });

    it('returns 404 when file is missing', async () => {
      const slug = 'absent';
      mkdirSync(scrapbookDirFor(slug), { recursive: true });
      const r = await postJson(app, '/api/dev/scrapbook/delete', {
        site: 'wc',
        slug,
        filename: 'never-existed.md',
      });
      expect(r.status).toBe(404);
    });

    it('rejects traversal in filename', async () => {
      const r = await postJson(app, '/api/dev/scrapbook/delete', {
        site: 'wc',
        slug: 'x',
        filename: '../../../../etc/passwd',
      });
      expect(r.status).toBe(400);
    });
  });

  // -------------------------------------------------------------------
  // /create
  // -------------------------------------------------------------------

  describe('POST /api/dev/scrapbook/create', () => {
    it('creates a new markdown file with the given body', async () => {
      const slug = 'creator';
      const r = await postJson(app, '/api/dev/scrapbook/create', {
        site: 'wc',
        slug,
        filename: 'note.md',
        body: 'hello',
      });
      expect(r.status).toBe(200);
      const onDisk = readFileSync(
        join(scrapbookDirFor(slug), 'note.md'),
        'utf-8',
      );
      expect(onDisk).toBe('hello');
    });

    it('returns 409 when the file already exists', async () => {
      const slug = 'exists';
      seedScrapbookFile(slug, 'taken.md', 'x');
      const r = await postJson(app, '/api/dev/scrapbook/create', {
        site: 'wc',
        slug,
        filename: 'taken.md',
        body: 'y',
      });
      expect(r.status).toBe(409);
    });

    it('rejects non-markdown extensions per the core helper contract', async () => {
      const slug = 'wrongkind';
      const r = await postJson(app, '/api/dev/scrapbook/create', {
        site: 'wc',
        slug,
        filename: 'note.txt',
        body: 'x',
      });
      expect(r.status).toBe(400);
    });

    it('rejects traversal in filename', async () => {
      const r = await postJson(app, '/api/dev/scrapbook/create', {
        site: 'wc',
        slug: 'whatever',
        filename: '../../escape.md',
        body: 'x',
      });
      expect(r.status).toBe(400);
    });

    it('rejects unknown site with 404', async () => {
      const r = await postJson(app, '/api/dev/scrapbook/create', {
        site: 'nope',
        slug: 'p',
        filename: 'a.md',
        body: 'x',
      });
      expect(r.status).toBe(404);
    });
  });

  // -------------------------------------------------------------------
  // /upload
  // -------------------------------------------------------------------

  describe('POST /api/dev/scrapbook/upload', () => {
    async function postMultipart(
      path: string,
      fields: Record<string, string | { name: string; bytes: Uint8Array; type?: string }>,
    ): Promise<{ status: number; body: unknown }> {
      const fd = new FormData();
      for (const [k, v] of Object.entries(fields)) {
        if (typeof v === 'string') {
          fd.append(k, v);
        } else {
          // Copy bytes into a fresh ArrayBuffer-backed Uint8Array so
          // the BlobPart type (which wants ArrayBuffer, not the wider
          // ArrayBufferLike) is satisfied without `as` casts.
          const ab = new ArrayBuffer(v.bytes.byteLength);
          new Uint8Array(ab).set(v.bytes);
          fd.append(
            k,
            new File([ab], v.name, { type: v.type ?? 'application/octet-stream' }),
          );
        }
      }
      const res = await app.fetch(
        new Request(`http://x${path}`, { method: 'POST', body: fd }),
      );
      return { status: res.status, body: await res.json() };
    }

    it('persists an uploaded binary file', async () => {
      const slug = 'uploader';
      const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);
      const r = await postMultipart('/api/dev/scrapbook/upload', {
        site: 'wc',
        slug,
        file: { name: 'pic.png', bytes, type: 'image/png' },
      });
      expect(r.status).toBe(200);
      const written = readFileSync(join(scrapbookDirFor(slug), 'pic.png'));
      expect(Array.from(written)).toEqual(Array.from(bytes));
    });

    it('returns 409 when the upload target already exists', async () => {
      const slug = 'collide-upload';
      seedScrapbookFile(slug, 'pic.png', 'fake');
      const r = await postMultipart('/api/dev/scrapbook/upload', {
        site: 'wc',
        slug,
        file: { name: 'pic.png', bytes: new Uint8Array([1, 2, 3]) },
      });
      expect(r.status).toBe(409);
    });

    it('rejects traversal in the uploaded filename', async () => {
      const r = await postMultipart('/api/dev/scrapbook/upload', {
        site: 'wc',
        slug: 'x',
        file: { name: '../escape.png', bytes: new Uint8Array([0]) },
      });
      expect(r.status).toBe(400);
    });

    it('rejects unknown site with 404', async () => {
      const r = await postMultipart('/api/dev/scrapbook/upload', {
        site: 'nope',
        slug: 'p',
        file: { name: 'a.png', bytes: new Uint8Array([0]) },
      });
      expect(r.status).toBe(404);
    });

    it('rejects missing file part with 400', async () => {
      const r = await postMultipart('/api/dev/scrapbook/upload', {
        site: 'wc',
        slug: 'p',
      });
      expect(r.status).toBe(400);
    });
  });

  // -------------------------------------------------------------------
  // Hierarchical slugs (Phase 13 path-addressed scrapbooks)
  // -------------------------------------------------------------------

  describe('hierarchical slugs', () => {
    it('round-trips create + save + delete on a deeply nested slug', async () => {
      const slug = 'the-outbound/characters/strivers';
      // Create
      const cr = await postJson(app, '/api/dev/scrapbook/create', {
        site: 'wc',
        slug,
        filename: 'archetypes.md',
        body: '# v1\n',
      });
      expect(cr.status).toBe(200);
      // Save
      const sv = await postJson(app, '/api/dev/scrapbook/save', {
        site: 'wc',
        slug,
        filename: 'archetypes.md',
        body: '# v2\n',
      });
      expect(sv.status).toBe(200);
      const onDisk = readFileSync(
        join(scrapbookDirFor(slug), 'archetypes.md'),
        'utf-8',
      );
      expect(onDisk).toBe('# v2\n');
      // Delete
      const dl = await postJson(app, '/api/dev/scrapbook/delete', {
        site: 'wc',
        slug,
        filename: 'archetypes.md',
      });
      expect(dl.status).toBe(200);
    });
  });
});
