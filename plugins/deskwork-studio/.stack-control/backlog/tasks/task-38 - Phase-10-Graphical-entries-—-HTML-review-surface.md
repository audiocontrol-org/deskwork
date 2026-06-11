---
id: TASK-38
title: 'Phase 10: Graphical entries — HTML review surface'
status: To Do
assignee: []
created_date: '2026-06-10 19:31'
labels:
  - 'type:imported-issue'
  - enhancement
dependencies: []
references:
  - gh-311
ordinal: 38000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Deliverable:** Iframe-based chrome-free rendering for `html-mockup` + `single-file-html`; DOM-anchored + coordinate-pinned spatial comments; thread expansion; screenshot attachment workflow; iterate against HTML mockups.

### Task 10.1: Chrome-free iframe rendering

- [ ] Step 10.1.1: Studio review-surface routing: when `artifactKind in ['html-mockup', 'single-file-html']`, render the artifact in an iframe instead of the markdown editor.
- [ ] Step 10.1.2: Iframe loads `index.html` directly (for `html-mockup` directory case) or the loose `<slug>.html` (for `single-file-html` case) with no wrapper styling — the mockup's own CSS governs the rendered surface entirely.
- [ ] Step 10.1.3: Asset routing: sibling `*.css`, `*.js`, `*.png`, etc. under the mockup's directory are served via the studio's existing asset path (or a new graphical-asset path if needed); broken-image / 404 cases surface inline.
- [ ] Step 10.1.4: Verb bar (Iterate / Approve / Cancel) + comment-thread sidebar dock to the edges via the picked-mockup overlay design.

### Task 10.2: DOM-anchored spatial comments

- [ ] Step 10.2.1: Per Phase 1's library decision, integrate the chosen DOM-annotation library against the iframe; communicate marginalia events from inside the iframe to the parent studio surface.
- [ ] Step 10.2.2: Comment anchor records: DOM selector (CSS path), pixel offset (x/y within the element), text-snippet fallback (the visible text near the pin, for resolver recovery).
- [ ] Step 10.2.3: Resolver: try selector first; if missing or text mismatch, try text-snippet match; if still missing, fall back to pixel coordinates with a "stale anchor" warning surfaced inline.
- [ ] Step 10.2.4: Operator can click anywhere on the iframe surface to drop a new pin; the resolver captures all three anchor components.

### Task 10.3: Thread expansion (per Phase 9 mockup pick)

- [ ] Step 10.3.1: Wire the picked thread-expansion direction (inline-on-pin / sidebar-grouped / hybrid) from Phase 9 into the live surface.
- [ ] Step 10.3.2: Thread navigation: jump-to-next-unaddressed; filter by category; permalink scroll per PRD § Implied scope.

### Task 10.4: Screenshot attachment workflow

- [ ] Step 10.4.1: Wire Phase 8's screenshot capture against the iframe (capture renders the iframe's contents, not the studio chrome).
- [ ] Step 10.4.2: Capture flow per Phase 9 mockup: region-select (selection rectangle drawn on the iframe overlay) or full-frame.
- [ ] Step 10.4.3: Attach captured screenshot to a comment / reply per Phase 8's workflow.

### Task 10.5: Iterate against HTML mockups

- [ ] Step 10.5.1: Update `/deskwork:iterate` skill prose to enumerate the HTML-mockup case: agent reads each marginalia anchor (selector + offset + text-snippet + comment text + thread context), resolves against live DOM, identifies the most plausible element, edits HTML / CSS / JS to address the comment.
- [ ] Step 10.5.2: For sibling asset edits (replacing a `*.png`, modifying a `*.css`), the agent operates on the file via Edit / Write tools — same operator-recognizable shape as markdown iterate.
- [ ] Step 10.5.3: Disposition recording follows Phase 8's required-`reason` rule; the diff-slice expansion on "addressed" badge shows the HTML / CSS diff intersecting the comment's selector region.

### Task 10.6: Marginalia anchor resilience

- [ ] Step 10.6.1: Doctor rule: scan an entry's annotations; resolve each anchor against the current artifact; surface unresolved anchors as warnings (per PRD § Risks mitigation).
- [ ] Step 10.6.2: Studio: stale-anchor pins render with distinct chrome ("⚠ this anchor's selector no longer resolves; falling back to text-snippet").

### Task 10.7: Integration test

- [ ] Step 10.7.1: Build a fixture `html-mockup` entry under a tmp-fixture project with a small HTML / CSS / JS bundle.
- [ ] Step 10.7.2: Studio renders the iframe correctly; operator can pin a comment; iterate addresses it; revision history captures pre/post HTML state; doctor surfaces no unresolved anchors.
- [ ] Step 10.7.3: Stale-anchor regression: hand-edit the mockup to rename a class; assert resolver falls back through selector → text-snippet → pixel coordinates correctly; doctor warns on the unresolved selector.

**Acceptance Criteria:**

- [ ] `html-mockup` and `single-file-html` entries render in a chrome-free iframe; mockup's own CSS governs the surface.
- [ ] Comments anchor to DOM elements with resilient fallback (selector → text-snippet → pixel).
- [ ] Iterate edits HTML/CSS/JS to address marginalia; revision history captures pre/post state.
- [ ] Stale anchors surface inline with distinct chrome + doctor warning.

Part of #301.
<!-- SECTION:DESCRIPTION:END -->
