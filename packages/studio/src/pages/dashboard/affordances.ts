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
 * — verbs are universal and stage-gated). The block + induct verbs are
 * surfaced uniformly on every linear-pipeline stage (block pauses an
 * in-pipeline entry; induct teleports to an operator-chosen stage in either
 * direction). Both clipboard-copy their `/deskwork:<verb> <slug>` slash
 * command; the receiving agent runs the atomic CLI helper
 * (`deskwork block / cancel / induct`).
 *
 * Phase 5 Task 5.2 — `verbsForStage` is now template-aware. The dispatch
 * categorizes a stage as:
 *   - off-pipeline (in `template.offPipelineStages`) → inductForward + scrap
 *   - frozen terminal (last entry in `template.linearStages`) → view + scrap
 *   - locked (in `template.lockedStages`) → approve (→ next linear stage)
 *     + scrap, with the menu/drawer surfacing block + induct + cancel
 *   - active linear (any other `linearStages` member) → iterate + approve
 *     + scrap, plus block + induct + cancel in the menu
 * The "Approve → {next}" label dynamically picks the linear stage
 * immediately after a locked stage, so editorial Final → "Approve →
 * Published", visual Approved → "Approve → Shipped", feature-doc Approved
 * → "Approve → Implemented" AND Implemented → "Approve → Complete",
 * qa-plan Reviewed → "Approve → Tested", blog-post Edited → "Approve →
 * Published". Any stage outside both `linearStages` and
 * `offPipelineStages` is a programming error and throws.
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
import type { Entry } from '@deskwork/core/schema/entry';
import type { PipelineTemplate } from '@deskwork/core/pipelines';

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
 * Categorize a stage against its pipeline template. The four
 * categories drive the verb-set dispatch in `verbsForStage`.
 * `offPipeline` covers Blocked / Cancelled / Archived (cul-de-sacs).
 * `terminal` covers the LAST linear stage (published / shipped / etc.
 * — read-only artifact). `locked` covers any lockedStages member
 * (review-frozen, awaiting the next approve). `activeLinear` is the
 * default linear-pipeline stage (iterate + approve both available).
 */
type StageCategory =
  | { readonly kind: 'offPipeline' }
  | { readonly kind: 'terminal' }
  | { readonly kind: 'locked'; readonly nextLinearStage: string }
  | { readonly kind: 'activeLinear' };

/**
 * Classify a stage against the template's linear + off-pipeline +
 * locked vocabularies. Throws when the stage doesn't belong to
 * either linearStages or offPipelineStages — that condition is a
 * programming error upstream (entries should never carry a stage
 * name absent from their lane's template), surfaced loudly per the
 * no-fallback rule.
 */
function classifyStage(
  stage: string,
  template: PipelineTemplate,
): StageCategory {
  if (template.offPipelineStages.includes(stage)) {
    return { kind: 'offPipeline' };
  }
  const linearIdx = template.linearStages.indexOf(stage);
  if (linearIdx === -1) {
    throw new Error(
      `verbsForStage: stage "${stage}" is not in template "${template.id}" `
        + `(linearStages=[${template.linearStages.join(', ')}], `
        + `offPipelineStages=[${template.offPipelineStages.join(', ')}])`,
    );
  }
  if (linearIdx === template.linearStages.length - 1) {
    // Terminal-first dispatch: a stage that is BOTH the last linear
    // stage AND a member of lockedStages is dispatched as terminal
    // (view + scrapbook only). There's no `linearIdx + 1` for the
    // "Approve → next" label to point at — the artifact has nowhere
    // to advance to. Adopter templates that want a "terminal but
    // also locked" semantics should express it via the off-pipeline
    // set instead.
    return { kind: 'terminal' };
  }
  const locked = template.lockedStages ?? [];
  if (locked.includes(stage)) {
    // The lockedStages-subset-of-linearStages invariant + the
    // linear-terminal guard above means linearIdx + 1 is always a
    // valid index. Read it directly; per the no-fallback rule, an
    // index-out-of-range read here would surface as `undefined` and
    // we throw rather than fabricate a label.
    const nextLinearStage = template.linearStages[linearIdx + 1];
    if (nextLinearStage === undefined) {
      throw new Error(
        `verbsForStage: locked stage "${stage}" in template "${template.id}" `
          + 'has no successor in linearStages — schema invariant violation',
      );
    }
    return { kind: 'locked', nextLinearStage };
  }
  return { kind: 'activeLinear' };
}

