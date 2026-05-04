/**
 * The Compositor's Manual — `/dev/editorial-help`.
 *
 * Static (read-only) operator manual. Renders six sections:
 *   I    — the working model (eight-stage pipeline + universal verbs)
 *   II   — three tracks (longform / shortform / distribution)
 *   III  — the skill catalogue (specimen grid)
 *   IV   — the studio surfaces, described
 *   V    — a run-through, idea to cross-post
 *   VI   — a reference card (keyboard / URLs / transitions / files)
 *
 * The skill catalogue is the only data-driven section; everything else
 * is verbatim prose. The skills come from
 * `editorial-skills-catalogue.ts` so a single edit shows up here, in
 * any future docs generator, and in any CLI inventory.
 *
 * Pipeline-redesign vocabulary (Phase 6, Task 37): the longform model
 * is the entry-centric eight-stage pipeline (Ideas → Planned →
 * Outlining → Drafting → Final → Published; Blocked / Cancelled
 * off-pipeline) operated by universal verbs (`/deskwork:add`,
 * `/deskwork:iterate`, `/deskwork:approve`, `/deskwork:publish`,
 * `/deskwork:block`, `/deskwork:cancel`, `/deskwork:induct`). The
 * stage-named skills of the prior model (`plan`, `outline`, `draft`,
 * `pause`, `resume`, `review-start`, `review-cancel`) are retired.
 * Shortform + distribution still use the workflow-object model.
 */

import {
  KIND_LABEL,
  SKILLS_SORTED,
  type Skill,
} from '../lib/editorial-skills-catalogue.ts';
import type { StudioContext } from '../routes/api.ts';
import { html, unsafe, type RawHtml } from './html.ts';
import { layout } from './layout.ts';
import { renderEditorialFolio } from './chrome.ts';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function formatIssueDate(now: Date): string {
  return `${now.getDate()} ${MONTH_NAMES[now.getMonth()]} ${now.getFullYear()}`;
}

function renderCover(ctx: StudioContext, now: Date): RawHtml {
  const sitesInline = Object.values(ctx.config.sites)
    .map((s) => s.host)
    .join(' · ');
  return unsafe(html`
    <header class="er-pagehead er-pagehead--centered eh-cover">
      <p class="er-pagehead__kicker eh-cover-kicker">
        Vol. 02 <span class="dot">·</span> Manual <span class="dot">·</span> Internal — for operators
      </p>
      <h1 class="er-pagehead__title eh-cover-title">
        The Compositor's <em>Manual</em>
      </h1>
      <p class="er-pagehead__deck eh-cover-dek">
        Everything you need to move a thought from notebook to published dispatch without asking a colleague. The eight-stage pipeline, the universal verbs, the entry sidecar that holds the truth, and the desk where you watch the whole thing happen.
      </p>
      <p class="er-pagehead__imprint eh-imprint">
        <strong>Sites</strong><span>${sitesInline || ctx.projectRoot}</span>
        <span class="sep">§</span>
        <strong>Issued</strong><span>${formatIssueDate(now)}</span>
        <span class="sep">§</span>
        <strong>Revision</strong><span>2.0</span>
        <span class="sep">§</span>
        <strong>Desk</strong><a href="/dev/editorial-studio">/dev/editorial-studio</a>
      </p>
    </header>`);
}

const TOC_ENTRIES = [
  { id: 'sec-model',      num: '§ I',   title: 'The working model — pipeline and verbs', page: 'p. 01' },
  { id: 'sec-tracks',     num: '§ II',  title: 'Three tracks — longform, shortform, distribution', page: 'p. 02' },
  { id: 'sec-catalogue',  num: '§ III', title: 'The skills, alphabetised',           page: 'p. 03' },
  { id: 'sec-studio',     num: '§ IV',  title: 'The Editorial Studio, described',    page: 'p. 08' },
  { id: 'sec-runthrough', num: '§ V',   title: 'A run-through, idea to cross-post',  page: 'p. 10' },
  { id: 'sec-reference',  num: '§ VI',  title: 'Reference card',                      page: 'p. 13' },
];

function renderToc(): RawHtml {
  return unsafe(html`
    <nav class="eh-toc" aria-label="Manual contents">
      <p class="eh-toc-label">Contents</p>
      ${TOC_ENTRIES.map(
        (e) => unsafe(html`<a href="#${e.id}"><span class="eh-toc-num">${e.num}</span><span>${e.title}</span><span class="eh-toc-page">${e.page}</span></a>`),
      )}
    </nav>`);
}

