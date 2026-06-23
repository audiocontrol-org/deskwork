---
slug: 032-ship-stage
targetVersion: ""
---

# Audit log — 032-ship-stage

## 2026-06-23 — audit-barrage lift (end-govern-after_implement)

### AUDIT-20260623-01 — No test exercises the backstop gate inside `emitAdvanceClosed` against a real dangling-merged-item fixture

Finding-ID: AUDIT-20260623-01 (claude-03 + codex-02; cross-model)
Status:     fixed-1248aa7e
Severity:   high
Per-lane:   claude=low, codex=high
Decision:   adjudicated (gate-counted high) — blast-radius=unstated, reachability=unstated, fix-debt=no; no down-calibration signal — high retained.
Surface:    src/subcommands/roadmap-advance-closed.ts:103–112 (the `firstDanglingMergedItem` check); tests/roadmap/advance-to-closed.test.ts (the updated tests)

The `advance-to-closed.test.ts` tests updated in this diff add the `validated: true` marker to fixtures that close successfully. These tests do not set up a local git repository with `refs/remotes/origin/main` pointing past a convergence record commit. Consequently, `firstDanglingMergedItem` returns `null` in every `advance-to-closed.test.ts` scenario — the backstop is inert, never exercised on the `roadmap advance --to closed` path.

The session-advisory and compass-backstop tests prove the underlying `mergedButInFlight` and `computeVerdict` machinery is correct. But there is no test that sets up a `shipped + validated` item alongside a dangling merged item and asserts that `roadmap advance --to closed` is refused with the backstop message (SC-003 via the `emitAdvanceClosed` path). Without it, a future refactor of the call-site order in `emitAdvanceClosed` (e.g. moving the backstop check below the status or gate check) would go undetected.

---

### AUDIT-20260623-02 — Dangling-item exemption lets `release` pass before status is recorded

Finding-ID: AUDIT-20260623-02
Status:     fixed-1248aa7e
Severity:   high
Per-lane:   codex=high
Decision:   single-model (gate-counted high)
Surface:    src/workflow/compass.ts:76-85, src/workflow/intent-vocabulary.ts:33-40, templates/WORKFLOW.md:92-110

The backstop exempts every compass verdict where `intentItem === danglingMergedItem` (`src/workflow/compass.ts:80-85`). That is broader than the stated exception, which is only to allow the dangling item’s own reconcile path. Because `release` maps to the `validating` phase (`src/workflow/intent-vocabulary.ts:38-39`) and a dangling item derives `merging` with `next: validating` (`templates/WORKFLOW.md:92-110`), `workflow compass <dangling> --intent release` can return `on-course` when the `graduate-impl` gate is met.

Blast radius: an off-rail merged item can proceed into the release skill while its roadmap status is still `in-flight`, which defeats the feature’s core backstop guarantee. A reasonable fix is to make the exemption intent-specific, allowing only the reconcile/ship intent for the dangling item, and add a regression test for `--intent release` on the dangling item.

## 2026-06-23 — audit-barrage lift (end-govern-after_implement)

### AUDIT-20260623-03 — `start-merging` transition is a refusal surface only — structurally unreachable as a firable path via `workflow advance`

Finding-ID: AUDIT-20260623-03 (claude-04 + codex-01; cross-model)
Status:     fixed-3b353598
Severity:   high
Per-lane:   claude=informational, codex=high
Decision:   adjudicated (gate-counted high) — blast-radius=unstated, reachability=unstated, fix-debt=no; no down-calibration signal — high retained.
Surface:    templates/WORKFLOW.md — `transition:start-merging`; src/subcommands/workflow-advance.ts — `emitAdvance`

```
## transition:start-merging
- from: governing
- to: merging
- exit-gate: graduate-impl impl
```

The `start-merging` transition documents the `governing → merging` edge and carries `exit-gate: graduate-impl impl`. When `workflow advance` is called for an item at `governing`, the code finds `start-merging`, checks `isGraduation = t.exitGate.some(c => c.kind === 'graduate-impl')` → true, evaluates the gate → always unmet (if the record existed, the item would already derive `merging`), and exits 1 with a refusal message. The only way to actually reach `merging` is for the convergence record to be written externally (by `govern`), after which the item derives `merging` directly via the `derive: record-converged impl` predicate — the `start-merging` transition is never applied.

