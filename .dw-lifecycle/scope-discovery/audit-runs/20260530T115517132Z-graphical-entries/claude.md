I walked the diff focusing on the audit's named concerns — drag-API quirks, deep-link encoding/round-trip, preset storage limits, preset migration on lane-id change, and persistence race conditions. Findings below.

### Save button flashes success even when preset persistence silently fails

Finding-ID: AUDIT-BARRAGE-claude-01
Status:     open
Severity:   medium
Surface:    `plugins/deskwork-studio/public/src/dashboard/swimlane-presets.ts:handleSaveClick` (the `savePresetFromCurrent → renderPresetList → flashSaveConfirm` sequence) + `swimlane-presets-store.ts:writePresets` (the swallowed `try/catch`)

`writePresets` swallows every `localStorage.setItem` failure (`catch { /* localStorage unavailable */ }`), and `savePresetFromCurrent` returns the constructed preset unconditionally regardless of whether the write landed. `handleSaveClick` then calls `renderPresetList` (which re-reads storage via `listPresets`) and `flashSaveConfirm(saveBtn)` (which always paints the green "is-flashing" success state). When the write fails — quota exceeded after many presets, or Safari private-mode `setItem` throwing — the operator sees the green success flash but the new row never appears in the list, because `renderPresetList` re-read storage that never received the preset. The two signals contradict each other.

This is the audit's named "localStorage quota" concern made concrete: there is no quota-aware error path and no cap on preset count, so the failure mode is reachable. A reasonable fix: have `savePresetFromCurrent`/`writePresets` return a boolean success, and gate `flashSaveConfirm` + `renderPresetList` on it — surfacing a visible error (e.g. a red flash + message) when the write failed rather than a false success.

### Presets are never reconciled when a lane is renamed/archived/purged — asymmetry with the drag-order path

Finding-ID: AUDIT-BARRAGE-claude-02
Status:     open
Severity:   medium
Surface:    `plugins/deskwork-studio/public/src/dashboard/swimlane-presets-store.ts:applyPreset` + `snapshotCurrentState`; contrast `swimlane-drag.ts:reconcileOrder`

The drag-order controller defends against stale lane ids: `reconcileOrder` (`swimlane-drag.ts`) checks every stored id against the live lane set and collapses to the server order if any stored id is missing. The preset store has no equivalent. `applyPreset` writes `preset.focusedLanes` verbatim into the `:focus` key, including ids for lanes that no longer exist on disk (renamed/archived/purged). `snapshotCurrentState`/`savePresetFromCurrent` likewise persist whatever stale ids are in the focus key. There is no pruning, migration, or validity check anywhere in the preset lifecycle.

This is exactly the audit's "preset migration when lane id changes" concern. The consequence is benign-but-accumulating: presets retain dead lane references indefinitely, and `applyPreset`'s visibility computation (`allLanes.filter(id => !visibleSet.has(id))`) silently drops unknown lanes while focus retains them — producing a focus set referencing nonexistent lanes. A fix should mirror `reconcileOrder`: intersect each preset axis against the live lane set at apply time (and optionally rewrite the stored preset to drop dead ids), so presets self-heal across lane renames the way lane-order already does.

### `applyPreset` does not enforce the hidden⇒not-focused invariant the live controllers maintain

Finding-ID: AUDIT-BARRAGE-claude-03
Status:     open
Severity:   low
Surface:    `plugins/deskwork-studio/public/src/dashboard/swimlane-presets-store.ts:applyPreset` (visibility write at the `writeJsonOrIgnore(visibilityKey...)` step + focus write at `writeJsonOrIgnore(focusKey..., preset.focusedLanes)`)

`applyPreset` writes `visibleLanes` and `focusedLanes` to storage as two independent verbatim writes. Its own docstring acknowledges the hazard: focus is written last "because the visibility pass … may force-hide a lane that the preset's `focusedLanes` then re-includes." Nothing intersects the two — a preset whose `focusedLanes` contains a lane absent from `visibleLanes` is written through as-is, yielding a stored state where a hidden lane is also focused. In normal interactive operation the swimlane controller keeps these consistent (hiding a lane drops it from focus), so this invalid combination only arises from a hand-edited/migrated/imported preset — but `applyPreset` is precisely the import boundary where the invariant should be re-asserted.

The downstream `reapplyFromStorage` builds state from both keys with no documented intersection, so the invalid combo can paint a lane as both stub-hidden and focus-styled. A fix: at apply time, filter `focusedLanes` to the intersection with the resolved visible set before writing, so the stored state is always internally consistent regardless of preset provenance.

### Deep-link `?preset=<id>` only resolves in the originating browser — silent no-op everywhere else

Finding-ID: AUDIT-BARRAGE-claude-04
Status:     open
Severity:   low
Surface:    `plugins/deskwork-studio/public/src/dashboard/swimlane-presets-store.ts:savePresetFromCurrent` (id minting: `const id = \`p${now.getTime().toString(36)}\``) + `swimlane-presets.ts:applyDeepLinkPreset`

