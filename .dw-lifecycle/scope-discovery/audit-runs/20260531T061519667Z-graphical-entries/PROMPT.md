# Audit-barrage — multi-model audit prompt template

You are an **independent audit reviewer** firing as part of a multi-model audit barrage. Your siblings (other CLIs running this same prompt in parallel) emit their own findings independently; the operator triages all of your outputs side-by-side after every model has settled. Your job is to surface bugs, design issues, missed edge cases, and code-quality concerns in the work product captured in the diff below.

You are NOT collaborating with the other models. You write what you see. The cross-model genetic diversity comes from each of you reporting independently.

## Feature under audit

graphical-entries

## Feature scope (workplan / PRD summary)

Task 0.1 of graphical-entries Phase 0 (audit-barrage cleanup queue). Closes AUDIT-20260530-25 (HIGH severity, cross-model claude P5-1): dashboard `bucket.unbucketed` entries silently dropped from rendered swim/list while count is inflated. Fix mirrors the already-shipped AUDIT-14 (canonical calendar render.ts:bucketize → unbucketed tail) + AUDIT-37 (entry-review composed view members-bucketing.ts) patterns. New module swimlane-unbucketed.ts renders the per-swim (unrecognized stage) tail; swimlane-card.ts and swimlane-list-body.ts append the tail after the regular stages columns; lane-data.ts docstring updated. Test file dashboard-swimlane-unbucketed-render.test.ts asserts entry visibility + raw currentStage rendering + happy-path-no-tail regression. TDD discipline: 3 of 4 tests failed pre-fix, all 4 pass post-fix. Full studio suite (953 tests + 11 skipped) green.

## Commit subjects in the audited range

a88fcd7 docs(graphical-entries): backfill AUDIT-20260530-25 Status sha (fc192e9) + tick Task 0.1 acceptance criteria
fc192e9 fix(graphical-entries): Closes AUDIT-20260530-25 — dashboard surfaces unbucketed entries (per-swim unrecognized-stage tail)


## Recent audit-log excerpt (prior findings on this feature)

Use this to avoid re-reporting findings that have already been triaged. If a finding was previously dispositioned (`closed`, `won't-fix`, `accepted-trade-off`), don't re-litigate the disposition; only surface a new instance if the underlying shape regressed.


The rule computes `laneFilePath = laneConfigPath(ctx.projectRoot, laneId)` (absolute) and stores it both in `finding.details.laneFilePath` and in the persisted `lane-config-repair` journal event's `details.laneFilePath`. The user-facing message correctly uses `relative(ctx.projectRoot, laneFilePath)` (line ~196, and again at the delete success line ~331) — but the persisted/structured values are absolute. The journal is an append-only on-disk record; embedding an absolute path makes the audit trail machine-specific. A project moved/cloned to a different absolute root carries journal events pointing at a path that no longer exists, and the value isn't reproducible across the team.

The test at `lane-config-missing-template.test.ts:97-99` and `:217` pins the absolute value, so this is intentional, not accidental — but it's the same non-portability the project flags elsewhere.

Fix: store the project-relative path in `details.laneFilePath` (the message already derives relative for display); keep absolute only for transient logging if needed. The lane is already identified by `laneId`, which is the portable key.

Surfaced by audit-barrage run `20260530T120643794Z-graphical-entries` (claude). Run-dir at `.dw-lifecycle/scope-discovery/audit-runs/20260530T120643794Z-graphical-entries/claude.md`.

### AUDIT-20260530-82 — [P6-3 claude] Integration test silently depends on a prebuilt `node_modules/.bin/deskwork` with no build step

Finding-ID: AUDIT-20260530-82 (cross-model: AUDIT-BARRAGE-claude-P6-3)
Status:     open
Severity:   low
Surface:    `packages/cli/test/custom-pipeline-lane-integration.test.ts:46-47, 60-69`

`deskworkBin = join(workspaceRoot, 'node_modules/.bin/deskwork')` and every `spawnSync` invokes it as a real subprocess. `assertDeskworkBinPresent()` checks the bin *exists*, but not that it reflects current source — if the bin dispatches to a stale `dist/` (or to a workspace symlink that points at un-rebuilt output), the test validates yesterday's CLI while reporting green. There's no `npm run build` precondition and no assertion that the resolved binary is current. The audit focus names "integration test reliability"; this is the silent-stale-state vector. In CI without a guaranteed build-before-test ordering, this either fails confusingly (bin absent) or passes against stale code.

Fix: document the build precondition in the test header (it currently only documents the spawn semantics), or have the test assert the bin's resolution path is the workspace symlink rather than a stale standalone copy. At minimum the `assertDeskworkBinPresent` error should mention the build requirement, not just `npm install`.

Surfaced by audit-barrage run `20260530T120643794Z-graphical-entries` (claude). Run-dir at `.dw-lifecycle/scope-discovery/audit-runs/20260530T120643794Z-graphical-entries/claude.md`.

### AUDIT-20260530-83 — [P6-3 claude] Integration test bypasses the entry-creation CLI, weakening the "add 2 entries" + "state-intact" claims

Finding-ID: AUDIT-20260530-83 (cross-model: AUDIT-BARRAGE-claude-P6-3)
Status:     open
Severity:   low
Surface:    `packages/cli/test/custom-pipeline-lane-integration.test.ts:130-152` (`writeSidecarFile`), workplan step 6.6.1

Step 6.6.1's acceptance criterion is "add 2 entries," but the test hand-writes sidecar JSON directly (`writeSidecarFile`, line ~130) rather than driving `deskwork add`/`ingest`. Because the lane archive/restore/purge operations only touch the lane file, the byte-equivalence assertion at lines 318-330 (`finalBytes === sidecarPreBytes.get(...)`) is close to tautological: nothing in the exercised lane lifecycle ever writes a sidecar, so "bytes unchanged" would hold even if entry binding were completely broken. The test proves "lane ops don't touch sidecars" (worth having) but is presented as end-to-end entry-state verification, which it only weakly is.

Fix: either create the entries through the real CLI so the entry-creation path is genuinely covered, or scope the test's claim in the header to "lane-lifecycle operations do not mutate pre-existing sidecars" rather than implying it verifies entry creation. The current header (lines 1-23) claims "the full surface implicated by … acceptance criteria," which overstates what's exercised.

Surfaced by audit-barrage run `20260530T120643794Z-graphical-entries` (claude). Run-dir at `.dw-lifecycle/scope-discovery/audit-runs/20260530T120643794Z-graphical-entries/claude.md`.

### AUDIT-20260530-84 — [P6-3 claude] `spawnSync` calls have no timeout; a hung CLI stalls the suite until vitest's global timeout

Finding-ID: AUDIT-20260530-84 (cross-model: AUDIT-BARRAGE-claude-P6-3)
Status:     open
Severity:   low
Surface:    `packages/cli/test/custom-pipeline-lane-integration.test.ts:99-108` (`pipeline`), `:111-120` (`lane`)

