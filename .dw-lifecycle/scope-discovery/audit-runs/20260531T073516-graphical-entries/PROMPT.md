# Audit-barrage - multi-model audit prompt template

You are an independent audit reviewer firing as part of a multi-model audit barrage. Surface bugs, design issues, missed edge cases, and code-quality concerns in the work product captured in the diff below. Do not modify files. Findings must be anchored to specific files/lines in the diff or a missing surface that should be in the diff. If no findings, say so clearly and mention residual risk.

## Feature under audit

graphical-entries

## Feature scope

Task 0.2 of graphical-entries Phase 0 audit-barrage cleanup queue. Closes AUDIT-20260530-26: dashboard swimlane localStorage state had no schema/version segment, so stale valid values survived plugin upgrades. Fix added STORAGE_SCHEMA_VERSION and changed the shared dashboard localStorage prefix to deskwork:dashboard:v2:, then updated affected client tests/fixtures and docs.

## Commit subjects in audited range

ec51035 Closes AUDIT-20260530-26 (cross-model: AUDIT-BARRAGE-claude-P5-1)
5557ddc Record AUDIT-20260530-26 closure


## Recent audit-log excerpt


### AUDIT-20260530-26 — [P5-1 claude] No clear-on-version-bump for swimlane localStorage state — schema drift silently persists stale per-operator state

Finding-ID: AUDIT-20260530-26 (cross-model: AUDIT-BARRAGE-claude-P5-1)
Status:     fixed-ec51035
Severity:   medium
Surface:    `plugins/deskwork-studio/public/src/dashboard/swimlane-storage.ts` (`STORAGE_KEY_PREFIX`, `resolveProjectKey`, `readStoredObjectMap`) and the four key suffixes in `swimlane.ts` / `swimlane-collapse.ts` / `swimlane-view-toggle.ts`

The audit scope explicitly names "client-state persistence + restore (localStorage corruption resilience; clear-on-version-bump)" as a focus. Corruption resilience is handled well — every reader (`readStoredObjectMap`, `readStoredSet`, `readStoredLanes`, `readStoredStages`) wraps `JSON.parse` in try/catch and validates the parsed shape, degrading to an empty collection on any failure. But there is **no version segment in the storage keys and no clear-on-version-bump mechanism**. Keys are `deskwork:dashboard:<projectKey>:<suffix>` with no schema-version component anywhere in `swimlane-storage.ts`.

This matters because the corruption guards only protect against *shape* changes (an array becoming an object, an unknown value type). They do not protect against *semantic* drift within a stable shape — e.g., if a future release changes how `view-mode` values map, or repurposes the `stage-collapse` `Record<laneId, string[]>`, the old data parses cleanly and is silently honored, restoring stale or wrong state for every returning operator. Since this is per-operator browser state that survives plugin upgrades indefinitely, there is no natural eviction. The fix is a version token in the key prefix (e.g. `deskwork:dashboard:v1:<projectKey>:<suffix>`) bumped whenever a value's semantics change, so an upgrade starts from clean defaults rather than reinterpreting prior-version state. The absence is auditable here precisely because the operator listed it as expected.

Surfaced by audit-barrage run `20260530T114826429Z-graphical-entries` (claude). Run-dir at `.dw-lifecycle/scope-discovery/audit-runs/20260530T114826429Z-graphical-entries/claude.md`.

### AUDIT-20260530-27 — [P5-1 claude] Rail eye-toggle `.r-eye-btn` is a 14px-wide interactive target with no min-height — below WCAG 2.5.8 while every sibling affordance was sized to 24×24

Finding-ID: AUDIT-20260530-27 (cross-model: AUDIT-BARRAGE-claude-P5-1)
Status:     open
Severity:   low
Surface:    `plugins/deskwork-studio/public/css/dashboard-swimlane.css` (`.rail-lane .r-eye-btn` rule: `width: 14px; ... padding: 0;`)

