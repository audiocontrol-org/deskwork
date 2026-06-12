---
name: speckit.deskwork-governance.govern
description: "Govern the just-implemented work — cross-model audit-barrage + lift findings"
---

# deskwork governance pass

Run deskwork's differentiated governance over the work Spec Kit just implemented. This composes existing deskwork CLI verbs; it does not reimplement them.

## Execution

Run the orchestration script from the repo root:

```bash
bash plugins/stack-control/spec-kit/deskwork-governance/scripts/bash/govern.sh
```

Optional environment overrides:
- `GOVERN_DIFF_BASE` — git ref the implemented work is diffed against (default `HEAD~1`).
- `GOVERN_FEATURE_SLUG` — feature slug. By default the slug is derived from the `feature/<slug>` branch; set this to override (the script fails loud if neither resolves).

The script gathers the diff of the implemented work, fires `dw-lifecycle audit-barrage` (multiple LLM CLIs in parallel), and lifts findings into the feature `audit-log.md`. It branches only on the diff + feature slug — never on which tool authored or executed the plan.

## Fixing findings — fresh-context sub-agent dispatch

When the barrage lifts open findings, **do NOT author the fixes in this orchestrating context.** Fix quality degrades under accumulated context — expansive edits made in a fatigued context become the next round's findings. The fix step runs in a fresh, minimal context instead. For each open finding:

1. **Dispatch a fresh sub-agent (Agent tool) scoped to resolve the finding CONSISTENTLY.** Give it the finding text + the cited code span, and scope it to **fix the finding and leave the codebase consistent** — it MUST update every site the fix ripples to (call-sites, sibling implementations, types, and the docs/spec the change affects), not only the one cited span, so the fix does not leave a contradiction elsewhere for the next barrage to catch. Fix **TDD-first** — write a failing test that exercises the defect, watch it fail for the expected reason, then make the **minimal** change to pass (Constitution Principle I; the project's scope-don't-defer + TDD discipline). Keep each individual edit minimal (no speculative scope, no unrelated churn) — minimal-per-edit and consistent-across-the-change-surface are not in tension.
2. **Verify the finding's premise against the actual code before adding any mechanism.** Do NOT add code or spec text for a capability that isn't real or needed — a fix that invents machinery becomes the next round's findings. When a finding's premise is false (the concern can't occur in the code as written), the correct disposition is a recorded acknowledgment of the false premise, not invented code.
3. Dispatch **one finding at a time** (sequential) so concurrent edits don't collide. Each sub-agent gets its own clean context regardless of ordering; serialization is for write-safety.
4. After the open findings are addressed, **re-invoke the governance pass** (re-diff → re-barrage). When several findings stem from one root change, run a consistency sweep over the whole change surface first. Always instruct each sub-agent to **use the Write/Edit tool to persist its changes to disk.**

**The iterate/stop decision is the code driver's, not yours (specs/015 US2 / FR-004).** `govern` delegates the convergence loop to `runConvergenceLoop` (`plugins/stack-control/src/govern/convergence-loop.ts`): it runs the bounded render→barrage→lift→slush→gate pass, reads the gate's single boolean (#432), and resolves to a recorded terminal — `converged` / `overridden` (exit 0) or `non-converged` at the FR-014 ceiling (exit 1). **You do not decide "is it converged?"** — you fix surfaced findings and re-invoke; the driver owns whether to stop. Per the project's enforcement-lives-in-skills discipline, this loop lives in the verb + driver, never in this prose. Obey govern's exit: **exit 0 = the driver recorded converged/overridden (stop)**, **exit 1 = non-converged (fix the surfaced findings & re-invoke govern → a fresh bounded driver run, or record a `--override`)**, **exit 2 = fatal**. Do not re-derive "done" from finding counts — the gate decides on what the recent run(s) raw-surfaced (FR-010); the count of still-open findings has no bearing.

The orchestrator's only in-loop job is **dispatch → apply → re-invoke** — never hand-authoring the fix, never holding the iterate/stop decision (the driver holds it).

## Result

Report the printed run-dir path and summarize: how many model lanes produced output, and how many findings were lifted into `audit-log.md`. Read govern's exit as the gate decision relayed (#432): **exit 0 = gate OPEN** (work governed/done), **exit 1 = gate BLOCKED** (more fix → re-barrage rounds, or a recorded override), **exit 2 = fatal** (e.g. `dw-lifecycle` absent — surface it; governance is never optional, FR-005).
