---
slug: studio-mobile-first
targetVersion: "0.19.0"
date: 2026-05-09
branch: feature/studio-mobile-first
parentIssue:
---

# Feature: studio-mobile-first

Extend the press-check mobile-first design language already shipped on the entry-review surface (v0.17 + v0.18) to the remaining studio surfaces in four sequenced cuts. Phase 0 (the foundational state-machine + design-standards canonization) was scoped as a prerequisite after the 2026-05-09 dashboard-rebuild session repeatedly resurrected retired patterns; Phases 1–4 are the surface-by-surface mobile rebuilds (Dashboard → Shortform + `mobile-shell` extraction → Standalone scrapbook + Content view → Help + Index + cross-cutting Cancel). Closes #236, #237, #238, #242, #243, #244.

## Status

| Phase | Description | Status |
|---|---|---|
| 0.1 | `DESKWORK-STATE-MACHINE.md` — canonical state-machine spec | Complete (operator-approved Drafting → Final via /deskwork:approve) |
| 0.2 | Audit + destroy reviewState violations across studio code, skill prose, ingest CLI | Complete (cascading inventory tracked under Task 1.6) |
| 0.3 | `DESIGN-STANDARDS.md` promoted to top-level + `docs/studio-design/{ACCEPTED,REJECTED}/` archive | Complete (operator-approved 5 docs Drafting → Final) |
| 1.1 | Dashboard mockups (mockup → operator pick) | Complete (operator picked Compact-1 collapsible-stage-tiles + Dashboard-1c filing-tab/FAB) |
| 1.2 | Implement Dashboard mobile-first | Complete (collapsible stage tiles + FAB Compose chip shipped) |
| 1.3 | Probe + dual-viewport smoke for dashboard | Complete (`scripts/probe-mobile-dashboard.mjs` 16/16; `scripts/smoke-er-viewport-regressions.mjs` 8/8) |
| 1.4 | `/dw-lifecycle:review` + integrate findings | Complete (4 findings applied, 3 withdrawn after verification, 1 deferred to Phase 2) |
| 1.5 | Release v0.19 + iPhone walk + close issues | Complete (bundled with v0.20.0; operator walked 2026-05-11; #236/#237/#238/#243 closed 2026-05-12) |
| 1.6 | Audit-driven remediations (Phase 0 / 1 cleanup per 2026-05-09 implementation audit) | Complete |
| 1.7 | Final reviewState retirement (schema + journal cascade) | Complete |
| 1.8 | Row affordance redesign — overflow menu + swipe drawer + full verb vocabulary (block, induct, iterate) → v0.20.0 | Complete + released as v0.20.0 (operator walked marketplace install on phone, 2026-05-11) |
| 1.8b | Mid-flight accessibility contrast standard — added `DESIGN-STANDARDS.md` § Accessibility (WCAG 2.1 AA floor) + Direction B ⋮ overflow fix (1.21:1 → 11.06:1) + audit other affordances + spec probe extended with WCAG contrast assertions | Complete in v0.20.0 |
| 2.1 | Narrow `mobile-shell` extraction — probe helpers + slide-up sheet controller (audit-driven re-scope) → v0.22 | Complete (2026-05-12 — 7 commits: probe-helpers extracted; sheet-controller TDD'd at 19/19; entry-review + dashboard consumers migrated; reviewer findings applied or filed as #260/#261; workspace tests 1310/1310, smoke 12/12, no regressions) |
| 2.2 | Shortform desk mobile-first → re-scoped 2026-05-12 to **v7 cross-cutting architecture** (Desk-as-hub star nav, masthead ←/⋮, zero-nav-region bar, Desk absorbs Shortform-by-platform section) | Steps 2.2.1–2.2.9 complete (v7 architecture landed: standards + archive, `renderMasthead`, ⋮ popover, universal `renderMobileBar`, Desk Shortform + Adjacent sections — all under operator review). Step 2.2.10 (shortform-review surface refactor + G.1–G.6 audit findings) pending; cell composition derived from the universal-bar contract (TOC / Versions / Actions sheet cells, conditional omission) — no per-surface idiom pick. The pre-v7 Shortform-1/2/3 bespoke idioms are archived under `docs/studio-design/REJECTED/2026-05-12-shortform-{1,2,3}-*/` per the 2026-05-13 `§ Universal bar contract` addition to `DESIGN-STANDARDS.md`. |
| 2.5 | Cross-cutting accessibility cleanup (surfaced by desk-states a11y audit) | Pending (separable from Task 2.2 implementation) |
| 2.6 | Capabilities-as-contracts methodology post-mortem (Phase 2 retrospective) | Pending — runs AFTER Task 2.4 release; essay snapshot in `references/` |
| 3 | Standalone scrapbook viewer + Content view → v0.23 | Not started |
| 4 | Editorial Help + Studio Index + #242 cross-cutting Cancel → v0.24 | Re-narration pending (Cancel already shipped on dashboard + entry-review during Phase 1; Phase 4's residual scope is the remaining surfaces — see workplan Step 1.6.6) |

## Key Links

- Branch: `feature/studio-mobile-first`
- PRD: [`prd.md`](./prd.md)
- Workplan: [`workplan.md`](./workplan.md)
- Audit: [`2026-05-09-implementation-audit.md`](./2026-05-09-implementation-audit.md)
- Mobile-shell pre-implementation audit (Task 2.1): [`2026-05-12-mobile-shell-audit.md`](./2026-05-12-mobile-shell-audit.md)
- Dashboard audit (Task 1.1.1 historical): [`dashboard-audit.md`](./dashboard-audit.md)
- Canonical state-machine spec: [`DESKWORK-STATE-MACHINE.md`](../../../../DESKWORK-STATE-MACHINE.md)
- Canonical design standards: [`DESIGN-STANDARDS.md`](../../../../DESIGN-STANDARDS.md)
- Design proposal archive: [`docs/studio-design/`](../../../studio-design/)
- Parent Issue:

## Active issues addressed

| Issue | Phase | Status |
|---|---|---|
| #236 | 1 | Closed 2026-05-12 (verified in v0.20.0) |
| #237 | 1 | Closed 2026-05-12 (verified in v0.20.0) |
| #238 | 1 | Closed 2026-05-12 (verified in v0.20.0) |
| #242 | 1 (Cancel verb on dashboard rows + entry-review decision strip) + 4 (remaining surfaces) | Partially landed; cross-cutting completion deferred to Phase 4 |
| #243 | 1 | Closed 2026-05-12 (verified in v0.20.0) |
| #244 | 2 | Outline-drawer foundation in place; full Phase 2 mobile-shell extraction pending |
| #262 | 2.2.7 deferral | Open — About deskwork modal (in-studio version + license + thesis link) deferred from Step 2.2.7; placeholder currently links to `/dev/editorial-help` |
| #263 | 2.2.9 deferral | Open — shortform-row ⋮ on Desk needs v0.20-style popover; current placeholder is a navigation anchor; popover lands with Step 2.2.10 verb-routing fixes |
