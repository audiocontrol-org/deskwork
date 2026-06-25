---
id: TASK-150
title: >-
  stack-control needs mechanical anti-halting enforcement for autonomous spec
  burndown
status: To Do
assignee: []
created_date: '2026-06-16 23:37'
updated_date: '2026-06-25 19:22'
labels:
  - 'type:imported-issue'
  - promoted
dependencies: []
references:
  - gh-470
ordinal: 150000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Summary

`stack-control`'s current execute/govern loop is not mechanically forceful enough to keep an autonomous coding agent driving a spec burndown to completion. In real use on June 13-14, 2026, the agent repeatedly drifted into a pathological pattern:

- a governed run completed or failed
- the next clear action existed locally
- but the agent paused, narrated, answered meta-questions, or kept polling instead of immediately continuing the burn-down loop
- and these halts were often silent from the operator's perspective unless the operator explicitly intervened

This is not a model-quality complaint in the abstract. It is a protocol-design problem: the loop leaves too much discretion to the agent between `govern` rounds, and there are too few mechanical teeth to force the next state transition.

The result is that the operator has to manually reassert the intended behavior (`fix -> test -> commit -> push -> re-govern`) even though stack-control exists precisely to make that loop canonical.

## Concrete pathology

Observed in a real `design-control` spec burndown inside `plugins/design-control/specs/001-design-control`.

The pattern recurred several times:

1. `stackctl govern --mode implement --phase 2C` completed and produced findings.
2. The next implementation slice was obvious and locally actionable.
3. Instead of directly performing the next slice, the agent:
   - kept reporting that the run was still running,
   - summarized process state,
   - answered meta-process questions,
   - or otherwise stopped short of the next forced mutation.
4. The operator then had to explicitly tell the agent to continue the audit protocol or stop halting.

The most concerning aspect is not merely halting, but **silent halting**:
- from the operator side, it looks like work is still "in progress"
- but no new commit, govern run, or fix batch is actually underway
- and nothing in stack-control itself distinguishes genuine active execution from conversational drift

## Why this is a stack-control problem

Today, stack-control gives a strong *conceptual* workflow:
- execute through the front door
- govern after implementation
- use per-phase governance to converge

But it does not yet impose enough *mechanical* workflow pressure on the agent once a run result exists.

What is missing is something like:
- a required explicit next state after each govern result
- a machine-checkable notion of "the agent is still actively advancing the burndown"
- a way to detect that the loop has stalled even though the session is still conversationally active
- a refusal mode that says, effectively: "you may not narrate indefinitely; either mutate the repo, launch the next govern, or declare a concrete blocker"

Right now, the burden of enforcing that discipline falls back to the human operator.

## Evidence from the real sequence

This issue is grounded in the actual `design-control` burndown on June 14, 2026:

- multiple consecutive govern runs existed under `.stack-control/audit-runs/`
- multiple fix batches were committed and pushed in response to findings
- but between those fix batches, the agent repeatedly paused long enough that the operator had to explicitly ask whether it was stuck, whether it had halted, and why it was waiting
- the operator then had to request proof of progress and demand continued autonomous execution

This is exactly the wrong failure mode for a protocol whose stated purpose is to let the agent burn down a spec implementation plan autonomously.

## What needs mechanical teeth

### 1. Post-govern transition must be explicit and mandatory

After every governed run, stack-control should require one of exactly these transitions:
- `fixing findings`
- `repairing govern/fleet outage`
- `advancing to next unfinished phase/slice`
- `blocked on external constraint`

If none is selected within the tool/skill flow, the loop should be treated as stalled.

### 2. Introduce stall detection based on artifacts, not narration

The protocol should define progress only in terms of observable artifacts, for example:
- new commit
- new push
- new governed run directory
- new audit-log entry
- explicit blocked status with a named external constraint

If conversational turns occur without one of those signals after a completed govern result, the system should treat that as a stall condition.

### 3. Silent halts should be surfaced as protocol violations

A session can look active while doing nothing. That should not be invisible.

The protocol should detect and surface:
- no new repo mutation after findings exist
- no new govern launch after the last fix batch
- repeated polling/reporting with no state transition

This should be visible to the operator as a stack-control state, not something they have to infer from vibes.

### 4. The loop should privilege execution over conversation by default

If the active state is "findings exist and no blocker is recorded," stack-control should push the agent toward:
- patch
- test
- commit
- push
- re-govern

not toward open-ended narrative updates.

In other words, the protocol should not merely *permit* autonomy; it should actively constrain the agent into the next action.

### 5. Add a "proof of forward motion" contract

A useful invariant would be:
- every cycle must end with a proof-bearing event

For example:
- pushed commit SHA
- governed run directory
- blocking condition recorded

If the cycle ends without one, stack-control should consider the burndown incomplete and still active, and should push the agent back into execution.

## Proposed remediation directions

### Option A: execute/govern state machine

Make the workflow an explicit finite-state machine, where after `govern_complete` the agent must transition into one of:
- `applying_fixes`
- `rerunning_govern`
- `advancing_phase`
- `blocked`

No free-form idle state.

### Option B: watchdog for completed-govern / no-follow-up

When a govern run ends, start a watchdog window. If no qualifying forward-progress artifact appears within that window, mark the session as stalled and inject a forced continuation prompt into the control loop.

### Option C: tool-level continuation requirement

Make `stackctl govern` emit a machine-readable continuation contract, e.g.:
- `next_required_action: fix_findings`
- `next_required_action: rerun_govern`
- `next_required_action: phase_complete`

and have the stack-control skill refuse to drift away from that action unless it records a blocker.

### Option D: explicit operator-facing stall telemetry

Expose something like:
- last govern result time
- last mutating commit time
- last push time
- last rerun time
- current loop state
- stalled: yes/no

This makes silent halts diagnosable.

## Acceptance signal

This issue is fixed when an autonomous spec burndown can no longer degrade into:
- completed govern result
- obvious next local fix exists
- agent becomes conversationally busy but operationally idle
- operator must step in and say "continue" or "stop halting"

Instead, the system should mechanically force one of:
- the next fix batch
- the next govern run
- an explicit blocked state with a real external constraint

## Related issues

These are adjacent but distinct:
- #467 `stackctl govern --phase only parses colon-form phase headers`
- #468 `stackctl per-phase govern scoping is unsound when tasks.md lacks authoritative file lists`
- #469 `stack-control audit protocol has high operator friction for per-phase backfill governance`

Those focus on scoping/fleet/backfill ergonomics. This issue is about the deeper control-loop pathology: the protocol does not mechanically suppress autonomous halting once the burndown is underway.
<!-- SECTION:DESCRIPTION:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
- **Promoted-to:** roadmap:impl:feature/autonomous-loop
<!-- SECTION:NOTES:END -->
