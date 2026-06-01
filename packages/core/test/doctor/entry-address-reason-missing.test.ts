/**
 * Tests for the `entry-address-reason-missing` doctor rule.
 *
 * Phase 8 Step 8.1.2 (Part 1) — companion rule to the `AddressAnnotation`
 * schema tightening that lands in Part 2. Verifies that the rule:
 *
 *   1. Emits one `error` finding per `address`-type entry-annotation
 *      whose `disposition === 'addressed'` AND whose `reason` field is
 *      missing OR an empty string, naming the entry UUID + annotation
 *      id + project-relative journal path + reasonShape detail.
 *   2. Emits zero findings when an `addressed` annotation carries a
 *      non-empty `reason` (negative test for the happy path).
 *   3. Emits zero findings for `deferred` / `wontfix` dispositions
 *      regardless of `reason` presence (the contract is scoped to
 *      `addressed` per the PRD acceptance criterion).
 *   4. Emits zero findings on an empty project (no journal dir).
 *   5. Bypasses the strict `JournalEventSchema.safeParse` read path so
 *      legacy reasonless `addressed` annotations are SURFACED, not
 *      silently skipped — the rule walks raw journal JSON.
 *   6. `plan()` returns `report-only` with the three repair paths in
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
import entryAddressReasonMissing from '@/doctor/rules/entry-address-reason-missing';
import { buildContentIndex } from '@/content-index';
import { readCalendar } from '@/calendar';
import { resolveCalendarPath } from '@/paths';
import type { DeskworkConfig } from '@/config';
import type { DoctorContext } from '@/doctor/types';

const RULE_ID = 'entry-address-reason-missing';

interface Fixture {
  root: string;
  config: DeskworkConfig;
}

function setupFixture(): Fixture {
  const root = mkdtempSync(join(tmpdir(), 'dw-entry-addr-reason-'));
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
 * Write a journal event JSON file directly (no schema validation) so we
 * can persist a legacy reasonless `addressed` annotation the strict
 * `JournalEventSchema.safeParse` would refuse to write under the Part-2
 * schema.
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

const ENTRY_UUID = '22222222-2222-4222-8222-222222222222';

interface AddressEventInput {
  annotationId: string;
  disposition: 'addressed' | 'deferred' | 'wontfix';
  /**
   * Tri-state — `undefined` writes no `reason` key at all; a string
   * writes the literal value (including `''` to exercise the empty-
   * string branch).
   */
  reason?: string;
}

function addressEvent(input: AddressEventInput): unknown {
  const ann: Record<string, unknown> = {
    type: 'address',
    id: input.annotationId,
    workflowId: 'wf_1',
    createdAt: '2026-05-31T12:00:00.000Z',
    commentId: `cmt_target_${input.annotationId}`,
    version: 2,
    disposition: input.disposition,
  };
  if (input.reason !== undefined) ann.reason = input.reason;
  return {
    kind: 'entry-annotation',
    at: '2026-05-31T12:00:00.000Z',
    entryId: ENTRY_UUID,
    annotation: ann,
  };
}

