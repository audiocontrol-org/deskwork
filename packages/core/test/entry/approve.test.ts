import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { approveEntryStage } from '@/entry/approve';
import { writeSidecar } from '@/sidecar/write';
import { readSidecar } from '@/sidecar/read';
import { readJournalEvents } from '@/journal/read';
import {
  addEntryAnnotation,
  listEntryAnnotations,
  listEntryAnnotationsRaw,
  mintEntryAnnotation,
} from '@/entry/annotations';
import type { Entry } from '@/schema/entry';
import type { DraftAnnotation } from '@/review/types';

describe('approveEntryStage', () => {
  let projectRoot: string;
  const uuid = '550e8400-e29b-41d4-a716-446655440000';

  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), 'dw-test-'));
    await mkdir(join(projectRoot, '.deskwork', 'entries'), { recursive: true });
  });

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  async function setupEntry(overrides: Partial<Entry>): Promise<Entry> {
    const entry: Entry = {
      uuid,
      slug: 'foo',
      title: 'Foo',
      keywords: [],
      source: 'manual',
      currentStage: 'Ideas',
      iterationByStage: {},
      createdAt: '2026-04-30T10:00:00.000Z',
      updatedAt: '2026-04-30T10:00:00.000Z',
      ...overrides,
    };
    await writeSidecar(projectRoot, entry);
    return entry;
  }

  it('graduates Ideas → Planned', async () => {
    await setupEntry({ currentStage: 'Ideas' });
    const result = await approveEntryStage(projectRoot, { uuid });
    expect(result.fromStage).toBe('Ideas');
    expect(result.toStage).toBe('Planned');
    const sidecar = await readSidecar(projectRoot, uuid);
    expect(sidecar.currentStage).toBe('Planned');
  });

  it('graduates Drafting → Final', async () => {
    await setupEntry({ currentStage: 'Drafting', reviewState: 'in-review' });
    const result = await approveEntryStage(projectRoot, { uuid });
    expect(result.toStage).toBe('Final');
    const sidecar = await readSidecar(projectRoot, uuid);
    expect(sidecar.currentStage).toBe('Final');
    // reviewState clears on stage transition.
    expect(sidecar.reviewState).toBeUndefined();
  });

  it('emits a stage-transition journal event', async () => {
    await setupEntry({ currentStage: 'Ideas' });
    await approveEntryStage(projectRoot, { uuid });
    const events = await readJournalEvents(projectRoot, { entryId: uuid });
    const transition = events.find((e) => e.kind === 'stage-transition');
    expect(transition).toBeDefined();
    if (transition && transition.kind === 'stage-transition') {
      expect(transition.from).toBe('Ideas');
      expect(transition.to).toBe('Planned');
    }
  });

  it('refuses to approve from Final (use publish, not approve)', async () => {
    await setupEntry({ currentStage: 'Final' });
    await expect(approveEntryStage(projectRoot, { uuid })).rejects.toThrow(/publish/i);
  });

  it('refuses to approve from Published / Blocked / Cancelled', async () => {
    for (const stage of ['Published', 'Blocked', 'Cancelled'] as const) {
      const u = `550e8400-e29b-41d4-a716-44665544000${stage.length % 9}`;
      const e: Entry = {
        uuid: u,
        slug: 'x-' + stage,
        title: 'X',
        keywords: [],
        source: 'manual',
        currentStage: stage,
        iterationByStage: {},
        createdAt: '2026-04-30T10:00:00.000Z',
        updatedAt: '2026-04-30T10:00:00.000Z',
        ...(stage === 'Blocked' || stage === 'Cancelled'
          ? { priorStage: 'Drafting' as const }
          : {}),
      };
      await writeSidecar(projectRoot, e);
      await expect(approveEntryStage(projectRoot, { uuid: u })).rejects.toThrow(/cannot/i);
    }
  });

  // #148: every entry transition must regenerate calendar.md so the
  // canonical visible representation of the pipeline doesn't lag the
  // sidecar SSOT.
  it('regenerates calendar.md after the transition (#148)', async () => {
    await setupEntry({ currentStage: 'Ideas', slug: 'my-idea', title: 'My Idea' });
    // Pre-write calendar.md showing the entry under the OLD stage.
    await writeFile(
      join(projectRoot, '.deskwork', 'calendar.md'),
      '# Editorial Calendar\n\n## Ideas\n\n*pre-existing stale content*\n',
    );

    await approveEntryStage(projectRoot, { uuid });

    const md = await readFile(join(projectRoot, '.deskwork', 'calendar.md'), 'utf8');
    // The entry should now appear under ## Planned, not ## Ideas, and
    // the stale "pre-existing stale content" placeholder should be gone.
    expect(md).not.toMatch(/pre-existing stale content/);
    // After regeneration, the entry's UUID should be inside the Planned section.
    const plannedSection = md.match(/## Planned[\s\S]*?(?=^## )/m)?.[0] ?? '';
    expect(plannedSection).toContain(uuid);
    const ideasSection = md.match(/## Ideas[\s\S]*?(?=^## )/m)?.[0] ?? '';
    expect(ideasSection).not.toContain(uuid);
  });

  // ---- T1 (Issue #222): snapshot-on-approve --------------------------

  it('snapshots index.md → scrapbook/<priorStage>.md on Drafting → Final', async () => {
    await setupEntry({
      currentStage: 'Drafting',
      slug: 'snap-doc',
      artifactPath: 'docs/snap-doc/index.md',
    });
    await mkdir(join(projectRoot, 'docs', 'snap-doc'), { recursive: true });
    await writeFile(join(projectRoot, 'docs', 'snap-doc', 'index.md'), '# drafting body\n');

    const result = await approveEntryStage(projectRoot, { uuid });
    expect(result.snapshotted).toBe(true);

    const snap = await readFile(
      join(projectRoot, 'docs', 'snap-doc', 'scrapbook', 'drafting.md'),
      'utf8',
    );
    expect(snap).toContain('drafting body');
  });

  it('does not snapshot when index.md is absent (Ideas stage common case)', async () => {
    await setupEntry({
      currentStage: 'Ideas',
      slug: 'no-index-doc',
      artifactPath: 'docs/no-index-doc/index.md',
    });
    // No index.md on disk — common at Ideas where only idea.md exists.
    await mkdir(join(projectRoot, 'docs', 'no-index-doc'), { recursive: true });

    const result = await approveEntryStage(projectRoot, { uuid });
    expect(result.snapshotted).toBe(false);

    // Verify no snapshot file was created.
    await expect(
      stat(join(projectRoot, 'docs', 'no-index-doc', 'scrapbook', 'ideas.md')),
    ).rejects.toThrow();
  });

  it('is idempotent when re-approving with matching prior snapshot content', async () => {
    await setupEntry({
      currentStage: 'Outlining',
      slug: 'idem-doc',
      artifactPath: 'docs/idem-doc/index.md',
    });
    await mkdir(join(projectRoot, 'docs', 'idem-doc', 'scrapbook'), { recursive: true });
    await writeFile(join(projectRoot, 'docs', 'idem-doc', 'index.md'), '# stable body\n');
    await writeFile(
      join(projectRoot, 'docs', 'idem-doc', 'scrapbook', 'outlining.md'),
      '# stable body\n',
    );

    const result = await approveEntryStage(projectRoot, { uuid });
    expect(result.snapshotted).toBe(true);
    expect(result.toStage).toBe('Drafting');
  });

  it('refuses to approve when prior snapshot exists with conflicting content', async () => {
    await setupEntry({
      currentStage: 'Outlining',
      slug: 'conflict-doc',
      artifactPath: 'docs/conflict-doc/index.md',
    });
    await mkdir(join(projectRoot, 'docs', 'conflict-doc', 'scrapbook'), { recursive: true });
    await writeFile(join(projectRoot, 'docs', 'conflict-doc', 'index.md'), '# new outline\n');
    await writeFile(
      join(projectRoot, 'docs', 'conflict-doc', 'scrapbook', 'outlining.md'),
      '# DIFFERENT pre-existing snapshot — operator hand-edited\n',
    );

    await expect(
      approveEntryStage(projectRoot, { uuid }),
    ).rejects.toThrow(/refusing to overwrite|different content/i);

    // Sidecar must NOT have advanced (snapshot is the first thing on
    // approve; throwing means no later mutations land).
    const sidecar = await readSidecar(projectRoot, uuid);
    expect(sidecar.currentStage).toBe('Outlining');
  });

  // ---- T1 (Issue #200): archive-on-approve ---------------------------

  it('archives every active comment annotation on approve', async () => {
    await setupEntry({
      currentStage: 'Outlining',
      slug: 'archive-doc',
      artifactPath: 'docs/archive-doc/index.md',
    });
    await mkdir(join(projectRoot, 'docs', 'archive-doc'), { recursive: true });
    await writeFile(join(projectRoot, 'docs', 'archive-doc', 'index.md'), '# body\n');

    // Mint two `comment` annotations and append them.
    const comment1: DraftAnnotation = mintEntryAnnotation({
      type: 'comment',
      workflowId: uuid,
      version: 1,
      range: { start: 0, end: 4 },
      text: 'first comment',
    });
    const comment2: DraftAnnotation = mintEntryAnnotation({
      type: 'comment',
      workflowId: uuid,
      version: 1,
      range: { start: 5, end: 9 },
      text: 'second comment',
    });
    await addEntryAnnotation(projectRoot, uuid, comment1);
    await addEntryAnnotation(projectRoot, uuid, comment2);

    const beforeActive = await listEntryAnnotations(projectRoot, uuid);
    expect(beforeActive.filter((a) => a.type === 'comment')).toHaveLength(2);

    const result = await approveEntryStage(projectRoot, { uuid });
    expect(result.archivedComments).toBe(2);

    // Folded view: archived comments no longer appear in the active list.
    const afterActive = await listEntryAnnotations(projectRoot, uuid);
    expect(afterActive.filter((a) => a.type === 'comment')).toHaveLength(0);

    // Raw view: comments + 2 archive-comment annotations are all present.
    const rawAfter = await listEntryAnnotationsRaw(projectRoot, uuid);
    const archives = rawAfter.filter((a) => a.type === 'archive-comment');
    expect(archives).toHaveLength(2);
    if (archives[0].type === 'archive-comment') {
      expect(archives[0].priorStage).toBe('Outlining');
    }
    // Originals are still in the journal.
    expect(rawAfter.filter((a) => a.type === 'comment')).toHaveLength(2);
  });

  it('does not archive a comment that was already deleted', async () => {
    await setupEntry({
      currentStage: 'Outlining',
      slug: 'mixed-doc',
      artifactPath: 'docs/mixed-doc/index.md',
    });
    await mkdir(join(projectRoot, 'docs', 'mixed-doc'), { recursive: true });
    await writeFile(join(projectRoot, 'docs', 'mixed-doc', 'index.md'), '# body\n');

    const comment: DraftAnnotation = mintEntryAnnotation({
      type: 'comment',
      workflowId: uuid,
      version: 1,
      range: { start: 0, end: 4 },
      text: 'will be deleted',
    });
    await addEntryAnnotation(projectRoot, uuid, comment);
    if (comment.type === 'comment') {
      const tomb: DraftAnnotation = mintEntryAnnotation({
        type: 'delete-comment',
        workflowId: uuid,
        commentId: comment.id,
      });
      await addEntryAnnotation(projectRoot, uuid, tomb);
    }

    const result = await approveEntryStage(projectRoot, { uuid });
    expect(result.archivedComments).toBe(0);
  });

  it('archive comments record priorStage', async () => {
    await setupEntry({
      currentStage: 'Drafting',
      slug: 'pstage-doc',
      artifactPath: 'docs/pstage-doc/index.md',
    });
    await mkdir(join(projectRoot, 'docs', 'pstage-doc'), { recursive: true });
    await writeFile(join(projectRoot, 'docs', 'pstage-doc', 'index.md'), '# body\n');

    const comment: DraftAnnotation = mintEntryAnnotation({
      type: 'comment',
      workflowId: uuid,
      version: 1,
      range: { start: 0, end: 4 },
      text: 'drafting-stage comment',
    });
    await addEntryAnnotation(projectRoot, uuid, comment);

    await approveEntryStage(projectRoot, { uuid });

    const raw = await listEntryAnnotationsRaw(projectRoot, uuid);
    const archives = raw.filter((a) => a.type === 'archive-comment');
    expect(archives).toHaveLength(1);
    if (archives[0].type === 'archive-comment') {
      expect(archives[0].priorStage).toBe('Drafting');
    }
  });
});
