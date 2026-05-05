/**
 * Server-route regression for the standalone scrapbook viewer page
 * (#205). The `/dev/scrapbook/:site/:path` route now accepts an
 * optional `?entryId=<uuid>` query param. When present, the listing
 * resolves via `scrapbookDirForEntry` (entry-aware addressing — same
 * code path the mutation API uses post-#191).
 *
 * Symmetric to `scrapbook-mutations.test.ts`'s entry-id mutation
 * envelope suite — that fixture seeds an entry whose artifact lives at
 * a non-kebab-case path; this fixture asserts the read endpoint
 * resolves the listing from the same artifact-parent directory rather
 * than from the slug-template orphan path.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DeskworkConfig } from '@deskwork/core/config';
import { writeSidecar } from '@deskwork/core/sidecar';
import type { Entry } from '@deskwork/core/schema/entry';
import { writeCalendar } from '@deskwork/core/calendar';
import type { EditorialCalendar } from '@deskwork/core/types';
import { createApp } from '../src/server.ts';

const ENTRY_UUID = 'b3f20364-969a-4004-87bd-278cd5992e3c';

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

/**
 * Seed an entry whose artifact lives at a non-kebab-case path — the
 * writingcontrol-shape failure mode. Returns the artifact-parent dir
 * (the entry-aware scrapbook root) plus the slug-template orphan path
 * so callers can assert presence-vs-absence.
 */
