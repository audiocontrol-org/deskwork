---
id: TASK-30
title: >-
  scope-discovery: extract shared gh-runtime module from debt-report +
  triage-issues duplication (hygiene Phase 2 follow-up)
status: To Do
assignee: []
created_date: '2026-06-10 20:07'
labels:
  - 'type:imported-issue'
  - enhancement
dependencies: []
references:
  - gh-335
ordinal: 30000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Surfaced by:** the hygiene feature's code-quality review of Phase 2 (`/dw-lifecycle:triage-issues`), commit `025a1dc`. Cross-reference: `docs/1.0/001-IN-PROGRESS/hygiene/workplan.md` Phase 2.

## Observation

Phase 1 (`/dw-lifecycle:debt-report`) and Phase 2 (`/dw-lifecycle:triage-issues`) ship parallel utility shapes that are NOT just structurally similar — they are literally identical at the source level. The hygiene implementation dispatch deliberately instructed each phase to declare its own utilities (rationale: scope isolation between hygiene-skill domain logic). The clone-detector flagged 7 new groups during Phase 2's commit; all 7 were dispositioned `keep-with-reason`.

Duplicated shapes across `src/debt-report/` and `src/triage-issues/`:

- `RunGh: (args: string[]) => string` — same type, declared in both `debt-report/types.ts:89` and `triage-issues/types.ts:14`.
- `isLabelShape` / `isCommentShape` / `isRawIssue` type-guard chain — identical implementations in `debt-report/gh-issues.ts:22-58` and `triage-issues/propose.ts:31-59`.
- `latestCommentDate` (computes most-recent comment timestamp from a list) — identical at `debt-report/gh-issues.ts:104-112` and `triage-issues/propose.ts:92-100`.
- `daysBetween` helper — identical instances in both modules.
- `defaultRunGh` (execFileSync wrapper around gh) — identical at `subcommands/debt-report.ts:94-96` and `subcommands/triage-issues.ts:139-141`.
- `parsePositiveInt` (argv parser with `/^\d+$/` strict guard) — identical at `subcommands/debt-report.ts:33-47` and `subcommands/triage-issues.ts:32-42`.
- `detectRepoFromGit` (parses `git remote get-url origin` into `owner/repo`) — also paralleled in the older `subcommands/issues.ts:40-50` (so this duplication predates the hygiene feature).

## Why this matters

The next phases of hygiene will each touch `gh` and `git`. Phase 5 (`:close-shipped`) will need `defaultRunGh` + `detectRepoFromGit` for sure. A third consumer will likely copy from one of the two existing shapes and lock in the duplication; the longer the parallel shapes coexist, the more they will diverge in subtle ways (one might evolve a feature the others don't get).

The workplan instruction "don't import across hygiene-skill libraries" was about domain logic isolation (debt-report scanners vs triage dispatchers). It does NOT preclude a third common layer both depend on.

## Proposed shape

Extract a `plugins/dw-lifecycle/src/gh-runtime/` module hosting:

- `runtime.ts` — the `RunGh` / `RunGit` callback types + `defaultRunGh` / `defaultRunGit` + `detectRepoFromGit`.
- `gh-issues.ts` — the `isRawIssue` type-guard chain + `latestCommentDate` + `daysBetween` (or move `daysBetween` to a `dates.ts`).
- `argv.ts` — `parsePositiveInt`.

Both `debt-report` and `triage-issues` import from there. The clone-group entries currently marked `keep-with-reason` can then transition to `closed-by-extraction` (with the precondition-verification flow the scope-discovery harness already supports).

## Why I'm not doing this in the hygiene PR

- Scope: the operator's hygiene PRD scoped the feature to "ship the skill family"; an infra-extraction refactor is adjacent scope, not in.
- Risk: the extraction touches Phase 1 + Phase 2 (already shipped); it should land between phases when the operator can see the diff cleanly, not bundled inside Phase 3.
- Operator-owned: the trade-off (parallel-isolation vs extracted-DRY) is a judgment call. The hygiene implementer chose isolation per their brief; second-guessing it inside this PR contradicts the "operator owns scope decisions" project rule.

## Recommendation

Triage this as either:

1. **In-scope to hygiene** — operator says "extract now"; add a new Phase between current Phase 2 and Phase 3 that does the extraction + updates Phase 1+2 imports.
2. **Out-of-scope, do it before Phase 5** — operator says "extract before close-shipped lands so all three new skills consume the shared module." File a follow-up issue tracked separately.
3. **Out-of-scope, defer indefinitely** — accept the 7 keep-with-reason clone-group entries as a permanent parallel-shape decision.

I lean (1) or (2). The clone-detector flagged the duplication; the longer it lives, the more it costs to extract.

## Related

- Hygiene PRD: `docs/1.0/001-IN-PROGRESS/hygiene/prd.md` (on `feature/hygiene` branch).
- Hygiene workplan: `docs/1.0/001-IN-PROGRESS/hygiene/workplan.md` Phase 2.
- Code-quality review findings #4 and #8 (Phase 2 cycle).
- The 7 clone-group entries dispositioned `keep-with-reason` in commit `b2e5178`.
<!-- SECTION:DESCRIPTION:END -->
