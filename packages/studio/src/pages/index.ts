/**
 * Studio index page — `/dev/`.
 *
 * The title page of the studio. Reads like the table-of-contents spread
 * of a pressed volume: roman numerals, leader dots, route paths in mono
 * on the right (the "page numbers"). Templated routes (longform reviews,
 * scrapbook) render their slug placeholder in red-pencil italic — they
 * can't be linked because they require a slug, so they appear as
 * non-link entries with the path shown.
 *
 * Four sections × six entries:
 *   - Pipeline   (i.)         — Dashboard
 *   - Review desk (ii.–iii.)  — Shortform, Longform (templated)
 *   - Browse     (iv.–v.)     — Content view, Scrapbook (templated)
 *   - Reference  (vi.)        — The Compositor's Manual
 *
 * Read-only — links to existing routes only. No editing capability here.
 */

import { readAllSidecars } from '@deskwork/core/sidecar';
import type { Entry } from '@deskwork/core/schema/entry';
import type { StudioContext } from '../routes/api.ts';
import { html, unsafe, type RawHtml } from './html.ts';
import { layout } from './layout.ts';
import { renderEditorialFolio } from './chrome.ts';

/** Stages that are part of the longform pipeline for review-default purposes. */
const LONGFORM_PIPELINE_STAGES: ReadonlySet<Entry['currentStage']> = new Set([
  'Ideas',
  'Planned',
  'Outlining',
  'Drafting',
  'Final',
]);

interface IndexEntry {
  /** Roman numeral display ("I", "II", …). */
  numeral: string;
  /** Page title. May contain HTML for italic emphasis. */
  titleHtml: string;
  /** Plain-text fallback for accessibility (used as link text). */
  titleText: string;
  /** Route path. When `template` is set, the path is shown but the
   *  hyperlink target comes from `linkHref` instead. */
  route: string;
  /**
   * Explicit link target. When set, the title becomes a link to this
   * URL — even for templated entries (where the visual route hint
   * stays alongside as a placeholder). When omitted, behavior depends
   * on `template`: non-templated entries link to `route`; templated
   * entries render as plain text.
   */
  linkHref?: string;
  /**
   * For templated routes (longform reviews, scrapbook), this is the
   * placeholder text shown in red-pencil italic. The route string still
   * shows the static prefix; the placeholder is appended.
   */
  template?: { prefix: string; placeholder: string };
  /** Italic description hung below the title. */
  desc: string;
  /** Optional small uppercase mono hint pill. */
  hint?: string;
  /** Optional secondary italic line shown after the hint. */
  postHint?: string;
}

interface IndexSection {
  ornament: string;
  name: string;
  count: string;
  entries: IndexEntry[];
}

/**
 * Pick the entry that should be the default Longform-reviews target —
 * the most-recent in-pipeline entry whose review state is in-review or
 * iterating. Returns null when no candidate exists; the caller falls
 * back to the dashboard's Review section anchor.
 *
 * Replaces the legacy workflow-based picker as part of the pipeline
 * redesign (Task 36) — the studio's review surfaces are now keyed by
 * entry uuid, not workflow uuid.
 */
export function pickDefaultLongformEntry(
  entries: readonly Entry[],
): Entry | null {
  const candidates = entries
    .filter((e) => LONGFORM_PIPELINE_STAGES.has(e.currentStage))
    .filter((e) => e.reviewState === 'in-review' || e.reviewState === 'iterating')
    .slice()
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return candidates[0] ?? null;
}

