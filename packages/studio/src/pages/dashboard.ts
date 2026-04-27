/**
 * Studio dashboard page — `/dev/editorial-studio`.
 *
 * Ported from audiocontrol.org's `editorial-studio.astro`. Reads each
 * site's calendar + the review pipeline + the report, then renders the
 * five-stage editorial calendar with site filtering, the shortform
 * coverage matrix for Published blog entries, awaiting-press / recent-
 * proofs panels, and a voice-drift signal sidebar.
 *
 * The audiocontrol original was tightly coupled to two hardcoded sites
 * (`'audiocontrol' | 'editorialcontrol'`) and the `feature-image`
 * pipeline. Both go away here:
 *
 *   - Sites come from `ctx.config.sites`. The two-letter site label
 *     (was `'AC' | 'EC'`) is the first 2 letters uppercased.
 *   - The feature-image pipeline isn't part of deskwork core yet; the
 *     "feature image →" / "✓ baked" affordances are dropped. The
 *     scrapbook chip stays — `@deskwork/core/scrapbook` provides
 *     `countScrapbook`.
 */

import { readCalendar } from '@deskwork/core/calendar';
import {
  buildReport,
  type ReviewReport,
} from '@deskwork/core/review/report';
import { readWorkflows } from '@deskwork/core/review/pipeline';
import type { DraftWorkflowItem } from '@deskwork/core/review/types';
import { bodyState, type BodyState } from '@deskwork/core/body-state';
import { countScrapbook } from '@deskwork/core/scrapbook';
import {
  PLATFORMS,
  STAGES,
  effectiveContentType,
  hasRepoContent,
  type CalendarEntry,
  type DistributionRecord,
  type Platform,
  type Stage,
} from '@deskwork/core/types';
import { resolveCalendarPath, resolveBlogFilePath } from '@deskwork/core/paths';
import type { StudioContext } from '../routes/api.ts';
import { html, unsafe, type RawHtml } from './html.ts';
import { layout } from './layout.ts';
import { renderEditorialFolio } from './chrome.ts';

interface SitedEntry {
  site: string;
  entry: CalendarEntry;
}
interface SitedDistribution {
  site: string;
  platform: string;
  slug: string;
  shortform: boolean;
}

const PLATFORMS_ORDER: readonly Platform[] = [
  'reddit',
  'linkedin',
  'youtube',
  'instagram',
];

const STAGE_ORNAMENTS: Record<Stage, string> = {
  Ideas: '◇',
  Planned: '§',
  Outlining: '⊹',
  Drafting: '✎',
  Review: '※',
  Paused: '⏸',
  Published: '✓',
};

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function isPlatform(value: string): value is Platform {
  return (PLATFORMS as readonly string[]).includes(value);
}

function siteLabel(site: string): string {
  return site.slice(0, 2).toUpperCase();
}

function stateLabel(state: string): string {
  return state.replace('-', ' ');
}

function covKey(site: string, slug: string): string {
  return `${site}::${slug}`;
}