function renderModelSection(): RawHtml {
  return unsafe(html`
    <section class="eh-section" id="sec-model">
      <header class="eh-section-head">
        <span class="eh-section-num">§ I</span>
        <h2 class="eh-section-title">The working model</h2>
        <span class="eh-section-sig">Pipeline · Verbs · Sidecar</span>
      </header>
      <p class="eh-lead">
        One state machine, six stages on the line, two off the line. Each entry has a sidecar JSON file at <code>.deskwork/entries/&lt;uuid&gt;.json</code> that holds its current stage, its per-stage iteration counter, and its history. The calendar markdown (<code>calendar.md</code>) is regenerated from sidecars — the sidecar is the source of truth, the markdown is the rendered view.
      </p>
      <div class="eh-state-diagram" aria-label="Eight-stage pipeline">
        <span class="eh-state-label">Fig. 1 — On-pipeline stages (forward-only)</span>
        <div class="eh-stage-chain">
          <div class="eh-stage-box"><span class="num">01</span><div class="ornament">◇</div><div class="name">Ideas</div><div class="hint">idea.md</div></div>
          <div class="eh-stage-arrow">→</div>
          <div class="eh-stage-box"><span class="num">02</span><div class="ornament">§</div><div class="name">Planned</div><div class="hint">plan.md</div></div>
          <div class="eh-stage-arrow">→</div>
          <div class="eh-stage-box"><span class="num">03</span><div class="ornament">✎</div><div class="name">Outlining</div><div class="hint">outline.md</div></div>
          <div class="eh-stage-arrow">→</div>
          <div class="eh-stage-box"><span class="num">04</span><div class="ornament">¶</div><div class="name">Drafting</div><div class="hint">index.md</div></div>
          <div class="eh-stage-arrow">→</div>
          <div class="eh-stage-box"><span class="num">05</span><div class="ornament">※</div><div class="name">Final</div><div class="hint">index.md</div></div>
          <div class="eh-stage-arrow">→</div>
          <div class="eh-stage-box"><span class="num">06</span><div class="ornament">✓</div><div class="name">Published</div><div class="hint">live</div></div>
        </div>
        <p class="eh-state-caption">Forward-only on the pipeline. Each stage has one primary artifact; <code>/deskwork:approve</code> graduates the entry by exactly one stage and seeds the next-stage file from the just-approved one.</p>
      </div>
      <div class="eh-state-diagram" aria-label="Off-pipeline stages">
        <span class="eh-state-label">Fig. 2 — Off-pipeline (parking lots)</span>
        <div class="eh-stage-chain">
          <div class="eh-stage-box"><span class="num">⊘</span><div class="ornament">∥</div><div class="name">Blocked</div><div class="hint">resumable</div></div>
          <div class="eh-stage-arrow">⇄</div>
          <div class="eh-stage-box"><span class="num">×</span><div class="ornament">⊗</div><div class="name">Cancelled</div><div class="hint">abandoned</div></div>
        </div>
        <p class="eh-state-caption"><em>Blocked</em> is a process flag: out of pipeline, work paused, resumable. <em>Cancelled</em> is a semantic flag: intent abandoned, rare resume. Both record <code>priorStage</code> so <code>/deskwork:induct</code> can return the entry where it left off, with iteration counters preserved.</p>
      </div>
      <div class="eh-state-diagram" aria-label="Universal verbs">
        <span class="eh-state-label">Fig. 3 — The universal verbs</span>
        <div class="eh-review-loop">
          <div class="loop-node">/deskwork:add</div>
          <div class="loop-arrow">→</div>
          <div class="loop-node">/deskwork:iterate</div>
          <div class="loop-arrow">⇄</div>
          <div class="loop-node">operator review</div>
          <div class="loop-arrow" style="grid-column: 3;">↓</div>
          <div class="loop-node terminal-ok" style="grid-column: 4;">/deskwork:approve</div>
          <div class="loop-arrow" style="grid-column: 5;">→</div>
          <div class="loop-node terminal-ok" style="grid-row: 3; grid-column: 1;">/deskwork:publish</div>
          <div class="loop-arrow" style="grid-row: 3; grid-column: 2;">←</div>
          <div class="loop-node terminal-x" style="grid-row: 3; grid-column: 3 / span 3;">/deskwork:block · /deskwork:cancel · /deskwork:induct</div>
        </div>
        <p class="eh-state-caption">Same verbs at every stage. <code>iterate</code> revises the current-stage artifact. <code>approve</code> advances by exactly one stage — there is no “approve but stay.” <code>block</code> and <code>cancel</code> step off the line; <code>induct</code> returns an entry to the pipeline (defaults: <em>Blocked/Cancelled</em> → <code>priorStage</code>; <em>Final</em> → <em>Drafting</em>; any other on-pipeline stage requires explicit <code>--to</code>).</p>
      </div>
    </section>`);
}

