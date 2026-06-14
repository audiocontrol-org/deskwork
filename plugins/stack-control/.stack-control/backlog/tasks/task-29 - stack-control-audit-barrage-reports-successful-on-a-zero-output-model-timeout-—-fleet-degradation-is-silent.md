---
id: TASK-29
title: >-
  stack-control: audit-barrage reports 'successful' on a zero-output model
  timeout — fleet degradation is silent
status: Done
assignee: []
created_date: '2026-06-11 00:41'
updated_date: '2026-06-13 19:03'
labels:
  - 'type:imported-issue'
  - promoted
dependencies: []
references:
  - gh-447
ordinal: 29000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
stack-control tooling friction, surfaced while running the audit-barrage protocol on design-control (2026-06-10).

## Symptom

A barrage model that TIMES OUT with ZERO bytes of output is folded into an exit-0 run reported as `audit-barrage: barrage successful — 1 of 2 models emitted findings; auditing as a practice statistically yields better code`. The BarrageRun JSON records `"timedOut": true, "stdoutBytes": 0` for the model, but the human-facing summary line and the exit code treat a 50% fleet failure as success.

## Why it matters

Cross-model agreement is the protocol's HIGH-confidence signal — a one-model round cannot produce it, so a silently-degraded fleet quietly downgrades every finding's confidence tier. The dw-lifecycle-era gemini disablement existed precisely to keep the "models attempted" count honest; a zero-output timeout is the same distortion arriving at runtime. In the observed run the timeout was only noticed by reading the JSON, and the round had to be re-fired (claude, 600s) to restore the two-model signal.

## Suggested fix

Keep exit 0 (a partial fleet is still a usable run), but make degradation loud: a stderr WARNING naming each timed-out / zero-output model and the consequence ("cross-model agreement unavailable this round"), and consider a `--require-models <n>` or `--strict-fleet` flag for protocol-driven runs where the agreement signal is the point.

## Provenance

Run 20260610T184044970Z-design-control (claude timedOut=true, 0 bytes; codex 169s, findings). Filed per the tooling-friction-to-GitHub-issues policy. Related: #446 (the timeout came from a silently-ignored legacy config; this issue is the separate reporting-shape problem).
<!-- SECTION:DESCRIPTION:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
- **Promoted-to:** spec:specs/014-audit-protocol-reliability

specs/014 US1 implemented: zero-output models named on stderr with cause + lost-agreement line; --require-models floor (govern defaults 2). Commits 5427f49e/bc181afa + 564261e9/1a4296a7 (RED/fix). Verification before status transition is the operator’s call.

Verified 2026-06-13 in the current stack-control worktree: `npx vitest run src/__tests__/barrage-fleet-degradation.test.ts` passed (20 tests). Marked Done on that basis.
<!-- SECTION:NOTES:END -->
