---
name: archive-branch
description: "Preserve-work-then-delete pattern for parked branches: create an annotated tag, push it, delete the branch local + remote. Pre-flight refuses on checked-out worktree, pre-existing tag, or no novel commits."
---

# /dw-lifecycle:archive-branch

The single-action verb for retiring a parked branch without losing its work. The skill creates an annotated tag at the branch tip, pushes the tag to origin, then deletes the branch locally and remotely. The tag preserves both the branch tip + a human-readable rationale, so the history is reachable and named even after the branch is gone.

This skill is part of the hygiene-skill family (`/dw-lifecycle:debt-report` for read-only state; `/dw-lifecycle:triage-issues` and `/dw-lifecycle:promote-deferrals` for issues/workplan mutations; this skill for branches; `/dw-lifecycle:close-shipped` for closing fix-shipped issues).

## When to use

`/dw-lifecycle:debt-report` reports parked branches (ahead of `origin/main` with last commit older than the parked-days threshold). For each parked branch the operator inspects, one of three things happens:

- **Revive** — check it out, rebase, finish the work. (Not this skill.)
- **Discard** — `git branch -D`. (Not this skill — work is lost.)
- **Archive** — preserve the work as a named tag, then delete the branch. (This skill.)

The archive pattern is the right disposition when the branch's work is potentially valuable historically (someone may want to revisit it, mine ideas from it, cherry-pick a commit) but it's no longer the active intent and shouldn't sit in the branch-list noise.

## Steps

1. Confirm the project root has `.dw-lifecycle/config.json` (otherwise run `/dw-lifecycle:install` first).
2. Identify the branch to archive (typically from a `/dw-lifecycle:debt-report` parked-branches table).
3. Shell out:

```
dw-lifecycle archive-branch <branch> [--rationale "<text>"] [--no-push|--local-only] [--dry-run] [--force]
```

4. Read the summary printed to stdout; the `To restore:` line names the exact `git checkout -b <branch> <tag-name>` invocation to revive the branch later.

## What it does

### Tag-naming convention

`archived/<branch-with-slashes-replaced-by-dashes>-<YYYY-MM-DD>`. Example: branch `feature/studio-bridge` archived on 2026-05-28 → tag `archived/feature-studio-bridge-2026-05-28`.

Slash-to-dash replacement keeps the `archived/` tag namespace flat — git refs use slashes as namespace separators, and a slash-containing branch name would create a confusing nested-looking tag.

### Pre-flight gates

ALL gates must pass before any mutation. Any failure throws with an actionable message; no subsequent gates run, no mutations attempted.

1. **Branch exists.** `git rev-parse --verify refs/heads/<branch>` must succeed. Fail message names the branch and points at `git branch --list`.
2. **Branch is not currently checked out.** Parsed from `git worktree list --porcelain`. If a worktree is checked out for the branch, the failure message includes the worktree path + the `git worktree remove` command to clear it first.
3. **Tag does not already exist.** `git rev-parse --verify refs/tags/<tag-name>` must FAIL (non-zero exit = ref doesn't exist, which is the desired state). If the tag exists, the failure message offers two options: delete the existing tag, or wait until tomorrow so the date suffix differs.
4. **Branch has at least one commit not on `origin/main`.** `git rev-list --count <branch> ^origin/main` must return >0. If 0, the branch is fully merged or empty; the failure message advises `--force` to archive anyway. (Helpful when `origin/main` is unreachable — pass `--force` to skip the novelty check.)

### Apply sequence

After pre-flight passes, the skill runs in this order:

1. **Create annotated tag.** `git tag -a <tag-name> <branch> -m "<message>"`. The message body includes the operator-supplied rationale (or the default `Archived <YYYY-MM-DD>; preserved as tag.`), the source branch name, the last-commit SHA + subject, and the archive date.
2. **Push tag to origin** (unless `--no-push` / `--local-only`). `git push origin refs/tags/<tag-name>:refs/tags/<tag-name>`.
3. **Delete local branch.** `git branch -D <branch>`. The tag preserves the work at this point, so force-delete is safe.
4. **Delete remote branch** (unless `--no-push` / `--local-only`). `git push origin --delete <branch>`. If the remote branch doesn't exist (because the branch was local-only), the failure is surfaced as a non-fatal skip with `remote branch did not exist; skipped` in the summary.

### Mid-flight failure handling

If any apply step fails mid-flight (network error on push, etc.), the skill does NOT roll back. Deleting a freshly-created tag is destructive in its own right; the operator decides recovery. The error message names the failed git command + its exit context so the operator can resume manually.

## Flags

| Flag | Default | What it does |
|---|---|---|
| `<branch>` | required | The branch to archive (positional). |
| `--rationale "<text>"` | `Archived <YYYY-MM-DD>; preserved as tag.` | Rationale embedded in the annotated tag's message body. |
| `--no-push` | off | Skip pushing the tag AND the remote-branch delete. Local-only operation. |
| `--local-only` | off | Alias for `--no-push`. |
| `--dry-run` | off | Print every git command the skill would run, without running any of them. Pre-flight gates still run; their refusal messages still surface. Exits 0 if pre-flight passes. |
| `--force` | off | Skip the "has novel commits" pre-flight check. Useful when `origin/main` is unreachable, or when archiving a branch fully merged to main that should still be preserved as a named tag. |

## Exit codes

| Code | Meaning |
|---|---|
| 0 | Archive completed; or `--dry-run` passed pre-flight. |
| 1 | Apply step failed mid-flight (tag created but push failed, local delete failed, etc.). |
| 2 | Pre-flight gate failed (unknown branch, branch checked out, tag exists, no novel commits). |

## Restoring an archived branch

Every archive run prints a `To restore: git checkout -b <branch> <tag-name>` line. The tag is annotated, so `git show <tag-name>` displays the rationale + branch metadata embedded at archive time.

## Why it ships as a single-action verb

Unlike `/dw-lifecycle:triage-issues` and `/dw-lifecycle:promote-deferrals` (which use a batched propose/apply protocol), `archive-branch` operates on one branch per invocation. The pre-flight gates are deterministic and the apply sequence is short; there's no operator-judgment step a propose phase would surface. The flag-set (`--rationale`, `--no-push`, `--dry-run`, `--force`) covers the variability the operator needs to express.

If a use case emerges for archiving many branches in a single batch, that's a separate verb (`/dw-lifecycle:archive-branches`, plural) that wraps this one — not a flag on this verb.