function renderTracksSection(): RawHtml {
  return unsafe(html`
    <section class="eh-section" id="sec-tracks">
      <header class="eh-section-head">
        <span class="eh-section-num">§ II</span>
        <h2 class="eh-section-title">Three tracks</h2>
        <span class="eh-section-sig">Longform · Shortform · Distribution</span>
      </header>
      <p>Each track is a canonical run order for its kind of content. The studio surfaces the next move per entry; these lists are for when you are driving Claude Code directly.</p>
      <div class="eh-tracks">
        <div class="eh-track">
          <p class="eh-track-title">Longform</p>
          <p class="eh-track-sub">Blog posts · dispatches · docs</p>
          <ol class="eh-track-steps">
            <li>Capture the idea — mints sidecar + idea.md.<code>/deskwork:add "Title"</code></li>
            <li>Iterate the idea until it has shape.<code>/deskwork:iterate &lt;uuid&gt;</code></li>
            <li>Approve to graduate Ideas → Planned. Seeds plan.md.<code>/deskwork:approve &lt;uuid&gt;</code></li>
            <li>Iterate the plan; approve when set. Seeds outline.md.<code>/deskwork:iterate · /deskwork:approve</code></li>
            <li>Iterate the outline; approve when set. Seeds index.md (Drafting).<code>/deskwork:iterate · /deskwork:approve</code></li>
            <li>Iterate the draft; approve when set. Stage becomes Final.<code>/deskwork:iterate · /deskwork:approve</code></li>
            <li>Approve again to publish. Stamps datePublished.<code>/deskwork:publish &lt;uuid&gt;</code><span class="note">Then commit + push by hand.</span></li>
          </ol>
        </div>
        <div class="eh-track">
          <p class="eh-track-title">Shortform</p>
          <p class="eh-track-sub">Social copy · cross-posts</p>
          <ol class="eh-track-steps">
            <li>Draft per platform.<code>/deskwork:shortform-start &lt;slug&gt; &lt;platform&gt;</code><span class="note">Reddit, YouTube, LinkedIn, newsletter.</span></li>
            <li>Review the same way as longform (same page, shortform mode).<span class="note">/dev/editorial-review-shortform</span></li>
            <li>Iterate or approve as with longform.<code>/deskwork:iterate · /deskwork:approve</code></li>
            <li>Post the copy yourself to the platform.</li>
            <li>Record the distribution.<code>/deskwork:distribute &lt;slug&gt; &lt;platform&gt; &lt;url&gt;</code></li>
          </ol>
        </div>
        <div class="eh-track">
          <p class="eh-track-title">Distribution</p>
          <p class="eh-track-sub">Audit · analytics · reconcile</p>
          <ol class="eh-track-steps">
            <li>Reconcile Reddit state.<code>/editorial-reddit-sync</code></li>
            <li>Find cross-post holes.<code>/editorial-social-review</code></li>
            <li>Plan the next wave.<code>/editorial-reddit-opportunities &lt;slug&gt;</code></li>
            <li>Audit bidirectional links (blog ↔ YouTube).<code>/editorial-cross-link-review</code></li>
            <li>Check performance; flag underperformers.<code>/editorial-performance</code></li>
            <li>Feed observations back into ideas.<code>/editorial-suggest</code></li>
          </ol>
        </div>
      </div>
    </section>`);
}

function renderSpecimen(s: Skill): RawHtml {
  const flagsRow = s.flags
    ? unsafe(html`<span class="row"><strong>flags</strong>${s.flags}</span>`)
    : '';
  return unsafe(html`
    <article class="eh-specimen">
      <code class="eh-specimen-slug">${s.slug}</code>
      <span class="eh-specimen-stamp" data-kind="${s.kind}">${KIND_LABEL[s.kind]}</span>
      <p class="eh-specimen-desc">${s.desc}</p>
      <div class="eh-specimen-meta">
        <span class="row"><strong>when</strong><em>${s.when}</em></span>
        <span class="row"><strong>changes</strong>${s.changes}</span>
        ${flagsRow}
      </div>
    </article>`);
}