This is a design choice, not a defect: `start-merging` provides a meaningful refusal message for an operator who calls `workflow advance` prematurely. It is worth noting so future readers understand that the transition's purpose is the gate check and error path, not an applicable transition. A comment in the WORKFLOW.md or the advance code explaining this would prevent future confusion.

### AUDIT-20260623-04 — Feature-branch upstreams are mistaken for default-branch merges

Finding-ID: AUDIT-20260623-04
Status:     fixed-3b353598
Severity:   high
Per-lane:   codex=high
Decision:   single-model (gate-counted high)
Surface:    src/session/git.ts:91-105, src/session/git.ts:133-141, src/workflow/merge-signal.ts:33-40

`mergedButInFlight` treats a convergence-record commit as merged when `isReachableFromBase(recordCommit, root) === true`. But `isReachableFromBase` uses `resolveBase`, and `resolveBase` prefers `@{upstream}` before `origin/HEAD`, `origin/main`, or `origin/master`. On a normal feature branch tracking `origin/feature`, pushing the convergence record to that feature branch makes the record commit reachable from the upstream, even though it has not landed on `origin/main`.

That creates a false dangling-merge signal: compass/close/session advisory will report “merged-but-status-in-flight” and block forward motion before any off-rail merge happened. The blast radius is high because it can block ordinary pre-merge feature work for any branch with an upstream. The merge signal needs a default-branch resolver that ignores the current branch upstream, plus a test where `origin/feature` contains the record commit but `origin/main` does not, and `mergedButInFlight` returns null.

## 2026-06-23 — audit-barrage lift (end-govern-after_implement)

### AUDIT-20260623-05 — `workflow advance` can record `shipped` without the merge/CI half of the weld

Finding-ID: AUDIT-20260623-05
Status:     open
Severity:   high
Per-lane:   codex=high
Decision:   single-model (gate-counted high)
Surface:    src/subcommands/workflow-advance.ts:32-104; skills/ship/SKILL.md:42-66; src/__tests__/workflow/advance-graduate-at-merge.test.ts:61-76

`/stack-control:ship` says the invariant is “operator confirms CI green → merge → fire graduate” and that steps 3 and 4 are “one welded operation” (skills/ship/SKILL.md:42-66). But the CLI core exposes the `graduate` transition through plain `stackctl workflow advance <item> --apply`; `emitAdvance` only derives the current phase, checks the `graduate-impl` gate, and applies the transition effects (src/subcommands/workflow-advance.ts:32-104). There is no evidence input that a PR was merged or that CI was confirmed.

The new test locks this in by proving a local repo with no remote can record `status: shipped` via `workflow advance --apply` (src/__tests__/workflow/advance-graduate-at-merge.test.ts:61-76). Remote-independent status recording is valid, but as implemented the “merge is the event” invariant is unenforced on the advertised CLI-first surface. Blast radius is high: an unattended agent following the CLI surface can mark an unmerged feature as shipped, moving it into `validating`/release territory without the operator-owned merge ever happening. A reasonable correction would make the merge action and status recording a single command surface, or require an explicit operator-provided merge confirmation/evidence token for the `graduate` transition rather than exposing it as generic advance.

### AUDIT-20260623-06 — The off-rail backstop is only wired into compass/close, not the mutating `workflow advance` path

Finding-ID: AUDIT-20260623-06
Status:     fixed-f1f7f98e
Severity:   high
Per-lane:   codex=high
Decision:   single-model (gate-counted high)
Surface:    src/workflow/compass-resolve.ts:56-77; src/workflow/compass.ts:84-95; src/subcommands/workflow-advance.ts:32-104

The dangling merge signal is computed in `resolveCompass` and passed into `computeVerdict` (src/workflow/compass-resolve.ts:56-77), where phase-bearing forward intents are refused while any merged-but-status-in-flight item exists (src/workflow/compass.ts:84-95). But `emitAdvance` does not call `resolveCompass`, `firstDanglingMergedItem`, or any equivalent guard before applying a forward transition (src/subcommands/workflow-advance.ts:32-104).

