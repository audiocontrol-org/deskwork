---
proposal: Multi-lane editorial dashboard — Direction 3 Press Bay (v11)
status: ACCEPTED
date: 2026-05-27
commit: 2102f4e
feature: docs/1.0/001-IN-PROGRESS/graphical-entries/
visual: ../../../../mockups/2026-05-27-multi-lane-dashboard/direction-3-press-bay.html
---

# Multi-lane editorial dashboard — Direction 3 "Press Bay" (v11)

## What

The accepted direction for the multi-lane dashboard's primary surface. Stacked horizontal **swimlanes** (one per lane) in a press-bay shell on desktop; vertical **lane-stack** of accordion sections on mobile. Lanes are independently:

- **Visible** (left rail eye-toggle — persistent state) vs. **focused** (focus-chip strip — transient filter).
- **Expanded** or **collapsed at the lane level** (chevron in swim-head / lane-head; collapsed lanes render only their swim-head + a compact per-stage count strip).
- **Per-stage collapsed** (chevron in each stage-head; collapsed columns shrink to a narrow vertical strip with the stage name rotated 90°; remaining columns redistribute via flex).
- **Kanban or list view** per-lane (segmented `▦` / `≡` toggle in the swim-head). Defaults are **viewport-aware**: desktop kanban, mobile list (list preserves the linear stage sequence top-to-bottom, which the wrapped tile-row would otherwise obscure).
- **Compose-enabled** via a per-lane `+ new` chip in the swim-head / lane-head — clicking clipboard-copies a partial `/deskwork:add <SLUG> --lane <id> --stage <first-linear>` so the operator pastes in chat, fills the slug, hits return. No form fields, no popover, no bottom sheet.

The mobile kanban tile view, when chosen, is the v0.19 single-column collapsible-stage-tile pattern (per `DESIGN-STANDARDS.md § Collapsible stage tiles`), NOT a wrapped 2-column grid — the wrap was retired in v6 as ambiguous about pipeline order.

The Mockups lane in the mockup is filtered out via a compact stub button; clicking the stub restores it to focus, at which point its `+ new` chip becomes available again. This demonstrates the focus-filter + lane-rail interplay without rendering an inactive fourth swimlane.

## Why accepted

The operator picked D3 out of three directions on 2026-05-27 (D1 Lane Stack and D2 Lane Bar are filed in REJECTED for the same date). The press-bay metaphor — horizontal swimlanes as press galleys, the masthead as the bay's identity bar — comports with the project's existing press-check editorial aesthetic (Newsreader italic + JetBrains Mono + paper tones + red-pencil/proof-blue/stamp-green/kraft accents from `DESIGN-STANDARDS.md`).

The direction survived eleven iteration rounds in which the operator surfaced every load-bearing requirement explicitly:

- **v2**: lane filtering (focus-chip strip + persistent visibility rail).
- **v3**: collapsible lanes.
- **v4**: per-lane kanban ↔ list toggle.
- **v5/v6**: list view available on mobile too; mobile list as default; mobile kanban as the v0.19 single-column stack (not a wrap).
- **v7**: per-stage collapse affordances inside an expanded lane.
- **v8**: WCAG 2.2 SC 2.5.8 AA-compliant chevron hit targets (≥24×24).
- **v9**: full accessibility pass across every affordance (role, tabindex, aria-expanded, aria-label, focus-visible rings; contrast bumps where slim).
- **v10**: Compose flow attempted as a multi-field Compose Card with lane picker + slug input + stage picker + live `/deskwork:add` command preview.
- **v11 (ACCEPTED)**: form retired; per-lane `+ new` chip pattern replaces both the v9 floating FAB and the v10 dialog. *Operator framing: "filling in forms sux. it's like going to the dmv."* Lane selection becomes implicit (you click the chip on the lane you want); slug entry happens in the chat editor — where the operator already is — after pasting the partial command. Chip flashes green with "✓ Copied — paste in chat" for ~2s, then reverts. THESIS Consequence 2 is honored throughout: studio doesn't mutate state; the slash-command IS the action; the chip just primes the command on the clipboard.

The v11 chip pattern is also a clean application of `.claude/rules/affordance-placement.md` — the compose affordance lives ON the component it acts on (the lane), not in a global toolbar. Same shape as the outline-tab / marginalia-tab precedents in the entry-review surface.

## When

Locked 2026-05-27 at commit `2102f4e`. D3 Press Bay v11 is the accepted spec for the multi-lane dashboard. Implementation (Phase 5 Tasks 5.1+) translates this mockup into production studio markup + CSS + minimal client TS, mirrors the same affordances + states, and verifies via the dual-viewport UI Verification Protocol.

## Feature reference

`docs/1.0/001-IN-PROGRESS/graphical-entries/` — the workplan is in `workplan.md`; PRD in `prd.md`.

## Visual

The canonical mockup is at [`mockups/2026-05-27-multi-lane-dashboard/direction-3-press-bay.html`](../../../../mockups/2026-05-27-multi-lane-dashboard/direction-3-press-bay.html). Single source of truth — never copied into this directory (per `.claude/rules/design-standards.md`).

Screenshot (1800×1200 desktop frame + 390×844 mobile frame) is committed alongside the mockup at `snap-03-press-bay.png`.

## Implementation notes (forward-looking)

Carry the following directly into Phase 5 implementation; these are spec consequences, not new design questions:

- **Lane visibility state lives on a per-operator profile, not in the lane config on disk.** Lane configs are shared; visibility/focus state is each operator's view of the shared model.
- **Per-stage collapse state persists per-lane-per-operator** (same reasoning). Collapsed columns redistribute remaining flex space; this is a CSS-only concern (no JS reflow logic needed).
- **The `+ new` chip's clipboard payload is the partial command with `<SLUG>` as the literal placeholder text.** The operator finishes the slug in chat. The chip MUST NOT prompt for the slug, render an input field, open a sheet, or otherwise re-introduce the form. (If a future ask wants a slug input, that's a new design decision and a new brief.)
- **Mobile chip is icon-only (`+`) in default state and expands to "Copied — paste in chat" in the copied state.** aria-label carries the full action label for screen-reader users (per `.claude/rules/ui-verification.md`'s falsifiable-claim discipline — the implementation must hit the labels in the mockup).
- **The view-toggle is per-lane segmented and viewport-aware in its default**, but the operator's per-lane choice persists once set (per-operator). When a lane is collapsed at the lane level, the view-toggle greys out (collapse precedence — there's no body to render either view of).
- **The Mockups stub is rendered only when the lane is FOCUSED-OUT, not when it's VISIBILITY-OFF.** Visibility-off lanes don't render anything (they're hidden in the chip strip too); focus-off lanes show the stub so the operator can see what's hidden by the current focus filter and click to restore.
