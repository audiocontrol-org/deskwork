/**
 * Per-row affordance helpers for the dashboard.
 *
 * Pipeline-redesign Task 34. Buttons are static HTML — they link to
 * the entry's review surface (`/dev/editorial-review/<uuid>`) or
 * carry a `data-copy` payload that the existing studio client copies
 * to the clipboard. No new backend handlers are wired here; the
 * universal-verb skills are the canonical action path.
 *
 * Per DESKWORK-STATE-MACHINE.md (v5):
 * - Verbs are stage-gated, not state-gated. The iterate button shows
 *   on stages-that-permit-edits (Ideas/Planned/Outlining/Drafting),
 *   not on Final (locked) or Published (immutable).
 * - Revisions (the iteration counter) are bookkeeping. They do not
 *   surface in routine UI; the operator only sees them via revision
 *   history / revert flows. The previous "iteration: N" per-row
 *   display has been removed.
 */

import { html, unsafe, type RawHtml } from '../html.ts';
import { scrapbookViewerUrl } from '../../components/scrapbook-item.ts';
import type { Entry, Stage } from '@deskwork/core/schema/entry';

/**
 * Build the per-row action strip. Affordances vary by stage:
 *
 * - Stages-that-permit-edits (Ideas / Planned / Outlining / Drafting):
 *   "open →" link, "iterate →" copy-CLI button (always; no state gate),
 *   "approve →" copy-CLI button, "cancel ⊘" copy-CLI button.
 * - Final: "open →", "approve →" (graduates to Published; assigns a
 *   version per the operator's scheme), "cancel ⊘". NO iterate
 *   (Final locks content per the spec).
 * - Published: "view →" (read-only review surface). Future enhancement:
 *   surface a "revise" affordance that inducts back to Drafting.
 * - Blocked / Cancelled: "induct →" copy-CLI to bring the entry back.
 *
 * All non-terminal stages also get a `scrapbook ↗` link (#157).
 *
 * Each button's behavior is parked behind a `data-copy` attribute so
 * the existing studio client (editorial-studio-client.ts) handles
 * clipboard wiring without new server handlers.
 */
export function renderRowActions(entry: Entry, defaultSite: string): RawHtml {
  const buttons: string[] = [];
  const stage = entry.currentStage;
  const reviewLink = `/dev/editorial-review/entry/${entry.uuid}`;
  // Scrapbook URL uses the project's defaultSite. Multi-site calendars
  // would require a per-entry site lookup (out of scope for #157 — the
  // primary value is the dashboard ↔ scrapbook entry point existing at
  // all, and most projects have a single site). Slug already contains
  // any hierarchical path segments.
  //
  // #205: thread the entry's UUID through `scrapbookViewerUrl` so the
  // standalone viewer's server route resolves the listing via
  // `scrapbookDirForEntry` for entries whose on-disk path doesn't match
  // the slug template (e.g. feature-doc layouts under
  // `docs/<version>/<status>/<slug>/`). Falls back to slug-template
  // addressing for entries without an id binding.
  const scrapLink = scrapbookViewerUrl({
    site: defaultSite,
    path: entry.slug,
    entryId: entry.uuid,
  });

  if (isLinearActiveStage(stage)) {
    buttons.push(html`<a class="er-btn er-btn-small" href="${reviewLink}"
      title="open the review surface for ${entry.slug}">open →</a>`);
    // Iterate — stage-gated per DESKWORK-STATE-MACHINE.md Commandment II:
    // verbs are stage-gated, never state-gated. Iterate runs on stages
    // that permit edits (Ideas / Planned / Outlining / Drafting); Final
    // locks content so iterate is hidden there. The previous
    // `reviewState === 'iterating'` gate was a Commandment II violation;
    // removed in the v0.19 spec-conformance sweep.
    if (stagePermitsEdits(stage)) {
      buttons.push(html`<button class="er-btn er-btn-small er-btn-primary er-copy-btn" type="button"
        data-copy="/deskwork:iterate ${entry.slug}"
        title="operator clicked Iterate — run the iterate skill in Claude Code">iterate →</button>`);
    }
    // Approve (#244) — unconditional on active-pipeline rows. Mirrors
    // the review-surface decision strip (Approve is always visible
    // there); the dashboard previously gated this button on
    // `reviewState === 'approved'`, which is a transient state most
    // rows never carry, leaving the button effectively invisible. The
    // operator should be able to advance any active-pipeline entry
    // from the dashboard without first opening the review surface.
    buttons.push(html`<button class="er-btn er-btn-small er-btn-approve er-copy-btn" type="button"
      data-copy="/deskwork:approve ${entry.slug}"
      title="advance this entry to the next stage">approve →</button>`);
    // Cancel (#242) — pull this entry off-pipeline. Same clipboard
    // routing as approve / iterate; the skill mutates sidecar + journal.
    buttons.push(html`<button class="er-btn er-btn-small er-btn-reject er-copy-btn" type="button"
      data-copy="/deskwork:cancel ${entry.slug}"
      title="pull this entry off-pipeline (Cancelled). Reversible via /deskwork:induct.">cancel ⊘</button>`);
  } else if (stage === 'Published') {
    buttons.push(html`<a class="er-btn er-btn-small" href="${reviewLink}"
      title="read-only review surface for the published entry">view →</a>`);
  } else if (stage === 'Blocked' || stage === 'Cancelled') {
    buttons.push(html`<button class="er-btn er-btn-small er-copy-btn" type="button"
      data-copy="/deskwork:induct ${entry.slug}"
      title="bring this entry back into the pipeline">induct →</button>`);
  }

  // Scrapbook link follows every stage's primary action.
  buttons.push(html`<a class="er-btn er-btn-small er-btn-scrap"
    href="${scrapLink}" data-action="open-scrapbook"
    title="open the entry's scrapbook (research notes, drafts, etc.)">scrapbook ↗</a>`);

  return unsafe(`<span class="er-calendar-action">${buttons.join('')}</span>`);
}

function isLinearActiveStage(stage: Stage): boolean {
  return (
    stage === 'Ideas' ||
    stage === 'Planned' ||
    stage === 'Outlining' ||
    stage === 'Drafting' ||
    stage === 'Final'
  );
}

/**
 * Stages that permit content edits (and therefore iterate). Final
 * locks content per DESKWORK-STATE-MACHINE.md — iterate refuses there;
 * the operator must induct backward to a stage that permits edits if
 * they want to revise a Final entry.
 */
function stagePermitsEdits(stage: Stage): boolean {
  return (
    stage === 'Ideas' ||
    stage === 'Planned' ||
    stage === 'Outlining' ||
    stage === 'Drafting'
  );
}
