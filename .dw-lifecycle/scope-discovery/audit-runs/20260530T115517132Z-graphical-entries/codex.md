### Preset storage write failures are reported as successful saves/applies

Finding-ID: AUDIT-BARRAGE-codex-01  
Status:     open  
Severity:   medium  
Surface:    plugins/deskwork-studio/public/src/dashboard/swimlane-presets-store.ts:209-221,349-414; plugins/deskwork-studio/public/src/dashboard/swimlane-presets.ts:188-205

`writePresets` and `writeJsonOrIgnore` catch every `localStorage.setItem` failure, including quota and private-mode failures, then return normally. `savePresetFromCurrent` still returns a preset, `handleSaveClick` re-renders from storage and flashes success, and `applyPreset` re-reads storage after ignored writes, so a preset load can silently apply stale or partially updated state.

This directly intersects the audit scope's localStorage quota concern. A reasonable fix is to make write helpers return success/failure or throw a typed error, then avoid success UI and avoid reapplying from storage when the requested state was not durably written.

### Workplan marks a scoped server-side preset path as postponed

Finding-ID: AUDIT-BARRAGE-codex-02  
Status:     open  
Severity:   low  
Surface:    docs/1.0/001-IN-PROGRESS/graphical-entries/workplan.md:267-271

Task 5.5.2 is checked complete while the line explicitly says the `.deskwork/personal/<operator-id>/focus-presets.json` server-side path is postponed to Phase 6. The project instructions reject open-ended postponement language because it turns scope changes into untracked project debt.

If localStorage-only is the intended Phase 5 contract, the workplan should state that as the accepted scope without a Phase 6 promise. If the file-backed path remains required by the PRD, the task should not be marked complete until that path exists or a tracked issue records the changed scope.

### Stored lane order accepts duplicate IDs and can poison reorder state

Finding-ID: AUDIT-BARRAGE-codex-03  
Status:     open  
Severity:   low  
Surface:    plugins/deskwork-studio/public/src/dashboard/swimlane-storage.ts:53-63; plugins/deskwork-studio/public/src/dashboard/swimlane-drag.ts:72-89,371-392

`readStoredStringArray` preserves duplicate strings, and `reconcileOrder` only checks that each stored id exists in the live lane set. A corrupted or manually edited value like `["qa","qa","default"]` passes validation, becomes `state.order`, and can be written back after the next real reorder. DOM appends of the same element are mostly harmless visually, but the controller's order model is no longer a one-to-one lane permutation.

The order reader should validate uniqueness and exact permutation semantics after appending newly added lanes. Duplicate stored ids should be treated like stale ids: discard the stored order and use the live server-rendered order.
