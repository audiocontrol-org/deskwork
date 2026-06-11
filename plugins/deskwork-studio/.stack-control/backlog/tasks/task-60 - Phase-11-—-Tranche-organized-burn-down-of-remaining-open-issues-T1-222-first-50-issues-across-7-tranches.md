---
id: TASK-60
title: >-
  Phase 11 — Tranche-organized burn-down of remaining open issues (T1: #222
  first; 50 issues across 7 tranches)
status: To Do
assignee: []
created_date: '2026-06-10 19:31'
labels:
  - 'type:imported-issue'
  - enhancement
dependencies: []
references:
  - gh-227
ordinal: 60000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Phase 11 — Tranche-organized burn-down of remaining open issues

Umbrella issue for tracking Phase 11 of the `open-issue-tranche-cleanup` feature on `feature/deskwork-open-issue-tranche-cleanup`.

**Goal:** every extant open issue (50 at filing time) assigned to a tranche; T1 (architectural blocker) ships first; remaining tranches burned down in least-dumb order.

### T1 — Architectural blocker (must ship first)

**Operator-prioritized:** *"It's impossible to outline documents with the current state of the plugin."*

- [#222](https://github.com/audiocontrol-org/deskwork/issues/222) — single document evolves; scrapbook accumulates approved snapshots. Implements Option B + hybrid refinement: snapshot `index.md` → `scrapbook/<prior-stage>.md` on `/deskwork:approve`; studio always reads `index.md`.
- [#181](https://github.com/audiocontrol-org/deskwork/issues/181) — outline-approve semantics in entry-keyed model (coupled).
- [#200](https://github.com/audiocontrol-org/deskwork/issues/200) — marginalia anchor stability under document evolution (coupled).

### T2 — dw-lifecycle plugin UX cluster (9 issues)

[#185](https://github.com/audiocontrol-org/deskwork/issues/185), [#196](https://github.com/audiocontrol-org/deskwork/issues/196), [#209](https://github.com/audiocontrol-org/deskwork/issues/209), [#210](https://github.com/audiocontrol-org/deskwork/issues/210), [#211](https://github.com/audiocontrol-org/deskwork/issues/211), [#212](https://github.com/audiocontrol-org/deskwork/issues/212), [#213](https://github.com/audiocontrol-org/deskwork/issues/213), [#214](https://github.com/audiocontrol-org/deskwork/issues/214), [#215](https://github.com/audiocontrol-org/deskwork/issues/215)

### T3 — doctor cleanup (3 issues)

[#182](https://github.com/audiocontrol-org/deskwork/issues/182), [#218](https://github.com/audiocontrol-org/deskwork/issues/218), [#219](https://github.com/audiocontrol-org/deskwork/issues/219)

### T4 — scrapbook UX cluster (3 issues)

[#167](https://github.com/audiocontrol-org/deskwork/issues/167), [#168](https://github.com/audiocontrol-org/deskwork/issues/168), [#186](https://github.com/audiocontrol-org/deskwork/issues/186)

### T5 — studio UX cluster (12 issues; design pass first)

[#169](https://github.com/audiocontrol-org/deskwork/issues/169), [#173](https://github.com/audiocontrol-org/deskwork/issues/173), [#174](https://github.com/audiocontrol-org/deskwork/issues/174), [#175](https://github.com/audiocontrol-org/deskwork/issues/175), [#176](https://github.com/audiocontrol-org/deskwork/issues/176), [#177](https://github.com/audiocontrol-org/deskwork/issues/177), [#178](https://github.com/audiocontrol-org/deskwork/issues/178), [#179](https://github.com/audiocontrol-org/deskwork/issues/179), [#180](https://github.com/audiocontrol-org/deskwork/issues/180), [#193](https://github.com/audiocontrol-org/deskwork/issues/193), [#216](https://github.com/audiocontrol-org/deskwork/issues/216), [#217](https://github.com/audiocontrol-org/deskwork/issues/217)

### T6 — Phase 10 dogfood items (6 issues; previously scoped as Phase 10)

[#220](https://github.com/audiocontrol-org/deskwork/issues/220), [#221](https://github.com/audiocontrol-org/deskwork/issues/221), [#223](https://github.com/audiocontrol-org/deskwork/issues/223), [#224](https://github.com/audiocontrol-org/deskwork/issues/224), [#225](https://github.com/audiocontrol-org/deskwork/issues/225), [#226](https://github.com/audiocontrol-org/deskwork/issues/226)

### T7 — marketplace-walk verifications (18 issues; operator-driven; parallel)

Per `2026-05-05-v0.16.0-verification-walk.md`:

[#159](https://github.com/audiocontrol-org/deskwork/issues/159), [#160](https://github.com/audiocontrol-org/deskwork/issues/160), [#161](https://github.com/audiocontrol-org/deskwork/issues/161), [#163](https://github.com/audiocontrol-org/deskwork/issues/163), [#164](https://github.com/audiocontrol-org/deskwork/issues/164), [#165](https://github.com/audiocontrol-org/deskwork/issues/165), [#166](https://github.com/audiocontrol-org/deskwork/issues/166), [#191](https://github.com/audiocontrol-org/deskwork/issues/191), [#192](https://github.com/audiocontrol-org/deskwork/issues/192), [#197](https://github.com/audiocontrol-org/deskwork/issues/197), [#198](https://github.com/audiocontrol-org/deskwork/issues/198), [#199](https://github.com/audiocontrol-org/deskwork/issues/199), [#201](https://github.com/audiocontrol-org/deskwork/issues/201), [#202](https://github.com/audiocontrol-org/deskwork/issues/202), [#204](https://github.com/audiocontrol-org/deskwork/issues/204), [#205](https://github.com/audiocontrol-org/deskwork/issues/205), [#206](https://github.com/audiocontrol-org/deskwork/issues/206), [#207](https://github.com/audiocontrol-org/deskwork/issues/207)

### Out-of-scope (deferred per existing PRD)

- Tranche 3 product backlog: [#54](https://github.com/audiocontrol-org/deskwork/issues/54), [#82](https://github.com/audiocontrol-org/deskwork/issues/82), [#84](https://github.com/audiocontrol-org/deskwork/issues/84), [#85](https://github.com/audiocontrol-org/deskwork/issues/85), [#86](https://github.com/audiocontrol-org/deskwork/issues/86), [#87](https://github.com/audiocontrol-org/deskwork/issues/87)
- Background architecture: [#18](https://github.com/audiocontrol-org/deskwork/issues/18), [#30](https://github.com/audiocontrol-org/deskwork/issues/30), [#33](https://github.com/audiocontrol-org/deskwork/issues/33)

### Burn-down order

T1 → T6 (small wins) → T2 (dw-lifecycle, contained) → T3 (doctor) → T4 (scrapbook UX) → T5 (studio UX, after T1's surface settles). T7 parallel throughout.
<!-- SECTION:DESCRIPTION:END -->
