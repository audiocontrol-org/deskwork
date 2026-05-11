/**
 * Per-row affordance rendering for the dashboard.
 *
 * Implements the v0.20 row-affordance redesign (ACCEPTED archive entry
 * `docs/studio-design/ACCEPTED/2026-05-11-row-affordance-overflow-plus-swipe/`):
 *
 * - **Mobile** — the row at-rest is clean (slug + title + date). A trailing
 *   `⋮` button toggles a menu popover with the FULL stage-aware verb set.
 *   Swipe-left on the row reveals a drawer with the TOP-N stage-aware verbs
 *   as colored chips (fast power-user path).
 * - **Desktop** — high-frequency verbs (iterate / approve / view / induct
 *   as applicable) render as inline outlined chips next to the row. The same
 *   `⋮` button + menu hold the secondary verbs (block / cancel / scrapbook).
 *
 * Stage-aware verb vocabulary per DESKWORK-STATE-MACHINE.md (Commandment II
 * — verbs are stage-gated). The block + induct verbs are surfaced uniformly
 * on every linear-pipeline stage (block pauses an in-pipeline entry; induct
 * teleports to an operator-chosen stage in either direction). Both clipboard-
 * copy their `/deskwork:<verb> <slug>` slash command; the receiving agent
 * runs the atomic CLI helper (`deskwork block / cancel / induct`).
 *
 * The row's outer wrapper is `.er-row-shell` (was `.er-calendar-row-wrap`).
 * Inside: a `.er-row-drawer` for the swipe-action chips (positioned right of
 * the foreground; hidden behind it at-rest), the `.er-row-fg` foreground
 * content (translates left on swipe to reveal the drawer), and a
 * `.er-row-menu` popover (absolute-positioned, hidden by default; surfaced
 * when `⋮` is clicked). The client controller `row-actions.ts` wires the
 * gestures + menu state.
 */

import { html, unsafe, type RawHtml } from '../html.ts';
import { scrapbookViewerUrl } from '../../components/scrapbook-item.ts';
import type { Entry, Stage } from '@deskwork/core/schema/entry';

/** A single verb the operator can invoke from a row. */
interface Verb {
  /** Internal kind — drives CSS accent class + glyph. */
  readonly kind:
    | 'iterate'
    | 'approve'
    | 'block'
    | 'cancel'
    | 'induct'
    | 'view'
    | 'scrapbook';
  /** Display label for drawer chip + menu item. */
  readonly label: string;
  /** Single-character glyph. */
  readonly glyph: string;
  /**
   * Either a `data-copy` payload (slash command — most verbs) or a `data-href`
   * payload (URL — view, scrapbook). Mutually exclusive.
   */
  readonly copy?: string;
  readonly href?: string;
  /** Title attribute / accessibility hint. */
  readonly title: string;
  /** Optional compact label for swipe-drawer chip (cramped 64px width). */
  readonly drawerLabel?: string;
}

/**
 * Build the stage-aware verb set for an entry. Returns three views — the
 * inline-chip set (desktop high-frequency verbs), the drawer set (mobile
 * swipe top-N), and the menu set (full stage-aware vocabulary).
 *
 * Visibility-by-surface is intentional and documented in
 * `docs/studio-design/ACCEPTED/2026-05-11-row-affordance-overflow-plus-swipe/brief.md`.
 */