Both subprocess helpers call `spawnSync(deskworkBin, [...], { encoding: 'utf-8' })` with no `timeout` option. If any CLI invocation deadlocks (e.g. waiting on stdin, or a future interactive prompt sneaks into a verb), the test blocks until vitest's outer timeout rather than failing fast with a diagnostic naming the offending command. The audit focus calls out "subprocess timing" — a per-call `timeout` plus an explicit `r.signal === 'SIGTERM'` assertion is the standard guard for subprocess-driven tests.

Fix: pass `{ encoding: 'utf-8', timeout: 30_000 }` to each `spawnSync` and surface a clear error when `r.signal` indicates a timeout kill, so a hang is attributable to the specific verb rather than the whole suite.

Surfaced by audit-barrage run `20260530T120643794Z-graphical-entries` (claude). Run-dir at `.dw-lifecycle/scope-discovery/audit-runs/20260530T120643794Z-graphical-entries/claude.md`.

### AUDIT-20260530-85 — [P6-3 codex] Repair can mutate lane state without recording the repair event

Finding-ID: AUDIT-20260530-85 (cross-model: AUDIT-BARRAGE-codex-P6-3)
Status:     open
Severity:   medium
Surface:    packages/core/src/doctor/rules/lane-config-missing-template.ts:303-320 and packages/core/src/doctor/rules/lane-config-missing-template.ts:364-381

Both repair actions perform the filesystem mutation before appending the `lane-config-repair` journal event. In `set-template`, the lane JSON is rewritten at lines 303-304, then `appendJournalEvent` is awaited at lines 314-320 with no catch or compensation. In `delete`, the lane file is unlinked at lines 364-366, then the journal event is appended at lines 376-381.

If journal append fails, the operator gets a thrown repair failure after the lane was already rebound or deleted, and there is no durable audit record for the state change. This is worse for delete because the lane file is already gone. A reasonable fix is to make these repair operations transactional enough for this repository’s filesystem model: restore the prior lane JSON if `set-template` journal append fails, and use a staged delete path or compensating restore for delete so “applied” and “journaled” cannot diverge silently.

Surfaced by audit-barrage run `20260530T120643794Z-graphical-entries` (codex). Run-dir at `.dw-lifecycle/scope-discovery/audit-runs/20260530T120643794Z-graphical-entries/codex.md`.

### AUDIT-20260530-86 — [P6-3 codex] Rebind prompt can offer templates that cannot actually be selected

Finding-ID: AUDIT-20260530-86 (cross-model: AUDIT-BARRAGE-codex-P6-3)
Status:     open
Severity:   medium
Surface:    packages/core/src/doctor/rules/lane-config-missing-template.ts:214-229 and packages/core/src/doctor/rules/lane-config-missing-template.ts:287-299

The prompt choices are built directly from `listAvailablePipelineTemplates(ctx.projectRoot)` at lines 214-229. The apply path then separately revalidates the selected template with `loadPipelineTemplate` at lines 287-299 and can reject the same choice the prompt just offered.

That creates a bad repair loop when a project contains a malformed or otherwise unresolvable pipeline override whose filename is still enumerable. The operator sees it as a valid rebind target, selects it, and then gets an apply failure. Since Task 6.5 specifically calls for a prompt plan with per-template rebind choices, the choices should be only templates that resolve cleanly. Filter the available ids through `loadPipelineTemplate` before constructing `set-template-*` choices, while keeping the apply-time validation for races between planning and application.

Surfaced by audit-barrage run `20260530T120643794Z-graphical-entries` (codex). Run-dir at `.dw-lifecycle/scope-discovery/audit-runs/20260530T120643794Z-graphical-entries/codex.md`.

### AUDIT-20260530-87 — [P6-3 codex] CLI subprocess integration test can hang indefinitely

Finding-ID: AUDIT-20260530-87 (cross-model: AUDIT-BARRAGE-codex-P6-3)
Status:     open
Severity:   medium
Surface:    packages/cli/test/custom-pipeline-lane-integration.test.ts:86-104

The new integration test wraps the real CLI with `spawnSync` in `pipeline()` and `lane()`, but neither call sets a timeout. If the CLI blocks on unexpected I/O, a stuck child process, or a regression that waits for input, the test process can hang instead of failing with a bounded diagnostic. That also means `afterEach` cleanup at lines 156-157 may never run for the tmp project.

Because this test is intentionally exercising real subprocesses, it needs a timeout per invocation and should surface `r.error`, `r.signal`, stdout, and stderr in the failure path. A small helper-level timeout is enough to keep the end-to-end coverage reliable in local and CI runs.

Surfaced by audit-barrage run `20260530T120643794Z-graphical-entries` (codex). Run-dir at `.dw-lifecycle/scope-discovery/audit-runs/20260530T120643794Z-graphical-entries/codex.md`.

### AUDIT-20260530-88 — [P7T7.2 claude] SKILL.md error-handling catalog contradicts the shipped refusal messages AND re-asserts the pre-AUDIT-15 "non-empty members = group" semantic

Finding-ID: AUDIT-20260530-88 (cross-model: AUDIT-BARRAGE-claude-P7T7.2)
Status:     open
Severity:   medium
Surface:    `plugins/deskwork/skills/group/SKILL.md` (Error handling section, `show`/`update` bullets) vs `packages/core/src/groups/operations/show.ts:54-60` and `packages/core/src/groups/operations/update.ts:48-54`

The new SKILL.md error catalog documents the `show`/`update` non-group refusal as: `Cannot show group "<slug>": entry has no members. Per the Task 7.1.2 invariant, only entries with a non-empty members[] are groups.` and `update ... Refused with the same "entry has no members" shape as show`. But the actual code throws `Cannot show group "<slug>": entry is not a group (no \`members\` field on the sidecar)...` (show.ts) / `Cannot update group "<slug>": entry is not a group (no \`members\` field on the sidecar)...` (update.ts). The `show.test.ts` and `update.test.ts` assert `/entry is not a group/`, confirming the code — so the SKILL.md is the drifted artifact. An adopter grepping the documented error string will not find it.

Worse than a string mismatch: the quoted SKILL.md sentence *"only entries with a non-empty members[] are groups"* directly re-asserts the exact pre-fix semantic that AUDIT-20260529-15 reversed. That whole fix established that `members: []` IS a group (declared-empty marker) and `members`-absent is the regular entry. The SKILL.md header and `update`-description (fixed by AUDIT-20260529-21) now say the right thing, but the error catalog still carries the old, contradictory framing. The two halves of the same SKILL.md disagree about the core predicate. Note also the catalog inconsistency the doc fails to capture: `show`/`update` emit "entry is not a group", while `add-member`/`remove-member`/`archive`/`restore` emit "entry has no `members` field" — two distinct message families the catalog conflates. Fix: rewrite the `show`/`update` catalog bullets to quote the literal `entry is not a group (no \`members\` field...)` text and drop the "non-empty members[] are groups" clause.

---

