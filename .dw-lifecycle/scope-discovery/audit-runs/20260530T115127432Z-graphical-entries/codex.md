### Mobile lane sheet opens like a modal but does not trap focus

Finding-ID: AUDIT-BARRAGE-codex-01  
Status:     open  
Severity:   high  
Surface:    plugins/deskwork-studio/public/src/dashboard/swimlane-mobile-sheet.ts:54-131; plugins/deskwork-studio/public/src/mobile-shell/sheet-controller.ts:96-123

`initSwimlaneMobileSheet` opens a scrim-backed bottom sheet, moves focus into it, and returns focus to the trigger on close, but it never traps `Tab` / `Shift+Tab` while open. The shared `createSlideUpSheet` controller only toggles the body attribute and handles Escape/scrim/drag close; it also has no focus-trap behavior. Keyboard users can tab out of the open sheet into the page behind the scrim, which violates the stated Task 5.3 audit target for mobile-sheet a11y.

Fix by adding an open-state `keydown` handler for `Tab` that cycles through focusable controls inside `[data-lane-sheet]`, or by extending `createSlideUpSheet` with an opt-in focus-trap contract and enabling it here. Add a jsdom test that opens the lane sheet, presses `Tab` from the last focusable element, and asserts focus wraps inside the sheet.

### Unbucketed template-stage entries are counted but never rendered

Finding-ID: AUDIT-BARRAGE-codex-02  
Status:     open  
Severity:   high  
Surface:    packages/studio/src/pages/dashboard/lane-data.ts:266-273; packages/studio/src/pages/dashboard/swimlane-card.ts:391-422

`bucketIntoLanes` explicitly captures entries whose `currentStage` is not in the lane template into `bucket.unbucketed`, and `entryCount` includes those rows. But `renderSwimlane` only renders `template.linearStages` and `template.offPipelineStages`; it never emits `bucket.unbucketed`. The operator sees the lane count include the entry, but the row itself disappears from the stage grid/list chrome.

This recreates the “unknown stage drops content” shape on the studio dashboard, even though the data layer has already preserved the rows. Fix by rendering an explicit unbucketed/unknown-stage tail column or diagnostic row per lane, with a visible label and the affected entries.

### Held Space repeat on compose/empty CTA still allows page scroll

Finding-ID: AUDIT-BARRAGE-codex-03  
Status:     open  
Severity:   low  
Surface:    plugins/deskwork-studio/public/src/dashboard/swimlane-compose.ts:250-262

The new Space handler returns early on `ev.repeat` before calling `preventDefault`. That stops repeated clipboard writes, but held Space keydown repeats can still perform the browser’s default scroll behavior while focus remains on the button. The comment says Space activation suppresses page scroll, but the repeat path does not.

Fix by calling `ev.preventDefault()` for every Space keydown before the repeat guard, then returning on repeat before activation.
