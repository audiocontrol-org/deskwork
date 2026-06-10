---
name: scope-summary
description: "Per-surface clone-disposition tally (stackctl scope-summary --surface <glob>) — reads the per-codebase clones baseline and reports how many clone groups touch a surface, split into total / pending-touching / pending-intra / dispositioned-touching."
---

# /stack-control:scope-summary

Thin adapter over the `stackctl scope-summary` verb. Day-to-day reporter: how many pending vs dispositioned clone groups touch a given surface glob, scoped to the per-codebase clones baseline under the nearest-enclosing stack-control installation.

## When to use

- Before touching a surface, to see whether it carries undispositioned (pending) duplication.
- After a refactor, to confirm a surface's pending count dropped.

## Steps

1. **Run with a surface glob:**

   ```bash
   stackctl scope-summary --surface 'plugins/stack-control/src/**'
   stackctl scope-summary --surface '<glob>' --json     # machine-readable counts
   stackctl scope-summary --surface '<glob>' --verbose  # per-group breakdown to stderr
   ```

   Flags (each validated; unknown → exit 2):
   - `--clones <path>` — override the baseline (default: per-codebase `<installation>/.stack-control/scope-discovery/clones.yaml`).
   - `--at <dir>` — override the installation walk-up start dir.

2. **Read the line:** `total: N | pending-touching: M | pending-intra: K | dispositioned-touching: L`.
   - `pending-touching` — pending groups with ≥1 member matching the surface.
   - `pending-intra` — pending groups where ALL members match (internal duplication).
   - `dispositioned-touching` — non-pending groups touching the surface.

3. **Exit codes:** `0` = summary produced; `2` = invalid args / bad glob / no install / missing-or-malformed baseline.

## Notes

- A non-zero `pending-touching` means the surface has duplication that hasn't been collapsed or dispositioned — drive `/stack-control:dispose-clone` or the `batch-dispose` hint.
