---
name: dispose-clone
description: "Mark a single clone-group with a disposition + reason; refuses `--as refactor` as a forcing function"
---

# /dw-lifecycle:dispose-clone

Single-clone-group convenience wrapper around `/dw-lifecycle:batch-dispose`. The common case is "mark THIS one clone group as X with reason Y" — typing the full `batch-dispose --ids <id> --disposition <D> --reason "<R>"` form is boilerplate the wrapper hides. Forwards to batch-dispose with a single-id list for `keep-with-reason` and `ignore-with-justification`; REFUSES `--as refactor` regardless of which flags are passed (forcing function — refactor entries must be edited manually then verified by `/dw-lifecycle:check-refactor-preconditions`).

## Steps

1. Confirm the clone-group id (positional `<id>` — 12 lowercase hex chars). Get it from `/dw-lifecycle:detect-clones` output or from `/dw-lifecycle:scope-summary --verbose` (which prints matching group ids on stderr).
2. Choose the disposition. Supported via `--as`: `keep-with-reason`, `ignore-with-justification`, or `refactor` (gated — see below).
3. Shell out to the helper:

```
dw-lifecycle dispose-clone <id> --as <kind> [--reason "<text>"] \
                                [--clones <path>] [--dry-run] \
                                [refactor-precondition flags...]
```

The helper:
   - Parses args. `--as refactor` triggers the refactor gate.
   - **Refactor gate path:** requires `--canonical-side`, `--canonical-reason`, `--tests`, `--tests-proof-sha`, `--tests-proof-demonstration` (and `--new-shape-summary` when `canonical_side === 'new'`). When ANY flag is missing, the wrapper exits 2 with the missing-flags list — the operator sees the full precondition surface in the error message. When ALL flags are present, the wrapper STILL exits 2 with `REFACTOR_MANUAL_EDIT_GUIDANCE` (refactor entries don't fit `--reason` shape — manual editing is the only path). The flag-presence requirement is intentional: it forces the operator to write down the proof in their command before they hit the "manual edit" redirect.
   - **Non-refactor path:** dispatches to `/dw-lifecycle:batch-dispose` via `runBatchDispose` with a single-id list, forwarding `--reason`, `--clones`, `--dry-run`. Exit code is batch-dispose's verbatim (0 applied + verified, 1 verify-after-write mismatch, 2 invalid args / unknown id).

4. Report: the id targeted, the disposition + reason applied, the verify-after-write result (for non-refactor), or the redirect message (for refactor), and exit code.

## Flags

| Flag | Meaning |
|---|---|
| `<id>` | Required positional. Content-hashed clone-group id (12 lowercase hex chars). |
| `--as <kind>` | Required. One of `keep-with-reason`, `ignore-with-justification`, `refactor`. |
| `--reason "<text>"` | Required for `keep-with-reason` and `ignore-with-justification`. Ignored on the refactor refusal path. |
| `--clones <path>` | Pass-through to batch-dispose. Defaults to `.dw-lifecycle/scope-discovery/clones.yaml`. |
| `--dry-run` | Pass-through to batch-dispose. Plan + summarize; do not write. |
| `--canonical-side <existing\|new>` | Refactor-only Step 0a flag. |
| `--canonical-reason "<text>"` | Refactor-only Step 0a flag. |
| `--new-shape-summary "<text>"` | Refactor-only Step 0a flag (required when `canonical_side: new`). |
| `--tests <paths>` | Refactor-only Step 0b flag (comma-separated test commands). |
| `--tests-proof-sha <sha>` | Refactor-only Step 0b flag (sha resolvable via `git rev-parse`). |
| `--tests-proof-demonstration "<text>"` | Refactor-only Step 0b flag (operator-readable proof narrative). |

## Error handling

- **`--as refactor` with missing precondition flags.** Helper exits 2 with the missing-flags list. Per the forcing-function design: the operator can't bypass the precondition surface — they must either type all six refactor flags (and still hit the manual-edit redirect), or pick a non-refactor disposition.
- **`--as refactor` with ALL precondition flags present.** Helper STILL exits 2 with the manual-edit redirect message. Refactor entries don't fit `--reason` shape; edit `clones.yaml` manually and verify with `/dw-lifecycle:check-refactor-preconditions`. This is intentional — the wrapper does not silently degrade to `keep-with-reason`, and it does not stub a partial-refactor write (per the "Just for now is bullshit" rule in agent-discipline.md).
- **Unknown id.** Forwarded to batch-dispose, which exits 2 with the typoed id + a hint pointing at `dw-lifecycle detect-clones --refresh-baseline`.
- **Verify-after-write mismatch.** Forwarded from batch-dispose: exit 1. Re-run with `--dry-run` to confirm intent.
- **Disposition survivor risk.** Applying `--as keep-with-reason` to an id previously marked `refactor` (or vice-versa among the protected dispositions) won't trip the survivor gate (`/dw-lifecycle:check-disposition-survivor` only catches non-pending → pending). But reverting to pending DOES trip it — pass `--allow-disposition-loss` to the survivor gate if intentional. Tracked via [#289](https://github.com/audiocontrol-org/deskwork/issues/289).

## When to use

Reach for dispose-clone when triaging a single clone group — typical workflow: `detect-clones` surfaces a new pending group, operator reads the involved files, decides "this is intentional duplication / not worth refactoring / a canonical-side fix we're not doing right now", and applies the appropriate disposition. For N > 1 clones with a shared `(disposition, reason)`, jump to `/dw-lifecycle:batch-dispose`. For `refactor` dispositions, do NOT use this skill to apply — use it ONCE to see the precondition surface in the error message, then edit clones.yaml manually and verify via `/dw-lifecycle:check-refactor-preconditions`. Closes [#284](https://github.com/audiocontrol-org/deskwork/issues/284) workflow; pairs with `/dw-lifecycle:check-disposition-survivor` for the inverse safety check.
