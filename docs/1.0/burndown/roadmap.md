---
slug: burndown-roadmap
date: 2026-05-29
kind: burndown-marching-orders
lane: roadmap
source: docs/1.0/001-IN-PROGRESS/hygiene/issue-closure-audit-2026-05-29.md
---

# Marching Orders — Roadmap

These are larger items that don't fit a single sprint or single feature lane. Each is a candidate for its own `/feature-define` → `/feature-setup` → workplan cycle. None are blockers for the existing in-flight features.

## Larger product / plugin work

| # | Title | Shape |
|---|---|---|
| [#86](https://github.com/audiocontrol-org/deskwork/issues/86) | Feature: Google Docs plugin | New plugin under `plugins/google-docs/`. Pulls docs into the deskwork content tree via Google Docs API; bidirectional sync. Couples to existing scrapbook-asset machinery. |
| [#87](https://github.com/audiocontrol-org/deskwork/issues/87) | Feature: Skinnable studio | Theme registry + per-collection skin override. Touches the entire studio CSS surface; design-driven. |
| [#82](https://github.com/audiocontrol-org/deskwork/issues/82) | Editable voice catalog | New skill + studio surface for voice-catalog CRUD. The current voice catalog is a flat directory of `.md` files; this issue asks for first-class CRUD. |
| [#85](https://github.com/audiocontrol-org/deskwork/issues/85) | Version diff view | Studio surface comparing two revisions of the same entry. Touches history-journal reader + diff render. |
| [#133](https://github.com/audiocontrol-org/deskwork/issues/133) | Phase 29: `/post-release:walk` + `/post-release:file-issues` playbook | Defers behind Phase 30 (shipped) + the dw-lifecycle customize-hooks seam (#136). Per the v2 design doc — pair of skills + structured playbook + findings-doc round-trip through deskwork. |
| [#227](https://github.com/audiocontrol-org/deskwork/issues/227) | Phase 11 — Tranche-organized burn-down of remaining open issues | Older meta-tracker; superseded by the 2026-05-29 audit. Could close as "audit fulfilled this work" |

## Sequencing notes

- **#133 unblocks once #136 ships** (per the dw-lifecycle marching orders). Phase 29 has been waiting on the customize-hooks seam since v0.11.x.
- **#86 is a clean standalone.** It doesn't depend on any in-flight work; could be picked up as a sprint by any agent.
- **#87 + #85 are design-heavy.** Each needs a `/frontend-design` pass before implementation.
- **#82 is the smallest** of this set — could be done as a single feature with PRD + workplan + ship.

## Closure recommendations

- **#227** is a strong candidate to close immediately: the 2026-05-29 audit closed 68 issues + categorized the remaining 110. The "tranche-organized burn-down" the issue describes is exactly what these marching orders deliver. Operator can close with a pointer to `docs/1.0/burndown/`.
