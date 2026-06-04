---
name: speckit.deskwork-governance.govern
description: "Govern the just-implemented work — cross-model audit-barrage + lift findings"
---

# deskwork governance pass

Run deskwork's differentiated governance over the work Spec Kit just implemented. This composes existing deskwork CLI verbs; it does not reimplement them.

## Execution

Run the orchestration script from the repo root:

```bash
bash plugins/dw-lifecycle/spec-kit/deskwork-governance/scripts/bash/govern.sh
```

Optional environment overrides:
- `GOVERN_DIFF_BASE` — git ref the implemented work is diffed against (default `HEAD~1`).
- `GOVERN_FEATURE_SLUG` — feature slug (default `pluggable-lifecycle-providers`).

The script gathers the diff of the implemented work, fires `dw-lifecycle audit-barrage` (multiple LLM CLIs in parallel), and lifts findings into the feature `audit-log.md`. It branches only on the diff + feature slug — never on which tool authored or executed the plan.

## Result

Report the printed run-dir path and summarize: how many model lanes produced output, and how many findings were lifted into `audit-log.md`. If the script exits non-zero (e.g. `dw-lifecycle` absent), surface the failure — do not treat governance as optional.
