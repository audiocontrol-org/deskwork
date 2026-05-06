/**
 * Tests for `snapshotIndexForStage` (Issue #222 — Option B + hybrid
 * refinement).
 *
 * Behavior under test:
 *  - Atomic write via tmp + rename.
 *  - Skips when index.md doesn't exist.
 *  - Idempotent re-snapshot when target already matches content.
 *  - Refuses to overwrite a divergent prior snapshot.
 *  - Skips when entry has no artifactPath (legacy pre-doctor migration).
 *  - Stage filename is lowercased (Drafting → drafting.md).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { snapshotIndexForStage } from '@/entry/snapshot';
import type { Entry } from '@/schema/entry';

const baseEntry: Omit<Entry, 'artifactPath'> = {
  uuid: '99999999-9999-4999-8999-999999999999',
  slug: 'foo',
  title: 'Foo',
  keywords: [],
  source: 'manual',
  currentStage: 'Outlining',
  iterationByStage: {},
  createdAt: '2026-04-30T10:00:00.000Z',
  updatedAt: '2026-04-30T10:00:00.000Z',
};

describe('snapshotIndexForStage', () => {
  let projectRoot: string;

  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), 'dw-snapshot-test-'));
  });

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  it('snapshots index.md → scrapbook/<priorStage>.md when index.md exists', async () => {
    await mkdir(join(projectRoot, 'docs', 'foo'), { recursive: true });
    await writeFile(
      join(projectRoot, 'docs', 'foo', 'index.md'),
      '# outlining body content\n',
    );
    const entry: Entry = { ...baseEntry, artifactPath: 'docs/foo/index.md' };

    const result = await snapshotIndexForStage(projectRoot, entry, 'Outlining');
    expect(result.snapshotted).toBe(true);
    expect(result.snapshotPath).toBe(join(projectRoot, 'docs', 'foo', 'scrapbook', 'outlining.md'));
    const snapshot = await readFile(result.snapshotPath ?? '', 'utf8');
    expect(snapshot).toContain('outlining body content');
  });

  it('lowercases the stage name in the snapshot filename', async () => {
    await mkdir(join(projectRoot, 'docs', 'foo'), { recursive: true });
    await writeFile(join(projectRoot, 'docs', 'foo', 'index.md'), '# x\n');
    const entry: Entry = { ...baseEntry, artifactPath: 'docs/foo/index.md' };

    const result = await snapshotIndexForStage(projectRoot, entry, 'Drafting');
    expect(result.snapshotPath).toBe(join(projectRoot, 'docs', 'foo', 'scrapbook', 'drafting.md'));
  });

  it('skips when index.md does not exist (Ideas stage common case)', async () => {
    await mkdir(join(projectRoot, 'docs', 'foo'), { recursive: true });
    // Note: no index.md — only scrapbook/idea.md (which we don't even
    // create here; the snapshot helper doesn't care about prior files).
    const entry: Entry = { ...baseEntry, artifactPath: 'docs/foo/index.md' };

    const result = await snapshotIndexForStage(projectRoot, entry, 'Ideas');
    expect(result.snapshotted).toBe(false);
    expect(result.skipReason).toBe('no-index-md');
  });

  it('skips when the entry has no artifactPath (legacy pre-migration entry)', async () => {
    const entry: Entry = { ...baseEntry };
    const result = await snapshotIndexForStage(projectRoot, entry, 'Outlining');
    expect(result.snapshotted).toBe(false);
    expect(result.skipReason).toBe('no-snapshot-dir');
  });

  it('is idempotent when the snapshot target already matches the index.md content', async () => {
    await mkdir(join(projectRoot, 'docs', 'foo', 'scrapbook'), { recursive: true });
    const content = '# matching body\n';
    await writeFile(join(projectRoot, 'docs', 'foo', 'index.md'), content);
    await writeFile(join(projectRoot, 'docs', 'foo', 'scrapbook', 'outlining.md'), content);

    const entry: Entry = { ...baseEntry, artifactPath: 'docs/foo/index.md' };
    const result = await snapshotIndexForStage(projectRoot, entry, 'Outlining');
    expect(result.snapshotted).toBe(true);
    // No churn: the file mtime is preserved (idempotent — we did not
    // re-write). We can verify by re-reading the content matches.
    const after = await readFile(join(projectRoot, 'docs', 'foo', 'scrapbook', 'outlining.md'), 'utf8');
    expect(after).toBe(content);
  });

  it('refuses to overwrite a prior snapshot with different content', async () => {
    await mkdir(join(projectRoot, 'docs', 'foo', 'scrapbook'), { recursive: true });
    await writeFile(join(projectRoot, 'docs', 'foo', 'index.md'), '# new content\n');
    await writeFile(
      join(projectRoot, 'docs', 'foo', 'scrapbook', 'outlining.md'),
      '# OLD different content (must not be clobbered)\n',
    );
    const entry: Entry = { ...baseEntry, artifactPath: 'docs/foo/index.md' };

    await expect(
      snapshotIndexForStage(projectRoot, entry, 'Outlining'),
    ).rejects.toThrow(/refusing to overwrite|different content/i);
  });

  it('keys on dirname(artifactPath) — works even when artifactPath is a legacy per-stage file', async () => {
    // Legacy entry whose sidecar still points at scrapbook/outline.md;
    // the snapshot helper resolves the dir anyway and writes
    // scrapbook/outlining.md alongside the legacy file.
    await mkdir(join(projectRoot, 'docs', 'foo', 'scrapbook'), { recursive: true });
    await writeFile(
      join(projectRoot, 'docs', 'foo', 'index.md'),
      '# index body present\n',
    );
    const entry: Entry = {
      ...baseEntry,
      // Legacy artifactPath shape — pre-T1.
      artifactPath: 'docs/foo/scrapbook/outline.md',
    };

    const result = await snapshotIndexForStage(projectRoot, entry, 'Outlining');
    expect(result.snapshotted).toBe(true);
    expect(result.snapshotPath).toBe(join(projectRoot, 'docs', 'foo', 'scrapbook', 'outlining.md'));
  });

  it('uses atomic write (no .tmp residue after success)', async () => {
    await mkdir(join(projectRoot, 'docs', 'foo'), { recursive: true });
    await writeFile(join(projectRoot, 'docs', 'foo', 'index.md'), '# x\n');
    const entry: Entry = { ...baseEntry, artifactPath: 'docs/foo/index.md' };

    const result = await snapshotIndexForStage(projectRoot, entry, 'Outlining');
    expect(result.snapshotted).toBe(true);
    // Confirm no .tmp file leaks into the scrapbook dir.
    const tmpCandidate = `${result.snapshotPath ?? ''}.${process.pid}.tmp`;
    await expect(stat(tmpCandidate)).rejects.toThrow();
  });
});
