---
slug: burndown-graphical-entries
date: 2026-05-29
kind: burndown-marching-orders
lane: graphical-entries
source: docs/1.0/001-IN-PROGRESS/hygiene/issue-closure-audit-2026-05-29.md
---

# Marching Orders — graphical-entries

The graphical-entries feature lives at [`docs/1.0/001-IN-PROGRESS/graphical-entries/`](../001-IN-PROGRESS/graphical-entries/). It extends deskwork's lifecycle to handle visual content (HTML mockups, screenshots, image deliverables) through the same review pipeline as markdown entries.

**Status as of 2026-05-29:** Parent + 12 phase issues open, in the **planning** state (no implementation has shipped). Per the operator's capture-mode rule, the design surface stays open until each phase's PRD is ratified through `/deskwork:iterate` → `/deskwork:approve`.

## Sequencing

The phases below are intentionally **gated** — each one's design depends on the previous phase's resolution. The marching order is sequential, not parallel.

## Quick fixes

None at this stage — the feature is in design-only state. No implementation issues filed.

## Medium effort

None at this stage — the feature is in design-only state.

## Larger / sprint-sized (one phase per sprint, gated)

| # | Phase | Action | Deps |
|---|---|---|---|
| [#302](https://github.com/audiocontrol-org/deskwork/issues/302) | **Phase 1**: Prior-art research + build-vs-reuse decision | Per the feature's PRD; output is a decision doc that gates Phases 2+ | none |
| [#303](https://github.com/audiocontrol-org/deskwork/issues/303) | **Phase 2**: Pipeline template loader + preset defaults + override resolver | Implementation work; per workplan | #302 |
| [#304](https://github.com/audiocontrol-org/deskwork/issues/304) | **Phase 3**: Lane data model + config loader + entry schema delta | Schema work — touches `@deskwork/core/schema/entry` | #303 |
| [#305](https://github.com/audiocontrol-org/deskwork/issues/305) | **Phase 4**: Verb refactor + stage-list reads through lane's template + tooling fixes | Touches every CLI verb that reads stages | #304 |
| [#306](https://github.com/audiocontrol-org/deskwork/issues/306) | **Phase 5**: Studio render — per-lane tabs + template stage columns + combined overview + lane-visibility panel + multi-lane composed views | Studio surface work | #305 |
| [#307](https://github.com/audiocontrol-org/deskwork/issues/307) | **Phase 6**: Lane + pipeline CRUD skills + studio management surfaces | New skills under `plugins/deskwork/skills/` | #306 |
| [#308](https://github.com/audiocontrol-org/deskwork/issues/308) | **Phase 7**: Groups — members field + CRUD + review surface + multi-lane composition | Group semantic; schema + UI | #307 |
| [#309](https://github.com/audiocontrol-org/deskwork/issues/309) | **Phase 8**: Annotation model extension — threads + screenshot attachments + spatial anchors + disposition-trace affordance | Marginalia schema extension | #308 |
| [#310](https://github.com/audiocontrol-org/deskwork/issues/310) | **Phase 9**: `/frontend-design` pass for graphical review surface + screenshot markup co-design | Design pass — produces opinionated mockups | #309 |
| [#311](https://github.com/audiocontrol-org/deskwork/issues/311) | **Phase 10**: Graphical entries — HTML review surface | Studio implementation following #310's accepted mockup | #310 |
| [#312](https://github.com/audiocontrol-org/deskwork/issues/312) | **Phase 11**: Graphical entries — image review surface + iteration paths | Studio implementation; image diff + spatial annotation | #311 |
| [#313](https://github.com/audiocontrol-org/deskwork/issues/313) | **Phase 12**: Screenshot markup / drawing UI | Client TS — markup tool over a canvas overlay | #312 |

## Operator triage required

| # | Title | Why operator needs to decide |
|---|---|---|
| [#301](https://github.com/audiocontrol-org/deskwork/issues/301) | feature lifecycle parent (umbrella) | Stays open across all 12 phases; closes when Phase 12 ships |

## Open questions captured during the audit

- **Phase 1 (#302) blocks everything.** Until prior-art research resolves the build-vs-reuse question, none of the downstream phases have a stable design surface. Operator-recommended action: schedule a `/feature-define` session against #302 to harvest comparable systems (Figma, Whimsical, Excalidraw + plugins) before any implementation.
- **Schema impact (#304) cuts across @deskwork/core, @deskwork/cli, and dashboard rendering.** The lane data-model addition is the largest schema change since the entry-centric pivot (Phase 30); it will require a doctor migration rule + `MIGRATING.md` extension.

## Already-tracked / informational

The graphical-entries feature is its own active branch (worktree at `~/work/deskwork-work/graphical-entries/`). This sheet is a snapshot of the open issue list as of 2026-05-29; the feature's own workplan is the working source of truth for sub-task status within each phase.

The dogfood feedback umbrella ([#349](https://github.com/audiocontrol-org/deskwork/issues/349)) was filed during the graphical-entries scope-discovery canary; its sub-items (#350, #351, #352) belong to the **scope-discovery** lane ([`scope-discovery.md`](scope-discovery.md)), not this one.
