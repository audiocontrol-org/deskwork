---
name: refresh-clones-baseline
description: "Rewrite the per-codebase clones.yaml baseline from a fresh jscpd run (stackctl refresh-clones-baseline), carrying forward operator-authored dispositions for clone groups that survive the refresh — the discoverable alias for check-clones --refresh-baseline"
---

# /stack-control:refresh-clones-baseline

Thin adapter over the `stackctl refresh-clones-baseline` verb. Rewrites the committed clones.yaml baseline from a fresh detector run, **carrying forward operator-authored dispositions** for any clone group that survives the refresh. It is the discoverable alias for `check-clones --refresh-baseline` — the unknown-id error from `batch-dispose` cites this verb as the recovery path.

> Per `.claude/rules/enforcement-lives-in-skills.md`: the discipline lives in this skill body + the `stackctl` verb it calls, never in a git hook.

## When to use

- The detector found groups not yet in the baseline and you want to add them (as `pending`) before dispositioning them with `batch-dispose` / `dispose-clone`.
- After a refactor collapsed a duplicate, to drop the stale group from the baseline.

## Steps

1. **Run from inside the codebase whose baseline you want to refresh:**

   ```bash
   stackctl refresh-clones-baseline
   stackctl refresh-clones-baseline --quiet
   ```

   Flags (forwarded to the detector):
   - `--baseline <path>` — override the per-codebase clones.yaml (default `<installation>/.stack-control/scope-discovery/clones.yaml`).
   - `--quiet` — suppress per-clone output; print the summary only.
   - `--help`, `-h` — show the refresh-specific usage banner.

2. **Read the exit code:** `0` = baseline written; `2` = I/O / parse / jscpd-engine error.

## Notes

- Per-codebase default: the baseline is the nearest-enclosing stack-control installation's clones.yaml.
- Dispositions are NOT lost on refresh — a surviving group keeps its operator-authored disposition. (The `/stack-control:check-disposition-survivor` gate is the architectural floor that catches any regression of that contract.)
- Refresh is mutating by definition, so `--gate-mode` does not apply.
