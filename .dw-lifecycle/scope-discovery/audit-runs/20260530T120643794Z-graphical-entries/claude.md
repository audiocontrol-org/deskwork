I walked the diff carefully — the doctor rule's audit/plan/apply paths, the journal-event schema extension, both test suites, and the runner registration. Findings below, anchored to specific lines.

### Delete-refusal message lists entry UUIDs but instructs a slug-based `lane move` command

Finding-ID: AUDIT-BARRAGE-claude-01
Status:     open
Severity:   medium
Surface:    `packages/core/src/doctor/rules/lane-config-missing-template.ts:290-309` (delete dependency check + refusal message)

In the `delete` branch, `dependents` is built as `sidecars.filter((entry) => entry.lane === laneId).map((entry) => entry.uuid)` (line ~292), so the sample interpolated into the refusal message is a list of **UUIDs**. But the same message then tells the operator: *"Move each entry to another lane with `deskwork lane move <slug> --to <other>`"* (line ~305). The operator is handed UUIDs and instructed to act with slugs. They cannot paste the listed identifiers into the suggested command.

This also diverges from the sibling surface the rule claims to mirror. The integration test for `lane purge` (`packages/cli/test/custom-pipeline-lane-integration.test.ts:294-297`) asserts the purge refusal names `first-post` / `second-post` — i.e. **slugs**. So `lane purge` refuses with slugs while this doctor rule refuses with UUIDs, for the identical "entries reference this lane" condition. Two repair surfaces for the same guard speak two different identifier vocabularies.

Fix: map dependents to `entry.slug` (with UUID as a tiebreaker if slugs can collide) so the listed names match both the `lane move <slug>` instruction and the `purge.ts` precedent. The test at `lane-config-missing-template.test.ts:267` asserting `result.message` contains the bound UUID would need to switch to asserting the slug — which is the correct contract anyway.

### Entry-binding guard can false-negative on corrupt sidecars, orphaning entries on delete

Finding-ID: AUDIT-BARRAGE-claude-02
Status:     open
Severity:   medium
Surface:    `packages/core/src/doctor/rules/lane-config-missing-template.ts:280-300` (`readAllSidecars` dependency check)

The delete safety guard depends entirely on `readAllSidecars(ctx.projectRoot)` enumerating every entry that references the lane. Per the established codebase pattern flagged in AUDIT-20260530-15 (sidecar walkers `catch { continue }` and silently skip unparseable files), if `readAllSidecars` swallows corrupt/unparseable sidecars, an entry whose sidecar references the doomed lane but fails to parse will **not** appear in `dependents`. The guard then sees zero dependents and the `unlinkSync(laneFilePath)` (line ~315) proceeds, leaving a corrupt entry bound to a now-deleted lane — exactly the orphan condition the guard exists to prevent.

This is the false-negative branch the audit focus calls out ("entry-binding detection … false negatives"). It matters more here than in a normal read path because the consequence is destructive (lane file deleted) and irreversible from the doctor's perspective.

Fix: verify `readAllSidecars`' error handling. If it silently skips corrupt files, the delete branch must surface the count of unreadable sidecars and refuse (or warn) rather than treat "couldn't parse" as "doesn't reference the lane." A safe guard fails closed, not open. The 4-scenario test suite has no corrupt-sidecar-bound case to pin this.

### Lane mutation lands on disk before the journal append; an append failure leaves no audit record

Finding-ID: AUDIT-BARRAGE-claude-03
Status:     open
Severity:   medium
Surface:    `packages/core/src/doctor/rules/lane-config-missing-template.ts:243-262` (set-template) and `:314-333` (delete)

Both repair actions mutate disk first, then append the journal event. In `set-template`: `atomicWriteLaneJson(...)` (line ~246) runs, then `await appendJournalEvent(...)` (line ~252). In `delete`: `unlinkSync(laneFilePath)` (line ~315), then `await appendJournalEvent(...)` (line ~324). If the journal append throws after the file mutation, the rebind/delete has already landed but no `lane-config-repair` event records it — the audit trail the new `LaneConfigRepairEvent` schema exists to provide is silently absent. For the delete case this is worse: the lane file is gone with zero durable record that the doctor removed it.

