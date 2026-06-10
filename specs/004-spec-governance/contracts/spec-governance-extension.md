# Contract: `spec-governance` Spec Kit extension

Mirrors the founding `deskwork-governance` extension (`plugins/stack-control/spec-kit/deskwork-governance/`). Lives at `plugins/stack-control/spec-kit/spec-governance/`.

## `extension.yml`

```yaml
schema_version: "1.0"
extension:
  id: spec-governance
  name: "stack-control Spec Governance"
  version: "<lockstep repo version>"
  description: "Fires the cross-model audit-barrage over a SPEC at definition time + gates graduation on convergence"
requires:
  speckit_version: ">=0.9.0"
  tools:
    - name: dw-lifecycle      # in-house composition of the barrage + protocol (FR-006) until multi/migrate-audit-barrage
      required: true
    - name: git
      required: true
provides:
  commands:
    - name: speckit.spec-governance.govern-spec
      file: commands/speckit.spec-governance.govern-spec.md
hooks:
  after_clarify:
    command: speckit.spec-governance.govern-spec
    optional: false           # default checkpoint — the spec is decision-complete here (FR-011)
    description: "Govern the clarified spec: cross-model audit-barrage + convergence gate"
  after_plan:
    command: speckit.spec-governance.govern-spec
    optional: true            # configurable per project (FR-011); audits spec + plan (FR-013)
    description: "Govern the spec+plan after planning (optional)"
```

**Contract assertions**:
- `after_clarify` hook is present and `optional: false` (the default checkpoint).
- `after_specify` is NOT declared (intentional — FR-011).
- `requires.tools` declares `dw-lifecycle` `required: true` → Spec Kit surfaces the dependency; the script also guards at runtime (fail-loud, FR-005).

## Hook command: `commands/speckit.spec-governance.govern-spec.md`

Contract: shells to `scripts/bash/govern-spec.sh`; accepts the same env overrides as the founding command — `GOVERN_FEATURE_SLUG` (else derived from `feature/<slug>`), `GOVERN_SPEC_PATH` (default: the active feature's `spec.md`; `+ plan.md` when invoked from `after_plan`). Reports the run-dir path + the convergence verdict.

## Orchestration: `scripts/bash/govern-spec.sh`

Mirrors `govern.sh` step-for-step, with the audit unit being the SPEC (R2):

| Step | Contract |
|---|---|
| Derive slug | `GOVERN_FEATURE_SLUG` else `feature/<slug>`; fail loud (exit 2) on empty/unresolvable (copy `govern.sh` lines 25–42). |
| Guard capability | `command -v` the barrage entrypoint + `jq`; **exit 2 if absent — no silent skip** (FR-005). |
| Gather audit unit | Read the spec file (+ plan when `after_plan`) into the `diff` var; bound the payload (256 KB soft budget, log drops — no silent cap). Reuse `feature_slug`, `workplan_summary`, `audit_log_excerpt` (tail of audit-log), `commit_subjects`. |
| Render | `audit-barrage-render --feature <slug> --vars-file <vars.json> --output <prompt>`. |
| Fire | `RUN_DIR=$(audit-barrage --feature <slug> --prompt-file <prompt> --output-run-dir)`. |
| Lift | `audit-barrage-lift --feature <slug> --run-dir "$RUN_DIR" --apply`. |
| Gate | `stackctl spec-governance-gate --feature <slug>` → convergence verdict (see `convergence-gate.md`). |
| Emit | run-dir path + verdict JSON to stdout; non-zero exit when the gate is `blocked` (graduation refused) unless an override is recorded. |

**Exit codes**: `0` converged or overridden (may graduate); `1` blocked / non-converged (graduation refused — actionable); `2` fatal (capability absent, slug unresolvable). Mirrors `govern.sh` exit semantics, extended with the gate verdict.

**Isolation**: composes dw-lifecycle's public verbs only — no edits to dw-lifecycle internals (isolation invariant).
