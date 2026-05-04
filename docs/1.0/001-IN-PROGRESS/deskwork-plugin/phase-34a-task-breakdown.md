# Phase 34a — Internal Task Breakdown

Date: 2026-05-03
Source workplan: `docs/1.0/001-IN-PROGRESS/deskwork-plugin/workplan.md` § Phase 34 → 34a
Source PRD: `docs/1.0/001-IN-PROGRESS/deskwork-plugin/prd.md` § Phase 34
Tracking issue: [#171](https://github.com/audiocontrol-org/deskwork/issues/171) (umbrella [#170](https://github.com/audiocontrol-org/deskwork/issues/170))

## Why this document exists

The 34a workplan section is correct at the bullet level but doesn't surface ordering, dependencies, or PR boundaries. This breakdown provides those so that:

- The implementation can be scoped into 3 PRs that each derisk the next.
- The operator can review the plan + sign off on the one open decision (annotation-store strategy) before any code lands.
- `feature-orchestrator` can dispatch each layer independently.

Nothing here adds scope to the workplan. It maps the workplan's checkboxes onto concrete subtasks with an explicit order.

## The one open decision (resolve before T2)

**Annotation-store strategy.** Workplan task: *"Design + implement an entry-keyed annotation store. Two options to evaluate at 34a kickoff."*

- **Option A — clean break.** New per-entry annotation store at `.deskwork/entries/<uuid>/annotations/<n>.json` (or similar). Existing workflow-keyed annotations stay attached to workflow records (still readable on the new shortform surface; ignored by longform). Pro: simplest implementation, no migration script, no fragile join logic. Con: prior longform margin notes do not surface on the new unified surface — operators see "no annotations yet" on entries that previously had them.
- **Option B — one-shot migration.** Migration script joins workflow-keyed annotations to entries by `(site, slug, contentKind)`. Annotations move into the new entry-keyed store; workflow records keep an empty annotation set. Pro: prior margin notes preserved; trust signal that the cutover doesn't lose history. Con: more code, harder to test, edge cases when an entry doesn't have a single workflow predecessor.

**Recommendation:** Option A. The PRD review explicitly demoted the corrupted-review audit to 34e because we expect re-review against the new surface anyway; preserving stale annotations under the same trust-rebuild premise is incoherent. If this project's calendar has high-value historical margin notes that would be lost, Option B becomes a real consideration — but I haven't audited that yet (see "operator action items" below).

**Operator action item:** confirm A or B. If Option B is chosen, T2's scope grows by ~1 day equivalent.

## Layered structure

Three layers map onto three PRs. Each layer is fully testable and shippable on its own; the cutover risk concentrates entirely in Layer 3.

```
Layer 1 — Data foundation (PR 1, additive)
    T1 → T2 → T3 → T4
    Output: new entry-keyed annotation store + history-journal reader + new
    /api/dev/editorial-review/entry/:entryId/* endpoints. UI unchanged. Dashboard
    still links to legacy review surface. New endpoints exist alongside old.

Layer 2 — Chrome port (PR 2, additive)
    T5 ‖ T6 ‖ T7 ‖ T8 ‖ T9 ‖ T10 ‖ T11 ‖ T12 ‖ T13 ‖ T14
    Output: pages/entry-review.ts grows to render the full press-check chrome
    using the Layer 1 data layer. Reachable at /dev/editorial-review/entry/<uuid>.
    Dashboard still links to legacy. Operators can MANUALLY visit the new URL
    and verify before the cutover.

Layer 3 — Cutover + delete + verify (PR 3, atomic)
    T15 → T16 ‖ T17 → T18 → T19 → T20 → T21 → T22 (release)
    Output: every link emitter points entry-keyed. Bare-UUID route gains
    workflow-id-then-301 logic. shortform-review.ts extracted; review.ts deleted.
    Deferral comments deleted. Live walk verifies. Release ships. Issue closes.
```

The prior 3-PR shape is the load-bearing structural decision. It's deliberately NOT one big PR: a single 25-test, ~1500-line PR is review-resistant and rolls back painfully if a bug surfaces post-merge. Three layered PRs let each one bake on `feature/deskwork-plugin` for whatever interval the operator wants before the next layer ships, and the cutover PR itself is small (~300 lines) because the actual functionality landed in PRs 1 + 2.

## Subtasks

### Layer 1 — Data foundation (PR 1)

**T1. Operator decision: annotation-store strategy.** [Recorded above. Resolves before T2.]

**T2. Implement entry-keyed annotation store.**
- Storage location decided per T1.
- Core API in `@deskwork/core`: `addAnnotation(projectRoot, entryId, annotation)`, `listAnnotations(projectRoot, entryId)`, `deleteAnnotation(projectRoot, entryId, annotationId)`.
- Same annotation schema as the workflow-keyed store (selector range, body, author, timestamp). Schema lives in `@deskwork/core/annotations` (new module).
- Tests: unit (storage round-trip, listing order) + integration (multiple entries, no cross-entry leakage).
- ~150 lines + ~80 test lines.

**T3. Implement history-journal reader for version strip.**
- Reads `.deskwork/review-journal/history/<timestamp>-<event>.json`; filters events by `entryId`; orders by timestamp.
- Returns iteration list: `[{ versionNumber, timestamp, contentSnapshot, stage }, ...]`.
- "Content snapshot" semantics: the file content at the moment of iterate, captured by `iterateEntry` (this part of `iterateEntry` may need a small extension if it doesn't already record the snapshot — verify before writing T3).
- Core API in `@deskwork/core`: `listIterations(projectRoot, entryId)`, `getIterationContent(projectRoot, entryId, versionNumber)`.
- Tests: unit (event ordering, filter correctness) + fixture-based (multi-iteration entry).
- ~100 lines + ~80 test lines.

**T4. Add new entry-keyed API endpoints.**
- `POST /api/dev/editorial-review/entry/:entryId/annotate` → wraps T2.
- `GET  /api/dev/editorial-review/entry/:entryId/annotations` → wraps T2.
- `POST /api/dev/editorial-review/entry/:entryId/decision` → wraps existing decision logic (which presumably needs an entry-keyed equivalent of `handleDecision`; check during implementation).
- `POST /api/dev/editorial-review/entry/:entryId/version` → wraps existing version-creation, but writes via `iterateEntry`.
- All 4 nested under the existing `/entry/:entryId/...` Hono pattern (`packages/studio/src/routes/api.ts:222-225`).
- Update `routes/api.ts` header comment to document the split contract per workplan line 1693.
- Tests: route + handler (status codes, payload shape, error cases).
- ~120 lines + ~150 test lines.

**Layer 1 PR acceptance:** new endpoints respond 200 with correct shape against fixture entries. No UI surfaces consume them yet. `pages/review.ts` untouched. Dashboard still links to legacy. Old endpoints still serve shortform.

---

### Layer 2 — Chrome port (PR 2)

These can largely parallelize. Each one is a self-contained chrome component ported from `pages/review.ts` into `pages/entry-review.ts`. Order below is suggestion-only; the only hard rule is "T11 + T13 land after T2 + T4."

**T5. Port folio header.** Add `renderEditorialFolio('longform', ...)` to entry-review's render path. ~20 lines.

**T6. Port version strip.** Renames the existing `renderVersionsStrip` into entry-keyed shape; reads from T3's history-journal reader instead of `readVersions`. Each version chip is clickable; clicking shows historical content read-only. ~80 lines + ~50 test lines.

**T7. Port edit toolbar.** Source / Split / Preview + Focus mode buttons. Pure relocation from `pages/review.ts:renderEditToolbar`. ~40 lines.

**T8. Port edit panes.** Source textarea + rendered preview + split-pane gutter. Relocation of `renderEditPanes`. ~120 lines + small CSS additions.

**T9. Port outline drawer.** Conditional render when entry has outline content (`entry.outline?.length > 0`). Relocation of `renderOutlineDrawer`. ~80 lines.

**T10. Port marginalia column + stow chevron + edge pull tab.** Per `affordance-placement.md`, the on-component pattern: `.er-marginalia-stow` chevron in marginalia head when visible + `.er-marginalia-tab` vertical pull tab on right edge when stowed. Already exists for legacy review; relocate. ~100 lines.

**T11. Port margin-note authoring.** Select-text → annotation composer → save annotation. Client integration via `editorial-review-client.ts`. POSTs to T4's `/entry/:entryId/annotate` endpoint. **Depends on T2 + T4.** ~150 lines (server-side hooks + client adapter).

**T12. Port rendered markdown preview.** Replaces the entry-review's currently-empty `<section class="er-entry-artifact">`. Reuses the existing markdown render pipeline (`renderMarkdownToHtml`). ~30 lines.

**T13. Port decision strip with chord chips.** Approve `a` / Iterate `i` / Reject `r` + "?" shortcuts overlay (`renderShortcutsOverlay`). Buttons POST to T4's decision endpoint. **Depends on T4.** ~120 lines + ~80 test lines.

**T14. Port scrapbook drawer.** Bottom-anchored expandable drawer, per F1–F6. Relocation. ~60 lines.

**T15-prep. Stage-aware affordances.** Existing `getAffordances(entry)` already returns the right buttons per stage; verify it's invoked in entry-review's render. (May already be invoked since #146 added the entry-stage actions.) ~15 lines if not.

**Layer 2 PR acceptance:** visiting `/dev/editorial-review/entry/<uuid>` renders the full press-check chrome. All chrome is functional (margin notes save, decisions land in sidecar, version chips render history, scrapbook drawer expands). Dashboard still links to legacy. Studio test count up by ~20.

---

### Layer 3 — Cutover + delete + verify (PR 3)

**T16. Update every link emitter to entry-keyed URL.**
- `packages/studio/src/pages/dashboard/affordances.ts:60` (`reviewLink`)
- `packages/studio/src/pages/content.ts:353` (`reviewHref`)
- `packages/studio/src/pages/content-detail.ts:280` (`reviewHref`)
- `packages/studio/src/pages/index.ts:115` (`longformDefaultEntry` link)
- `packages/studio/src/pages/help.ts:262, 283, 391, 426`
- `packages/studio/src/server.ts:224`
- `packages/studio/src/routes/api.ts:66` (`reviewUrl` field — verify this field is still emitted; may be removable)
- `plugins/deskwork-studio/public/src/editorial-studio-client.ts:178`
- Operator-facing skill prose: `/feature-extend`, `/feature-setup`, etc.
- `packages/cli/` URL printers (e.g. `deskwork iterate`'s in-review JSON output)
- ~10 file edits.

**T17. Extract shortform-rendering subset into `pages/shortform-review.ts`.**
- Function: `renderShortformReviewPage(ctx, lookup, query, getIndex)` (or similar).
- Helpers retained: `prepareRender`, `errorFromBody`, `pickContentKind`, `pickSite`, `stringField`, `stateLabel`, `renderError`.
- Header comment documents shortform-deferral rationale + retirement-issue link.
- ~250 lines (the slim subset of review.ts's 710).
- Tests: relocate the subset of `review.test.ts` covering shortform; remove the rest.

**T18. Restructure server.ts bare-UUID route.**
- The `/dev/editorial-review/:id` route becomes:
  ```ts
  app.get('/dev/editorial-review/:id{[uuid-regex]}', async (c) => {
    const id = c.req.param('id');
    const wf = readWorkflow(ctx.projectRoot, ctx.config, id);
    if (wf !== null) {
      // shortform: render via the new slim file
      return c.html(await renderShortformReviewPage(ctx, ...));
    }
    // longform: 301 to entry-keyed
    return c.redirect(`/dev/editorial-review/entry/${id}`, 301);
  });
  ```
- Delete the entry-id legacy fallback (current lines 402-415).
- Delete the `:slug{.+}` catch-all (current line 428+).
- ~50 lines of route code (down from ~70 across deleted branches).

**T19. Delete `pages/review.ts` + longform-only callers.**
- `git rm packages/studio/src/pages/review.ts`.
- Audit longform-only callers of `readWorkflow`, `readVersions`, `appendVersion`, `transitionState`; delete. Shortform callers stay (now only used by `pages/shortform-review.ts` + `pages/shortform.ts`).
- ~600 lines deleted.

**T20. Delete deferral comments.**
- `entry-review.ts:14-18`: *"Rendering is intentionally minimal..."*
- `server.ts` deprecated/migration-window comments around the (now-restructured) bare-UUID route.
- `server.ts:373-384`: entry-first-short-circuit-was-a-regression explainer.
- F6 walkthrough's *"non-blocking follow-ups"* references to the dual-surface model.
- ~20 lines deleted.

**T21. Live verification (per `ui-verification.md`).**
- Boot studio against this project's calendar: `node_modules/.bin/deskwork-studio --project-root .` (NOT `--no-tailscale`).
- Walk the dashboard → click any Drafting entry → land on `/dev/editorial-review/entry/<uuid>`.
- Verify chrome renders end-to-end: folio + version strip + edit toolbar + outline drawer + marginalia + scrapbook drawer.
- Verify margin-note authoring: select text → composer → save → reload → annotation persists.
- Verify decision flow: click Approve → sidecar `currentStage` advances → page re-renders with new state.
- Verify Iterate flow: click Iterate → run `deskwork iterate <uuid>` → version strip shows new version → click old version → historical content renders read-only.
- Verify shortform-route is alive: visit `/dev/editorial-review-shortform`, click any row, confirm `/dev/editorial-review/<workflow-id>` renders the (slim) shortform surface.
- Verify legacy route is dead: `curl /dev/editorial-review/some-slug` returns 404.
- Capture before/after measurements per `ui-verification.md` rule (don't write "verified" without measurements).

**T22. Verification gates (programmatic).**
- `test ! -f packages/studio/src/pages/review.ts` (exit 0).
- `git grep -i 'legacy' packages/studio/src/` returns clean except in `pages/shortform-review.ts` header (where it's documenting deferral).
- `git grep -E '(migration window|coexist during|will land later|stylings? will land|intentionally minimal)' packages/studio/src/` returns 0 matches.
- Studio test count: `npm test --workspace @deskwork/studio` shows count up by 25+ from pre-Layer-1 baseline.

**T23. Release.** Operator drives `/release` skill. Tag message names "Phase 34a — retire legacy review surface." Post-release: marketplace install + walk one entry end-to-end through the new surface. Close [#171](https://github.com/audiocontrol-org/deskwork/issues/171) post-verification per the formally-installed-release rule.

**Layer 3 PR acceptance:** all of T21-T22 pass. PR ships behind no flag, no toggle. Single atomic commit (or tightly-grouped commits if subagent-driven; T16-T20 form the structural delta).

## Files added vs. deleted (rough estimate)

| Layer | Added | Deleted | Net |
|---|---|---|---|
| 1 (data) | ~370 lines | 0 | +370 |
| 2 (chrome) | ~700 lines (mostly relocations) | ~700 lines (relocations from review.ts to entry-review.ts in PR 3) | mostly transitional |
| 3 (cutover) | ~250 lines (shortform-review.ts) + ~50 lines (route) | ~700 lines (review.ts) + ~70 lines (route) + ~20 lines (comments) | -490 |
| **Total** | **~620 net new** | **~790 net deleted** | **−170** |

The phase is net-deleting code, which is the whole point.

## Test count math

Workplan target: 25 new studio tests across 34a.

- Layer 1: ~10 (annotation store + history reader + 4 endpoints, ~2-3 each).
- Layer 2: ~10 (chrome component tests; some components are pure render and need 1-2 tests each, version strip + decision strip + margin-note authoring need more).
- Layer 3: ~5 (route restructure: bare-UUID-renders-shortform, bare-UUID-redirects-when-no-workflow, slug-catch-all-404, link-emitter unit checks).

= 25. Matches workplan.

## Operator action items (before any code)

1. **Annotation-store decision.** Option A or B. (See top of this doc.)
2. **Audit-the-audit.** Before locking Option A: spot-check 1-2 entries on this project's calendar that have prior margin notes. If those notes are high-value (substantive review feedback that would lose context if dropped), Option B becomes worth the cost. If they're throwaway ("typo here", "tighten this sentence"), Option A is fine.
3. **PR cadence.** Three PRs back-to-back, OR ship Layer 1, bake for some interval, then Layer 2, bake, then Layer 3? The 3-PR shape is set; the cadence between them is operator's call.
4. **Subagent vs. inline.** Layer 1 = inline-feasible (small, clean modules). Layer 2 = subagent-friendly (10 parallelizable chrome ports). Layer 3 = inline-mandatory (the cutover is high-stakes; controller has to drive the verification per `ui-verification.md`).

## Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| `iterateEntry` doesn't currently snapshot file content (T3 blocked) | Medium | T3 grows by ~50 lines (snapshot extension) | Verify in T1 timeframe; if true, fold the snapshot extension into T3's plan |
| Margin-note authoring depends on selection geometry that changed across versions | Low | T11 grows | Existing `editorial-review-client.ts` has the geometry logic; relocation should preserve |
| Decision endpoint semantics differ between workflow-keyed and entry-keyed (e.g., what "approve" means at each stage) | Medium | T4 + T13 grow | Existing entry-stage endpoints (`/entry/:entryId/approve`) already handle this; T13's decision strip just wraps them |
| Layer 3 cutover surfaces a chrome bug that shipped in Layer 2 | Medium | Layer 3 PR slips | The Layer 2 PR is supposed to land on `feature/deskwork-plugin` and bake; operator manual-walks before Layer 3 starts |
| Workflow records that legacy surface depended on get deleted in T19 but turn out to be needed by some other surface | Low | Surface breaks post-Layer-3 | T19's audit step explicitly checks for non-shortform callers; if found, file them as new tasks before the delete |
| Annotation Option B chosen, migration script has edge cases (entry without workflow predecessor) | Medium | T2 + 1 day | Migration script writes a manifest of unmigratable annotations to a JSON sidecar for operator triage |

## What this breakdown deliberately does NOT include

- The corrupted-review audit (lives in 34e, depends on 34a shipping).
- The repo-wide grep audit (lives in 34e).
- The shortform-migration phase (separate future phase, tracked under the shortform-deferral issue created in T17).
- Any UX redesign — chrome ports preserve existing visual treatment per PRD § "Not a redesign."

## Next step

Operator confirms (1) Option A vs B for annotation store + (4) subagent vs inline for Layer 2. Then T2 starts (or T1 first if migration script is in scope).
