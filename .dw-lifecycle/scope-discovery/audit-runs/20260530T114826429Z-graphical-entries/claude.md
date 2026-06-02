I focused my audit on the production code in the diff — the studio dashboard render path and client controllers (Phase 5 Tasks 5.1/5.1A/5.1B/5.1C) — and set aside the scope-discovery JSON evidence dumps, which are generated artifacts. Findings below.

### Lane-bucket `unbucketed` entries are silently dropped from the rendered dashboard while inflating every entry count

Finding-ID: AUDIT-BARRAGE-claude-01
Status:     open
Severity:   high
Surface:    `packages/studio/src/pages/dashboard/swimlane-card.ts` (`renderSwimlane`, the stage-column assembly ~lines after "const stagesRaw"), `packages/studio/src/pages/dashboard/lane-data.ts` (`LaneBucket.unbucketed` + `loadLaneBuckets` entryCount math)

`loadLaneBuckets` captures entries whose `currentStage` is not in the lane's resolved template into `bucket.unbucketed`, and folds them into `entryCount`: `let total = unbucketed.length; for (const stageBucket of builder.byStage.values()) total += stageBucket.length; finalByLane.set(id, freezeBucket(builder, unbucketed, total))`. But `renderSwimlane` only renders columns for `template.linearStages` + `template.offPipelineStages` — it never reads `bucket.unbucketed`. The list-body (`swimlane-list-body.ts:renderListBody`) walks the same template stages and likewise never renders unbucketed entries. The result: an entry sitting in a valid-but-out-of-template stage (reachable since Phase 3 widened `currentStage` to an arbitrary non-empty string — stale stage, typo, mid-migration drift) **vanishes from the dashboard entirely**, while the swim-head meta (`${bucket.entryCount} entries`), the focus chip count, the rail row count, and the swim-compact strip all show the inflated total. The operator reads "5 entries" but sees 4 cards, with no visible indicator of the discrepancy.

This is the same failure shape the prior audit log calls out as a regression of #247 / AUDIT-20260530-14 ("renderer silently drops entries whose currentStage isn't in their lane's template"), now on the canonical studio dashboard surface. The `lane-data.ts` docstring actively misdescribes the behavior: *"the dashboard surfaces it instead of crashing — the operator sees the count and can run doctor."* The count is surfaced but the entries are not, and there is no "unbucketed" / "unrecognized stage" affordance anywhere in the render. Contrast with `unroutedEntries`, which at least gets a `${n} unrouted · ` token in `swimlane-shell.ts:metaRaw` — unbucketed gets nothing. The integration test (`dashboard-swimlane.test.ts`) only seeds entries in valid stages, so it cannot catch this. Fix: render `bucket.unbucketed` into an explicit `(unrecognized stage)` tail section per swim (mirroring the unrouted treatment), or — at minimum — surface the per-lane unbucketed count distinctly so the count never silently exceeds the visible cards.

### No clear-on-version-bump for swimlane localStorage state — schema drift silently persists stale per-operator state

Finding-ID: AUDIT-BARRAGE-claude-02
Status:     open
Severity:   medium
Surface:    `plugins/deskwork-studio/public/src/dashboard/swimlane-storage.ts` (`STORAGE_KEY_PREFIX`, `resolveProjectKey`, `readStoredObjectMap`) and the four key suffixes in `swimlane.ts` / `swimlane-collapse.ts` / `swimlane-view-toggle.ts`

The audit scope explicitly names "client-state persistence + restore (localStorage corruption resilience; clear-on-version-bump)" as a focus. Corruption resilience is handled well — every reader (`readStoredObjectMap`, `readStoredSet`, `readStoredLanes`, `readStoredStages`) wraps `JSON.parse` in try/catch and validates the parsed shape, degrading to an empty collection on any failure. But there is **no version segment in the storage keys and no clear-on-version-bump mechanism**. Keys are `deskwork:dashboard:<projectKey>:<suffix>` with no schema-version component anywhere in `swimlane-storage.ts`.

This matters because the corruption guards only protect against *shape* changes (an array becoming an object, an unknown value type). They do not protect against *semantic* drift within a stable shape — e.g., if a future release changes how `view-mode` values map, or repurposes the `stage-collapse` `Record<laneId, string[]>`, the old data parses cleanly and is silently honored, restoring stale or wrong state for every returning operator. Since this is per-operator browser state that survives plugin upgrades indefinitely, there is no natural eviction. The fix is a version token in the key prefix (e.g. `deskwork:dashboard:v1:<projectKey>:<suffix>`) bumped whenever a value's semantics change, so an upgrade starts from clean defaults rather than reinterpreting prior-version state. The absence is auditable here precisely because the operator listed it as expected.

### Rail eye-toggle `.r-eye-btn` is a 14px-wide interactive target with no min-height — below WCAG 2.5.8 while every sibling affordance was sized to 24×24

Finding-ID: AUDIT-BARRAGE-claude-03
Status:     open
Severity:   low
Surface:    `plugins/deskwork-studio/public/css/dashboard-swimlane.css` (`.rail-lane .r-eye-btn` rule: `width: 14px; ... padding: 0;`)

The diff is otherwise meticulous about WCAG 2.2 SC 2.5.8 target-size minimums — `.collapse-chev` is `min-width: 24px; min-height: 24px`, `.view-toggle .vt-cell` is `min-height: 24px`, `.swim-compose` is `min-height: 26px` (30px mobile), `.lb-overflow` is `min-width: 24px; min-height: 24px`. But the rail visibility toggle, promoted in the F6 a11y fix from a `<span>` to a real focusable `<button class="r-eye-btn">`, is styled `width: 14px; ... padding: 0;` with no min-height — well under the 24×24 floor. It is a distinct interactive control (its own click handler in `swimlane.ts:bindRailEyeToggles`, with `stopPropagation` so it does not share the row's focus-toggle gesture), so it is independently subject to the target-size rule.

The WCAG 2.5.8 spacing exception (a 24px-diameter undisturbed circle around the target) is the only thing that might save it, and that depends on the eye glyph being far enough from the row's other clickable region — but the whole `.rail-lane` row is itself `role="button"` and clickable, so the eye button sits *inside* another target rather than in clear space, which the spacing exception does not cover. Given the F6 fix deliberately made this a real button for keyboard/AT access, sizing it to 24×24 (min-width/min-height + centered glyph, matching the `.collapse-chev` pattern already in the same file) finishes the job. Low severity because it is reachable and operable, just below the measured-target threshold the rest of the feature honors.
