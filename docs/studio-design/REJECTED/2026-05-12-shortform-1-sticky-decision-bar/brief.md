---
proposal: Shortform 1 — Sticky decision bar (surface-bespoke bottom chrome)
status: REJECTED
date: 2026-05-12
feature: docs/0.19.0/001-IN-PROGRESS/studio-mobile-first/
visual: ./mockup.html
---

# Shortform 1 — Sticky decision bar (surface-bespoke bottom chrome)

## What

A 52px sticky bottom bar carrying Iterate / Approve / Cancel as three color-coded pills (proof-blue / stamp-green / red-pencil), rendered as bespoke chrome on the shortform review surface. The top strip becomes a platform-context banner (platform · channel · slug). Article body owns the middle of the screen; bar is always visible regardless of scroll position. Each pill tap clipboard-copies the matching `/deskwork:<verb>`.

## Why rejected

Superseded by the v7 settlement that the contextual bar is **universal** — `renderMobileBar` is the same primitive on every non-Desk mobile surface, with a 1–6 cell `Cell[]` as the per-surface design variable. *"Sticky decision bar"* is a bespoke chrome shape; v7 retired bespoke per-surface bar shapes in favor of one universal primitive consuming surface-specific cells.

The proposal's strengths (one-tap to act; platform/channel inline in masthead) translate forward: cells passed to the universal bar can be `{kind:'direct',action:'copy:/deskwork:iterate'}` etc., and platform/channel inline lives in the masthead's `metaInline` slot. None of the goals are lost — the only thing lost is the bespoke chrome, which is what was actually retired.

The mockup predates the v1→v7 cross-bar arc (which itself only settled with v7 on 2026-05-12). At the time it was drafted, the assumption was that each surface would draft its own bar idiom; v7 inverted that assumption.

## When

Drafted 2026-05-12 in Step 2.2.2 of `studio-mobile-first`; superseded the same week by the v1→v7 cross-bar arc settling on a universal bar contract; explicitly archived 2026-05-13 alongside the `§ Universal bar contract` section in `DESIGN-STANDARDS.md` after the workplan's stale "Pick Shortform-1/2/3 idiom" sub-step relitigated the decision during a `/dw-lifecycle:implement` invocation.

## Feature reference

`docs/0.19.0/001-IN-PROGRESS/studio-mobile-first/` — Phase 2 Task 2.2; the v7 ACCEPTED entry that superseded this proposal is `docs/studio-design/ACCEPTED/2026-05-12-cross-bar-2-star-nav-desk-as-hub/`.
