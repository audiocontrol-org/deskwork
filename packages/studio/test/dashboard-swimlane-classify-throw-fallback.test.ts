/**
 * AUDIT-20260530-37 — defense-in-depth catch around the `classifyStage`
 * throw inside `renderStageCol`'s `entries.map(renderRow)` boundary.
 *
 * Pre-fix path: `classifyStage` throws when an entry's `currentStage`
 * is absent from the resolved template's `linearStages` +
 * `offPipelineStages`. That throw propagates through `renderRow`
 * (which calls `classifyStage(entry.currentStage, template)` at
 * `section.ts:138`), bubbles out of the `entries.map(...)` call in
 * `renderStageCol` (`swimlane-card.ts:206-212`), and one bad entry
 * crashes the whole dashboard with a 500.
 *
 * Today the data layer (`loadLaneBuckets` / `bucketIntoLanes`)
 * filters out-of-template entries into `bucket.unbucketed` so the
 * crash path is not reachable on healthy in-vivo data — AUDIT-25's
 * fix added the explicit `(unrecognized stage)` tail. But the data-
 * layer classification and `classifyStage` are NOT structurally
 * coupled (different code paths, different lookup shape: `byStage.
 * get(stage) === undefined` vs `linearStages.indexOf(stage) === -1`).
 * If they ever drift (template mutated under a render, malformed
 * template reaching the renderer, a future refactor changing the
 * bucketize semantics, a locked-stage having no successor in
 * `linearStages`), the crash path is back. Per AUDIT-37's
 * recommendation, we catch at the `renderStageCol` map boundary and
 * emit a fallback row instead of taking the whole page down.
 *
 * Pure unit-level — hand-rolls a `LaneBucket` whose `byStage` maps a
 * known stage column to an entry whose `currentStage` ISN'T in the
 * template's `linearStages`. The drift forces the `classifyStage`
 * throw inside `renderRow`; without the fix, `renderSwimlane` throws
 * and the test catches it; with the fix, `renderSwimlane` returns a
 * fully-rendered swimlane that contains a fallback row for the bad
 * entry AND a normally-rendered row for the good entry.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderSwimlane } from '@/pages/dashboard/swimlane-card.ts';
import type { LaneBucket } from '@/pages/dashboard/lane-data.ts';
import type { PipelineTemplate } from '@deskwork/core/pipelines';
import type { LaneConfig } from '@deskwork/core/lanes';
import type { Entry } from '@deskwork/core/schema/entry';

function makeTemplate(): PipelineTemplate {
  // Template carries `Drafting` only; the test entry's `currentStage`
  // value `GhostStage` is NOT in `linearStages` + `offPipelineStages`,
  // so `classifyStage('GhostStage', template)` throws.
  return {
    id: 'test-classify-throw',
    name: 'Test classify-throw',
    description: 'Test template covering AUDIT-37 classifyStage-throw catch',
    linearStages: ['Drafting'],
    offPipelineStages: [],
    lockedStages: [],
  };
}

function makeLane(): LaneConfig {
  return {
    id: 'test-lane',
    name: 'Test Lane',
    pipelineTemplate: 'test-classify-throw',
    contentDir: 'docs',
  };
}

function makeEntry(slug: string, currentStage: string, uuid: string): Entry {
  return {
    uuid,
    slug,
    title: `Entry ${slug}`,
    keywords: [],
    source: 'manual',
    currentStage,
    iterationByStage: { [currentStage]: 0 },
    createdAt: '2026-05-31T10:00:00.000Z',
    updatedAt: '2026-05-31T10:00:00.000Z',
  };
}

/**
 * Hand-build a `LaneBucket` where `byStage.get('Drafting')` returns
 * BOTH a good entry (its `currentStage === 'Drafting'`, so
 * `classifyStage` succeeds) AND a drifted entry whose `currentStage`
 * is `'GhostStage'` (NOT in the template; `classifyStage` throws).
 * Both entries land in the same stage column — the renderer must
 * recover from the per-entry throw without crashing the column.
 */
function makeDriftedBucket(): LaneBucket {
  const goodEntry = makeEntry(
    'good-entry',
    'Drafting',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  );
  const driftedEntry = makeEntry(
    'drifted-entry',
    'GhostStage',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  );
  const byStage = new Map<string, readonly Entry[]>([
    ['Drafting', [goodEntry, driftedEntry]],
  ]);
  return {
    lane: makeLane(),
    template: makeTemplate(),
    byStage,
    unbucketed: [],
    entryCount: 2,
  };
}

describe('AUDIT-20260530-37 — defense-in-depth catch around classifyStage throw', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Silence the per-row warn during the test runs, but capture it
    // so we can assert it was emitted (operator-visible drift signal).
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('does NOT crash when an entry s currentStage is absent from the template', () => {
    const bucket = makeDriftedBucket();
    // Pre-fix this throws inside `renderStageCol`'s `entries.map`
    // and propagates out of `renderSwimlane`. Post-fix this returns
    // a fully-rendered swim with a fallback row for the bad entry.
    expect(() => renderSwimlane(bucket, 'd', false, new Map())).not.toThrow();
  });

  it('renders the good entry normally alongside a fallback row for the drifted entry', () => {
    const bucket = makeDriftedBucket();
    const out = renderSwimlane(bucket, 'd', false, new Map()).__raw;
    // Good entry renders via the standard `renderRow` shape —
    // `er-row-shell` data-attribute carries its slug.
    expect(out).toMatch(/data-slug="good-entry"/);
    // Drifted entry surfaces as a fallback row with a distinct marker
    // class so the operator can spot the drift visually. The fallback
    // exposes the offending `currentStage` value inline.
    expect(out).toMatch(/er-row-shell--classify-fallback/);
    expect(out).toMatch(/data-slug="drifted-entry"/);
    expect(out).toMatch(/data-stage="GhostStage"/);
    // The fallback row surfaces the offending stage value to the
    // operator so they can diagnose the drift without leaving the
    // dashboard. Mirrors the AUDIT-25 unbucketed-tail's
    // `data-unbucketed-current-stage` carrier shape.
    expect(out).toMatch(
      /data-classify-fallback-stage="GhostStage"/,
    );
  });

  it('emits a console.warn naming the offending entry + stage so the operator sees the drift in server logs', () => {
    const bucket = makeDriftedBucket();
    renderSwimlane(bucket, 'd', false, new Map());
    // Exactly one warn for the one drifted entry (the good entry
    // does not trip the catch).
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const args = warnSpy.mock.calls[0];
    expect(args).toBeDefined();
    const msg = String(args?.[0] ?? '');
    expect(msg).toContain('drifted-entry');
    expect(msg).toContain('GhostStage');
    expect(msg).toContain('test-classify-throw');
  });
});
