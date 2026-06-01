/**
 * Tests for the `entry-anchor-shape` doctor rule.
 *
 * AUDIT-20260601-08 — companion rule to the spatialAnchor strict-shape
 * tightening landed by AUDIT-20260601-07. Verifies that the rule:
 *
 *   1. Emits one `error` finding per comment annotation whose
 *      `spatialAnchor` field fails the strict
 *      `SpatialAnchorSchema.safeParse`, naming the entry UUID +
 *      annotation id + project-relative journal path + offending shape.
 *   2. Skips events whose spatialAnchor parses successfully under
 *      the strict schema (negative test).
 *   3. Emits zero findings on an empty project (no journal dir).
 *   4. Bypasses the strict `JournalEventSchema.safeParse` read path so
 *      legacy loose anchors are SURFACED (not silently skipped).
 *   5. `plan()` returns `report-only` with the three repair paths in
 *      the reason — confirms there is no auto-repair branch.
 *
 * Fixtures live on disk under tmp directories — no filesystem mocking,
 * per the project's testing rules. Journal files are written as raw
 * JSON so the rule's "bypass the schema's silent skip" behavior is
 * exercised end-to-end.
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
import { runAudit, yesInteraction } from '@/doctor/runner';
import entryAnchorShape from '@/doctor/rules/entry-anchor-shape';
import { buildContentIndex } from '@/content-index';
import { readCalendar } from '@/calendar';
import { resolveCalendarPath } from '@/paths';
import type { DeskworkConfig } from '@/config';
import type { DoctorContext } from '@/doctor/types';

const RULE_ID = 'entry-anchor-shape';

interface Fixture {
  root: string;
  config: DeskworkConfig;
}

function setupFixture(): Fixture {
  const root = mkdtempSync(join(tmpdir(), 'dw-entry-anchor-shape-'));
  mkdirSync(join(root, '.deskwork', 'entries'), { recursive: true });
  mkdirSync(join(root, '.deskwork', 'lanes'), { recursive: true });
  mkdirSync(join(root, '.deskwork', 'review-journal', 'history'), {
    recursive: true,
  });
  mkdirSync(join(root, 'docs'), { recursive: true });
  writeFileSync(
    join(root, '.deskwork', 'calendar.md'),
    `# Editorial Calendar\n\n## Drafting\n\n| UUID | Slug | Title | Description | Keywords | Source | Updated |\n|------|------|------|------|------|------|------|\n`,
    'utf8',
  );
  const config: DeskworkConfig = {
    version: 1,
    sites: {
      main: { contentDir: 'docs', calendarPath: '.deskwork/calendar.md' },
    },
    defaultSite: 'main',
  };
  return { root, config };
}

/**
 * Write a journal event JSON file directly (no schema validation) so
 * we can persist a legacy loose anchor the strict
 * `JournalEventSchema.safeParse` would refuse to write.
 */
function writeJournalFile(
  root: string,
  fileSlug: string,
  payload: unknown,
): void {
  writeFileSync(
    join(
      root,
      '.deskwork',
      'review-journal',
      'history',
      `${fileSlug}.json`,
    ),
    JSON.stringify(payload, null, 2),
    'utf8',
  );
}

function buildCtx(fixture: Fixture): DoctorContext {
  const calendarPath = resolveCalendarPath(fixture.root, fixture.config, 'main');
  return {
    projectRoot: fixture.root,
    config: fixture.config,
    site: 'main',
    calendar: readCalendar(calendarPath),
    index: buildContentIndex(fixture.root, fixture.config, 'main'),
    workflows: [],
    interaction: yesInteraction,
  };
}

const ENTRY_UUID = '11111111-1111-4111-8111-111111111111';
const ANNOTATION_ID_LEGACY = 'cmt_legacy_no_coords';
const ANNOTATION_ID_VALID = 'cmt_valid_pixel';