async function buildSections(ctx: StudioContext): Promise<readonly IndexSection[]> {
  const entries: readonly Entry[] = await (async () => {
    try {
      return await readAllSidecars(ctx.projectRoot);
    } catch {
      return [];
    }
  })();
  const longformDefaultEntry = pickDefaultLongformEntry(entries);
  // Issue #107: III links to the most-recent in-review (or iterating)
  // longform entry when one exists, else falls back to the dashboard's
  // Review section anchor (`#stage-review`). The link target is the
  // entry-keyed review route `/dev/editorial-review/entry/<uuid>`.
  const longformLinkHref =
    longformDefaultEntry !== null
      ? `/dev/editorial-review/entry/${longformDefaultEntry.uuid}`
      : '/dev/editorial-studio#stage-review';

  return [
    {
      ornament: '¶',
      name: 'Pipeline',
      count: 'i. — 1 surface',
      entries: [
        {
          numeral: 'I',
          titleHtml: 'Dashboard',
          titleText: 'Dashboard',
          route: '/dev/editorial-studio',
          desc: 'Press-check. The calendar across all sites; awaiting press; recent proofs; voice-drift signal.',
        },
      ],
    },
    {
      ornament: '¶',
      name: 'Review desk',
      count: 'ii.–iii. — 2 surfaces',
      entries: [
        {
          numeral: 'II',
          titleHtml: 'Shortform reviews',
          titleText: 'Shortform reviews',
          route: '/dev/editorial-review-shortform',
          desc: 'Cross-platform copy desk. Reddit, LinkedIn, YouTube, Instagram — galley slips, one per platform.',
        },
        {
          numeral: 'III',
          titleHtml: 'Longform reviews',
          titleText: 'Longform reviews',
          route: '/dev/editorial-review/entry/<uuid>',
          linkHref: longformLinkHref,
          template: { prefix: '/dev/editorial-review/entry/', placeholder: '<uuid>' },
          desc: 'Per-entry margin notes, decisions, iterate flow.',
          hint: 'entry-by-entry',
          postHint:
            longformDefaultEntry !== null
              ? `Defaults to the most-recent in-review longform (${longformDefaultEntry.slug}). Or reach via the Dashboard or Content view.`
              : 'Defaults to the dashboard\'s Review section. Open a longform workflow to populate the per-entry deep-link.',
        },
      ],
    },
    {
      ornament: '¶',
      name: 'Browse',
      count: 'iv.–v. — 2 surfaces',
      entries: [
        {
          numeral: 'IV',
          titleHtml: 'Content view',
          titleText: 'Content view',
          route: '/dev/content',
          desc: 'The shape of the work. A drillable tree of nodes; click any to read its head matter and browse its scrapbook.',
        },
        {
          numeral: 'V',
          titleHtml: 'Scrapbook',
          titleText: 'Scrapbook',
          route: '/dev/scrapbook/<site>/<path>',
          // Issue #107: scrapbook is reached by drilling into a content
          // node. Default link points at the content view; the URL
          // template hint stays so adopters see the addressing shape.
          linkHref: '/dev/content',
          template: { prefix: '/dev/scrapbook/', placeholder: '<site>/<path>' },
          desc: 'Research, receipts, working notes. Addressed by hierarchical path; secret items appear in their own section.',
          hint: 'path-addressed',
          postHint: "Reach via the Content view's per-node drawer, or address directly.",
        },
      ],
    },
    {
      ornament: '¶',
      name: 'Reference',
      count: 'vi. — 1 surface',
      entries: [
        {
          numeral: 'VI',
          titleHtml: "The Compositor's <em>Manual</em>",
          titleText: "The Compositor's Manual",
          route: '/dev/editorial-help',
          desc: 'The workflow, the skill catalogue, the names of the things — read once, return when the work asks.',
        },
      ],
    },
  ];
}

function renderEntryTitle(entry: IndexEntry): string {
  // Explicit linkHref wins. Otherwise: non-templated entries link to
  // their route; templated entries with no fallback render as plain
  // text (the route is templated, can't be linked verbatim).
  const href = entry.linkHref ?? (entry.template ? null : entry.route);
  if (href === null) {
    return html`<span class="er-toc-entry__title">${unsafe(entry.titleHtml)}</span>`;
  }
  return html`<a class="er-toc-entry__title" href="${href}">${unsafe(entry.titleHtml)}</a>`;
}

function renderEntryRoute(entry: IndexEntry): string {
  if (entry.template) {
    return html`<span class="er-toc-entry__route is-template">${entry.template.prefix}<em>${entry.template.placeholder}</em></span>`;
  }
  return html`<span class="er-toc-entry__route">${entry.route}</span>`;
}

function renderEntryDesc(entry: IndexEntry): string {
  const hint = entry.hint
    ? html` <span class="er-toc-entry__hint">${entry.hint}</span>`
    : '';
  const post = entry.postHint
    ? html` <em>${entry.postHint}</em>`
    : '';
  return html`<p class="er-toc-entry__desc">${entry.desc}${unsafe(hint)}${unsafe(post)}</p>`;
}

function renderEntry(entry: IndexEntry): RawHtml {
  return unsafe(html`
    <li class="er-toc-entry">
      <div class="er-toc-entry__row">
        <span class="er-toc-entry__num">${entry.numeral}</span>
        ${unsafe(renderEntryTitle(entry))}
        ${unsafe(renderEntryRoute(entry))}
      </div>
      ${unsafe(renderEntryDesc(entry))}
    </li>`);
}

function renderSection(section: IndexSection): RawHtml {
  return unsafe(html`
    <section class="er-toc-section">
      <div class="er-toc-section-head">
        <span class="er-toc-section-head__ornament">${section.ornament}</span>
        <span class="er-toc-section-head__name">${section.name}</span>
        <span class="er-toc-section-head__count">${section.count}</span>
      </div>
      <ol class="er-toc-list">
        ${section.entries.map(renderEntry)}
      </ol>
    </section>`);
}

export async function renderStudioIndex(ctx: StudioContext): Promise<string> {
  const sections = await buildSections(ctx);
  const body = html`
    ${renderEditorialFolio('index', 'index of the press')}
    <main class="er-toc-page">
      <header class="er-pagehead er-pagehead--centered er-pagehead--toc">
        <p class="er-pagehead__kicker">Index of the <em>Press</em></p>
        <h1 class="er-pagehead__title">Editorial <em>Studio</em></h1>
        <p class="er-pagehead__deck">
          A reference of the dev surfaces — pipeline, review desk, browse, manual.
          Begin where the work is.
        </p>
      </header>
      ${sections.map(renderSection)}
      <footer class="er-toc-colophon">
        Pressed in the deskwork studio.<br>
        <span class="er-toc-colophon__rule"></span>
      </footer>
    </main>`;

  return layout({
    title: 'Editorial Studio — Index',
    cssHrefs: [
      '/static/css/editorial-review.css',
      '/static/css/editorial-nav.css',
    ],
    bodyAttrs: 'data-review-ui="studio"',
    bodyHtml: body,
    scriptModules: [],
  });
}
