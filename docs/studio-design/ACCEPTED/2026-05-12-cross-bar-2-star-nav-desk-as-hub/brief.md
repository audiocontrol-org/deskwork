---
proposal: Cross-bar 2 v7 — star nav with Desk as hub, universal ←/⋮ masthead
status: ACCEPTED
date: 2026-05-12
feature: docs/0.19.0/001-IN-PROGRESS/studio-mobile-first/
visual: ../../../../plugins/deskwork-studio/public/mockups/cross-bar-2-refined-v7-masthead-fixes.html
---

# Cross-bar 2 v7 — star nav with Desk as hub, universal ←/⋮ masthead

## What

A *star navigation* architecture for the deskwork studio. The Desk (`/dev/editorial-studio`) is the hub; every other surface is a leaf reached *by navigating from the Desk*. There is no bar nav region; there is no top-level tab bar; there is no destination picker. Every non-Desk surface carries two universal masthead affordances: `←` (leftmost, italic-display proof-blue, navigates to Desk) and `⋮` (rightmost, mono ink-soft, opens a popover anchored under the glyph with cross-cutting menu items — Manual, Keyboard shortcuts, Configure placeholder, File an issue, About). The Desk absorbs every reachable destination as a section/tile in its information architecture.

## Why accepted

Seven mockup passes (cross-bar 2 v1→v7) converged on this shape. Each step traded surface-chrome complexity for hub-page complexity, yielding a clearer mental model. v4 was the conceptual breakthrough — *"we might be able to get away with just a link to the desk, since there's a link to the shortform workflow from the desk (or, there should be). That makes the Desk the hub of all activity—the home base—which I think makes sense."* The architecture lets the bar's job become unambiguous ("do work on this surface") and gives the masthead the navigation job ("where am I + cross-cutting actions"). v7's chrome refinements (`align-items: center` so the border doesn't strikethrough the glyphs; popover-not-sheet for the masthead `⋮` so top-anchored triggers reveal from the top) close out the alignment and reveal-pattern issues v6 had.

The companion `desk-states-v7` mockup confirms the architecture holds across nine contexts — the bar's 1-6 contextual cell cap accommodates every known surface (entry-review review-mode at 5; shortform review at 6; dashboard at 0 [bar absent on Desk]; manual at 0 [no bar at all]).

## When

Architecture documented in `DESIGN-STANDARDS.md` § Studio navigation model + § Desk information architecture (commit pending in same workflow as this archive entry). Implementation: workplan Task 2.2 Steps 2.2.5–2.2.10 (commits forthcoming).

## Feature reference

`docs/0.19.0/001-IN-PROGRESS/studio-mobile-first/` — Phase 2 Task 2.2, re-scoped from "Shortform mobile-first" to "v7 cross-cutting architecture" during the 2026-05-12 mockup session.
