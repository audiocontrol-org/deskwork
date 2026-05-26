---
slug: graphical-entries
targetVersion: "1.0"
date: 2026-05-25
branch: feature/graphical-entries
parentIssue: "#301"
---

# Feature: Graphical Entries

Generalize deskwork's pipeline model so a project can host multiple **lanes** bound to **pipeline templates** (ships five presets — `editorial`, `visual`, `feature-doc`, `qa-plan`, `blog-post`), add cross-lane **groups** (a regular entry with a `members[]` field; lifecycle is independent of members), and add first-class **graphical entries** (`html-mockup` / `single-file-html` / `image`) with a chrome-free review surface supporting spatial-region comment pins, threaded replies, screenshot capture + markup, and per-comment disposition-trace affordances. The canonical pipeline shape — linear forward + cul-de-sac off-pipeline + universal `iterate` / `approve` / `cancel` / `induct` verbs — is preserved across every template; only stage names and lengths vary. Existing single-pipeline projects migrate automatically with zero data loss. Secondary deliverable: serve as the canary v1 dogfood for the scope-discovery protocol.

## Status

| Phase | Description | Issue | Status |
|---|---|---|---|
| 1 | Prior-art research + build-vs-reuse decision | [#302](https://github.com/audiocontrol-org/deskwork/issues/302) | In progress — Task 1.1 done (candidate matrix; 17 candidates) |
| 2 | Pipeline template loader + preset defaults + override resolver | [#303](https://github.com/audiocontrol-org/deskwork/issues/303) | Not started |
| 3 | Lane data model + config loader + entry schema delta | [#304](https://github.com/audiocontrol-org/deskwork/issues/304) | Not started |
| 4 | Verb refactor + stage-list reads through lane's template + tooling fixes (#247, #300) | [#305](https://github.com/audiocontrol-org/deskwork/issues/305) | Not started |
| 5 | Studio render — per-lane tabs + template stage columns + combined overview + lane-visibility panel + multi-lane composed views | [#306](https://github.com/audiocontrol-org/deskwork/issues/306) | Not started |
| 6 | Lane + pipeline CRUD skills + studio management surfaces | [#307](https://github.com/audiocontrol-org/deskwork/issues/307) | Not started |
| 7 | Groups — members field + CRUD + review surface + multi-lane composition | [#308](https://github.com/audiocontrol-org/deskwork/issues/308) | Not started |
| 8 | Annotation model extension — threads + screenshot attachments + spatial anchors + disposition-trace affordance (#299) | [#309](https://github.com/audiocontrol-org/deskwork/issues/309) | Not started |
| 9 | `/frontend-design` pass for the graphical review surface + screenshot markup co-design | [#310](https://github.com/audiocontrol-org/deskwork/issues/310) | Not started |
| 10 | Graphical entries — HTML review surface | [#311](https://github.com/audiocontrol-org/deskwork/issues/311) | Not started |
| 11 | Graphical entries — image review surface + iteration paths | [#312](https://github.com/audiocontrol-org/deskwork/issues/312) | Not started |
| 12 | Screenshot markup / drawing UI | [#313](https://github.com/audiocontrol-org/deskwork/issues/313) | Not started |
| Closing | scope-discovery v1 dogfood TF summary + audit handoff | — | Not started |

## Key Links

- Branch: `feature/graphical-entries`
- PRD: `prd.md`
- Workplan: `workplan.md`
- Parent Issue: [#301](https://github.com/audiocontrol-org/deskwork/issues/301)
- Design spec: `docs/superpowers/specs/2026-05-16-graphical-entries-design.md` (522-line spec; iterated to revision 6 in deskwork on 2026-05-17)
- Scope-discovery dogfood: `tooling-feedback.md`, `dogfood-handoff.md`, `scope-inventory/`
- Linked issues bundled in v1: #247 (calendar regen, fixed in Phase 4), #299 (disposition trace, fixed in Phase 8), #300 (doctor parser, fixed in Phase 4)
