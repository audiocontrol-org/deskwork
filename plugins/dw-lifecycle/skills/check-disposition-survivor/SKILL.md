---
name: check-disposition-survivor
description: "Pre-commit gate detecting silent non-pending → pending disposition transitions in clones.yaml"
---

# /dw-lifecycle:check-disposition-survivor

Pre-commit gate that fails the commit when a clone-group's disposition silently reverts from a protected non-pending state (`keep-with-reason`, `refactor`, `ignore-with-justification`) back to `pending` without operator acknowledgment via `--allow-disposition-loss`. Per TF-013 / AUDIT-20260525-06 / [#289](https://github.com/audiocontrol-org/deskwork/issues/289). The clone-detector's regen path can wipe operator-curated dispositions in failure modes the unit-level `mergeDispositions` contract doesn't catch; this gate is the architectural floor — even if every upstream merge bug is fixed, a destructive diff can never reach a commit without explicit override.

## Steps

1. Confirm the gate is wired into `.githooks/pre-commit` (Phase 8's `install-scope-discovery-hooks` installer handles this). The gate has no operator-driven trigger — it fires automatically on every commit attempt.
2. (For ad-hoc inspection.) Shell out directly:

```
dw-lifecycle check-disposition-survivor [--baseline <path>] \
                                        [--head-ref <ref>] \
                                        [--allow-disposition-loss]
```

The helper:
   - Reads the HEAD version of `<baseline>` via `git show HEAD:<baseline>`.
   - Reads the working-tree version of `<baseline>` via `readFile`.
   - For every entry in HEAD with `disposition ∈ {keep-with-reason, refactor, ignore-with-justification}`, looks up the same `id` in the working-tree version.
   - Flags a DESTRUCTIVE TRANSITION when: same id in both versions, AND HEAD disposition is non-pending, AND working-tree disposition is `pending`.
   - Ids removed from the working tree are NOT flagged (operator-driven refactor — id rolled via content change). Ids that legitimately changed id (membership / content rolled) are also NOT flagged — the standard pre-commit clone-detector diff covers those.
   - Exits 1 on any flagged transition unless `--allow-disposition-loss` was passed (which downgrades to a warning + exit 0).

3. Report: the destructive-transition list (id + HEAD disposition + working-tree disposition), and exit code.

## Flags

| Flag | Meaning |
|---|---|
| `--baseline <path>` | Override the clones.yaml path. Defaults to `.dw-lifecycle/scope-discovery/clones.yaml`. |
| `--head-ref <ref>` | Override the git ref used as the "before" snapshot. Defaults to `HEAD`. |
| `--allow-disposition-loss` | Operator override: downgrade detected destructive transitions to warnings; exit 0 even when transitions are present. |

## Error handling

- **Working tree has no baseline file.** Helper exits 0 — vacuously satisfied (nothing to diff).
- **HEAD has no baseline file (first commit).** Helper exits 0 — nothing to diff against.
- **Destructive transition without override.** Helper exits 1 with each flagged id named alongside the HEAD disposition and the working-tree disposition. Either fix the regression in the baseline (restore the operator-curated disposition), or pass `--allow-disposition-loss` if the reversion is intentional.
- **Companion to mutating verbs.** This gate is the companion to `/dw-lifecycle:batch-dispose`, `/dw-lifecycle:dispose-clone`, and `/dw-lifecycle:refresh-clones-baseline` — those three verbs WRITE the file, this one verifies the write didn't silently undo prior operator judgment.
- **Git error.** Helper exits 2 (I/O / parse / git error). Typical cause: `--head-ref` names an unresolvable ref, or the working tree isn't a git repo.
- **Malformed YAML in either version.** Parser throws with descriptive keypath; same `parseClonesYamlStrict` contract as the rest of the toolchain.

## When to use

This skill is fired automatically by the pre-commit hook installed by `/dw-lifecycle:install-scope-discovery-hooks`. Operators invoke it manually in two cases: (1) ad-hoc inspection mid-edit ("did my batch-dispose call silently revert anything?") — run with `--head-ref HEAD` against the working tree; (2) when the gate fires in pre-commit and the operator confirms the reversion is intentional (e.g., a clone group genuinely needs to return to pending because its underlying refactor was reverted) — re-stage and re-run with `--allow-disposition-loss`. Companion to `/dw-lifecycle:check-refactor-preconditions` (which catches the OPPOSITE failure: a refactor claim WITHOUT proof) and the mutating disposition verbs (`/dw-lifecycle:batch-dispose`, `/dw-lifecycle:dispose-clone`, `/dw-lifecycle:refresh-clones-baseline`).
