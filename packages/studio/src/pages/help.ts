/**
 * The Compositor's Manual — `/dev/editorial-help`.
 *
 * Static (read-only) operator manual. Renders six sections:
 *   I    — the working model (calendar stages + review states diagrams)
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
 * Ported from `editorial-help.astro`. The audiocontrol original
 * referenced the two hardcoded sites (`audiocontrol.org ·
 * editorialcontrol.org`) in the cover imprint; here we render the
 * configured site hosts instead.
 */

import {
  KIND_LABEL,
  SKILLS_SORTED,
  type Skill,
} from '../../public/src/editorial-skills-catalogue.ts';
import type { StudioContext } from '../routes/api.ts';
import { html, unsafe, type RawHtml } from './html.ts';
import { layout } from './layout.ts';

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
    <header class="eh-cover">
      <p class="eh-cover-kicker">
        Vol. 01 <span class="dot">·</span> Manual <span class="dot">·</span> Internal — for operators
      </p>
      <h1 class="eh-cover-title">
        The Compositor's <em>Manual</em>
      </h1>
      <p class="eh-cover-dek">
        Everything you need to move a thought from notebook to published dispatch without asking a colleague. The editorial calendar, the review pipelines, the skills that drive them, and the desk where you watch the whole thing happen.
      </p>
      <p class="eh-imprint">
        <strong>Sites</strong><span>${sitesInline || ctx.projectRoot}</span>
        <span class="sep">§</span>
        <strong>Issued</strong><span>${formatIssueDate(now)}</span>
        <span class="sep">§</span>
        <strong>Revision</strong><span>1.0</span>
        <span class="sep">§</span>
        <strong>Desk</strong><a href="/dev/editorial-studio">/dev/editorial-studio</a>
      </p>
    </header>`);
}

const TOC_ENTRIES = [
  { id: 'sec-model',      num: '§ I',   title: 'The working model — stages and states', page: 'p. 01' },
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
        <span class="eh-section-sig">Stages · States</span>
      </header>
      <p class="eh-lead">
        Two state machines run in parallel. The <em>calendar stage</em> tracks where a piece of content lives in its lifecycle. The <em>review pipeline</em> tracks whether a specific draft version has been annotated, revised, and approved. They are orthogonal — a piece in <em>Drafting</em> may have three review workflows open against three different draft files, and a piece can reach <em>Published</em> without ever having been through review.
      </p>
      <div class="eh-state-diagram" aria-label="Calendar stages">
        <span class="eh-state-label">Fig. 1 — Calendar stages</span>
        <div class="eh-stage-chain">
          <div class="eh-stage-box"><span class="num">01</span><div class="ornament">◇</div><div class="name">Ideas</div><div class="hint">captured</div></div>
          <div class="eh-stage-arrow">→</div>
          <div class="eh-stage-box"><span class="num">02</span><div class="ornament">§</div><div class="name">Planned</div><div class="hint">keywords</div></div>
          <div class="eh-stage-arrow">→</div>
          <div class="eh-stage-box"><span class="num">03</span><div class="ornament">✎</div><div class="name">Drafting</div><div class="hint">writing</div></div>
          <div class="eh-stage-arrow">→</div>
          <div class="eh-stage-box"><span class="num">04</span><div class="ornament">※</div><div class="name">Review</div><div class="hint">iteration</div></div>
          <div class="eh-stage-arrow">→</div>
          <div class="eh-stage-box"><span class="num">05</span><div class="ornament">✓</div><div class="name">Published</div><div class="hint">live</div></div>
        </div>
        <p class="eh-state-caption">Forward-only. An entry can be paused at any stage but does not walk backwards.</p>
      </div>
      <div class="eh-state-diagram" aria-label="Review pipeline states">
        <span class="eh-state-label">Fig. 2 — Review pipeline (per draft, orthogonal)</span>
        <div class="eh-review-loop">
          <div class="loop-node">open</div>
          <div class="loop-arrow">→</div>
          <div class="loop-node">in-review</div>
          <div class="loop-arrow">⇄</div>
          <div class="loop-node">iterating</div>
          <div class="loop-arrow" style="grid-column: 3;">↓</div>
          <div class="loop-node terminal-ok" style="grid-column: 4;">approved</div>
          <div class="loop-arrow" style="grid-column: 5;">→</div>
          <div class="loop-node terminal-ok" style="grid-row: 3; grid-column: 1;">applied</div>
          <div class="loop-arrow" style="grid-row: 3; grid-column: 2;">←</div>
          <div class="loop-node terminal-x" style="grid-row: 3; grid-column: 3 / span 3;">cancelled (any state → here)</div>
        </div>
        <p class="eh-state-caption">Every transition is validated by the pipeline's <code>VALID_TRANSITIONS</code>. <em>applied</em> means the draft has been written to its destination file; <em>cancelled</em> means the workflow was abandoned with the source untouched.</p>
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
      <p>Each track is a canonical run order for its kind of content. The studio surfaces the next move per track and per entry; these lists are for when you are driving Claude Code directly.</p>
      <div class="eh-tracks">
        <div class="eh-track">
          <p class="eh-track-title">Longform</p>
          <p class="eh-track-sub">Blog posts · dispatches</p>
          <ol class="eh-track-steps">
            <li>Capture the idea.<code>/editorial-add "Title"</code></li>
            <li>Promote and set keywords.<code>/editorial-plan &lt;slug&gt;</code></li>
            <li>Scaffold the draft file.<code>/editorial-draft &lt;slug&gt;</code><span class="note">or click "scaffold" in the studio.</span></li>
            <li>Write the prose. No skill; this is the human doing the work.</li>
            <li>Open a review workflow.<code>/editorial-draft-review &lt;slug&gt;</code></li>
            <li>Annotate in the browser, then iterate.<code>/editorial-iterate</code></li>
            <li>Approve — writes to the destination file.<code>/editorial-approve</code></li>
            <li>Mark published. Then commit + push by hand.<code>/editorial-publish &lt;slug&gt;</code></li>
          </ol>
        </div>
        <div class="eh-track">
          <p class="eh-track-title">Shortform</p>
          <p class="eh-track-sub">Social copy · cross-posts</p>
          <ol class="eh-track-steps">
            <li>Draft per platform.<code>/editorial-shortform-draft &lt;slug&gt; &lt;platform&gt;</code><span class="note">Reddit, YouTube, LinkedIn, newsletter.</span></li>
            <li>Review the same way as longform (same page, shortform mode).<span class="note">/dev/editorial-review-shortform</span></li>
            <li>Iterate or approve as with longform.<code>/editorial-iterate · /editorial-approve</code></li>
            <li>Post the copy yourself to the platform.</li>
            <li>Record the distribution.<code>/editorial-distribute &lt;slug&gt; &lt;platform&gt; &lt;url&gt;</code></li>
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
          <p>Five columns: <em>Ideas · Planned · Drafting · Review · Published</em>. Each row shows slug, title, stage-specific metadata (keywords for Planned; dates for Published), a file-present dot, and the active review workflow stamp when one exists.</p>
          <h4>Next-move column</h4>
          <p>Per row, the studio surfaces either a copy-to-clipboard command (for cognitive work that lives in Claude Code) or a one-click button (for mechanical transitions). <code>scaffold →</code> calls <code>/editorial-draft</code>. <code>publish →</code> calls <code>/editorial-publish</code>.</p>
          <h4>Shortform coverage matrix</h4>
          <p>For each <em>Published</em> blog, a row of platform cells (reddit, linkedin, youtube, instagram). Shaded cells are covered by a DistributionRecord; empty cells surface the exact <code>/editorial-shortform-draft</code> command to copy.</p>
          <h4>Voice-drift signal</h4>
          <p>A small panel on the right, backed by <code>/editorial-review-report</code>. Names the two voice-skill categories that are producing the most operator corrections. Shows once you have at least five terminal workflows on record.</p>
        </div>
        <div class="eh-panel">
          <p class="eh-panel-head">Secondary surfaces</p>
          <h4>Longform review</h4>
          <p><code>/dev/editorial-review/&lt;slug&gt;</code>. The draft renders inside the review surface. Select text for a margin note; double-click anywhere to edit the markdown in place; approve, iterate, or reject from the fixed strip.</p>
          <h4>Shortform review</h4>
          <p><code>/dev/editorial-review-shortform</code>. Cards grouped by platform. Each card has a version header, an editable textarea, and save · approve · iterate · reject controls.</p>
          <h4>Keyboard</h4>
          <p>In the studio: <kbd>1</kbd>–<kbd>5</kbd> jump to stage columns. In a longform review: <kbd>e</kbd> / double-click toggles edit mode; <kbd>a</kbd> approves; <kbd>i</kbd> iterates; <kbd>r</kbd> rejects; <kbd>j</kbd>/<kbd>k</kbd> step through margin notes; <kbd>?</kbd> shows a full shortcuts overlay.</p>
          <h4>Polling</h4>
          <p>Both routes poll every 8–10 seconds when idle. If the agent runs <code>/editorial-iterate</code> in Claude Code, a new draft version shows up in the browser without a reload.</p>
        </div>
      </div>
    </section>`);
}

