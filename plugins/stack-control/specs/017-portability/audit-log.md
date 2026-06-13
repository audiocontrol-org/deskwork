---
slug: portability
targetVersion: ""
---

# Audit log — portability

## 2026-06-12 — audit-barrage lift (20260612T170501105Z-portability-after_clarify)

### AUDIT-20260612-01 — Audit barrage config is no longer a barrage

Finding-ID: AUDIT-20260612-01
Status:     open
Severity:   blocking
Per-lane:   codex=blocking
Decision:   single-model (gate-counted blocking)
Surface:    `.stack-control/audit-barrage-config.yaml:34-46`

The config now removes both Claude lanes and leaves only the Codex model. That breaks the stated purpose of this surface: a multi-model audit barrage whose value comes from independent model diversity. Acting on this config as written runs a single-model audit, so the governance signal no longer has quorum or cross-model comparison.

A reasonable fix would keep at least two independent lanes in the default fleet, ideally preserving the cross-vendor distinction the removed comments were explicitly documenting.

### AUDIT-20260612-02 — Atomic push ignores the tag argument

Finding-ID: AUDIT-20260612-02
Status:     open
Severity:   high
Per-lane:   codex=high
Decision:   adjudicated (gate-counted high) — blast-radius=high, reachability=unreachable, fix-debt=no; no down-calibration signal — high retained.
Surface:    `src/release/helpers.ts:204-216`

`atomicPush(opts)` accepts `opts.tag`, but the push command never includes that tag ref. It uses `--follow-tags`, which only pushes annotated reachable tags and may push other reachable tags while silently not pushing the requested one. If the release tag is lightweight, missing, or not reachable as expected, the helper can succeed without publishing the tag named by `atomic-push <tag> <branch>`.

That is a release correctness defect: an operator can trust the portable release helper and still end up with branch state pushed but the intended release tag absent. The fix should push the explicit tag ref atomically, e.g. include `refs/tags/${opts.tag}:refs/tags/${opts.tag}` or equivalent validation before push.

### AUDIT-20260612-03 — Shared portability tests depend on Claude-only fixtures

Finding-ID: AUDIT-20260612-03
Status: migrated-to-backlog TASK-61
Severity:   medium
Per-lane:   codex=medium
Decision:   single-model (gate-counted medium)
Surface:    `src/__tests__/release-helper-portability.test.ts:10`

The new stack-control release portability test imports `createRig` from `../../../../.claude/skills/release/test/fixtures.js`. That makes the shared-core test suite depend on the legacy Claude skill tree, even though this feature’s core goal is to move release behavior behind stack-control-owned, host-neutral surfaces.

The blast radius is mostly test and maintenance portability rather than runtime release behavior, so this is medium. In a Codex-only or plugin-local stack-control checkout, the shared-core tests can fail because a Claude adapter fixture is missing. The fixture should live under stack-control’s own test helpers, with the Claude wrapper tested only as an adapter consumer.

## 2026-06-12 — audit-barrage lift (20260612T171031067Z-portability-after_clarify)

### AUDIT-20260612-04 — npm lookup failures are treated as safe-to-publish

Finding-ID: AUDIT-20260612-04
Status:     open
Severity:   high
Per-lane:   codex=high
Decision:   single-model (gate-counted high)
Surface:    plugins/stack-control/src/release/helpers.ts:150-156, plugins/stack-control/src/release/helpers.ts:288-305

`realNpmViewer` catches every `npm view` failure and returns `false`, and `assert-not-published` interprets `false` as “unpublished” before printing that the version is safe to publish. That conflates a real 404 with network failure, npm outage, registry auth/config problems, or a broken local npm executable.

The blast radius is release correctness: an operator can run `stackctl release-helper assert-not-published <version>` during a transient npm failure and get exit 0, then push a release tag that the workflow later rejects because the version was already published. This violates the feature’s fail-loud portability contract. A reasonable fix is to make npm status tri-state, or throw on lookup errors that are not confirmed “package/version not found,” so `assert-not-published` exits non-zero with the underlying npm error surfaced.

## 2026-06-12 — audit-barrage lift (20260612T171258455Z-portability-after_clarify)

### AUDIT-20260612-05 — Release npm assertions accept non-exact version specs

Finding-ID: AUDIT-20260612-05
Status: migrated-to-backlog TASK-62
Severity:   medium
Per-lane:   codex=medium
Decision:   single-model (gate-counted medium)
Surface:    plugins/stack-control/src/release/helpers.ts:174-181, plugins/stack-control/src/release/helpers.ts:309-334, plugins/stack-control/skills/release/SKILL.md:23-27

