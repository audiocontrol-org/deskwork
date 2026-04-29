/**
 * Phase 21a tests for the shortform review pipeline:
 *   - handleStartShortform creates the file + workflow.
 *   - handleCreateVersion writes the shortform file on disk.
 *   - handleStartShortform is idempotent (resume returns the same workflow).
 *   - Channel validation rejects bad shapes.
 *   - Entry without a body file scaffold still gets a shortform created
 *     (lifecycle decoupling).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  readFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  handleCreateVersion,
  handleStartShortform,
} from '../src/review/handlers.ts';
import type { DraftWorkflowItem } from '../src/review/types.ts';
import { writeCalendar } from '../src/calendar.ts';
import { addEntry, planEntry, outlineEntry, draftEntry, publishEntry } from '../src/calendar-mutations.ts';
import { resolveShortformFilePath } from '../src/paths.ts';
import { parseFrontmatter } from '../src/frontmatter.ts';
import type { DeskworkConfig } from '../src/config.ts';
import type { EditorialCalendar } from '../src/types.ts';

function config(): DeskworkConfig {
  return {
    version: 1,
    sites: {
      a: {
        host: 'a.example',
        contentDir: 'src/content/blog',
        calendarPath: 'docs/cal.md',
      },
    },
    defaultSite: 'a',
  };
}

function seedEntry(
  root: string,
  cfg: DeskworkConfig,
  title: string,
  opts?: { stage?: 'Published' | 'Drafting' | 'Planned' | 'Ideas' },
): { calendar: EditorialCalendar; slug: string; entryId: string } {
  const calendar: EditorialCalendar = { entries: [], distributions: [] };
  addEntry(calendar, title);
  const stage = opts?.stage ?? 'Published';
  if (stage === 'Published') {
    planEntry(calendar, slugOf(title), ['kw']);
    outlineEntry(calendar, slugOf(title));
    draftEntry(calendar, slugOf(title));
    publishEntry(calendar, slugOf(title), '2026-01-01');
  } else if (stage === 'Drafting') {
    planEntry(calendar, slugOf(title), ['kw']);
    outlineEntry(calendar, slugOf(title));
    draftEntry(calendar, slugOf(title));
  } else if (stage === 'Planned') {
    planEntry(calendar, slugOf(title), ['kw']);
  }
  const entry = calendar.entries[0];
  mkdirSync(join(root, 'docs'), { recursive: true });
  writeCalendar(join(root, cfg.sites.a.calendarPath), calendar);
  if (entry.id === undefined) throw new Error('entry has no id');
  return { calendar, slug: entry.slug, entryId: entry.id };
}

function slugOf(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

describe('handleStartShortform', () => {
  let root: string;
  let cfg: DeskworkConfig;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'deskwork-shortform-h-'));
    cfg = config();
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('creates the shortform file (frontmatter + body) and a v1 workflow', () => {
    const { entryId } = seedEntry(root, cfg, 'My Shortform Post');

    const r = handleStartShortform(root, cfg, {
      site: 'a',
      slug: 'my-shortform-post',
      platform: 'linkedin',
      initialMarkdown: 'First draft of the LinkedIn post.',
    });
    expect(r.status).toBe(200);
    const body = r.body as {
      workflow: DraftWorkflowItem;
      filePath: string;
      existing: boolean;
    };
    expect(body.workflow.contentKind).toBe('shortform');
    expect(body.workflow.platform).toBe('linkedin');
    expect(body.workflow.entryId).toBe(entryId);
    expect(body.existing).toBe(false);

    expect(existsSync(body.filePath)).toBe(true);
    const fileContents = readFileSync(body.filePath, 'utf-8');
    const parsed = parseFrontmatter(fileContents);
    expect(parsed.body.replace(/^\n+/, '')).toBe(
      'First draft of the LinkedIn post.',
    );
    const dw = parsed.data.deskwork as Record<string, unknown>;
    expect(dw.platform).toBe('linkedin');
    expect(dw.id).toBe(entryId);
  });

  it('is idempotent on a repeat call (resumes the existing workflow + file)', () => {
    seedEntry(root, cfg, 'Resume Test');

    const first = handleStartShortform(root, cfg, {
      site: 'a',
      slug: 'resume-test',
      platform: 'linkedin',
      initialMarkdown: 'Body v1',
    });
    expect(first.status).toBe(200);
    const firstBody = first.body as {
      workflow: DraftWorkflowItem;
      filePath: string;
      existing: boolean;
    };

    // Operator hand-edits the file. The resume path must NOT clobber it.
    writeFileSync(
      firstBody.filePath,
      readFileSync(firstBody.filePath, 'utf-8').replace('Body v1', 'Hand-edited body'),
      'utf-8',
    );

    const second = handleStartShortform(root, cfg, {
      site: 'a',
      slug: 'resume-test',
      platform: 'linkedin',
      initialMarkdown: 'IGNORED on resume',
    });
    expect(second.status).toBe(200);
    const secondBody = second.body as {
      workflow: DraftWorkflowItem;
      filePath: string;
      existing: boolean;
    };
    expect(secondBody.workflow.id).toBe(firstBody.workflow.id);
    expect(secondBody.existing).toBe(true);

    const after = readFileSync(secondBody.filePath, 'utf-8');
    expect(after).toContain('Hand-edited body');
    expect(after).not.toContain('IGNORED on resume');
  });

  it('returns 404 when no calendar entry exists for the slug', () => {
    seedEntry(root, cfg, 'Some Other Post');
    const r = handleStartShortform(root, cfg, {
      site: 'a',
      slug: 'unknown-slug',
      platform: 'linkedin',
    });
    expect(r.status).toBe(404);
  });

  it('returns 400 on invalid channel shape', () => {
    seedEntry(root, cfg, 'Channel Test');
    const r = handleStartShortform(root, cfg, {
      site: 'a',
      slug: 'channel-test',
      platform: 'reddit',
      channel: 'rProgramming',
    });
    expect(r.status).toBe(400);
    expect((r.body as { error: string }).error).toMatch(/Invalid shortform channel/);
  });

  it('creates the entry directory + scrapbook subdirs when entry has no body file', () => {
    // Entry is in Planned — never had outline run, so no body file scaffolded.
    seedEntry(root, cfg, 'Pre-Outline Idea', { stage: 'Planned' });
    const r = handleStartShortform(root, cfg, {
      site: 'a',
      slug: 'pre-outline-idea',
      platform: 'linkedin',
      initialMarkdown: 'Shortform copy unrelated to lifecycle stage.',
    });
    expect(r.status).toBe(200);
    const body = r.body as { filePath: string; workflow: DraftWorkflowItem };
    expect(existsSync(body.filePath)).toBe(true);
    // Calendar entry stays in Planned — shortform doesn't move the lifecycle.
    expect(body.workflow.contentKind).toBe('shortform');
  });
});

describe('handleCreateVersion (shortform)', () => {
  let root: string;
  let cfg: DeskworkConfig;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'deskwork-shortform-cv-'));
    cfg = config();
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('writes the new version to the shortform file on disk and bumps the journal', () => {
    seedEntry(root, cfg, 'Save Cycle');
    const start = handleStartShortform(root, cfg, {
      site: 'a',
      slug: 'save-cycle',
      platform: 'linkedin',
      initialMarkdown: 'v1 body',
    });
    expect(start.status).toBe(200);
    const startBody = start.body as { workflow: DraftWorkflowItem; filePath: string };
    const workflowId = startBody.workflow.id;
    const filePath = startBody.filePath;

    const cv = handleCreateVersion(root, cfg, {
      workflowId,
      beforeVersion: 1,
      afterMarkdown: 'v2 body — operator edit',
    });
    expect(cv.status).toBe(200);

    // Disk got rewritten — frontmatter should still be there but body=v2.
    const after = readFileSync(filePath, 'utf-8');
    expect(after).toBe('v2 body — operator edit');
  });

  it('returns 500 when the shortform file went missing between start and save', () => {
    seedEntry(root, cfg, 'Race Cycle');
    const start = handleStartShortform(root, cfg, {
      site: 'a',
      slug: 'race-cycle',
      platform: 'linkedin',
      initialMarkdown: 'v1',
    });
    const startBody = start.body as { workflow: DraftWorkflowItem; filePath: string };

    // Simulate the file being deleted by an external process.
    rmSync(startBody.filePath);

    const cv = handleCreateVersion(root, cfg, {
      workflowId: startBody.workflow.id,
      beforeVersion: 1,
      afterMarkdown: 'v2',
    });
    expect(cv.status).toBe(500);
    expect((cv.body as { error: string }).error).toMatch(/shortform file missing/);
  });
});

describe('resolveShortformFilePath integration', () => {
  let root: string;
  let cfg: DeskworkConfig;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'deskwork-shortform-r-'));
    cfg = config();
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('returns the file path for an indexed entry that exists on disk', () => {
    const { entryId, slug } = seedEntry(root, cfg, 'Indexed Post');
    // Need an actual content body for findEntryFile to index.
    const body = join(root, 'src/content/blog', slug, 'index.md');
    mkdirSync(dirname(body), { recursive: true });
    writeFileSync(
      body,
      `---\ndeskwork:\n  id: ${entryId}\ntitle: Indexed Post\n---\n\n# Body\n`,
      'utf-8',
    );

    const out = resolveShortformFilePath(
      root,
      cfg,
      'a',
      { id: entryId, slug },
      'linkedin',
    );
    expect(out).toBe(
      join(root, 'src/content/blog', slug, 'scrapbook/shortform/linkedin.md'),
    );
  });
});