function renderCatalogueSection(): RawHtml {
  return unsafe(html`
    <section class="eh-section" id="sec-catalogue">
      <header class="eh-section-head">
        <span class="eh-section-num">§ III</span>
        <h2 class="eh-section-title">The skills, alphabetised</h2>
        <span class="eh-section-sig">${SKILLS_SORTED.length} specimens</span>
      </header>
      <p>Every skill that ships with this repository, tagged by kind. Invoke as a slash command inside Claude Code. Voice skills are not meant to be invoked directly — they are called by the cognitive skills that need a register.</p>
      <p class="eh-legend">
        <span><span class="swatch s-cog"></span>cognitive — Claude does writing work</span>
        <span><span class="swatch s-mech"></span>mechanical — disk writes, state transitions</span>
        <span><span class="swatch s-ro"></span>read-only — reports and audits</span>
        <span><span class="swatch s-voice"></span>voice — register helpers</span>
      </p>
      <div class="eh-specimens">
        ${SKILLS_SORTED.map(renderSpecimen)}
      </div>
    </section>`);
}

function renderStudioSection(): RawHtml {
  return unsafe(html`
    <section class="eh-section" id="sec-studio">
      <header class="eh-section-head">
        <span class="eh-section-num">§ IV</span>
        <h2 class="eh-section-title">The Editorial Studio, described</h2>
        <span class="eh-section-sig">/dev/editorial-studio</span>
      </header>
      <p>The studio is where the operator watches state and presses mechanical buttons. Cognitive work — drafting, revising, approving prose — still happens in Claude Code. The studio never writes prose; the skills never touch the UI.</p>
      <div class="eh-studio-map">
        <div class="eh-panel">
          <p class="eh-panel-head">Primary surfaces</p>
          <h4>Calendar panels</h4>
          <p>Six on-pipeline columns: <em>Ideas · Planned · Outlining · Drafting · Final · Published</em>, plus parking-lot panels for <em>Blocked</em> and <em>Cancelled</em>. Each row shows slug, title, the per-stage iteration counter (<code>iterationByStage</code>), a file-present dot for the current stage's primary artifact, and any review state.</p>
          <h4>Next-move column</h4>
          <p>Per row, the studio surfaces a button that copies the corresponding skill command to your clipboard — paste into a Claude Code chat to run. <code>approve →</code> copies <code>/deskwork:approve &lt;slug&gt;</code>. <code>publish →</code> copies <code>/deskwork:publish &lt;slug&gt;</code>. <code>block</code> / <code>cancel</code> / <code>induct</code> appear contextually and copy their own commands. The state-machine work happens in the skill, not in the studio (see <code>THESIS.md</code> Consequence 2).</p>
          <h4>Shortform coverage matrix</h4>
          <p>For each <em>Published</em> entry, a row of platform cells (reddit, linkedin, youtube, instagram). Shaded cells are covered by a DistributionRecord; empty cells surface the exact <code>/deskwork:shortform-start</code> command to copy.</p>
          <h4>Voice-drift signal</h4>
          <p>A small panel on the right. Names the two voice-skill categories that are producing the most operator corrections. Shows once you have at least five terminal workflows on record.</p>
        </div>
        <div class="eh-panel">
          <p class="eh-panel-head">Secondary surfaces</p>
          <h4>Entry review</h4>
          <p><code>/dev/editorial-review/entry/&lt;uuid&gt;</code>. The current-stage artifact (idea.md, plan.md, outline.md, or index.md) renders inside the review surface. Select text for a margin note; double-click anywhere to edit the markdown in place. The fixed strip's Approve / Iterate / (Reject — disabled, see <a href="https://github.com/audiocontrol-org/deskwork/issues/173">#173</a>) buttons COPY the corresponding skill command (<code>/deskwork:approve &lt;slug&gt;</code>, etc.) to your clipboard — paste into a Claude Code chat to run. The skill reads marginalia, applies editorial judgment, edits the file (when iterating), advances state. The review is keyed by entry uuid, not workflow id.</p>
          <h4>Shortform review</h4>
          <p><code>/dev/editorial-review-shortform</code>. Cards grouped by platform. Each card has a version header, an editable textarea, and save · approve · iterate · reject controls.</p>
          <h4>Keyboard</h4>
          <p>In the studio: <kbd>1</kbd>–<kbd>6</kbd> jump to on-pipeline columns. In an entry review: <kbd>e</kbd> / double-click toggles edit mode; <kbd>a</kbd> <kbd>a</kbd> copies the approve command to clipboard; <kbd>i</kbd> <kbd>i</kbd> copies the iterate command; <kbd>j</kbd>/<kbd>k</kbd> step through margin notes; <kbd>?</kbd> shows a full shortcuts overlay.</p>
          <h4>Polling</h4>
          <p>Both routes poll every 8–10 seconds when idle. After you paste the iterate command into Claude Code and the skill writes a new version, the new artifact shows up in the browser without a manual reload.</p>
        </div>
      </div>
    </section>`);
}