Surfaced by audit-barrage run `20260530T121000611Z-graphical-entries` (claude). Run-dir at `.dw-lifecycle/scope-discovery/audit-runs/20260530T121000611Z-graphical-entries/claude.md`.

### AUDIT-20260530-89 — [P7T7.2 claude] `showGroup` member-enrichment swallows corrupt-sidecar parse/config errors as `missing: true` (same class as AUDIT-23, new surface)

Finding-ID: AUDIT-20260530-89 (cross-model: AUDIT-BARRAGE-claude-P7T7.2)
Status:     open
Severity:   medium
Surface:    `packages/core/src/groups/operations/show.ts:66-78` (the per-member `try { readSidecar } catch { ...missing: true }` loop)

The member-enrichment loop wraps `readSidecar(projectRoot, memberUuid)` in a bare `catch {}` that pushes `{ uuid, missing: true }` for ANY failure. `readSidecar` throws on three distinct conditions: (a) the sidecar file genuinely doesn't exist (dangling UUID — the case `missing: true` is meant for), (b) the file exists but is corrupt JSON / fails `EntrySchema` validation, and (c) a lower-level IO error. Cases (b) and (c) are reported identically to (a) — a member whose sidecar is on disk but corrupt is mislabeled as a dangling reference.

This is the same swallow-corruption shape that AUDIT-20260530-23 narrowed in `cancel.ts` (now using an `existsSync` probe so only the genuinely-absent case is recoverable and parse/config/IO errors propagate). `show.ts` did not get the same treatment. The downstream consequence is concrete: doctor's `group-member-missing` rule (Task 7.5.2) acts on `missing: true` members and "prompts to remove the dangling reference" — so a corrupt-but-recoverable member sidecar surfaces as missing, and the operator's repair path is to *delete the reference to it*, compounding the data loss. Fix: mirror the cancel.ts pattern — probe `existsSync(sidecarPath(projectRoot, memberUuid))` first; only the absent case yields `missing: true`; let parse/validation/IO errors propagate so corruption surfaces loudly rather than masquerading as a dangling UUID.

---

Surfaced by audit-barrage run `20260530T121000611Z-graphical-entries` (claude). Run-dir at `.dw-lifecycle/scope-discovery/audit-runs/20260530T121000611Z-graphical-entries/claude.md`.

### AUDIT-20260530-90 — [P7T7.2 claude] `isPopulatedGroupEntry` is defined and documented as downstream public API but not barrel-exported — unreachable via `@deskwork/core/groups`

Finding-ID: AUDIT-20260530-90 (cross-model: AUDIT-BARRAGE-claude-P7T7.2)
Status:     open
Severity:   low
Surface:    `packages/core/src/groups/types.ts:46-49` (definition + doc) vs `packages/core/src/groups/index.ts:11` (`export { isArchivedEntry, isGroupEntry } from './types.ts';`)

`isPopulatedGroupEntry` is defined in `types.ts` with a doc-comment that explicitly names its future consumers: *"used downstream by the multi-lane composed view in Task 7.4 + the informational `group-all-members-cancelled` doctor rule in Task 7.5.3 — both should skip empty groups."* But the package barrel `groups/index.ts` only re-exports `isArchivedEntry` and `isGroupEntry`. The predicate is therefore unreachable through the documented public module path `@deskwork/core/groups`; a Task 7.4/7.5.3 consumer would either have to deep-import `groups/types.ts` (bypassing the barrel contract every other group symbol follows) or re-derive the check inline.

In this diff the function has zero call sites, so it is effectively dead code that the doc-comment advertises as the canonical way to express "group with ≥1 member." That's an invitation for the exact failure the predicate exists to prevent: a future implementer who can't see it via the barrel will write `entry.members.length > 0` inline, re-fragmenting the semantic the two-predicate design was meant to centralize. Fix: add `isPopulatedGroupEntry` to the `groups/index.ts` export (and `groups/operations`/barrel as appropriate), or remove the function + the forward-referencing doc until a consumer lands.

---

Surfaced by audit-barrage run `20260530T121000611Z-graphical-entries` (claude). Run-dir at `.dw-lifecycle/scope-discovery/audit-runs/20260530T121000611Z-graphical-entries/claude.md`.

### AUDIT-20260530-91 — [P7T7.2 claude] Inconsistent exit codes for a bad `--at` argument: out-of-range exits 1, malformed exits 2

Finding-ID: AUDIT-20260530-91 (cross-model: AUDIT-BARRAGE-claude-P7T7.2)
Status:     open
Severity:   low
Surface:    `packages/cli/src/commands/group.ts:233-245` (handleAddMember `--at` parse) and `packages/core/src/groups/operations/add-member.ts:124-135` (out-of-range throw)

The CLI parses `--at` and rejects non-integer / negative values via `fail(..., 2)` (exit 2 = usage error). But a syntactically-valid-but-out-of-range index (e.g. `--at 5` on a 2-member group) passes the CLI gate and is rejected only by the core operation, which throws a plain `Error` routed through `fail(...)` with the default exit 1. The tests encode this split: `refuses --at <negative>` and `refuses --at <not-an-integer>` assert `code === 2`, while `refuses --at <out-of-range>` asserts only `code !== 0` (it is actually 1).

From an operator's or scripting perspective, `--at -1`, `--at 1.5`, and `--at 5` are all "the `--at` argument is bad" — but they yield exit 2, 2, and 1 respectively. A script branching on exit code to distinguish "usage error, fix my invocation" (2) from "runtime/state error" (1) will misclassify the out-of-range case. The range check is arguably a usage error too (the operator supplied an invalid argument value), so the cleaner contract is exit 2 for all three. Fix: either validate the upper bound at the CLI layer against the resolved group's member count and `fail(..., 2)`, or accept the split explicitly and document that out-of-range is a state-dependent (exit-1) condition because the valid range isn't known until the group is read.

---

I walked the new group operations module, the CLI dispatcher, the cancel cascade (noting its on-disk state already carries the AUDIT-22/23 fixes, so I did not re-report those), the `archivedAt` schema delta, and the journal-event additions. I confirmed `source: z.string()` accepts the new `'group-create'` value (no validation break), the `lane` field's `LANE_ID_REGEX` binding closes the traversal vector, the `--at` integer parse is sound, and there is no HTML/XSS surface in this diff (the CLI emits JSON; studio surfaces are later tasks). The four findings above are the ones worth triage; the strongest are the SKILL.md error-catalog drift (#1) and the `showGroup` corrupt-sidecar swallow (#2).

Surfaced by audit-barrage run `20260530T121000611Z-graphical-entries` (claude). Run-dir at `.dw-lifecycle/scope-discovery/audit-runs/20260530T121000611Z-graphical-entries/claude.md`.

### AUDIT-20260530-92 — [P7T7.2 codex] `isPopulatedGroupEntry` is implemented but not exported from the public groups entrypoint