function verbsForStage(
  stage: Stage,
  entry: Entry,
  defaultSite: string,
): {
  readonly inline: readonly Verb[];
  readonly drawer: readonly Verb[];
  readonly menu: readonly Verb[];
} {
  const slug = entry.slug;
  const reviewLink = `/dev/editorial-review/entry/${entry.uuid}`;
  // Scrapbook URL uses the project's defaultSite (#157, #205). Slug already
  // contains any hierarchical segments.
  const scrapLink = scrapbookViewerUrl({
    site: defaultSite,
    path: slug,
    entryId: entry.uuid,
  });

  const iterate: Verb = {
    kind: 'iterate',
    label: 'Iterate',
    glyph: '↻',
    copy: `/deskwork:iterate ${slug}`,
    title: 'append a new revision to this entry',
  };
  const approve: Verb = {
    kind: 'approve',
    label: stage === 'Final' ? 'Approve → Published' : 'Approve',
    glyph: '✓',
    // Per DESKWORK-STATE-MACHINE.md Commandment II, approve is universal
    // across every linear-pipeline transition including Final → Published.
    // The `/deskwork:approve` skill handles all stage transitions; the
    // separate `/deskwork:publish` skill is an alias for the Final →
    // Published case, not a separate verb. Use approve uniformly.
    copy: `/deskwork:approve ${slug}`,
    title:
      stage === 'Final'
        ? 'advance this entry to Published (assigns a public version)'
        : 'advance this entry to the next stage',
  };
  const block: Verb = {
    kind: 'block',
    label: 'Block (pause)',
    glyph: '‖',
    copy: `/deskwork:block ${slug}`,
    title: 'pause this entry without abandoning it (reversible via /deskwork:induct)',
  };
  const induct: Verb = {
    kind: 'induct',
    label: 'Induct… (pick stage)',
    glyph: '⇄',
    copy: `/deskwork:induct ${slug}`,
    title: 'teleport this entry to a chosen stage (forward or backward)',
  };
  const cancel: Verb = {
    kind: 'cancel',
    label: 'Cancel',
    glyph: '⊘',
    copy: `/deskwork:cancel ${slug}`,
    title: 'pull this entry off-pipeline (Cancelled; rarely resumed)',
  };
  const view: Verb = {
    kind: 'view',
    label: 'View',
    glyph: '→',
    href: reviewLink,
    title: 'read-only review surface for the published entry',
  };
  const scrapbook: Verb = {
    kind: 'scrapbook',
    label: 'Open scrapbook',
    glyph: '⊞',
    href: scrapLink,
    title: "open the entry's scrapbook (research notes, drafts, etc.)",
    drawerLabel: 'Scrpbk',
  };
  // Used only on Blocked/Cancelled rows where induct's primary use is
  // bringing the entry back into the pipeline.
  const inductForward: Verb = {
    ...induct,
    label: 'Induct… (pick stage)',
    title: 'bring this entry back into the pipeline',
  };

  if (stage === 'Ideas' || stage === 'Planned' || stage === 'Outlining' || stage === 'Drafting') {
    return {
      // Scrapbook stays inline on every stage — it's the entry's research
      // surface, used at the same cadence as the active-stage verb.
      inline: [iterate, approve, scrapbook],
      drawer: [iterate, approve, cancel, scrapbook],
      menu: [iterate, approve, block, induct, cancel, scrapbook],
    };
  }
  if (stage === 'Final') {
    return {
      inline: [approve, scrapbook],
      drawer: [approve, cancel, scrapbook],
      menu: [approve, block, induct, cancel, scrapbook],
    };
  }
  if (stage === 'Blocked' || stage === 'Cancelled') {
    return {
      inline: [inductForward, scrapbook],
      drawer: [inductForward, scrapbook],
      menu: [inductForward, scrapbook],
    };
  }
  // Published — frozen artifact; view + scrapbook only.
  return {
    inline: [view, scrapbook],
    drawer: [view, scrapbook],
    menu: [view, scrapbook],
  };
}

function renderDrawerChip(verb: Verb): string {
  const labelText = verb.drawerLabel ?? verb.label.split(' ')[0];
  const dataAttr =
    verb.copy !== undefined
      ? `data-copy="${verb.copy}"`
      : `data-href="${verb.href ?? ''}"`;
  return html`<button type="button"
    class="er-row-action er-row-action-${verb.kind}"
    ${unsafe(dataAttr)}
    title="${verb.title}">
    <span class="er-row-action-glyph" aria-hidden="true">${verb.glyph}</span>
    <span class="er-row-action-label">${labelText}</span>
  </button>`;
}

function renderInlineChip(verb: Verb): string {
  // Inline chips are the high-frequency desktop affordances. View +
  // scrapbook render as plain links (no clipboard); the rest are
  // clipboard-copy buttons routing slash commands. Scrapbook links
  // also carry `data-action="open-scrapbook"` so the existing client
  // can distinguish them from review-surface links (#157, #205).
  if (verb.href !== undefined) {
    const dataAction = verb.kind === 'scrapbook' ? ' data-action="open-scrapbook"' : '';
    return html`<a class="er-btn-chip er-btn-chip-${verb.kind}"
      href="${verb.href}"${unsafe(dataAction)} title="${verb.title}">${verb.label} ${verb.glyph}</a>`;
  }
  return html`<button type="button"
    class="er-btn-chip er-btn-chip-${verb.kind} er-copy-btn"
    data-copy="${verb.copy ?? ''}"
    title="${verb.title}">${verb.label.toLowerCase()} ${verb.glyph}</button>`;
}

