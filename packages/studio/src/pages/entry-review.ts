/**
 * Entry-uuid keyed review surface — `/dev/editorial-review/entry/:entryId`.
 *
 * Pipeline-redesign Task 35. The legacy `/dev/editorial-review/:slug`
 * (and its `:id` UUID variant) routes are workflow-uuid + calendar-entry
 * keyed. This sibling route is keyed by the *entry uuid* (the sidecar
 * id), uses the eight-stage entry model (Task 33/34), and renders the
 * minimal affordance set returned by `getAffordances(entry)`.
 *
 * The two surfaces coexist during the migration window. Once the
 * workflow-keyed routes are retired, this becomes the canonical review
 * surface; until then, the dashboard's per-row "review" links continue
 * to point at the legacy route.
 *
 * Rendering is intentionally minimal — the goal of Task 35 is the route
 * shape + affordance plumbing, not a fully-styled UI. Styling will land
 * once the affordance set stabilizes against real entries.
 */

import { resolveEntry } from '../lib/entry-resolver.ts';
import { getAffordances } from '../lib/stage-affordances.ts';
import type { Affordances } from '../lib/stage-affordances.ts';
import type { Entry } from '@deskwork/core/schema/entry';
import { html, unsafe, type RawHtml } from './html.ts';
import { layout } from './layout.ts';

const STAGE_PICKER_OPTIONS = [
  'Ideas',
  'Planned',
  'Outlining',
  'Drafting',
  'Final',
] as const;

const CONTROL_LABELS: Readonly<Record<string, string>> = {
  save: 'Save',
  iterate: 'Iterate',
  approve: 'Approve',
  reject: 'Reject',
  'historical-stage-dropdown': 'Historical stage',
  'view-only': 'Read-only',
  'fork-placeholder': 'Fork (coming)',
  'induct-to': 'Induct to',
};

function renderControl(control: string, entry: Entry): RawHtml {
  const label = CONTROL_LABELS[control] ?? control;
  if (control === 'induct-to') {
    const options = STAGE_PICKER_OPTIONS.map(
      (s) => unsafe(html`<option value="${s}">${s}</option>`),
    );
    return unsafe(html`
      <label class="er-entry-control er-entry-control--induct">
        <span class="er-entry-control-label">${label}</span>
        <select name="induct-to" data-entry-uuid="${entry.uuid}">
          ${options}
        </select>
      </label>`);
  }
  if (control === 'historical-stage-dropdown') {
    const stages = Object.keys(entry.iterationByStage);
    if (stages.length === 0) {
      return unsafe('');
    }
    const options = stages.map(
      (s) => unsafe(html`<option value="${s}">${s}</option>`),
    );
    return unsafe(html`
      <label class="er-entry-control er-entry-control--history">
        <span class="er-entry-control-label">${label}</span>
        <select name="history-stage" data-entry-uuid="${entry.uuid}">
          ${options}
        </select>
      </label>`);
  }
  if (control === 'view-only') {
    return unsafe(html`<span class="er-entry-control er-entry-control--readonly">${label}</span>`);
  }
  if (control === 'fork-placeholder') {
    return unsafe(
      html`<button class="er-entry-control er-entry-control--button" type="button" disabled data-control="fork">${label}</button>`,
    );
  }
  return unsafe(
    html`<button class="er-entry-control er-entry-control--button" type="button" data-control="${control}" data-entry-uuid="${entry.uuid}">${label}</button>`,
  );
}

function renderControls(entry: Entry, affordances: Affordances): RawHtml {
  const buttons = affordances.controls.map((c) => renderControl(c, entry));
  const className = affordances.mutable
    ? 'er-entry-controls er-entry-controls--mutable'
    : 'er-entry-controls er-entry-controls--readonly';
  return unsafe(html`<nav class="${className}" aria-label="Entry controls">${buttons}</nav>`);
}

function renderArtifact(body: string, mutable: boolean): RawHtml {
  if (mutable) {
    return unsafe(html`
      <textarea class="er-entry-body" name="body" rows="24" data-mutable="true">${body}</textarea>`);
  }
  return unsafe(html`
    <pre class="er-entry-body er-entry-body--readonly" data-mutable="false">${body}</pre>`);
}

function renderEntryReview(
  entry: Entry,
  artifactBody: string,
  artifactPath: string,
  affordances: Affordances,
): string {
  const stageBadge = unsafe(
    html`<span class="er-entry-stage" data-stage="${entry.currentStage}">${entry.currentStage}</span>`,
  );
  const priorBadge = entry.priorStage
    ? unsafe(html`<span class="er-entry-prior-stage">paused from ${entry.priorStage}</span>`)
    : '';
  const body = html`
    <main class="er-entry-shell" data-entry-uuid="${entry.uuid}">
      <header class="er-entry-head">
        <p class="er-entry-kicker">Editorial Review · entry</p>
        <h1 class="er-entry-title">${entry.title}</h1>
        <p class="er-entry-meta">
          ${stageBadge}
          ${priorBadge}
          <code class="er-entry-uuid">${entry.uuid}</code>
        </p>
        <p class="er-entry-artifact-path"><code>${artifactPath}</code></p>
      </header>
      ${renderControls(entry, affordances)}
      <section class="er-entry-artifact">
        ${renderArtifact(artifactBody, affordances.mutable)}
      </section>
    </main>`;
  return layout({
    title: `${entry.title} — entry review — dev`,
    cssHrefs: ['/static/css/editorial-review.css', '/static/css/entry-review.css'],
    bodyAttrs: 'data-review-ui="entry-review"',
    bodyHtml: body,
    scriptModules: ['entry-review-client'],
  });
}

function renderNotFound(entryId: string, reason: string): string {
  const body = html`
    <main class="er-entry-shell er-entry-shell--missing">
      <h1>Entry not found</h1>
      <p>No sidecar matched <code>${entryId}</code>.</p>
      <p class="er-entry-detail">${reason}</p>
      <p><a href="/dev/editorial-studio">Back to the studio</a></p>
    </main>`;
  return layout({
    title: 'Entry not found — dev',
    cssHrefs: ['/static/css/editorial-review.css', '/static/css/entry-review.css'],
    bodyAttrs: 'data-review-ui="entry-review-missing"',
    bodyHtml: body,
    scriptModules: [],
  });
}

interface EntryReviewResult {
  status: 200 | 404;
  html: string;
}

export async function renderEntryReviewPage(
  projectRoot: string,
  entryId: string,
): Promise<EntryReviewResult> {
  let resolved;
  try {
    resolved = await resolveEntry(projectRoot, entryId);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return { status: 404, html: renderNotFound(entryId, reason) };
  }
  const affordances = getAffordances(resolved.entry);
  const html = renderEntryReview(
    resolved.entry,
    resolved.artifactBody,
    resolved.artifactPath,
    affordances,
  );
  return { status: 200, html };
}