Finding-ID: AUDIT-20260530-92 (cross-model: AUDIT-BARRAGE-codex-P7T7.2)
Status:     open
Severity:   medium
Surface:    `packages/core/src/groups/index.ts:11`, `packages/core/src/groups/types.ts:39-45`

`isPopulatedGroupEntry` is introduced in `types.ts` as the predicate consumers should use when they need "group AND has at least one member", and the docblock names downstream use cases. But the package-facing barrel only exports `isArchivedEntry` and `isGroupEntry`. Since `packages/core/package.json` exposes `./groups` as the public subpath, downstream code cannot import the populated predicate from `@deskwork/core/groups` without reaching into internals.

This is a composition trap for the next group surfaces: they either duplicate the predicate, use the looser `isGroupEntry` by mistake, or import an internal path. Fix is to export `isPopulatedGroupEntry` from `packages/core/src/groups/index.ts` next to `isGroupEntry`.

Surfaced by audit-barrage run `20260530T121000611Z-graphical-entries` (codex). Run-dir at `.dw-lifecycle/scope-discovery/audit-runs/20260530T121000611Z-graphical-entries/codex.md`.

### AUDIT-20260530-93 — [P7T7.2 codex] Group mutators can commit sidecar changes without the required group journal event

Finding-ID: AUDIT-20260530-93 (cross-model: AUDIT-BARRAGE-codex-P7T7.2)
Status:     open
Severity:   medium
Surface:    `packages/core/src/groups/operations/create.ts:106-121`, `packages/core/src/groups/operations/update.ts:84-94`, `packages/core/src/groups/operations/add-member.ts:126-145`, `packages/core/src/groups/operations/remove-member.ts:72-89`, `packages/core/src/groups/operations/archive.ts:68-77`, `packages/core/src/groups/operations/archive.ts:104-109`

Every group mutator writes the sidecar before appending its `group-*` journal event. If the journal write fails after the sidecar write, the on-disk group state is changed with no audit event, despite the feature explicitly adding six group event kinds for mutating-verb audit completeness.

This matters most for `add-member` / `remove-member` and archive/restore, where the journal is the only durable explanation of why the membership or visibility changed. A reasonable fix is to make the write+journal sequence transactional enough for this filesystem model: write a recoverable pending record, or perform a compensating sidecar restore/delete when `appendJournalEvent` fails, and add a test that forces journal append failure after sidecar write.

Surfaced by audit-barrage run `20260530T121000611Z-graphical-entries` (codex). Run-dir at `.dw-lifecycle/scope-discovery/audit-runs/20260530T121000611Z-graphical-entries/codex.md`.

### AUDIT-20260530-94 — [P7T7.2 codex] Extra positional arguments are silently ignored by group subcommands

Finding-ID: AUDIT-20260530-94 (cross-model: AUDIT-BARRAGE-codex-P7T7.2)
Status:     open
Severity:   medium
Surface:    `packages/cli/src/commands/group.ts:151-163`, `packages/cli/src/commands/group.ts:182-213`, `packages/cli/src/commands/group.ts:221-248`, `packages/cli/src/commands/group.ts:274-296`, `packages/cli/src/commands/group.ts:302-318`, `packages/cli/src/commands/group.ts:324-340`

The handlers only check minimum positional counts. `show`, `create`, `update`, `add-member`, `remove-member`, `archive`, and `restore` all accept extra positionals and discard them. For example, `deskwork group <root> archive group-a group-b` archives only `group-a`; `group create slug accidental --lane default` creates `slug` and ignores `accidental`.

This is a CLI correctness issue because these verbs mutate state and the project convention prefers explicit refusal over hiding operator typos. The handlers should require exact arity per verb, with `create` still accepting optional values only through flags.

Surfaced by audit-barrage run `20260530T121000611Z-graphical-entries` (codex). Run-dir at `.dw-lifecycle/scope-discovery/audit-runs/20260530T121000611Z-graphical-entries/codex.md`.

### AUDIT-20260530-95 — [P7T7.2 codex] Group skill documentation still describes the superseded empty-members doctor rule and stale refusal text

Finding-ID: AUDIT-20260530-95 (cross-model: AUDIT-BARRAGE-codex-P7T7.2)
Status:     open
Severity:   low
Surface:    `plugins/deskwork/skills/group/SKILL.md:53`, `plugins/deskwork/skills/group/SKILL.md:58-66`

The skill header and workplan now define `members: []` as the canonical declared-empty group state, and the workplan renames Task 7.5.5 to `group-stale-empty-members`. But the group skill default section still says Doctor’s `group-empty-members-array` rule surfaces the “dual representation” for normalization. Its error catalog also says non-group `show` / `update` refusals use the old “entry has no members” / “non-empty members[]” wording, while the implementation now refuses on absence of the `members` field.

This is documentation drift on the operator-facing skill. The fix is to align the skill with the implemented semantics: `members: []` is not a normalization target, and non-group refusal text should mention “no `members` field” rather than “no members” or “non-empty members[]”.

Surfaced by audit-barrage run `20260530T121000611Z-graphical-entries` (codex). Run-dir at `.dw-lifecycle/scope-discovery/audit-runs/20260530T121000611Z-graphical-entries/codex.md`.


## Diff under audit

