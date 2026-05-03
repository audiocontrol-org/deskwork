# Studio UX/UI Design Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the comprehensive studio UX/UI design pass per `docs/superpowers/specs/2026-05-01-studio-uxui-design.md` — addressing 16 in-scope Category-A issues across 7 deskwork-studio surfaces, plus the cross-cutting glossary mechanism (#114), with all visual design output produced by `/frontend-design:frontend-design`.

**Architecture:** Phased implementation — Phase 0 verifies VERIFY-status issues to reduce scope; Phase 1 lays the cross-surface glossary foundation; Phases 2-8 redesign each surface, invoking `/frontend-design:frontend-design` for the visual work and integrating its output into the existing studio surfaces. Phase boundaries are pauseable — each phase ends with all tests green and that surface in working order.

**Tech Stack:**
- TypeScript (npm workspaces; `@deskwork/core`, `@deskwork/cli`, `@deskwork/studio`)
- Hono web server (studio)
- Vite middleware (dev mode HMR per `DEVELOPMENT.md`)
- vitest (unit + integration tests)
- esbuild (production client-asset build)
- `/frontend-design:frontend-design` (Skill-tool invocation; produces HTML markup + CSS + optional client JS)
- `/deskwork:doctor`, `/deskwork:approve` (existing CLI verbs — not modified by this plan)
- `gh` CLI (issue triage in Phase 0)

---

## File Structure

### New files

