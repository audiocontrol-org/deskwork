---
id: TASK-60
title: >-
  stack-control: audit-barrage convergence loops are myopic — 20 rounds where
  ~6-10 were structurally necessary (fix-induced surface growth, boundary
  patching, serial single-fleet discovery)
status: To Do
assignee: []
created_date: '2026-06-12 06:26'
updated_date: '2026-06-14 01:54'
labels:
  - 'type:imported-issue'
  - promoted
dependencies: []
references:
  - gh-453
ordinal: 60000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
stack-control tooling friction, from running the audit-barrage protocol to convergence on the design-control lint (2026-06-10; 20 rounds to the two-consecutive-zero-HIGH criterion; full record in https://github.com/audiocontrol-org/deskwork/blob/feature/design-control/plugins/design-control/specs/001-design-control/audit-log.md AUDIT-20260610-01..66 + CONVERGENCE RECORD).

## Symptom

The fix-and-refire convergence loop took 20 rounds where a less myopic process would plausibly have taken 6-10. The protocol worked — every round produced verified, genuine findings — but post-hoc analysis shows most of the round count came from four structural drivers, three of which are properties of the protocol's shape rather than of the audited code:

1. **Fix-induced surface growth, unguided.** The protocol's two arms feed each other: every false-positive fix widens the allowlist, and every widening hands the leak arm new value/state/multiline/composition channels. Finding genealogy from the run: textarea added round 7 (fp fix) -> defeated via content round 8 -> via placeholder round 9; a percent-decode fix (round 15) composed with an earlier backslash rule into a round-17 ordering defeat; digits-only list numbering (round 15) was defeated by `reversed` composition (round 18). Nothing in the protocol prompts the fixer to enumerate the channels a fix just opened BEFORE re-firing. The two times the fixer self-red-teamed a fix in the same commit (an encoded-separator alias; boundary fixtures), it provably saved a round.

2. **Incremental boundary patching.** When a finding forces a scope boundary (here: text-as-imagery), the natural failure mode is wording the boundary as an exclusion of the specific counterexample rather than as the mechanism's invariant. The run's boundary took FOUR statements to stabilize (letter mosaics -> grid geometry -> glyph class -> composition of sanctioned atoms), and the auditor — which reads source comments and attacks stated reasoning — found the adjacent uncovered case each round. The invariant ("content statistics see punctuation mass in flow; everything that exists only to an eye is the referee's") was derivable at first contact.

3. **Serial discovery under a degraded fleet.** One model (claude) was 0-byte from round 3 onward (#447), so discovery serialized: one channel family = one finding per round = N rounds for an N-variant family (the density family cost ~7). The one full-fleet round (round 2) produced almost entirely DISJOINT defect sets from the two models — parallel search is most of what diversity buys, on top of the agreement signal. Degraded-fleet runs both weaken the verdict AND multiply the round count, and nothing in the protocol surfaces that cost while it accrues (#447 covers the silent-degradation reporting half).

4. **Adversary-priced gate.** Every auditor-graded HIGH resets the streak regardless of breadth, and the auditor graded liberally late in the loop (several late HIGHs were narrow by the prompt's own severity rubric). Probably correct bias for a trust gate — arguing severity with your own auditor is how findings get slushed — but worth a deliberate decision rather than an accident of rubric drift.

## Ask

Have stack-control think up protocol-level mitigations for the myopia. Candidate directions from the run, to accept/reject/replace:

- **A fix-time "channel enumeration" step in the audit/implement skill guidance:** when a fix ADDS anything to an allowlist/surface, enumerate its value, state, multiline, and composition channels in the same commit (with fixtures) before re-firing. Could be a checklist line in the audit-barrage skill body, or a lift-time prompt to the fixer.
- **A boundary-statement discipline:** when a finding is dispositioned as a scope boundary, require the boundary be stated as the mechanism's INVARIANT (what it structurally cannot see) plus an explicit in-scope exception clause, not as an exclusion of the counterexample. The run's prompt-clause format (boundary + "a finding is in scope ONLY if...") eventually stopped recurrences; it could be a documented pattern.
- **Round-0 self-red-team pass:** before round N+1 fires, a cheap single-model pass over ONLY the diff of round N's fixes ("defeat what was just changed") — most mid-loop HIGHs were defeats of the previous round's delta, discoverable at much lower cost than a full-source barrage.
- **Fleet-degradation pricing:** when the fleet is degraded, surface the expected cost ("single-family: discovery serializes, agreement unavailable; consider deferring convergence claims") — pairs with #447's reporting fix.
- **Severity-rubric anchoring:** periodically re-anchor the auditor's severity grading against the prompt's own rubric (e.g. the lift step flags HIGHs whose text matches the rubric's MEDIUM definition for fixer attention, without downgrading).

## Provenance

design-control lint barrage loop, 2026-06-10, rounds 1-20 (run dirs under .stack-control/audit-runs/2026061*-design-control on the feature branch). Convergence reached but single-family (codex); cross-model re-validation pending #447. Filed per the tooling-friction-to-GitHub-issues policy. Related: #447 (silent fleet degradation), #444 (friction-routing policy).
<!-- SECTION:DESCRIPTION:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
- **Promoted-to:** spec:specs/021-audit-protocol-friction-burndown
<!-- SECTION:NOTES:END -->
