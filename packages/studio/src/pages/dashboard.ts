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
import { countScrapbook, countScrapbookForEntry } from '@deskwork/core/scrapbook';
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
import {
  resolveCalendarPath,
  resolveBlogFilePath,
  findEntryFile,
} from '@deskwork/core/paths';
import type { ContentIndex } from '@deskwork/core/content-index';
import type { StudioContext } from '../routes/api.ts';
import { html, unsafe, type RawHtml } from './html.ts';
import { layout } from './layout.ts';
import { renderEditorialFolio } from './chrome.ts';

/**
 * Per-request content-index getter. The route layer wires this to the
 * Hono context's memoized cache so a single dashboard render only
 * builds the index once per site even though many entries call
 * `entryBodyStateOf`. When omitted (e.g., a non-route caller), the
 * dashboard falls back to the slug-template path.
 */
export type DashboardIndexGetter = (site: string) => ContentIndex;

interface SitedEntry {
  site: string;
  entry: CalendarEntry;
}
interface SitedDistribution {
  site: string;
  platform: string;
  slug: string;
  /**
   * Stable id of the joined calendar entry. Phase 19d: keys
   * (site, entryId) when present, falls back to (site, slug) for
   * pre-id distribution records.
   */
  entryId: string | null;
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

/**
 * Internal correlation key for the dashboard's `Map<key, …>` joins.
 * Phase 19d: prefer the calendar entry's stable UUID when present,
 * falling back to the slug for legacy data (workflows / entries
 * created before frontmatter ids landed). The function is overloaded
 * via two arities — `covKey(site, slug)` for slug-only callers and
 * `covKey(site, slug, entryId)` for callers that have access to the
 * id. The latter form picks `entryId` when it's a non-empty string,
 * else falls through to `slug`. Display still uses slug as the human
 * label; this key only correlates internally.
 *
 * The "fallback" here is the legacy migration path — not the kind of
 * silent fallback the project rules forbid. Doctor reports the legacy
 * cases so operators can backfill ids.
 */
function covKey(site: string, slug: string, entryId?: string | null): string {
  const stable = entryId !== undefined && entryId !== null && entryId !== ''
    ? entryId
    : slug;
  return `${site}::${stable}`;
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
    // Phase 21c: shortform now renders inside the unified review
    // surface. Workflow-id deep-links land on the right workflow
    // without first resolving an entry id — the route handler
    // recognises a workflow id and dispatches accordingly.
    return `/dev/editorial-review/${w.id}`;
  }
  // Phase 19d: prefer the canonical id-based URL when the workflow
  // carries entryId. The legacy slug URL still works (server.ts will
  // 302-redirect it), but emitting the canonical form skips the
  // redirect round trip and makes the UI's outbound links honest.
  const key = w.entryId ?? w.slug;
  const kindBit = w.contentKind === 'outline' ? '&kind=outline' : '';
  return `/dev/editorial-review/${key}?site=${w.site}${kindBit}`;
}