const RUNTHROUGH_STEPS: ReadonlyArray<{ title: string; op: string; body: RawHtml }> = [
  {
    title: 'Capture an idea',
    op: 'terminal',
    body: unsafe('<p>You have a title in mind. Run <code>/editorial-add "Your Title"</code>. A row lands in <em>Ideas</em>. Slug is generated; calendar is committed-able.</p>'),
  },
  {
    title: 'Promote to Planned',
    op: 'terminal',
    body: unsafe('<p>The idea has shape. Run <code>/editorial-plan &lt;slug&gt;</code>. You are prompted for target keywords and topic tags; they land on the calendar row. The studio\'s Planned column now shows it with a tag strip.</p>'),
  },
  {
    title: 'Scaffold the draft',
    op: 'studio or terminal',
    body: unsafe('<p>Click the <code>scaffold →</code> button on the row, or run <code>/editorial-draft --site &lt;site&gt; &lt;slug&gt;</code>. The blog file appears with frontmatter filled in, and the entry moves to <em>Drafting</em>.</p>'),
  },
  {
    title: 'Write the prose',
    op: 'editor',
    body: unsafe('<p>This is the human half. Open the scaffolded file and write the dispatch. The voice skill is not invoked yet — it comes in at review time.</p>'),
  },
  {
    title: 'Open the review workflow',
    op: 'terminal',
    body: unsafe('<p><code>/editorial-draft-review &lt;slug&gt;</code> prints the dev URL: <code>/dev/editorial-review/&lt;slug&gt;</code>. The draft renders inside the review chrome. State: <em>open</em>.</p>'),
  },
  {
    title: 'Annotate in the browser',
    op: 'browser',
    body: unsafe('<p>Select text → the <code>Mark</code> pencil appears → category dropdown → type a note → <em>Leave mark</em>. Repeat for each correction. The state flips to <em>in-review</em> on your first action.</p>'),
  },
  {
    title: 'Iterate',
    op: 'browser then terminal',
    body: unsafe('<p>Click <em>Iterate</em>. State becomes <em>iterating</em>. Back in Claude Code, run <code>/editorial-iterate</code>. The agent revises using the site voice skill, writes v2 to the journal, flips back to <em>in-review</em>. Polling surfaces v2 in the browser without a reload.</p>'),
  },
  {
    title: 'Approve and write',
    op: 'browser then terminal',
    body: unsafe('<p>Click <em>Approve</em>. State becomes <em>approved</em>. Run <code>/editorial-approve</code>. The approved version is written to the blog file on disk; state becomes <em>applied</em>.</p>'),
  },
  {
    title: 'Commit by hand',
    op: 'terminal',
    body: unsafe('<p>The UI does not commit. Review the diff, commit and push when ready. This is deliberate — the operator holds the pen.</p>'),
  },
  {
    title: 'Mark published',
    op: 'studio or terminal',
    body: unsafe('<p>Click <code>publish →</code> on the Drafting or Review row, or run <code>/editorial-publish &lt;slug&gt;</code>. The entry moves to <em>Published</em>; today\'s date is stamped as <code>datePublished</code>.</p>'),
  },
  {
    title: 'Cross-post',
    op: 'terminal × platform',
    body: unsafe('<p>For each platform worth posting to: <code>/editorial-shortform-draft &lt;slug&gt; &lt;platform&gt;</code>. Review it exactly like a longform workflow. Approve, then post it yourself. Record the URL with <code>/editorial-distribute &lt;slug&gt; &lt;platform&gt; &lt;url&gt;</code>.</p>'),
  },
  {
    title: 'Reconcile and reflect',
    op: 'cadence',
    body: unsafe('<p><code>/editorial-reddit-sync</code> to pull external state; <code>/editorial-social-review</code> to see the coverage matrix; <code>/editorial-review-report</code> to see which voice-skill principles are drifting. Feed the observations back into the voice skills. The cycle compounds.</p>'),
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
          <h4>Keyboard — longform review</h4>
          <dl>
            <dt><kbd>e</kbd> / dbl-click</dt><dd>toggle edit mode</dd>
            <dt>select text</dt><dd>leave a margin note</dd>
            <dt><kbd>a</kbd></dt><dd>approve the draft</dd>
            <dt><kbd>i</kbd></dt><dd>iterate (hand off to Claude Code)</dd>
            <dt><kbd>r</kbd></dt><dd>reject — cancels the workflow</dd>
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
            <dt><kbd>3</kbd></dt><dd>jump to Drafting</dd>
            <dt><kbd>4</kbd></dt><dd>jump to Review</dd>
            <dt><kbd>5</kbd></dt><dd>jump to Published</dd>
          </dl>
        </div>
        <div class="eh-ref-block eh-ref-block--stacked">
          <h4>URL patterns</h4>
          <dl>
            <dt>/dev/editorial-studio</dt><dd>calendar desk</dd>
            <dt>/dev/editorial-review/&lt;slug&gt;</dt><dd>longform review</dd>
            <dt>/dev/editorial-review-shortform</dt><dd>shortform cards</dd>
            <dt>/dev/editorial-help</dt><dd>this manual</dd>
          </dl>
        </div>
        <div class="eh-ref-block">
          <h4>Review state transitions</h4>
          <table class="eh-transitions">
            <thead><tr><th>from</th><th>to</th></tr></thead>
            <tbody>
              <tr><td>open</td><td class="arrow">→ in-review, cancelled</td></tr>
              <tr><td>in-review</td><td class="arrow">→ iterating, approved, cancelled</td></tr>
              <tr><td>iterating</td><td class="arrow">→ in-review, cancelled</td></tr>
              <tr><td>approved</td><td class="arrow">→ applied, cancelled</td></tr>
              <tr><td>applied</td><td>— terminal</td></tr>
              <tr><td>cancelled</td><td>— terminal</td></tr>
            </tbody>
          </table>
        </div>
        <div class="eh-ref-block eh-ref-block--stacked">
          <h4>File locations</h4>
          <dl>
            <dt>(per-site calendar — see config)</dt><dd>the single calendar file per site</dd>
            <dt>.deskwork/review-journal/pipeline/</dt><dd>per-workflow review state, one JSON per id</dd>
            <dt>.deskwork/review-journal/history/</dt><dd>every event (versions, states, comments)</dd>
            <dt>(blog content dir — see config)</dt><dd>blog post source directory</dd>
            <dt>plugins/&lt;plugin&gt;/skills/&lt;name&gt;/</dt><dd>one skill = one directory</dd>
          </dl>
        </div>
        <div class="eh-ref-block">
          <h4>First-run tripwires</h4>
          <dl>
            <dt>404 on /dev/*</dt><dd>the dev routes only run when <code>deskwork-studio</code> is up. Start it: <code>npx tsx packages/studio/src/server.ts</code>.</dd>
            <dt>no galley to review</dt><dd>start one with <code>/editorial-draft-review --site &lt;site&gt; &lt;slug&gt;</code>.</dd>
            <dt>iterate doesn't trigger</dt><dd>the agent has to run <code>/editorial-iterate</code>. The browser button just marks the workflow; Claude does the writing.</dd>
          </dl>
        </div>
      </div>
    </section>`);
}

function renderColophon(): RawHtml {
  return unsafe(html`
    <footer class="eh-colophon">
      <span>End of manual</span><span>·</span><span>revision 1.0</span><span>·</span><em>The cycle compounds.</em><span>·</span>
      <a href="/dev/editorial-studio" style="color: inherit;">back to the studio</a>
    </footer>`);
}

export function renderHelpPage(ctx: StudioContext): string {
  const now = ctx.now ? ctx.now() : new Date();
  const body = html`
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
      '/static/css/editorial-help.css',
    ],
    bodyAttrs: 'data-review-ui="manual"',
    bodyHtml: body,
    scriptModules: [],
  });
}