describe('doctor: entry-address-reason-missing', () => {
  let fixture: Fixture;

  beforeEach(() => {
    fixture = setupFixture();
  });

  afterEach(() => {
    rmSync(fixture.root, { recursive: true, force: true });
  });

  it('emits a finding for an addressed annotation with reason field missing', async () => {
    writeJournalFile(
      fixture.root,
      '2026-05-31T12-00-00-000Z-legacy-missing',
      addressEvent({
        annotationId: 'a_missing',
        disposition: 'addressed',
        // no reason field
      }),
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
    expect(f.details.annotationId).toBe('a_missing');
    expect(f.details.disposition).toBe('addressed');
    expect(f.details.reasonShape).toBe('missing');
    // Project-relative journal path — never absolute.
    expect(String(f.details.journalPath).startsWith('/')).toBe(false);
    expect(String(f.details.journalPath)).toContain(
      join('.deskwork', 'review-journal', 'history'),
    );
    expect(f.message).toContain('a_missing');
    expect(f.message).toContain(ENTRY_UUID);
    expect(f.message).toContain('missing');
  });

  it('emits a finding for an addressed annotation with reason set to empty string', async () => {
    writeJournalFile(
      fixture.root,
      '2026-05-31T12-01-00-000Z-legacy-empty',
      addressEvent({
        annotationId: 'a_empty',
        disposition: 'addressed',
        reason: '',
      }),
    );

    const ctx = buildCtx(fixture);
    const findings = await entryAddressReasonMissing.audit(ctx);
    expect(findings).toHaveLength(1);
    expect(findings[0].details.annotationId).toBe('a_empty');
    expect(findings[0].details.reasonShape).toBe('empty-string');
    expect(findings[0].message).toContain('empty string');
  });

  it('emits zero findings when an addressed annotation has a non-empty reason', async () => {
    writeJournalFile(
      fixture.root,
      '2026-05-31T12-02-00-000Z-happy',
      addressEvent({
        annotationId: 'a_happy',
        disposition: 'addressed',
        reason: 'addressed by adding section X at line 42',
      }),
    );

    const ctx = buildCtx(fixture);
    const findings = await entryAddressReasonMissing.audit(ctx);
    expect(findings).toHaveLength(0);
  });

  it('emits zero findings for a deferred disposition without reason', async () => {
    // The contract is scoped to `addressed` per the PRD acceptance
    // criterion. `deferred` without `reason` is NOT a finding under
    // this rule.
    writeJournalFile(
      fixture.root,
      '2026-05-31T12-03-00-000Z-deferred',
      addressEvent({
        annotationId: 'a_deferred',
        disposition: 'deferred',
      }),
    );

    const ctx = buildCtx(fixture);
    const findings = await entryAddressReasonMissing.audit(ctx);
    expect(findings).toHaveLength(0);
  });

  it('emits zero findings for a wontfix disposition without reason', async () => {
    writeJournalFile(
      fixture.root,
      '2026-05-31T12-04-00-000Z-wontfix',
      addressEvent({
        annotationId: 'a_wontfix',
        disposition: 'wontfix',
      }),
    );

    const ctx = buildCtx(fixture);
    const findings = await entryAddressReasonMissing.audit(ctx);
    expect(findings).toHaveLength(0);
  });

  it('emits zero findings on an empty project (no journal history dir)', async () => {
    rmSync(join(fixture.root, '.deskwork', 'review-journal', 'history'), {
      recursive: true,
      force: true,
    });
    const ctx = buildCtx(fixture);
    const findings = await entryAddressReasonMissing.audit(ctx);
    expect(findings).toHaveLength(0);
  });

  it('emits zero findings when the journal history dir is empty', async () => {
    const ctx = buildCtx(fixture);
    const findings = await entryAddressReasonMissing.audit(ctx);
    expect(findings).toHaveLength(0);
  });

  it('skips non-address annotation events (comment, resolve)', async () => {
    writeJournalFile(
      fixture.root,
      '2026-05-31T12-05-00-000Z-comment',
      {
        kind: 'entry-annotation',
        at: '2026-05-31T12:05:00.000Z',
        entryId: ENTRY_UUID,
        annotation: {
          type: 'comment',
          id: 'cmt_plain',
          workflowId: 'wf_1',
          createdAt: '2026-05-31T12:05:00.000Z',
          version: 1,
          range: { start: 0, end: 4 },
          text: 'plain comment',
        },
      },
    );
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
    const findings = await entryAddressReasonMissing.audit(ctx);
    expect(findings).toHaveLength(0);
  });

  it('plan() returns report-only with the three repair paths in the reason', async () => {
    writeJournalFile(
      fixture.root,
      '2026-05-31T12-07-00-000Z-legacy-missing',
      addressEvent({
        annotationId: 'a_missing',
        disposition: 'addressed',
      }),
    );

    const ctx = buildCtx(fixture);
    const findings = await entryAddressReasonMissing.audit(ctx);
    expect(findings).toHaveLength(1);

    const plan = await entryAddressReasonMissing.plan(ctx, findings[0]);
    expect(plan.kind).toBe('report-only');
    if (plan.kind !== 'report-only') throw new Error('plan must be report-only');
    expect(plan.reason).toContain('tombstone');
    expect(plan.reason).toContain('back-fill');
    expect(plan.reason).toContain('acknowledge');
  });

  it('surfaces a reasonless addressed annotation that the strict JournalEventSchema would silently skip post-Part-2', async () => {
    // Once Part 2 lands, the strict `JournalEventSchema.safeParse` in
    // `journal/read.ts` will reject this whole event (because
    // `reason` is missing on an `addressed` disposition) and
    // `readJournalEvents` `continue`s past it. The doctor rule walks
    // raw JSON, so it MUST see the event and produce a finding even
    // though the read path would drop it.
    writeJournalFile(
      fixture.root,
      '2026-05-31T12-08-00-000Z-bypass',
      addressEvent({
        annotationId: 'a_bypassed',
        disposition: 'addressed',
      }),
    );

    const ctx = buildCtx(fixture);
    const findings = await entryAddressReasonMissing.audit(ctx);
    expect(findings).toHaveLength(1);
    expect(findings[0].details.annotationId).toBe('a_bypassed');
  });
});