/**
 * Build the stage-aware verb set for an entry. Returns three views — the
 * inline-chip set (desktop high-frequency verbs), the drawer set (mobile
 * swipe top-N), and the menu set (full stage-aware vocabulary).
 *
 * Per DESKWORK-STATE-MACHINE.md Commandment II — verbs are universal and
 * stage-gated only. Phase 5 Task 5.2: the dispatch now reads the lane's
 * pipeline template (linearStages / lockedStages / offPipelineStages) to
 * decide which verbs are available + how the approve label is worded;
 * no template-specific stage names are hardcoded here.
 *
 * Visibility-by-surface is intentional and documented in
 * `docs/studio-design/ACCEPTED/2026-05-11-row-affordance-overflow-plus-swipe/brief.md`.
 */
function verbsForStage(
  stage: string,
  template: PipelineTemplate,
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

  const category = classifyStage(stage, template);

  const iterate: Verb = {
    kind: 'iterate',
    label: 'Iterate',
    glyph: '↻',
    copy: `/deskwork:iterate ${slug}`,
    title: 'append a new revision to this entry',
  };
  const approveLabel = category.kind === 'locked'
    ? `Approve → ${category.nextLinearStage}`
    : 'Approve';
  const approveTitle = category.kind === 'locked'
    ? `advance this entry to ${category.nextLinearStage}`
    : 'advance this entry to the next stage';
  const approve: Verb = {
    kind: 'approve',
    label: approveLabel,
    glyph: '✓',
    // Per DESKWORK-STATE-MACHINE.md Commandment II, approve is universal
    // across every linear-pipeline transition including the locked →
    // terminal hop. The `/deskwork:approve` skill handles all stage
    // transitions; use approve uniformly.
    copy: `/deskwork:approve ${slug}`,
    title: approveTitle,
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
  // Used only on off-pipeline rows where induct's primary use is
  // bringing the entry back into the pipeline.
  const inductForward: Verb = {
    ...induct,
    label: 'Induct… (pick stage)',
    title: 'bring this entry back into the pipeline',
  };

  if (category.kind === 'activeLinear') {
    return {
      // Scrapbook stays inline on every stage — it's the entry's research
      // surface, used at the same cadence as the active-stage verb.
      inline: [iterate, approve, scrapbook],
      drawer: [iterate, approve, cancel, scrapbook],
      menu: [iterate, approve, block, induct, cancel, scrapbook],
    };
  }
  if (category.kind === 'locked') {
    // Locked stages: iterate is refused; approve advances to the
    // declared next linear stage. Block / induct / cancel still
    // surface in the menu so the operator can pause / reroute /
    // abandon a locked artifact.
    return {
      inline: [approve, scrapbook],
      drawer: [approve, cancel, scrapbook],
      menu: [approve, block, induct, cancel, scrapbook],
    };
  }
  if (category.kind === 'offPipeline') {
    return {
      inline: [inductForward, scrapbook],
      drawer: [inductForward, scrapbook],
      menu: [inductForward, scrapbook],
    };
  }
  // terminal — frozen artifact; view + scrapbook only.
  return {
    inline: [view, scrapbook],
    drawer: [view, scrapbook],
    menu: [view, scrapbook],
  };
}

function renderDrawerChip(verb: Verb): string {
  const labelText = verb.drawerLabel ?? verb.label.split(' ')[0];
  // Route the data attribute through the html tag so its value is
  // properly attribute-escaped. Slug regex constrains the payload today
  // (no unbalanced quotes possible) but future-verb churn could land a
  // payload with HTML-sensitive characters; the tag handles them.
  if (verb.copy !== undefined) {
    return html`<button type="button"
      class="er-row-action er-row-action-${verb.kind}"
      data-copy="${verb.copy}"
      title="${verb.title}">
      <span class="er-row-action-glyph" aria-hidden="true">${verb.glyph}</span>
      <span class="er-row-action-label">${labelText}</span>
    </button>`;
  }
  return html`<button type="button"
    class="er-row-action er-row-action-${verb.kind}"
    data-href="${verb.href ?? ''}"
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
  // Short command hint matching the mockup's compact form:
  //   copy verbs → `/deskwork:approve` (verb only, no slug)
  //   href verbs → `/dev/scrapbook` / `/dev/editorial-review` (path stem,
  //                no site / uuid / query string)
  // The clipboard-copy still routes the FULL slash command via data-copy;
  // hrefs still navigate to the full URL via data-href. The hint is just a
  // visual reminder of which command/route is being invoked — appending the
  // slug / full path doubles the cmd cell width and forces the label to
  // wrap on narrow viewports.
  const cmdHint = verb.copy !== undefined
    ? verb.copy.split(' ', 1)[0]
    : (verb.href ?? '').split('/').slice(0, 3).join('/');
  // Route data attributes through the html tag for proper escaping.
  if (verb.href !== undefined) {
    return html`<button type="button"
      class="er-row-menu-item"
      role="menuitem"
      data-href="${verb.href}"
      title="${verb.title}">
      <span class="er-row-menu-glyph er-row-menu-glyph-${verb.kind}" aria-hidden="true">${verb.glyph}</span>
      <span class="er-row-menu-label">${verb.label}</span>
      <span class="er-row-menu-cmd">${cmdHint}</span>
    </button>`;
  }
  return html`<button type="button"
    class="er-row-menu-item"
    role="menuitem"
    data-copy="${verb.copy ?? ''}"
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
 * Short menus (off-pipeline OR terminal-frozen) skip dividers — the menu
 * holds at most two items there.
 */
function renderMenu(
  stage: string,
  template: PipelineTemplate,
  menu: readonly Verb[],
): string {
  const category = classifyStage(stage, template);
  const isShort = category.kind === 'offPipeline' || category.kind === 'terminal';
  if (isShort) {
    return menu.map(renderMenuItem).join('');
  }
  // Active linear + locked use grouped layout.
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
export function renderRowActions(
  entry: Entry,
  template: PipelineTemplate,
  defaultSite: string,
): RawHtml {
  // Per Phase 5 Task 5.2: the template-aware verb dispatch covers
  // every pipeline template's stage vocabulary. Every entry's row
  // now receives the verb-chip chrome — Commandment II ensures verbs
  // are universal across templates, gated only on stage position.
  const { inline } = verbsForStage(entry.currentStage, template, entry, defaultSite);
  const chips = inline.map(renderInlineChip).join('');
  const overflow = html`<button type="button"
    class="er-row-overflow"
    data-row-overflow
    aria-haspopup="menu"
    aria-expanded="false"
    aria-label="More actions">⋮</button>`;
  // Keep `.er-calendar-action` as the wrapper class so the existing
  // mobile grid-template-areas (`action` area at row 3 of the row
  // grid) and desktop layout rules continue to position the chrome.
  // The `.er-row-affordances` class is added alongside as a v0.20
  // marker for any future rules that need to target the new chrome
  // specifically.
  return unsafe(`<span class="er-calendar-action er-row-affordances">${chips}${overflow}</span>`);
}

/**
 * Drawer rendered as a sibling of `.er-row-fg`. Absolute-positioned at the
 * row's trailing edge; hidden behind the foreground at-rest. Revealed by
 * the foreground translating left on swipe.
 */
export function renderRowDrawer(
  entry: Entry,
  template: PipelineTemplate,
  defaultSite: string,
): RawHtml {
  const { drawer } = verbsForStage(entry.currentStage, template, entry, defaultSite);
  return unsafe(html`<div class="er-row-drawer" aria-hidden="true">${unsafe(drawer.map(renderDrawerChip).join(''))}</div>`);
}

/**
 * Menu popover rendered as a sibling of `.er-row-fg`. Hidden by default
 * (the controller flips `hidden` + `aria-expanded` on the overflow button).
 */
export function renderRowMenu(
  entry: Entry,
  template: PipelineTemplate,
  defaultSite: string,
): RawHtml {
  const { menu } = verbsForStage(entry.currentStage, template, entry, defaultSite);
  return unsafe(html`<div class="er-row-menu" role="menu" hidden>${unsafe(renderMenu(entry.currentStage, template, menu))}</div>`);
}

// Exported for tests + downstream renderers that need to compose verb
// vocabularies directly (Phase 5 Task 5.2 test suite covers each
// template's locked / terminal / off-pipeline / active-linear shape).
export { verbsForStage, classifyStage };