The diff is otherwise meticulous about WCAG 2.2 SC 2.5.8 target-size minimums — `.collapse-chev` is `min-width: 24px; min-height: 24px`, `.view-toggle .vt-cell` is `min-height: 24px`, `.swim-compose` is `min-height: 26px` (30px mobile), `.lb-overflow` is `min-width: 24px; min-height: 24px`. But the rail visibility toggle, promoted in the F6 a11y fix from a `<span>` to a real focusable `<button class="r-eye-btn">`, is styled `width: 14px; ... padding: 0;` with no min-height — well under the 24×24 floor. It is a distinct interactive control (its own click handler in `swimlane.ts:bindRailEyeToggles`, with `stopPropagation` so it does not share the row's focus-toggle gesture), so it is independently subject to the target-size rule.

The WCAG 2.5.8 spacing exception (a 24px-diameter undisturbed circle around the target) is the only thing that might save it, and that depends on the eye glyph being far enough from the row's other clickable region — but the whole `.rail-lane` row is itself `role="button"` and clickable, so the eye button sits *inside* another target rather than in clear space, which the spacing exception does not cover. Given the F6 fix deliberately made this a real button for keyboard/AT access, sizing it to 24×24 (min-width/min-height + centered glyph, matching the `.collapse-chev` pattern already in the same file) finishes the job. Low severity because it is reachable and operable, just below the measured-target threshold the rest of the feature honors.

Surfaced by audit-barrage run `20260530T114826429Z-graphical-entries` (claude). Run-dir at `.dw-lifecycle/scope-discovery/audit-runs/20260530T114826429Z-graphical-entries/claude.md`.

### AUDIT-20260530-28 — [P5-1 codex] Compose chip copies an invalid command for stage names with spaces

Finding-ID: AUDIT-20260530-28 (cross-model: AUDIT-BARRAGE-codex-P5-1)
Status:     open
Severity:   medium
Surface:    plugins/deskwork-studio/public/src/dashboard/swimlane-compose.ts:90-98; packages/studio/src/pages/dashboard/swimlane-card.ts:297-307

The copied command is assembled as `/deskwork:add <SLUG> --lane ${laneId} --stage ${firstStage}` with no argument quoting or escaping. That works for the current preset first stages (`Ideas`, `Sketched`, `Drafted`, etc.), but pipeline templates allow arbitrary non-empty stage strings, including names with spaces. A custom lane whose first stage is `QA Review` would copy `/deskwork:add <SLUG> --lane qa --stage QA Review`, which a normal argv parser reads as stage `QA` plus an extra `Review` token.

The server puts the raw first stage in `data-first-stage` at `swimlane-card.ts:303-307`, and the client serializes that value directly at `swimlane-compose.ts:90-98`. Fix by using the same command-argument quoting convention the slash-command parser expects, and add a regression with a custom template whose first linear stage contains whitespace and shell-sensitive characters.

Surfaced by audit-barrage run `20260530T114826429Z-graphical-entries` (codex). Run-dir at `.dw-lifecycle/scope-discovery/audit-runs/20260530T114826429Z-graphical-entries/codex.md`.

### AUDIT-20260530-29 — [P5-1 codex] Dashboard localStorage has no schema/version segment despite version-bump reset being in scope

Finding-ID: AUDIT-20260530-29 (cross-model: AUDIT-BARRAGE-codex-P5-1)
Status:     open
Severity:   medium
Surface:    plugins/deskwork-studio/public/src/dashboard/swimlane-storage.ts:21-27; plugins/deskwork-studio/public/src/dashboard/swimlane.ts:64-69; plugins/deskwork-studio/public/src/dashboard/swimlane-collapse.ts:60-65; plugins/deskwork-studio/public/src/dashboard/swimlane-view-toggle.ts:68-70

The audit scope explicitly calls out “clear-on-version-bump,” but all persisted dashboard keys are stable forever under `deskwork:dashboard:<projectKey>:<suffix>`. The readers tolerate malformed JSON, but they do not distinguish old valid shapes from current valid shapes. If the meaning of `:focus`, `:visibility`, `:lane-collapse`, `:stage-collapse`, or `:view-mode` changes, old operator state continues to apply silently.

This is most visible in `STORAGE_KEY_PREFIX = 'deskwork:dashboard:'`; every controller appends only project key and suffix. A reasonable fix is to add a storage schema version to the prefix or store a version sentinel and clear the known swimlane keys when it mismatches. Tests should seed an older-version key and assert the controller ignores or removes it while preserving current-version state.

Surfaced by audit-barrage run `20260530T114826429Z-graphical-entries` (codex). Run-dir at `.dw-lifecycle/scope-discovery/audit-runs/20260530T114826429Z-graphical-entries/codex.md`.

### AUDIT-20260530-30 — [P5-1 codex] Re-running swimlane initializers stacks duplicate event listeners with stale state closures

Finding-ID: AUDIT-20260530-30 (cross-model: AUDIT-BARRAGE-codex-P5-1)
Status:     open
Severity:   low
Surface:    plugins/deskwork-studio/public/src/editorial-studio-client.ts:527-530; plugins/deskwork-studio/public/src/dashboard/swimlane.ts:469-490; plugins/deskwork-studio/public/src/dashboard/swimlane-collapse.ts:464-477; plugins/deskwork-studio/public/src/dashboard/swimlane-view-toggle.ts:292-312; plugins/deskwork-studio/public/src/dashboard/swimlane-compose.ts:270-282

`init()` calls four swimlane controllers, and each controller unconditionally binds listeners to existing DOM nodes. `initSwimlane` also replaces `activeState` at lines 480-481, while previously bound handlers still close over their older `state` object. The same shape exists in collapse, view-toggle, and compose: re-invocation binds again without a module guard or per-element sentinel.

Current page boot may call these once, but the code already introduces `reapply*FromStorage` paths and singleton state for client-side refresh-style operations. If a partial DOM re-init calls any initializer twice, clicks can fire multiple handlers and mutate different closure-captured state objects. Fix with per-controller idempotence: a module-level wired guard for whole-page singletons, or `dataset` sentinels per bound element when dynamic DOM replacement is expected.

Surfaced by audit-barrage run `20260530T114826429Z-graphical-entries` (codex). Run-dir at `.dw-lifecycle/scope-discovery/audit-runs/20260530T114826429Z-graphical-entries/codex.md`.

### AUDIT-20260530-31 — [P5-1 gemini] The stage ID slugification logic in `renderStageCol` (and implicitly in `renderListGroup` through shared stage name derivation) still uses `stage.toLowerCase().replace(/[^a-z0-9-]+/g, '-')`. This can lead to DOM ID collisions when a single lane has distinct stage names that slugify to the same value (e.g., `QA Review` and `QA_Review` both become `qa-review`). This issue is explicitly flagged as AUDIT-20260528-07 in the provided `audit-log.md` and remains unfixed in this diff. The proposed fix in AUDIT-20260528-07 is to use `stageNameToFilesystemToken(stage)` or a dedicated DOM-token helper, neither of which is implemented or used in `swimlane-card.ts`.

## Diff under audit

diff --git a/docs/1.0/001-IN-PROGRESS/graphical-entries/audit-log.md b/docs/1.0/001-IN-PROGRESS/graphical-entries/audit-log.md
index e887933..8fb32de 100644
--- a/docs/1.0/001-IN-PROGRESS/graphical-entries/audit-log.md
+++ b/docs/1.0/001-IN-PROGRESS/graphical-entries/audit-log.md
@@ -3451,7 +3451,7 @@ Surfaced by audit-barrage run `20260530T114826429Z-graphical-entries` (claude).
 ### AUDIT-20260530-26 — [P5-1 claude] No clear-on-version-bump for swimlane localStorage state — schema drift silently persists stale per-operator state
 
 Finding-ID: AUDIT-20260530-26 (cross-model: AUDIT-BARRAGE-claude-P5-1)
-Status:     open
+Status:     fixed-ec51035
 Severity:   medium
 Surface:    `plugins/deskwork-studio/public/src/dashboard/swimlane-storage.ts` (`STORAGE_KEY_PREFIX`, `resolveProjectKey`, `readStoredObjectMap`) and the four key suffixes in `swimlane.ts` / `swimlane-collapse.ts` / `swimlane-view-toggle.ts`
 
diff --git a/docs/1.0/001-IN-PROGRESS/graphical-entries/workplan.md b/docs/1.0/001-IN-PROGRESS/graphical-entries/workplan.md
index ec10b4e..122ac68 100644
--- a/docs/1.0/001-IN-PROGRESS/graphical-entries/workplan.md
+++ b/docs/1.0/001-IN-PROGRESS/graphical-entries/workplan.md
@@ -143,17 +143,17 @@ Closes AUDIT-20260531-06. Surface: `packages/studio/src/pages/dashboard/swimlane
 
 Closes AUDIT-20260530-26 (cross-model: AUDIT-BARRAGE-claude-P5-1). Surface: `plugins/deskwork-studio/public/src/dashboard/swimlane-storage.ts` (`STORAGE_KEY_PREFIX`, `resolveProjectKey`, `readStoredObjectMap`) and the four key suffixes in `swimlane.ts` / `swimlane-collapse.ts` / `swimlane-view-toggle.ts`.
 
-- [ ] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
-- [ ] Step 2: confirm test fails against current code (verify the bug repros)
-- [ ] Step 3: implement the fix
-- [ ] Step 4: confirm test passes
-- [ ] Step 5: commit with `Closes AUDIT-20260530-26 (cross-model: AUDIT-BARRAGE-claude-P5-1)` in subject
+- [x] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
+- [x] Step 2: confirm test fails against current code (verify the bug repros)
+- [x] Step 3: implement the fix
+- [x] Step 4: confirm test passes
+- [x] Step 5: commit with `Closes AUDIT-20260530-26 (cross-model: AUDIT-BARRAGE-claude-P5-1)` in subject
 
 **Acceptance Criteria:**
 
-- [ ] Failing test exists at `(to be filled in by Step 1 implementer)` (cited in Step 1)
-- [ ] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
-- [ ] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step
+- [x] Failing test exists at `packages/studio/test/dashboard-swimlane-client.test.ts` — `AUDIT-20260530-26: ignores stale unversioned dashboard visibility state` (cited in Step 1)
+- [x] `npx vitest run packages/studio/test/dashboard-swimlane-client.test.ts packages/studio/test/dashboard-swimlane-collapse-client.test.ts packages/studio/test/dashboard-swimlane-collapse-list-client.test.ts packages/studio/test/dashboard-swimlane-view-toggle-client.test.ts packages/studio/test/dashboard-swimlane-presets-store-client.test.ts packages/studio/test/dashboard-swimlane-presets-client.test.ts packages/studio/test/dashboard-swimlane-presets-polish-client.test.ts packages/studio/test/dashboard-swimlane-integration-client.test.ts packages/studio/test/dashboard-lane-stack-client.test.ts packages/studio/test/dashboard-swimlane-drag-client.test.ts packages/studio/test/dashboard-swimlane-drag-client-pure.test.ts packages/studio/test/dashboard-swimlane-drag-client-reorder-buttons.test.ts` exits 0 (96 tests pass)
+- [x] Audit-log Status flipped to `fixed-ec51035` via the close-shipped-audit-findings step
 
 
 
diff --git a/packages/studio/test/__helpers/dashboard-swimlane-drag-fixture.ts b/packages/studio/test/__helpers/dashboard-swimlane-drag-fixture.ts
index 9dfd53d..1fd363a 100644
--- a/packages/studio/test/__helpers/dashboard-swimlane-drag-fixture.ts
+++ b/packages/studio/test/__helpers/dashboard-swimlane-drag-fixture.ts
@@ -30,7 +30,7 @@ if (typeof (globalThis as { CSS?: unknown }).CSS === 'undefined') {
 }
 
 export const PROJECT_KEY = 'task-5-4-drag-test-key';
-export const ORDER_STORAGE_KEY = `deskwork:dashboard:${PROJECT_KEY}:lane-order`;
+export const ORDER_STORAGE_KEY = `deskwork:dashboard:v2:${PROJECT_KEY}:lane-order`;
 
 export interface FakeDataTransfer {
   effectAllowed: string;
diff --git a/packages/studio/test/__helpers/dashboard-swimlane-presets-fixture.ts b/packages/studio/test/__helpers/dashboard-swimlane-presets-fixture.ts
index 8b3b528..783f8fb 100644
--- a/packages/studio/test/__helpers/dashboard-swimlane-presets-fixture.ts
+++ b/packages/studio/test/__helpers/dashboard-swimlane-presets-fixture.ts
@@ -18,7 +18,7 @@ import { initSwimlaneViewToggle } from '../../../../plugins/deskwork-studio/publ
 import type { PresetControllerHooks } from '../../../../plugins/deskwork-studio/public/src/dashboard/swimlane-presets';
 
 export const PROJECT_KEY = 'test-project-key';
-export const PREFIX = `deskwork:dashboard:${PROJECT_KEY}`;
+export const PREFIX = `deskwork:dashboard:v2:${PROJECT_KEY}`;
 
 interface CSSShim {
   escape: (id: string) => string;
diff --git a/packages/studio/test/dashboard-lane-stack-client.test.ts b/packages/studio/test/dashboard-lane-stack-client.test.ts
index c1bdecf..8fc2fd0 100644
--- a/packages/studio/test/dashboard-lane-stack-client.test.ts
+++ b/packages/studio/test/dashboard-lane-stack-client.test.ts
@@ -248,7 +248,7 @@ describe('lane-stack accordion client — AUDIT-20260528-10', () => {
     defaultChev?.click();
     // Persisted to localStorage under the expected key.
     const stored = window.localStorage.getItem(
-      'deskwork:dashboard:lane-stack-test-key:lane-stack-collapse',
+      'deskwork:dashboard:v2:lane-stack-test-key:lane-stack-collapse',
     );
     expect(stored).not.toBeNull();
     if (stored === null) throw new Error('stored value missing');
diff --git a/packages/studio/test/dashboard-swimlane-client.test.ts b/packages/studio/test/dashboard-swimlane-client.test.ts
index a96b459..9997f1e 100644
--- a/packages/studio/test/dashboard-swimlane-client.test.ts
+++ b/packages/studio/test/dashboard-swimlane-client.test.ts
@@ -95,6 +95,23 @@ describe('swimlane client controller — AUDIT-02 / AUDIT-04 acceptance', () =>
     expect(qaChip?.classList.contains('is-visibility-hidden')).toBe(false);
   });
 
+  it('AUDIT-20260530-26: ignores stale unversioned dashboard visibility state', () => {
+    window.localStorage.setItem(
+      'deskwork:dashboard:test-project-key:visibility',
+      JSON.stringify(['qa']),
+    );
+    buildShell(['default', 'mockups', 'qa']);
+    initSwimlane();
+    const qaRow = document.querySelector<HTMLElement>(
+      '[data-rail-lane="qa"]',
+    );
+    const qaChip = document.querySelector<HTMLButtonElement>(
+      '[data-focus-chip="qa"]',
+    );
+    expect(qaRow?.dataset.laneVisible).toBe('true');
+    expect(qaChip?.classList.contains('is-visibility-hidden')).toBe(false);
+  });
+
   it('F5: pressing Enter on a rail row toggles focus (mirrors the click handler)', () => {
     buildShell(['default', 'mockups', 'qa']);
     initSwimlane();
diff --git a/packages/studio/test/dashboard-swimlane-collapse-client.test.ts b/packages/studio/test/dashboard-swimlane-collapse-client.test.ts
index 3e2da93..fc25571 100644
--- a/packages/studio/test/dashboard-swimlane-collapse-client.test.ts
+++ b/packages/studio/test/dashboard-swimlane-collapse-client.test.ts
@@ -253,7 +253,7 @@ describe('swimlane collapse client — Task 5.1A', () => {
   });
 
   it('lane-collapse persists in localStorage across a simulated reload', () => {
-    const storageKey = 'deskwork:dashboard:task-5-1a-test-key:lane-collapse';
+    const storageKey = 'deskwork:dashboard:v2:task-5-1a-test-key:lane-collapse';
     buildShell([
       { laneId: 'default', laneName: 'Editorial', stages: ['Drafting'] },
       { laneId: 'mockups', laneName: 'Mockups', stages: ['Sketched'] },
@@ -295,7 +295,7 @@ describe('swimlane collapse client — Task 5.1A', () => {
   });
 
   it('stage-collapse persists in localStorage (per-lane scoped) across a simulated reload', () => {
-    const storageKey = 'deskwork:dashboard:task-5-1a-test-key:stage-collapse';
+    const storageKey = 'deskwork:dashboard:v2:task-5-1a-test-key:stage-collapse';
     buildShell([
       { laneId: 'default', laneName: 'Editorial', stages: ['Drafting', 'Final'] },
       { laneId: 'mockups', laneName: 'Mockups', stages: ['Sketched', 'Approved'] },
diff --git a/packages/studio/test/dashboard-swimlane-collapse-list-client.test.ts b/packages/studio/test/dashboard-swimlane-collapse-list-client.test.ts
index 2704126..70b39c5 100644
--- a/packages/studio/test/dashboard-swimlane-collapse-list-client.test.ts
+++ b/packages/studio/test/dashboard-swimlane-collapse-list-client.test.ts
@@ -33,7 +33,7 @@ describe('swimlane collapse client — Task 5.1B list-body extension', () => {
     // Mirror of the per-stage kanban test, scoped to the list-body
     // shape. Task 5.1B extended `swimlane-collapse.ts` to handle
     // both `.stage-col` AND `.lb-group` as the toggle parent.
-    const storageKey = 'deskwork:dashboard:task-5-1a-test-key:stage-collapse';
+    const storageKey = 'deskwork:dashboard:v2:task-5-1a-test-key:stage-collapse';
     document.body.innerHTML = '';
     window.localStorage.clear();
     const shell = document.createElement('section');
@@ -102,7 +102,7 @@ describe('swimlane collapse client — Task 5.1B list-body extension', () => {
     // Build a swim that carries BOTH a kanban `.stage-col` AND a
     // list-body `.lb-group` for the same stage. Persisting one
     // collapses the other on reload — shared state per lane:stage.
-    const storageKey = 'deskwork:dashboard:task-5-1a-test-key:stage-collapse';
+    const storageKey = 'deskwork:dashboard:v2:task-5-1a-test-key:stage-collapse';
     window.localStorage.setItem(storageKey, JSON.stringify({ default: ['Drafting'] }));
     document.body.innerHTML = '';
     const shell = document.createElement('section');
diff --git a/packages/studio/test/dashboard-swimlane-integration-client.test.ts b/packages/studio/test/dashboard-swimlane-integration-client.test.ts
index 8a5eb81..99ab505 100644
--- a/packages/studio/test/dashboard-swimlane-integration-client.test.ts
+++ b/packages/studio/test/dashboard-swimlane-integration-client.test.ts
@@ -189,7 +189,7 @@ describe('Phase 5 Task 5.6 — multi-lane integration (client)', () => {
 
   it('Step 5.6.2: pre-seed visibility-hidden state, mount controllers, chip + swim + rail row all carry the hidden signals', () => {
     // Pre-seed BEFORE building the shell (controllers read storage on init).
-    const visibilityKey = `deskwork:dashboard:${PROJECT_KEY}:visibility`;
+    const visibilityKey = `deskwork:dashboard:v2:${PROJECT_KEY}:visibility`;
     window.localStorage.setItem(visibilityKey, JSON.stringify(['qa']));
     buildShell();
     mountAllControllers();
diff --git a/packages/studio/test/dashboard-swimlane-presets-polish-client.test.ts b/packages/studio/test/dashboard-swimlane-presets-polish-client.test.ts
index cfafa8d..26549fd 100644
--- a/packages/studio/test/dashboard-swimlane-presets-polish-client.test.ts
+++ b/packages/studio/test/dashboard-swimlane-presets-polish-client.test.ts
@@ -40,7 +40,7 @@ import {
 } from '../../../plugins/deskwork-studio/public/src/dashboard/swimlane-presets-store';
 
 const PROJECT_KEY = 'test-project-key';
-const PREFIX = `deskwork:dashboard:${PROJECT_KEY}`;
+const PREFIX = `deskwork:dashboard:v2:${PROJECT_KEY}`;
 
 interface CSSShim {
   escape: (id: string) => string;
diff --git a/packages/studio/test/dashboard-swimlane-view-toggle-client.test.ts b/packages/studio/test/dashboard-swimlane-view-toggle-client.test.ts
index 5184f0e..94f1624 100644
--- a/packages/studio/test/dashboard-swimlane-view-toggle-client.test.ts
+++ b/packages/studio/test/dashboard-swimlane-view-toggle-client.test.ts
@@ -226,7 +226,7 @@ describe('swimlane view-toggle client — Task 5.1B', () => {
 
     // localStorage persists.
     const storedRaw = window.localStorage.getItem(
-      'deskwork:dashboard:task-5-1b-test-key:view-mode',
+      'deskwork:dashboard:v2:task-5-1b-test-key:view-mode',
     );
     expect(storedRaw).not.toBeNull();
     if (storedRaw === null) return;
@@ -239,7 +239,7 @@ describe('swimlane view-toggle client — Task 5.1B', () => {
     // `view-list` (otherwise the desktop default would resolve the
     // swim back to kanban regardless of the server-rendered class).
     window.localStorage.setItem(
-      'deskwork:dashboard:task-5-1b-test-key:view-mode',
+      'deskwork:dashboard:v2:task-5-1b-test-key:view-mode',
       JSON.stringify({ default: 'list' }),
     );
     buildShell([
@@ -274,7 +274,7 @@ describe('swimlane view-toggle client — Task 5.1B', () => {
     // localStorage only carries the default lane's override.
     const stored: unknown = JSON.parse(
       window.localStorage.getItem(
-        'deskwork:dashboard:task-5-1b-test-key:view-mode',
+        'deskwork:dashboard:v2:task-5-1b-test-key:view-mode',
       ) ?? '{}',
     );
     expect(stored).toEqual({ default: 'list' });
@@ -309,7 +309,7 @@ describe('swimlane view-toggle client — Task 5.1B', () => {
 
   it('per-lane override beats viewport default — mobile with stored kanban shows kanban', () => {
     window.localStorage.setItem(
-      'deskwork:dashboard:task-5-1b-test-key:view-mode',
+      'deskwork:dashboard:v2:task-5-1b-test-key:view-mode',
       JSON.stringify({ default: 'kanban' }),
     );
     setMatchMediaMatches(true); // mobile
@@ -399,7 +399,7 @@ describe('swimlane view-toggle client — Task 5.1B', () => {
     expect(swim?.classList.contains('view-list')).toBe(false);
     // No localStorage write either.
     const storedRaw = window.localStorage.getItem(
-      'deskwork:dashboard:task-5-1b-test-key:view-mode',
+      'deskwork:dashboard:v2:task-5-1b-test-key:view-mode',
     );
     expect(storedRaw).toBeNull();
   });
diff --git a/plugins/deskwork-studio/public/src/dashboard/swimlane-collapse.ts b/plugins/deskwork-studio/public/src/dashboard/swimlane-collapse.ts
index 7d98cd9..a99f3e9 100644
--- a/plugins/deskwork-studio/public/src/dashboard/swimlane-collapse.ts
+++ b/plugins/deskwork-studio/public/src/dashboard/swimlane-collapse.ts
@@ -17,9 +17,9 @@
  *
  * State is stored per-operator-per-project in localStorage:
  *
- *   - `deskwork:dashboard:<projectKey>:lane-collapse`
+ *   - `deskwork:dashboard:v2:<projectKey>:lane-collapse`
  *     JSON array of lane ids the operator has collapsed.
- *   - `deskwork:dashboard:<projectKey>:stage-collapse`
+ *   - `deskwork:dashboard:v2:<projectKey>:stage-collapse`
  *     JSON object mapping lane id → array of collapsed stage names.
  *     Per-stage collapse state is SHARED across kanban + list-body
  *     — a stage collapsed in kanban shows collapsed in list-body
diff --git a/plugins/deskwork-studio/public/src/dashboard/swimlane-drag.ts b/plugins/deskwork-studio/public/src/dashboard/swimlane-drag.ts
index 15294c6..8b77a4e 100644
--- a/plugins/deskwork-studio/public/src/dashboard/swimlane-drag.ts
+++ b/plugins/deskwork-studio/public/src/dashboard/swimlane-drag.ts
@@ -12,7 +12,7 @@
  *   - reorders the per-lane swim + stub pairs inside the bay so the
  *     bay column matches the new rail order,
  *   - persists to localStorage as `string[]` of lane ids under
- *     `deskwork:dashboard:<projectKey>:lane-order` — per-operator,
+ *     `deskwork:dashboard:v2:<projectKey>:lane-order` — per-operator,
  *     per-project (matches the other 5.x state idioms — visibility,
  *     focus, view-mode, collapse, compose). PRD `Two split state
  *     axes for lanes` leaves `.deskwork/lane-order.json` (project-
diff --git a/plugins/deskwork-studio/public/src/dashboard/swimlane-storage.ts b/plugins/deskwork-studio/public/src/dashboard/swimlane-storage.ts
index c01cb3f..7227e61 100644
--- a/plugins/deskwork-studio/public/src/dashboard/swimlane-storage.ts
+++ b/plugins/deskwork-studio/public/src/dashboard/swimlane-storage.ts
@@ -3,14 +3,14 @@
  *
  * The `swimlane.ts`, `swimlane-collapse.ts`, and `swimlane-view-
  * toggle.ts` controllers all namespace localStorage entries under
- * `deskwork:dashboard:<projectKey>:<suffix>` and all resolve the
- * `<projectKey>` from the bay-shell's `data-project-key` attribute
- * (falling back to the page pathname when the shell lacks one). The
- * map-shaped controllers (collapse + view-toggle) additionally read
- * a `Map<laneId, T>` whose on-disk shape is a JSON object. This
- * module centralises all three pieces — the key prefix, the project-
- * key resolver, and the read+parse boilerplate — so the controllers
- * import a single contract instead of redeclaring it.
+ * `deskwork:dashboard:v<schema>:<projectKey>:<suffix>` and all
+ * resolve the `<projectKey>` from the bay-shell's `data-project-key`
+ * attribute (falling back to the page pathname when the shell lacks
+ * one). The map-shaped controllers (collapse + view-toggle)
+ * additionally read a `Map<laneId, T>` whose on-disk shape is a JSON
+ * object. This module centralises all three pieces — the key prefix,
+ * the project-key resolver, and the read+parse boilerplate — so the
+ * controllers import a single contract instead of redeclaring it.
  *
  * Failures (no entry / malformed JSON / wrong root type / unknown
  * value shape) all collapse to "empty map" — the controllers treat
@@ -18,13 +18,20 @@
  * works without it.
  */
 
+/**
+ * Schema version for dashboard localStorage keys. Bump this when the
+ * persisted shapes or restore semantics change so stale per-operator
+ * state is ignored instead of silently replayed into the new UI.
+ */
+export const STORAGE_SCHEMA_VERSION = 2;
+
 /**
  * Common prefix for every dashboard localStorage key. Controllers
- * append `:<projectKey>:<suffix>` to namespace per-operator state
+ * append `<projectKey>:<suffix>` to namespace per-operator state
  * per-project (so two operators sharing a machine but working on
  * different projects don't see each other's lane state).
  */
-export const STORAGE_KEY_PREFIX = 'deskwork:dashboard:';
+export const STORAGE_KEY_PREFIX = `deskwork:dashboard:v${STORAGE_SCHEMA_VERSION}:`;
 
 /**
  * Resolve the project key the swimlane controllers use to namespace
diff --git a/plugins/deskwork-studio/public/src/dashboard/swimlane-view-toggle.ts b/plugins/deskwork-studio/public/src/dashboard/swimlane-view-toggle.ts
index 409be80..a57125f 100644
--- a/plugins/deskwork-studio/public/src/dashboard/swimlane-view-toggle.ts
+++ b/plugins/deskwork-studio/public/src/dashboard/swimlane-view-toggle.ts
@@ -11,7 +11,7 @@
  *     reusing it here keeps the view-default switch aligned with the
  *     layout switch the operator already perceives.
  *   - Reads any per-lane operator overrides from localStorage at
- *     `deskwork:dashboard:<projectKey>:view-mode` (a `Record<laneId,
+ *     `deskwork:dashboard:v2:<projectKey>:view-mode` (a `Record<laneId,
  *     'kanban' | 'list'>` map).
  *   - Applies the resolved mode to each swim by swapping `.view-
  *     kanban` and `.view-list` classes; mirrors `aria-checked` on
