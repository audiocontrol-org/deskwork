---
slug: deskwork-plugin/38-0-blast-radius-review
date: 2026-05-28
kind: phase-gate-report
phase: "38·0"
source: feature/graphical-entries (#301) vs docs/1.0/burndown/{deskwork-core,deskwork-studio}.md
---

# Phase 38·0 — Blast-radius review: burndown vs `feature/graphical-entries` (#301)

Produced by a `code-explorer` dispatch (via `/dwi`) that read the live
`feature/graphical-entries` worktree + branch state and both burndown sheets.
Counts: **16 HIGH (block) · 12 MEDIUM (coordinate) · 38 LOW (proceed)** across 66 issues.

## graphical-entries implementation state

**Phases 1–6 fully implemented and acceptance-checked on `feature/graphical-entries`. Phases 7–12 not started.**

Done and on-branch:
- Pipeline-template loader + 5 preset JSONs at `packages/core/src/pipelines/{editorial,visual,feature-doc,qa-plan,blog-post}.json`.
- Lane data model (`LaneConfig`, loader, `bootstrapDefaultLaneIfMissing`); entry schema extended with `lane` + `artifactKind`.
- **All six verbs (approve/iterate/cancel/block/induct/publish) route through `resolveEntryStrictTemplate` + template-aware helpers in `packages/core/src/pipelines/helpers.ts`.** The `LINEAR_PIPELINE`/`SUCCESSOR`/`nextStage` in `packages/core/src/schema/entry.ts` are kept only as `@deprecated` back-compat stubs.
- Full multi-lane swimlane dashboard (D3 "Press Bay" v11) — `packages/studio/src/pages/dashboard/swimlane-shell.ts` + siblings — **replaces** the old single-lane dashboard with its hardcoded `Stage` enum + `STAGE_ORNAMENTS`.
- Lane + pipeline CRUD: `/deskwork:lane`, `/deskwork:pipeline` skills; studio `/dev/lanes/` + `/dev/pipelines/` pages; doctor rule `lane-config-missing-template`.

Not done (Phases 7–12): groups; annotation-model extension (threads / screenshot attachments / spatial anchors / disposition-trace diff — closes #299); graphical review surface (HTML + image); screenshot markup UI.

## #246 vs #301 verdict — **coordinate into #301 (option b); do NOT implement #246 in Phase 38**

graphical-entries **is** replacing the hardcoded stage map:
- `graphical-entries/.../schema/entry.ts` keeps `LINEAR_PIPELINE`/`SUCCESSOR`/`nextStage` only as `@deprecated`; new code uses the template helpers.
- `graphical-entries/.../entry/approve.ts:109-115` preserves the pre-terminal refusal through `preTerminalLinearStage(template)` (for `editorial`, that's `Final`) — a template-aware reimplementation, not a hardcoded check.

Therefore the #246 fix belongs at `graphical-entries/packages/core/src/entry/approve.ts:109-115` (remove/bypass the `preTerminalLinearStage` refusal so approve is universal). **Any Phase-38 edit to `deskwork-plugin/packages/core/src/entry/approve.ts:61-63` is throwaway** — graphical-entries' `approveEntryStage` is a complete rewrite that no longer calls `nextStage` from `schema/entry.ts`. Same for #230 (the studio Publish button is coupled to #246 + the template-driven meaning of "Final").

## Block list (do NOT start in Phase 38)

**HIGH — work would be thrown away or directly conflict:**
- Core: #246 (approve rewritten on-branch), #61 (stage transitions reworked in Phase 4), #60 (`artifactKind` supersedes content-type vocabulary).
- Studio: #68, #98, #177, #262, #263 (dashboard chrome replaced by swimlane shell), #230 (coupled to #246 + Phase-4 verb semantics), #154 (Phase 9 is the design pass), #54 + #299 (Phase 8 ships threaded replies + disposition-trace diff), #204 (Phase 8 reworks annotation schema), #85 (Phase 8 ships diff view), #161 (Phases 8–12 rework scrapbook), #72 (coupled to #60).

**MEDIUM — coordinate (conflict-check before/with the fix):**
- Core: #266 (DraftWorkflowState in the namespace Phase 8 extends), #215 (approve drift may already be fixed by the Phase-4 rewrite — verify there).
- Studio: #114 (new lane/pipeline vocabulary not yet in glossary), #191 + #202 + #186 + #245 (scrapbook code Phase 8 touches), #193 (induct-to picker — safe ONLY if fix is template-aware, not hardcoded stage names), #171/#170 (Phase-34a concerns overlap Phase 8), #180 (cross-surface design language shifts under the new chrome), #173 + #174 (entry-keyed reject/save semantics adjacent to Phase 8).

## Unblocked work set (LOW — safe to implement in Phase 38 now)

- **Core (20):** #256, #221, #232, #234, #198, #218, #219, #65, #223, #267, #226, #62, #64, #58, #59, #56, #222, #300, #84(core), #57.
- **Studio (18):** #71, #233, #229, #231, #272, #216, #103, #240, #179, #217, #82, #87, #73, #84(studio), #164.

(#300 = doctor `orphan-frontmatter-id` false positive — graphical-entries Phase-4 Task 4.3 already fixed it with a section-agnostic UUID-set parser; a Phase-38 fix is additive and won't conflict but will be superseded on merge. #73 = verify still open, TOC drawer shipped under #169. #193 = template-aware fix only.)

## Recommendation for Phase 38 sequencing

- **38a (#246/#230) → reassigned to #301 coordination.** Not Phase-38 work. The verb-model fix lands on `feature/graphical-entries`.
- Start Phase 38 with the LOW-overlap core fixes (38b: #256/#221/#232/#198) and LOW-overlap studio fixes (38d minus the blocked dashboard items: #71/#233/#229).
- The doctor-rule family (38c: #219/#300/#65) is LOW-overlap and high-value (it's the false-positive set that fired live during the PRD approve) — strong early candidate.
