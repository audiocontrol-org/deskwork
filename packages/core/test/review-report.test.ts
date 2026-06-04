import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildReport } from '../src/review/report.ts';
import { createWorkflow, transitionState } from '../src/review/pipeline.ts';
import { handleAnnotate } from '../src/review/handlers.ts';
import { writeCalendar } from '../src/calendar.ts';
import type { DeskworkConfig } from '../src/config.ts';
import type { Platform } from '../src/types.ts';

/**
 * Phase 39c (sites→lanes retirement) c3, Decision #22:
 * `report.ts`'s breakdown is re-homed from `bySite` to `byLane`. The lane
 * is derived from the workflow's entry sidecar (`entry.lane`), not from a
 * `workflow.site` field. An entry that owns both a longform and a
 * shortform workflow has BOTH counted under that entry's single lane.
 */

let bindCounter = 0;
function bindEntry(
  root: string,
  slug: string,
  lane: string | undefined,
): string {
  const entryId = `00000000-0000-4000-8000-${String(++bindCounter).padStart(12, '0')}`;
  mkdirSync(join(root, '.deskwork', 'entries'), { recursive: true });
  const sidecar: Record<string, unknown> = {
    uuid: entryId,
    slug,
    title: slug,
    keywords: [],
    source: 'manual',
    currentStage: 'Drafting',
    iterationByStage: {},
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    artifactPath: `content/${slug}.md`,
  };
  if (lane !== undefined) sidecar.lane = lane;
  writeFileSync(
    join(root, '.deskwork', 'entries', `${entryId}.json`),
    JSON.stringify(sidecar),
    'utf-8',
  );
  return entryId;
}

function seedCalendar(
  root: string,
  rows: Array<{ id: string; slug: string }>,
): void {
  writeCalendar(join(root, '.deskwork', 'calendar.md'), {
    entries: rows.map((r) => ({
      id: r.id,
      slug: r.slug,
      title: r.slug,
      description: '',
      stage: 'Drafting',
      targetKeywords: [],
      source: 'manual',
    })),
    distributions: [],
  });
}

function config(): DeskworkConfig {
  return {
    version: 1,
    sites: {
      a: {
        host: 'a.example',
        contentDir: 'content',
        calendarPath: 'docs/cal-a.md',
        blogFilenameTemplate: '{slug}.md',
      },
    },
    defaultSite: 'a',
  };
}

function applyWorkflow(root: string, cfg: DeskworkConfig, id: string): void {
  transitionState(root, cfg, id, 'in-review');
  transitionState(root, cfg, id, 'approved');
  transitionState(root, cfg, id, 'applied');
}

describe('buildReport — byLane breakdown (Phase 39c c3, Decision #22)', () => {
  let root: string;
  let cfg: DeskworkConfig;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'deskwork-report-'));
    cfg = config();
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('buckets two entries in different lanes into two byLane buckets', () => {
    const idBlog = bindEntry(root, 'blog-post', 'blog');
    const idDocs = bindEntry(root, 'docs-post', 'docs');
    seedCalendar(root, [
      { id: idBlog, slug: 'blog-post' },
      { id: idDocs, slug: 'docs-post' },
    ]);

    const wBlog = createWorkflow(root, cfg, {
      site: 'a',
      slug: 'blog-post',
      entryId: idBlog,
      contentKind: 'longform',
      initialMarkdown: '# blog',
    });
    const wDocs = createWorkflow(root, cfg, {
      site: 'a',
      slug: 'docs-post',
      entryId: idDocs,
      contentKind: 'longform',
      initialMarkdown: '# docs',
    });
    applyWorkflow(root, cfg, wBlog.id);
    applyWorkflow(root, cfg, wDocs.id);

    const report = buildReport(root, cfg);
    expect(Object.keys(report.byLane).sort()).toEqual(['blog', 'docs']);
    expect(report.byLane.blog.approvedCount).toBe(1);
    expect(report.byLane.docs.approvedCount).toBe(1);
  });

  it('counts a longform + shortform workflow for the SAME entry under one lane', () => {
    const id = bindEntry(root, 'multi', 'social');
    seedCalendar(root, [{ id, slug: 'multi' }]);

    const longform = createWorkflow(root, cfg, {
      site: 'a',
      slug: 'multi',
      entryId: id,
      contentKind: 'longform',
      initialMarkdown: '# long',
    });
    const shortform = createWorkflow(root, cfg, {
      site: 'a',
      slug: 'multi',
      entryId: id,
      contentKind: 'shortform',
      platform: 'linkedin' as Platform,
      initialMarkdown: 'short',
    });
    applyWorkflow(root, cfg, longform.id);
    applyWorkflow(root, cfg, shortform.id);

    const report = buildReport(root, cfg);
    expect(Object.keys(report.byLane)).toEqual(['social']);
    // Both workflows applied → both counted under the single lane, NOT
    // collapsed to one and NOT split across two buckets.
    expect(report.byLane.social.approvedCount).toBe(2);
  });

  it('buckets a workflow whose entry/lane cannot be resolved under (unknown)', () => {
    // No calendar row, no sidecar — orphan workflow. Must NOT throw.
    const orphan = createWorkflow(root, cfg, {
      site: 'a',
      slug: 'ghost',
      entryId: '00000000-0000-4000-8000-999999999999',
      contentKind: 'longform',
      initialMarkdown: '# ghost',
    });
    applyWorkflow(root, cfg, orphan.id);

    const report = buildReport(root, cfg);
    expect(report.byLane['(unknown)'].approvedCount).toBe(1);
  });

  it('attributes comment annotations to the entry lane', () => {
    const id = bindEntry(root, 'commented', 'editorial');
    seedCalendar(root, [{ id, slug: 'commented' }]);
    const w = createWorkflow(root, cfg, {
      site: 'a',
      slug: 'commented',
      entryId: id,
      contentKind: 'longform',
      initialMarkdown: '# body',
    });
    handleAnnotate(root, cfg, {
      type: 'comment',
      workflowId: w.id,
      version: 1,
      range: { start: 0, end: 2 },
      text: 'note',
      category: 'voice-drift',
    });
    applyWorkflow(root, cfg, w.id);

    const report = buildReport(root, cfg);
    expect(report.byLane.editorial.totalComments).toBe(1);
    expect(report.byLane.editorial.commentsByCategory.voiceDrift).toBe(1);
  });
});
