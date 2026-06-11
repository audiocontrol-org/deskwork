---

> **RETIRED.** `dw-lifecycle` has been superseded by `stack-control`. This skill is preserved for historical reference only and is no longer maintained. Use [stack-control](../../../stack-control/) skills instead.

# /dw-lifecycle:triage-issues

A batched-proposal cycle for grinding down accumulated GitHub-issue debt. The skill runs in two verbs — `propose` (read-only fetch + emit a structured proposal file) and `apply` (read the filled-in proposal file + dispatch one `gh` mutation per approved row).

The two halves are intentionally separate. The agent's chat session is the brain (writes the per-row disposition + rationale); the subcommand is the hands (`gh` calls). The proposal JSON file is the contract between them — adopters may inspect it, edit it, version-control it, replay it.

## Steps

1. Confirm the project root has a `.dw-lifecycle/config.json` (otherwise run `/dw-lifecycle:install` first).
2. Confirm `gh` is authenticated.
3. **Propose**:

```
dw-lifecycle triage-issues propose --bucket <name> [--limit N] [--repo owner/repo] [--output <path>]
```

The subcommand emits:
- A structured proposal file at `.dw-lifecycle/triage-issues/proposals-<timestamp>.json` (override with `--output`).
- A markdown table to stdout — one row per fetched issue, with two empty columns labeled `(FILL IN)`: `Proposed disposition` and `Rationale`.

4. The agent reads the table, decides a disposition per row, and writes the per-row decision back into the JSON file's `items[].disposition` + `items[].disposition_fields`.
5. The operator reviews the batch and writes the approval token into the file's top-level `approval` field:
   - `"y"` (or `"yes"`) — apply every row that has a disposition.
   - `"n"` (or `"no"`) — abort; nothing mutates.
   - `"1,3,5"` — apply only the listed 1-based row indexes.
6. **Apply**:

```
dw-lifecycle triage-issues apply --from-file <path> [--repo owner/repo]
```

The subcommand dispatches one `gh` mutation per approved row, surfaces per-item success / failure inline, and overwrites the proposal file with the post-apply state.

## Buckets

| Name | Query | What it matches |
|---|---|---|
| `stale-30d` | `state:open updated:<$DATE_30d_AGO` | open issues that haven't been touched in 30+ days |
| `unlabeled` | `state:open no:label` | open issues with no labels |
| `bug-no-comment-7d` | `state:open label:bug comments:0 created:<$DATE_7d_AGO` | open `bug`-labeled issues opened more than 7 days ago that have received zero comments (creation-time staleness, not comment-activity staleness) |

### `$DATE_NNd_AGO` placeholder

