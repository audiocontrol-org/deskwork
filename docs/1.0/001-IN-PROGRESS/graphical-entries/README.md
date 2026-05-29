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
| 1 | Prior-art research + build-vs-reuse decision | [#302](https://github.com/audiocontrol-org/deskwork/issues/302) | **Done** — Tasks 1.1-1.6 complete. Picks: W3C Web Annotation Data Model (+ `deskwork:` namespace); Annotorious + `W3CImageFormat` (image); `@recogito/text-annotator` + hand-rolled DOM-selector layer (HTML); host-supplied threading via W3C `motivation: replying`; `html-to-image` primary capture + `getDisplayMedia` opt-in secondary; Excalidraw + React isolated sub-bundle (markup, blur deferred to custom element). Architecture A confirmed. Brief at `docs/studio-design/ACCEPTED/2026-05-26-graphical-review-prior-art/brief.md`. |
| 2 | Pipeline template loader + preset defaults + override resolver | [#303](https://github.com/audiocontrol-org/deskwork/issues/303) | **Done** — `PipelineTemplate` type + Zod schema with three invariant refinements; `loadPipelineTemplate` + `listAvailablePipelineTemplates` (override-takes-precedence + plugin defaults); 5 preset templates ship at `packages/core/src/pipelines/{editorial,visual,feature-doc,qa-plan,blog-post}.json`. |
| 3 | Lane data model + config loader + entry schema delta | [#304](https://github.com/audiocontrol-org/deskwork/issues/304) | **Done** — `LaneConfig` + loader; `EntrySidecar` schema accepts `lane` + `artifactKind` (optional during migration); `detectArtifactKind` covers 4 artifact kinds; `bootstrapDefaultLaneIfMissing` migrates legacy single-site projects. Schema-broadening cascade through journal events + downstream readers handled. |
| 4 | Verb refactor + stage-list reads through lane's template + tooling fixes (#247, #300) | [#305](https://github.com/audiocontrol-org/deskwork/issues/305) | **Done** — All six verbs (`approve`, `iterate`, `cancel`, `block`, `induct`, `publish`) consult the bound template via `resolveEntryStrictTemplate`; template-aware helpers in `pipelines/helpers.ts` replace hardcoded stage literals. `#247` closed by lane-aware calendar regen; `#300` closed by section-agnostic UUID-set parser. `migrateLaneMembership` back-fills `lane` + `artifactKind` on every sidecar with `lane-migration` journal events. |
| 5 | Studio render — multi-lane swimlane dashboard + template stage columns + per-lane collapse + kanban↔list toggle + per-lane compose | [#306](https://github.com/audiocontrol-org/deskwork/issues/306) | **Done** — All 9 tasks shipped on `feature/graphical-entries`: 5.1 (swimlane shell + focus-chip + visibility rail + swim-stub), 5.1A (per-lane collapse — lane + per-stage), 5.1B (kanban↔list toggle), 5.1C (per-lane Compose chip), 5.2 (template-aware stage rendering + empty-lane CTA), 5.3 (focus-chip overflow + mobile lane-sheet + hidden-lane rail activation), 5.4 (drag-to-reorder + lane-order persistence), 5.5 (saveable focus presets + deep-link URL), 5.6 (integration test against multi-lane fixture). Phase 5 audit-log: 39 findings across 9 tasks, 0 blocking remain. Tests 586 → 801 passing (+215 net). Build exit 0. Acceptance criteria checked. |
| 6 | Lane + pipeline CRUD skills + studio management surfaces | [#307](https://github.com/audiocontrol-org/deskwork/issues/307) | **Done** — All 6 tasks shipped on `feature/graphical-entries`: 6.1 (`/deskwork:lane` skill family — SKILL.md + CLI + 45 tests + path-traversal hardening + atomic write + move-rollback), 6.2 (`/deskwork:pipeline` skill family — SKILL.md + CLI + 64 tests + rename-migration sidecar + customize wrapper + 3 BLOCKING bugs caught at quality-review), 6.3 (studio lane-management page — server-render + clipboard-builder client + 30 tests + 7 quality polish), 6.4 (studio pipeline-editor page — server-render + Phase-2 follow-up error rows + 70 tests + 7 quality polish + 6 audit followups), 6.5 (doctor rule `lane-config-missing-template` — first-site-gated project-wide scan + prompt-plan with per-template rebind choice + delete-with-entry-binding-refusal + `LaneConfigRepairEvent` schema extension + 4 test scenarios), 6.6 (custom-pipeline + lane lifecycle integration test — real CLI subprocess through pipeline create → lane create → 2-sidecar write → archive → restore → purge-refusal → byte-equivalent state-intact). Phase 6 acceptance criteria all checked. Tests core 711 → 715 (+4), CLI 320 → 321 (+1), studio 893 stable. Builds exit 0. |
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
