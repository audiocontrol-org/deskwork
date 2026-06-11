---
id: TASK-37
title: 'Phase 11: Graphical entries — image review surface + iteration paths'
status: To Do
assignee: []
created_date: '2026-06-10 19:31'
labels:
  - 'type:imported-issue'
  - enhancement
dependencies: []
references:
  - gh-312
ordinal: 37000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Deliverable:** Chrome-free image review surface; region-anchored marginalia (raster) + element-anchored marginalia (SVG); iterate skill prose enumerates the four image-iteration paths.

### Task 11.1: Chrome-free image rendering

- [ ] Step 11.1.1: Studio review-surface routing: when `artifactKind === 'image'`, render the artifact in an `<img>` wrapper (raster) or inline SVG (vector).
- [ ] Step 11.1.2: Marginalia overlay sits on top of the image; pin click captures coordinates in image-natural-space (not viewport-space) so anchors survive resize.
- [ ] Step 11.1.3: Zoom + pan controls for large images (per the picked Phase 9 mockup direction).

### Task 11.2: Region-anchored marginalia (raster)

- [ ] Step 11.2.1: Per Phase 1's library decision (likely Annotorious-class), wire the chosen image-annotation library into the studio review surface.
- [ ] Step 11.2.2: Anchor records: pixel coordinates (x, y in image-natural-space); optional region (rectangle / polygon / freehand) per the library's capability.
- [ ] Step 11.2.3: Resizing the image in-browser doesn't move pins (anchors stay in image-natural-space).

### Task 11.3: Element-anchored marginalia (SVG)

- [ ] Step 11.3.1: For SVG entries, anchors use element-selector (SVG's element id, class, or generated path); falls back to pixel coordinates if the selector doesn't resolve.
- [ ] Step 11.3.2: Resolver: try selector first; fall back to pixel coordinates with a "stale anchor" warning (same shape as Phase 10's HTML resolver).

### Task 11.4: Iterate skill — four image-iteration paths

- [ ] Step 11.4.1: Update `/deskwork:iterate` skill prose to enumerate the four paths:
  - **Agent-driven regeneration** for generation-pipeline images (Midjourney, Stable Diffusion, DALL·E) — agent reads marginalia, regenerates with updated prompt, replaces file.
  - **Agent-driven programmatic transformation** for crops / annotations / composites — agent runs ImageMagick / sharp / custom script per the comment.
  - **SVG edits** — agent edits SVG source directly via element-selector anchors.
  - **Operator-supplied replacement** — operator drops a new image file at `artifactPath`; iterate appends as the next revision.
- [ ] Step 11.4.2: Skill prose asks the agent to pick the path matching the comments + available tooling; if none apply, report back to operator with comments unaddressed.
- [ ] Step 11.4.3: Revision history captures the prior image bytes in the journal per `DESKWORK-STATE-MACHINE.md` § Versions and revisions; the new file replaces the old at `artifactPath`.

### Task 11.5: Per-project iteration handlers

- [ ] Step 11.5.1: Support `<projectRoot>/.deskwork/iterate-handlers/<artifactKind>.ts` per PRD § Graphical entries.
- [ ] Step 11.5.2: Handler signature: `(marginalia, entryContext) => Promise<{ newContent: Buffer; metadata?: Record<string, unknown> }>`.
- [ ] Step 11.5.3: Discovery uses the same override-resolver pattern as templates and doctor rules (Phase 2's machinery).
- [ ] Step 11.5.4: Iterate skill prose explains when the agent uses the handler vs. its own judgment.

### Task 11.6: Doctor rule — image-locked-stage drift

- [ ] Step 11.6.1: `image-locked-stage` rule: an image entry is in a `lockedStages` stage but has been iterated since reaching it → surface the iterate journal entries for manual review per PRD § Doctor rules.
- [ ] Step 11.6.2: Repair flow: operator reviews the drift and decides (induct backward + re-iterate properly, or fold the drift into the revision history).

### Task 11.7: Manual dogfood

- [ ] Step 11.7.1: Ingest one of the project's existing `docs/studio-design/` mockups as a `visual`-lane entry; iterate it; approve it.
- [ ] Step 11.7.2: Ingest a screenshot (e.g., one from the dogfood TF log); iterate via operator-supplied replacement.
- [ ] Step 11.7.3: Capture a screenshot of a pathological state from one of the spike fixtures; attach to a comment; verify both versions persist.
- [ ] Step 11.7.4: Log any friction surfaces as new TF entries.

### Task 11.8: Integration test

- [ ] Step 11.8.1: Tmp-fixture with one PNG entry + one SVG entry; pin comments on each; iterate via operator-supplied replacement (PNG) and SVG edit (SVG); verify revision history captures prior bytes; doctor surfaces no anchor warnings.

**Acceptance Criteria:**

- [ ] Image entries (PNG / JPG / SVG) render chrome-free with marginalia overlay.
- [ ] Anchors stay correct across resize (raster) and survive element-selector edits with fallback (SVG).
- [ ] Iterate skill enumerates 4 image-iteration paths; agent picks the right one per the comments + tooling.
- [ ] Per-project iteration handlers load via override-resolver.
- [ ] Doctor surfaces image-locked-stage drift.
- [ ] Manual dogfood successfully exercises ingest + iterate + approve on at least one existing `docs/studio-design/` mockup.

Part of #301.
<!-- SECTION:DESCRIPTION:END -->
