---
name: speckit.spec-governance.govern-spec
description: "Govern the clarified spec — cross-model audit-barrage + convergence gate"
---

# spec governance pass

Run stack-control's design-phase governance over the SPEC Spec Kit just
clarified (or planned). This composes existing dw-lifecycle CLI verbs and
ports the audit-protocol convergence criterion; it does not reimplement them.

## Execution

Run the orchestration script from the repo root:

```bash
bash plugins/stack-control/spec-kit/spec-governance/scripts/bash/govern-spec.sh
```

Optional environment overrides:
- `GOVERN_FEATURE_SLUG` — feature slug. By default derived from the
  `feature/<slug>` branch; set this to override (the script fails loud if
  neither resolves).
- `GOVERN_SPEC_PATH` — path to the spec file under audit (default: the active
  feature's `specs/<feature>/spec.md`, resolved from the `CLAUDE.md`
  `<!-- SPECKIT START -->` marker).
- `GOVERN_PLAN_PATH` — when set (the `after_plan` checkpoint), the plan file is
  folded alongside the spec (FR-013).
- `GOVERN_CEILING` — max convergence iterations before the loop records
  non-convergence (FR-014; the loop bound, enforced by the driver, not the gate).
- `GOVERN_OVERRIDE` — a recorded override reason; **forces the gate OPEN** when it
  would otherwise be BLOCKED (FR-010).

The script reads the spec (+ plan when `after_plan`) into the audit payload,
fires `dw-lifecycle audit-barrage` (multiple LLM CLIs in parallel), lifts
findings into the feature `audit-log.md`, then evaluates the convergence gate
(`stackctl spec-governance-gate`). It branches only on the findings + feature
slug — never on which tool authored the spec.

**The gate is a single boolean you obey, not a verdict you interpret (#432).**
The gate itself prints exactly `true` (OPEN — may graduate) or `false` (BLOCKED)
to stdout; its exit code is execution status (0 evaluated, 2 fatal), never
policy. You drive the loop through the `govern` pass, which relays that decision:
**exit 0 = gate OPEN ("may graduate")**, **exit 1 = gate BLOCKED ("REFUSED")**,
**exit 2 = fatal** (capability/audit-log absent — never a governed claim). Do not
re-derive graduation from finding counts — obey the relayed decision. The gate
decides OPEN on what the **recent run(s) raw-surfaced** (FR-010): branch (a) one
pristine run (0 HIGH + 0 MED), or branch (b) two consecutive 0-HIGH runs. The
count of still-open findings has **no bearing** (#432).

## Fixing findings — fresh-context sub-agent dispatch

When the govern pass reports the gate **BLOCKED** (exit 1 — the recent run(s)
surfaced HIGHs, or aren't yet two consecutive 0-HIGH runs), **do NOT author
the fixes in this orchestrating context.** Fix quality degrades under
accumulated context — each round's expansive edits become the next round's
findings (observed directly in the 004 self-hosted dogfood: a fresh HIGH landed
on the *new fix text* every round). The fix step runs in a fresh context
instead. For each open finding:

1. **Dispatch a fresh sub-agent (Agent tool) with the WHOLE artifact in scope.**
   Give it the finding text AND access to the entire spec (tell it to read
   `spec.md` in full), and scope it to **resolve the finding completely and leave
   the spec internally consistent** — it MUST update *every* location the fix
   ripples to (the cited FR plus any SC, acceptance scenario, edge case, Key
   Entity, or clarification that would otherwise contradict the change), not just
   the one cited span. Scoping a sub-agent to a single span is what produced
   AUDIT-41 in the 004 dogfood: FR-007 was corrected but SC-004 / a scenario / an
   edge case were left asserting the old behavior — an author-introduced
   contradiction the next barrage caught. Keep each *individual* edit minimal (no
   verbosity bloat, no caveats/hedges, no "not yet implemented" / deferral
   phrasing) — **minimal-per-edit and consistent-across-the-whole-spec are not in
   tension**: cover every affected surface, but change each one no more than the
   fix requires.
2. **Verify the finding's premise against the implementation before specifying
   any mechanism.** If a finding demands that some mechanism be specified, first
   confirm that mechanism exists in the code (`plugins/stack-control/src/…`). Do
   NOT write machinery into the spec that the code does not implement — that
   fiction becomes the next round's findings (the 004 dogfood's
   cross-run-reconciliation cascade, AUDIT-31 → 39 → 40, all attacked a matcher
   the code never had). When a finding says "X is unspecified" but X does not
   exist and is not needed, the correct fix is to **align the spec to the
   as-built behavior** (and record the finding as a false-premise acknowledgment),
   not to invent X.
3. **Dispatch one finding at a time** (sequential) so concurrent edits never
   collide on the single `spec.md`. Each sub-agent gets its own clean context
   regardless of ordering; serialization is purely for write-safety.
4. After all open findings are addressed, **re-run `govern-spec.sh`** (re-barrage
   → re-gate) and repeat until the govern pass reports the gate **OPEN** (exit 0,
   may graduate), the per-checkpoint ceiling is hit, or a substantive
   `GOVERN_OVERRIDE` is recorded. Residual MEDIUM/LOW are slushed automatically
   once the dampener engages. When several findings stem from one root change, run a **whole-spec
   consistency sweep** first (one sub-agent, full spec in context, tasked to find
   and fix *every* surface that contradicts the corrected model) before
   re-barraging — rather than letting the barrage surface the leftovers one at a
   time.

The orchestrator's only jobs in the loop are **dispatch → apply → re-barrage** —
never hand-authoring spec prose.

## Diminishing returns — detect the plateau, don't chase a generator

Unlike code, a spec has **no crisp convergence floor** — an aggressive cross-model
barrage can always find another under-specified edge in prose. Before raising the
ceiling or looping another round, ask: *am I converging, or feeding a generator?*
**Read [`../SPEC-AUDIT-FAILURE-MODES.md`](../SPEC-AUDIT-FAILURE-MODES.md)** (the
catalog + heuristics) — and **append a new entry after the loop closes**. Plateau
signals: HIGH stops monotonically decreasing; new findings are mostly fix-debt; a
root issue resurfaces under a new ID; findings drop to implementation-mechanism
altitude (the spec being asked to *be* the code). At the plateau, **stop patching
instances**: apply a **structural root-fix** (de-specify an over-specified
mechanism → state the *promise* + defer the protocol to contracts/TDD; or
DRY-collapse a duplicated rule) or record a substantive `GOVERN_OVERRIDE` — never
just raise the ceiling and keep patching. The operator owns that call. See the
always-loaded rule `.claude/rules/spec-audit-diminishing-returns.md`.

## Result

Report the printed run-dir path and the gate decision, and summarize:
how many model lanes produced output, how many findings were lifted, and
whether the spec **may graduate** (govern exit 0 — gate OPEN, or an override) or
graduation is **refused** (govern exit 1 — gate BLOCKED). If the script exits 2
(e.g. `dw-lifecycle` absent), surface the failure — governance is never optional
and a spec is never recorded as governed when the capability is absent (FR-005).
