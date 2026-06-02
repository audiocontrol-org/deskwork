### Repair can mutate lane state without recording the repair event

Finding-ID: AUDIT-BARRAGE-codex-01
Status:     open
Severity:   medium
Surface:    packages/core/src/doctor/rules/lane-config-missing-template.ts:303-320 and packages/core/src/doctor/rules/lane-config-missing-template.ts:364-381

Both repair actions perform the filesystem mutation before appending the `lane-config-repair` journal event. In `set-template`, the lane JSON is rewritten at lines 303-304, then `appendJournalEvent` is awaited at lines 314-320 with no catch or compensation. In `delete`, the lane file is unlinked at lines 364-366, then the journal event is appended at lines 376-381.

If journal append fails, the operator gets a thrown repair failure after the lane was already rebound or deleted, and there is no durable audit record for the state change. This is worse for delete because the lane file is already gone. A reasonable fix is to make these repair operations transactional enough for this repository’s filesystem model: restore the prior lane JSON if `set-template` journal append fails, and use a staged delete path or compensating restore for delete so “applied” and “journaled” cannot diverge silently.

### Rebind prompt can offer templates that cannot actually be selected

Finding-ID: AUDIT-BARRAGE-codex-02
Status:     open
Severity:   medium
Surface:    packages/core/src/doctor/rules/lane-config-missing-template.ts:214-229 and packages/core/src/doctor/rules/lane-config-missing-template.ts:287-299

The prompt choices are built directly from `listAvailablePipelineTemplates(ctx.projectRoot)` at lines 214-229. The apply path then separately revalidates the selected template with `loadPipelineTemplate` at lines 287-299 and can reject the same choice the prompt just offered.

That creates a bad repair loop when a project contains a malformed or otherwise unresolvable pipeline override whose filename is still enumerable. The operator sees it as a valid rebind target, selects it, and then gets an apply failure. Since Task 6.5 specifically calls for a prompt plan with per-template rebind choices, the choices should be only templates that resolve cleanly. Filter the available ids through `loadPipelineTemplate` before constructing `set-template-*` choices, while keeping the apply-time validation for races between planning and application.

### CLI subprocess integration test can hang indefinitely

Finding-ID: AUDIT-BARRAGE-codex-03
Status:     open
Severity:   medium
Surface:    packages/cli/test/custom-pipeline-lane-integration.test.ts:86-104

The new integration test wraps the real CLI with `spawnSync` in `pipeline()` and `lane()`, but neither call sets a timeout. If the CLI blocks on unexpected I/O, a stuck child process, or a regression that waits for input, the test process can hang instead of failing with a bounded diagnostic. That also means `afterEach` cleanup at lines 156-157 may never run for the tmp project.

Because this test is intentionally exercising real subprocesses, it needs a timeout per invocation and should surface `r.error`, `r.signal`, stdout, and stderr in the failure path. A small helper-level timeout is enough to keep the end-to-end coverage reliable in local and CI runs.