function fmtRelTime(iso: string, now: Date): string {
  const t = new Date(iso).getTime();
  const s = Math.max(0, Math.floor((now.getTime() - t) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function workflowLink(w: DraftWorkflowItem): string {
  if (w.contentKind === 'shortform') {
    return `/dev/editorial-review-shortform?focus=${w.id}#workflow-${w.id}`;
  }
  if (w.contentKind === 'outline') {
    return `/dev/editorial-review/${w.slug}?site=${w.site}&kind=outline`;
  }
  return `/dev/editorial-review/${w.slug}?site=${w.site}`;
}

function blogPreviewLink(site: string, slug: string, host: string, entry: CalendarEntry): string {
  if (entry.stage === 'Published') return `https://${host}/blog/${slug}/`;
  return `/dev/editorial-review/${slug}?site=${site}`;
}

interface DashboardData {
  calendarEntries: SitedEntry[];
  distributions: SitedDistribution[];
  slugsBySite: Record<string, string[]>;
  workflows: DraftWorkflowItem[];
  approved: DraftWorkflowItem[];
  terminal: DraftWorkflowItem[];
  publishedBlogEntries: SitedEntry[];
  shortformCoverage: Map<string, Set<Platform>>;
  activeBySitedSlug: Map<string, DraftWorkflowItem[]>;
  report: ReviewReport;
}

function loadDashboardData(ctx: StudioContext): DashboardData {
  const calendarEntries: SitedEntry[] = [];
  const distributions: SitedDistribution[] = [];
  const slugsBySite: Record<string, string[]> = {};
  const sites = Object.keys(ctx.config.sites);

  for (const site of sites) {
    slugsBySite[site] = [];
    const calendarPath = resolveCalendarPath(ctx.projectRoot, ctx.config, site);
    const cal = readCalendar(calendarPath);
    for (const entry of cal.entries) {
      calendarEntries.push({ site, entry });
      slugsBySite[site].push(entry.slug);
    }
    for (const d of cal.distributions) {
      const dr: DistributionRecord = d;
      distributions.push({
        site,
        platform: dr.platform,
        slug: dr.slug,
        shortform: typeof dr.shortform === 'string' && dr.shortform.length > 0,
      });
    }
  }

  const workflows = readWorkflows(ctx.projectRoot, ctx.config);
  const approved = workflows.filter((w) => w.state === 'approved');
  const terminal = workflows
    .filter((w) => w.state === 'applied' || w.state === 'cancelled')
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 10);

  const shortformCoverage = new Map<string, Set<Platform>>();
  for (const d of distributions) {
    if (!d.shortform) continue;
    if (!isPlatform(d.platform)) continue;
    const key = covKey(d.site, d.slug);
    const set = shortformCoverage.get(key) ?? new Set<Platform>();
    set.add(d.platform);
    shortformCoverage.set(key, set);
  }

  const publishedBlogEntries = calendarEntries
    .filter(
      ({ entry }) =>
        entry.stage === 'Published' && effectiveContentType(entry) === 'blog',
    )
    .sort((a, b) =>
      (b.entry.datePublished ?? '').localeCompare(a.entry.datePublished ?? ''),
    );

  const activeBySitedSlug = new Map<string, DraftWorkflowItem[]>();
  for (const w of workflows) {
    if (w.state === 'applied' || w.state === 'cancelled') continue;
    const key = covKey(w.site, w.slug);
    const list = activeBySitedSlug.get(key) ?? [];
    list.push(w);
    activeBySitedSlug.set(key, list);
  }

  const report: ReviewReport = buildReport(ctx.projectRoot, ctx.config, {});

  return {
    calendarEntries,
    distributions,
    slugsBySite,
    workflows,
    approved,
    terminal,
    publishedBlogEntries,
    shortformCoverage,
    activeBySitedSlug,
    report,
  };
}

function entryBodyStateOf(
  ctx: StudioContext,
  site: string,
  entry: CalendarEntry,
): BodyState {
  if (!hasRepoContent(effectiveContentType(entry))) return 'missing';
  const path = resolveBlogFilePath(ctx.projectRoot, ctx.config, site, entry.slug);
  return bodyState(path);
}

function findStageWorkflow(
  data: DashboardData,
  site: string,
  slug: string,
  stage: Stage,
): DraftWorkflowItem | undefined {
  const list = data.activeBySitedSlug.get(covKey(site, slug)) ?? [];
  if (stage === 'Outlining') return list.find((w) => w.contentKind === 'outline');
  return list.find((w) => w.contentKind === 'longform');
}

// ---------------------------------------------------------------------------
// Section renderers
// ---------------------------------------------------------------------------

function renderHeader(
  data: DashboardData,
  ctx: StudioContext,
  now: Date,
): RawHtml {
  const volume = '01';
  const issueNum = String(data.workflows.length).padStart(2, '0');
  const issueDate = `${now.getDate()} ${MONTH_NAMES[now.getMonth()]} ${now.getFullYear()}`;
  return unsafe(html`
  <header class="er-masthead">
    <div class="er-masthead-kicker">
      Vol. ${volume} &middot; № ${issueNum} &middot; Press-check
    </div>
    <h1 class="er-masthead-title">
      Editorial <em>Studio</em>
    </h1>
    <p class="er-masthead-deck">
      Project: <code>${ctx.projectRoot}</code>
      &nbsp;·&nbsp; <a class="er-link-marginalia" href="/dev/editorial-help">the manual</a>
    </p>
    <div class="er-masthead-meta">
      <span>${issueDate}</span>
      <span class="sep">·</span>
      <span>${data.calendarEntries.length} on the calendar</span>
      <span class="sep">·</span>
      <span>${data.activeBySitedSlug.size} in review</span>
      <span class="sep">·</span>
      <span>${data.approved.length} awaiting press</span>
    </div>
  </header>`);
}

function renderFilterStrip(sites: readonly string[]): RawHtml {
  return unsafe(html`
    <section class="er-filter" data-filter-strip>
      <span class="er-filter-label">Find</span>
      <input type="search" data-filter-input placeholder="slug, title…" autocomplete="off" />
      <span class="er-filter-label er-filter-label--gap">Site</span>
      <div class="er-chips" role="tablist">
        <button class="er-chip" aria-pressed="true" data-site-chip="all">all</button>
        ${sites.map(
          (s) =>
            unsafe(html`<button class="er-chip" data-site-chip="${s}">${siteLabel(s).toLowerCase()}</button>`),
        )}
      </div>
      <span class="er-filter-label er-filter-label--gap">Stage</span>
      <div class="er-chips" role="tablist">
        <button class="er-chip" aria-pressed="true" data-stage-chip="all">all</button>
        ${STAGES.map(
          (s) =>
            unsafe(html`<button class="er-chip" data-stage-chip="${s}">${s.toLowerCase()}</button>`),
        )}
      </div>
    </section>`);
}

const STAGE_EMPTY_MESSAGES: Record<Stage, string> = {
  Ideas: 'No open ideas. Run /editorial-add to capture one.',
  Planned: 'Nothing planned. /editorial-plan <slug> to promote an idea.',
  Outlining: 'Nothing in outlining. /editorial-outline <slug> to start one.',
  Drafting: 'No posts in drafting.',
  Review: 'Nothing in review stage.',
  Paused: 'Nothing paused. /deskwork:pause <slug> sets an entry aside without losing where it was.',
  Published: 'No published posts yet.',
};

function renderRowMeta(
  ctx: StudioContext,
  site: string,
  entry: CalendarEntry,
  stage: Stage,
  hasFile: boolean,
): RawHtml {
  const kind = effectiveContentType(entry);
  const parts: RawHtml[] = [];
  if (entry.targetKeywords && entry.targetKeywords.length > 0 && stage === 'Planned') {
    parts.push(
      unsafe(html`<span class="er-calendar-meta"><em>kw:</em> ${entry.targetKeywords.join(', ')}</span>`),
    );
  }
  if (entry.issueNumber && entry.issueNumber > 0) {
    parts.push(unsafe(html`<span class="er-calendar-meta">issue #${entry.issueNumber}</span>`));
  }
  if (entry.datePublished && stage === 'Published') {
    parts.push(unsafe(html`<span class="er-calendar-meta">${entry.datePublished}</span>`));
  }
  if (stage === 'Paused' && entry.pausedFrom) {
    parts.push(
      unsafe(html`<span class="er-calendar-meta"><em>was:</em> ${entry.pausedFrom}</span>`),
    );
  }
  if (kind !== 'blog') {
    parts.push(unsafe(html`<span class="er-calendar-meta er-calendar-meta-kind">${kind}</span>`));
  }
  if (kind === 'blog' && hasFile) {
    const n = countScrapbook(ctx.projectRoot, ctx.config, site, entry.slug);
    if (n > 0) {
      const label = n === 1 ? 'scrapbook item' : 'scrapbook items';
      parts.push(
        unsafe(html`<a class="er-calendar-meta er-calendar-meta-scrapbook er-calendar-meta-link"
          href="/dev/scrapbook/${site}/${entry.slug}"
          title="${n} ${label}">scrapbook · <span class="er-calendar-meta-scrapbook-count">${n}</span> →</a>`),
      );
    }
  }
  return unsafe(parts.map((p) => p.__raw).join(''));
}

function renderRowActions(
  site: string,
  entry: CalendarEntry,
  stage: Stage,
  hasFile: boolean,
  bodyWritten: boolean,
  wf: DraftWorkflowItem | undefined,
): RawHtml {
  const kind = effectiveContentType(entry);
  const buttons: string[] = [];
  if (stage === 'Ideas') {
    buttons.push(html`<button class="er-btn er-btn-small er-copy-btn" type="button"
      data-copy="/editorial-plan --site ${site} ${entry.slug}" title="copy command">plan →</button>`);
  }
  if (stage === 'Planned' && !hasFile) {
    buttons.push(html`<button class="er-btn er-btn-small er-btn-primary" type="button"
      data-action="scaffold-draft" data-site="${site}" data-slug="${entry.slug}">scaffold →</button>`);
  }
  if (stage === 'Planned' && hasFile) {
    buttons.push(html`<button class="er-btn er-btn-small er-btn-primary er-copy-btn" type="button"
      data-copy="/editorial-outline --site ${site} ${entry.slug}"
      title="scaffold file exists — copy to sketch the outline in Claude Code">outline →</button>`);
  }
  if (stage === 'Outlining' && wf && wf.state === 'iterating') {
    buttons.push(html`<button class="er-btn er-btn-small er-btn-primary er-copy-btn" type="button"
      data-copy="/editorial-iterate --kind outline --site ${site} ${entry.slug}"
      title="operator clicked Iterate">iterate outline →</button>`);
  }
  if (stage === 'Outlining' && wf && wf.state === 'approved') {
    buttons.push(html`<button class="er-btn er-btn-small er-btn-approve er-copy-btn" type="button"
      data-copy="/editorial-outline-approve --site ${site} ${entry.slug}"
      title="outline approved — advance to Drafting">approve outline →</button>`);
  }
  if (
    stage === 'Outlining' &&
    wf &&
    (wf.state === 'open' || wf.state === 'in-review')
  ) {
    buttons.push(html`<a class="er-btn er-btn-small" href="${workflowLink(wf)}"
      title="open the review surface to annotate / edit the outline">review outline →</a>`);
  }
  if (stage === 'Outlining' && !wf) {
    buttons.push(html`<button class="er-btn er-btn-small er-btn-primary er-copy-btn" type="button"
      data-copy="/editorial-outline --site ${site} ${entry.slug}"
      title="no outline workflow found — copy to (re)start one">outline →</button>`);
  }
  if ((stage === 'Drafting' || stage === 'Review') && !bodyWritten) {
    buttons.push(html`<button class="er-btn er-btn-small er-btn-primary er-copy-btn" type="button"
      data-copy="/editorial-draft --site ${site} ${entry.slug}"
      title="body is still the placeholder">draft body →</button>`);
  }
  if ((stage === 'Drafting' || stage === 'Review') && bodyWritten && !wf) {
    buttons.push(html`<button class="er-btn er-btn-small er-btn-primary" type="button"
      data-action="enqueue-review" data-site="${site}" data-slug="${entry.slug}"
      title="body is drafted — create a longform review workflow">review →</button>`);
  }
  if (stage === 'Drafting' || stage === 'Review') {
    buttons.push(html`<button class="er-btn er-btn-small er-btn-approve" type="button"
      data-action="mark-published" data-site="${site}" data-slug="${entry.slug}"
      title="flip to Published + set date">publish →</button>`);
  }
  if (stage === 'Published' && !wf) {
    buttons.push(html`<button class="er-btn er-btn-small er-copy-btn" type="button"
      data-copy="/editorial-draft-review --site ${site} ${entry.slug}"
      title="re-review a published post">re-review</button>`);
  }
  // #27 — Paused gets a "resume" copy; pausable stages get a "pause" copy.
  if (stage === 'Paused') {
    buttons.push(html`<button class="er-btn er-btn-small er-btn-primary er-copy-btn" type="button"
      data-copy="/deskwork:resume --site ${site} ${entry.slug}"
      title="restore to ${entry.pausedFrom ?? 'prior stage'}">resume →</button>`);
  } else if (
    stage === 'Ideas' ||
    stage === 'Planned' ||
    stage === 'Outlining' ||
    stage === 'Drafting' ||
    stage === 'Review'
  ) {
    buttons.push(html`<button class="er-btn er-btn-small er-copy-btn" type="button"
      data-copy="/deskwork:pause --site ${site} ${entry.slug}"
      title="set aside without losing the prior stage">pause</button>`);
  }
  if (kind === 'blog') {
    buttons.push(html`<button class="er-btn er-btn-small" type="button" data-action="rename-open"
      title="rename the slug — copies /editorial-rename-slug to clipboard">rename →</button>`);
  }
  return unsafe(`<span class="er-calendar-action">${buttons.join('')}</span>`);
}

function renderRow(
  ctx: StudioContext,
  data: DashboardData,
  sited: SitedEntry,
  stage: Stage,
  index: number,
): RawHtml {
  const { site, entry } = sited;
  const kind = effectiveContentType(entry);
  const body = entryBodyStateOf(ctx, site, entry);
  const hasFile = body !== 'missing';
  const bodyWritten = body === 'written';
  const wf = findStageWorkflow(data, site, entry.slug, stage);
  const search = [
    entry.slug,
    entry.title,
    (entry.targetKeywords ?? []).join(' '),
    kind,
    site,
  ].join(' ').toLowerCase();
  const host = ctx.config.sites[site]?.host ?? site;
  const slugCell = wf
    ? unsafe(html`<a href="${workflowLink(wf)}" title="open the review surface">${entry.slug}</a>`)
    : hasFile
      ? unsafe(html`<a href="${blogPreviewLink(site, entry.slug, host, entry)}"
          title="${entry.stage === 'Published' ? 'read the published article' : 'open the review surface for this draft'}">${entry.slug}</a>`)
      : entry.slug;

  const fileDot = hasRepoContent(kind)
    ? unsafe(html`<span class="er-file-dot er-file-${body}"
        title="${body === 'missing'
          ? 'no blog file'
          : body === 'placeholder'
            ? 'scaffold present, body is the placeholder'
            : 'body written'}">●</span>`)
    : '';
  const stamp = wf
    ? unsafe(html`<span class="er-stamp er-stamp-${wf.state}">${stateLabel(wf.state)} v${wf.currentVersion}</span>`)
    : '';

  const renameForm =
    kind === 'blog'
      ? unsafe(html`<form class="er-rename-inline" data-rename-form
          data-site="${site}" data-slug="${entry.slug}" hidden>
          <span class="er-rename-kicker" aria-hidden="true">rename →</span>
          <code class="er-rename-old" title="current slug; will 301 after rename">${entry.slug}</code>
          <span class="er-rename-arrow" aria-hidden="true">→</span>
          <input type="text" name="new-slug" data-rename-input autocomplete="off" spellcheck="false"
            placeholder="new-slug-here" aria-label="new slug" required />
          <small class="er-rename-hint" data-rename-hint>lowercase, digits, hyphens</small>
          <button type="button" class="er-btn er-btn-small" data-action="rename-cancel">cancel</button>
          <button type="submit" class="er-btn er-btn-small er-btn-primary"
            data-action="rename-copy">copy /rename →</button>
        </form>`)
      : '';

  // Hierarchical entries (slugs containing `/`) get a depth indicator the
  // CSS layer indents off of. Storage stays flat; this is a display-only
  // marker. Depth = number of `/` in the slug (so "the-outbound" → 0,
  // "the-outbound/characters" → 1, etc.).
  const depth = entry.slug.split('/').length - 1;
  const depthAttrs =
    depth > 0
      ? unsafe(html` data-depth="${depth}" style="--er-row-depth: ${depth}"`)
      : '';
  // For nested entries, show only the leaf segment as the prominent
  // identifier — the ancestor segments are implied by the visual indent
  // and the position in the sorted list.
  const slugDisplay =
    depth > 0
      ? unsafe(
          html`<span class="er-row-slug-ancestors" aria-hidden="true">${entry.slug.slice(0, entry.slug.lastIndexOf('/') + 1)}</span><span class="er-row-slug-leaf">${entry.slug.slice(entry.slug.lastIndexOf('/') + 1)}</span>`,
        )
      : '';
  const slugCellWithHierarchy = depth > 0 ? slugDisplay : slugCell;

  return unsafe(html`
    <div class="er-calendar-row-wrap" data-row-wrap data-search="${search}"${depthAttrs}>
      <div class="er-calendar-row" data-stage="${stage}" data-site="${site}"
        data-slug="${entry.slug}" data-search="${search}">
        <span class="er-row-num">№ ${String(index + 1).padStart(2, '0')}</span>
        <div class="er-calendar-body">
          <span class="er-row-site er-row-site--${site}" title="${host}">${siteLabel(site)}</span>
          <span class="er-row-slug">${depth > 0 ? slugCellWithHierarchy : slugCell}</span>
          <span class="er-calendar-title">${entry.title}</span>
          ${renderRowMeta(ctx, site, entry, stage, hasFile)}
        </div>
        <span class="er-calendar-status">${fileDot}${stamp}</span>
        ${renderRowActions(site, entry, stage, hasFile, bodyWritten, wf)}
      </div>
      ${renameForm}
    </div>`);
}

function renderStageSection(
  ctx: StudioContext,
  data: DashboardData,
  stage: Stage,
  entries: SitedEntry[],
  sites: readonly string[],
): RawHtml {
  const intakeBlock =
    stage === 'Ideas'
      ? unsafe(html`
        <div class="er-intake-form" data-intake-form hidden>
          <p class="er-intake-hint">
            Fill in what you know; the agent will use the values verbatim.
          </p>
          <div class="er-intake-grid">
            <label>
              <span>Site</span>
              <select data-intake-field="site">
                ${sites.map((s) => unsafe(html`<option value="${s}">${s}</option>`))}
              </select>
            </label>
            <label>
              <span>Content type</span>
              <select data-intake-field="contentType">
                <option value="blog">blog (default)</option>
                <option value="youtube">youtube</option>
                <option value="tool">tool</option>
              </select>
            </label>
            <label class="er-intake-wide">
              <span>Title</span>
              <input type="text" data-intake-field="title" placeholder="Working title" />
            </label>
            <label class="er-intake-wide">
              <span>Description</span>
              <textarea data-intake-field="description" rows="4"></textarea>
            </label>
            <label class="er-intake-wide" data-intake-content-url hidden>
              <span>Content URL</span>
              <input type="url" data-intake-field="contentUrl" placeholder="https://..." />
            </label>
          </div>
          <div class="er-intake-actions">
            <button class="er-btn er-btn-small" type="button" data-action="intake-cancel">cancel</button>
            <button class="er-btn er-btn-small er-btn-primary" type="button"
              data-action="intake-copy">copy intake →</button>
          </div>
        </div>`)
      : '';

  const intakeButton =
    stage === 'Ideas'
      ? unsafe(html`<button class="er-btn er-btn-small er-section-action" type="button"
        data-action="intake-toggle"
        title="fill out an intake sheet">intake new idea →</button>`)
      : '';

  const body =
    entries.length === 0
      ? unsafe(html`<div class="er-empty" style="padding: 1rem 0.25rem; font-size: 0.95rem;">
          ${STAGE_EMPTY_MESSAGES[stage]}
        </div>`)
      : unsafe(
          entries
            .map((e, i) => renderRow(ctx, data, e, stage, i).__raw)
            .join(''),
        );

  return unsafe(html`
    <section class="er-section" data-stage-section="${stage}">
      <h2 class="er-section-title">
        <span>${stage}</span>
        <span class="ornament">${STAGE_ORNAMENTS[stage]}</span>
        <span class="count">№ ${entries.length}</span>
        ${intakeButton}
      </h2>
      ${intakeBlock}
      ${body}
    </section>`);
}

function renderShortformMatrix(data: DashboardData, ctx: StudioContext): RawHtml {
  if (data.publishedBlogEntries.length === 0) return unsafe('');
  const rows = data.publishedBlogEntries.map(({ site, entry }) => {
    const covered = data.shortformCoverage.get(covKey(site, entry.slug)) ?? new Set<Platform>();
    const cells = PLATFORMS_ORDER.map((p) => {
      const has = covered.has(p);
      const inner = has
        ? html`<span class="er-sf-check" title="${p} copy drafted">✓</span>`
        : html`<button class="er-copy-btn er-sf-draft-btn" type="button"
            data-copy="/editorial-shortform-draft --site ${site} ${entry.slug} ${p}"
            title="copy /editorial-shortform-draft for ${p}">draft</button>`;
      const cls = has ? 'er-sf-cell er-sf-cell-covered' : 'er-sf-cell er-sf-cell-empty';
      return html`<td class="${cls}">${unsafe(inner)}</td>`;
    }).join('');
    const host = ctx.config.sites[site]?.host ?? site;
    return html`
      <tr data-site="${site}">
        <th scope="row" class="er-sf-slug">
          <span class="er-row-site er-row-site--${site}" title="${host}">${siteLabel(site)}</span>
          ${entry.slug}
        </th>
        ${unsafe(cells)}
      </tr>`;
  }).join('');

  return unsafe(html`
    <section class="er-section">
      <h2 class="er-section-title">
        <span>Short form · coverage</span>
        <span class="count">${data.publishedBlogEntries.length} × ${PLATFORMS_ORDER.length}</span>
      </h2>
      <table class="er-sf-matrix">
        <thead>
          <tr>
            <th scope="col" class="er-sf-slug-col">slug</th>
            ${PLATFORMS_ORDER.map(
              (p) => unsafe(html`<th scope="col" class="er-sf-platform er-sf-platform-${p}">${p}</th>`),
            )}
          </tr>
        </thead>
        <tbody>${unsafe(rows)}</tbody>
      </table>
    </section>`);
}

function renderApprovedSection(data: DashboardData, ctx: StudioContext): RawHtml {
  if (data.approved.length === 0) return unsafe('');
  const rows = data.approved
    .map((w) => {
      const host = ctx.config.sites[w.site]?.host ?? w.site;
      const platformBit =
        w.contentKind === 'shortform' && w.platform
          ? html`<span class="er-row-channel"> · ${w.platform}${w.channel ? ` · ${w.channel}` : ''}</span>`
          : '';
      const flagBit =
        w.contentKind === 'shortform' && w.platform
          ? ` --platform ${w.platform}${w.channel ? ` --channel ${w.channel}` : ''}`
          : '';
      return html`
        <a class="er-row" href="${workflowLink(w)}" data-slug="${w.slug}"
          data-site="${w.site}" data-state="${w.state}">
          <span class="er-row-num">→</span>
          <span class="er-row-site er-row-site--${w.site}" title="${host}">${siteLabel(w.site)}</span>
          <span class="er-row-slug">${w.slug}</span>
          <span class="er-row-kind">${w.contentKind}${unsafe(platformBit)}</span>
          <span class="er-stamp er-stamp-approved">approved</span>
          <span class="er-row-ts">v${w.currentVersion}</span>
          <span class="er-row-hint">
            Run · <code>/editorial-approve --site ${w.site} ${w.slug}${flagBit}</code>
          </span>
        </a>`;
    })
    .join('');
  return unsafe(html`
    <section class="er-section">
      <h2 class="er-section-title">
        <span>Awaiting press</span>
        <span class="count">№ ${data.approved.length}</span>
      </h2>
      ${unsafe(rows)}
    </section>`);
}

function renderTerminalSection(data: DashboardData, ctx: StudioContext, now: Date): RawHtml {
  if (data.terminal.length === 0) return unsafe('');
  const rows = data.terminal
    .map((w) => {
      const host = ctx.config.sites[w.site]?.host ?? w.site;
      const platformBit =
        w.contentKind === 'shortform' && w.platform
          ? html`<span class="er-row-channel"> · ${w.platform}</span>`
          : '';
      return html`
        <div class="er-row" data-state="${w.state}" data-site="${w.site}">
          <span class="er-row-num">—</span>
          <span class="er-row-site er-row-site--${w.site}" title="${host}">${siteLabel(w.site)}</span>
          <span class="er-row-slug" style="color: var(--er-ink-soft);">${w.slug}</span>
          <span class="er-row-kind">${w.contentKind}${unsafe(platformBit)}</span>
          <span class="er-stamp er-stamp-${w.state}">${w.state}</span>
          <span class="er-row-ts">${fmtRelTime(w.updatedAt, now)}</span>
        </div>`;
    })
    .join('');
  return unsafe(html`
    <section class="er-section">
      <h2 class="er-section-title">
        <span>Recent proofs</span>
        <span class="count">last ${data.terminal.length}</span>
      </h2>
      ${unsafe(rows)}
    </section>`);
}

function renderSidebar(data: DashboardData): RawHtml {
  const totalTerminal = data.report.all.approvedCount + data.report.all.cancelledCount;
  const hasEnoughSignal = totalTerminal >= 5;
  const topTwo = data.report.topCategories.filter((c) => c.count > 0).slice(0, 2);

  const driftBody = hasEnoughSignal && topTwo.length > 0
    ? unsafe(html`
        <p class="er-drift-primary">
          <em>${topTwo[0].category}</em>
          <span class="count"> ${topTwo[0].count}</span>
        </p>
        ${
          topTwo[1]
            ? unsafe(html`<p class="er-drift-secondary" style="margin: 0;">
                then <em style="color: var(--er-red-pencil);">${topTwo[1].category}</em> · ${topTwo[1].count}
              </p>`)
            : ''
        }
        <div style="margin-top: var(--er-space-2); font-family: var(--er-font-mono); font-size: 0.68rem; color: var(--er-faded);">
          from ${data.report.all.approvedCount} approved · ${data.report.all.cancelledCount} cancelled<br />
          <code style="margin-top: 0.25rem; display: inline-block;">/editorial-review-report --site &lt;site&gt;</code>
        </div>`)
    : unsafe(html`
        <p style="font-family: var(--er-font-display); font-style: italic; color: var(--er-ink-soft); margin: 0;">
          ${
            totalTerminal === 0
              ? 'No proofs yet. The signal builds with use.'
              : `Only ${totalTerminal} terminal ${totalTerminal === 1 ? 'proof' : 'proofs'} so far — need ${5 - totalTerminal} more.`
          }
        </p>`);

  return unsafe(html`
    <aside>
      <section class="er-drift">
        <div class="er-drift-label">Voice-drift · signal</div>
        ${driftBody}
      </section>
      <section class="er-slip" style="margin-top: var(--er-space-4);">
        <div class="er-slip-header">Short form</div>
        <h3 class="er-slip-title">Social copy</h3>
        <p style="font-size: 0.85rem; margin: 0 0 var(--er-space-1); color: var(--er-ink-soft);">
          Agent-drafted. Run in Claude Code:
        </p>
        <code style="display: block; font-size: 0.72rem; padding: var(--er-space-1) var(--er-space-2); word-break: break-all; background: var(--er-paper-2);">
          /editorial-shortform-draft --site &lt;site&gt; &lt;slug&gt; &lt;platform&gt; [channel]
        </code>
        <p style="margin-top: var(--er-space-2);">
          <a href="/dev/editorial-review-shortform">Go to the shortform desk →</a>
        </p>
      </section>
    </aside>`);
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export function renderDashboard(ctx: StudioContext): string {
  const sites = Object.keys(ctx.config.sites);
  const data = loadDashboardData(ctx);
  const now = ctx.now ? ctx.now() : new Date();

  const stageSections = STAGES.map((stage) => {
    // Sort by (site, slug) so hierarchical entries cluster under their
    // ancestor — `the-outbound` immediately precedes `the-outbound/characters`
    // and `the-outbound/characters/strivers`. This is purely a display
    // ordering; the underlying calendar storage stays a flat table.
    const stageEntries = data.calendarEntries
      .filter((e) => e.entry.stage === stage)
      .sort((a, b) => {
        const siteCmp = a.site.localeCompare(b.site);
        if (siteCmp !== 0) return siteCmp;
        return a.entry.slug.localeCompare(b.entry.slug);
      });
    return renderStageSection(ctx, data, stage, stageEntries, sites).__raw;
  }).join('\n');

  const body = html`
  ${renderEditorialFolio('dashboard', 'press-check')}
  ${renderHeader(data, ctx, now)}
  <main class="er-container">
    ${renderFilterStrip(sites)}
    <div class="er-layout">
      <div>
        ${unsafe(stageSections)}
        ${renderShortformMatrix(data, ctx)}
        ${renderApprovedSection(data, ctx)}
        ${renderTerminalSection(data, ctx, now)}
      </div>
      ${renderSidebar(data)}
    </div>
  </main>
  <div class="er-toast" data-toast hidden></div>
  <div class="er-poll-indicator" data-poll>auto-refresh · 10s</div>`;

  return layout({
    title: 'Editorial Studio — dev',
    cssHrefs: [
      '/static/css/editorial-review.css',
      '/static/css/editorial-nav.css',
      '/static/css/editorial-studio.css',
    ],
    bodyAttrs: 'data-review-ui="studio"',
    bodyHtml: body,
    embeddedJson: [
      {
        id: '',
        attr: 'data-rename-slugs',
        data: data.slugsBySite,
      },
    ],
    scriptModules: ['/static/dist/editorial-studio-client.js'],
  });
}

