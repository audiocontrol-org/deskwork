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
| 2.1 | Narrow `mobile-shell` extraction — probe helpers + slide-up sheet controller (audit-driven re-scope) → v0.21 | In progress — Steps 2.1.1 + 2.1.2 complete (audit landed 2026-05-12, operator picked Direction A); Steps 2.1.3–2.1.9 pending |
| 2.2 | Shortform desk mobile-first + conditional server bar/sheet extraction → v0.21 | Not started |
| 3 | Standalone scrapbook viewer + Content view → v0.22 | Not started |
| 4 | Editorial Help + Studio Index + #242 cross-cutting Cancel → v0.23 | Re-narration pending (Cancel already shipped on dashboard + entry-review during Phase 1; Phase 4's residual scope is the remaining surfaces — see workplan Step 1.6.6) |

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
