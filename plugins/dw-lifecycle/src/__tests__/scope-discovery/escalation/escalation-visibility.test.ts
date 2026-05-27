/**
 * plugins/dw-lifecycle/src/__tests__/scope-discovery/escalation/escalation-visibility.test.ts
 *
 * Phase 11 Task 9 — Visibility surface tests.
 *
 * Verifies that the visibility builder:
 *   - Counts queued escalations from disk via `readPendingEscalations`.
 *   - Emits repo-relative quick-links by default, absolute when asked.
 *   - Renders an operator-readable markdown block with one row per
 *     escalation.
 *   - Surfaces a "no escalations queued" block when the count is zero
 *     (so the report still confirms the queue was checked).
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, isAbsolute } from 'node:path';
import { enqueueEscalation } from '../../../scope-discovery/escalation/escalation-queue.js';
import {
  buildEscalationVisibility,
  renderEscalationVisibility,
} from '../../../scope-discovery/escalation/escalation-visibility.js';
import type { EscalationRequest } from '../../../scope-discovery/escalation/escalation-types.js';

const RUNTIME_DIR = '.dw-lifecycle/scope-discovery/orchestrator-runtime';

function sampleInput(id: string) {
  return {
    id,
    queuedAt: `2026-05-26T1${id.slice(0, 1)}:00:00Z`,
    actionProposed: `Action for ${id}`,
    evidence: {
      summary: `evidence for ${id}`,
      links: [],
      excerpts: [],
    },
    reasoning: `reasoning for ${id}`,
    question: `question for ${id}?`,
    options: [{ id: 'defer', summary: 'defer' }],
  };
}

describe('buildEscalationVisibility', () => {
  let root: string;

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'esc-vis-'));
    await enqueueEscalation(sampleInput('20260526110000-aaa111'), {
      repoRoot: root,
      runtimeDirOverride: RUNTIME_DIR,
    });
    await enqueueEscalation(sampleInput('20260526120000-bbb222'), {
      repoRoot: root,
      runtimeDirOverride: RUNTIME_DIR,
    });
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('returns a structured count + rows for queued escalations', async () => {
    const visibility = await buildEscalationVisibility({
      repoRoot: root,
      runtimeDirOverride: RUNTIME_DIR,
    });
    expect(visibility.count).toBe(2);
    expect(visibility.rows.map((r) => r.id)).toEqual([
      '20260526110000-aaa111',
      '20260526120000-bbb222',
    ]);
    expect(visibility.rows[0]?.actionProposed).toBe(
      'Action for 20260526110000-aaa111',
    );
    expect(visibility.rows[0]?.question).toBe(
      'question for 20260526110000-aaa111?',
    );
  });

  it('emits repo-relative quick-links by default', async () => {
    const visibility = await buildEscalationVisibility({
      repoRoot: root,
      runtimeDirOverride: RUNTIME_DIR,
    });
    const link = visibility.rows[0]?.quickLink;
    expect(link).toBeDefined();
    if (link === undefined) throw new Error('unreachable');
    expect(isAbsolute(link)).toBe(false);
    expect(link).toBe(
      `${RUNTIME_DIR}/pending-escalations/20260526110000-aaa111.json`,
    );
  });

  it('emits absolute quick-links when useAbsolutePaths is set', async () => {
    const visibility = await buildEscalationVisibility({
      repoRoot: root,
      runtimeDirOverride: RUNTIME_DIR,
      useAbsolutePaths: true,
    });
    const link = visibility.rows[0]?.quickLink;
    expect(link).toBeDefined();
    if (link === undefined) throw new Error('unreachable');
    expect(isAbsolute(link)).toBe(true);
    expect(link.endsWith('20260526110000-aaa111.json')).toBe(true);
  });

  it('returns count=0 when no escalations exist', async () => {
    const empty = await mkdtemp(join(tmpdir(), 'esc-vis-empty-'));
    try {
      const visibility = await buildEscalationVisibility({
        repoRoot: empty,
        runtimeDirOverride: RUNTIME_DIR,
      });
      expect(visibility.count).toBe(0);
      expect(visibility.rows).toEqual([]);
    } finally {
      await rm(empty, { recursive: true, force: true });
    }
  });

  it('uses pendingOverride when supplied (no disk read)', async () => {
    // The pendingOverride path lets the orchestrator pass in an
    // already-read list — verify the function honors it without
    // touching disk.
    const override: ReadonlyArray<EscalationRequest> = [
      {
        version: 1,
        id: 'override-1',
        queuedAt: '2026-05-26T10:00:00Z',
        actionProposed: 'overridden action',
        evidence: { summary: 's', links: [], excerpts: [] },
        reasoning: 'r',
        question: 'q?',
        options: [{ id: 'defer', summary: 'defer' }],
        resolution: null,
      },
    ];
    const visibility = await buildEscalationVisibility({
      repoRoot: root,
      runtimeDirOverride: RUNTIME_DIR,
      pendingOverride: override,
    });
    expect(visibility.count).toBe(1);
    expect(visibility.rows[0]?.id).toBe('override-1');
  });
});

describe('renderEscalationVisibility', () => {
  it('renders a single-line "none" block when count is zero', () => {
    const md = renderEscalationVisibility({ count: 0, rows: [] });
    expect(md).toContain('### Escalations queued');
    expect(md).toContain('_None._');
  });

  it('renders one row per queued escalation with quick-link', () => {
    const md = renderEscalationVisibility({
      count: 2,
      rows: [
        {
          id: 'esc-1',
          queuedAt: '2026-05-26T11:00:00Z',
          actionProposed: 'set status=cursed on X',
          question: 'is this safe?',
          quickLink: 'path/to/esc-1.json',
        },
        {
          id: 'esc-2',
          queuedAt: '2026-05-26T12:00:00Z',
          actionProposed: 'widen the catalog',
          question: 'add new pattern type?',
          quickLink: 'path/to/esc-2.json',
        },
      ],
    });
    expect(md).toContain('### Escalations queued (2)');
    expect(md).toContain(
      '- `esc-1` — set status=cursed on X (path/to/esc-1.json)',
    );
    expect(md).toContain('  Question: is this safe?');
    expect(md).toContain('  Queued at: 2026-05-26T11:00:00Z');
    expect(md).toContain(
      '- `esc-2` — widen the catalog (path/to/esc-2.json)',
    );
  });
});
