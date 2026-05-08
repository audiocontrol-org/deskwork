/**
 * Integration tests for the standalone scrapbook viewer's mutation
 * endpoints. Boots the studio app against a tmp project, drives each
 * endpoint via app.fetch(), and asserts both the happy path and the
 * error shapes (400 on traversal, 404 on unknown site/missing file,
 * 409 on rename/create collisions).
 *
 * Issue #21 — closes the Phase 13 / Phase 16d gap where the client
 * had save/rename/delete/create/upload handlers but no server.
 *
 * Issue #191 — entry-id mutation envelope (regression suite at the
 * bottom): when `entryId` is supplied, mutations must resolve via
 * `scrapbookDirForEntry` (parent of the entry's artifact file) rather
 * than the `<contentDir>/<slug>/scrapbook/` slug-template path. Slug
 * mode remains as a deprecation-window fallback and stays covered above.
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
import { dirname, join } from 'node:path';
import type { DeskworkConfig } from '@deskwork/core/config';
import { writeSidecar } from '@deskwork/core/sidecar';
import type { Entry } from '@deskwork/core/schema/entry';
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
  // Secret-flag (#28)
  // -------------------------------------------------------------------

  describe('secret flag', () => {
    function secretDirFor(slug: string): string {
      return join(scrapbookDirFor(slug), 'secret');
    }

    it('create with secret:true writes under scrapbook/secret/', async () => {
      const slug = 'sec-create';
      const r = await postJson(app, '/api/dev/scrapbook/create', {
        site: 'wc',
        slug,
        filename: 'note.md',
        body: 'hush',
        secret: true,
      });
      expect(r.status).toBe(200);
      expect(existsSync(join(secretDirFor(slug), 'note.md'))).toBe(true);
      expect(existsSync(join(scrapbookDirFor(slug), 'note.md'))).toBe(false);
    });

    it('save with secret:true writes under scrapbook/secret/', async () => {
      const slug = 'sec-save';
      mkdirSync(secretDirFor(slug), { recursive: true });
      writeFileSync(join(secretDirFor(slug), 'a.md'), 'old');
      const r = await postJson(app, '/api/dev/scrapbook/save', {
        site: 'wc',
        slug,
        filename: 'a.md',
        body: 'new',
        secret: true,
      });
      expect(r.status).toBe(200);
      expect(
        readFileSync(join(secretDirFor(slug), 'a.md'), 'utf-8'),
      ).toBe('new');
    });

    it('delete with secret:true unlinks under scrapbook/secret/', async () => {
      const slug = 'sec-delete';
      mkdirSync(secretDirFor(slug), { recursive: true });
      writeFileSync(join(secretDirFor(slug), 'gone.md'), 'x');
      const r = await postJson(app, '/api/dev/scrapbook/delete', {
        site: 'wc',
        slug,
        filename: 'gone.md',
        secret: true,
      });
      expect(r.status).toBe(200);
      expect(existsSync(join(secretDirFor(slug), 'gone.md'))).toBe(false);
    });

    it('rejects non-boolean secret with 400', async () => {
      const r = await postJson(app, '/api/dev/scrapbook/create', {
        site: 'wc',
        slug: 'p',
        filename: 'a.md',
        body: 'x',
        secret: 'true',
      });
      expect(r.status).toBe(400);
    });
  });

  // -------------------------------------------------------------------
  // Cross-section rename (#28: public ↔ secret)
  // -------------------------------------------------------------------

  describe('cross-section rename', () => {
    function secretDirFor(slug: string): string {
      return join(scrapbookDirFor(slug), 'secret');
    }

    it('moves a public file into scrapbook/secret/ when toSecret:true', async () => {
      const slug = 'cross1';
      seedScrapbookFile(slug, 'plan.md', '# plan\n');
      const r = await postJson(app, '/api/dev/scrapbook/rename', {
        site: 'wc',
        slug,
        oldName: 'plan.md',
        newName: 'plan.md',
        secret: false,
        toSecret: true,
      });
      expect(r.status).toBe(200);
      expect(existsSync(join(scrapbookDirFor(slug), 'plan.md'))).toBe(false);
      expect(existsSync(join(secretDirFor(slug), 'plan.md'))).toBe(true);
    });

    it('moves a secret file out to public when toSecret:false', async () => {
      const slug = 'cross2';
      mkdirSync(secretDirFor(slug), { recursive: true });
      writeFileSync(join(secretDirFor(slug), 'note.md'), '# n\n');
      const r = await postJson(app, '/api/dev/scrapbook/rename', {
        site: 'wc',
        slug,
        oldName: 'note.md',
        newName: 'note.md',
        secret: true,
        toSecret: false,
      });
      expect(r.status).toBe(200);
      expect(existsSync(join(secretDirFor(slug), 'note.md'))).toBe(false);
      expect(existsSync(join(scrapbookDirFor(slug), 'note.md'))).toBe(true);
    });

    it('renames AND moves cross-section in one call', async () => {
      const slug = 'cross3';
      seedScrapbookFile(slug, 'old.md', '# o\n');
      const r = await postJson(app, '/api/dev/scrapbook/rename', {
        site: 'wc',
        slug,
        oldName: 'old.md',
        newName: 'new.md',
        secret: false,
        toSecret: true,
      });
      expect(r.status).toBe(200);
      expect(existsSync(join(scrapbookDirFor(slug), 'old.md'))).toBe(false);
      expect(existsSync(join(secretDirFor(slug), 'new.md'))).toBe(true);
    });

    it('returns 409 when the destination already has the target name', async () => {
      const slug = 'cross4';
      seedScrapbookFile(slug, 'a.md', 'A');
      mkdirSync(secretDirFor(slug), { recursive: true });
      writeFileSync(join(secretDirFor(slug), 'a.md'), 'B');
      const r = await postJson(app, '/api/dev/scrapbook/rename', {
        site: 'wc',
        slug,
        oldName: 'a.md',
        newName: 'a.md',
        secret: false,
        toSecret: true,
      });
      expect(r.status).toBe(409);
      // Both files still in place.
      expect(existsSync(join(scrapbookDirFor(slug), 'a.md'))).toBe(true);
      expect(existsSync(join(secretDirFor(slug), 'a.md'))).toBe(true);
    });

    it('returns 404 when the source file is missing in the source section', async () => {
      const slug = 'cross5';
      mkdirSync(scrapbookDirFor(slug), { recursive: true });
      const r = await postJson(app, '/api/dev/scrapbook/rename', {
        site: 'wc',
        slug,
        oldName: 'gone.md',
        newName: 'gone.md',
        secret: false,
        toSecret: true,
      });
      expect(r.status).toBe(404);
    });

    it('rejects non-boolean toSecret with 400', async () => {
      const slug = 'cross6';
      seedScrapbookFile(slug, 'a.md', 'A');
      const r = await postJson(app, '/api/dev/scrapbook/rename', {
        site: 'wc',
        slug,
        oldName: 'a.md',
        newName: 'b.md',
        toSecret: 'true',
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

  // -------------------------------------------------------------------
  // #191 — entry-id mutation envelope
  // -------------------------------------------------------------------
  //
  // Regression: the bug surfaces when an entry's artifact lives at a
  // path that doesn't match `<contentDir>/<slug>/index.md` — e.g. a
  // feature PRD at `docs/0.16.0/001-IN-PROGRESS/<slug>/prd.md`. Reads
  // resolve via `scrapbookDirForEntry` (entry-aware); pre-fix mutations
  // resolved via the slug template, orphaning writes into
  // `<contentDir>/<slug>/scrapbook/` while reads kept returning the
  // entry's real (empty) scrapbook elsewhere. Both paths must converge
  // on the entry's artifact-parent directory.

  describe('entry-id mutation envelope (#191)', () => {
    const ENTRY_UUID = 'b3f20364-969a-4004-87bd-278cd5992e3c';

    /**
     * Seed a calendar entry whose artifact lives at a non-kebab-case
     * path (the writingcontrol-shape failure mode the issue describes).
     * `<contentDir>` here is `src/content/projects` from `makeConfig`;
     * the artifact lands under it at a non-slug-template path so the
     * slug template would resolve elsewhere if any helper used it.
     */
    async function seedEntryAtNonSlugPath(slug: string): Promise<{
      artifactDir: string;
      artifactPath: string;
      slugTemplateScrapbookDir: string;
    }> {
      // Non-kebab-case path the slug template would NEVER produce — has
      // a dotted version segment AND uppercase status segment.
      const artifactRelDir = join(
        'src/content/projects',
        '0.16.0',
        '001-IN-PROGRESS',
        slug,
      );
      const artifactDir = join(root, artifactRelDir);
      mkdirSync(artifactDir, { recursive: true });
      const artifactPath = join(artifactDir, 'prd.md');
      writeFileSync(
        artifactPath,
        `---\ndeskwork:\n  id: ${ENTRY_UUID}\n---\n\n# ${slug}\n`,
      );
      const entry: Entry = {
        uuid: ENTRY_UUID,
        slug,
        title: slug,
        keywords: [],
        source: 'manual',
        currentStage: 'Drafting',
        iterationByStage: { Drafting: 1 },
        createdAt: '2026-05-04T00:00:00.000Z',
        updatedAt: '2026-05-04T00:00:00.000Z',
      };
      await writeSidecar(root, entry);
      // What the slug-template would have resolved to (the orphan path).
      const slugTemplateScrapbookDir = join(
        root,
        'src/content/projects',
        slug,
        'scrapbook',
      );
      return { artifactDir, artifactPath, slugTemplateScrapbookDir };
    }

    it('save with entryId writes to dirname(artifact)/scrapbook/, NOT slug-template path', async () => {
      const slug = 'open-issue-tranche-cleanup';
      const { artifactDir, slugTemplateScrapbookDir } =
        await seedEntryAtNonSlugPath(slug);

      const r = await postJson(app, '/api/dev/scrapbook/save', {
        site: 'wc',
        entryId: ENTRY_UUID,
        filename: 'note.md',
        body: '# entry-aware save\n',
      });
      expect(r.status).toBe(200);

      // The file MUST land in the entry's artifact-parent directory.
      const entryAwarePath = join(artifactDir, 'scrapbook', 'note.md');
      expect(existsSync(entryAwarePath)).toBe(true);
      expect(readFileSync(entryAwarePath, 'utf-8')).toBe('# entry-aware save\n');

      // The slug-template orphan path MUST NOT have been written. This
      // is the load-bearing check — the bug is not "write didn't land"
      // but "write landed in two places" / "write landed in the wrong place".
      expect(existsSync(slugTemplateScrapbookDir)).toBe(false);
    });

    it('create with entryId writes to dirname(artifact)/scrapbook/', async () => {
      const slug = 'create-via-entry';
      const { artifactDir, slugTemplateScrapbookDir } =
        await seedEntryAtNonSlugPath(slug);

      const r = await postJson(app, '/api/dev/scrapbook/create', {
        site: 'wc',
        entryId: ENTRY_UUID,
        filename: 'fresh.md',
        body: '# fresh entry-aware\n',
      });
      expect(r.status).toBe(200);

      const entryAwarePath = join(artifactDir, 'scrapbook', 'fresh.md');
      expect(existsSync(entryAwarePath)).toBe(true);
      expect(existsSync(slugTemplateScrapbookDir)).toBe(false);
    });

    it('upload with entryId writes to dirname(artifact)/scrapbook/', async () => {
      const slug = 'upload-via-entry';
      const { artifactDir, slugTemplateScrapbookDir } =
        await seedEntryAtNonSlugPath(slug);

      const fd = new FormData();
      fd.append('site', 'wc');
      fd.append('entryId', ENTRY_UUID);
      const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
      const ab = new ArrayBuffer(bytes.byteLength);
      new Uint8Array(ab).set(bytes);
      fd.append('file', new File([ab], 'pic.png', { type: 'image/png' }));
      const res = await app.fetch(
        new Request('http://x/api/dev/scrapbook/upload', {
          method: 'POST',
          body: fd,
        }),
      );
      expect(res.status).toBe(200);

      const entryAwarePath = join(artifactDir, 'scrapbook', 'pic.png');
      expect(existsSync(entryAwarePath)).toBe(true);
      const written = readFileSync(entryAwarePath);
      expect(Array.from(written)).toEqual(Array.from(bytes));
      expect(existsSync(slugTemplateScrapbookDir)).toBe(false);
    });

    it('rename with entryId operates inside dirname(artifact)/scrapbook/', async () => {
      const slug = 'rename-via-entry';
      const { artifactDir, slugTemplateScrapbookDir } =
        await seedEntryAtNonSlugPath(slug);

      // Seed a file in the entry-aware location first.
      const entryScrapbook = join(artifactDir, 'scrapbook');
      mkdirSync(entryScrapbook, { recursive: true });
      writeFileSync(join(entryScrapbook, 'old.md'), '# x\n');

      const r = await postJson(app, '/api/dev/scrapbook/rename', {
        site: 'wc',
        entryId: ENTRY_UUID,
        oldName: 'old.md',
        newName: 'new.md',
      });
      expect(r.status).toBe(200);
      expect(existsSync(join(entryScrapbook, 'old.md'))).toBe(false);
      expect(existsSync(join(entryScrapbook, 'new.md'))).toBe(true);
      expect(existsSync(slugTemplateScrapbookDir)).toBe(false);
    });

    it('delete with entryId operates inside dirname(artifact)/scrapbook/', async () => {
      const slug = 'delete-via-entry';
      const { artifactDir, slugTemplateScrapbookDir } =
        await seedEntryAtNonSlugPath(slug);

      const entryScrapbook = join(artifactDir, 'scrapbook');
      mkdirSync(entryScrapbook, { recursive: true });
      writeFileSync(join(entryScrapbook, 'gone.md'), '# x\n');

      const r = await postJson(app, '/api/dev/scrapbook/delete', {
        site: 'wc',
        entryId: ENTRY_UUID,
        filename: 'gone.md',
      });
      expect(r.status).toBe(200);
      expect(existsSync(join(entryScrapbook, 'gone.md'))).toBe(false);
      expect(existsSync(slugTemplateScrapbookDir)).toBe(false);
    });

    it('rejects malformed entryId with 400 BEFORE filesystem access', async () => {
      // No sidecar seeded — the UUID validation must fail first, before
      // `readSidecar` would try to compose `<root>/.deskwork/entries/...`.
      // Also tests the path-traversal probe vector that the scrapbook-file
      // route guards against.
      const r = await postJson(app, '/api/dev/scrapbook/save', {
        site: 'wc',
        entryId: '../../../etc/passwd',
        filename: 'note.md',
        body: 'x',
      });
      expect(r.status).toBe(400);
      expect((r.body as { error: string }).error).toMatch(/invalid entryId/i);
    });

    it('returns 404 for an entryId with no sidecar on disk', async () => {
      const r = await postJson(app, '/api/dev/scrapbook/save', {
        site: 'wc',
        entryId: '00000000-0000-0000-0000-000000000000',
        filename: 'note.md',
        body: 'x',
      });
      // readSidecar throws "sidecar not found" → statusForError → 404.
      expect(r.status).toBe(404);
    });

    it('rejects requests missing both entryId and slug with 400', async () => {
      const r = await postJson(app, '/api/dev/scrapbook/save', {
        site: 'wc',
        filename: 'note.md',
        body: 'x',
      });
      expect(r.status).toBe(400);
      expect((r.body as { error: string }).error).toMatch(/entryId or slug is required/i);
    });

    it('upload rejects malformed entryId multipart with 400', async () => {
      const fd = new FormData();
      fd.append('site', 'wc');
      fd.append('entryId', 'not-a-uuid');
      const ab = new ArrayBuffer(1);
      fd.append('file', new File([ab], 'x.bin'));
      const res = await app.fetch(
        new Request('http://x/api/dev/scrapbook/upload', {
          method: 'POST',
          body: fd,
        }),
      );
      expect(res.status).toBe(400);
    });

    it('slug-only fallback still works when no entryId is supplied', async () => {
      // Back-compat coverage: the deprecation-window slug path remains
      // functional. Will be removed in #192.
      const slug = 'legacy-slug-path';
      const r = await postJson(app, '/api/dev/scrapbook/create', {
        site: 'wc',
        slug,
        filename: 'note.md',
        body: 'legacy',
      });
      expect(r.status).toBe(200);
      expect(
        existsSync(join(root, 'src/content/projects', slug, 'scrapbook', 'note.md')),
      ).toBe(true);
    });

    it('entryId is preferred when both entryId and slug are sent', async () => {
      // Defensive: when both fields land in the same payload (mid-
      // migration client behavior), the server picks entryId. Ensures
      // the addressing migration is monotonic — once a client starts
      // sending entryId, the server stops using slug.
      const slug = 'tied-prefer-entry';
      const { artifactDir, slugTemplateScrapbookDir } =
        await seedEntryAtNonSlugPath(slug);

      const r = await postJson(app, '/api/dev/scrapbook/create', {
        site: 'wc',
        entryId: ENTRY_UUID,
        slug, // server should ignore this when entryId is present
        filename: 'choose.md',
        body: 'entry-aware wins',
      });
      expect(r.status).toBe(200);
      expect(existsSync(join(artifactDir, 'scrapbook', 'choose.md'))).toBe(true);
      expect(existsSync(slugTemplateScrapbookDir)).toBe(false);
    });

    it('artifactDir / dirname round-trip matches the post-fix invariant', async () => {
      // Single most-direct expression of the bug fix: dirname(artifactPath)
      // + '/scrapbook/' is where the file MUST land. Read the artifact
      // path off the filesystem rather than reconstructing it, so a
      // future refactor of the path-template doesn't silently invalidate
      // the test.
      const slug = 'round-trip';
      const { artifactPath } = await seedEntryAtNonSlugPath(slug);

      const r = await postJson(app, '/api/dev/scrapbook/save', {
        site: 'wc',
        entryId: ENTRY_UUID,
        filename: 'rt.md',
        body: '# rt\n',
      });
      expect(r.status).toBe(200);
      const expected = join(dirname(artifactPath), 'scrapbook', 'rt.md');
      expect(existsSync(expected)).toBe(true);
      expect(readFileSync(expected, 'utf-8')).toBe('# rt\n');
    });
  });
});
