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

## Result

Report the printed run-dir path and the convergence verdict, and summarize:
how many model lanes produced output, how many findings were lifted, and
whether the spec may graduate (`converged`/`overridden`) or graduation is
refused (`blocked`/`non-converged`). If the script exits 2 (e.g. `dw-lifecycle`
absent), surface the failure — governance is never optional and a spec is never
recorded as governed when the capability is absent (FR-005).
