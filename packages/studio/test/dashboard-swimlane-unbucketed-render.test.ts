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

    // AUDIT-20260531-02 — count the actual rendered cards directly so
    // the test fails if a regression makes the visible-card count
    // diverge from the displayed entry count. Pre-strengthening the
    // assertions only checked the text "3 entries" + slug substrings,
    // never the rendered card count, so a regression where a
    // template-bucketed card vanished (count text still "3", only 2
    // cards visible) would have passed green. The bucket.entryCount
    // for this fixture is 3 (1 template-bucketed `a-draft` + 2
    // unbucketed). The kanban surface emits one `data-row-shell` per
    // entry; the list surface emits one `lb-row` per entry — both
    // counts must reconcile with bucket.entryCount.
    const expectedEntryCount = 3;
    const stageGridHtml = extractStageGridSection(editorialBlock);
    const cardCount = (stageGridHtml.match(/data-row-shell/g) ?? []).length;
    expect(cardCount).toBe(expectedEntryCount);

    const listBodyHtml = extractListBodySection(editorialBlock);
    // Per the AUDIT-20260531-02 finding's regex-tuning note: count
    // `data-row-shell` attribute occurrences inside the list body
    // rather than `\blb-row\b`. The list body emits THREE different
    // `lb-row`-class shapes — real entry rows (`class="lb-row"`),
    // empty-state placeholders (`class="lb-row empty-state"`, one per
    // empty template stage), and unbucketed rows (`class="lb-row
    // lb-row--unbucketed"`). Only the first and third represent
    // visible entries; `renderEmptyListRow` deliberately omits
    // `data-row-shell` so the attribute count tracks real cards.
    // This makes the assertion symmetric with the kanban surface's
    // `data-row-shell` count above.
    const lbRowCount = (listBodyHtml.match(/data-row-shell/g) ?? []).length;
    expect(lbRowCount).toBe(expectedEntryCount);

    // Both unbucketed entries are visible in the rendered output
    // (operator-perceivable — they did not vanish). Kept as auxiliary
    // assertions; the load-bearing reconciliation claim is the
    // cardCount + lbRowCount comparisons above.
    expect(editorialBlock).toContain('data-slug="mystery-one"');
    expect(editorialBlock).toContain('data-slug="mystery-two"');
    // The raw offending stage values are surfaced for operator diagnosis.
    expect(stageGridHtml).toContain('NonExistentStage');
    expect(stageGridHtml).toContain('AnotherMissingStage');
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

  // Server-render coverage only — the .swim.collapsed CSS-reveal path (display:none → display:flex) is not exercised by this string-match test.
  it('emits unbucketed cell into swim compact strip (AUDIT-20260531-01)', async () => {
    // AUDIT-20260531-01 — `renderSwimCompact` (per-stage compact strip
    // emitted on every swim and revealed by CSS when the lane is
    // `.collapsed`) iterates only `template.linearStages +
    // template.offPipelineStages` and never reads `bucket.unbucketed`.
    // Result: the sum of visible `.sc-count` values is
    // `entryCount − unbucketed.length` while the swim-head `quick-meta`
    // reads `${bucket.entryCount} entries` — count inflated, entries
    // silently dropped from the compact strip.
    //
    // Fix mirrors the kanban + list-body precedents (AUDIT-20260530-25):
    // append a trailing `.sc-stage.is-unbucketed` cell carrying the
    // `⊘` glyph + `unbucketed.length` so the per-cell counts reconcile
    // with the swim-head's `quick-meta`.
    await writeSidecar(
      root,
      makeEntry({
        uuid: UUID_EDITORIAL_UNRECOGNIZED,
        slug: 'compact-mystery-one',
        title: 'Compact Mystery One',
        currentStage: 'NonExistentStage',
        iterationByStage: { NonExistentStage: 0 },
        lane: 'default',
      }),
    );
    await writeSidecar(
      root,
      makeEntry({
        uuid: UUID_VISUAL_UNRECOGNIZED,
        slug: 'compact-mystery-two',
        title: 'Compact Mystery Two',
        currentStage: 'AnotherMissingStage',
        iterationByStage: { AnotherMissingStage: 0 },
        lane: 'default',
      }),
    );

    const r = await getHtml(app, '/dev/editorial-studio');
    expect(r.status).toBe(200);

    const editorialBlock = extractLaneSection(r.html, 'default');
    expect(editorialBlock).not.toBe('');

    // (a) Locate the `.swim-compact` substring in the server-rendered
    // HTML (the per-stage compact strip emitted on every swim).
    const swimCompactOpen = editorialBlock.indexOf('<div class="swim-compact"');
    expect(swimCompactOpen).toBeGreaterThanOrEqual(0);
    // The compact strip contains nested `.sc-stage` divs; find the
    // outer closing tag by scanning forward through matched opens.
    let depth = 1;
    let cursor = swimCompactOpen + '<div class="swim-compact"'.length;
    while (depth > 0 && cursor < editorialBlock.length) {
      const nextOpen = editorialBlock.indexOf('<div', cursor);
      const nextClose = editorialBlock.indexOf('</div>', cursor);
      if (nextClose === -1) break;
      if (nextOpen !== -1 && nextOpen < nextClose) {
        depth += 1;
        cursor = nextOpen + '<div'.length;
      } else {
        depth -= 1;
        cursor = nextClose + '</div>'.length;
      }
    }
    const swimCompact = editorialBlock.slice(swimCompactOpen, cursor);
    expect(swimCompact).toContain('<div class="swim-compact"');

    // (b) An unbucketed cell renders inside `.swim-compact` with
    // `data-sc-stage="unbucketed"` and the `is-unbucketed` modifier.
    expect(swimCompact).toMatch(/class="sc-stage[^"]*\bis-unbucketed\b/);
    expect(swimCompact).toContain('data-sc-stage="unbucketed"');

    // (c) The unbucketed cell's `.sc-count` is 2 (matches
    // `bucket.unbucketed.length` for this fixture).
    const unbucketedCellMatch = swimCompact.match(
      /class="sc-stage[^"]*\bis-unbucketed\b[^"]*"[\s\S]*?<span class="sc-count">(\d+)<\/span>/,
    );
    expect(unbucketedCellMatch).not.toBeNull();
    expect(unbucketedCellMatch?.[1]).toBe('2');

    // (d) The sum of all `.sc-count` numeric values inside
    // `.swim-compact` reconciles with `bucket.entryCount` (3).
    const scCountMatches = swimCompact.match(
      /<span class="sc-count">(\d+)<\/span>/g,
    ) ?? [];
    const compactSum = scCountMatches.reduce((acc, raw) => {
      const m = raw.match(/(\d+)/);
      return m === null ? acc : acc + Number.parseInt(m[1], 10);
    }, 0);
    expect(compactSum).toBe(3);
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
