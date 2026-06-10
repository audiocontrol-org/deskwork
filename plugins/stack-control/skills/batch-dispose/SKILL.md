---
name: batch-dispose
description: "Bulk-apply one (disposition, reason) to N clone-group ids at once (stackctl batch-dispose --ids <id1,id2,...> --disposition <kind> --reason \"<text>\") — verify-after-write confirms every write landed; unknown ids fail hard and cite the refresh-baseline recovery path"
---

# /stack-control:batch-dispose

Thin adapter over the `stackctl batch-dispose` verb. Applies a single `(disposition, reason)` to many clone-group ids in one pass — the bulk counterpart to `/stack-control:dispose-clone`.

> Per `.claude/rules/enforcement-lives-in-skills.md`: the discipline lives in this skill body + the `stackctl` verb it calls, never in a git hook.

## When to use

- After `/stack-control:check-clones` surfaces several NEW groups you want to dispose with the same rationale.
- The `check-clones` output prints a paste-ready `stackctl batch-dispose` hint per NEW group.

## Steps

1. **Run from inside the codebase whose baseline you want to edit:**

   ```bash
   stackctl batch-dispose \
     --ids <id1,id2,id3> \
     --disposition <keep-with-reason|ignore-with-justification|pending> \
     --reason "<one-line rationale applied to every id>"
   ```

   Flags (each validated; an unknown flag exits 2):
   - `--ids <id1,id2,...>` — required, comma-separated content-hashed ids.
   - `--disposition <kind>` — required; one of `pending`, `keep-with-reason`, `ignore-with-justification`. `refactor` is REJECTED (it needs five precondition fields that don't fit a single `--reason`; edit clones.yaml manually + run `stackctl check-refactor-preconditions`).
   - `--reason "<text>"` — required; applied to every id.
   - `--show-existing` — for ids already non-pending, print the existing disposition + reason (never overwritten).
   - `--clones <path>` — override the per-codebase clones.yaml.
   - `--dry-run` — load, plan, summarize; skip write + verify.

2. **Read the exit code:** `0` = applied + verify-after-write confirmed (or no apply work); `1` = wrote but verify detected a mismatch (never silent); `2` = invalid args / malformed clones.yaml / unknown id.

## Notes

- Per-codebase default: the baseline is the nearest-enclosing stack-control installation's clones.yaml.
- Unknown ids fail HARD (exit 2) with no writes, and cite `stackctl check-clones --refresh-baseline` so you can add detected groups as `pending` first.
- Already-disposed (non-pending) ids are skipped, not overwritten.
- Every write is re-read and verified — a forged or no-op write is caught and reported rather than silently trusted.
