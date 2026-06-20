# Phase 1 Data Model: govern-operability

Entities are extensions of existing on-disk/in-memory structures (specs/015/021 substrate). No new store.

## Finding-signature (US3, US4)

The canonical identity of a finding, shared by the dampener identity-key and the lift dedup.

- **Definition**: tuple `(normalizedHeading, primaryFilePath)`.
- **normalizedHeading**: lowercase, punctuation-stripped, mirroring the existing cross-model cluster-merge basis (≥12-char heading overlap). Reuse `extract-barrage-findings.ts` normalization — single source, no second normalizer.
- **primaryFilePath**: the installation-relative path of the finding's primary file (the first file the finding names).
- **Equality**: two findings are the same identity iff their signatures are equal.
- **Used by**: `check-barrage-dampener.ts` (count new vs seen), `audit-barrage-lift.ts` + `slush-findings.ts` (dedup before task creation).

## Finding status (US4)

Existing audit-log finding states, used by the never-lift rule:

- `open` → eligible for lift/slush (subject to dampener + degraded-fleet guards).
- `migrated-to-backlog <task-id>` → already lifted; dedup reuses the task.
- `fixed-<sha>` → resolved; MUST NOT be lifted (FR-013) and triggers backlog reconciliation (FR-015).

## Lane terminal state (US1, US2)

Per-lane outcome recorded in the run INDEX and surfaced at synthesis/lift:

- `completed` — clean exit, produced output.
- `timed-out` — exceeded timeout budget (zero/partial output).
- `killed-no-liveness` — no liveness pulse within the window.
- `killed-external` — OOM / external signal.
- `zero-byte` — completed/closed but emitted no bytes (degraded).
- **Degraded set** = {timed-out, killed-no-liveness, killed-external, zero-byte}. A run containing any degraded lane is NOT a quiet run (FR-007).

## Convergence streak (US2, US3)

The dampener's consecutive-quiet-run counter (FR-010/015 substrate from 015):

- Increments only on a **fully-healthy** run (no degraded lane) with **zero new** (previously-unseen) HIGH findings.
- A re-rated already-seen finding does NOT reset it (US3).
- A genuinely-new HIGH or a degraded run does NOT increment it.

## Per-phase checkpoint (US7)

Extends the existing `PhaseCheckpointRecord` (`checkpoint-state.ts`):

- **scopeFingerprint** changes from whole-file content hash to a **hunk-set hash**: for each governed file, the post-image content of the phase's own changed line-ranges (diff hunks vs the phase's diff-base).
- Other fields unchanged (governedPaths, auditedFiles, checkpoint label, auditLogSection).
- **Freshness**: a checkpoint is stale iff one of its own hunks' post-image content changed — not when an unrelated hunk in a shared file changed.

## Override marker (US4)

The recorded operator escape:

- **Fields**: reason (operator-supplied), attribution (override, not convergence), the checkpoint/phase it graduated.
- **Lifetime**: per-invocation only — recorded in the audit trail, NOT persisted as a fingerprint-keyed gate input (operator decision). No invalidation logic (nothing persists).

## Graduate gate (US6)

The either-of condition evaluated by `gate-eval.ts`:

- Graduates iff `all-phase-checkpoints-current` **OR** `record-converged` (whole-feature).
- Default path: per-phase (all-phase-checkpoints-current). Opt-in: whole-feature record.