function legacyLooseAnchorEvent(
  annotationId: string,
  spatialAnchor: unknown,
): unknown {
  return {
    kind: 'entry-annotation',
    at: '2026-05-31T12:00:00.000Z',
    entryId: ENTRY_UUID,
    annotation: {
      type: 'comment',
      id: annotationId,
      workflowId: 'wf_1',
      createdAt: '2026-05-31T12:00:00.000Z',
      version: 1,
      range: { start: 0, end: 4 },
      text: 'legacy comment',
      spatialAnchor,
    },
  };
}

describe('doctor: entry-anchor-shape', () => {
  let fixture: Fixture;

  beforeEach(() => {
    fixture = setupFixture();
  });

  afterEach(() => {
    rmSync(fixture.root, { recursive: true, force: true });
  });

  it('emits a finding for a comment with a malformed pixel-without-coords spatialAnchor', async () => {
    writeJournalFile(
      fixture.root,
      '2026-05-31T12-00-00-000Z-legacy',
      legacyLooseAnchorEvent(ANNOTATION_ID_LEGACY, { kind: 'pixel' }),
    );

    const report = await runAudit(
      { projectRoot: fixture.root, config: fixture.config },
      yesInteraction,
    );
    const findings = report.findings.filter((f) => f.ruleId === RULE_ID);
    expect(findings).toHaveLength(1);

    const f = findings[0];
    expect(f.severity).toBe('error');
    expect(f.details.entryId).toBe(ENTRY_UUID);
    expect(f.details.annotationId).toBe(ANNOTATION_ID_LEGACY);
    // Project-relative journal path — never absolute.
    expect(String(f.details.journalPath).startsWith('/')).toBe(false);
    expect(String(f.details.journalPath)).toContain(
      join('.deskwork', 'review-journal', 'history'),
    );
    expect(f.details.offendingShape).toBe('{"kind":"pixel"}');
    expect(f.message).toContain(ANNOTATION_ID_LEGACY);
    expect(f.message).toContain(ENTRY_UUID);
    expect(f.message).toContain('pixel');
  });

  it('emits a finding for a pixel anchor carrying a forbidden selector field', async () => {
    writeJournalFile(
      fixture.root,
      '2026-05-31T12-01-00-000Z-mixed',
      legacyLooseAnchorEvent('cmt_mixed_shape', {
        kind: 'pixel',
        x: 10,
        y: 20,
        selector: '#header',
      }),
    );

    const ctx = buildCtx(fixture);
    const findings = await entryAnchorShape.audit(ctx);
    expect(findings).toHaveLength(1);
    expect(findings[0].details.annotationId).toBe('cmt_mixed_shape');
    // The shape preserves the journal's offending JSON for operator
    // triage; ordering of keys is deterministic via JSON.stringify.
    expect(findings[0].details.offendingShape).toContain('"selector":"#header"');
  });

  it('emits a finding for a dom-selector anchor without selector field', async () => {
    writeJournalFile(
      fixture.root,
      '2026-05-31T12-02-00-000Z-no-selector',
      legacyLooseAnchorEvent('cmt_no_selector', { kind: 'dom-selector' }),
    );

    const ctx = buildCtx(fixture);
    const findings = await entryAnchorShape.audit(ctx);
    expect(findings).toHaveLength(1);
    expect(findings[0].details.annotationId).toBe('cmt_no_selector');
  });

  it('emits zero findings when every comment anchor parses cleanly', async () => {
    writeJournalFile(
      fixture.root,
      '2026-05-31T12-03-00-000Z-valid-pixel',
      legacyLooseAnchorEvent(ANNOTATION_ID_VALID, {
        kind: 'pixel',
        x: 100,
        y: 200,
      }),
    );
    writeJournalFile(
      fixture.root,
      '2026-05-31T12-04-00-000Z-valid-dom',
      legacyLooseAnchorEvent('cmt_valid_dom', {
        kind: 'dom-selector',
        selector: '#header > h1',
      }),
    );

    const ctx = buildCtx(fixture);
    const findings = await entryAnchorShape.audit(ctx);
    expect(findings).toHaveLength(0);
  });

  it('emits zero findings for comments without a spatialAnchor field', async () => {
    writeJournalFile(
      fixture.root,
      '2026-05-31T12-05-00-000Z-no-anchor',
      {
        kind: 'entry-annotation',
        at: '2026-05-31T12:05:00.000Z',
        entryId: ENTRY_UUID,
        annotation: {
          type: 'comment',
          id: 'cmt_no_anchor',
          workflowId: 'wf_1',
          createdAt: '2026-05-31T12:05:00.000Z',
          version: 1,
          range: { start: 0, end: 4 },
          text: 'plain comment',
        },
      },
    );

    const ctx = buildCtx(fixture);
    const findings = await entryAnchorShape.audit(ctx);
    expect(findings).toHaveLength(0);
  });

  it('emits zero findings on an empty project (no journal history dir)', async () => {
    rmSync(join(fixture.root, '.deskwork', 'review-journal', 'history'), {
      recursive: true,
      force: true,
    });
    const ctx = buildCtx(fixture);
    const findings = await entryAnchorShape.audit(ctx);
    expect(findings).toHaveLength(0);
  });

  it('skips non-comment entry-annotation events (e.g. resolve, edit-comment)', async () => {
    writeJournalFile(
      fixture.root,
      '2026-05-31T12-06-00-000Z-resolve',
      {
        kind: 'entry-annotation',
        at: '2026-05-31T12:06:00.000Z',
        entryId: ENTRY_UUID,
        annotation: {
          type: 'resolve',
          id: 'a_resolve',
          workflowId: 'wf_1',
          createdAt: '2026-05-31T12:06:00.000Z',
          commentId: 'cmt_target',
          resolved: true,
        },
      },
    );

    const ctx = buildCtx(fixture);
    const findings = await entryAnchorShape.audit(ctx);
    expect(findings).toHaveLength(0);
  });

  it('plan() returns report-only with the three repair paths in the reason', async () => {
    writeJournalFile(
      fixture.root,
      '2026-05-31T12-07-00-000Z-legacy',
      legacyLooseAnchorEvent(ANNOTATION_ID_LEGACY, { kind: 'pixel' }),
    );

    const ctx = buildCtx(fixture);
    const findings = await entryAnchorShape.audit(ctx);
    expect(findings).toHaveLength(1);

    const plan = await entryAnchorShape.plan(ctx, findings[0]);
    expect(plan.kind).toBe('report-only');
    if (plan.kind !== 'report-only') throw new Error('plan must be report-only');
    expect(plan.reason).toContain('delete');
    expect(plan.reason).toContain('back-fill');
    expect(plan.reason).toContain('normalizer');
  });

  it('surfaces a malformed anchor that the strict JournalEventSchema would silently skip', async () => {
    // The strict `JournalEventSchema.safeParse` in `journal/read.ts`
    // rejects this whole event (because `spatialAnchor` fails the
    // discriminated-union schema) and `readJournalEvents` `continue`s
    // past it. The doctor rule walks raw JSON, so it MUST see the
    // event and produce a finding even though the read path drops it.
    writeJournalFile(
      fixture.root,
      '2026-05-31T12-08-00-000Z-bypass',
      legacyLooseAnchorEvent('cmt_bypassed', {
        kind: 'svg-element',
        x: 1,
        y: 2,
      }),
    );

    const ctx = buildCtx(fixture);
    const findings = await entryAnchorShape.audit(ctx);
    expect(findings).toHaveLength(1);
    expect(findings[0].details.annotationId).toBe('cmt_bypassed');
    expect(findings[0].details.offendingShape).toBe(
      '{"kind":"svg-element","x":1,"y":2}',
    );
  });
});
