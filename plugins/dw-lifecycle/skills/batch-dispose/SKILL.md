---

> **RETIRED.** `dw-lifecycle` has been superseded by `stack-control`. This skill is preserved for historical reference only and is no longer maintained. Use [stack-control](../../../stack-control/) skills instead.

# /dw-lifecycle:batch-dispose

Apply a single `(disposition, reason)` pair to N clone-group ids at once. Promoted from the audiocontrol pilot's operator-built `.tmp/batch-dispose.ts` so it's discoverable and tested. Reads / writes `.dw-lifecycle/scope-discovery/clones.yaml` via the canonical parser; verify-after-write detects any silent mismatch between intent and result. Single-id callers should reach for `/dw-lifecycle:dispose-clone` instead — that wrapper hides the `--ids` boilerplate.

`refactor` is REJECTED. Refactor entries carry five precondition fields (`canonical_side`, `canonical_reason`, optionally `new_shape_summary`, `tests`, `tests_proof`) that don't fit a single `--reason` text; the CLI prints an actionable redirect to manual editing + `/dw-lifecycle:check-refactor-preconditions` for verification.

## Steps

1. Confirm the ids list and the target disposition. Run `/dw-lifecycle:check-clones` first if the ids aren't already known (its output names every pending group); skip to `/dw-lifecycle:scope-summary` for per-surface tallies if you're triaging by file glob.
2. Choose the disposition. Applyable kinds: `pending`, `keep-with-reason`, `ignore-with-justification`. `refactor` is rejected (see above).
3. Shell out to the helper:

```
dw-lifecycle batch-dispose --ids <id1,id2,...> \
                           --disposition <kind> \
                           --reason "<text>" \
                           [--clones <path>] \
                           [--show-existing] [--dry-run]
```

The helper:
   - Loads `.dw-lifecycle/scope-discovery/clones.yaml` via `parseClonesYaml`.
   - For every id in `--ids`, looks up the group. Unknown ids FAIL HARD (exit 2) — silent-skipping a typoed id would let the typo slip through. The error message cites `dw-lifecycle check-clones --refresh-baseline` as the recovery path so the operator knows their baseline might be stale.
   - For each known id that's already non-pending: SKIPS (we never overwrite operator-curated dispositions). With `--show-existing`, prints the existing disposition + reason so the operator can see what's being preserved.
   - For each pending id: writes the new disposition + reason via `serializeClonesYaml`.
   - VERIFY-AFTER-WRITE: re-reads the file and confirms each requested id now carries the intended disposition + reason. Mismatch → exit 1 (the failure mode this gate exists to prevent — never silent).
   - With `--dry-run`: load + plan + summarize; skip write + verify.

4. Report: the ids applied, ids skipped (already-non-pending), the verify-after-write result, and exit code.

## Flags

| Flag | Meaning |
|---|---|
| `--ids <id1,id2,...>` | Required. Comma-separated content-hashed clone ids. |
| `--disposition <kind>` | Required. One of `pending`, `keep-with-reason`, `ignore-with-justification`. `refactor` is REJECTED. |
| `--reason "<text>"` | Required. Applied to every id in `--ids`. |
| `--show-existing` | For ids already non-pending, print the existing disposition + reason on stderr (the wrapper never overwrites). |
| `--clones <path>` | Override the clones.yaml path. Defaults to `.dw-lifecycle/scope-discovery/clones.yaml`. |
| `--dry-run` | Plan only — load + summarize; do not write or verify. |
| `--canonical-side <existing\|new>` | Refactor precondition flag — accepted but the CLI still refuses to apply `--disposition refactor`. Use `/dw-lifecycle:dispose-clone` for the redirect, or edit clones.yaml manually. |
| `--canonical-reason "<text>"` | Refactor precondition flag (see above). |
| `--new-shape-summary "<text>"` | Refactor precondition flag (only when `canonical_side: new`). |
| `--tests <paths>` | Refactor precondition flag (comma-separated test commands). |
| `--tests-proof-sha <sha>` | Refactor precondition flag (the sha resolved by `git rev-parse`). |
| `--tests-proof-demonstration "<text>"` | Refactor precondition flag (operator-readable proof narrative). |

## Error handling

- **Unknown id.** Helper exits 2 with the typoed id and a hint pointing at `dw-lifecycle check-clones --refresh-baseline` for the recovery path. Per TF-014 (AUDIT-20260525-07).
- **`--disposition refactor`.** Helper exits 2 immediately with the redirect message; refactor entries must be edited manually then verified by `/dw-lifecycle:check-refactor-preconditions`. Tracked via [#284](https://github.com/audiocontrol-org/deskwork/issues/284).
- **Missing required arg.** Helper exits 2 with the offending flag named. `--ids`, `--disposition`, and `--reason` are all required.
- **Verify-after-write mismatch.** Helper exits 1 with the divergence point named. This is the failure mode the verify pass exists to surface — never silent. Re-run with `--dry-run` to confirm intent, then re-attempt.
- **Disposition survivor risk.** Applying `--disposition pending` to ids that were previously `keep-with-reason` / `refactor` / `ignore-with-justification` is the destructive transition `/dw-lifecycle:check-disposition-survivor` exists to catch. Either fold the change into a commit with `--allow-disposition-loss` on the gate, or reconsider the disposition reversion. Tracked via [#289](https://github.com/audiocontrol-org/deskwork/issues/289).

## When to use

Reach for batch-dispose when triaging N clones with a SHARED `(disposition, reason)` — typical case: a refactor PR retires a legacy shape and the operator wants to mark every clone-detector group covering that shape as `ignore-with-justification "covered by Phase X canonical primitive"`. Single-id callers should use `/dw-lifecycle:dispose-clone` (which is the convenience wrapper around this command). Always run with `--dry-run` first when applying to > ~5 ids so the plan is visible before the write commits. After a successful batch, run `/dw-lifecycle:check-disposition-survivor` as a paranoia check that the baseline matches HEAD (the gate normally fires automatically via the pre-commit hook).
