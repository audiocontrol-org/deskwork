---
id: TASK-39
title: >-
  Phase 9: `/frontend-design` pass for the graphical review surface + screenshot
  markup co-design
status: To Do
assignee: []
created_date: '2026-06-10 19:31'
labels:
  - 'type:imported-issue'
  - enhancement
dependencies: []
references:
  - gh-310
ordinal: 39000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Deliverable:** 2–3 operator-pickable mockup directions covering chrome-free render area, pin placement, thread expansion, screenshot capture affordance, screenshot attachment workflow, **and screenshot markup UI** (arrow / box / freehand / text-label / blur tools). Operator picks; gates Phase 10–12. **No implementation in this phase.**

### Task 9.1: Invoke `/frontend-design` for the chrome-free render area

- [ ] Step 9.1.1: Run `/frontend-design` (the `frontend-design:frontend-design` skill) with the design brief: chrome-free render area for HTML mockup (iframe) and image (`<img>`); collapsible verb bar; comment-thread sidebar that can collapse to a peek-line; full-bleed scale.
- [ ] Step 9.1.2: Honor `DESIGN-STANDARDS.md` § Rubber-stamp / mobile-row conventions per the project rule.
- [ ] Step 9.1.3: Honor the `affordance-placement.md` rule: per-component affordances (stow controls on the component, pull-tab on the edge it vanished into) — not toolbar-attached.

### Task 9.2: Pin placement + thread expansion direction

- [ ] Step 9.2.1: Mockup 2-3 directions for pin placement (where on the artifact the pin marker sits relative to the anchor region; how active vs inactive pins differ visually).
- [ ] Step 9.2.2: Mockup 2-3 directions for thread expansion: inline-on-pin (clicking a pin pops the thread next to the pin) vs sidebar-grouped (all threads listed in the sidebar; pin click highlights + scrolls sidebar) vs hybrid.
- [ ] Step 9.2.3: Mockup thread navigation when many threads exist (jump-to-next-unaddressed, filter by category, etc.).

### Task 9.3: Screenshot capture + attachment affordance

- [ ] Step 9.3.1: Mockup the capture entry-point: where the "capture screenshot" button lives (toolbar / per-comment / per-thread); region-select vs full-frame toggle.
- [ ] Step 9.3.2: Mockup the attachment workflow: capture → attach to existing comment (which comment is highlighted) vs capture → create new comment (which prompts for anchor).
- [ ] Step 9.3.3: Mockup the attachment surface on the comment itself: thumbnail strip below the comment text, click to expand full-size, marked vs original toggle.

### Task 9.4: Screenshot markup UI co-design

- [ ] Step 9.4.1: Mockup the markup editor: canvas-overlay invoked from the capture flow; tool palette (arrow / box / freehand / text-label / blur-region); undo / redo; save / cancel.
- [ ] Step 9.4.2: Tool affordance placement per the project's `affordance-placement.md` rule — on the editor surface, not in a global toolbar.
- [ ] Step 9.4.3: Mobile / touch consideration: markup tools work on touch screens (no hover-only interactions).

### Task 9.5: Disposition-trace affordance (per Phase 8) — visual design

- [ ] Step 9.5.1: Mockup the "addressed" badge → inline diff expansion (how the diff renders next to the comment; how the disposition `reason` is surfaced; how an empty-diff-slice case looks).
- [ ] Step 9.5.2: Mockup the badge → diff transition (animation, micro-interaction) so the operator's mental model of "click badge, see what changed" is reinforced.

### Task 9.6: Operator picks direction

- [ ] Step 9.6.1: Mockups land in `mockups/<date>-graphical-review/` (typically HTML/CSS standalone files); update `mockups/index.html` with a card per direction.
- [ ] Step 9.6.2: Operator reviews + picks; the pick + rationale lands at `docs/studio-design/ACCEPTED/<date>-graphical-review-design/brief.md` per the design-archive contract.
- [ ] Step 9.6.3: Rejected directions land at `docs/studio-design/REJECTED/<date>-graphical-review-<variant>/brief.md` with rationale per the design-archive contract; single-pass rejections still get an entry.
- [ ] Step 9.6.4: Update `DESIGN-STANDARDS.md` change log.

**Acceptance Criteria:**

- [ ] At least 2 mockup directions exist as self-contained HTML+CSS files in `mockups/<date>-graphical-review/`.
- [ ] Operator-picked direction is recorded in `docs/studio-design/ACCEPTED/<date>-graphical-review-design/brief.md`.
- [ ] Rejected directions have corresponding `REJECTED/` entries with rationale.
- [ ] No production code in `packages/` or `plugins/` modified — design-only phase.
- [ ] Phase 10 and Phase 11 implementation can translate the picked mockup directly (no further design ambiguity).

Part of #301.
<!-- SECTION:DESCRIPTION:END -->