const RUNTHROUGH_STEPS: ReadonlyArray<{ title: string; op: string; body: RawHtml }> = [
  {
    title: 'Capture an idea',
    op: 'terminal',
    body: unsafe('<p>You have a title in mind. Run <code>/deskwork:add "Your Title"</code>. The sidecar lands at <code>.deskwork/entries/&lt;uuid&gt;.json</code> with stage <em>Ideas</em>; <code>idea.md</code> is initialised; <code>calendar.md</code> regenerates from sidecars.</p>'),
  },
  {
    title: 'Iterate the idea',
    op: 'browser then terminal',
    body: unsafe('<p>Open <code>/dev/editorial-review/entry/&lt;uuid&gt;</code>. Leave margin notes on <code>idea.md</code>. Click <em>Iterate</em>; the studio copies <code>/deskwork:iterate &lt;slug&gt;</code> to your clipboard — paste into a Claude Code chat to run. The skill reads your marginalia, revises <code>idea.md</code> in the site voice, writes the next version, bumps <code>iterationByStage.Ideas</code>.</p>'),
  },
  {
    title: 'Approve into Planned',
    op: 'browser or terminal',
    body: unsafe('<p>Click <em>Approve</em> on the review surface — the studio copies <code>/deskwork:approve &lt;slug&gt;</code> to your clipboard. Paste into a Claude Code chat. The skill graduates the stage to <em>Planned</em>, seeds <code>plan.md</code> from <code>idea.md</code>, and starts <code>iterationByStage.Planned</code> at 0.</p>'),
  },
  {
    title: 'Plan, then outline, then draft',
    op: 'browser then terminal',
    body: unsafe('<p>Same loop at each stage. Click <em>Iterate</em> in the studio to copy the iterate command; the agent runs the skill, which revises the current-stage artifact (<code>plan.md</code>, then <code>outline.md</code>, then <code>index.md</code>). Click <em>Approve</em> to copy the approve command; the skill graduates by exactly one stage. There is no “approve but stay.”</p>'),
  },
  {
    title: 'Approve into Final',
    op: 'browser or terminal',
    body: unsafe('<p>When the Drafting <code>index.md</code> is good, click <em>Approve</em> once more (copies the command; paste into Claude Code). Stage becomes <em>Final</em>. The same <code>index.md</code> is the artifact at Final — Final is the “ready to publish” stage, not a separate file.</p>'),
  },
  {
    title: 'Publish',
    op: 'browser or terminal',
    body: unsafe('<p>Click <code>publish →</code> on the Final row, or run <code>/deskwork:publish &lt;uuid&gt;</code>. Stage becomes <em>Published</em>; today\'s date is stamped as <code>datePublished</code>; <code>calendar.md</code> regenerates.</p>'),
  },
  {
    title: 'Commit by hand',
    op: 'terminal',
    body: unsafe('<p>The UI does not commit. Review the diff, commit and push when ready. This is deliberate — the operator holds the pen.</p>'),
  },
  {
    title: 'Park or abandon, when needed',
    op: 'terminal',
    body: unsafe('<p>Stuck on a source or a decision? <code>/deskwork:block &lt;uuid&gt; --reason "waiting on source"</code> moves the entry to <em>Blocked</em> with <code>priorStage</code> recorded. Done with it for good? <code>/deskwork:cancel &lt;uuid&gt;</code>. Both preserve the sidecar and history; nothing is deleted.</p>'),
  },
  {
    title: 'Induct back into the pipeline',
    op: 'terminal',
    body: unsafe('<p><code>/deskwork:induct &lt;uuid&gt;</code> brings the entry back. From <em>Blocked</em> or <em>Cancelled</em>, the default destination is <code>priorStage</code>. From <em>Final</em>, the default is <em>Drafting</em>. From any other on-pipeline stage, you must pass <code>--to &lt;stage&gt;</code> explicitly. <code>iterationByStage</code> is preserved — pick up where you left off.</p>'),
  },
  {
    title: 'Cross-post',
    op: 'terminal × platform',
    body: unsafe('<p>For each platform worth posting to: <code>/deskwork:shortform-start &lt;slug&gt; &lt;platform&gt;</code>. Review it exactly like a longform workflow. Approve, then post it yourself. Record the URL with <code>/deskwork:distribute &lt;slug&gt; &lt;platform&gt; &lt;url&gt;</code>.</p>'),
  },
  {
    title: 'Reconcile and reflect',
    op: 'cadence',
    body: unsafe('<p><code>/deskwork:doctor</code> reports drift between sidecar truth and rendered <code>calendar.md</code>; <code>/deskwork:status</code> gives a compact roll-call. Feed comment-annotation observations back into the voice skills. The cycle compounds.</p>'),
  },
];

