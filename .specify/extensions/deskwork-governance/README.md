# deskwork Governance — Spec Kit extension

Runs deskwork's differentiated governance back half **automatically after Spec Kit implements**. On `after_implement`, it gathers the diff of the just-implemented work, fires deskwork's cross-model `audit-barrage` (multiple LLM CLIs in parallel), and lifts findings into the feature's `audit-log.md` — branching only on the diff/feature, never on which tool authored or executed the plan.

First slice of the `pluggable-lifecycle-providers` north star (govern + execute on any provider's plan). See `docs/1.0/001-IN-PROGRESS/pluggable-lifecycle-providers/`.

## Source vs install (TF-10)

This directory is the **source**, shipped in the deskwork plugin tree. It is installed INTO a project's `.specify/extensions/deskwork-governance/` (generated install output) via:

```bash
specify extension add plugins/stack-control/spec-kit/deskwork-governance --dev --force
specify extension list                       # deskwork-governance enabled
```

> Rehomed from `plugins/dw-lifecycle/spec-kit/deskwork-governance` into `plugins/stack-control/` (Feature 1, US1 T018) — `stack-control` is the successor to `dw-lifecycle`. The install command above points at the current source.

Never author at the install target (`.specify/extensions/<id>/`) — `--dev --force` wipes the target before copying and would delete the source.

## Behavior

- Fires once per `/speckit-implement` run (whole-run granularity; TF-06).
- Composes existing deskwork verbs: `dw-lifecycle audit-barrage-render` → `audit-barrage` → `audit-barrage-lift`.
- **Edge:** empty diff → runs and reports no defects, exits 0. `dw-lifecycle` absent → fails loudly (no silent skip).

## Teardown

```bash
specify extension remove deskwork-governance
```
