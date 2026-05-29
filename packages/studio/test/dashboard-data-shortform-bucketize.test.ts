/**
 * Unit tests for `bucketizeShortform` — the private helper in
 * `dashboard/data.ts` that buckets shortform workflows by platform.
 *
 * Per the project's "Never implement fallbacks or use mock data outside
 * of test code" rule, a workflow with `platform: undefined` is a
 * data-integrity bug that must surface as a throw, not as a silent drop.
 * This test locks the contract — any future regression to silent-drop
 * would fail here.
 */

import { describe, it, expect } from 'vitest';
import { bucketizeShortform } from '../src/pages/dashboard/data.ts';
import type { DraftWorkflowItem } from '@deskwork/core/review/types';

function workflow(overrides: Partial<DraftWorkflowItem> = {}): DraftWorkflowItem {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    site: 'd',
    slug: 'sample-shortform',
    contentKind: 'shortform',
    platform: 'linkedin',
    state: 'in-review',
    currentVersion: 1,
    createdAt: '2026-05-10T12:00:00.000Z',
    updatedAt: '2026-05-12T10:00:00.000Z',
    ...overrides,
  };
}

describe('bucketizeShortform', () => {
  it('buckets workflows into the platform Map keyed by `platform`', () => {
    const out = bucketizeShortform([
      workflow({ platform: 'linkedin', id: 'w-1', slug: 's-1' }),
      workflow({ platform: 'reddit', id: 'w-2', slug: 's-2' }),
      workflow({ platform: 'linkedin', id: 'w-3', slug: 's-3' }),
    ]);
    expect(out.get('linkedin')?.length).toBe(2);
    expect(out.get('reddit')?.length).toBe(1);
    expect(out.get('youtube')?.length).toBe(0);
    expect(out.get('instagram')?.length).toBe(0);
  });

  it('seeds all four DASHBOARD_PLATFORM_ORDER keys even with an empty input', () => {
    const out = bucketizeShortform([]);
    expect(out.get('linkedin')).toEqual([]);
    expect(out.get('reddit')).toEqual([]);
    expect(out.get('youtube')).toEqual([]);
    expect(out.get('instagram')).toEqual([]);
  });

  it('throws on a workflow whose `platform` is undefined (data-integrity bug)', () => {
    const bad = {
      id: 'w-bad',
      site: 'd',
      slug: 'missing-platform-workflow',
      contentKind: 'shortform',
      state: 'in-review',
      currentVersion: 1,
      createdAt: '2026-05-10T12:00:00.000Z',
      updatedAt: '2026-05-12T10:00:00.000Z',
      // platform: undefined  — intentionally absent
    } as DraftWorkflowItem;
    expect(() => bucketizeShortform([bad])).toThrow(
      /Shortform workflow "w-bad" \(slug "missing-platform-workflow"\) has no platform/,
    );
  });

  it('throws even when only one of N workflows is missing a platform', () => {
    const ok = workflow({ platform: 'linkedin', id: 'w-ok', slug: 'ok' });
    const bad = {
      ...workflow(),
      id: 'w-bad-2',
      slug: 'also-bad',
    } as DraftWorkflowItem;
    delete (bad as { platform?: unknown }).platform;
    expect(() => bucketizeShortform([ok, bad])).toThrow(/w-bad-2/);
  });
});