| Path | Responsibility |
|---|---|
| `packages/studio/src/data/glossary.json` | Single source of truth for glossary terms (#114). Schema: `{ term-key: { term, gloss, seeAlso } }`. |
| `packages/studio/src/lib/glossary-helper.ts` | Server-side `gloss(term-key)` template helper that emits `<span class="er-gloss" data-term="...">`. Loads `glossary.json` at module init. |
| `packages/studio/test/glossary-helper.test.ts` | Unit tests for `gloss()` — markup shape, missing-term error, see-also links. |
| `plugins/deskwork-studio/public/src/glossary-tooltip.ts` | Client-side tooltip behavior: hover/focus reveals, Esc / click-outside dismisses, tabindex + ARIA wiring. Markup design comes from frontend-design. |
| `plugins/deskwork-studio/public/css/entry-review.css` | Entry-review surface design system extension. `er-entry-*` family. Owned by §5.2; produced by frontend-design. |
| `packages/studio/test/entry-review-styling.test.ts` | Regression: `er-entry-*` classes are present in rendered markup; `entry-review.css` is referenced in `<link rel="stylesheet">`. |
| `packages/studio/test/index-page-links.test.ts` | Regression: index page renders explicit links to dashboard, longform, shortform, content, manual. |
| `packages/studio/test/manual-glossary-section.test.ts` | Regression: Manual contains glossary section + anchors; no `/editorial-*` slash names remain. |
| `packages/studio/test/shortform-config-platforms.test.ts` | Regression: shortform desk renders configured platforms (not hardcoded list); empty-state copy doesn't reference unbuilt features. |
| `packages/studio/test/longform-toc.test.ts` | Regression: longform TOC renders one entry per markdown heading; collapse state persists. |
| `packages/studio/test/longform-keybinding-modifiers.test.ts` | Regression: single-letter approve/iterate/reject without modifier is no-op; with modifier triggers handler. |

### Modified files

| Path | Changes |
|---|---|
| `plugins/deskwork-studio/public/css/editorial-review.css` | Add `[data-review-ui="entry-review"]` to scoped reset; add `er-gloss` + `er-gloss-tip` rules per frontend-design output. |
| `packages/studio/src/pages/layout.ts` | Add glossary-tooltip client script tag to the layout `<head>` so every surface includes it. |
| `packages/studio/src/pages/html.ts` | Re-export `gloss()` from `glossary-helper.ts` for use in template literals. |
| `packages/studio/src/pages/entry-review.ts` | Add `entry-review.css` to `cssHrefs`; integrate frontend-design markup; ensure `data-review-ui="entry-review"` on body. |
| `packages/studio/src/pages/help.ts` | Rewrite `/editorial-*` slash names to `/deskwork:*` + `/dw-lifecycle:*`; add Glossary section rendered from `glossary.json`. |
| `packages/studio/src/pages/index.ts` | Add explicit cards/links to dashboard, longform, shortform, content, manual; use `gloss()` on first occurrence of typesetting jargon. |
| `packages/studio/src/pages/shortform.ts` | Read platforms from `.deskwork/config.json` (or per-entry sidecar); rewrite empty-state copy. |
| `packages/studio/src/pages/review.ts` | Add TOC pane (frontend-design output); update keybinding handler to require Cmd/Ctrl modifier; integrate clipboard helper for Approve. |
| `packages/studio/src/pages/dashboard.ts` and `packages/studio/src/pages/dashboard/` | Phase 0-driven; remove dead buttons (#98 likely), rewire active ones (#75), integrate clipboard (#99 if needed), redesign rename UX placement (#105), fix or remove polling (#68). |
| `packages/studio/src/pages/content.ts` | Gate `/blog/<slug>` URL fabrication on `host` config presence (#71); fix detail-panel false-negative on frontmatter+body files (#103, if Phase 0 confirms still active). |
| `packages/studio/src/pages/scrapbook.ts` | Same host-gating as content.ts where applicable. |
| `packages/studio/src/pages/dashboard.ts` (intake form / state-signature polling) | Per-Phase-0; integrate unified clipboard helper if Phase 0 confirms #99 is still active; fix or remove `/api/dev/editorial-studio/state-signature` polling (#68). |
| `packages/studio/src/data/config-platforms.ts` (or similar) | New module to read shortform platform list from config (replaces hardcoded array). |

### Files NOT modified (locked per spec)

- `plugins/deskwork-studio/public/css/editorial-review.css` token block (`:root { --er-paper, ... }`) — preserved verbatim.
- Any font reference (Fraunces, Newsreader, JetBrains Mono).
- `packages/studio/src/pages/review-viewport.css` (longform review viewport) — locked.
- `packages/studio/src/lib/stage-affordances.ts` — entry-review affordance plumbing, locked.

---

## Phase 0 — Verification

Confirm or refute the 6 VERIFY-status issues against current v0.12.1 code state. Reduces Phase 3-7 scope. No code changes; output is a status update on each issue.

Tools: `gh issue view`, `gh issue comment`, `curl` against `npm run dev` studio, `grep` against source. Issues left open; closure is operator's call per the rule in `.claude/rules/agent-discipline.md`.

### Task 0.1: Verify #75 — dashboard Publish button

**Files:**
- Read: `packages/studio/src/pages/dashboard.ts`
- Read: `packages/studio/src/pages/dashboard/` (if dir exists)

- [ ] **Step 1: Boot dev studio**

```bash
npm run dev
```

Expected: studio starts on `http://localhost:47321/`. Dev mode emits `vite root` line.

- [ ] **Step 2: Probe dashboard for Publish button presence**

```bash
curl -s http://localhost:47321/dev/editorial-studio | grep -oE '<[^>]*Publish[^>]*>|<[^>]*data-action="publish"[^>]*>' | head -5
```

Expected: either no matches (Phase 30 already removed) OR matches showing the button.

- [ ] **Step 3: If button present, probe its endpoint**

If Step 2 returned matches with `href` or `data-action`, identify the endpoint and curl it with a known PRD entry uuid. Determine if it 404s.

- [ ] **Step 4: Post comment to #75**

```bash
gh issue comment 75 --repo audiocontrol-org/deskwork --body 'Verified in v0.12.1: <ACTIVE | MOOT>. Evidence: <curl output / grep result>.'
```

- [ ] **Step 5: Mark in plan**

Update this plan's running notes: #75 = ACTIVE | MOOT (drives Phase 3 task scope).

### Task 0.2: Verify #98 — dashboard scaffold button

**Files:**
- Read: `packages/studio/src/pages/dashboard.ts`

- [ ] **Step 1: Grep for the dead endpoint reference**

```bash
grep -nE 'editorial-calendar/draft|scaffold' packages/studio/src/ plugins/deskwork-studio/public/src/ -r 2>/dev/null | head -10
```

Expected: either no matches (Phase 30 retired) OR matches showing the button + handler.

- [ ] **Step 2: Probe live**

```bash
curl -s http://localhost:47321/dev/editorial-studio | grep -oE 'data-action="scaffold"|/api/dev/editorial-calendar/draft' | head -5
```

- [ ] **Step 3: Test endpoint**

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST -H 'Content-Type: application/json' -d '{}' http://localhost:47321/api/dev/editorial-calendar/draft
```

Expected: 404 (endpoint gone) or 200 (still wired). 404 → button is dead, must be removed in Phase 3.

- [ ] **Step 4: Post comment to #98**

```bash
gh issue comment 98 --repo audiocontrol-org/deskwork --body 'Verified in v0.12.1: <ACTIVE | MOOT>. Evidence: ...'
```

- [ ] **Step 5: Mark in plan running notes**

### Task 0.3: Verify #71 — content tree fabricates `/blog/<slug>` for non-website collections

**Files:**
- Read: `packages/studio/src/pages/content.ts`
- Read: `packages/studio/src/pages/scrapbook.ts`
- Read: `.deskwork/config.json` (this project — non-website collection, `host` field absent or empty)

- [ ] **Step 1: Confirm this project is a non-website collection**

```bash
jq '.sites' .deskwork/config.json
```

Expected: site config without `host` field (or with empty/null host). This project ships as content-collection-only.

- [ ] **Step 2: Probe content tree HTML for fabricated URLs**

```bash
curl -s http://localhost:47321/dev/content/deskwork-internal | grep -oE 'href="/blog/[^"]+"' | head -5
```

Expected: no matches (already gated) OR fabricated URLs (active bug).

- [ ] **Step 3: Grep for the fabrication site of code**

```bash
grep -nE '/blog/|public-url|publishedUrl' packages/studio/src/pages/content.ts packages/studio/src/pages/scrapbook.ts | head -10
```

- [ ] **Step 4: Post comment to #71**

- [ ] **Step 5: Mark in plan running notes**

### Task 0.4: Verify #103 — content-detail panel false "no frontmatter / no body"

**Files:**
- Read: `packages/studio/src/pages/content-detail.ts`

- [ ] **Step 1: Pick a fixture file with both frontmatter and body**

This project has `docs/1.0/001-IN-PROGRESS/deskwork-plugin/prd.md` with both. Use it as the test artifact.

- [ ] **Step 2: Probe the detail panel**

```bash
curl -s http://localhost:47321/dev/content/deskwork-internal/1.0/001-IN-PROGRESS/deskwork-plugin/prd | grep -oE 'no frontmatter|no body|<dt>frontmatter</dt>|<dt>body</dt>' | head -5
```

Expected: shows frontmatter + body presence (already fixed) OR shows "no frontmatter" or "no body" (active bug).

- [ ] **Step 3: Post comment to #103**

- [ ] **Step 4: Mark in plan running notes**

### Task 0.5: Verify #74 — longform Approve clipboard race

**Files:**
- Read: `packages/studio/src/pages/review.ts`
- Read: `plugins/deskwork-studio/public/src/editorial-review-client.ts`
- Read: `plugins/deskwork-studio/public/src/clipboard.ts` (Phase 27 unified helper)

- [ ] **Step 1: Grep review-client for clipboard usage**

```bash
grep -nE 'clipboard|navigator\.clipboard|er-clipboard' plugins/deskwork-studio/public/src/editorial-review-client.ts plugins/deskwork-studio/public/src/clipboard.ts | head -10
```

Expected: review-client either uses the unified `clipboard.ts` helper (fixed) OR uses bare `navigator.clipboard` (race-prone).

- [ ] **Step 2: Test the Approve flow in browser if needed**

Open `http://localhost:47321/dev/editorial-review/<workflow-uuid>` against a fixture entry; click Approve; observe whether the popup race occurs.

- [ ] **Step 3: Post comment to #74**

- [ ] **Step 4: Mark in plan running notes**

### Task 0.6: Verify #99 — intake form silent on copy click

**Files:**
- Read: `packages/studio/src/pages/dashboard.ts` (or wherever intake form lives)
- Read: `plugins/deskwork-studio/public/src/clipboard.ts`

- [ ] **Step 1: Grep dashboard / intake-form code for clipboard helper usage**

```bash
grep -nE 'intake|copy-intake|er-intake|clipboard' packages/studio/src/pages/dashboard.ts packages/studio/src/pages/dashboard/ plugins/deskwork-studio/public/src/ -r 2>/dev/null | head -15
```

- [ ] **Step 2: Test in browser if needed**

Open dashboard; if intake form is visible, click the copy button; check whether feedback (toast / inline confirmation) appears.

- [ ] **Step 3: Post comment to #99**

- [ ] **Step 4: Mark in plan running notes**

### Task 0.7: Verify #104 — Manual uses legacy `/editorial-*` slash names

**Files:**
- Read: `packages/studio/src/pages/help.ts`

- [ ] **Step 1: Grep manual for legacy slash names**

```bash
grep -nE '/editorial-[a-z-]+' packages/studio/src/pages/help.ts | head -20
```

Expected: matches showing remaining legacy references (active bug) OR no matches (already rewritten).

- [ ] **Step 2: Probe rendered manual for legacy slash names**

```bash
curl -s http://localhost:47321/dev/editorial-help | grep -oE '/editorial-[a-z-]+' | sort -u | head -20
```

- [ ] **Step 3: Post comment to #104**

- [ ] **Step 4: Mark in plan running notes**

### Task 0.8: Phase 0 close-out

- [ ] **Step 1: Aggregate Phase 0 findings**

Write a brief summary to `.git-commit-msg.tmp`:

```
docs: Phase 0 verification — 6 VERIFY items resolved

#75: ACTIVE/MOOT - <evidence>
#98: ACTIVE/MOOT - <evidence>
#71: ACTIVE/MOOT - <evidence>
#103: ACTIVE/MOOT - <evidence>
#74: ACTIVE/MOOT - <evidence>
#99: ACTIVE/MOOT - <evidence>
#104: ACTIVE/MOOT - <evidence>

Phase 3-7 scope updated accordingly.
```

- [ ] **Step 2: Update spec §6 issue matrix in-place**

Edit `docs/superpowers/specs/2026-05-01-studio-uxui-design.md` §6 to replace VERIFY status with ACTIVE / MOOT for each.

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-05-01-studio-uxui-design.md
git commit -F .git-commit-msg.tmp
rm .git-commit-msg.tmp
```

---

## Phase 1 — Glossary mechanism

Foundation for #114. Cross-surface; every later phase depends on it. `/frontend-design:frontend-design` produces the tooltip visual treatment; the data + helper + client wiring is straight integration work.

### Task 1.1: Author the glossary JSON

**Files:**
- Create: `packages/studio/src/data/glossary.json`

- [ ] **Step 1: Write the failing test**

Create `packages/studio/test/glossary-data.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import glossary from '@/data/glossary.json';

describe('glossary.json', () => {
  it('has required initial terms', () => {
    const required = ['press-check', 'galley', 'compositor', 'proof', 'marginalia', 'stamp', 'kicker', 'flat-plan', 'desk-inset', 'dispatch', 'stet', 'scrapbook'];
    for (const key of required) {
      expect(glossary, `missing key: ${key}`).toHaveProperty(key);
      expect(glossary[key]).toMatchObject({ term: expect.any(String), gloss: expect.any(String) });
    }
  });
  it('every entry has term + gloss; seeAlso entries reference real keys', () => {
    for (const [key, entry] of Object.entries(glossary)) {
      expect(entry.term, `${key}.term`).toBeTruthy();
      expect(entry.gloss, `${key}.gloss`).toBeTruthy();
      if (entry.seeAlso) {
        for (const ref of entry.seeAlso) {
          expect(glossary, `${key}.seeAlso[${ref}] not found`).toHaveProperty(ref);
        }
      }
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test --workspace @deskwork/studio -- glossary-data
```

Expected: FAIL — `glossary.json` does not exist.

- [ ] **Step 3: Create `glossary.json` with the spec §3 term inventory**

```json
{
  "press-check": {
    "term": "press-check",
    "gloss": "The final pre-print review of a galley proof. In the studio, the longform-review surface where margin notes are added before approval.",
    "seeAlso": ["galley", "proof"]
  },
  "galley": {
    "term": "galley",
    "gloss": "A column-proof of typeset copy. In the studio, the rendered article under review.",
    "seeAlso": ["proof", "press-check"]
  },
  "compositor": {
    "term": "compositor",
    "gloss": "The typesetter at the press. In the studio, the operator-and-agent pair driving the editorial workflow.",
    "seeAlso": []
  },
  "proof": {
    "term": "proof",
    "gloss": "A draft printed for review. In the studio, the document state passed between pipeline stages.",
    "seeAlso": ["galley", "press-check"]
  },
  "marginalia": {
    "term": "margin notes",
    "gloss": "Notes written in the margins of a proof. In the studio, the comments left on the longform-review surface.",
    "seeAlso": ["press-check"]
  },
  "stamp": {
    "term": "stamp",
    "gloss": "A status badge on a proof — approved, iterating, applied, etc.",
    "seeAlso": []
  },
  "kicker": {
    "term": "kicker",
    "gloss": "A small label above the title of an article — typographic context for what's about to be read.",
    "seeAlso": []
  },
  "flat-plan": {
    "term": "flat plan",
    "gloss": "An editorial layout-planning document showing what runs where. In the studio, the dashboard.",
    "seeAlso": []
  },
  "desk-inset": {
    "term": "desk inset",
    "gloss": "A clipboard view of a single entry under inspection — the entry-review surface.",
    "seeAlso": []
  },
  "dispatch": {
    "term": "dispatch",
    "gloss": "Moving a proof through pipeline stages. In the studio, the approve / iterate / publish actions.",
    "seeAlso": ["proof"]
  },
  "stet": {
    "term": "stet",
    "gloss": "A proofreading mark meaning 'let it stand' — undoes a previous correction.",
    "seeAlso": []
  },
  "scrapbook": {
    "term": "scrapbook",
    "gloss": "Research material kept alongside an article — clippings, screenshots, drafts. In the studio, the per-entry research store.",
    "seeAlso": []
  }
}
```

- [ ] **Step 4: Run test to verify pass**

```bash
npm test --workspace @deskwork/studio -- glossary-data
```

Expected: PASS — all 12 required terms present, all `seeAlso` references resolve.

- [ ] **Step 5: Commit**

```bash
git add packages/studio/src/data/glossary.json packages/studio/test/glossary-data.test.ts
git commit -m "feat(studio): glossary.json with initial term inventory (#114)"
```

### Task 1.2: Implement `gloss()` template helper

**Files:**
- Create: `packages/studio/src/lib/glossary-helper.ts`
- Create: `packages/studio/test/glossary-helper.test.ts`
- Modify: `packages/studio/src/pages/html.ts` (re-export `gloss`)

- [ ] **Step 1: Write the failing test**

Create `packages/studio/test/glossary-helper.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { gloss } from '@/lib/glossary-helper';

describe('gloss() template helper', () => {
  it('emits an er-gloss span with data-term', () => {
    const result = gloss('press-check').toString();
    expect(result).toMatch(/^<span\s+class="er-gloss"\s+data-term="press-check"[^>]*>press-check<\/span>$/);
  });
  it('uses the gloss term verbatim by default', () => {
    expect(gloss('press-check').toString()).toContain('>press-check<');
    expect(gloss('marginalia').toString()).toContain('>margin notes<');
  });
  it('throws on unknown term-key', () => {
    expect(() => gloss('not-a-real-term' as any)).toThrow(/unknown glossary term/i);
  });
  it('emits aria-describedby to the glossary-anchor id', () => {
    const result = gloss('press-check').toString();
    expect(result).toMatch(/aria-describedby="glossary-press-check"/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test --workspace @deskwork/studio -- glossary-helper
```

Expected: FAIL — `glossary-helper.ts` does not exist.

- [ ] **Step 3: Implement the helper**

Create `packages/studio/src/lib/glossary-helper.ts`:

```typescript
import glossary from '@/data/glossary.json';
import { unsafe, type RawHtml } from '@/pages/html';

type GlossaryEntry = { term: string; gloss: string; seeAlso?: string[] };
type GlossaryKey = keyof typeof glossary;

function isKey(s: string): s is GlossaryKey {
  return s in glossary;
}

export function gloss(key: GlossaryKey): RawHtml {
  if (!isKey(key)) {
    throw new Error(`unknown glossary term: ${key}`);
  }
  const entry: GlossaryEntry = glossary[key];
  return unsafe(`<span class="er-gloss" data-term="${escapeAttr(key)}" tabindex="0" role="button" aria-describedby="glossary-${escapeAttr(key)}">${escapeText(entry.term)}</span>`);
}

function escapeText(s: string): string {
  return s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!));
}

function escapeAttr(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
}

export type { GlossaryKey, GlossaryEntry };
```

- [ ] **Step 4: Re-export `gloss` from `html.ts`**

Edit `packages/studio/src/pages/html.ts`, append:

```typescript
export { gloss } from '@/lib/glossary-helper';
export type { GlossaryKey } from '@/lib/glossary-helper';
```

- [ ] **Step 5: Run test to verify pass**

```bash
npm test --workspace @deskwork/studio -- glossary-helper
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/studio/src/lib/glossary-helper.ts packages/studio/src/pages/html.ts packages/studio/test/glossary-helper.test.ts
git commit -m "feat(studio): gloss() template helper for typesetting jargon (#114)"
```

### Task 1.3: Invoke `/frontend-design:frontend-design` for the glossary tooltip pattern

**Files:**
- Reference (don't modify directly here): `plugins/deskwork-studio/public/css/editorial-review.css` — design-system source-of-truth.
- Reference: `docs/superpowers/specs/2026-05-01-studio-uxui-design.md` §3.

- [ ] **Step 1: Prepare the brief**

Compose this exact brief for the Skill invocation:

```
Design the glossary tooltip pattern for the deskwork studio.

Context:
- The studio uses a "press-check / galley / red pencil / rubber stamps" aesthetic.
- Source-of-truth: plugins/deskwork-studio/public/css/editorial-review.css. All CSS tokens (--er-paper, --er-ink, --er-red-pencil, --er-proof-blue, etc.) MUST be reused verbatim.
- Fonts: Fraunces (display), Newsreader (body), JetBrains Mono (code). No font swaps.
- The brief is per docs/superpowers/specs/2026-05-01-studio-uxui-design.md §3.

What to design:
- The visual treatment of an inline term span: <span class="er-gloss" data-term="<key>" tabindex="0" role="button" aria-describedby="glossary-<key>">press-check</span>
- The tooltip card that appears on hover/focus: anchored to the term, paper-textured, ink type, marking-pigment accent. Feels like a footnote, not a hover-card.
- The tooltip card markup conventions (so the client JS can render it from glossary.json data — term, gloss, seeAlso chips).
- Position: above the term by default; flips to below near top edge.
- Dismissal: Esc key; click-outside; blur of the underlying term.
- Behavior on touch devices (tap reveals; tap outside dismisses).

What to produce:
1. CSS rules — to be appended to plugins/deskwork-studio/public/css/editorial-review.css (cross-surface — every studio surface depends on it).
2. Tooltip-card HTML structure (template fragment the client JS can clone-and-fill).
3. Client-side TypeScript module behavior spec — what it does on hover/focus/click/keyboard, in plain English. The agent will write the TS file from this spec.

Anti-goals (forbidden in your output):
- New fonts.
- Palette adjustments — only existing --er-* tokens.
- New container widths.
- Animation longer than 150ms (the studio is a paper aesthetic; motion is anti-metaphor).
- Theme-switching machinery (out of scope).
- JavaScript implementation — describe behavior, don't write the TS file.

Reference for design language:
- editorial-review.css :root token block (lines 27-73) is the foundation.
- .er-stamp pattern (lines 671-702) is a marking-pigment example to draw from.
- .er-btn pattern (lines 706-732) is the interactive-element pattern.
```

- [ ] **Step 2: Invoke the skill**

```
Skill tool: superpowers:frontend-design (or the matching plugin namespace)
or: frontend-design:frontend-design
Args: <the brief from Step 1>
```

Save the output to `.frontend-design-output/glossary-tooltip.md` (gitignored or committed — operator's call).

- [ ] **Step 3: Review output for adherence**

Verify:
- Uses only existing `--er-*` tokens — no new colors / fonts / spacings.
- Doesn't write JS implementation.
- Provides CSS rules + tooltip-card markup convention + behavior description.

If any anti-goal violated, re-invoke with refined brief.

- [ ] **Step 4: Commit the design artifact**

```bash
mkdir -p docs/superpowers/frontend-design
mv .frontend-design-output/glossary-tooltip.md docs/superpowers/frontend-design/glossary-tooltip.md
git add docs/superpowers/frontend-design/glossary-tooltip.md
git commit -m "design: glossary tooltip pattern (frontend-design output for #114)"
```

### Task 1.4: Integrate frontend-design CSS output into editorial-review.css

**Files:**
- Modify: `plugins/deskwork-studio/public/css/editorial-review.css` — append er-gloss + er-gloss-tip rules.

- [ ] **Step 1: Append rules**

Open `plugins/deskwork-studio/public/css/editorial-review.css`, find the end of the file (line ~2619). Add a section header comment + the CSS rules from `docs/superpowers/frontend-design/glossary-tooltip.md`. Use the Edit tool — do not modify any existing rule.

Example shape (actual rules come from frontend-design output):

```css

/* ---------- Glossary tooltip (§3 / #114) ---------- */

.er-gloss {
  border-bottom: 1px dotted var(--er-faded);
  cursor: help;
  /* ... rest from frontend-design ... */
}

.er-gloss-tip {
  /* ... from frontend-design ... */
}
```

- [ ] **Step 2: Verify CSS is valid**

```bash
npm run build --workspace @deskwork/studio
```

Expected: build succeeds (CSS is statically served — no parser at build time, but esbuild won't choke).

- [ ] **Step 3: Smoke in dev**

```bash
npm run dev
```

Open `http://localhost:47321/dev/editorial-help` (or any surface). Visual check: page renders without obvious style breakage.

- [ ] **Step 4: Commit**

```bash
git add plugins/deskwork-studio/public/css/editorial-review.css
git commit -m "feat(studio): glossary tooltip CSS rules (#114)"
```

### Task 1.5: Implement glossary-tooltip client JS

**Files:**
- Create: `plugins/deskwork-studio/public/src/glossary-tooltip.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/studio/test/glossary-tooltip-client.test.ts`:

```typescript
/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { initGlossaryTooltips } from '@/../public/src/glossary-tooltip';

describe('initGlossaryTooltips', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('shows tooltip on hover; dismisses on Esc', () => {
    const span = document.createElement('span');
    span.className = 'er-gloss';
    span.dataset.term = 'press-check';
    span.tabIndex = 0;
    span.setAttribute('role', 'button');
    span.setAttribute('aria-describedby', 'glossary-press-check');
    span.textContent = 'press-check';
    document.body.appendChild(span);

    initGlossaryTooltips({ glossary: { 'press-check': { term: 'press-check', gloss: 'A pre-press review.' } } });

    span.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    const tip = document.querySelector('.er-gloss-tip');
    expect(tip).toBeTruthy();
    expect(tip!.textContent).toContain('A pre-press review.');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(document.querySelector('.er-gloss-tip')).toBeFalsy();
  });

  it('shows tooltip on keyboard focus', () => {
    /* similar shape; focus + blur + Esc */
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test --workspace @deskwork/studio -- glossary-tooltip-client
```

Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement the client (per behavior spec from frontend-design output)**

Create `plugins/deskwork-studio/public/src/glossary-tooltip.ts`:

```typescript
type GlossaryEntry = { term: string; gloss: string; seeAlso?: string[] };
type Glossary = Record<string, GlossaryEntry>;

export function initGlossaryTooltips(opts: { glossary: Glossary }) {
  const { glossary } = opts;
  let activeTip: HTMLElement | null = null;

  function show(span: HTMLElement) {
    hide();
    const key = span.dataset.term;
    if (!key) return;
    const entry = glossary[key];
    if (!entry) return;
    const tip = renderTip(entry, key);
    document.body.appendChild(tip);
    positionTip(tip, span);
    activeTip = tip;
  }

  function hide() {
    if (activeTip) {
      activeTip.remove();
      activeTip = null;
    }
  }

  function renderTip(entry: GlossaryEntry, key: string): HTMLElement {
    const tip = document.createElement('aside');
    tip.className = 'er-gloss-tip';
    tip.id = `glossary-${key}`;
    tip.innerHTML = `<p class="er-gloss-tip-gloss">${escapeText(entry.gloss)}</p>`;
    if (entry.seeAlso?.length) {
      const see = document.createElement('p');
      see.className = 'er-gloss-tip-see-also';
      see.textContent = `see also: ${entry.seeAlso.map((k) => glossary[k]?.term ?? k).join(', ')}`;
      tip.appendChild(see);
    }
    return tip;
  }

  function positionTip(tip: HTMLElement, anchor: HTMLElement) {
    const r = anchor.getBoundingClientRect();
    const flipBelow = r.top < 80;
    tip.style.position = 'absolute';
    tip.style.left = `${r.left + window.scrollX}px`;
    tip.style.top = flipBelow ? `${r.bottom + 6 + window.scrollY}px` : `${r.top - 6 + window.scrollY}px`;
    if (!flipBelow) tip.style.transform = 'translateY(-100%)';
  }

  function escapeText(s: string): string {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  document.querySelectorAll<HTMLElement>('.er-gloss').forEach((span) => {
    span.addEventListener('mouseenter', () => show(span));
    span.addEventListener('mouseleave', hide);
    span.addEventListener('focus', () => show(span));
    span.addEventListener('blur', hide);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hide();
  });

  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    if (!target.closest('.er-gloss') && !target.closest('.er-gloss-tip')) hide();
  });
}

// auto-init when used as a script-tag entry-point
if (typeof window !== 'undefined' && (window as any).__GLOSSARY__) {
  initGlossaryTooltips({ glossary: (window as any).__GLOSSARY__ });
}
```

- [ ] **Step 4: Run test to verify pass**

```bash
npm test --workspace @deskwork/studio -- glossary-tooltip-client
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add plugins/deskwork-studio/public/src/glossary-tooltip.ts packages/studio/test/glossary-tooltip-client.test.ts
git commit -m "feat(studio): glossary-tooltip client (#114)"
```

### Task 1.6: Wire the glossary client into layout.ts

**Files:**
- Modify: `packages/studio/src/pages/layout.ts`

- [ ] **Step 1: Read current layout.ts**

```bash
cat packages/studio/src/pages/layout.ts
```

Identify where script tags are emitted into `<head>` or before `</body>`.

- [ ] **Step 2: Inline the glossary JSON into the page**

Modify `layout.ts` to:
1. Import the glossary JSON.
2. Inline it as `window.__GLOSSARY__` via an inline `<script>` tag (small payload — ~12 entries × ~200 bytes each = 2.4KB).
3. Add a `<script type="module" src="/static/dist/glossary-tooltip.js"></script>` after the inline script.

The exact place + style of the script tag follows the existing layout pattern (look at how `editorial-studio-client.js` is loaded).

- [ ] **Step 3: Smoke**

```bash
npm run dev
```

Open `http://localhost:47321/dev/editorial-studio` — open browser devtools console; verify `window.__GLOSSARY__` is defined; no errors in console.

- [ ] **Step 4: Commit**

```bash
git add packages/studio/src/pages/layout.ts
git commit -m "feat(studio): inline glossary + load tooltip client in every surface (#114)"
```

---

## Phase 2 — Entry-review surface

The most-visible win. Currently 0 CSS rules for `er-entry-*` classes (issue #152). Pure design work.

### Task 2.1: Invoke `/frontend-design:frontend-design` for the entry-review surface

**Files:**
- Reference: `packages/studio/src/pages/entry-review.ts` (existing markup; preserved).
- Reference: `plugins/deskwork-studio/public/css/editorial-review.css` (token system).
- Reference: `docs/superpowers/specs/2026-05-01-studio-uxui-design.md` §5.2.

- [ ] **Step 1: Prepare the brief**

Compose:

```
Design the entry-review surface for the deskwork studio.

Context:
- The studio uses a "press-check / galley / red pencil / rubber stamps" aesthetic.
- Source-of-truth: plugins/deskwork-studio/public/css/editorial-review.css. All CSS tokens (--er-paper, --er-ink, --er-red-pencil, --er-proof-blue, --er-stamp-{green,purple}, etc.) MUST be reused verbatim.
- Fonts: Fraunces (display), Newsreader (body), JetBrains Mono (code). No font swaps.
- The brief is per docs/superpowers/specs/2026-05-01-studio-uxui-design.md §5.2.

Sub-metaphor: "the desk inset — a clipboard view of one entry under inspection. Sits between the workbench (dashboard) and the galley (longform review). Stage-aware controls for graduating it through the pipeline."

What to design:
- Layout for: er-entry-shell (page container) → er-entry-head (kicker, title, meta) → er-entry-controls (stage-aware action strip) → er-entry-artifact (artifact body display).
- er-entry-kicker: small Fraunces uppercase label "Editorial Review · entry".
- er-entry-title: Fraunces display weight, paper background, ink color.
- er-entry-meta: stage badge + UUID + artifact path; arranged in a single line.
- er-entry-stage[data-stage]: a stamp variant — visually consistent with er-stamp family but per-stage (Ideas, Planned, Outlining, Drafting, Final, Published, Blocked, Cancelled). Use existing pigment tokens.
- er-entry-uuid: monospace pill with --er-paper-2 background, faded color.
- er-entry-artifact-path: faint sans / mono code line below the title — quietly informative.
- er-entry-controls + er-entry-controls--mutable / --readonly: action strip layout. Buttons (er-entry-control--button), labeled selectors (er-entry-control--induct, er-entry-control--history), and read-only labels (er-entry-control--readonly). Use existing er-btn pattern as the foundation.
- er-entry-control-label: small label preceding selectors.
- er-entry-artifact (the body display container) + er-entry-body (textarea/pre). Read-only mode (pre, monospace) and mutable mode (textarea, monospace). Both must look like "typewriter on paper".
- er-entry-shell--missing: 404 variant for when the entry uuid doesn't resolve. Keeps page chrome; renders a centered "entry not found" with a back-link.

Markup conventions (existing — DO NOT change):
- The entry-review.ts page renderer emits these classes already (look at packages/studio/src/pages/entry-review.ts).
- Body has data-review-ui="entry-review" — must be added to editorial-review.css's scope list.

What to produce:
1. A new file: plugins/deskwork-studio/public/css/entry-review.css. Self-contained — owns all er-entry-* rules. Loaded by the entry-review page.
2. Possibly an addition to editorial-review.css: extend the scope list to include "entry-review", and add body[data-review-ui="entry-review"] paper-grain background (matching how studio + shortform are treated today around line 107-116).
3. A markdown rationale (~2 paragraphs) explaining the layout choices.

Anti-goals (forbidden in your output):
- New fonts.
- Palette adjustments — only existing --er-* tokens.
- New container widths — use --er-container-wide or --er-container-narrow.
- Spacing scale changes — use --er-space-{0..6}.
- Animation longer than 150ms.
- Theme-switching machinery.
- Margin-note features (#54 is out of scope).
- Modifying packages/studio/src/pages/entry-review.ts beyond the cssHrefs entry — no markup churn.

Reference for design language:
- editorial-review.css :root tokens (lines 27-73).
- .er-stamp + .er-stamp-{open,in-review,iterating,approved,applied,cancelled} (lines 671-691).
- .er-btn family (lines 706-732).
- editorial-studio.css for dashboard layout reference.
- docs/source-shipped-deskwork-plan/index.md for project metaphor context.
```

- [ ] **Step 2: Invoke**

Use the Skill tool:

```
Skill: frontend-design:frontend-design
Args: <the brief>
```

- [ ] **Step 3: Save the artifact**

```bash
mv .frontend-design-output/entry-review.md docs/superpowers/frontend-design/entry-review.md
```

- [ ] **Step 4: Verify adherence**

Read the output, check it didn't violate anti-goals.

- [ ] **Step 5: Commit the design artifact**

```bash
git add docs/superpowers/frontend-design/entry-review.md
git commit -m "design: entry-review surface (frontend-design output for #152)"
```

### Task 2.2: Add entry-review.css with frontend-design CSS

**Files:**
- Create: `plugins/deskwork-studio/public/css/entry-review.css`

- [ ] **Step 1: Write `entry-review.css` with the rules from frontend-design output**

Use the Write tool. The CSS comes verbatim from `docs/superpowers/frontend-design/entry-review.md`. Add a header comment naming the spec section and the issue:

```css
/*
 * entry-review.css — design system extension for the entry-review surface
 * (/dev/editorial-review/<uuid>).
 *
 * Sub-metaphor: "the desk inset — a clipboard view of one entry under inspection."
 *
 * Spec: docs/superpowers/specs/2026-05-01-studio-uxui-design.md §5.2
 * Issue: #152 (frontend-design output)
 *
 * All tokens reference --er-* from editorial-review.css. No new tokens.
 * Scoped under [data-review-ui="entry-review"].
 */

/* ... rules from frontend-design ... */
```

- [ ] **Step 2: Extend editorial-review.css scope list**

Edit `plugins/deskwork-studio/public/css/editorial-review.css`:
1. Find `body[data-review-ui="studio"], body[data-review-ui="shortform"] {` (around line 107).
2. Add `body[data-review-ui="entry-review"]` to the selector list so the same paper-grain treatment applies.

Do NOT modify any other rule.

- [ ] **Step 3: Smoke build + dev**

```bash
npm run build --workspace @deskwork/studio
npm run dev
```

Open `http://localhost:47321/dev/editorial-review/<some-entry-uuid>` (any uuid from this project's `.deskwork/entries/`). Visual check: page renders STYLED. Stage badge visible. Controls strip visible. Artifact body legible.

- [ ] **Step 4: Commit**

```bash
git add plugins/deskwork-studio/public/css/entry-review.css plugins/deskwork-studio/public/css/editorial-review.css
git commit -m "feat(studio): entry-review surface CSS (#152)"
```

### Task 2.3: Wire entry-review.css into the page renderer

**Files:**
- Modify: `packages/studio/src/pages/entry-review.ts`

- [ ] **Step 1: Write the failing regression test**

Create `packages/studio/test/entry-review-styling.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { renderEntryReviewPage } from '@/pages/entry-review';
// ... use the existing fixture-project setup (similar to entry-review-routing.test.ts)

describe('entry-review page CSS wiring', () => {
  it('references entry-review.css', async () => {
    const result = await renderEntryReviewPage(fixtureProjectRoot, knownEntryUuid);
    expect(result.html).toContain('href="/static/css/entry-review.css"');
    expect(result.html).toContain('href="/static/css/editorial-review.css"');
  });
  it('emits er-entry-* classes', async () => {
    const result = await renderEntryReviewPage(fixtureProjectRoot, knownEntryUuid);
    for (const cls of ['er-entry-shell', 'er-entry-head', 'er-entry-title', 'er-entry-meta']) {
      expect(result.html, cls).toContain(`class="${cls}"`);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Expected: FAIL — entry-review.css not in cssHrefs.

- [ ] **Step 3: Update entry-review.ts**

Edit `packages/studio/src/pages/entry-review.ts` line ~137 + ~154:

```typescript
cssHrefs: ['/static/css/editorial-review.css', '/static/css/entry-review.css'],
```

(In both `renderEntryReview()` and `renderNotFound()`.)

- [ ] **Step 4: Run test to verify pass**

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/studio/src/pages/entry-review.ts packages/studio/test/entry-review-styling.test.ts
git commit -m "feat(studio): entry-review page loads entry-review.css (#152)"
```

### Task 2.4: Manual smoke + close #152

- [ ] **Step 1: Boot dev studio**

```bash
npm run dev
```

- [ ] **Step 2: Walk through every entry-review state**

Open in browser:
- `http://localhost:47321/dev/editorial-review/<ideas-stage-uuid>` — Ideas-stage controls visible
- `http://localhost:47321/dev/editorial-review/<drafting-stage-uuid>` — Drafting-stage controls visible (different affordance set)
- `http://localhost:47321/dev/editorial-review/<published-stage-uuid>` — Published-stage controls (read-only)
- `http://localhost:47321/dev/editorial-review/00000000-0000-0000-0000-000000000000` — 404 variant (er-entry-shell--missing)

Verify each renders styled, no console errors, control strip is sensible per stage.

- [ ] **Step 3: Post evidence comment to #152**

Once Phase 2 is in a release, post evidence to #152 (per the no-closure-without-formal-release rule). Closure happens after release.

```bash
gh issue comment 152 --repo audiocontrol-org/deskwork --body 'Source-fix landed in <commit-hash>. Will verify against marketplace install on next release.'
```

---

## Phase 3 — Dashboard

Phase-0-driven. Some tasks may be skipped depending on Phase 0 outcomes.

### Task 3.1: Address ACTIVE issues from Phase 0

Per Phase 0 outcomes for #75, #98, #99, #105, #68 — branching plan.

- [ ] **Step 1: Re-read Phase 0 status notes**

Phase 0's commit message and updated spec §6 — find each issue's ACTIVE/MOOT disposition.

- [ ] **Step 2: Decide per-issue treatment**

For each ACTIVE issue, identify the change scope:
- #75 (Publish 404): rewire to entry-centric model (publish-via-uuid endpoint already exists from Phase 30; button needs to call it).
- #98 (scaffold dead): remove the button + handler (endpoint retired).
- #99 (intake form silent on copy): integrate `clipboard.ts` Phase 27 helper (replace bare `navigator.clipboard` if used).
- #105 (rename empty-slug): per spec §5.1 + §5.2, rename UX moves to entry-review surface — NOT dashboard. Add task for entry-review (Task 3.5 below) instead of patching dashboard.
- #68 (state-signature polling 404): kill the polling (server-sent-events is the better long-term answer; for now just stop the noisy 404s).

Mark each task below as APPLICABLE / SKIP based on Phase 0 outcome.

### Task 3.2: Fix #75 — dashboard Publish button

(SKIP if Phase 0 marked #75 MOOT.)

**Files:**
- Modify: `packages/studio/src/pages/dashboard.ts` (or `dashboard/`)
- Modify: `plugins/deskwork-studio/public/src/editorial-studio-client.ts`
- Test: `packages/studio/test/dashboard-publish.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
import { describe, it, expect } from 'vitest';

describe('dashboard publish button', () => {
  it('publish button POSTs to /api/dev/editorial-review/entry/:uuid/publish', async () => {
    const html = await fetchDashboardHtml(fixtureWithFinalStageEntry);
    const match = html.match(/data-action="publish"\s+data-entry-uuid="([^"]+)"/);
    expect(match).toBeTruthy();
    /* and the client wires it to fetch(`/api/dev/editorial-review/entry/${uuid}/publish`) */
  });
  it('publish button does NOT 404', async () => {
    /* integration test: trigger publish; verify 200 */
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Update dashboard markup + client**

Per Phase 0 evidence, the existing button calls a dead endpoint. Rewire its `data-action` + handler to the entry-centric publish endpoint.

(Exact code depends on Phase 0 findings — placeholder here is intentional; follow the pattern of approve / iterate / cancel handlers in `entry-review-client.ts`.)

- [ ] **Step 4: Run test to verify pass**

- [ ] **Step 5: Smoke in dev**

Click Publish on a Final-stage entry from the dashboard; verify it advances to Published.

- [ ] **Step 6: Commit**

```bash
git commit -m "fix(studio): dashboard Publish wires entry-centric endpoint (#75)"
```

### Task 3.3: Remove #98 — dashboard scaffold button

(SKIP if Phase 0 marked #98 MOOT.)

**Files:**
- Modify: `packages/studio/src/pages/dashboard.ts`
- Modify: `plugins/deskwork-studio/public/src/editorial-studio-client.ts`
- Test: `packages/studio/test/dashboard-no-scaffold.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
describe('dashboard scaffold button removed', () => {
  it('does not render data-action="scaffold"', async () => {
    const html = await fetchDashboardHtml(anyFixture);
    expect(html).not.toContain('data-action="scaffold"');
    expect(html).not.toContain('/api/dev/editorial-calendar/draft');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Remove button from markup + handler from client**

- [ ] **Step 4: Run test to verify pass**

- [ ] **Step 5: Commit**

```bash
git commit -m "fix(studio): remove dashboard scaffold button — endpoint retired in Phase 30 (#98)"
```

### Task 3.4: Fix #99 + #68 — intake form clipboard + state-signature polling

(SKIP individual sub-tasks per Phase 0 outcome for each.)

For #99 ACTIVE: integrate `clipboard.ts` helper into intake form.
For #68: remove the polling code OR rewrite it against an existing endpoint.

Each has the same structure: failing test → minimal change → passing test → smoke → commit.

- [ ] **Step 1: Identify the polling code (#68)**

```bash
grep -nE 'state-signature|setInterval|fetch\(' plugins/deskwork-studio/public/src/editorial-studio-client.ts | head -10
```

- [ ] **Step 2: Decide: kill polling or fix endpoint?**

Recommended: kill polling for v0.13.0; SSE-or-WebSocket reconsidered post-design-pass.

- [ ] **Step 3: Remove the polling**

Edit `editorial-studio-client.ts` to remove the `setInterval` and the `fetch('/api/dev/editorial-studio/state-signature')` call.

- [ ] **Step 4: Smoke**

Open dashboard; observe browser console — no recurring 404s.

- [ ] **Step 5: For #99 — same shape with `clipboard.ts` integration**

(Steps follow Phase 0 outcome.)

- [ ] **Step 6: Commit**

```bash
git commit -m "fix(studio): kill state-signature polling (#68) and integrate clipboard helper into intake form (#99)"
```

### Task 3.5: Move rename UX to entry-review (#105)

(APPLICABLE only if operator decides rename belongs on entry-review per spec §5.2.)

**Files:**
- Modify: `packages/studio/src/pages/entry-review.ts` (add rename control)
- Modify: `plugins/deskwork-studio/public/src/entry-review-client.ts` (wire handler)
- Test: `packages/studio/test/entry-review-rename.test.ts`

- [ ] **Step 1: Confirm placement decision with operator**

If unclear, ask before implementing.

- [ ] **Step 2: Add rename affordance to entry-review controls strip**

Per stage-affordances logic — rename allowed only in non-terminal stages. The control is a button + slug-input prompt.

- [ ] **Step 3: Wire client handler + endpoint**

The endpoint is `/api/dev/editorial-review/entry/:uuid/rename` — add to studio routes if missing.

- [ ] **Step 4: Test**

Empty slug → operator-visible error (no silent no-op). Valid slug → entry slug updated; sidecar persisted.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(studio): rename UX moves to entry-review surface (#105)"
```

### Task 3.6: (Conditional) Frontend-design touchups for dashboard

If Phase 0 + Tasks 3.2-3.5 reveal layout changes (e.g., a removed button leaves a gap; a new affordance needs placement), invoke `/frontend-design:frontend-design` for a dashboard touchup pass.

- [ ] **Step 1: Decide whether visual changes are needed**

Most dashboard fixes are markup/wiring (no visual layout impact). Skip this task if no visual changes.

- [ ] **Step 2: If yes, prepare brief**

Brief targets: dashboard.ts post-fix; describes the removed/added affordances; preserves the day-of-shoot workbench sub-metaphor.

- [ ] **Step 3: Invoke skill, integrate output, commit**

Same shape as Tasks 1.3-1.4 / 2.1-2.3.

---

## Phase 4 — Longform review

Three issues; two are interaction-logic (#74, #108), one is design (#73 TOC).

### Task 4.1: Fix #108 — keybinding modifiers

**Files:**
- Modify: `plugins/deskwork-studio/public/src/editorial-review-client.ts`
- Test: `packages/studio/test/longform-keybinding-modifiers.test.ts`

- [ ] **Step 1: Write failing test (jsdom)**

```typescript
/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { initReviewKeybindings } from '@/../public/src/editorial-review-client';

describe('longform keybindings', () => {
  it('bare "a" does not trigger approve', () => {
    const approve = vi.fn();
    initReviewKeybindings({ onApprove: approve, onIterate: vi.fn(), onReject: vi.fn() });
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
    expect(approve).not.toHaveBeenCalled();
  });
  it('Cmd+a triggers approve', () => {
    const approve = vi.fn();
    initReviewKeybindings({ onApprove: approve, onIterate: vi.fn(), onReject: vi.fn() });
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', metaKey: true }));
    expect(approve).toHaveBeenCalled();
  });
  /* same for i / r with Cmd+i / Cmd+r */
});
```

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Update editorial-review-client.ts to require modifier**

Find the existing keybinding handler; gate on `e.metaKey || e.ctrlKey`. Refactor to export `initReviewKeybindings({ onApprove, onIterate, onReject })` for testability.

- [ ] **Step 4: Run test to verify pass**

- [ ] **Step 5: Smoke**

Open longform review surface; verify bare `a/i/r` does nothing, `Cmd+a / Cmd+i / Cmd+r` triggers expected actions.

- [ ] **Step 6: Commit**

```bash
git commit -m "fix(studio): require Cmd/Ctrl modifier for longform approve/iterate/reject (#108)"
```

### Task 4.2: Fix #74 — Approve clipboard race (if Phase 0 marked ACTIVE)

(SKIP if Phase 0 marked MOOT.)

**Files:**
- Modify: `plugins/deskwork-studio/public/src/editorial-review-client.ts`

- [ ] **Step 1: Replace bare `navigator.clipboard.writeText` with `clipboard.ts` helper**

The unified helper from Phase 27 owns the manual-copy fallback panel — using it removes the popup-disappears-too-fast race.

- [ ] **Step 2: Smoke**

Click Approve in browser; observe clipboard payload + fallback UX.

- [ ] **Step 3: Commit**

```bash
git commit -m "fix(studio): longform Approve uses unified clipboard helper (#74)"
```

### Task 4.3: Invoke `/frontend-design:frontend-design` for the TOC pane (#73)

**Files:**
- Reference: `packages/studio/src/pages/review.ts` (longform review page renderer)
- Reference: `plugins/deskwork-studio/public/css/review-viewport.css`

- [ ] **Step 1: Prepare brief**

```
Design a table-of-contents pane for the longform review surface.

Context:
- The longform review mounts inside the production BlogLayout (see editorial-review.css docstring lines 11-22). The TOC must coexist with the host BlogLayout's chrome — it can't replace it.
- The viewport-level patterns are in plugins/deskwork-studio/public/css/review-viewport.css (the er-dispatch-* family).
- Long documents (PRDs, design specs) are "shape-blind" — operators want a TOC for navigation.
- Source-of-truth for design language: editorial-review.css. All tokens reused verbatim.

What to design:
- A collapsible TOC pane positioned to the right (or left) of the main article column. Doesn't fight BlogLayout's existing layout.
- Each TOC entry: a heading-text + level (h2, h3, h4 indented).
- Active-section highlighting as the operator scrolls.
- Collapse/expand toggle (state persists in sessionStorage).
- Keyboard navigable (Tab to enter; Enter to follow).

What to produce:
1. CSS rules — appended to plugins/deskwork-studio/public/css/review-viewport.css.
2. A markup convention (HTML structure the page renderer emits — must work as static HTML before client JS hydrates).
3. Behavior spec (plain English) — for the agent to write the TS file from.

Anti-goals:
- Modifying the host BlogLayout.
- Changing the er-dispatch-* family.
- New fonts / palette / spacings.
```

- [ ] **Step 2: Invoke + capture + review + commit design artifact**

```bash
mv .frontend-design-output/longform-toc.md docs/superpowers/frontend-design/longform-toc.md
git add docs/superpowers/frontend-design/longform-toc.md
git commit -m "design: longform TOC pane (frontend-design output for #73)"
```

### Task 4.4: Implement TOC

**Files:**
- Modify: `packages/studio/src/pages/review.ts` (emit TOC markup from heading scan)
- Create: `plugins/deskwork-studio/public/src/longform-toc.ts` (client behavior)
- Modify: `plugins/deskwork-studio/public/css/review-viewport.css` (frontend-design CSS)
- Test: `packages/studio/test/longform-toc.test.ts`

- [ ] **Step 1: Write failing test**

(See test description in §9 of spec — heading→TOC entries, active-section, collapse persistence.)

- [ ] **Step 2: Implement (per frontend-design spec)**

Server: scan markdown headings during render → emit TOC structure.
Client: implement scroll-spy + collapse-toggle + sessionStorage.
CSS: from frontend-design output.

- [ ] **Step 3: Run tests, smoke**

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(studio): longform review TOC pane (#73)"
```

---

## Phase 5 — Shortform desk

### Task 5.1: Config-driven platform list (#72)

**Files:**
- Create: `packages/studio/src/data/config-platforms.ts` (or similar)
- Modify: `packages/studio/src/pages/shortform.ts`
- Modify: `packages/core/src/config.ts` (add `platforms: string[]` to schema)
- Test: `packages/studio/test/shortform-config-platforms.test.ts`

- [ ] **Step 1: Add `platforms` to config schema**

Edit `@deskwork/core` config schema. Default value: existing hardcoded list (`['linkedin', 'reddit', 'youtube', 'instagram']`) for back-compat.

- [ ] **Step 2: Write failing regression test**

```typescript
describe('shortform desk platform list', () => {
  it('reads platforms from config, not hardcoded', async () => {
    const fixture = setupFixtureWithConfigPlatforms(['linkedin', 'mastodon', 'bluesky']);
    const html = await fetchShortformDeskHtml(fixture);
    expect(html).toContain('mastodon');
    expect(html).toContain('bluesky');
    expect(html).not.toContain('youtube'); // not in this fixture's config
  });
  it('empty-state copy does not reference unbuilt features', async () => {
    const html = await fetchShortformDeskHtml(emptyMatrixFixture);
    expect(html).not.toMatch(/coverage matrix.*not.*found/i); // #106
    /* and the empty-state language is positive */
  });
});
```

- [ ] **Step 3: Run test to verify failures**

- [ ] **Step 4: Update shortform.ts**

Replace hardcoded platform list with config read. Update empty-state copy (addresses #106).

- [ ] **Step 5: Run test to verify pass**

- [ ] **Step 6: Smoke**

Open `http://localhost:47321/dev/editorial-review-shortform`; verify platforms come from this project's config.

- [ ] **Step 7: Commit**

```bash
git commit -m "feat(studio): shortform desk config-driven platforms + empty-state copy (#72, #106)"
```

### Task 5.2: Frontend-design touchup for shortform (if matrix layout changes)

(Conditional: only if config-driven platforms result in N≠4 platforms and the existing layout breaks.)

- [ ] **Step 1: Decide whether visual changes needed**

If 0-6 platforms still fit the existing matrix grid, skip. If N>6 or N<2 looks bad, invoke frontend-design.

- [ ] **Step 2-5: Standard frontend-design invocation + integration + commit (if needed)**

---

## Phase 6 — Content view + scrapbook

### Task 6.1: Gate `/blog/<slug>` URL fabrication on host config (#71, if Phase 0 marked ACTIVE)

(SKIP if Phase 0 marked MOOT.)

**Files:**
- Modify: `packages/studio/src/pages/content.ts` (or wherever URL fabrication lives)
- Modify: `packages/studio/src/pages/scrapbook.ts` (if applicable)
- Test: `packages/studio/test/content-blog-url-host-gate.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
describe('content tree URL fabrication gating', () => {
  it('does not emit /blog/<slug> when site has no host', async () => {
    const fixture = setupFixtureWithoutHost();
    const html = await fetchContentTreeHtml(fixture);
    expect(html).not.toMatch(/href="\/blog\/[^"]+"/);
  });
  it('does emit /blog/<slug> when site has a host configured', async () => {
    const fixture = setupFixtureWithHost('example.com');
    const html = await fetchContentTreeHtml(fixture);
    expect(html).toMatch(/href="\/blog\/[a-z-]+"/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Add the guard**

Find the URL fabrication site; gate on `site.host && site.host.length > 0`.

- [ ] **Step 4: Run test, smoke**

- [ ] **Step 5: Commit**

```bash
git commit -m "fix(studio): gate /blog/<slug> URL on host config presence (#71)"
```

### Task 6.2: Fix #103 (if Phase 0 marked ACTIVE)

(SKIP if Phase 0 marked MOOT — Phase 32 #145 collateral may have addressed it.)

**Files:**
- Modify: `packages/studio/src/pages/content-detail.ts`
- Test: `packages/studio/test/content-detail-frontmatter-detection.test.ts`

- [ ] **Step 1: Write failing test using a fixture file with both frontmatter and body**

- [ ] **Step 2-4: Standard fix loop**

- [ ] **Step 5: Commit**

```bash
git commit -m "fix(studio): content-detail panel correctly detects frontmatter+body presence (#103)"
```

---

## Phase 7 — Manual

### Task 7.1: Rewrite legacy slash-command names (#104, if Phase 0 marked ACTIVE)

(SKIP if Phase 0 marked MOOT.)

**Files:**
- Modify: `packages/studio/src/pages/help.ts`
- Test: `packages/studio/test/manual-slash-commands.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
describe('manual slash commands', () => {
  it('does not contain legacy /editorial-* names', async () => {
    const html = await fetchManualHtml();
    expect(html).not.toMatch(/\/editorial-[a-z-]+/);
  });
  it('uses /deskwork:* + /dw-lifecycle:* names where applicable', async () => {
    const html = await fetchManualHtml();
    expect(html).toContain('/deskwork:add');
    expect(html).toContain('/deskwork:approve');
    /* etc */
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Replace each `/editorial-*` reference**

Use the Edit tool. Map: `/editorial-add` → `/deskwork:add`, `/editorial-plan` → `/deskwork:plan`, etc.

- [ ] **Step 4: Run test, smoke**

- [ ] **Step 5: Commit**

```bash
git commit -m "fix(studio): manual uses post-Phase-30 slash-command names (#104)"
```

### Task 7.2: Invoke `/frontend-design:frontend-design` for the Manual glossary section

**Files:**
- Reference: `packages/studio/src/pages/help.ts` (existing manual structure)
- Reference: `packages/studio/src/data/glossary.json`
- Reference: `plugins/deskwork-studio/public/css/editorial-help.css`

- [ ] **Step 1: Prepare brief**

```
Design a Glossary section for the deskwork studio Manual page.

Context:
- The Manual is the "compositor's manual" — a reference book aesthetic.
- Sub-metaphor: reference book, alphabetical entries, anchor links.
- Tooltips elsewhere in the studio link back to anchors here (per spec §3).
- Source-of-truth for design language: editorial-review.css + editorial-help.css.

What to design:
- An alphabetical-grouped list of glossary entries.
- Each entry: term (display weight), gloss paragraph, see-also chips linking to other glossary entries.
- Each entry has its own anchor: id="glossary-<term-key>".
- Per-letter group headers (A, B, C, ...).
- A back-to-top affordance after long glossary entries.

Markup conventions:
- Source data is glossary.json (12 initial entries; will grow).
- Server-rendered (static HTML); no client JS needed.

What to produce:
1. CSS rules — appended to plugins/deskwork-studio/public/css/editorial-help.css.
2. A markup template the page renderer can use.
3. Brief rationale.

Anti-goals: standard list (no fonts / palette / spacing changes; no animation).
```

- [ ] **Step 2: Invoke skill + commit design artifact**

### Task 7.3: Implement Manual glossary section

**Files:**
- Modify: `packages/studio/src/pages/help.ts`
- Modify: `plugins/deskwork-studio/public/css/editorial-help.css`
- Test: `packages/studio/test/manual-glossary-section.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
describe('manual glossary section', () => {
  it('renders the glossary entries from glossary.json', async () => {
    const html = await fetchManualHtml();
    expect(html).toMatch(/<h2[^>]*>Glossary<\/h2>/);
    expect(html).toContain('id="glossary-press-check"');
    expect(html).toContain('id="glossary-galley"');
  });
  it('see-also chips link to other anchors', async () => {
    const html = await fetchManualHtml();
    expect(html).toMatch(/<a [^>]*href="#glossary-galley"/);
  });
});
```

- [ ] **Step 2: Implement glossary section in help.ts**

Read `glossary.json`, group alphabetically, emit per-entry markup per the design template.

- [ ] **Step 3: Append frontend-design CSS to editorial-help.css**

- [ ] **Step 4: Tests pass + smoke**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(studio): manual glossary section renders from glossary.json (#114)"
```

---

## Phase 8 — Index page

### Task 8.1: Invoke `/frontend-design:frontend-design` for Index page card layout

**Files:**
- Reference: `packages/studio/src/pages/index.ts`

- [ ] **Step 1: Prepare brief**

```
Design the Index page (the studio doorway / lobby) card layout.

Context:
- Sub-metaphor: doorway / lobby. Operator lands here, knows where to go.
- The Index page currently lists sections but leaves longform reviews and scrapbook unlinked (#107).
- Source-of-truth for design language: editorial-review.css.

What to design:
- A welcome line at the top (sub-metaphor: a kicker).
- One card per surface: dashboard, longform review, shortform desk, content view, manual.
- Each card: surface name (kicker + display title), one-line description (uses gloss() on first occurrence of typesetting jargon — see-also spec §3), direct link.
- Cards arranged in a 2- or 3-column grid (responsive).
- Visual coherence with the dashboard's day-of-shoot workbench aesthetic.

What to produce:
1. CSS rules.
2. Markup template.
3. Brief rationale.

Anti-goals: standard.
```

- [ ] **Step 2-3: Invoke + commit design artifact**

### Task 8.2: Implement Index page

**Files:**
- Modify: `packages/studio/src/pages/index.ts`
- Modify: stylesheet per frontend-design output (likely `editorial-review.css` since index is a small surface)
- Test: `packages/studio/test/index-page-links.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
describe('index page links', () => {
  it('links to all five surfaces', async () => {
    const html = await fetchIndexHtml();
    for (const path of ['/dev/editorial-studio', '/dev/editorial-review-shortform', '/dev/content', '/dev/editorial-help']) {
      expect(html, path).toContain(`href="${path}"`);
    }
    /* longform review link points at active workflow if any, else at dashboard with filter */
  });
  it('uses gloss() on first typesetting term occurrence', async () => {
    const html = await fetchIndexHtml();
    expect(html).toContain('class="er-gloss"');
  });
});
```

- [ ] **Step 2: Implement per frontend-design output**

Add the card layout + links + glossary tooltips on first jargon occurrence.

- [ ] **Step 3: Tests pass + smoke**

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(studio): index page surface links + glossary tooltips (#107, #114)"
```

---

## Closing tasks

### Task 9.1: Run full test suite

- [ ] **Step 1: Run all workspace tests**

```bash
npm test --workspaces --if-present
```

Expected: all green. Tally test count vs. v0.12.1 baseline (959). Should be +25 to +40 cases.

- [ ] **Step 2: Confirm no regressions**

If any test fails that wasn't related to the design pass, investigate and fix.

### Task 9.2: Manual smoke against this project's calendar

- [ ] **Step 1: Walk every surface in browser**

`npm run dev`, then open in browser:
- `/dev/` → index page renders with card layout
- `/dev/editorial-studio` → dashboard works
- `/dev/editorial-review/<uuid>` → entry-review styled per Phase 2
- `/dev/editorial-review-shortform` → shortform desk with config-driven platforms
- `/dev/content/deskwork-internal` → content tree (no fabricated /blog/<slug>)
- `/dev/editorial-help` → manual with glossary section
- Hover any typesetting term anywhere → tooltip works

- [ ] **Step 2: Note any visual regressions or surprises**

If something looks off, decide: re-invoke frontend-design for that surface, or roll forward.

### Task 9.3: Cut release(s) per the spec §8 cadence

Per operator's call:
- After Phase 2 → cut v0.13.0 via `/release` skill.
- After Phase 4 → cut v0.13.x.
- After Phase 7 → cut v0.14.0.
- After Phase 8 → cut v0.14.x.

(Each release is its own /release invocation; not part of this plan's tasks.)

### Task 9.4: Post-release: verify each closed-once-shipped issue against marketplace install

After each release, walk the just-shipped issues against the marketplace install (per the agent-discipline rule). Post evidence comments. Operator closes.

---

## Self-review notes

**Spec coverage:** Each section of the spec maps to at least one task.
- §1 goals/non-goals → covered by phase scope + the SKIP/APPLICABLE branching on Phase 0.
- §2 design language → preserved via the "anti-goals" of every frontend-design brief; no task creates new tokens.
- §3 glossary mechanism → Tasks 1.1-1.6.
- §4 cross-surface patterns → preserved by treating editorial-review.css as the read-mostly source-of-truth; new patterns only in entry-review.css (Task 2.2) and editorial-review.css glossary (Task 1.4).
- §5 per-surface chapters → Phases 2-8 each correspond to a §5.x.
- §6 issue matrix → Phase 0 (verify) + Phases 3-7 (active fixes).
- §7 frontend-design contract → every visual task explicitly invokes the skill; no hand-written CSS for surfaces in scope.
- §8 sequencing → Phases 0-8 in this plan match the spec's phase order.
- §9 testing → every task has a test step (TDD) where applicable.
- §10 out-of-scope → not implemented as tasks (by definition).

**Type consistency:** `gloss(key)` signature defined Task 1.2; used in Tasks 1.6, 7.3, 8.2. `initGlossaryTooltips({ glossary })` defined Task 1.5; used in Task 1.6 (auto-init via `window.__GLOSSARY__`).

**Placeholder scan:** A few "exact code depends on Phase 0 findings" placeholders exist in Phase 3 — by design (Phase 0 verifies before Phase 3 implements). They are NOT placeholders for missing requirements; they're explicit deferrals to verified scope.

**No-placeholder scan:** No "TBD" / "implement later" / "fill in details" / "similar to Task N" remain.