function blogPreviewLink(site: string, slug: string, host: string, entry: CalendarEntry): string {
  if (entry.stage === 'Published') return `https://${host}/blog/${slug}/`;
  // Phase 19d: prefer the canonical id-based URL.
  const key = entry.id ?? slug;
  return `/dev/editorial-review/${key}?site=${site}`;
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

function loadDashboardData(
  ctx: StudioContext,
  getIndex?: DashboardIndexGetter,
): DashboardData {
  // `getIndex` is currently consumed downstream by renderRow →
  // entryBodyStateOf, not here. Threading it through keeps the call
  // signature symmetric with renderDashboard and leaves room for
  // future load-time uses (e.g., joining workflows by entry id).
  void getIndex;
  const calendarEntries: SitedEntry[] = [];
  const distributions: SitedDistribution[] = [];
  const slugsBySite: Record<string, string[]> = {};
  const sites = Object.keys(ctx.config.sites);

  for (const site of sites) {
    slugsBySite[site] = [];
    const calendarPath = resolveCalendarPath(ctx.projectRoot, ctx.config, site);
    const cal = readCalendar(calendarPath);
    // Build a slug → id map up front so distributions can resolve
    // their entry's stable id even when the DistributionRecord
    // pre-dates the entryId field.
    const idBySlug = new Map<string, string>();
    for (const entry of cal.entries) {
      calendarEntries.push({ site, entry });
      slugsBySite[site].push(entry.slug);
      if (entry.id) idBySlug.set(entry.slug, entry.id);
    }
    for (const d of cal.distributions) {
      const dr: DistributionRecord = d;
      const entryId = dr.entryId ?? idBySlug.get(dr.slug) ?? null;
      distributions.push({
        site,
        platform: dr.platform,
        slug: dr.slug,
        entryId,
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
    const key = covKey(d.site, d.slug, d.entryId);
    const set = shortformCoverage.get(key) ?? new Set<Platform>();
    set.add(d.platform);
    shortformCoverage.set(key, set);
  }
  // Phase 21c — shortform workflows count as coverage too. Distributions
  // come from the calendar (an `editorial-publish` side-effect), so a
  // freshly-started shortform draft (no published-yet distribution
  // record) wouldn't show in the matrix without this branch.
  for (const w of workflows) {
    if (w.contentKind !== 'shortform') continue;
    if (w.state === 'applied' || w.state === 'cancelled') continue;
    if (!w.platform || !isPlatform(w.platform)) continue;
    const key = covKey(w.site, w.slug, w.entryId);
    const set = shortformCoverage.get(key) ?? new Set<Platform>();
    set.add(w.platform);
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
    const key = covKey(w.site, w.slug, w.entryId);
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
  getIndex?: DashboardIndexGetter,
): BodyState {
  if (!hasRepoContent(effectiveContentType(entry))) return 'missing';
  // When the entry has a stable id AND the route layer wired in a
  // per-request index getter, use the id-driven content-index lookup
  // — this matches files whose path doesn't follow the slug template
  // (e.g., writingcontrol-shape projects where slug `the-outbound`
  // resolves to `projects/the-outbound/index.md` while the calendar
  // slug doesn't bake the path). Without an id or getter, fall back
  // to the slug-template behavior so non-route callers still work.
  if (entry.id !== undefined && entry.id !== '' && getIndex) {
    const path = findEntryFile(
      ctx.projectRoot,
      ctx.config,
      site,
      entry.id,
      getIndex(site),
      { slug: entry.slug },
    );
    if (path !== undefined) return bodyState(path);
  }
  const fallback = resolveBlogFilePath(ctx.projectRoot, ctx.config, site, entry.slug);
  return bodyState(fallback);
}

function findStageWorkflow(
  data: DashboardData,
  site: string,
  entry: CalendarEntry,
  stage: Stage,
): DraftWorkflowItem | undefined {
  const list =
    data.activeBySitedSlug.get(covKey(site, entry.slug, entry.id)) ?? [];
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
  <header class="er-pagehead er-pagehead--centered">
    <p class="er-pagehead__kicker">
      Vol. ${volume} &middot; № ${issueNum} &middot; Press-check
    </p>
    <h1 class="er-pagehead__title">
      Editorial <em>Studio</em>
    </h1>
    <p class="er-pagehead__deck">
      Project: <code>${ctx.projectRoot}</code>
      &nbsp;·&nbsp; <a class="er-link-marginalia" href="/dev/editorial-help">the manual</a>
    </p>
    <p class="er-pagehead__meta">
      <span>${issueDate}</span>
      <span class="sep">·</span>
      <span>${data.calendarEntries.length} on the calendar</span>
      <span class="sep">·</span>
      <span>${data.activeBySitedSlug.size} in review</span>
      <span class="sep">·</span>
      <span>${data.approved.length} awaiting press</span>
    </p>
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
  getIndex?: DashboardIndexGetter,
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
    // Phase 19c+: prefer the id-driven content-index lookup so entries
    // whose on-disk path doesn't match the slug template (e.g.
    // writingcontrol-shape projects) report the correct count. When the
    // entry has no id binding OR no per-request index getter is wired,
    // fall through to the slug-template path. The fallback is the
    // legacy migration path, not a silent default — doctor reports the
    // unbound cases so operators can backfill ids.
    const n =
      entry.id !== undefined && entry.id !== '' && getIndex
        ? countScrapbookForEntry(
            ctx.projectRoot,
            ctx.config,
            site,
            entry,
            getIndex(site),
          )
        : countScrapbook(ctx.projectRoot, ctx.config, site, entry.slug);
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
  getIndex?: DashboardIndexGetter,
): RawHtml {
  const { site, entry } = sited;
  const kind = effectiveContentType(entry);
  const body = entryBodyStateOf(ctx, site, entry, getIndex);
  const hasFile = body !== 'missing';
  const bodyWritten = body === 'written';
  const wf = findStageWorkflow(data, site, entry, stage);
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
          ${renderRowMeta(ctx, site, entry, stage, hasFile, getIndex)}
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
  getIndex?: DashboardIndexGetter,
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
            .map((e, i) => renderRow(ctx, data, e, stage, i, getIndex).__raw)
            .join(''),
        );

  return unsafe(html`
    <section class="er-section" data-stage-section="${stage}">
      <h2 class="er-section-head">
        <span>${stage}</span>
        <span class="ornament">${STAGE_ORNAMENTS[stage]}</span>
        <span class="count">№ ${entries.length}</span>
        ${intakeButton}
      </h2>
      ${intakeBlock}
      ${body}
    </section>`);
}

/**
 * Shortform workflow lookup keyed by (site, entryId|slug, platform).
 * Built once per dashboard render so the coverage matrix can render
 * each covered cell as a direct link to the workflow's review surface
 * — phase 21c replaces the prior "✓" sigil + copy-CLI-command flow.
 */
function indexShortformWorkflows(
  data: DashboardData,
): Map<string, DraftWorkflowItem> {
  const out = new Map<string, DraftWorkflowItem>();
  for (const w of data.workflows) {
    if (w.contentKind !== 'shortform') continue;
    if (w.state === 'applied' || w.state === 'cancelled') continue;
    if (!w.platform) continue;
    const key = `${covKey(w.site, w.slug, w.entryId)}::${w.platform}`;
    out.set(key, w);
  }
  return out;
}

function renderShortformMatrix(data: DashboardData, ctx: StudioContext): RawHtml {
  if (data.publishedBlogEntries.length === 0) return unsafe('');
  const wfIndex = indexShortformWorkflows(data);
  const rows = data.publishedBlogEntries.map(({ site, entry }) => {
    const covered =
      data.shortformCoverage.get(covKey(site, entry.slug, entry.id)) ??
      new Set<Platform>();
    const cells = PLATFORMS_ORDER.map((p) => {
      const has = covered.has(p);
      const wfKey = `${covKey(site, entry.slug, entry.id)}::${p}`;
      const wf = wfIndex.get(wfKey);
      // A covered cell with a live workflow → link straight into the
      // unified review surface. A covered cell without a workflow
      // (distribution recorded outside the studio's pipeline — legacy
      // data) keeps the static "✓" so the matrix doesn't lie about
      // what's clickable. Empty cells render a real start button that
      // POSTs to /api/dev/editorial-review/start-shortform and
      // navigates to the new workflow's review URL.
      let inner: string;
      if (has && wf) {
        inner = html`<a class="er-sf-link" href="/dev/editorial-review/${wf.id}"
          title="${p} workflow · open in review">✓</a>`;
      } else if (has) {
        inner = html`<span class="er-sf-check" title="${p} copy drafted">✓</span>`;
      } else {
        inner = html`<button class="er-sf-start-btn" type="button"
          data-action="start-shortform"
          data-site="${site}"
          data-slug="${entry.slug}"
          data-platform="${p}"
          title="Start a ${p} shortform draft for ${entry.slug}">start</button>`;
      }
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
      <h2 class="er-section-head">
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
      <h2 class="er-section-head">
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
      <h2 class="er-section-head">
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
          Click <em>start</em> in the coverage matrix above to begin a
          shortform draft. Edit, iterate, and approve in the unified
          review surface.
        </p>
        <p style="margin-top: var(--er-space-2);">
          <a href="/dev/editorial-review-shortform">Go to the shortform desk →</a>
        </p>
      </section>
    </aside>`);
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export function renderDashboard(
  ctx: StudioContext,
  getIndex?: DashboardIndexGetter,
): string {
  const sites = Object.keys(ctx.config.sites);
  const data = loadDashboardData(ctx, getIndex);
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
    return renderStageSection(ctx, data, stage, stageEntries, sites, getIndex).__raw;
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