The deep-link contract (`/dev/editorial-studio?preset=<id>`, PRD Task 5.5) reads the id from the URL and looks it up in localStorage; on miss it is a silent no-op (`applyDeepLinkPreset`: `if (preset === undefined) return;`). But preset ids are minted from a per-browser local timestamp (`p<getTime base36>`) and presets live only in that browser's localStorage. A URL copied to a collaborator, a different machine, or even an incognito window resolves to nothing, with no message explaining why the deep link did nothing.

"Deep-link URL" in the PRD framing implies shareability; the implementation delivers same-browser cold-load rehydration only. This may be acceptable under THESIS Consequence 2 (collaborators see their own local state), but the gap between the "deep-link" label and the actual scope is worth an explicit operator decision and, at minimum, a visible "preset not found" affordance instead of a silent return so the operator isn't left wondering whether the link is broken.

### SSR "no flash-of-empty-content" claim is false for operators who have saved presets

Finding-ID: AUDIT-BARRAGE-claude-05
Status:     open
Severity:   low
Surface:    `packages/studio/src/pages/dashboard/swimlane-rail.ts:renderPresetSurface` docstring ("re-rendered identically by the client … no flash-of-empty-content") vs `plugins/deskwork-studio/public/src/dashboard/swimlane-presets.ts:renderPresetList`

The server always renders the preset list with the empty-state child `<span class="preset-empty">No saved presets</span>` because the server has no access to the operator's localStorage. The docstring claims the client "re-renders identically … no flash-of-empty-content." That holds only for an operator with zero presets. An operator who has saved presets gets SSR "No saved presets" on first paint, then `renderPresetList` wipes it (`container.textContent = ''`) and populates the real rows once the client boots — i.e. exactly the empty→populated flash the comment asserts is avoided.

The claim is an overstatement of the SSR/CSR symmetry. Either soften the docstring to scope the no-flash guarantee to the empty case, or accept the flash and document it honestly — the current wording will mislead the next reader into assuming hydration is flash-free in all cases.

### DRY regression: `readJsonArrayOfStrings` re-implements the very reader this diff extracted to dedupe

Finding-ID: AUDIT-BARRAGE-claude-06
Status:     open
Severity:   low
Surface:    `plugins/deskwork-studio/public/src/dashboard/swimlane-presets-store.ts:readJsonArrayOfStrings` (and the trio `writePresets`/`writeJsonOrIgnore`/`writeStoredOrder` across the three files)

This diff's stated cleanup extracted `readStoredStringArray` into `swimlane-storage.ts` specifically to dedupe the JSON-array read between `swimlane.ts` and `swimlane-drag.ts` (see the new export's docstring). In the same diff, `swimlane-presets-store.ts` imports `readStoredObjectMap` and `STORAGE_KEY_PREFIX` from that module but does **not** use the new `readStoredStringArray` — it defines its own `readJsonArrayOfStrings` doing the identical try/parse/filter logic (just returning `[]` instead of `null` on failure). The same pattern repeats on the write side: `writePresets`, `writeJsonOrIgnore` (presets-store), and `writeStoredOrder` (drag) are three near-identical `try { setItem(JSON.stringify) } catch {}` helpers.

Introducing a fourth copy of the reader in the same changeset that was consolidating copies is a maintainability regression — the next bug fix to the read/parse path now has to be applied in two places that look intentionally unified. Fix: have `readJsonArrayOfStrings` delegate to `readStoredStringArray` (coercing `null → []`), and factor the write-with-swallow helper into `swimlane-storage.ts` so all four call sites share one implementation.

### Test suite never exercises localStorage write-failure / quota for either feature

Finding-ID: AUDIT-BARRAGE-claude-07
Status:     open
Severity:   low
Surface:    `packages/studio/test/dashboard-swimlane-presets-client.test.ts` + `packages/studio/test/dashboard-swimlane-drag-client.test.ts`

Both new test files assert happy-path persistence (`localStorage.getItem(...)` equals the expected JSON) but neither simulates a `setItem` that throws — the exact failure the production code defends against with swallowed `try/catch` blocks in `writePresets`, `writeJsonOrIgnore`, `writeStoredOrder`, and `writeStoredSet`. Because the catch is silent, the only way to know the fallback behaves as documented ("in-page state still works"; "the operator just loses persistence across reloads") is a test that stubs `setItem` to throw and asserts the DOM reorder/apply still happened without an exception escaping the handler.

This matters specifically because finding-01 shows the swallow currently produces a misleading success flash — a test that drives the throw path would have surfaced that contradiction. Add a case per file that monkeypatches `window.localStorage.setItem` to throw, then asserts (a) no exception propagates out of the drop/save handler and (b) the in-DOM reorder/preset-apply still completed.
