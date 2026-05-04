# Phase 34 Ship-Pass Implementation Audit

Date: 2026-05-03

## Scope

Audit target: the latest implementation round on this branch, interpreted as the Phase 34e remediation plus the follow-on ship-pass:

- `5875390` — Phase 34e remediation (`proper workflow selection + content diff`)
- `ee05e2d` — Phase 34 ship-pass (`#176, #177, #178, #168, #167, #182`)

## Findings

### 1. The `#182` artifact-path backfill fix was added, but the branch still ships the exact incomplete sidecar state it was meant to clear

Severity: high

The new doctor repair path correctly knows how to stamp a missing `artifactPath` into a sidecar:

- [packages/core/src/doctor/repair.ts](/Users/orion/work/deskwork-work/deskwork-plugin/packages/core/src/doctor/repair.ts:58)
- [packages/core/src/doctor/repair.ts](/Users/orion/work/deskwork-work/deskwork-plugin/packages/core/src/doctor/repair.ts:105)

But the repository state on this branch still contains the unresolved entry that motivated `#182`:

- [c68dc297-1f25-4eed-903f-f051a9a194a6.json](/Users/orion/work/deskwork-work/deskwork-plugin/.deskwork/entries/c68dc297-1f25-4eed-903f-f051a9a194a6.json:1)

That sidecar still has no `artifactPath`, and rerunning the committed post-pivot audit script still reports one incomplete pair:

```sh
npx tsx scripts/audit-post-pivot-iterations.ts
```

Observed result: `Summary: 4 non-trivial diff(s), 2 trivial-or-identical, 1 incomplete`.

So the implementation added the repair capability, but the branch did not actually use it to clear the remaining incomplete audit pair in the repo it is validating. That leaves the ship-pass verification state short of its own intended finish line.

### 2. The rerunnable trust-rebuild audit still over-reports superseded historical approvals as if they were fresh re-review candidates

Severity: medium

The rewritten audit script now iterates **every** applied longform/outline workflow pair and labels every non-trivial diff against current on-disk content as “re-review recommended”:

- [scripts/audit-post-pivot-iterations.ts](/Users/orion/work/deskwork-work/deskwork-plugin/scripts/audit-post-pivot-iterations.ts:154)
- [scripts/audit-post-pivot-iterations.ts](/Users/orion/work/deskwork-work/deskwork-plugin/scripts/audit-post-pivot-iterations.ts:286)

For the PRD entry, that means four separate approved workflows are all surfaced as non-trivial diffs, even though the disposition document correctly explains that these are just successive `/feature-extend` cycles and **not** corrupted reviews:

- [post-pivot-review-audit.md](/Users/orion/work/deskwork-work/deskwork-plugin/docs/1.0/001-IN-PROGRESS/deskwork-plugin/post-pivot-review-audit.md:30)
- [post-pivot-review-audit.md](/Users/orion/work/deskwork-work/deskwork-plugin/docs/1.0/001-IN-PROGRESS/deskwork-plugin/post-pivot-review-audit.md:45)

In other words, the script’s raw output still points the operator toward four “re-review recommended” items that the phase’s own disposition says need no action. The narrative doc corrects the conclusion, but the tool itself still over-alerts because it does not distinguish:

- a stale approval currently relied on
- from an older approval that was later superseded by a newer approved cycle

That makes the rerunnable audit noisier than the trust-rebuild task needs.

## PRD / Workplan Adherence

This round is mostly aligned with the follow-on Phase 34 cleanup intent:

- `#176` dead lightbox bootstrap removed
- `#177` / `#178` dashboard chrome and naming tightened
- `#168` scrapbook gets a back-link to review
- `#167` empty-note edit mode no longer silently fails
- `#182` doctor now has a real `artifactPath` backfill path
- the 34e audit script now does real content comparison instead of count-only heuristics

Relevant references:

- [workplan.md](/Users/orion/work/deskwork-work/deskwork-plugin/docs/1.0/001-IN-PROGRESS/deskwork-plugin/workplan.md:1805)
- [workplan.md](/Users/orion/work/deskwork-work/deskwork-plugin/docs/1.0/001-IN-PROGRESS/deskwork-plugin/workplan.md:1806)
- [workplan.md](/Users/orion/work/deskwork-work/deskwork-plugin/docs/1.0/001-IN-PROGRESS/deskwork-plugin/workplan.md:1812)

Assessment: partial adherence.

The branch materially improves the 34e audit and lands the intended ship-pass fixes, but it does not fully close the last known incomplete audit pair in the checked-in repo state, and the rerunnable audit still over-flags superseded historical approvals as if they were actionable trust-rebuild failures.

## Verification

Targeted tests run:

```sh
npm run test --workspace @deskwork/core -- doctor/repair
npm run test --workspace @deskwork/studio -- api dashboard template-override
```

Result: passing.

Additional verification:

- reran `npx tsx scripts/audit-post-pivot-iterations.ts`
- inspected the remaining sidecar without `artifactPath`
- compared the script’s raw output against the committed disposition document
