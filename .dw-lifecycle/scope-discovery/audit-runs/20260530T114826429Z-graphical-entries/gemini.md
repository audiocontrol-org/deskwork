### AUDIT-BARRAGE-gemini-01

Finding-ID: AUDIT-BARRAGE-gemini-01
Status:     open
Severity:   medium
Surface:    `packages/studio/src/pages/dashboard/swimlane-card.ts:127`

The stage ID slugification logic in `renderStageCol` (and implicitly in `renderListGroup` through shared stage name derivation) still uses `stage.toLowerCase().replace(/[^a-z0-9-]+/g, '-')`. This can lead to DOM ID collisions when a single lane has distinct stage names that slugify to the same value (e.g., `QA Review` and `QA_Review` both become `qa-review`). This issue is explicitly flagged as AUDIT-20260528-07 in the provided `audit-log.md` and remains unfixed in this diff. The proposed fix in AUDIT-20260528-07 is to use `stageNameToFilesystemToken(stage)` or a dedicated DOM-token helper, neither of which is implemented or used in `swimlane-card.ts`.

### AUDIT-BARRAGE-gemini-02

Finding-ID: AUDIT-BARRAGE-gemini-02
Status:     open
Severity:   medium
Surface:    `packages/studio/src/pages/dashboard/swimlane-list-body.ts:109`

The list-view overflow affordance (`.lb-overflow`) is rendered as a `<span>` with `role="button"` and `tabindex="0"` inside an `<a>` element (`.lb-row`). This makes it a focusable and semantically interactive control. However, the accompanying comment explicitly states, "Task 5.1C / 5.2 wires a click handler to the affordance; the markup ships with `role="button"` + `tabindex="0"` + `aria-label` so the semantics are correct at the affordance level even when no handler is bound." This creates an operator-discipline trap (per the prompt's definition): a user can focus and attempt to activate this "button," but it will be inert until a future task implements its behavior. Interactive elements should not be focusable if they perform no action, as this leads to a confusing and frustrating user experience. This issue is explicitly flagged as AUDIT-20260528-08 in `audit-log.md` and remains unfixed.

### AUDIT-BARRAGE-gemini-03

Finding-ID: AUDIT-BARRAGE-gemini-03
Status:     open
Severity:   medium
Surface:    `plugins/deskwork-studio/public/src/dashboard/swimlane.ts:251-254`

The logic for the "All" focus chip in `bindFocusChips` contains an unconditional `state.focused.clear()` before conditionally re-populating `state.focused`. This means that if all visible lanes are already focused (`isAlreadyAll` is true), clicking the "All" chip will still clear the `state.focused` set and leave no lanes focused. This directly contradicts the expected behavior in AUDIT-20260528-09, which states, "Expected: clicking `All` restores or keeps every visibility-on lane focused. Actual: when every visible lane is already focused, clicking `All` leaves the focus set empty." The suggested fix was to make "All" idempotently select all visible lanes, which the current implementation does not achieve.

### AUDIT-BARRAGE-gemini-04

Finding-ID: AUDIT-BARRAGE-gemini-04
Status:     open
Severity:   medium
Surface:    `docs/1.0/001-IN-PROGRESS/graphical-entries/workplan.md:231` (and related mobile rendering)

The mobile dashboard lane-stack/lane-head variant, specified in `docs/studio-design/ACCEPTED/2026-05-27-multi-lane-dashboard-d3-press-bay/brief.md:14` as a "vertical lane-stack of accordion sections on mobile," appears to be incompletely implemented. While `workplan.md` marks Step 5.1B.4 as completed and the CSS (`dashboard-swimlane.css`) includes media queries for mobile, the implementation primarily adapts the desktop swim markup using CSS (`flex-direction: column` for `.stage-grid`). The audit finding AUDIT-20260528-10 points out this discrepancy, stating "mobile gets desktop swim markup adapted by CSS while the 5.1B workplan text marks the lane-head mobile variant as shipped." The "accordion sections" and a distinct "lane-head" renderer path for mobile seem absent, suggesting a gap between the accepted design and the delivered implementation.

### AUDIT-BARRAGE-gemini-05

Finding-ID: AUDIT-BARRAGE-gemini-05
Status:     informational
Severity:   low
Surface:    `docs/1.0/001-IN-PROGRESS/graphical-entries/tooling-feedback.md`

The `tooling-feedback.md` explicitly lists TF-008, TF-009, and TF-010 as `Open` issues related to the scope-discovery tooling. While these are not directly bugs in the feature under audit, they represent acknowledged friction points with the development tooling. The resolution paths for TF-008 and TF-009 are documented as updates to `GRAMMAR_INSTRUCTION` (documentation-only fixes), and TF-010 is an upstream stub (#318). It's important for the operator to note that these tooling-related issues persist and might affect agent performance or developer experience, even if they don't block the feature's functional correctness.
