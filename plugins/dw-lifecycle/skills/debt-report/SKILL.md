---
name: debt-report
description: "Read-only cross-source debt snapshot: open issues bucketed by label/age, workplan TBD totals per in-progress feature, parked branches with ahead/behind"
---

# /dw-lifecycle:debt-report

A pure-observation surface — the "what's the state right now" snapshot of three accumulating debt streams: GitHub issues, workplan TBDs, and parked branches. No mutations.

This skill is the read-only baseline of the hygiene-skill family. Subsequent skills in the family (`:triage-issues`, `:promote-deferrals`, `:archive-branch`, `:close-shipped`) mutate based on what this surface reports.

**Sibling read for the fourth debt stream:** worktree staleness ships as a separate read verb at [`/dw-lifecycle:worktree-report`](../worktree-report/SKILL.md). Its mutation sibling `:dismantle-worktrees propose|apply` mirrors `:triage-issues`'s shape.

## Steps

1. Confirm the project root has a `.dw-lifecycle/config.json` (otherwise run `/dw-lifecycle:install` first).
2. Confirm `gh` is authenticated for the GitHub issues section, OR pass `--no-gh` to skip it.
3. Shell out:

```
dw-lifecycle debt-report [--json] [--repo owner/repo] [--stale-days N] [--comment-stale-days N] [--parked-days N] [--limit N] [--sample-size N] [--no-gh] [--no-workplan] [--no-branches]
```

4. Read the markdown output (default) or pipe the JSON output (`--json`) into a downstream consumer.

## What it reports

### GitHub issues

- Total open issue count.
- Counts bucketed by label (sorted by count, descending).
- Unlabeled count + sample (N oldest by `updated_at`).
- Stale count (open and not updated in > 30 days; threshold configurable via `--stale-days`).
- Stale-since-last-comment count (open > 7 days; latest comment older than 7 days OR no comments and issue itself older than 7 days; threshold via `--comment-stale-days`).

### Workplan TBDs

For each in-progress feature directory (`docs/<v>/001-IN-PROGRESS/<slug>/workplan.md`):

- Count of `TBD:` markers (case-insensitive).
- Count of `defer` markers.
- Count of `follow-up:` markers.
- Count of `out of scope` markers.
- Per-feature total.

Lines already annotated with `[debt: #NNN]` are excluded from the count — those have been promoted to GitHub issues via `/dw-lifecycle:promote-deferrals` (Phase 3) and are no longer bare TBDs.

### Parked branches

A branch is "parked" when it has commits ahead of `origin/main` AND its last commit is older than 30 days (`--parked-days`). Other branches with commits ahead but recent activity, or branches with no commits ahead, are listed separately as "other branches" so the report isn't silent about them.

Excluded: `main`, `origin/main`, `master`, `origin/master`, `HEAD`, and the current branch (parked-self is not actionable from the current checkout).

## Output formats

- **Markdown** (default) — operator-readable; three sections of tables.
- **JSON** (`--json`) — downstream-consumable; the same three sections as snake_case keys, plus a `generated_at` ISO-8601 timestamp.

## Flags

| Flag | Default | What it does |
|---|---|---|
| `--json` | off | Emit JSON to stdout instead of markdown. |
| `--repo <owner/repo>` | autodetect | Override the auto-detected GitHub repo. |
| `--stale-days <N>` | 30 | Override the stale-issue threshold. |
| `--comment-stale-days <N>` | 7 | Override the stale-since-last-comment threshold. |
| `--parked-days <N>` | 30 | Override the parked-branch age threshold. |
| `--limit <N>` | 1000 | `gh issue list` page limit. |
| `--sample-size <N>` | 5 | Number of items shown per sample table. |
| `--no-gh` | off | Skip the GitHub issues section (useful when `gh` is not authenticated). |
| `--no-workplan` | off | Skip the workplan TBDs section. |
| `--no-branches` | off | Skip the parked-branches section. |

## Error handling

- **`gh` CLI not authenticated.** The skill surfaces the gh error verbatim. Run `gh auth login` and retry, or pass `--no-gh` to proceed without the GitHub section.
- **No `.dw-lifecycle/config.json`.** Run `/dw-lifecycle:install` in the project root first.
- **No `origin` remote and no `--repo` flag.** The skill cannot detect the GitHub repo. Pass `--repo owner/repo` explicitly.

## Why it ships separately from the mutating skills

`/dw-lifecycle:debt-report` is read-only by design. The mutating siblings (`:triage-issues`, `:promote-deferrals`, `:archive-branch`, `:close-shipped`) act on what this surface reports. Keeping the snapshot a distinct, side-effect-free verb means an operator can run it inside a loop (in `session-end`, in CI, on a cron) without worrying about what state it would have changed. The mutating skills run separately and can be paused, queued, or rejected.
