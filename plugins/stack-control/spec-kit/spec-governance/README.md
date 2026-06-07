# Spec Governance — Spec Kit extension

Extends stack-control's cross-model governance **left**, from `after_implement`
to **definition time**. On `after_clarify` (default) it fires the cross-model
`audit-barrage` over the **spec** — surfacing internal contradictions,
ambiguity, unstated assumptions, and missing edge cases *before* a line of code
is written — lifts findings into the feature's `audit-log.md`, and gates spec
graduation on the **ported audit-protocol convergence criterion**. It branches
only on the findings/feature, never on which tool authored the spec.

The design-phase sibling of the `deskwork-governance` `after_implement`
extension, and a feature of the `pluggable-lifecycle-providers` north star
(govern + execute on any provider's plan). See
`docs/1.0/001-IN-PROGRESS/pluggable-lifecycle-providers/` and
`specs/004-spec-governance/`.

## Behavior

- Fires on `after_clarify` (non-optional default — the spec is decision-complete
  there) and, when enabled per project, on `after_plan` (audits spec **+** plan,
  FR-013). `after_specify` is intentionally **not** declared — a just-specified
  spec may still carry intentional unresolved-clarification placeholders that
  generate barrage noise (research R5).
- Runs stack-control's **own** audit-barrage (no dw-lifecycle dependency — the
  barrage + protocol are vendored in-package via `multi/migrate-audit-barrage`):
  `stackctl audit-barrage-render` → `audit-barrage` → `audit-barrage-lift`.
- **Convergence gate** (`stackctl spec-governance-gate`): the spec may graduate
  only when the **ported** `check-barrage-dampener` criterion is met —
  **0 open HIGH + 0 open MEDIUM in the latest run** (single-run-clean), **or
  0 open HIGH across the last 2 runs** (n-consecutive-quiet). Otherwise
  `blocked`; once iterations reach the configured `--ceiling` without
  convergence the verdict is `non-converged` (escalate — never an infinite
  loop). An explicit `--override "<reason>"` records an accepted residual and
  permits graduation.
- **Cross-model agreement** (≥2 model families on the same root cause) is lifted
  as a HIGH-confidence, annotated finding with a disposition slot, into the same
  per-feature `audit-log.md` the implementation phase uses — one format, one
  triage workflow (SC-005).
- **Fail-loud** (FR-005): if the barrage capability is absent the flow exits 2
  with an actionable message and **never** records the spec as governed — no
  silent skip. Partial model availability is recorded as reduced coverage, never
  presented as full (FR-008).

## Invocation

The hooks invoke the `speckit.spec-governance.govern-spec` command, which shells
to `scripts/bash/govern-spec.sh`. Environment overrides:

- `GOVERN_FEATURE_SLUG` — feature slug (default: derived from `feature/<slug>`).
- `GOVERN_SPEC_PATH` — spec under audit (default: from the `CLAUDE.md` SPECKIT
  marker).
- `GOVERN_PLAN_PATH` — set on the `after_plan` checkpoint to fold the plan too.
- `GOVERN_CEILING` / `GOVERN_OVERRIDE` — convergence ceiling / recorded override.

The gate verb may also be run directly:

```bash
stackctl spec-governance-gate --feature <slug> [--checkpoint <after_clarify|after_plan>] [--ceiling N] [--override "<reason>"] [--json]
```

`--checkpoint` scopes convergence to one checkpoint's runs (independent
per-checkpoint loops, FR-011/FR-014): each enabled checkpoint has its own loop +
ceiling, and a passed `after_clarify` gate is durable — not re-opened by
`after_plan` findings. `govern-spec.sh` tags each run with its checkpoint and
passes `--checkpoint` automatically; `GOVERN_CHECKPOINT` overrides the default
(`after_clarify`, or `after_plan` when a plan is folded).

## No dw-lifecycle dependency

The audit-barrage runner, the finding lift, and the convergence protocol
(`check-barrage-dampener`) are stack-control's **own**, vendored in-package under
`plugins/stack-control/src/` (the `multi/migrate-audit-barrage` migration). The
barrage verbs dispatch through the plugin's bundled `stackctl`; the gate imports
the convergence criterion + feature-root resolver from the in-package
`scope-discovery/` tree. There is **no import of, shell-out to, or `requires`
declaration on dw-lifecycle** — `git` is the one hard external tool, plus the
configured model-family CLIs.

Project-local overrides live under `.stack-control/` (`audit-barrage-config.yaml`,
`audit-barrage-prompt.md`); barrage run-dirs land under `.stack-control/audit-runs/`
(gitignored). Versions are lockstep with the monorepo; see the
[releases page](https://github.com/audiocontrol-org/deskwork/releases).