`assert-not-published` and `assert-published` pass the raw `<version>` argument directly into `verifyNpmStatus`, which builds npm specs like `${pkg}@${version}` without first requiring the same strict `MAJOR.MINOR.PATCH` format enforced by `validate-version`. The skill documents these as standalone helper subcommands, so a caller can reasonably invoke `assert-published 0.44` or another npm range/dist-tag-like value and get a result for a resolved package spec rather than the exact release version intended by the portability contract.

The blast radius is release correctness, but bounded to malformed operator/helper input, so I rate it medium. A reasonable fix is to add an exact-version validator to the npm assertion path itself, or have the assertion subcommands reject any version that does not match the release helper’s strict version format before calling `npm view`.

### AUDIT-20260612-06 — Quickstart records test references as scenario results

Finding-ID: AUDIT-20260612-06
Status: migrated-to-backlog TASK-63
Severity:   medium
Per-lane:   codex=medium
Decision:   single-model (gate-counted medium)
Surface:    plugins/stack-control/specs/017-portability/quickstart.md:13-17, plugins/stack-control/specs/017-portability/quickstart.md:27-30, plugins/stack-control/specs/017-portability/quickstart.md:53-67

The quickstart scenarios are written as runnable end-to-end verification steps, but the newly recorded `Result:` sections mostly say they are “Covered by” unit/contract tests. For example, Scenario D asks to force a missing host capability and verify a real explicit host limitation error, while its recorded result only says a test asserts fail-loud wording in skill prose. Scenario E asks to run the portable release flow in dry-run or fixture-backed mode and confirm distribution metadata, while the result names tests without recording the command, fixture, output, or verdict.

The blast radius is governance evidence drift: an unattended agent reading this as completed verification may conclude the scenarios were actually run when the artifact only records test coverage mapping. A reasonable fix is to either record concrete scenario execution evidence per scenario, or rename this section from quickstart results to coverage mapping and keep T033 unchecked until the scenarios are exercised as written.

## 2026-06-12 — audit-barrage lift (20260612T171547533Z-portability-after_clarify)

### AUDIT-20260612-07 — Atomic push can publish a stale or wrong release tag

Finding-ID: AUDIT-20260612-07
Status:     open
Severity:   high
Per-lane:   codex=high
Decision:   single-model (gate-counted high)
Surface:    plugins/stack-control/src/release/helpers.ts:235-245

`atomicPush` pushes `HEAD` to `origin/main` and pushes the requested tag ref, but it never verifies that `refs/tags/${opts.tag}` exists locally or that the tag resolves to the same commit as `HEAD`. A stale local tag from a prior release attempt can therefore be pushed atomically alongside a different `HEAD`, causing the tag-triggered publish workflow to build from the wrong commit while `main` advances to another commit.

The blast radius is release correctness: the feature promises one version line, one tag, and one verification flow, but this helper can split the released tag event from the commit being pushed. A reasonable fix is to resolve `HEAD` and `${tag}^{commit}` before the push, fail if the tag is missing, and fail if the tag target differs from `HEAD`.

### AUDIT-20260612-08 — Quickstart results record test coverage, not executed scenarios

Finding-ID: AUDIT-20260612-08
Status: migrated-to-backlog TASK-64
Severity:   medium
Per-lane:   codex=medium
Decision:   single-model (gate-counted medium)
Surface:    plugins/stack-control/specs/017-portability/tasks.md:155 and plugins/stack-control/specs/017-portability/quickstart.md:13-17,27-30,41-44,53-55,65-67,76-77

T033 is marked complete as “Run the quickstart scenarios ... and record results,” but the recorded quickstart results only say the scenarios are “Covered by” tests. Several listed scenarios are end-to-end operator flows, including using the Claude/Codex front doors and running the portable release flow in a dry-run or fixture-backed mode; the result entries do not record commands run, adapters invoked, fixture outputs, or pass/fail evidence from those scenarios.

The blast radius is governance drift rather than immediate runtime breakage: a downstream reviewer or unattended agent will read the task as completed scenario execution when the evidence is actually test assertion coverage. A reasonable fix is either to record the concrete commands/results for each quickstart scenario, or to rename the task/result language so it explicitly claims automated test coverage rather than executed quickstart runs.

## 2026-06-12 — audit-barrage lift (20260612T171748678Z-portability-after_clarify)

### AUDIT-20260612-09 — Quickstart completion records test coverage, not executed scenarios

Finding-ID: AUDIT-20260612-09
Status: migrated-to-backlog TASK-65
Severity:   medium
Per-lane:   codex=medium
Decision:   single-model (gate-counted medium)
Surface:    `plugins/stack-control/specs/017-portability/quickstart.md:13-67`, `plugins/stack-control/specs/017-portability/tasks.md:155`

