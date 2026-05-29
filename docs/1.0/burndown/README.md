---
slug: burndown
date: 2026-05-29
kind: burndown-index
source: docs/1.0/001-IN-PROGRESS/hygiene/issue-closure-audit-2026-05-29.md
---

# Burndown — marching orders by feature

Per-feature-team handoff sheets derived from the 2026-05-29 repo-wide issue-closure audit. **Source of truth:** [`../001-IN-PROGRESS/hygiene/issue-closure-audit-2026-05-29.md`](../001-IN-PROGRESS/hygiene/issue-closure-audit-2026-05-29.md).

## Snapshot

- **Starting state (audit):** 178 open issues
- **Closed in audit:** 68 (verified against current code)
- **Remaining open:** 110 (sliced below by component/feature)

## The sheets

Each sheet is a self-contained handoff. Categories are uniform across sheets:

- **Quick fixes** (~1 hour each, < 50 LOC) — pick one, write the test, ship the patch
- **Medium effort** (1-2 days, 50-300 LOC) — single-PR scope; surface design choices in advance
- **Larger / sprint-sized** (multi-PR, >300 LOC or design-driven) — needs workplan + dispatch
- **Operator triage required** — architectural / semantic / API-contract questions; agent shouldn't pick
- **Already-tracked / informational** — recorded here for completeness; not part of this burndown

| Sheet | Lane | Count |
|---|---|---|
| [`scope-discovery.md`](scope-discovery.md) | scope-discovery feature (Phases 6–11) + dogfood follow-ups | 17 |
| [`graphical-entries.md`](graphical-entries.md) | graphical-entries feature (parent #301 + Phases 1–12) | 13 |
| [`dw-lifecycle.md`](dw-lifecycle.md) | dw-lifecycle plugin: orchestration, install, session skills | 13 |
| [`deskwork-core.md`](deskwork-core.md) | `@deskwork/core` (ingest, approve, doctor, calendar, iterate) + `@deskwork/cli` | 23 |
| [`deskwork-studio.md`](deskwork-studio.md) | `@deskwork/studio` (review surface, dashboard, scrapbook, mobile) | 38 |
| [`operator-triage.md`](operator-triage.md) | Architectural / semantic / vocabulary decisions; agent waits for operator | 7 |
| [`roadmap.md`](roadmap.md) | Larger separate-plugin / out-of-scope items | 6 |

## Reading order

For an operator picking work to schedule:

1. **`operator-triage.md`** — these block other lanes. Resolve them and the resulting decisions unblock cascading work elsewhere.
2. **Highest-leverage lane sheet** — pick the lane whose Quick Fixes column has the most concrete wins.
3. **Sprint lane sheet** — if you have sprint capacity, the Larger column on a lane's sheet is the candidate workplan.

For a session agent picking up a lane:

1. Open this README + the lane's sheet.
2. Confirm the audit-log evidence for any "Closed" claim by re-running the cited check before assuming a fix is shipped.
3. Pick a Quick Fix; write the regression test before the code; commit each fix individually.

## Methodology

- Each issue's bucket is the audit's reading of current code, not a re-reading of the issue body.
- "Quick Fix" bucket assumes the project's standard verification (test + before/after measurement) — not "land a sed" velocity.
- Sizes are LOC for code changes, words for SKILL.md changes; "hour" / "day" estimates are calibrated against the hygiene feature's actual implementation cadence.
- Per `agent-discipline.md`: "Issue closure requires verification in a formally-installed release" — every fix the agent ships stays as "fix-landed" until the operator walks an install and closes the issue.

## Cross-references

- Source audit: [`../001-IN-PROGRESS/hygiene/issue-closure-audit-2026-05-29.md`](../001-IN-PROGRESS/hygiene/issue-closure-audit-2026-05-29.md)
- Per-feature feature docs (in-progress): [`../001-IN-PROGRESS/`](../001-IN-PROGRESS/)
- Project rules (forward-binding on every agent session): [`../../.claude/rules/`](../../.claude/rules/)