That leaves a front-door mutating command able to advance unrelated lifecycle items while the cross-item backstop is active. The tests cover the close command’s backstop path, but not generic `workflow advance` on another item. Blast radius is high because `workflow advance` is a stackctl lifecycle surface, not raw `git`/`gh`; an adopter or unattended agent can bypass the promised “refuses forward lifecycle motion at the next workflow waypoint” behavior without leaving the stack-control CLI. The guard should be shared by the mutating advance path, with the same reconcile exemption used by compass.

## 2026-06-23 — audit-barrage lift (end-govern-after_implement)

### AUDIT-20260623-07 — `isPostMergeStatus` only excludes `shipped`/`closed` — a `blocked` or `cancelled` item with a reachable convergence record deadlocks the backstop

Finding-ID: AUDIT-20260623-07
Status:     fixed-d609d031
Severity:   high
Per-lane:   claude=high
Decision:   adjudicated (gate-counted high) — blast-radius=unstated, reachability=reachable, fix-debt=no; no down-calibration signal — high retained.
Surface:    `src/workflow/merge-signal.ts:22-25` and `src/subcommands/workflow-advance.ts:50-56`

`isPostMergeStatus` in `merge-signal.ts` gates the dangling-item signal:

```typescript
function isPostMergeStatus(status: string): boolean {
  const s = status.toLowerCase();
  return s === 'shipped' || s === 'closed';
}
```

It excludes only `shipped` and `closed`. Any other status — including `blocked` and `cancelled` (valid side-states surfaced throughout the codebase via `{ kind: 'side-state', id: 'blocked' }`) — is treated as "in-flight" and will trigger the backstop if the item's convergence record commit is reachable from `origin/main`.

This creates an irreconcilable deadlock via a realistic sequence: an item is governed and then merged off-rail (convergence record lands on `main`); the team subsequently marks it `cancelled` in ROADMAP.md. At that point `firstDanglingMergedItem` returns it, the backstop fires and blocks all forward lifecycle motion for every other item, and the only stated reconcile path — `stackctl workflow advance <item> --apply` — immediately hits the guard in `emitAdvance`:

```typescript
if (phase.kind === 'side-state') {
  failUsage(`'${itemId}' is in terminal side-state '${phase.id}'; induct it back before advancing`);
}
```

There is no other automated path. The operator is stuck until they manually edit ROADMAP.md to record `status: shipped` or `closed` on the cancelled item, a non-obvious recovery that nothing in the error message names.

The fix is to extend `isPostMergeStatus` to also return `true` for `'blocked'` and `'cancelled'` (or rename it `isNonDanglingStatus` and enumerate all statuses that do not need a merge-recording reconcile). Alternatively, the backstop could restrict its trigger to items whose status is specifically `'in-flight'`, matching the function name `mergedButInFlight` and the feature spec's stated threat model.

---

## 2026-06-23 — audit-barrage lift (end-govern-after_implement)

### AUDIT-20260623-08 — Shared lifecycle precondition drops the new backstop signal

Finding-ID: AUDIT-20260623-08
Status:     fixed-d0b7959d
Severity:   high
Per-lane:   codex=high
Decision:   adjudicated (gate-counted high) — blast-radius=unstated, reachability=unstated, fix-debt=no; no down-calibration signal — high retained.
Surface:    src/lifecycle-precondition.ts:37-46; src/subcommands/govern.ts:185-199

`resolveCompass()` now computes `danglingMergedItem`, and the CLI compass path correctly passes it into `computeVerdict()` with `intentItem` at `src/subcommands/workflow.ts:141-155`. But the shared lifecycle precondition still destructures only `doc`, `hasNode`, `currentPhase`, and `nextGateUnmet`, then calls `computeVerdict()` without `danglingMergedItem` or `intentItem` at `src/lifecycle-precondition.ts:37-46`.

This matters because `stackctl govern --item ...` uses this helper as its lifecycle gate before payload assembly at `src/subcommands/govern.ts:185-199`. With a merged-but-status-in-flight item dangling, a later govern run can still pass this shared precondition, even though the feature claims forward lifecycle waypoints refuse until reconciliation. Blast radius is high: an adopter or unattended agent using the govern entry point can keep moving lifecycle work through a path that the CLI compass would have refused. The fix is to thread `danglingMergedItem` from `resolveCompass()` through `checkLifecyclePrecondition()` into `computeVerdict()`, passing `intentItem: args.item`, and add a regression test for the helper or govern path.

