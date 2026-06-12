---

> **RETIRED.** `dw-lifecycle` has been superseded by `stack-control`. This skill is preserved for historical reference only and is no longer maintained. Use [stack-control](../../../stack-control/) skills instead.

# /dw-lifecycle:worktree-report

The fourth read-only surface in the hygiene-skill family — what's the worktree state right now. Pure observation; no mutations. Sibling of `:debt-report` (which covers GitHub issues, workplan TBDs, and parked branches).

## When to use

Run when:
- A new feature is about to be set up — confirm the worktree-base directory isn't carrying shipped or abandoned work.
- After a release — feature worktrees whose code has shipped should be reported as `stale` candidates for dismantle.
- During session-start review — the hygiene block in `DEVELOPMENT-NOTES.md` may flag worktree-staleness; this verb is the read that backs that block.
- As the read baseline before invoking `/dw-lifecycle:dismantle-worktrees propose` (the mutation sibling).

## Steps

1. Confirm `.dw-lifecycle/config.json` exists (otherwise run `/dw-lifecycle:install` first).
2. Confirm `gh` is authenticated for the PR-state lookup (PR state defaults to `unknown` when not).
3. Shell out:

```
dw-lifecycle worktree-report [--json] [--days N] [--threshold-count N] [--worktree-base <path>] [--allow-external]
```

4. Read the markdown output (default) or pipe the JSON output (`--json`) into a downstream consumer.

## What it reports

For each git-registered worktree AND each orphan directory in the worktree-base path:

- **Path** of the worktree (or orphan directory).
- **Branch** pinned to it (`(detached)` if HEAD is detached).
- **Ahead/behind** counts against `origin/main`.
- **Last commit** date + short SHA.
- **Working tree state** — `clean` or `dirty (N files)`.
- **PR state** — `open` / `merged` / `closed` / `no-pr` / `unknown` (+ PR number if found).
- **Feature doc location** — `001-IN-PROGRESS/<slug>` / `003-COMPLETE/<slug>` / `—`.
- **Recommended disposition** — `keep` / `dismantle` / `archive-then-dismantle` / `prune-orphan` / `operator-triage`.

## The nine staleness signals

Per PRD § Phase 11. Each signal is one observable fact; the verdict comes from `≥ threshold_count` signals holding (default 3 of 9).

| Signal | Held when |
|---|---|
| `branch-fully-merged` | 0 commits ahead of `origin/main`. |
| `pr-merged-or-closed` | `gh` reports PR state in `{merged, closed}`. |
| `feature-doc-complete` | A `003-COMPLETE/<slug>/` directory exists for the branch's derived slug. |
| `no-recent-commits` | Branch's last commit is older than `--days` (default 30). |
| `branch-gone-from-origin` | `git ls-remote origin <branch>` returns empty. |
| `working-tree-clean` | `git status --porcelain` is empty. |
| `commits-on-origin` | No local-only commits ahead of `origin/<branch>`. |
| `prunable` | `git worktree list --porcelain` marks the entry prunable. |
| `orphan-directory` | Directory exists on disk in the worktree-base but not in `git worktree list`. |

## Verdict precedence

Verdicts are computed in this priority order (top wins):

1. `current` — the worktree we're running from (never a dismantle candidate).
2. `main` — the project's main worktree (the anchor; never a dismantle candidate).
3. `corrupt` — multiple worktrees share the same pinned branch. Operator-triage.
4. `divergent` — local branch SHA isn't an ancestor of `origin/<branch>` (force-push surface). Operator-triage.
5. `orphan` — directory on disk; `git worktree list` doesn't know it. Disposition: `prune-orphan`.
6. `stale` — `≥ threshold_count` signals hold. Disposition: `dismantle` (no novel commits) or `archive-then-dismantle` (has commits ahead of `main`).
7. `keep` — none of the above.

## Worktree-base auto-detection

The worktree-base is the common parent directory of all non-bare entries in `git worktree list --porcelain`. Pass `--worktree-base <path>` to override.

The orphan-directory check walks the auto-detected (or operator-supplied) base directory and lists every direct child that's a directory but isn't a registered worktree path. Dotfiles + `.git` are excluded.

## Output formats

- **Markdown** (default) — summary table + per-bucket entry tables + per-entry per-criterion check.
- **JSON** (`--json`) — same data; downstream-consumable. Snake-case fields per the family convention; `generated_at` ISO-8601.

## Flags

| Flag | Default | What it does |
|---|---|---|
| `--json` | off | Emit JSON to stdout instead of markdown. |
| `--days <N>` | 30 | Threshold in days for the `no-recent-commits` signal. |
| `--threshold-count <N>` | 3 | Minimum signals that must hold for the `stale` verdict. |
| `--worktree-base <path>` | auto-detect | Override the auto-detected base directory. |
| `--allow-external` | off | Include worktrees outside the (auto-detected or operator-supplied) base path. |

## Error handling

- **`gh` CLI not authenticated.** PR state surfaces as `unknown`; the report still runs. Authenticate with `gh auth login` to enable the `pr-merged-or-closed` signal.
- **No `.dw-lifecycle/config.json`.** Run `/dw-lifecycle:install` first.
- **Single-worktree repos.** Auto-detection returns the parent directory of the lone worktree. Orphan-directory walk lists every direct child of that parent — operator confirms whether that's the intended base via `--worktree-base`.

## Why it ships separately from the dismantle verb

`/dw-lifecycle:worktree-report` is read-only by design. The mutation sibling (`/dw-lifecycle:dismantle-worktrees propose|apply`) acts on what this surface reports. Keeping the snapshot a distinct, side-effect-free verb means an operator can run it inside a loop (in `session-end`, in CI, on a cron) without worrying about what state it would have changed. The mutation verb runs separately and can be paused, queued, or rejected.

This mirrors the relationship between `/dw-lifecycle:debt-report` (read) and its mutation siblings `:triage-issues` / `:promote-deferrals` / `:archive-branch` / `:close-shipped`.