function renderRunthroughSection(): RawHtml {
  return unsafe(html`
    <section class="eh-section" id="sec-runthrough">
      <header class="eh-section-head">
        <span class="eh-section-num">§ V</span>
        <h2 class="eh-section-title">A run-through</h2>
        <span class="eh-section-sig">Idea to cross-post, in order</span>
      </header>
      <p class="eh-lead">Numbered events, left-to-right. Each step names the surface where the action happens — the terminal for Claude Code skills, the browser for studio buttons, or the editor for hand-editing the file.</p>
      <div class="eh-walkthrough">
        ${RUNTHROUGH_STEPS.map(
          (s) => unsafe(html`<div class="eh-walkthrough-step">
            <div>
              <h4>${s.title} <span class="op">${s.op}</span></h4>
              ${s.body}
            </div>
          </div>`),
        )}
      </div>
    </section>`);
}

function renderReferenceSection(): RawHtml {
  return unsafe(html`
    <section class="eh-section" id="sec-reference">
      <header class="eh-section-head">
        <span class="eh-section-num">§ VI</span>
        <h2 class="eh-section-title">Reference card</h2>
        <span class="eh-section-sig">Pin this to the desk</span>
      </header>
      <div class="eh-reference">
        <div class="eh-ref-block">
          <h4>Keyboard — entry review</h4>
          <dl>
            <dt><kbd>e</kbd> / dbl-click</dt><dd>toggle edit mode</dd>
            <dt>select text</dt><dd>leave a margin note</dd>
            <dt><kbd>a</kbd> <kbd>a</kbd></dt><dd>copy <code>/deskwork:approve &lt;slug&gt;</code> to clipboard</dd>
            <dt><kbd>i</kbd> <kbd>i</kbd></dt><dd>copy <code>/deskwork:iterate &lt;slug&gt;</code> to clipboard</dd>
            <dt><kbd>b</kbd></dt><dd>block — out of pipeline, resumable</dd>
            <dt><kbd>j</kbd> / <kbd>k</kbd></dt><dd>step through margin notes</dd>
            <dt><kbd>?</kbd></dt><dd>shortcuts overlay</dd>
            <dt><kbd>esc</kbd></dt><dd>close overlay or cancel comment</dd>
          </dl>
        </div>
        <div class="eh-ref-block">
          <h4>Keyboard — studio</h4>
          <dl>
            <dt><kbd>1</kbd></dt><dd>jump to Ideas column</dd>
            <dt><kbd>2</kbd></dt><dd>jump to Planned</dd>
            <dt><kbd>3</kbd></dt><dd>jump to Outlining</dd>
            <dt><kbd>4</kbd></dt><dd>jump to Drafting</dd>
            <dt><kbd>5</kbd></dt><dd>jump to Final</dd>
            <dt><kbd>6</kbd></dt><dd>jump to Published</dd>
          </dl>
        </div>
        <div class="eh-ref-block eh-ref-block--stacked">
          <h4>URL patterns</h4>
          <dl>
            <dt>/dev/editorial-studio</dt><dd>calendar desk</dd>
            <dt>/dev/editorial-review/entry/&lt;uuid&gt;</dt><dd>entry review (current-stage artifact)</dd>
            <dt>/dev/editorial-review-shortform</dt><dd>shortform cards</dd>
            <dt>/dev/editorial-help</dt><dd>this manual</dd>
          </dl>
        </div>
        <div class="eh-ref-block">
          <h4>Stage transitions</h4>
          <table class="eh-transitions">
            <thead><tr><th>verb</th><th>effect</th></tr></thead>
            <tbody>
              <tr><td>add</td><td class="arrow">→ Ideas (mints sidecar + idea.md)</td></tr>
              <tr><td>iterate</td><td class="arrow">→ same stage, next iteration</td></tr>
              <tr><td>approve</td><td class="arrow">→ next stage by exactly one</td></tr>
              <tr><td>publish</td><td class="arrow">Final → Published (stamps datePublished)</td></tr>
              <tr><td>block</td><td class="arrow">→ Blocked (records priorStage)</td></tr>
              <tr><td>cancel</td><td class="arrow">→ Cancelled (records priorStage)</td></tr>
              <tr><td>induct</td><td class="arrow">Blocked/Cancelled → priorStage; Final → Drafting; otherwise --to &lt;stage&gt;</td></tr>
            </tbody>
          </table>
        </div>
        <div class="eh-ref-block eh-ref-block--stacked">
          <h4>File locations</h4>
          <dl>
            <dt>.deskwork/entries/&lt;uuid&gt;.json</dt><dd>entry sidecar — source of truth (stage, history, iterationByStage)</dd>
            <dt>(per-site calendar — see config)</dt><dd>calendar.md — regenerated from sidecars; never edit by hand</dd>
            <dt>(per-entry workspace — see config)</dt><dd>idea.md · plan.md · outline.md · index.md (one per stage)</dd>
            <dt>.deskwork/review-journal/pipeline/</dt><dd>shortform workflow state, one JSON per id</dd>
            <dt>.deskwork/review-journal/history/</dt><dd>shortform events (versions, states, comments)</dd>
            <dt>.deskwork/{templates,prompts,doctor}/</dt><dd>per-project overrides — see <code>/deskwork:customize</code></dd>
          </dl>
        </div>
        <div class="eh-ref-block">
          <h4>First-run tripwires</h4>
          <dl>
            <dt>404 on /dev/*</dt><dd>the dev routes only run when <code>deskwork-studio</code> is up. Start it with the documented launch command.</dd>
            <dt>nothing to review</dt><dd>capture an entry first: <code>/deskwork:add "Title"</code>, then visit <code>/dev/editorial-review/entry/&lt;uuid&gt;</code>.</dd>
            <dt>iterate doesn't trigger</dt><dd>the studio's <em>Iterate</em> button copies <code>/deskwork:iterate &lt;slug&gt;</code> to your clipboard — paste into a Claude Code chat to run. The skill does the writing; the studio doesn't mutate state on its own.</dd>
            <dt>calendar.md drift</dt><dd>run <code>/deskwork:doctor</code>. The sidecar is truth — calendar.md is regenerated from it.</dd>
          </dl>
        </div>
      </div>
    </section>`);
}

