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
Status:     open
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
Status:     open
Severity:   high
Per-lane:   codex=high
Decision:   single-model (gate-counted high)
Surface:    src/session/git.ts:91-105, src/session/git.ts:133-141, src/workflow/merge-signal.ts:33-40

`mergedButInFlight` treats a convergence-record commit as merged when `isReachableFromBase(recordCommit, root) === true`. But `isReachableFromBase` uses `resolveBase`, and `resolveBase` prefers `@{upstream}` before `origin/HEAD`, `origin/main`, or `origin/master`. On a normal feature branch tracking `origin/feature`, pushing the convergence record to that feature branch makes the record commit reachable from the upstream, even though it has not landed on `origin/main`.

That creates a false dangling-merge signal: compass/close/session advisory will report “merged-but-status-in-flight” and block forward motion before any off-rail merge happened. The blast radius is high because it can block ordinary pre-merge feature work for any branch with an upstream. The merge signal needs a default-branch resolver that ignores the current branch upstream, plus a test where `origin/feature` contains the record commit but `origin/main` does not, and `mergedButInFlight` returns null.