The actual code under review. Read it carefully. The findings you emit must be anchored to specific files + line ranges in this diff (or call out a missing surface that should be in the diff but isn't).

diff --git a/docs/1.0/001-IN-PROGRESS/graphical-entries/audit-log.md b/docs/1.0/001-IN-PROGRESS/graphical-entries/audit-log.md
index e66eb4f..d6aed1a 100644
--- a/docs/1.0/001-IN-PROGRESS/graphical-entries/audit-log.md
+++ b/docs/1.0/001-IN-PROGRESS/graphical-entries/audit-log.md
@@ -3438,7 +3438,7 @@ Surfaced by audit-barrage run `20260530T064014571Z-graphical-entries` (claude).
 ### AUDIT-20260530-25 — [P5-1 claude] Lane-bucket `unbucketed` entries are silently dropped from the rendered dashboard while inflating every entry count
 
 Finding-ID: AUDIT-20260530-25 (cross-model: AUDIT-BARRAGE-claude-P5-1)
-Status:     open
+Status:     fixed-fc192e9
 Severity:   high
 Surface:    `packages/studio/src/pages/dashboard/swimlane-card.ts` (`renderSwimlane`, the stage-column assembly ~lines after "const stagesRaw"), `packages/studio/src/pages/dashboard/lane-data.ts` (`LaneBucket.unbucketed` + `loadLaneBuckets` entryCount math)
 
diff --git a/docs/1.0/001-IN-PROGRESS/graphical-entries/workplan.md b/docs/1.0/001-IN-PROGRESS/graphical-entries/workplan.md
index b5986b4..718d970 100644
--- a/docs/1.0/001-IN-PROGRESS/graphical-entries/workplan.md
+++ b/docs/1.0/001-IN-PROGRESS/graphical-entries/workplan.md
@@ -23,17 +23,17 @@ The `check-open-findings` gate refuses `/dwi` task pickup while any of these 70
 
 Closes AUDIT-20260530-25 (cross-model: AUDIT-BARRAGE-claude-P5-1). Surface: `packages/studio/src/pages/dashboard/swimlane-card.ts` (`renderSwimlane`, the stage-column assembly ~lines after "const stagesRaw"), `packages/studio/src/pages/dashboard/lane-data.ts` (`LaneBucket.unbucketed` + `loadLaneBuckets` entryCount math).
 
-- [ ] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
-- [ ] Step 2: confirm test fails against current code (verify the bug repros)
-- [ ] Step 3: implement the fix
-- [ ] Step 4: confirm test passes
-- [ ] Step 5: commit with `Closes AUDIT-20260530-25 (cross-model: AUDIT-BARRAGE-claude-P5-1)` in subject
+- [x] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
+- [x] Step 2: confirm test fails against current code (verify the bug repros)
+- [x] Step 3: implement the fix
+- [x] Step 4: confirm test passes
+- [x] Step 5: commit with `Closes AUDIT-20260530-25 (cross-model: AUDIT-BARRAGE-claude-P5-1)` in subject
 
 **Acceptance Criteria:**
 
-- [ ] Failing test exists at `(to be filled in by Step 1 implementer)` (cited in Step 1)
-- [ ] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
-- [ ] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step
+- [x] Failing test exists at `packages/studio/test/dashboard-swimlane-unbucketed-render.test.ts` (cited in Step 1)
+- [x] `npx vitest run packages/studio/test/dashboard-swimlane-unbucketed-render.test.ts` exits 0 (passes against the fix)
+- [x] Audit-log Status flipped to `fixed-fc192e9` via the close-shipped-audit-findings step
 
 
 
diff --git a/packages/studio/src/pages/dashboard/lane-data.ts b/packages/studio/src/pages/dashboard/lane-data.ts
index e9a689a..f916301 100644
--- a/packages/studio/src/pages/dashboard/lane-data.ts
+++ b/packages/studio/src/pages/dashboard/lane-data.ts
@@ -31,11 +31,17 @@
  *     issue surface.
  *
  *   - Entries whose `currentStage` isn't in the resolved template's
- *     stage list go into an "unbucketed" array on the lane bucket.
- *     This is a data-integrity bug upstream (the entry's stage was
- *     never validated against its lane's template), but the dashboard
- *     surfaces it instead of crashing — the operator sees the count
- *     and can run doctor.
+ *     stage list go into an "unbucketed" array on the lane bucket and
+ *     are folded into `entryCount`. This is a data-integrity bug
+ *     upstream (the entry's stage was never validated against its
+ *     lane's template). Per AUDIT-20260530-25, the dashboard
+ *     renderers (`swimlane-card.ts` + `swimlane-list-body.ts`) read
+ *     `bucket.unbucketed` and emit an explicit `(unrecognized stage)`
+ *     tail column / group per swim — mirroring the AUDIT-20260530-14
+ *     fix at the canonical calendar SSOT and the AUDIT-20260529-37
+ *     fix at the entry-review composed view — so the entries remain
+ *     visible inline with their offending `currentStage` value and
+ *     the swim-head count reconciles with the visible cards.
  */
 
 import {
diff --git a/packages/studio/src/pages/dashboard/swimlane-card.ts b/packages/studio/src/pages/dashboard/swimlane-card.ts
index 5b8b19f..5351771 100644
--- a/packages/studio/src/pages/dashboard/swimlane-card.ts
+++ b/packages/studio/src/pages/dashboard/swimlane-card.ts
@@ -71,6 +71,7 @@ import { renderRow } from './section.ts';
 import { stageGlyph, GLYPH_OFF } from './swimlane-stage-glyph.ts';
 import { laneGlyph } from './lane-glyph.ts';
 import { renderListBody } from './swimlane-list-body.ts';
+import { renderUnbucketedStageCol } from './swimlane-unbucketed.ts';
 import type { LaneBucket } from './lane-data.ts';
 import type { LaneRailRow } from './swimlane-rail.ts';
 import type { Entry } from '@deskwork/core/schema/entry';
@@ -419,6 +420,11 @@ export function renderSwimlane(
         parentsByMemberUuid,
       ).__raw,
     ),
+    // Per AUDIT-20260530-25 — unbucketed-tail column. See
+    // `swimlane-unbucketed.ts` for the rationale; this call reconciles
+    // the swim-head count (which already folds unbucketed entries into
+    // `entryCount`) with the visible cards.
+    renderUnbucketedStageCol(lane.id, bucket.unbucketed).__raw,
   ].join('');
 
   const stageCount = template.linearStages.length + template.offPipelineStages.length;
@@ -439,22 +445,15 @@ export function renderSwimlane(
     );
   }
 
-  // Per AUDIT-20260528-02: the swimlane is server-rendered alongside
-  // its stub for every visibility-on lane. CSS hides exactly one
-  // based on `.is-focus-hidden`. The class is applied at the server
-  // when the lane is not in the initial focus set, and the client
-  // controller mirrors the toggle on chip clicks (already wired in
-  // `swimlane.ts:153`).
+  // Per AUDIT-20260528-02: swimlane server-rendered alongside its
+  // stub for every visibility-on lane; CSS hides one or the other
+  // via `.is-focus-hidden`. Per Task 5.1B: the server-default
+  // view-mode class is `view-kanban`; the client controller
+  // post-DOMContentLoaded applies the per-lane localStorage override
+  // OR the viewport-aware default (mobile→list). Both bodies emit at
+  // server time so the controller flips one class instead of mutating
+  // DOM (mirrors the dual swim+stub pattern AUDIT-02 landed).
   const focusClass = focusHidden ? ' is-focus-hidden' : '';
-  // Per Task 5.1B: the server-default view-mode class is `view-
-  // kanban` — the client controller post-DOMContentLoaded mirrors
-  // the operator's per-lane localStorage override OR the viewport-
-  // aware default (mobile→list). CSS toggles which body renders
-  // via `.swim.view-kanban .list-body { display: none }` and
-  // `.swim.view-list .stage-grid { display: none }`. Both bodies
-  // are emitted at server time so the controller flips one class
-  // instead of mutating DOM (mirrors the dual swim+stub pattern
-  // AUDIT-02 landed for focus toggle).
   return unsafe(html`
     <article class="swim swim--${template.id} view-kanban${unsafe(focusClass)}"
       data-lane-id="${lane.id}"
diff --git a/packages/studio/src/pages/dashboard/swimlane-list-body.ts b/packages/studio/src/pages/dashboard/swimlane-list-body.ts
index bca1cce..3fef9ac 100644
--- a/packages/studio/src/pages/dashboard/swimlane-list-body.ts
+++ b/packages/studio/src/pages/dashboard/swimlane-list-body.ts
@@ -52,6 +52,7 @@
 import { html, unsafe, type RawHtml } from '../html.ts';
 import { entryRowLinkMeta } from './entry-link-meta.ts';
 import { stageGlyph, GLYPH_OFF } from './swimlane-stage-glyph.ts';
+import { renderUnbucketedListGroup } from './swimlane-unbucketed.ts';
 import type { LaneBucket } from './lane-data.ts';
 import type { Entry } from '@deskwork/core/schema/entry';
 
@@ -186,6 +187,12 @@ export function renderListBody(
         true,
       ).__raw,
     ),
+    // Per AUDIT-20260530-25: list-view analogue of the kanban
+    // unbucketed-tail column. Same data, same operator-diagnosable
+    // shape; CSS picks which surface paints via the `.swim.view-list`
+    // class. Without this group, switching to the list view re-creates
+    // the silent-drop the kanban fix closes.
+    renderUnbucketedListGroup(lane.id, bucket.unbucketed).__raw,
   ].join('');
 
   return unsafe(html`<div class="list-body" data-list-body>${unsafe(groupsRaw)}</div>`);
diff --git a/packages/studio/src/pages/dashboard/swimlane-unbucketed.ts b/packages/studio/src/pages/dashboard/swimlane-unbucketed.ts
new file mode 100644
index 0000000..fd64af9
--- /dev/null
+++ b/packages/studio/src/pages/dashboard/swimlane-unbucketed.ts
@@ -0,0 +1,155 @@
+/**
+ * Per-swim unbucketed-tail renderers (AUDIT-20260530-25).
+ *
+ * Mirrors the AUDIT-20260530-14 fix at the canonical calendar SSOT
+ * (`packages/core/src/calendar/render.ts`) and the AUDIT-20260529-37
+ * fix at the entry-review composed view
+ * (`packages/studio/src/pages/entry-review/members-section.ts`). Both
+ * precedents surface stage-not-in-template entries as an explicit
+ * `(unrecognized stage)` tail so the entries remain visible inline
+ * with the operator's diagnostic context (slug + title + offending
+ * `currentStage`).
+ *
+ * Pre-fix on the dashboard surface, `loadLaneBuckets` captured
+ * out-of-template entries into `bucket.unbucketed` AND folded them
+ * into `bucket.entryCount`, while neither `renderSwimlane` (kanban
+ * grid) nor `renderListBody` (list view) read from `bucket.unbucketed`.
+ * Result: every count display reads N entries while only N-K cards
+ * render. This module supplies the tail-section renderers consumed
+ * by both surfaces so the count and the visible cards reconcile.
+ *
+ * The kanban tail (`renderUnbucketedStageCol`) emits a trailing
+ * `.stage-col.is-unbucketed` column. The list-body tail
+ * (`renderUnbucketedListGroup`) emits a trailing `.lb-group.is-unbucketed`
+ * group. Both surfaces show each entry's raw `currentStage` value
+ * inline so the operator can diagnose the routing drift without
+ * leaving the dashboard.
+ */
+
+import { html, unsafe, type RawHtml } from '../html.ts';
+import { entryRowLinkMeta } from './entry-link-meta.ts';
+import type { Entry } from '@deskwork/core/schema/entry';
+
+/**
+ * Glyph used to mark the unbucketed tail in both surfaces. Mirrors
+ * the `⊘` glyph the entry-review composed view's unbucketed tail
+ * uses (`members-section.ts:203`) for visual continuity across
+ * surfaces that surface routing-drift entries.
+ */
+const UNBUCKETED_GLYPH = '⊘';
+
+const UNBUCKETED_STAGE_LABEL = '(unrecognized stage)';
+
+/**
+ * Render one unbucketed entry as a self-contained kanban row. The
+ * standard `renderRow` is NOT reused: it dispatches into
+ * `renderRowDrawer` → `verbsForStage` which throws on any stage not in
+ * the lane's template (per the no-fallback rule). Unbucketed entries
+ * are by definition stage-not-in-template, so there is no valid verb
+ * dispatch — the row surfaces the entry's identifying metadata + a
+ * link to the review surface where the operator can repair the stage.
+ *
+ * The row carries the same `data-row-shell` + `data-uuid` + `data-slug`
+ * + `data-stage` attributes the standard row exposes so existing
+ * filter probes and selectors continue to resolve.
+ */
+function renderUnbucketedKanbanRow(entry: Entry): RawHtml {
+  const { reviewLink, search } = entryRowLinkMeta(entry);
+  return unsafe(html`<div class="er-row-shell er-row-shell--unbucketed" data-row-shell data-search="${search}"
+      data-stage="${entry.currentStage}"
+      data-uuid="${entry.uuid}" data-slug="${entry.slug}">
+      <div class="er-row-fg er-calendar-row">
+        <div class="er-calendar-body">
+          <span class="er-row-slug"><a href="${reviewLink}"
+            title="open the review surface (entry's currentStage is not in this lane's template)">${entry.slug}</a></span>
+          <span class="er-calendar-title">${entry.title}</span>
+          <span class="er-row-unbucketed-stage" data-unbucketed-current-stage="${entry.currentStage}">stage: ${entry.currentStage}</span>
+        </div>
+      </div>
+    </div>`);
+}
+
+/**
+ * Kanban-surface unbucketed tail. Renders a trailing `.stage-col`
+ * column carrying `.is-unbucketed`; each entry uses
+ * `renderUnbucketedKanbanRow` rather than the standard `renderRow`
+ * because the standard path throws on stages not in the lane's
+ * template (`classifyStage` in `affordances.ts`).
+ *
+ * Returns the empty string (as `RawHtml`) when there are no unbucketed
+ * entries, so callers can append unconditionally.
+ */
+export function renderUnbucketedStageCol(
+  laneId: string,
+  unbucketed: readonly Entry[],
+): RawHtml {
+  if (unbucketed.length === 0) return unsafe('');
+
+  const laneIdSlug = laneId.toLowerCase().replace(/[^a-z0-9-]+/g, '-');
+  const stageId = `lane-${laneIdSlug}-stage-unbucketed`;
+
+  const rowsRaw = unbucketed
+    .map((entry) => renderUnbucketedKanbanRow(entry).__raw)
+    .join('');
+
+  return unsafe(html`
+    <section class="stage-col is-unbucketed"
+      id="${stageId}"
+      data-stage-col="unbucketed"
+      data-stage-section="unbucketed"
+      data-unbucketed>
+      <div class="stage-head">
+        <span class="stage-glyph" aria-hidden="true">${UNBUCKETED_GLYPH}</span>
+        <span class="stage-name">${UNBUCKETED_STAGE_LABEL}</span>
+        <span class="stage-count">${unbucketed.length}</span>
+      </div>
+      ${unsafe(rowsRaw)}
+    </section>`);
+}
+
+/**
+ * List-surface unbucketed tail. Renders a trailing `.lb-group` group
+ * carrying `.is-unbucketed`; each entry uses the same `.lb-row` chrome
+ * the list view emits for template-bucketed entries, with the
+ * offending `currentStage` substituted into the `.lb-state` slot so
+ * the row is operator-diagnosable inline.
+ *
+ * Returns the empty string (as `RawHtml`) when there are no unbucketed
+ * entries.
+ */
+export function renderUnbucketedListGroup(
+  laneId: string,
+  unbucketed: readonly Entry[],
+): RawHtml {
+  if (unbucketed.length === 0) return unsafe('');
+  void laneId;
+
+  const rowsRaw = unbucketed
+    .map((entry) => {
+      const { reviewLink, search } = entryRowLinkMeta(entry);
+      return html`<a class="lb-row lb-row--unbucketed" href="${reviewLink}"
+        data-row-shell data-search="${search}"
+        data-stage="${entry.currentStage}"
+        data-uuid="${entry.uuid}" data-slug="${entry.slug}"
+        title="open the review surface (entry's currentStage is not in this lane's template)">
+        <span class="lb-title">${entry.title}</span>
+        <span class="lb-version">${entry.slug}</span>
+        <span class="lb-state" data-unbucketed-current-stage="${entry.currentStage}">stage: ${entry.currentStage}</span>
+        <span class="lb-overflow" aria-hidden="true"
+          data-lb-overflow="${entry.uuid}">⋮</span>
+      </a>`;
+    })
+    .join('');
+
+  return unsafe(html`
+    <div class="lb-group is-unbucketed"
+      data-lb-group="unbucketed"
+      data-unbucketed>
+      <div class="lb-group-head">
+        <span class="lb-glyph" aria-hidden="true">${UNBUCKETED_GLYPH}</span>
+        <span class="lb-name">${UNBUCKETED_STAGE_LABEL}</span>
+        <span class="lb-count">${unbucketed.length}</span>
+      </div>
+      ${unsafe(rowsRaw)}
+    </div>`);
+}
diff --git a/packages/studio/test/dashboard-swimlane-unbucketed-render.test.ts b/packages/studio/test/dashboard-swimlane-unbucketed-render.test.ts
new file mode 100644
index 0000000..aefde65
--- /dev/null
+++ b/packages/studio/test/dashboard-swimlane-unbucketed-render.test.ts
@@ -0,0 +1,186 @@
+/**
+ * AUDIT-20260530-25 — Dashboard `bucket.unbucketed` entries are silently
+ * dropped from the rendered swimlane while still inflating every entry-
+ * count display. This regression mirrors AUDIT-20260530-14 (canonical
+ * calendar SSOT) and AUDIT-20260529-37 (entry-review composed view),
+ * both of which were closed by emitting an explicit
+ * `(unrecognized stage)` tail section so stage-not-in-template entries
+ * remain visible.
+ *
+ * The fix path here is the dashboard analogue: render `bucket.unbucketed`
+ * as a trailing `.stage-col.is-unbucketed` column on each swim's kanban
+ * grid AND as a trailing `.lb-group.is-unbucketed` group on each swim's
+ * list-body. Each unbucketed entry's raw `currentStage` value is
+ * surfaced so the operator can diagnose the routing drift inline.
+ *
+ * Pure integration — uses real sidecars, real lane configs, real
+ * pipeline templates. No mocks. Per `.claude/rules/testing.md`,
+ * fixture project trees live on disk via `mkdtempSync`.
+ */
+
+import { describe, it, expect, beforeEach, afterEach } from 'vitest';
+import { writeSidecar } from '@deskwork/core/sidecar';
+import {
+  setupDashboardFixture,
+  getHtml,
+  makeEntry,
+  extractLaneSection,
+  extractStageGridSection,
+  extractListBodySection,
+} from './__helpers/dashboard-swimlane-fixture.ts';
+import { createApp } from '../src/server.ts';
+
+const UUID_EDITORIAL_UNRECOGNIZED = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
+const UUID_VISUAL_UNRECOGNIZED = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
+
+describe('dashboard swimlane AUDIT-20260530-25 — unbucketed entries are rendered (not silently dropped)', () => {
+  let root: string;
+  let app: ReturnType<typeof createApp>;
+  let cleanup: () => void;
+
+  beforeEach(async () => {
+    const fixture = await setupDashboardFixture();
+    root = fixture.root;
+    app = fixture.app;
+    cleanup = fixture.cleanup;
+  });
+
+  afterEach(() => {
+    cleanup();
+  });
+
+  it('renders unbucketed entries (currentStage not in template) as a trailing kanban column with the raw stage shown', async () => {
+    // Seed a fifth entry in the editorial lane whose `currentStage` is
+    // not part of the editorial template (Ideas / Planned / Outlining /
+    // Drafting / Final / Published / Blocked / Cancelled). The entry
+    // MUST appear in the rendered dashboard with its offending stage
+    // visible so the operator can diagnose the routing drift.
+    await writeSidecar(
+      root,
+      makeEntry({
+        uuid: UUID_EDITORIAL_UNRECOGNIZED,
+        slug: 'mystery-stage-entry',
+        title: 'Mystery Stage Entry',
+        currentStage: 'NonExistentStage',
+        iterationByStage: { NonExistentStage: 0 },
+        lane: 'default',
+      }),
+    );
+
+    const r = await getHtml(app, '/dev/editorial-studio');
+    expect(r.status).toBe(200);
+
+    const editorialBlock = extractLaneSection(r.html, 'default');
+    expect(editorialBlock).not.toBe('');
+
+    // (a) An unbucketed kanban column renders in the editorial swim.
+    const stageGrid = extractStageGridSection(editorialBlock);
+    expect(stageGrid).toMatch(/class="stage-col[^"]*\bis-unbucketed\b/);
+
+    // (b) The unbucketed entry's slug appears in the rendered HTML
+    // (operator-perceivable proof the entry did not vanish).
+    expect(editorialBlock).toContain('data-slug="mystery-stage-entry"');
+
+    // (c) The entry's raw `currentStage` value is shown so the operator
+    // can diagnose the data-integrity drift.
+    expect(stageGrid).toContain('NonExistentStage');
+
+    // (d) The list-body also surfaces an unbucketed group so the list
+    // view stays consistent with the kanban view.
+    const listBody = extractListBodySection(editorialBlock);
+    expect(listBody).toMatch(/class="lb-group[^"]*\bis-unbucketed\b/);
+    expect(listBody).toContain('data-slug="mystery-stage-entry"');
+    expect(listBody).toContain('NonExistentStage');
+  });
+
+  it('count consistency: swim-head `${n} entries` matches the visible cards once unbucketed renders', async () => {
+    // Editorial lane fixture seeds 1 entry (a-draft, Drafting). Add 2
+    // unbucketed entries → count must read 3 entries; the rendered
+    // editorial block must contain 3 row-shell / lb-row markers (1
+    // template-bucketed + 2 unbucketed).
+    await writeSidecar(
+      root,
+      makeEntry({
+        uuid: UUID_EDITORIAL_UNRECOGNIZED,
+        slug: 'mystery-one',
+        title: 'Mystery One',
+        currentStage: 'NonExistentStage',
+        iterationByStage: { NonExistentStage: 0 },
+        lane: 'default',
+      }),
+    );
+    await writeSidecar(
+      root,
+      makeEntry({
+        uuid: UUID_VISUAL_UNRECOGNIZED,
+        slug: 'mystery-two',
+        title: 'Mystery Two',
+        currentStage: 'AnotherMissingStage',
+        iterationByStage: { AnotherMissingStage: 0 },
+        lane: 'default',
+      }),
+    );
+
+    const r = await getHtml(app, '/dev/editorial-studio');
+    expect(r.status).toBe(200);
+
+    const editorialBlock = extractLaneSection(r.html, 'default');
+    // The swim-head quick-meta count includes unbucketed (lane-data
+    // entryCount already folds them in).
+    expect(editorialBlock).toMatch(/<span class="quick-meta">3 entries<\/span>/);
+
+    // Both unbucketed entries are visible in the rendered output
+    // (operator-perceivable — they did not vanish).
+    expect(editorialBlock).toContain('data-slug="mystery-one"');
+    expect(editorialBlock).toContain('data-slug="mystery-two"');
+    // The raw offending stage values are surfaced for operator diagnosis.
+    const stageGrid = extractStageGridSection(editorialBlock);
+    expect(stageGrid).toContain('NonExistentStage');
+    expect(stageGrid).toContain('AnotherMissingStage');
+  });
+
+  it('happy-path regression: a swim with every entry at template-known stages emits NO unbucketed column or group', async () => {
+    // No additional entries — the baseline fixture seeds only
+    // template-valid stages (Drafting / Sketched / Approved / Drafted).
+    const r = await getHtml(app, '/dev/editorial-studio');
+    expect(r.status).toBe(200);
+
+    // All three lanes carry no unbucketed entries → no swim should
+    // render the modifier.
+    expect(r.html).not.toMatch(/class="stage-col[^"]*\bis-unbucketed\b/);
+    expect(r.html).not.toMatch(/class="lb-group[^"]*\bis-unbucketed\b/);
+  });
+
+  it('unbucketed render is scoped per-swim: an unbucketed entry in editorial does NOT leak into the mockups swim', async () => {
+    await writeSidecar(
+      root,
+      makeEntry({
+        uuid: UUID_EDITORIAL_UNRECOGNIZED,
+        slug: 'edit-mystery',
+        title: 'Editorial Mystery',
+        currentStage: 'NonExistentStage',
+        iterationByStage: { NonExistentStage: 0 },
+        lane: 'default',
+      }),
+    );
+
+    const r = await getHtml(app, '/dev/editorial-studio');
+    expect(r.status).toBe(200);
+
+    const editorialBlock = extractLaneSection(r.html, 'default');
+    const mockupsBlock = extractLaneSection(r.html, 'mockups');
+
+    // Editorial swim carries the unbucketed entry.
+    expect(editorialBlock).toContain('data-slug="edit-mystery"');
+    expect(extractStageGridSection(editorialBlock)).toMatch(
+      /class="stage-col[^"]*\bis-unbucketed\b/,
+    );
+
+    // Mockups swim is clean — no unbucketed modifier, no edit-mystery slug.
+    expect(mockupsBlock).not.toContain('data-slug="edit-mystery"');
+    expect(mockupsBlock).not.toMatch(/class="stage-col[^"]*\bis-unbucketed\b/);
+    expect(extractListBodySection(mockupsBlock)).not.toMatch(
+      /class="lb-group[^"]*\bis-unbucketed\b/,
+    );
+  });
+});


## What to look for

- **Correctness bugs** — logic errors, off-by-one, null/undefined paths, race conditions, missing error handling, swallowed exceptions.
- **Design issues** — coupling between layers that should be independent, leaking abstractions, primitives that should compose but don't, configuration that should be data ending up as code.
- **Missed edge cases** — what happens with empty input? Maximum input? Concurrent calls? Partial failure? Network unavailability? Operator interrupt mid-operation? What is the behavior on a fresh install vs. an upgrade?
- **Code-quality concerns** — files growing past a reasonable cap, names that don't reveal intent, dead code, duplicated logic, magic numbers without explanation, tests that don't test the contract they claim to test.
- **Cross-cutting impact** — does this diff touch a surface that other surfaces depend on? Are those other surfaces updated? Are migrations needed? Are doctor rules / schemas / validators updated to match the new shape?
- **Documentation drift** — does the README / SKILL.md / PRD describe the behavior the code actually implements? If the spec changed, did the implementation? If the implementation changed, did the spec?
- **Operator-discipline traps** — placeholder comments, swallowed errors, hardcoded paths/values that should be configurable, fallbacks that hide failure modes, mock data outside test code. These are bug-factories per project guidelines.

## Output format

For each finding you surface, emit ONE markdown block in this exact shape:

```
### <heading: one-line summary of the finding>

Finding-ID: AUDIT-BARRAGE-<your-model-name>-<NN>
Status:     open
Severity:   <blocking | high | medium | low | informational>
Surface:    <repo-relative-path:line-range> OR <description of the surface if not anchored to a single file>

<one-to-three paragraphs of body: what the finding is, why it matters, what evidence you relied on, what a reasonable fix would look like. Be specific. Cite line numbers from the diff. If the finding is structural / cross-file, name every file affected.>
```

Number the findings sequentially (`-01`, `-02`, ...). Use `blocking` only for issues that would break the feature's stated goals in obvious ways; `high` for correctness bugs adopters will hit; `medium` for design issues that compound over time; `low` for hygiene; `informational` for context you think the operator should see but isn't itself a bug.

## If you find nothing — say so explicitly

If you walk the diff carefully and find no findings worth surfacing, emit ONE block in this shape instead:

```
### No findings

Finding-ID: AUDIT-BARRAGE-<your-model-name>-CLEAN
Status:     open
Severity:   informational
Surface:    (the entire diff)

I walked the diff for the feature named above and found no findings worth surfacing. My specific reasoning: <three-to-five sentences explaining what you checked, why those checks came back clean, and what you would have flagged if it had been present.>
```

**Do not pad with weak findings.** A confident "I checked X, Y, Z and they are clean for these reasons" is more useful to the operator than three vague low-severity notes. The cross-model diversity gives the operator independent signal; an empty clean report from your CLI is itself a signal when paired with findings from your siblings.

## Hard constraints

- **No deferral phrases.** Don't write phrases like "fix later", "address in a follow-up", or other commitments to deferred work. The dispatch-wrapper rejects these as bug-factories. If you spot a deferral phrase IN the diff, surface it as a finding.
- **Anchor findings to evidence.** A finding that says "this might be a problem" without naming the specific file + line is not actionable. Name the surface, quote the relevant code, explain what's wrong.
- **One issue per finding block.** Don't bundle multiple concerns into one entry; the operator triages each block as a discrete signal.
- **Provenance is your model name.** Replace `<your-model-name>` in the Finding-ID with the CLI you are (`claude`, `codex`, `gemini`, etc.). This is how the operator joins findings across models.