### AUDIT-20260623-09 — Backstop refusal suggests a generic `roadmap advance --to shipped` shortcut

Finding-ID: AUDIT-20260623-09
Status:     fixed-d0b7959d
Severity:   high
Per-lane:   codex=high
Decision:   single-model (gate-counted high)
Surface:    src/workflow/compass.ts:90-93; src/subcommands/roadmap.ts:243-254

The backstop refusal in `computeVerdict()` tells the operator to run either `stackctl workflow advance <dangling> --apply` or `stackctl roadmap advance <dangling> --to shipped --apply` at `src/workflow/compass.ts:90-93`. The second command is not equivalent to the welded reconcile path. `roadmap advance` special-cases only `--to closed`; every other status, including `shipped`, is just the old single-line status rewrite at `src/subcommands/roadmap.ts:243-254`.

That means following the advertised recovery can clear the dangling signal while skipping the `graduate` transition’s required side effects: `roadmap-reconcile`, `journal-append`, and `commit` from `templates/WORKFLOW.md:177-184`. Blast radius is high because this is emitted as the machine’s own recovery instruction in a refusal path, and an unattended operator agent could reasonably execute it. The recovery text should name only `stackctl workflow advance <id> --apply`, or `roadmap advance --to shipped` must be blocked/redirected when it is being used as a ship-stage reconcile shortcut.

## 2026-06-23 — audit-barrage lift (end-govern-after_implement)

### AUDIT-20260623-10 — Missing `src/subcommands/no-shortcuts-audit.ts` — import in `weld-no-shortcuts.test.ts` has no matching source

Finding-ID: AUDIT-20260623-10
Status:     false-positive (chunked-audit artifact — src/subcommands/no-shortcuts-audit.ts exists since Jun 16, absent only from this chunk's diff; import resolves, weld-no-shortcuts 3/3, tsc + full suite green)
Severity:   high
Per-lane:   claude=high
Decision:   single-model (gate-counted high)
Surface:    src/__tests__/workflow/weld-no-shortcuts.test.ts:10

`weld-no-shortcuts.test.ts` (a new file in this diff, T012) imports `scanShortcutAffordances` from `../../subcommands/no-shortcuts-audit.js`:

```typescript
import { scanShortcutAffordances } from '../../subcommands/no-shortcuts-audit.js';
```

This module (`src/subcommands/no-shortcuts-audit.ts`) does not appear in the Files in scope list for this chunk, nor does any diff hunk show it being added. The file list includes `src/subcommands/workflow-advance.ts` and `src/subcommands/workflow-shared.ts` (both newly created), but `no-shortcuts-audit.ts` is absent. If the file doesn't exist in the current HEAD, the entire test module fails at import time — none of the three tests in `weld-no-shortcuts.test.ts` can run, including the assertion that the ship SKILL.md has no `--defer`/`--skip` affordance (the primary T012 contract). This is a chunked audit, so the file may exist in another chunk; but as written here, the dependency is unresolved.

---

### AUDIT-20260623-11 — Ship skill records `status: shipped` after the PR is already merged

Finding-ID: AUDIT-20260623-11
Status:     fixed-d344800b
Severity:   blocking
Per-lane:   codex=blocking
Decision:   single-model (gate-counted blocking)
Surface:    skills/ship/SKILL.md:53-72

The ship skill tells the agent to merge the PR first, then run `stackctl workflow advance <item> --apply`, then `git push` “the branch”. In the normal PR workflow, after `gh pr merge` the default branch has already consumed the PR head as it existed at merge time. The subsequent `workflow advance` commit is created after the merge, on the local branch the agent is sitting on, so pushing that branch does not put the `status: shipped` roadmap change onto the default branch that just received the feature.

That breaks the core weld guarantee: an unattended agent can follow `/stack-control:ship` exactly as written and still land implementation on trunk while the shipped-status commit is not part of the merged PR. The blast radius is blocking because this is the single sanctioned on-rail path, and acting on the skill as written reproduces the feature’s motivating defect. A reasonable fix is to make the git ordering produce one mergeable unit: either record the welded `graduate` commit on the PR branch before the final merge/push, or after the merge explicitly update the default branch and commit/push the status there. The skill should name the required branch/ref behavior, not just “push the branch.”
