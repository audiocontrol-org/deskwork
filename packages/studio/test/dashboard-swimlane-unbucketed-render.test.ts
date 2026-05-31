/**
 * AUDIT-20260530-25 — Dashboard `bucket.unbucketed` entries are silently
 * dropped from the rendered swimlane while still inflating every entry-
 * count display. This regression mirrors AUDIT-20260530-14 (canonical
 * calendar SSOT) and AUDIT-20260529-37 (entry-review composed view),
 * both of which were closed by emitting an explicit
 * `(unrecognized stage)` tail section so stage-not-in-template entries
 * remain visible.
 *
 * The fix path here is the dashboard analogue: render `bucket.unbucketed`
 * as a trailing `.stage-col.is-unbucketed` column on each swim's kanban
 * grid AND as a trailing `.lb-group.is-unbucketed` group on each swim's
 * list-body. Each unbucketed entry's raw `currentStage` value is
 * surfaced so the operator can diagnose the routing drift inline.
 *
 * Pure integration — uses real sidecars, real lane configs, real
 * pipeline templates. No mocks. Per `.claude/rules/testing.md`,
 * fixture project trees live on disk via `mkdtempSync`.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeSidecar } from '@deskwork/core/sidecar';
import {
  setupDashboardFixture,
  getHtml,
  makeEntry,
  extractLaneSection,
  extractStageGridSection,
  extractListBodySection,
} from './__helpers/dashboard-swimlane-fixture.ts';
import { createApp } from '../src/server.ts';

const UUID_EDITORIAL_UNRECOGNIZED = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const UUID_VISUAL_UNRECOGNIZED = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

describe('dashboard swimlane AUDIT-20260530-25 — unbucketed entries are rendered (not silently dropped)', () => {
  let root: string;
  let app: ReturnType<typeof createApp>;
  let cleanup: () => void;

  beforeEach(async () => {
    const fixture = await setupDashboardFixture();
    root = fixture.root;
    app = fixture.app;
    cleanup = fixture.cleanup;
  });

  afterEach(() => {
    cleanup();
  });

  it('renders unbucketed entries (currentStage not in template) as a trailing kanban column with the raw stage shown', async () => {
    // Seed a fifth entry in the editorial lane whose `currentStage` is
    // not part of the editorial template (Ideas / Planned / Outlining /
    // Drafting / Final / Published / Blocked / Cancelled). The entry
    // MUST appear in the rendered dashboard with its offending stage
    // visible so the operator can diagnose the routing drift.
    await writeSidecar(
      root,
      makeEntry({
        uuid: UUID_EDITORIAL_UNRECOGNIZED,
        slug: 'mystery-stage-entry',
        title: 'Mystery Stage Entry',
        currentStage: 'NonExistentStage',
        iterationByStage: { NonExistentStage: 0 },
        lane: 'default',
      }),
    );

    const r = await getHtml(app, '/dev/editorial-studio');
    expect(r.status).toBe(200);

    const editorialBlock = extractLaneSection(r.html, 'default');
    expect(editorialBlock).not.toBe('');

    // (a) An unbucketed kanban column renders in the editorial swim.
    const stageGrid = extractStageGridSection(editorialBlock);
    expect(stageGrid).toMatch(/class="stage-col[^"]*\bis-unbucketed\b/);

    // (b) The unbucketed entry's slug appears in the rendered HTML
    // (operator-perceivable proof the entry did not vanish).
    expect(editorialBlock).toContain('data-slug="mystery-stage-entry"');

    // (c) The entry's raw `currentStage` value is shown so the operator
    // can diagnose the data-integrity drift.
    expect(stageGrid).toContain('NonExistentStage');

    // (d) The list-body also surfaces an unbucketed group so the list
    // view stays consistent with the kanban view.
    const listBody = extractListBodySection(editorialBlock);
    expect(listBody).toMatch(/class="lb-group[^"]*\bis-unbucketed\b/);
    expect(listBody).toContain('data-slug="mystery-stage-entry"');
    expect(listBody).toContain('NonExistentStage');
  });

  it('count consistency: swim-head `${n} entries` matches the visible cards once unbucketed renders', async () => {
    // Editorial lane fixture seeds 1 entry (a-draft, Drafting). Add 2
    // unbucketed entries → count must read 3 entries; the rendered
    // editorial block must contain 3 row-shell / lb-row markers (1
    // template-bucketed + 2 unbucketed).
    await writeSidecar(
      root,
      makeEntry({
        uuid: UUID_EDITORIAL_UNRECOGNIZED,
        slug: 'mystery-one',
        title: 'Mystery One',
        currentStage: 'NonExistentStage',
        iterationByStage: { NonExistentStage: 0 },
        lane: 'default',
      }),
    );
    await writeSidecar(
      root,
      makeEntry({
        uuid: UUID_VISUAL_UNRECOGNIZED,
        slug: 'mystery-two',
        title: 'Mystery Two',
        currentStage: 'AnotherMissingStage',
        iterationByStage: { AnotherMissingStage: 0 },
        lane: 'default',
      }),
    );

    const r = await getHtml(app, '/dev/editorial-studio');
    expect(r.status).toBe(200);

    const editorialBlock = extractLaneSection(r.html, 'default');
    // The swim-head quick-meta count includes unbucketed (lane-data
    // entryCount already folds them in).
    expect(editorialBlock).toMatch(/<span class="quick-meta">3 entries<\/span>/);

    // Both unbucketed entries are visible in the rendered output
    // (operator-perceivable — they did not vanish).
    expect(editorialBlock).toContain('data-slug="mystery-one"');
    expect(editorialBlock).toContain('data-slug="mystery-two"');
    // The raw offending stage values are surfaced for operator diagnosis.
    const stageGrid = extractStageGridSection(editorialBlock);
    expect(stageGrid).toContain('NonExistentStage');
    expect(stageGrid).toContain('AnotherMissingStage');
  });

  it('happy-path regression: a swim with every entry at template-known stages emits NO unbucketed column or group', async () => {
    // No additional entries — the baseline fixture seeds only
    // template-valid stages (Drafting / Sketched / Approved / Drafted).
    const r = await getHtml(app, '/dev/editorial-studio');
    expect(r.status).toBe(200);

    // All three lanes carry no unbucketed entries → no swim should
    // render the modifier.
    expect(r.html).not.toMatch(/class="stage-col[^"]*\bis-unbucketed\b/);
    expect(r.html).not.toMatch(/class="lb-group[^"]*\bis-unbucketed\b/);
  });

  it('unbucketed render is scoped per-swim: an unbucketed entry in editorial does NOT leak into the mockups swim', async () => {
    await writeSidecar(
      root,
      makeEntry({
        uuid: UUID_EDITORIAL_UNRECOGNIZED,
        slug: 'edit-mystery',
        title: 'Editorial Mystery',
        currentStage: 'NonExistentStage',
        iterationByStage: { NonExistentStage: 0 },
        lane: 'default',
      }),
    );

    const r = await getHtml(app, '/dev/editorial-studio');
    expect(r.status).toBe(200);

    const editorialBlock = extractLaneSection(r.html, 'default');
    const mockupsBlock = extractLaneSection(r.html, 'mockups');

    // Editorial swim carries the unbucketed entry.
    expect(editorialBlock).toContain('data-slug="edit-mystery"');
    expect(extractStageGridSection(editorialBlock)).toMatch(
      /class="stage-col[^"]*\bis-unbucketed\b/,
    );

    // Mockups swim is clean — no unbucketed modifier, no edit-mystery slug.
    expect(mockupsBlock).not.toContain('data-slug="edit-mystery"');
    expect(mockupsBlock).not.toMatch(/class="stage-col[^"]*\bis-unbucketed\b/);
    expect(extractListBodySection(mockupsBlock)).not.toMatch(
      /class="lb-group[^"]*\bis-unbucketed\b/,
    );
  });
});