function renderMenuItem(verb: Verb): string {
  const action =
    verb.href !== undefined
      ? `data-href="${verb.href}"`
      : `data-copy="${verb.copy ?? ''}"`;
  const cmdHint = verb.copy ?? verb.href ?? '';
  return html`<button type="button"
    class="er-row-menu-item"
    role="menuitem"
    ${unsafe(action)}
    title="${verb.title}">
    <span class="er-row-menu-glyph er-row-menu-glyph-${verb.kind}" aria-hidden="true">${verb.glyph}</span>
    <span class="er-row-menu-label">${verb.label}</span>
    <span class="er-row-menu-cmd">${cmdHint}</span>
  </button>`;
}

/**
 * Group menu items per the mockup's visual rhythm:
 *   primary verbs · divider · secondary (block / induct) · divider · off-pipeline
 *
 * For Blocked/Cancelled/Published the menu is short enough to skip dividers.
 */
function renderMenu(stage: Stage, menu: readonly Verb[]): string {
  const isShort = stage === 'Blocked' || stage === 'Cancelled' || stage === 'Published';
  if (isShort) {
    return menu.map(renderMenuItem).join('');
  }
  // Active + Final use grouped layout.
  const primary: Verb[] = [];
  const secondary: Verb[] = [];
  const tail: Verb[] = [];
  for (const v of menu) {
    if (v.kind === 'iterate' || v.kind === 'approve') primary.push(v);
    else if (v.kind === 'block' || v.kind === 'induct') secondary.push(v);
    else tail.push(v);
  }
  const divider = '<hr class="er-row-menu-divider" role="separator" />';
  return [
    ...primary.map(renderMenuItem),
    primary.length > 0 && secondary.length > 0 ? divider : '',
    ...secondary.map(renderMenuItem),
    secondary.length > 0 && tail.length > 0 ? divider : '',
    ...tail.map(renderMenuItem),
  ]
    .filter(Boolean)
    .join('');
}

/**
 * Render the row's affordance chrome — drawer + inline chips + ⋮ button.
 *
 * Returned HTML expects to be embedded inside the row's foreground container
 * (`.er-row-fg`). The drawer + menu live as siblings of `.er-row-fg` inside
 * `.er-row-shell`; section.ts owns that outer composition.
 *
 * Three pieces:
 *   1. Inline chips — high-frequency verbs as outlined chips (desktop only;
 *      CSS hides them on mobile).
 *   2. Overflow `⋮` button — toggles the menu popover. Visible on both
 *      mobile and desktop.
 *
 * Drawer + menu are rendered separately via `renderRowDrawer` and
 * `renderRowMenu` (also exported) so section.ts can place them in the
 * correct outer layout (drawer is sibling of `.er-row-fg`; menu is sibling
 * of `.er-row-fg`).
 */
export function renderRowActions(entry: Entry, defaultSite: string): RawHtml {
  const { inline } = verbsForStage(entry.currentStage, entry, defaultSite);
  const chips = inline.map(renderInlineChip).join('');
  const overflow = html`<button type="button"
    class="er-row-overflow"
    data-row-overflow
    aria-haspopup="menu"
    aria-expanded="false"
    aria-label="More actions">⋮</button>`;
  return unsafe(`<span class="er-row-affordances">${chips}${overflow}</span>`);
}

/**
 * Drawer rendered as a sibling of `.er-row-fg`. Absolute-positioned at the
 * row's trailing edge; hidden behind the foreground at-rest. Revealed by
 * the foreground translating left on swipe.
 */
export function renderRowDrawer(entry: Entry, defaultSite: string): RawHtml {
  const { drawer } = verbsForStage(entry.currentStage, entry, defaultSite);
  return unsafe(html`<div class="er-row-drawer" aria-hidden="true">${unsafe(drawer.map(renderDrawerChip).join(''))}</div>`);
}

/**
 * Menu popover rendered as a sibling of `.er-row-fg`. Hidden by default
 * (the controller flips `hidden` + `aria-expanded` on the overflow button).
 */
export function renderRowMenu(entry: Entry, defaultSite: string): RawHtml {
  const { menu } = verbsForStage(entry.currentStage, entry, defaultSite);
  return unsafe(html`<div class="er-row-menu" role="menu" hidden>${unsafe(renderMenu(entry.currentStage, menu))}</div>`);
}
