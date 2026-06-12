---

> **RETIRED.** `dw-lifecycle` has been superseded by `stack-control`. This skill is preserved for historical reference only and is no longer maintained. Use [stack-control](../../../stack-control/) skills instead.

# /dw-lifecycle:check-refactor-preconditions

Commit-msg gate that mechanically enforces the Phase 5 refactor-precondition protocol on commits whose message names one or more `clones.yaml` entries via the `Closes clones.yaml <id>` marker. Layers four runtime checks on top of the parse-time validator: (a) `canonical_side` file-existence (when not `all` / `new`); (b) `tests_proof.sha` resolves via `git rev-parse`; (c) named `tests[]` commands exit 0 at HEAD; (d) parse-time precondition errors surface verbatim. Silent on commits without the marker — the gate's job is to fail loud on marker-claiming commits whose preconditions are incomplete.

Default mode is INFORMATIONAL (failures print, exit 0). `--gate-mode` flips to hook-friendly exit 1 — wire it into `.githooks/commit-msg` so the commit fails when a refactor claim is unproven.

## Steps

1. Confirm the commit message file path. Git's commit-msg hook receives the path as `$1`; pass it via `--commit-msg-file "$1"` from the hook script.
2. Shell out to the helper:

```
dw-lifecycle check-refactor-preconditions [--commit-msg-file <path>] \
                                          [--commit-msg <text>] \
                                          [--baseline <path>] \
                                          [--repo <path>] \
                                          [--test-timeout-seconds <n>] \
                                          [--skip-test-run] \
                                          [--gate-mode]
```

The helper:
   - Reads the commit message; if no `Closes clones.yaml <id>` marker is found, exits 0 silently (no work to do).
   - Loads `.dw-lifecycle/scope-discovery/clones.yaml` and looks up each cited id.
   - Surfaces parse-time precondition errors verbatim (T5.1's `validateRefactorPreconditions`).
   - Runs four runtime checks per entry: canonical_side file-existence, tests_proof.sha resolution, named tests[] commands exiting 0 at HEAD (skippable via `--skip-test-run`), and the parse-time hook.
   - Default per-test timeout is 300 seconds; override via `--test-timeout-seconds`.
   - In `--gate-mode`, any failure exits 1 (commit-msg hook rejects the commit).

3. Report: the marker ids found, the runtime check results, and exit code.

## Flags

| Flag | Meaning |
|---|---|
| `--commit-msg-file <path>` | Read the commit message from a file. Used by `.githooks/commit-msg` (`$1`). |
| `--commit-msg <text>` | Inline commit message (test-only — bypasses file I/O for unit tests). |
| `--baseline <path>` | Override the clones.yaml path. Defaults to `.dw-lifecycle/scope-discovery/clones.yaml`. |
| `--repo <path>` | Override the repo root used for `git rev-parse` + test execution (test-only). |
| `--test-timeout-seconds <n>` | Per-test timeout in seconds. Defaults to 300. |
| `--skip-test-run` | Skip the runtime test-execution check (test-only — useful when the harness itself is calling the gate). |
| `--gate-mode` | Pre-commit-hook-friendly: exit 1 on precondition failure (default: exit 0 informational). |

## Error handling

- **No marker in commit message.** Helper exits 0 silently. Commit-msg hook does not fire the gate on non-refactor commits.
- **Marker cites unknown id.** Helper exits with the parse-time error naming the id; either the id is typoed or the baseline is stale. Run `/dw-lifecycle:refresh-clones-baseline` if the baseline needs to catch up.
- **`canonical_side` file missing.** When the side is a specific file path (not `all` / `new`), the file must exist at HEAD. Helper reports the missing path; fix the entry's `canonical_side` value or restore the file before re-committing.
- **`tests_proof.sha` unresolvable.** `git rev-parse <sha>` failed. Either the sha is mistyped or the commit hasn't been pushed/fetched in this clone — re-stage and re-author the tests-proof.
- **Named test exits non-zero.** A `tests[]` entry's command failed at HEAD. The refactor claim is unproven; fix the failing test, or amend the entry's `tests[]` list to name the correct command.
- **`--commit-msg-file` path missing.** Helper exits 2 with the resolved path; check the hook wiring.

## When to use

Wire this skill into `.githooks/commit-msg` so every commit naming `Closes clones.yaml <id>` is mechanically verified against its `refactor`-disposition preconditions. Refactor-disposition clones carry five required fields (`canonical_side`, `canonical_reason`, [`new_shape_summary` if `canonical_side: new`], `tests`, `tests_proof`) — the parse-time validator covers structural correctness; this gate covers runtime truth ("the canonical_side file actually exists; the tests-proof sha actually resolves; the tests actually pass at HEAD"). Companion to `/dw-lifecycle:dispose-clone` (which refuses `--as refactor` and redirects to manual editing) and `/dw-lifecycle:check-disposition-survivor` (which catches the inverse failure: a refactor disposition silently reverting to `pending`).