function renderColophon(): RawHtml {
  return unsafe(html`
    <footer class="eh-colophon">
      <span>End of manual</span><span>·</span><span>revision 2.0</span><span>·</span><em>The cycle compounds.</em><span>·</span>
      <a href="/dev/editorial-studio" style="color: inherit;">back to the studio</a>
    </footer>`);
}

export function renderHelpPage(ctx: StudioContext): string {
  const now = ctx.now ? ctx.now() : new Date();
  const body = html`
    ${renderEditorialFolio('manual', "compositor's manual")}
    <a class="eh-back" href="/dev/editorial-studio">back to the studio</a>
    <div class="eh-rail" aria-hidden="true"></div>
    <div class="eh-container">
      ${renderCover(ctx, now)}
      ${renderToc()}
      ${renderModelSection()}
      ${renderTracksSection()}
      ${renderCatalogueSection()}
      ${renderStudioSection()}
      ${renderRunthroughSection()}
      ${renderReferenceSection()}
      ${renderColophon()}
    </div>`;
  return layout({
    title: "The Compositor's Manual — Editorial Calendar — dev",
    cssHrefs: [
      '/static/css/editorial-review.css',
      '/static/css/editorial-nav.css',
      '/static/css/editorial-help.css',
    ],
    bodyAttrs: 'data-review-ui="manual"',
    bodyHtml: body,
    scriptModules: [],
  });
}
