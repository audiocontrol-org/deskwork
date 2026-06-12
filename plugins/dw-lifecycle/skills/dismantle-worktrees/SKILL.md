---

> **RETIRED.** `dw-lifecycle` has been superseded by `stack-control`. This skill is preserved for historical reference only and is no longer maintained. Use [stack-control](../../../stack-control/) skills instead.

# /dw-lifecycle:dismantle-worktrees

The mutation companion to [`/dw-lifecycle:worktree-report`](../worktree-report/SKILL.md). Walks the report's `stale` + `orphan` entries, writes a JSON proposal pre-filled with recommended dispositions, waits for the operator to fill in per-worktree decisions, then dispatches one worktree at a time. All-or-nothing on validation; best-effort on per-worktree dismantle.

## When to use

After `/dw-lifecycle:worktree-report` surfaces stale or orphan entries. The propose step is the read; the apply step is the mutation. Operator review happens between them.

## Steps

1. Confirm `.dw-lifecycle/config.json` exists (otherwise run `/dw-lifecycle:install` first).
2. **Propose** — scan + write the JSON proposal:

   ```
   dw-lifecycle dismantle-worktrees propose [--days N] [--threshold-count N] [--worktree-base <path>] [--allow-external] [--output <path>] [--force]
   ```

   The proposal file lands at `<projectRoot>/.dw-lifecycle/dismantle-worktrees/proposals-<iso>.json` by default. The CLI prints a markdown table to stdout for at-a-glance review and a "next step" hint to stderr.

3. **Edit the proposal.** Open the JSON file. For each entry, set the `decision` field to one of:

   - `dismantle` — remove the worktree; leave the branch ref in place.
   - `archive-then-dismantle` — tag-archive the branch first, then remove the worktree, then delete the branch. The annotated tag preserves the branch contents for recovery.
   - `prune-orphan` — call `git worktree prune` (used for `orphan` verdict entries whose admin dir is gone but path lingers).
   - `skip` — leave alone this cycle.

   If you set `decision: "dismantle"` AND the worktree has uncommitted changes, you must ALSO pass `--allow-dirty --reason "<substantive>"` at apply time. Same for `decision: "dismantle"` on a branch with local-only commits — pass `--force-discard --reason "<substantive>"`.

4. **Apply** — read the decisions, dispatch:

   ```
   dw-lifecycle dismantle-worktrees apply --proposal <path> [--allow-dirty] [--force-discard] [--accept-divergence] [--allow-external] [--reason "<text>"]
   ```

   The apply step validates that every entry's `decision` is set to a valid value before any mutation runs. Per-worktree dismantle is best-effort — a failure on one worktree doesn't halt the batch; the failure is recorded and the batch continues.

5. Read the per-bucket summary:

   ```
   Applied N, skipped M, failed K.
     applied: <path> [<decision>] (tag: <name>)
     skipped: <path>
     failed:  <path> — <error>
   ```

## What it does

### Propose

- Runs the same scan `worktree-report` does.
- Filters to `stale` + `orphan` verdict entries (other verdicts need operator-triage before they enter the propose flow).
- Writes the proposal JSON with one row per filtered entry; `decision` field is initialized empty.
- Prints a markdown table for at-a-glance review.

### Apply

For each entry whose decision is `dismantle` or `archive-then-dismantle`:

1. Pre-flight gates (one-throw-rule):
   - Refuse on the current worktree (can't remove the one we're running from).
   - Refuse on the main worktree (the project's anchor).
   - Refuse on dirty working tree without `--allow-dirty --reason "<substantive>"`.
   - Refuse on local-only commits without `--force-discard --reason "<substantive>"`.
   - Refuse on force-push divergence without `--accept-divergence`.
   - Refuse on external-path worktrees without `--allow-external`.
   - Refuse on unknown-to-git paths (use `prune-orphan` instead).
2. Substantive-reason gate fires when `--allow-dirty` OR `--force-discard` is set:
   - Reason must be ≥40 characters after trim.
   - Reason must contain no banned-hedge phrases (`for now`, `will fix later`, `TBD`, `eventually`, etc. — same list as `:promote-deferrals` and `:complete-gate`).
3. On all-clear:
   - `git worktree remove <path>` (with `--force` when `--allow-dirty` or `--force-discard` is set).
   - When `archive-then-dismantle`: invoke the `:archive-branch` primitive to tag + push + delete the branch.

For `prune-orphan`: runs `git worktree prune` once per batch (best-effort).

For `skip`: records the entry as skipped; no mutation.

## Composition with `:archive-branch`

`decision: "archive-then-dismantle"` invokes the `:archive-branch` primitive after the worktree is removed. The branch gets an annotated `archived/<branch>-<date>` tag (pushed to origin); the local + remote branch is deleted. The tag preserves the work for `git checkout -b <branch> <tag>` recovery.

Use `archive-then-dismantle` when the branch has commits that aren't on `main` and the operator wants the work preserved as a named tag. Use `dismantle` when the branch is fully merged or the operator explicitly wants the work discarded.

## Recommended dispositions (from the report)

The `recommended_disposition` field on each proposal entry is the verb's suggestion — the operator overrides freely via the `decision` field. The verb derives the suggestion from the verdict:

- `keep` → not in the proposal.
- `stale` + no novel commits ahead of `main` → `dismantle`.
- `stale` + commits ahead of `main` → `archive-then-dismantle`.
- `orphan` → `prune-orphan`.

## Flags

### Propose flags

| Flag | Default | What it does |
|---|---|---|
| `--days <N>` | 30 | Staleness window in days. |
| `--threshold-count <N>` | 3 | Signals that must hold for `stale` verdict. |
| `--worktree-base <path>` | auto-detect | Override the auto-detected base. |
| `--allow-external` | off | Include worktrees outside the base path. |
| `--output <path>` | `.dw-lifecycle/...` | Override the proposal output path. |
| `--force` | off | Overwrite an existing proposal file at the output path. |

### Apply flags

| Flag | Default | What it does |
|---|---|---|
| `--proposal <path>` | required | Path to the proposal JSON. |
| `--allow-dirty` | off | Allow dismantling worktrees with uncommitted changes. Requires `--reason`. |
| `--force-discard` | off | Allow discarding local-only commits. Requires `--reason`. |
| `--accept-divergence` | off | Allow dismantling force-pushed branches. |
| `--allow-external` | off | Allow dismantling worktrees outside the base path. |
| `--reason "<text>"` | — | Substantive reason for `--allow-dirty` or `--force-discard`. ≥40 chars; no banned hedges. |

## Exit codes

| Code | Meaning |
|---|---|
| 0 | Propose succeeded, OR apply completed with zero failures. |
| 1 | Apply completed with one or more per-worktree failures. |
| 2 | Validation failure (invalid args, invalid proposal, preflight refusal). |

## Why a propose+apply split

Worktrees are higher-stakes than triage-an-issue. The propose step writes a durable JSON record the operator reads before approving anything. The all-or-nothing validation on apply prevents a partial-edit footgun (you can't accidentally dismantle 38 worktrees because you forgot to set decisions on 5 — the validator refuses if any decision is unset).

This mirrors `/dw-lifecycle:triage-issues` and `/dw-lifecycle:promote-deferrals`, which the operator already mental-models from.
