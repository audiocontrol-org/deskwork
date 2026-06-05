---
slug: design-control
targetVersion: "1.0"
date: 2026-06-05
branch: feature/design-control
parentIssue: 424
---

# Feature: design-control — portable UX/UI surface-change discipline

A deskwork marketplace plugin that productizes a hard-won UX/UI surface-change discipline as
**workflow tooling orchestrating an existing engine — `/frontend-design` — with NO roll-your-own
visual-verification engine.** It fixes the failure mode where changing a UI surface "blind"
degenerates into a screenshot-by-screenshot correction loop (audiocontrol S-550: ~32 surfaces
entered scope, zero found proactively): mockups did double duty (UX + visual design), so stale
detail shipped as if intended and visual identity had no durable home. The discipline threads
`/frontend-design` through three concerns anchored by two durable reference artifacts — a
deliberately **lo-fi wireframe** (UX *spirit*) and a **design-language spec** (visual *letter*) —
and verifies by *looking*: author a wireframe → operator picks → translate intent into the local
design language → implement → referee a screenshot against spirit + letter (advisory evidence,
never a gate). v1 ships in two modes: **`v1-scaffold`** (wireframe kit + allowlist lint +
design-language spec + archive + `status`; zero referee dependency) and a gated
**`v1-referee-preview`** (the advisory referee, which must earn trust via an adversarial
falsification set).

See [`prd.md`](prd.md) for the full design-of-record and
[`../../../superpowers/specs/2026-06-04-design-control-design.md`](../../../superpowers/specs/2026-06-04-design-control-design.md)
for the converged design (11 audit-barrage rounds → two consecutive zero-HIGH).

## Status

| Phase | Description | Mode | Status |
|---|---|---|---|
| 1 | Lo-fi wireframe kit + dual-axis allowlist lint (`check-mockup-lofi`) | v1-scaffold | Not started |
| 2 | Design-language spec convention + static link-liveness | v1-scaffold | Not started |
| 3 | ACCEPTED/REJECTED archive primitive + `design-control status` | v1-scaffold | Not started |
| 4 | Referee-request manifest schema validation + engine-adapter interface | v1-scaffold | Not started |
| 5 | `v1-referee-preview` evidence-spike (referee + capture/baseline) | **GATED — advisory** | Not started |
| 6 | Dogfood (sites→lanes studio redesign) + plugin packaging | both | Not started |

Build order is **inverted**: ship the scaffold (Phases 1–4) first with zero referee risk; build
the referee (Phase 5) last as a constrained evidence-spike, gated on its falsification set. Until
Phase 5's adversarial set passes, referee output is optional evidence and no "catches these cases"
claim ships.

## Key Links

- Branch: `feature/design-control` (based on `feature/deskwork-plugin` — inherits the design-control
  kickoff docs + the sites→lanes content-browser/scrapbook work that is the Phase 6 dogfood target)
- PRD: [`prd.md`](prd.md)
- Workplan: [`workplan.md`](workplan.md)
- Converged design: [`../../../superpowers/specs/2026-06-04-design-control-design.md`](../../../superpowers/specs/2026-06-04-design-control-design.md)
- Thesis: [`../../../../DESIGN-DISCIPLINE-THESIS.md`](../../../../DESIGN-DISCIPLINE-THESIS.md)
- Parent Issue: [#424](https://github.com/audiocontrol-org/deskwork/issues/424)
