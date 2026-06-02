### Compose chip copies an invalid command for stage names with spaces

Finding-ID: AUDIT-BARRAGE-codex-01
Status:     open
Severity:   medium
Surface:    plugins/deskwork-studio/public/src/dashboard/swimlane-compose.ts:90-98; packages/studio/src/pages/dashboard/swimlane-card.ts:297-307

The copied command is assembled as `/deskwork:add <SLUG> --lane ${laneId} --stage ${firstStage}` with no argument quoting or escaping. That works for the current preset first stages (`Ideas`, `Sketched`, `Drafted`, etc.), but pipeline templates allow arbitrary non-empty stage strings, including names with spaces. A custom lane whose first stage is `QA Review` would copy `/deskwork:add <SLUG> --lane qa --stage QA Review`, which a normal argv parser reads as stage `QA` plus an extra `Review` token.

The server puts the raw first stage in `data-first-stage` at `swimlane-card.ts:303-307`, and the client serializes that value directly at `swimlane-compose.ts:90-98`. Fix by using the same command-argument quoting convention the slash-command parser expects, and add a regression with a custom template whose first linear stage contains whitespace and shell-sensitive characters.

### Dashboard localStorage has no schema/version segment despite version-bump reset being in scope

Finding-ID: AUDIT-BARRAGE-codex-02
Status:     open
Severity:   medium
Surface:    plugins/deskwork-studio/public/src/dashboard/swimlane-storage.ts:21-27; plugins/deskwork-studio/public/src/dashboard/swimlane.ts:64-69; plugins/deskwork-studio/public/src/dashboard/swimlane-collapse.ts:60-65; plugins/deskwork-studio/public/src/dashboard/swimlane-view-toggle.ts:68-70

The audit scope explicitly calls out “clear-on-version-bump,” but all persisted dashboard keys are stable forever under `deskwork:dashboard:<projectKey>:<suffix>`. The readers tolerate malformed JSON, but they do not distinguish old valid shapes from current valid shapes. If the meaning of `:focus`, `:visibility`, `:lane-collapse`, `:stage-collapse`, or `:view-mode` changes, old operator state continues to apply silently.

This is most visible in `STORAGE_KEY_PREFIX = 'deskwork:dashboard:'`; every controller appends only project key and suffix. A reasonable fix is to add a storage schema version to the prefix or store a version sentinel and clear the known swimlane keys when it mismatches. Tests should seed an older-version key and assert the controller ignores or removes it while preserving current-version state.

### Re-running swimlane initializers stacks duplicate event listeners with stale state closures

Finding-ID: AUDIT-BARRAGE-codex-03
Status:     open
Severity:   low
Surface:    plugins/deskwork-studio/public/src/editorial-studio-client.ts:527-530; plugins/deskwork-studio/public/src/dashboard/swimlane.ts:469-490; plugins/deskwork-studio/public/src/dashboard/swimlane-collapse.ts:464-477; plugins/deskwork-studio/public/src/dashboard/swimlane-view-toggle.ts:292-312; plugins/deskwork-studio/public/src/dashboard/swimlane-compose.ts:270-282

`init()` calls four swimlane controllers, and each controller unconditionally binds listeners to existing DOM nodes. `initSwimlane` also replaces `activeState` at lines 480-481, while previously bound handlers still close over their older `state` object. The same shape exists in collapse, view-toggle, and compose: re-invocation binds again without a module guard or per-element sentinel.

Current page boot may call these once, but the code already introduces `reapply*FromStorage` paths and singleton state for client-side refresh-style operations. If a partial DOM re-init calls any initializer twice, clicks can fire multiple handlers and mutate different closure-captured state objects. Fix with per-controller idempotence: a module-level wired guard for whole-page singletons, or `dataset` sentinels per bound element when dynamic DOM replacement is expected.