async function seedEntryAtNonSlugPath(
  root: string,
  slug: string,
): Promise<{
  artifactDir: string;
  slugTemplateScrapbookDir: string;
}> {
  const artifactRelDir = join(
    'src/content/projects',
    '0.16.0',
    '001-IN-PROGRESS',
    slug,
  );
  const artifactDir = join(root, artifactRelDir);
  mkdirSync(artifactDir, { recursive: true });
  writeFileSync(
    join(artifactDir, 'prd.md'),
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
  // Calendar isn't strictly required by the entry-id route but seed an
  // empty one so the slug-mode fallback path doesn't ENOENT in tests
  // that exercise it.
  const cal: EditorialCalendar = { entries: [], distributions: [] };
  mkdirSync(join(root, 'docs'), { recursive: true });
  writeCalendar(join(root, 'docs/cal.md'), cal);
  const slugTemplateScrapbookDir = join(
    root,
    'src/content/projects',
    slug,
    'scrapbook',
  );
  return { artifactDir, slugTemplateScrapbookDir };
}

describe('GET /dev/scrapbook/:site/:path?entryId=<uuid> — entry-aware listing (#205)', () => {
  let root: string;
  let app: ReturnType<typeof createApp>;
  let cfg: DeskworkConfig;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'deskwork-scrap-page-'));
    cfg = makeConfig();
    app = createApp({ projectRoot: root, config: cfg });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('lists items from dirname(artifact)/scrapbook/ when entryId is supplied (non-kebab-case entry)', async () => {
    const slug = 'open-issue-tranche-cleanup';
    const { artifactDir, slugTemplateScrapbookDir } =
      await seedEntryAtNonSlugPath(root, slug);

    // Seed a uniquely-named file in the entry-aware scrapbook so we
    // can detect it in the rendered HTML. Seed a DIFFERENT filename in
    // the slug-template orphan path — the page MUST NOT pick it up
    // when entryId is supplied.
    const entryScrapbook = join(artifactDir, 'scrapbook');
    mkdirSync(entryScrapbook, { recursive: true });
    writeFileSync(
      join(entryScrapbook, 'entry-aware-note.md'),
      '# entry-aware\n',
    );

    mkdirSync(slugTemplateScrapbookDir, { recursive: true });
    writeFileSync(
      join(slugTemplateScrapbookDir, 'slug-template-note.md'),
      '# orphan\n',
    );

    // Use the path that matches the artifact-parent (this is what the
    // standalone viewer URL emitter would produce when given the entry
    // id; see Phase 8 dashboard + drawer changes).
    const res = await app.fetch(
      new Request(
        `http://x/dev/scrapbook/wc/0.16.0/001-IN-PROGRESS/${slug}?entryId=${ENTRY_UUID}`,
      ),
    );
    expect(res.status).toBe(200);
    const html = await res.text();
    // The entry-aware listing must include the file from the
    // artifact-parent scrapbook…
    expect(html).toContain('entry-aware-note.md');
    // …and MUST NOT pull from the slug-template orphan path.
    expect(html).not.toContain('slug-template-note.md');
  });

  it('emits data-entry-id on the .scrap-page so the client mutation requests round-trip via entryId', async () => {
    const slug = 'data-entry-id-attr';
    await seedEntryAtNonSlugPath(root, slug);

    const res = await app.fetch(
      new Request(
        `http://x/dev/scrapbook/wc/0.16.0/001-IN-PROGRESS/${slug}?entryId=${ENTRY_UUID}`,
      ),
    );
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain(`data-entry-id="${ENTRY_UUID}"`);
  });

  it('rejects a malformed entryId with 400 BEFORE filesystem access', async () => {
    // The path-traversal probe vector mirrored from the scrapbook-file
    // route. Validation must run before `readSidecar` composes its path.
    const res = await app.fetch(
      new Request(
        'http://x/dev/scrapbook/wc/some-path?entryId=../../../etc/passwd',
      ),
    );
    expect(res.status).toBe(400);
  });

  it('returns 404 when the entryId is well-formed but no sidecar exists', async () => {
    const cal: EditorialCalendar = { entries: [], distributions: [] };
    mkdirSync(join(root, 'docs'), { recursive: true });
    writeCalendar(join(root, 'docs/cal.md'), cal);
    const res = await app.fetch(
      new Request(
        'http://x/dev/scrapbook/wc/some-path?entryId=00000000-0000-0000-0000-000000000000',
      ),
    );
    expect(res.status).toBe(404);
  });

  it('returns 404 for an unknown site (entryId path)', async () => {
    const res = await app.fetch(
      new Request(
        `http://x/dev/scrapbook/unknown-site/some-path?entryId=${ENTRY_UUID}`,
      ),
    );
    expect(res.status).toBe(404);
  });

  it('falls back to slug-template addressing when entryId is absent (back-compat)', async () => {
    // Slug-template path — exercises the legacy addressing mode that
    // existed before #205. `path` is interpreted as
    // `<contentDir>/<path>/scrapbook/`. Seed a file there and confirm
    // it shows up.
    const cal: EditorialCalendar = { entries: [], distributions: [] };
    mkdirSync(join(root, 'docs'), { recursive: true });
    writeCalendar(join(root, 'docs/cal.md'), cal);

    const slugDir = join(
      root,
      'src/content/projects',
      'legacy-slug',
      'scrapbook',
    );
    mkdirSync(slugDir, { recursive: true });
    writeFileSync(join(slugDir, 'legacy-note.md'), '# legacy\n');

    const res = await app.fetch(
      new Request('http://x/dev/scrapbook/wc/legacy-slug'),
    );
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('legacy-note.md');
    // No data-entry-id when no calendar entry matches the slug.
    expect(html).not.toContain('data-entry-id=');
  });

  it('falls back to slug-template addressing when entryId is empty', async () => {
    // Defensive: an explicit `?entryId=` (empty value) MUST behave the
    // same as an absent entryId — slug-template addressing.
    const cal: EditorialCalendar = { entries: [], distributions: [] };
    mkdirSync(join(root, 'docs'), { recursive: true });
    writeCalendar(join(root, 'docs/cal.md'), cal);

    const slugDir = join(
      root,
      'src/content/projects',
      'empty-entry-id',
      'scrapbook',
    );
    mkdirSync(slugDir, { recursive: true });
    writeFileSync(join(slugDir, 'present.md'), '# present\n');

    const res = await app.fetch(
      new Request('http://x/dev/scrapbook/wc/empty-entry-id?entryId='),
    );
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('present.md');
  });
});
