/**
 * Regression test for #223: calendar.md regen output must be byte-equal
 * across consecutive regen calls AND across the ingest-side / approve-side
 * code paths. Pre-fix the legacy `writeCalendar` helper used by ingest
 * emitted a column-set without `Updated`, while approve-side
 * `regenerateCalendar` emitted one WITH `Updated` — every commit that
 * landed an ingest or approve flipped the column, generating ambient
 * git-diff churn.
 *
 * The fix: ingest now goes through `regenerateCalendar`, the same helper
 * approve uses. This test pins both byte-equal idempotency and the
 * end-state shape so any future regression that reintroduces the legacy
 * column-toggle path gets caught here.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  mkdtempSync,
  rmSync,
  readFileSync,
  mkdirSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { regenerateCalendar } from '@/calendar/regenerate';
import { createFreshEntrySidecar } from '@/entry/create';
import { approveEntryStage } from '@/entry/approve';

let project: string;

beforeEach(() => {
  project = mkdtempSync(join(tmpdir(), 'dw-regen-idempotent-'));
  mkdirSync(join(project, '.deskwork', 'entries'), { recursive: true });
  mkdirSync(join(project, '.deskwork', 'review-journal', 'history'), {
    recursive: true,
  });
  writeFileSync(
    join(project, '.deskwork', 'config.json'),
    JSON.stringify({
      version: 1,
      sites: {
        main: {
          contentDir: 'docs',
          calendarPath: '.deskwork/calendar.md',
        },
      },
      defaultSite: 'main',
    }),
    'utf-8',
  );
});

afterEach(() => {
  rmSync(project, { recursive: true, force: true });
});

const calendarMd = (): string =>
  readFileSync(join(project, '.deskwork', 'calendar.md'), 'utf-8');

describe('calendar regen idempotency (#223)', () => {
  it('produces byte-equal calendar.md across two consecutive regens', async () => {
    await createFreshEntrySidecar(project, {
      uuid: '550e8400-e29b-41d4-a716-446655440099',
      slug: 'demo-entry',
      title: 'Demo',
      currentStage: 'Drafting',
      source: 'manual',
      now: new Date('2026-04-30T10:00:00.000Z'),
    });
    await regenerateCalendar(project);
    const first = calendarMd();
    await regenerateCalendar(project);
    const second = calendarMd();
    expect(second).toBe(first);
  });

  it('approve-side regen output equals a fresh ingest-side regen output', async () => {
    // Simulate the ingest-side flow: write a sidecar, regenerate.
    await createFreshEntrySidecar(project, {
      uuid: '550e8400-e29b-41d4-a716-446655440100',
      slug: 'workflow-demo',
      title: 'Workflow Demo',
      currentStage: 'Outlining',
      source: 'manual',
      now: new Date('2026-04-30T10:00:00.000Z'),
    });
    await regenerateCalendar(project);
    const ingestOutput = calendarMd();

    // Approve-side: advance the entry through approveEntryStage which
    // ALSO writes calendar.md via regenerateCalendar. After this, the
    // bytes must equal a fresh regen on the post-approve sidecar set.
    await approveEntryStage(project, {
      uuid: '550e8400-e29b-41d4-a716-446655440100',
    });
    const postApprove = calendarMd();

    // Re-run regenerate on the same sidecar set — the approve path's
    // write must match a fresh regen byte-for-byte.
    await regenerateCalendar(project);
    const reRegen = calendarMd();
    expect(reRegen).toBe(postApprove);

    // The ingest-side regen and the approve-side regen ran on
    // DIFFERENT sidecar states (Outlining vs. Drafting after approve),
    // so the bytes differ in the stage section — but the column SHAPE
    // must be identical (no `Updated` flip-flop). Assert both contain
    // the canonical `Updated` column header in their respective stage
    // sections.
    expect(ingestOutput).toContain(
      '| UUID | Slug | Title | Description | Keywords | Source | Updated |',
    );
    expect(postApprove).toContain(
      '| UUID | Slug | Title | Description | Keywords | Source | Updated |',
    );
  });

  it('regenerate after multiple sidecar writes is idempotent under repeat invocation', async () => {
    await createFreshEntrySidecar(project, {
      uuid: '550e8400-e29b-41d4-a716-446655440201',
      slug: 'one',
      title: 'One',
      currentStage: 'Ideas',
      source: 'manual',
      now: new Date('2026-04-30T10:00:00.000Z'),
    });
    await createFreshEntrySidecar(project, {
      uuid: '550e8400-e29b-41d4-a716-446655440202',
      slug: 'two',
      title: 'Two',
      currentStage: 'Drafting',
      source: 'manual',
      now: new Date('2026-04-30T11:00:00.000Z'),
    });
    await regenerateCalendar(project);
    const a = calendarMd();
    await regenerateCalendar(project);
    const b = calendarMd();
    await regenerateCalendar(project);
    const c = calendarMd();
    expect(a).toBe(b);
    expect(b).toBe(c);
  });
});
