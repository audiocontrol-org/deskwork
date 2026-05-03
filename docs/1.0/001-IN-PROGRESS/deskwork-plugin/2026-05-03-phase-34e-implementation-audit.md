# Phase 34e Implementation Audit

Date: 2026-05-03

## Scope

Audit target: the most recent feature implementation on this branch, interpreted as Phase 34e (`1028914`) covering the corrupted-review trust rebuild and repo-wide grep audit.

## Findings

### 1. The trust-rebuild audit script can select the wrong workflow record for an entry

Severity: high

The script claims it should prefer the relevant longform workflow when an entry has multiple workflow records, but the implementation does not actually model or filter by `contentKind`, and it simply takes the first workflow record found for the entry:

- [scripts/audit-post-pivot-iterations.ts](/Users/orion/work/deskwork-work/deskwork-plugin/scripts/audit-post-pivot-iterations.ts:37)
- [scripts/audit-post-pivot-iterations.ts](/Users/orion/work/deskwork-work/deskwork-plugin/scripts/audit-post-pivot-iterations.ts:79)
- [scripts/audit-post-pivot-iterations.ts](/Users/orion/work/deskwork-work/deskwork-plugin/scripts/audit-post-pivot-iterations.ts:96)

That makes the reported stale-review delta depend on directory iteration order rather than on review semantics. In this repo, the PRD entry has multiple longform workflow records with different `currentVersion` values, including both `1` and `2`:

- [2026-04-29T01-20-41-001Z-d05ebd7d-6b2a-4875-b537-5189003114c0.json](/Users/orion/work/deskwork-work/deskwork-plugin/.deskwork/review-journal/pipeline/2026-04-29T01-20-41-001Z-d05ebd7d-6b2a-4875-b537-5189003114c0.json:7)
- [2026-04-30T04-41-01-775Z-04bb7d6a-6d26-4b4c-86ce-79a1001343e8.json](/Users/orion/work/deskwork-work/deskwork-plugin/.deskwork/review-journal/pipeline/2026-04-30T04-41-01-775Z-04bb7d6a-6d26-4b4c-86ce-79a1001343e8.json:7)

The committed audit doc reports the older `currentVersion: 1` record as canonical:

- [post-pivot-review-audit.md](/Users/orion/work/deskwork-work/deskwork-plugin/docs/1.0/001-IN-PROGRESS/deskwork-plugin/post-pivot-review-audit.md:23)

So the current script can overstate the mismatch and produce a non-deterministic trust-rebuild result.

### 2. The implementation does not perform the content-diff audit that the workplan says 34e should perform

Severity: high

The workplan’s corrupted-review audit requires comparing current sidecar content against the workflow snapshot and documenting the diff before deciding whether re-review is needed:

- [workplan.md](/Users/orion/work/deskwork-work/deskwork-plugin/docs/1.0/001-IN-PROGRESS/deskwork-plugin/workplan.md:1805)
- [workplan.md](/Users/orion/work/deskwork-work/deskwork-plugin/docs/1.0/001-IN-PROGRESS/deskwork-plugin/workplan.md:1808)

But the script only compares sidecar iteration counts against workflow `currentVersion`; it never loads historical content or computes content diffs:

- [scripts/audit-post-pivot-iterations.ts](/Users/orion/work/deskwork-work/deskwork-plugin/scripts/audit-post-pivot-iterations.ts:5)
- [scripts/audit-post-pivot-iterations.ts](/Users/orion/work/deskwork-work/deskwork-plugin/scripts/audit-post-pivot-iterations.ts:98)
- [scripts/audit-post-pivot-iterations.ts](/Users/orion/work/deskwork-work/deskwork-plugin/scripts/audit-post-pivot-iterations.ts:144)

The disposition document therefore concludes more than the implementation can prove when it says no content diff needed documenting and no non-trivial diff surfaced:

- [post-pivot-review-audit.md](/Users/orion/work/deskwork-work/deskwork-plugin/docs/1.0/001-IN-PROGRESS/deskwork-plugin/post-pivot-review-audit.md:39)
- [workplan.md](/Users/orion/work/deskwork-work/deskwork-plugin/docs/1.0/001-IN-PROGRESS/deskwork-plugin/workplan.md:1807)

That may still be the correct human conclusion for this specific PRD entry, but it is not something this code path establishes.

### 3. The repo-wide grep audit is marked both complete and incomplete in the same acceptance section

Severity: medium

The workplan says the extended regex was already run against `packages/studio/src/`, `plugins/deskwork-studio/public/src/`, `packages/cli/src/`, and `packages/core/src/`:

- [workplan.md](/Users/orion/work/deskwork-work/deskwork-plugin/docs/1.0/001-IN-PROGRESS/deskwork-plugin/workplan.md:1812)

But the next line still leaves “Same audit on `packages/cli/src/` and `packages/core/src/`” unchecked:

- [workplan.md](/Users/orion/work/deskwork-work/deskwork-plugin/docs/1.0/001-IN-PROGRESS/deskwork-plugin/workplan.md:1813)

That makes 34e’s acceptance ledger internally inconsistent. The implementation may be fine, but the phase-tracking record is not reliable as written.

## PRD Adherence

Phase 34e’s PRD goal is to perform the post-34a verification and audit work, including the corrupted-review trust rebuild and repo-wide grep audit:

- [prd.md](/Users/orion/work/deskwork-work/deskwork-plugin/docs/1.0/001-IN-PROGRESS/deskwork-plugin/prd.md:593)

The implementation does land the expected artifacts:

- rerunnable audit script
- committed audit disposition doc
- production-source IOU cleanup in `editorial-review-client.ts`

Relevant references:

- [scripts/audit-post-pivot-iterations.ts](/Users/orion/work/deskwork-work/deskwork-plugin/scripts/audit-post-pivot-iterations.ts:1)
- [post-pivot-review-audit.md](/Users/orion/work/deskwork-work/deskwork-plugin/docs/1.0/001-IN-PROGRESS/deskwork-plugin/post-pivot-review-audit.md:1)
- [plugins/deskwork-studio/public/src/editorial-review-client.ts](/Users/orion/work/deskwork-work/deskwork-plugin/plugins/deskwork-studio/public/src/editorial-review-client.ts:1692)

Assessment: partial adherence.

The phase ships the right shape of artifacts, but the corrupted-review audit is narrower than the workplan says: it detects iteration-count mismatches, not stale-content diffs, and it chooses the comparison workflow record incorrectly when multiple records exist.

## Verification

Script rerun:

```sh
npx tsx scripts/audit-post-pivot-iterations.ts
```

Observed output matched the committed audit doc’s single surfaced mismatch for the PRD entry.

Manual verification:

- source audit of the 34e implementation
- inspection of the relevant workflow-record JSON files
- PRD/workplan comparison against the shipped behavior