This is the same partial-success shape as AUDIT-20260530-13 (`bootstrapDefaultLaneIfMissing` writing the lane before its migration event), surfacing in a new file. The set-template path is recoverable (re-running audit shows it's now clean), but the delete path loses the only evidence the action occurred.

Fix: at minimum, if the journal append fails after a delete, the `RepairResult` should report the file was deleted but the audit record could not be written (so the operator knows), rather than letting the append error propagate as an opaque throw out of `apply`. Consider ordering or a compensating note.

### Audit scans archived lanes at severity=error, producing persistent noise for intentionally-retired lanes

Finding-ID: AUDIT-BARRAGE-claude-04
Status:     open
Severity:   medium
Surface:    `packages/core/src/doctor/rules/lane-config-missing-template.ts:165` (`listLaneConfigs(ctx.projectRoot, { includeArchived: true })`)

`audit()` enumerates lanes with `includeArchived: true`, so a soft-archived lane whose `pipelineTemplate` no longer resolves emits a `severity: 'error'` finding. Archiving is the soft-delete path; deleting the custom pipeline a since-archived lane was bound to is a normal, intentional sequence. After that, `doctor` reports a permanent error on a lane the operator already retired, and the only offered repairs are "rebind it" or "delete it" — neither of which the operator necessarily wants for a lane they archived precisely to stop thinking about.

An archived lane carrying a dangling template reference is not an active-pipeline defect; it's a frozen historical record. Surfacing it at `error` conflates "this active lane is broken" with "this retired lane references a template that's since been removed."

Fix: either exclude archived lanes from this rule's scan (`includeArchived: false`), or emit a lower severity (`warning`/`info`) for archived lanes while keeping `error` for active ones. The header comment justifies the first-site gating in detail but is silent on why archived lanes are in scope at all.

### `laneFilePath` is persisted as an absolute path in the journal event and finding details

Finding-ID: AUDIT-BARRAGE-claude-05
Status:     open
Severity:   low
Surface:    `packages/core/src/doctor/rules/lane-config-missing-template.ts:200-210` (finding.details), `:324-329` (journal event); `packages/core/src/schema/journal-events.ts:228` (`laneFilePath: z.string().min(1)`)

The rule computes `laneFilePath = laneConfigPath(ctx.projectRoot, laneId)` (absolute) and stores it both in `finding.details.laneFilePath` and in the persisted `lane-config-repair` journal event's `details.laneFilePath`. The user-facing message correctly uses `relative(ctx.projectRoot, laneFilePath)` (line ~196, and again at the delete success line ~331) — but the persisted/structured values are absolute. The journal is an append-only on-disk record; embedding an absolute path makes the audit trail machine-specific. A project moved/cloned to a different absolute root carries journal events pointing at a path that no longer exists, and the value isn't reproducible across the team.

The test at `lane-config-missing-template.test.ts:97-99` and `:217` pins the absolute value, so this is intentional, not accidental — but it's the same non-portability the project flags elsewhere.

Fix: store the project-relative path in `details.laneFilePath` (the message already derives relative for display); keep absolute only for transient logging if needed. The lane is already identified by `laneId`, which is the portable key.

### Integration test silently depends on a prebuilt `node_modules/.bin/deskwork` with no build step

Finding-ID: AUDIT-BARRAGE-claude-06
Status:     open
Severity:   low
Surface:    `packages/cli/test/custom-pipeline-lane-integration.test.ts:46-47, 60-69`

`deskworkBin = join(workspaceRoot, 'node_modules/.bin/deskwork')` and every `spawnSync` invokes it as a real subprocess. `assertDeskworkBinPresent()` checks the bin *exists*, but not that it reflects current source — if the bin dispatches to a stale `dist/` (or to a workspace symlink that points at un-rebuilt output), the test validates yesterday's CLI while reporting green. There's no `npm run build` precondition and no assertion that the resolved binary is current. The audit focus names "integration test reliability"; this is the silent-stale-state vector. In CI without a guaranteed build-before-test ordering, this either fails confusingly (bin absent) or passes against stale code.

Fix: document the build precondition in the test header (it currently only documents the spawn semantics), or have the test assert the bin's resolution path is the workspace symlink rather than a stale standalone copy. At minimum the `assertDeskworkBinPresent` error should mention the build requirement, not just `npm install`.

### Integration test bypasses the entry-creation CLI, weakening the "add 2 entries" + "state-intact" claims

Finding-ID: AUDIT-BARRAGE-claude-07
Status:     open
Severity:   low
Surface:    `packages/cli/test/custom-pipeline-lane-integration.test.ts:130-152` (`writeSidecarFile`), workplan step 6.6.1

Step 6.6.1's acceptance criterion is "add 2 entries," but the test hand-writes sidecar JSON directly (`writeSidecarFile`, line ~130) rather than driving `deskwork add`/`ingest`. Because the lane archive/restore/purge operations only touch the lane file, the byte-equivalence assertion at lines 318-330 (`finalBytes === sidecarPreBytes.get(...)`) is close to tautological: nothing in the exercised lane lifecycle ever writes a sidecar, so "bytes unchanged" would hold even if entry binding were completely broken. The test proves "lane ops don't touch sidecars" (worth having) but is presented as end-to-end entry-state verification, which it only weakly is.

Fix: either create the entries through the real CLI so the entry-creation path is genuinely covered, or scope the test's claim in the header to "lane-lifecycle operations do not mutate pre-existing sidecars" rather than implying it verifies entry creation. The current header (lines 1-23) claims "the full surface implicated by … acceptance criteria," which overstates what's exercised.

### `spawnSync` calls have no timeout; a hung CLI stalls the suite until vitest's global timeout

Finding-ID: AUDIT-BARRAGE-claude-08
Status:     open
Severity:   low
Surface:    `packages/cli/test/custom-pipeline-lane-integration.test.ts:99-108` (`pipeline`), `:111-120` (`lane`)

Both subprocess helpers call `spawnSync(deskworkBin, [...], { encoding: 'utf-8' })` with no `timeout` option. If any CLI invocation deadlocks (e.g. waiting on stdin, or a future interactive prompt sneaks into a verb), the test blocks until vitest's outer timeout rather than failing fast with a diagnostic naming the offending command. The audit focus calls out "subprocess timing" — a per-call `timeout` plus an explicit `r.signal === 'SIGTERM'` assertion is the standard guard for subprocess-driven tests.

Fix: pass `{ encoding: 'utf-8', timeout: 30_000 }` to each `spawnSync` and surface a clear error when `r.signal` indicates a timeout kill, so a hang is attributable to the specific verb rather than the whole suite.
