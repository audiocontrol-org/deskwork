/**
 * Phase 39b — sites-to-lanes-migration doctor rule.
 *
 * Multi-site fixture (>=2 sites, each with host + contentDir, with
 * entries living under each site's contentDir). Asserts the `--fix`:
 *   - creates one lane PER legacy site, carrying `host` from the site
 *     and `scaffoldDefaults.markdown` from the site's contentDir;
 *   - backfills `artifactPath` onto each UNAMBIGUOUS artifact-bearing
 *     entry;
 *   - drops the `sites` block from the written config.
 *
 * The rule reuses the same `audit → plan → apply` shape every other
 * doctor rule implements; this test exercises it through `runRepair`
 * with the `yesInteraction` adapter (auto-confirm apply plans).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runRepair, yesInteraction } from '@/doctor/runner';
import { readConfig } from '@/config';
import { loadLaneConfig } from '@/lanes/loader';
import { readSidecar } from '@/sidecar/read';
import { writeSidecar } from '@/sidecar/write';
import type { Entry } from '@/schema/entry';

function entry(uuid: string, slug: string, overrides: Partial<Entry> = {}): Entry {
  return {
    uuid,
    slug,
    title: slug,
    keywords: [],
    source: 'manual',
    currentStage: 'Drafting',
    iterationByStage: {},
    createdAt: '2026-04-30T10:00:00.000Z',
    updatedAt: '2026-04-30T10:00:00.000Z',
    ...overrides,
  };
}

describe('sites-to-lanes-migration doctor rule', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'dw-s2l-mig-'));
    await mkdir(join(root, '.deskwork', 'entries'), { recursive: true });
    await writeFile(
      join(root, '.deskwork', 'config.json'),
      JSON.stringify({
        version: 1,
        sites: {
          blog: {
            contentDir: 'src/content/blog',
            calendarPath: '.deskwork/calendar.md',
            host: 'blog.example.com',
          },
          docs: {
            contentDir: 'docs',
            calendarPath: '.deskwork/calendar.md',
            host: 'docs.example.com',
          },
        },
        defaultSite: 'blog',
      }),
    );
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('creates a lane per site with host + scaffoldDefaults, backfills artifactPath, drops sites', async () => {
    const uBlog = '11111111-1111-4111-8111-111111111111';
    const uDocs = '22222222-2222-4222-8222-222222222222';

    // Materialize one artifact under EACH site's contentDir. Distinct
    // slugs so neither collides with the other (unambiguous backfill).
    await mkdir(join(root, 'src', 'content', 'blog', 'hello-post'), { recursive: true });
    await writeFile(join(root, 'src', 'content', 'blog', 'hello-post', 'index.md'), '# Hello');
    await mkdir(join(root, 'docs', 'getting-started'), { recursive: true });
    await writeFile(join(root, 'docs', 'getting-started', 'index.md'), '# Start');

    // Entries lacking artifactPath (pre-migration shape).
    await writeSidecar(root, entry(uBlog, 'hello-post'));
    await writeSidecar(root, entry(uDocs, 'getting-started'));

    const config = readConfig(root);
    const report = await runRepair(
      { projectRoot: root, config, ruleIds: ['sites-to-lanes-migration'] },
      yesInteraction,
    );

    const applied = report.repairs.filter((r) => r.applied);
    expect(applied.length).toBeGreaterThan(0);

    // Post-fix config has NO sites block.
    const after = await readFile(join(root, '.deskwork', 'config.json'), 'utf8');
    const afterJson = JSON.parse(after);
    expect(afterJson.sites).toBeUndefined();

    // One lane per legacy site, with host + scaffoldDefaults.markdown.
    const blogLane = loadLaneConfig('blog', root);
    expect(blogLane.host).toBe('blog.example.com');
    expect(blogLane.scaffoldDefaults?.markdown).toBe('src/content/blog');

    const docsLane = loadLaneConfig('docs', root);
    expect(docsLane.host).toBe('docs.example.com');
    expect(docsLane.scaffoldDefaults?.markdown).toBe('docs');

    // Each entry's artifactPath backfilled to its real on-disk location.
    const afterBlog = await readSidecar(root, uBlog);
    expect(afterBlog.artifactPath).toBe('src/content/blog/hello-post/index.md');
    const afterDocs = await readSidecar(root, uDocs);
    expect(afterDocs.artifactPath).toBe('docs/getting-started/index.md');
  });

  it('assigns each migrated entry to its owning site lane (AUDIT-20260603-12)', async () => {
    const uBlog = '11111111-1111-4111-8111-111111111111';
    const uDocs = '22222222-2222-4222-8222-222222222222';

    await mkdir(join(root, 'src', 'content', 'blog', 'hello-post'), { recursive: true });
    await writeFile(join(root, 'src', 'content', 'blog', 'hello-post', 'index.md'), '# Hello');
    await mkdir(join(root, 'docs', 'getting-started'), { recursive: true });
    await writeFile(join(root, 'docs', 'getting-started', 'index.md'), '# Start');

    await writeSidecar(root, entry(uBlog, 'hello-post'));
    await writeSidecar(root, entry(uDocs, 'getting-started'));

    const config = readConfig(root);
    await runRepair(
      { projectRoot: root, config, ruleIds: ['sites-to-lanes-migration'] },
      yesInteraction,
    );

    // The migration created lanes `blog` + `docs` (id = site slug). Each
    // entry must carry the `lane` of the site whose contentDir its
    // artifact resolved under — NOT be left lane-less (which `entry-lane-
    // missing` would then flag as an error in the same run).
    const afterBlog = await readSidecar(root, uBlog);
    expect(afterBlog.lane).toBe('blog');
    const afterDocs = await readSidecar(root, uDocs);
    expect(afterDocs.lane).toBe('docs');
  });

  it('reports the pre-migration shape in audit (sites present)', async () => {
    const config = readConfig(root);
    const report = await runRepair(
      { projectRoot: root, config, ruleIds: ['sites-to-lanes-migration'] },
      yesInteraction,
    );
    const detection = report.findings.find(
      (f) => f.ruleId === 'sites-to-lanes-migration',
    );
    expect(detection).toBeDefined();
    expect(detection?.message).toMatch(/sites/i);
  });
});
