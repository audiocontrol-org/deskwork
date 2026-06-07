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
- `GOVERN_CEILING` — max convergence iterations before `non-converged` (FR-014).
- `GOVERN_OVERRIDE` — a recorded override reason; allows graduation on a
  blocked verdict (FR-010).

The script reads the spec (+ plan when `after_plan`) into the audit payload,
fires `dw-lifecycle audit-barrage` (multiple LLM CLIs in parallel), lifts
findings into the feature `audit-log.md`, then evaluates the convergence gate
(`stackctl spec-governance-gate`). It branches only on the findings + feature
slug — never on which tool authored the spec.

## Fixing findings — fresh-context sub-agent dispatch

When the gate verdict is `blocked` (open HIGH/MEDIUM findings), **do NOT author
the fixes in this orchestrating context.** Fix quality degrades under
accumulated context — each round's expansive edits become the next round's
findings (observed directly in the 004 self-hosted dogfood: a fresh HIGH landed
on the *new fix text* every round). The fix step runs in a fresh, minimal
context instead. For each open finding:

1. Dispatch a **fresh sub-agent** (Agent tool) with a **focused context**: give
   it *only* the finding text + the cited spec span (the relevant `spec.md`
   section it references), and instruct it to make the **minimal** edit that
   resolves exactly that finding — write to disk with the Edit tool, change
   nothing else, add no caveats, hedges, or elaboration. (A sub-agent holding
   one finding and one paragraph structurally cannot over-elaborate; that is the
   point.)
2. Dispatch **one finding at a time** (sequential) so concurrent edits never
   collide on the single `spec.md`. Each sub-agent gets its own clean context
   regardless of ordering; serialization is purely for write-safety.
3. After all open findings are addressed, **re-run `govern-spec.sh`** (re-barrage
   → re-gate) and repeat until the gate reports `converged`, the per-checkpoint
   ceiling is hit (`non-converged`), or a substantive `GOVERN_OVERRIDE` is
   recorded. Residual MEDIUM/LOW are slushed automatically once the dampener
   engages.

The orchestrator's only jobs in the loop are **dispatch → apply → re-barrage** —
never hand-authoring spec prose.

## Result

Report the printed run-dir path and the convergence verdict, and summarize:
how many model lanes produced output, how many findings were lifted, and
whether the spec may graduate (`converged`/`overridden`) or graduation is
refused (`blocked`/`non-converged`). If the script exits 2 (e.g. `dw-lifecycle`
absent), surface the failure — governance is never optional and a spec is never
recorded as governed when the capability is absent (FR-005).
