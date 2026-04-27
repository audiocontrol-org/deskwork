/**
 * Phase 19d — workflow entryId propagation.
 *
 * Verifies that workflows record the calendar entry's stable UUID
 * when one is available, and that lookups succeed via either
 * `entryId` (canonical) or `(site, slug)` (legacy) join.
 *
 * The legacy `(site, slug)` branch is deliberate behavior for the
 * migration window — pre-19 workflows have no entryId stamped, so
 * the dashboard / studio still need to find them. This is NOT the
 * kind of "silent fallback" the project rules forbid; doctor
 * surfaces the legacy cases so operators can backfill.
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
import { writeCalendar } from '../src/calendar.ts';
import { handleStartLongform, handleGetWorkflow } from '../src/review/handlers.ts';
import { createWorkflow, readWorkflows } from '../src/review/pipeline.ts';
import type { DeskworkConfig } from '../src/config.ts';
import type { CalendarEntry, EditorialCalendar } from '../src/types.ts';

function config(): DeskworkConfig {
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

function entry(overrides: Partial<CalendarEntry>): CalendarEntry {
  return {
    slug: 'placeholder',
    title: 'Placeholder',
    description: '',
    stage: 'Drafting',
    targetKeywords: [],
    source: 'manual',
    ...overrides,
  };
}

const ENTRY_ID = 'abababab-abab-4abc-8abc-abababababab';

function seedCalendar(root: string, cfg: DeskworkConfig, e: CalendarEntry) {
  const cal: EditorialCalendar = { entries: [e], distributions: [] };
  const calendarPath = join(root, cfg.sites.a.calendarPath);
  mkdirSync(join(root, 'docs'), { recursive: true });
  writeCalendar(calendarPath, cal);
}

function seedBlog(root: string, slug: string, body = '# Body\n') {
  const file = join(root, 'src/sites/a/content/blog', `${slug}.md`);
  mkdirSync(join(file, '..'), { recursive: true });
  writeFileSync(file, body, 'utf-8');
}

describe('review handlers — entryId propagation (Phase 19d)', () => {
  let root: string;
  let cfg: DeskworkConfig;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'deskwork-handlers-eid-'));
    cfg = config();
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('handleStartLongform stamps entryId from the calendar when not supplied', () => {
    seedCalendar(
      root,
      cfg,
      entry({ id: ENTRY_ID, slug: 'a-post', title: 'A Post' }),
    );
    seedBlog(root, 'a-post', '# A Post\n\nDraft body.\n');

    const r = handleStartLongform(root, cfg, { site: 'a', slug: 'a-post' });
    expect(r.status).toBe(200);
    const body = r.body as { workflow: { entryId?: string; slug: string } };
    expect(body.workflow.slug).toBe('a-post');
    expect(body.workflow.entryId).toBe(ENTRY_ID);
  });

  it('handleStartLongform uses caller-supplied entryId when given', () => {
    // Caller passes a different id (e.g. an entry from a sibling
    // calendar). The handler trusts the caller's id rather than
    // re-resolving from the calendar.
    seedCalendar(
      root,
      cfg,
      entry({ id: ENTRY_ID, slug: 'a-post', title: 'A Post' }),
    );
    seedBlog(root, 'a-post');

    const customId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    const r = handleStartLongform(root, cfg, {
      site: 'a',
      slug: 'a-post',
      entryId: customId,
    });
    expect(r.status).toBe(200);
    const body = r.body as { workflow: { entryId?: string } };
    expect(body.workflow.entryId).toBe(customId);
  });

  it('omits entryId when the slug has no calendar entry', () => {
    // A draft can exist on disk without a calendar record (rare,
    // but valid for ad-hoc workflows). The handler should NOT make
    // up an id; the workflow stays slug-keyed and doctor reports it.
    seedBlog(root, 'orphan');

    const r = handleStartLongform(root, cfg, { site: 'a', slug: 'orphan' });
    expect(r.status).toBe(200);
    const body = r.body as { workflow: { entryId?: string; slug: string } };
    expect(body.workflow.slug).toBe('orphan');
    expect(body.workflow.entryId).toBeUndefined();
  });

  it('handleGetWorkflow finds a workflow by entryId join', () => {
    // Create an entry-id-stamped workflow directly via createWorkflow,
    // then look it up via the `?entryId=` query path.
    createWorkflow(root, cfg, {
      entryId: ENTRY_ID,
      site: 'a',
      slug: 'a-post',
      contentKind: 'longform',
      initialMarkdown: '# A Post\n',
    });

    const r = handleGetWorkflow(root, cfg, {
      id: null,
      entryId: ENTRY_ID,
      site: 'a',
      slug: 'unrelated-slug',
      contentKind: 'longform',
      platform: null,
      channel: null,
    });
    expect(r.status).toBe(200);
    const body = r.body as {
      workflow: { entryId?: string; slug: string };
    };
    expect(body.workflow.entryId).toBe(ENTRY_ID);
    expect(body.workflow.slug).toBe('a-post');
  });

  it('handleGetWorkflow falls back to (site, slug) for legacy workflows', () => {
    // Legacy: no entryId stamped on the workflow. Lookup by (site, slug)
    // still works.
    createWorkflow(root, cfg, {
      site: 'a',
      slug: 'legacy-post',
      contentKind: 'longform',
      initialMarkdown: '# Legacy\n',
    });

    const r = handleGetWorkflow(root, cfg, {
      id: null,
      entryId: null,
      site: 'a',
      slug: 'legacy-post',
      contentKind: 'longform',
      platform: null,
      channel: null,
    });
    expect(r.status).toBe(200);
    const body = r.body as {
      workflow: { entryId?: string; slug: string };
    };
    expect(body.workflow.slug).toBe('legacy-post');
    expect(body.workflow.entryId).toBeUndefined();
  });

  it('handleStartLongform is idempotent across (site, slug) when entryId stamped', () => {
    // Two calls to handleStartLongform with the same calendar entry —
    // the second call should return the existing workflow, not a new one.
    seedCalendar(
      root,
      cfg,
      entry({ id: ENTRY_ID, slug: 'idem', title: 'Idem' }),
    );
    seedBlog(root, 'idem');

    const first = handleStartLongform(root, cfg, { site: 'a', slug: 'idem' });
    const second = handleStartLongform(root, cfg, { site: 'a', slug: 'idem' });
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    const a = (first.body as { workflow: { id: string } }).workflow;
    const b = (second.body as { workflow: { id: string } }).workflow;
    expect(a.id).toBe(b.id);

    // And the workflow store contains exactly one item.
    const all = readWorkflows(root, cfg);
    expect(all.filter((w) => w.slug === 'idem')).toHaveLength(1);
  });
});