Built-in and adopter-supplied bucket queries support a `$DATE_NNd_AGO` placeholder, where `NN` is any positive integer. At propose-time the placeholder is substituted with the ISO date `NN` days before `now` (the caller's clock). For example, when `propose` runs on `2026-05-28`, `$DATE_30d_AGO` becomes `2026-04-28`. This lets adopters author custom buckets that adapt to invocation time without hand-editing the query each run.

Adopters may add or override buckets via `.dw-lifecycle/triage-buckets.yaml`:

```yaml
stale-90d: "state:open updated:<$DATE_90d_AGO"
no-milestone: "state:open no:milestone"
```

Overrides win on name collision; unknown bucket names throw before any `gh` call fires.

## Disposition vocabulary

Each row's `disposition` is one of four shapes; each shape requires the corresponding `disposition_fields`:

| Disposition | Fields | gh action |
|---|---|---|
| `close-wontfix` | `{ "reason": "..." }` | `gh issue close --reason 'not planned' --comment "<reason>"` |
| `label` | `{ "labels": ["bug", "..."] }` | `gh issue edit --add-label <a> --add-label <b>` |
| `duplicate` | `{ "dup_of": 42, "reason": "..." }` | `gh issue close --reason 'not planned' --comment "Closing as duplicate of #42. <reason>"` |
| `leave-with-comment` | `{ "comment": "..." }` | `gh issue comment --body "<comment>"` |

## Proposal file shape

```json
{
  "generated_at": "2026-05-28T18:30:00.000Z",
  "bucket": "stale-30d",
  "query": "state:open updated:<2026-04-28",
  "repo": "audiocontrol-org/deskwork",
  "approval": null,
  "items": [
    {
      "number": 123,
      "title": "Some issue title",
      "url": "https://github.com/owner/repo/issues/123",
      "age_days": 47,
      "comment_age_days": 32,
      "labels": ["enhancement"],
      "body_excerpt": "First 240 chars of the issue body...",
      "disposition": null,
      "disposition_fields": null,
      "applied": null,
      "apply_error": null,
      "result": null
    }
  ]
}
```

After the agent fills in dispositions and the operator writes the approval token, `apply` mutates the matching rows and overwrites the file with `applied: true/false`, `result`, and `apply_error` populated per row.

## Partial success

Each row's `gh` mutation runs independently. A failure on one row does not abort the run; the failure is recorded in that row's `apply_error` field and the next row proceeds. The post-apply summary reports `Applied: N; Failed: M; Skipped: K` with per-failure detail lines.

Re-running `apply` against the same file is safe — already-applied rows can be re-attempted (re-applying a label is a no-op; re-closing an already-closed issue surfaces a gh error that the apply layer records as a failure).

## Flags

| Flag | Verb | Default | What it does |
|---|---|---|---|
| `--bucket <name>` | propose | required | Bucket to fetch (built-in or override). |
| `--limit <N>` | propose | 10 | Max issues per batch. |
| `--repo <owner/repo>` | both | autodetect from `origin` | Target repository. |
| `--output <path>` | propose | `.dw-lifecycle/triage-issues/proposals-<ts>.json` | Override proposal-file path. |
| `--force` | propose | off | Overwrite the output path if a file already exists (without `--force`, propose refuses to clobber an existing proposal so operator hand-edits aren't silently lost). |
| `--from-file <path>` | apply | required | Proposal file to apply. |

## Exit codes

| Code | Verb | Meaning |
|---|---|---|
| 0 | propose | Proposal written. |
| 2 | propose | Output path already exists and `--force` was not supplied. |
| 0 | apply | Proposal applied (at least one row succeeded, or `approval: "n"`, or no rows attempted). |
| 1 | apply | Every approved row failed; nothing landed. |
| 2 | apply | Proposal file was structurally invalid (could not parse, missing required fields, or an approved item was half-filled / had invalid disposition_fields). |

## Error handling

- **Unknown bucket.** Throws with the built-in bucket list + the override file path so the operator can either fix the name or define a custom bucket.
- **`gh` not authenticated.** The first `gh` call's error message surfaces verbatim; subsequent rows continue independently (each will fail with the same auth error and be recorded individually).
- **Approval not set.** `apply` throws if `approval` is null; the operator (or their agent) must write the token before applying.
- **Disposition missing for an approved row.** The row's `apply_error` records "no disposition" and the summary surfaces it as a failure. Both halves (`disposition` and `disposition_fields`) must be null together; a row with only one half filled aborts the whole batch via the pre-validation gate.
- **Approved row with half-filled disposition.** Apply's pre-validation gate aborts the whole batch with zero `gh` mutations and names which side is missing (disposition vs disposition_fields). Fix the row and re-run.
- **Output path already exists for propose.** Propose refuses to overwrite an existing file (so operator hand-edits aren't silently clobbered). Pass `--force` to opt in, pass a different `--output` path, or move the existing file aside.

## Why two verbs

Separating `propose` from `apply` means the proposal file is a durable artifact. Adopters can:

- Inspect what the agent proposed before approving (no surprise mutations).
- Edit the disposition on a row before approving (override the agent's choice).
- Hand-craft a proposal file from scratch and run `apply` against it.
- Replay an old proposal against a refreshed repository state.
- Version-control proposal files alongside the project's `.dw-lifecycle/` config.

The JSON file IS the protocol. The skill is a thin shell around it.
