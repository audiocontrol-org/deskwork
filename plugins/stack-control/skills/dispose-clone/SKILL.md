---
name: dispose-clone
description: "Mark a single clone group with a disposition + reason (stackctl dispose-clone <id> --as <keep-with-reason|ignore-with-justification>) — a thin single-id wrapper over batch-dispose; refuses --as refactor as a forcing function since refactor entries carry five precondition fields that need manual editing"
---

# /stack-control:dispose-clone

Thin adapter over the `stackctl dispose-clone` verb. The common case after `/stack-control:check-clones` surfaces a NEW group is "mark THIS one group as X with reason Y" — this verb hides the full `batch-dispose --ids <id> --disposition <D> --reason "<R>"` form.

> Per `.claude/rules/enforcement-lives-in-skills.md`: the discipline lives in this skill body + the `stackctl` verb it calls, never in a git hook.

## When to use

- After `/stack-control:check-clones` reports a single NEW clone group you want to dispose (intentional parity → keep-with-reason; not worth tracking → ignore-with-justification).
- For bulk disposition of several ids at once, use `/stack-control:batch-dispose` instead.

## Steps

1. **Run from inside the codebase whose baseline you want to edit:**

   ```bash
   stackctl dispose-clone <id> --as keep-with-reason --reason "<one-line rationale>"
   stackctl dispose-clone <id> --as ignore-with-justification --reason "<one-line rationale>"
   ```

   Flags (each validated; an unknown flag exits 2):
   - `--as <kind>` — required: `keep-with-reason`, `ignore-with-justification`, or `refactor` (gated).
   - `--reason "<text>"` — required for the two non-refactor dispositions.
   - `--clones <path>` — override the per-codebase clones.yaml (default `<installation>/.stack-control/scope-discovery/clones.yaml`).
   - `--dry-run` — plan only; do not write.

2. **`--as refactor` is gated and refused.** Refactor entries carry five precondition fields (`canonical_side`, `canonical_reason`, optional `new_shape_summary`, `tests`, `tests_proof`) that don't fit a single `--reason`. Even with every Step 0a/0b flag present, the wrapper refuses to write and redirects you to edit clones.yaml manually, then validate with `stackctl check-refactor-preconditions`.

3. **Read the exit code:** `0` = applied + verify-after-write confirmed; `1` = wrote but verify detected a mismatch; `2` = invalid args / refactor refusal / unknown id / missing clones.yaml.

## Notes

- Per-codebase default: the baseline is the nearest-enclosing stack-control installation's clones.yaml, resolved the same way `check-clones` resolves it.
- An unknown id fails hard (exit 2) and cites `stackctl check-clones --refresh-baseline` as the recovery path (add the detected group as `pending` first, then dispose it).
- Already-disposed (non-pending) entries are never silently overwritten.
