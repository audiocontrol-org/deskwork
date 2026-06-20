---
id: TASK-146
title: >-
  audit-barrage severity is non-deterministic across rounds — re-rated LOW->HIGH
  on unchanged code defeats the FR-010 convergence dampener
status: Done
assignee: []
created_date: '2026-06-16 23:37'
updated_date: '2026-06-20 12:27'
labels:
  - 'type:imported-issue'
  - bug
  - promoted
dependencies: []
references:
  - gh-482
ordinal: 146000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Friction report

**Plugin:** stack-control v0.48.1 — governance (`deskwork-governance` / `spec-governance-gate` FR-010 dampener + cross-model `audit-barrage`)
**Severity:** medium (governance never converges on its own; the operator `--override` becomes mandatory rather than exceptional)
**Related:** the same pattern is already recorded in this project's 005 dev-journal ("round 10 clean, round 11 HIGH on **identical** code"), so it recurs across features — not a one-off.

### The pattern: non-deterministic severity escalation defeats the convergence dampener

The FR-010 dampener opens the gate only after **2 consecutive runs with 0 HIGH+ findings**. But the 2-model barrage (claude opus + codex gpt-5.5) **re-rates the same finding at a different severity across rounds, on code that did not change**, so a "quiet" run is repeatedly followed by a fresh HIGH — the two-consecutive-quiet condition never naturally lands.

Concrete evidence from one feature's governance loop (006 recurring-subscription-report, this session), all rounds against an unchanged or strictly-improving diff:

| Round | HIGH count | Notable |
|---|---|---|
| 1 | 2 HIGH | NUL byte, `--email` gate (both genuine, real defects) |
| 2 | 1 HIGH | transport-errors-as-skips (genuine). **`claude-09` negative-cache finding present here, rated LOW.** |
| 3 | **0 HIGH (quiet)** | dampener now needs one more quiet run |
| 4 | 1 HIGH | **`claude-09` re-surfaced and re-rated HIGH** — same finding, same code surface, no change between round 3 and round 4 |

So a finding the fleet itself called **LOW in round 2** was called **HIGH in round 4**, immediately after a quiet round, resetting the dampener. The underlying finding may be valid as a quality item, but its **severity is non-deterministic**, and severity is exactly what the gate keys on. The result: after every genuine HIGH is fixed, the loop continues to churn (each round ~4–5 min of paid cross-model CLI calls) with no path to a natural `OPEN`, until the operator records `--override`. That makes the override the *rule*, not the *exception the design intends*.

### Why it matters

- **The gate's core promise — "converges to OPEN when the work is clean" — is not deliverable** with a fleet that re-rates severities run-to-run. The dampener's "2 consecutive 0-HIGH" can be defeated indefinitely by severity jitter alone.
- **Cost:** each non-converging round is a full paid opus + gpt-5.5 audit. An endurance loop multiplies that with no decision value (the early rounds already surfaced the real HIGHs).
- **Operator-discipline erosion:** a mandatory-every-time `--override` trains operators to override reflexively, weakening the signal the override is meant to carry.

### Suggested directions (not prescriptive)

1. **Severity hysteresis / agreement across rounds:** only count a finding as HIGH for the gate if it is rated HIGH **consistently** (e.g. in the most recent N runs, or by ≥2 lanes in the *same* run), so single-round severity jitter can't reset the dampener. (015 added cross-*lane* agreement within a run; this is the cross-*round* analogue.)
2. **Finding-identity tracking:** key the dampener on whether *new* (previously-unseen) HIGH findings appeared, not on the raw per-run HIGH count — a finding already triaged/​dispositioned (backlogged, or operator-acknowledged) shouldn't re-block at a new severity.
3. **A bounded auto-override / quiet-streak escape:** once K rounds have passed with every HIGH either fixed or dispositioned, surface the override as the *expected* terminal step rather than a manual escape — or auto-record it with the accumulated reasons.
4. At minimum, **document** in the govern/execute skill that severity is non-deterministic on converged diffs and the override is the designed terminal step after genuine HIGHs are fixed (the skill currently frames blocked→fix→re-barrage as the loop, implying natural convergence).

### Environment

- Project consuming the published plugin (not the stack-control source tree); macOS; fleet = `claude` (opus) + `codex` (gpt-5.5), `sonnet` lane removed per operator config.
- This run also required several setup workarounds to get `govern` to start (`GOVERN_STACKCTL`, seeding `fleet-knowledge.yaml`, lane-set alignment, a per-phase governed-file-list, and raising the lane prompt-byte envelopes for a 125 KB whole-feature compose) — those are separable and can be split into their own reports if useful.
<!-- SECTION:DESCRIPTION:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
- **Promoted-to:** roadmap:multi:gap/audit-barrage-severity-determinism
<!-- SECTION:NOTES:END -->
