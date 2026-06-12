---
id: TASK-18
title: >-
  Phase 15: close-shipped redesign — narrow mechanically, judge with Agent tool
  (hygiene)
status: To Do
assignee: []
created_date: '2026-06-10 20:07'
labels:
  - 'type:imported-issue'
  - enhancement
dependencies: []
references:
  - gh-374
ordinal: 18000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Summary

Phase 15 of the hygiene feature: redesign `dw-lifecycle close-shipped` to drop prose-grammar inference and replace the per-walker decision logic with **mechanical narrowing + Agent-tool dispatch + operator-curated `propose | apply`**. Closes the unbounded patching cycle that motivated #366's Medium fix proposal and #369's Phase 14 partial fixes.

Parent: hygiene feature [#323](https://github.com/audiocontrol-org/deskwork/issues/323).

## Background

Phases 11 → 14 of the hygiene feature accrued four patches to `close-shipped`'s 4-walker prose-grammar architecture:

| Phase | What it added | Why |
|---|---|---|
| 11 (v0.26.0) | Original 4-walker prose sweep | Initial implementation |
| 13 (v0.27.0) | Drop `refs` / `parens` / `plain` from commit-log; add `Merge pull request` filter | False-positives surfaced in v0.27.0 install dogfood |
| 14 Task 1 | Config knob to re-enable end-of-subject parens | Strict v0.27.0 narrowing missed this project's commit convention |
| 14 Task 2 | `Tracks-Issue` field for audit-log + splitter heading-level fix | False-positives from prose-cited fixture text inside AUDIT entries |

The v0.28.1 install verification confirmed the trajectory was unsustainable: every release surfaces a new convention or false-positive shape that requires a new regex, knob, or field. The structural problem — re-deriving fix-ship semantics from prose, in four sources, each with its own grammar — is what Phase 15 addresses.

## What's in scope

Replace the per-walker decision logic with:

1. **Mechanical narrowing** — walk all 4 sources permissively, extract every `#NNN` mention regardless of context, group into per-candidate evidence bundles. No grammar, no false-negative risk from convention mismatch.
2. **Agent-tool dispatch from within the agent's Claude Code session** — one Agent dispatch per candidate, in parallel via single-message multi-tool-use. The agent reads the evidence bundle + a tight classification prompt; returns `shipped` / `not-shipped` / `uncertain` + one-sentence reason. Same pattern as `/dw-lifecycle:review` and `/dw-lifecycle:implement`.
3. **Operator-curated propose|apply flow** — agent verdicts land in `proposals-<timestamp>.json` mirroring `triage-issues` / `dismantle-worktrees`. Operator fills `decision` per item (`accept-verdict` / `override-shipped` / `override-not-shipped` / `skip`), runs `apply`. Operator stays the disposition holder per the agent-discipline rule.

Legacy single-command `close-shipped <flags>` flow stays as the default fall-through for one release cycle past the redesign ship, then deprecates with a notice pointing at the new shape.

## Design + implementation artifacts

- **Design spec:** `docs/superpowers/specs/2026-05-30-close-shipped-redesign.md` (commit `52baa75` on `feature/hygiene`).
- **Implementation plan:** `docs/superpowers/plans/2026-05-30-close-shipped-redesign.md` (commit `ad62b64`). 11 tasks, TDD throughout.

## Acceptance criteria

- [ ] `dw-lifecycle close-shipped scan --from-tag <vA> --to-tag <vB>` walks all 4 sources permissively + emits the per-candidate bundle set as JSON.
- [ ] `dw-lifecycle close-shipped propose --bundles <path> --verdicts <path>` writes a `proposals-<timestamp>.json` + prints a markdown summary table.
- [ ] `dw-lifecycle close-shipped apply --proposal <path>` validates every item has a non-empty `decision`, dispatches `gh issue comment` + `--add-label pending-verification` per `accept-verdict`-shipped + `override-shipped` row, records per-item success/failure.
- [ ] SKILL.md prose covers the `scan → Agent-tool parallel dispatch → propose → operator review → apply` orchestration end-to-end.
- [ ] Live verification against v0.27.0..v0.28.1: agent correctly identifies #356, #361, #364, #366 as shipped (genuine fixes); correctly rejects #353, #355 (back-fill docs commits), #340/#347/etc. (already-closed / cross-reference), #365 (PR self-reference).
- [ ] Candidate-count threshold (default 50) surfaces a confirmation prompt before the parallel Agent dispatch fires.
- [ ] Vitest unit + integration tests for the mechanical paths; full plugin suite stays green.
- [ ] Legacy bare-`close-shipped` invocation preserves the old single-command behavior for one release cycle.
- [ ] SKILL.md prose names the new flow + the Agent-tool dispatch + the proposal/apply gate + the legacy-flag sunset.

## Risks

- **Agent verdict drift** — same input may produce different verdicts run-to-run. Mitigation: strict-JSON output schema + propose|apply gate (operator can re-run cheaply; SKILL.md prose makes re-running explicit).
- **Bundle prompt cost spike** — a release with 100+ candidates spikes token usage. Mitigation: candidate-count threshold knob fires confirmation before dispatch.
- **Malformed-JSON dispatch return** — SKILL.md prose re-dispatches ONCE on first parse-failure with a short correction note; if the second response also fails to parse, record `agent_verdict: "error"` with raw response excerpt; operator overrides per item.

## Cross-references

- [#366](https://github.com/audiocontrol-org/deskwork/issues/366) — Phase 13's Medium follow-up (operator-curation `propose | apply` split) — Phase 15 supersedes by implementing the propose|apply shape directly.
- [#369](https://github.com/audiocontrol-org/deskwork/issues/369) — Phase 14's prose-grammar follow-ups — Phase 15 supersedes by retiring prose-grammar inference entirely.
- Originating discomfort: v0.28.1 install verification surfaced Phase 14's documented limitations (back-fill docs commits whose subject ends in `(#NNN)` still produce false-positives; prose-cited fixture text inside audit-log entries was leaking before the splitter heading-level fix).
<!-- SECTION:DESCRIPTION:END -->