`T033` is marked complete as “Run the quickstart scenarios,” but the quickstart results record only test coverage. Scenario A/B/D describe host-level workflow execution in Claude Code and Codex and a forced missing-capability condition; the recorded “Result” sections say they are covered by static or unit tests instead of documenting that those scenarios were actually run.

The blast radius is governance evidence quality: a downstream operator or unattended reviewer can reasonably treat the completed task as proof that the host workflows were exercised, when the artifact only proves some contract assertions ran. A reasonable fix would either record concrete run results for each scenario or rename the task/result language so it explicitly says these are automated coverage mappings, not executed quickstart runs.

### AUDIT-20260612-10 — Release helper has no first-release version path

Finding-ID: AUDIT-20260612-10
Status: migrated-to-backlog TASK-66
Severity:   medium
Per-lane:   codex=medium
Decision:   single-model (gate-counted medium)
Surface:    `plugins/stack-control/src/release/helpers.ts:128-133`, `plugins/stack-control/src/release/helpers.ts:326-334`, `plugins/stack-control/skills/release/SKILL.md:23-34`

`checkPreconditions` explicitly allows `lastReleaseTag` to be `null` when no `v*` tag exists, and the report prints “no tags found.” But the documented release flow always passes `<last-release-tag>` into `validate-version`, and `dispatchReleaseHelper validate-version` requires both arguments before `validateVersion` rejects any non-semver last tag. That means the helper surface cannot validate the first release of a repository even though the precondition report models that state.

The blast radius is limited to fresh release lines or repos with no local release tags, so this is medium rather than high. Still, this is a real edge-case break in a host-neutral release helper. A reasonable fix would define first-release semantics, such as accepting a sentinel from the precondition report or allowing `validateVersion` to treat missing last tag as “any exact semver is valid.”

## 2026-06-12 — audit-barrage lift (20260612T171935168Z-portability-after_clarify)

### AUDIT-20260612-11 — Release helper has no first-release validation path

Finding-ID: AUDIT-20260612-11
Status: migrated-to-backlog TASK-67
Severity:   medium
Per-lane:   codex=medium
Decision:   single-model (gate-counted medium)
Surface:    plugins/stack-control/src/release/helpers.ts:128-133, plugins/stack-control/src/release/helpers.ts:326-334, plugins/stack-control/skills/release/SKILL.md:23-27

`checkPreconditions` explicitly allows `lastReleaseTag` to be `null` when no `v*` tag exists, but the documented helper surface then requires `validate-version <version> <last-tag>`. The dispatcher rejects missing arguments, and `validateVersion` rejects any non-semver last tag, so there is no valid way through this portable release helper for a first release or a repository whose release tags are not present locally.

The blast radius is bounded to fresh release lines or checkouts without fetched tags, so this is medium rather than high. Still, the helper models a state that the next documented command cannot consume. A reasonable fix would define first-release semantics directly in the helper, such as accepting a sentinel from the precondition report or letting `validate-version` validate any exact semver when no prior release tag exists.

### AUDIT-20260612-12 — Quickstart records coverage mapping as executed scenario results

Finding-ID: AUDIT-20260612-12
Status: migrated-to-backlog TASK-68
Severity:   medium
Per-lane:   codex=medium
Decision:   single-model (gate-counted medium)
Surface:    plugins/stack-control/specs/017-portability/quickstart.md:13-17, plugins/stack-control/specs/017-portability/quickstart.md:27-30, plugins/stack-control/specs/017-portability/quickstart.md:41-44, plugins/stack-control/specs/017-portability/quickstart.md:53-55, plugins/stack-control/specs/017-portability/quickstart.md:65-67, plugins/stack-control/specs/017-portability/tasks.md:155

T033 is marked complete as “Run the quickstart scenarios ... and record results,” but the recorded `Result:` sections mostly say the scenarios are “Covered by” tests. Several scenarios are host-level or operator-flow checks, including running the Claude and Codex front doors, forcing a host limitation, and exercising a release flow in dry-run or fixture-backed mode. The quickstart does not record commands run, fixtures used, adapter invocations, outputs, or pass/fail verdicts for those scenarios.

The blast radius is governance evidence drift: an unattended reviewer can reasonably read the checked task as proof that the scenario flows were exercised end to end, when the artifact only records automated coverage references. A reasonable fix would either record concrete run evidence per scenario or change the task/result wording so it explicitly claims coverage mapping rather than executed quickstart scenarios.
