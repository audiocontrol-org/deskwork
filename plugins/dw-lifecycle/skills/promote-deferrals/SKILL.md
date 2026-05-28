---
name: promote-deferrals
description: "Workplan-TBD scanner with promote-to-issue and inline-wontfix dispositions — mechanically enforces the project's 'Just for now is bullshit' rule. Finds TBD / defer / follow-up: / out of scope markers in a target workplan; the agent proposes a disposition per row; approved rows create issues + back-link the workplan, or rewrite the line with a substantive wontfix reason."
---

# /dw-lifecycle:promote-deferrals

A batched-proposal cycle for grinding down workplan-internal hedge markers — bare `TBD:`, `defer`, `follow-up:`, and `out of scope` lines that the project rule names as not-a-valid-disposition. Each line gets one of two outcomes: a tracking issue (with the `[debt: #NNN]` back-link recorded on the workplan line) or an inline `(wontfix: <substantive-reason>)` annotation that documents WHY the work won't happen.

The substantive-reason validator refuses the gaming phrases the rule names — `for now`, `next pass`, `will fix later`, `tomorrow`, `eventually`, and the rest — at a `≥40` character minimum. A wontfix that contains those phrases is rejected at the pre-validation gate; no workplan mutation runs.

## Steps

1. Confirm the project root has a `.dw-lifecycle/config.json` (otherwise run `/dw-lifecycle:install` first).
2. Confirm `gh` is authenticated (needed for the `promote-to-issue` disposition).
3. **Propose**:

```
dw-lifecycle promote-deferrals propose --workplan <path> [--repo owner/repo] [--output <path>]
```

The subcommand emits:
- A structured proposal file at `.dw-lifecycle/promote-deferrals/proposals-<timestamp>.json` (override with `--output`).
- A markdown table to stdout — one row per matched TBD line, with two empty columns labeled `(FILL IN)`: `Proposed disposition` and `Disposition fields`.

4. The agent reads the table, picks a disposition per row, and writes the per-row decision back into the JSON file's `items[].disposition` + `items[].disposition_fields`.
5. The operator reviews the batch and writes the approval token into the file's top-level `approval` field:
   - `"y"` — apply every row that has a disposition.
   - `"n"` — abort; nothing mutates.
   - `"1,3,5"` — apply only the listed 1-based row indexes.
6. **Apply**:

```
dw-lifecycle promote-deferrals apply --from-file <path> [--repo owner/repo]
```

The subcommand:
- Runs the all-or-nothing pre-validation gate (any approved row with malformed `disposition_fields` aborts the whole batch).
- For `promote-to-issue` rows: dispatches `gh issue create`, parses the new issue number, and appends ` [debt: #N]` to the workplan line.
- For `inline-wontfix` rows: strips the marker keyword and appends ` (wontfix: <reason>)` to the workplan line.
- Surfaces per-item success / failure inline.
- Overwrites the proposal file with the post-apply state; rewrites the workplan file once at the end of the run.

## Disposition vocabulary

| Disposition | Fields | Action |
|---|---|---|
| `promote-to-issue` | `{ "title": "...", "body": "..." }` | `gh issue create`; append ` [debt: #N]` to the workplan line |
| `inline-wontfix` | `{ "reason": "..." }` | Strip the marker keyword; append ` (wontfix: <reason>)` to the workplan line |

### `promote-to-issue` rules

- `title` is required, non-empty, ≤100 characters.
- `body` is required, ≥40 characters. Embed the containing-task + parent-phase context the propose step recorded so the issue is self-contained.

### `inline-wontfix` rules

- `reason` is required, ≥40 characters after trim.
- `reason` MUST NOT contain any of the banned hedge phrases: `for now`, `just for now`, `next pass`, `TBD`, `will fix later`, `will fix`, `will address`, `address in`, `fix later`, `eventually`, `tomorrow`, `next sprint`, `next cycle`, `next milestone`, `deferred`, `todo`, `fixme`, the bare word `later`, and the verb phrase `follow up` / `follow-up`.
- The validator is case-insensitive. Word-boundary patterns apply to `later`, `todo`, `fixme`, `TBD`, and `follow up` / `follow-up` so they don't over-match (e.g. `later-version` is fine; bare `later` is rejected).

## Proposal file shape

```json
{
  "generated_at": "2026-05-28T18:30:00.000Z",
  "workplan_path": "/abs/path/to/workplan.md",
  "repo": "audiocontrol-org/deskwork",
  "approval": null,
  "items": [
    {
      "lineNumber": 142,
      "markerKey": "tbd",
      "text": "- [ ] TBD: figure out how to handle nested groups",
      "containingTask": "Task 2: Group lifecycle",
      "parentPhase": "Phase 5: Recursive groups",
      "containingTaskLine": 130,
      "parentPhaseLine": 100,
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

## Workplan edits

Both disposition kinds rewrite the workplan IN PLACE. The edits are line-anchored to the `lineNumber` the propose step recorded, with a drift check: the live line's text must START WITH the recorded excerpt. If the workplan has been edited since propose ran and the matched line drifted, the per-item edit fails (the run continues for other rows) and the operator must re-run propose.

For `promote-to-issue`:
- Before: `- [ ] TBD: figure out how to handle nested groups`
- After: `- [ ] TBD: figure out how to handle nested groups [debt: #189]`

For `inline-wontfix`:
- Before: `- [ ] TBD: figure out how to handle nested groups`
- After: `- [ ] figure out how to handle nested groups (wontfix: nested groups conflict with the lane-immutability invariant Phase 4 codified; surfaces would need a redesign before re-opening)`

The original marker keyword is stripped from the wontfix-rewritten line so the result reads as a declarative annotation rather than a hedge. The promote-to-issue rewrite leaves the marker in place — the back-link signals that the deferral is tracked.

## Multi-marker-per-line

When a single line carries multiple TBD markers (e.g. `- [ ] TBD: defer to next milestone`), the apply layer treats the LINE as the unit of edit — one back-link or one wontfix wrapper per line, even if multiple markers triggered the match. To get per-marker dispositions, split the line in the source workplan first, then re-run propose.

## Partial success

Each row's mutation runs independently. A `gh issue create` failure on one row does not abort the run; the failure is recorded in that row's `apply_error` field and the next row proceeds. The post-apply summary reports `Applied: N; Failed: M; Skipped: K` with per-row detail lines.

The workplan file is rewritten ONCE at the end of the run so a per-row drift error leaves the rest of the in-progress content intact.

## Flags

| Flag | Verb | Default | What it does |
|---|---|---|---|
| `--workplan <path>` | propose | required | Workplan markdown file to scan. |
| `--repo <owner/repo>` | both | autodetect from `origin` | Target repository for `gh issue create`. |
| `--output <path>` | propose | `.dw-lifecycle/promote-deferrals/proposals-<ts>.json` | Override proposal-file path. |
| `--force` | propose | off | Overwrite the output path if a file already exists (without `--force`, propose refuses to clobber an existing proposal so operator hand-edits aren't silently lost). |
| `--from-file <path>` | apply | required | Proposal file to apply. |

## Exit codes

| Code | Verb | Meaning |
|---|---|---|
| 0 | propose | Proposal written. |
| 2 | propose | Output path already exists and `--force` was not supplied. |
| 0 | apply | Proposal applied (at least one row succeeded, `approval: "n"`, or no rows attempted). |
| 1 | apply | Every approved row failed; nothing landed. |
| 2 | apply | Proposal file was structurally invalid (could not parse, missing required fields, or an approved row was half-filled / had invalid disposition_fields). |

## Error handling

- **No TBD markers found.** Propose succeeds with `items: []`. The markdown table renders as a header-only stub.
- **Workplan not found.** Propose throws with the path the operator passed.
- **`gh` not authenticated.** First row's `gh issue create` surfaces the auth error; subsequent rows continue independently (each will fail with the same auth error and be recorded individually).
- **Approval not set.** `apply` throws if `approval` is null; the operator (or their agent) must write the token before applying.
- **Disposition missing for an approved row.** Both halves (`disposition` and `disposition_fields`) must be null together; a row with only one half filled aborts the whole batch via the pre-validation gate (exit code 2).
- **Banned hedge phrase in a wontfix reason.** Pre-validation gate aborts the batch with the per-phrase rejection message naming WHICH phrase matched. Fix the reason and re-run.
- **Workplan drift between propose and apply.** Per-row drift error; the row's `apply_error` records the discrepancy. The run continues for other rows. Operator re-runs propose to refresh.
- **Output path already exists for propose.** Propose refuses to overwrite an existing file. Pass `--force`, pass a different `--output` path, or move the existing file aside.

## Why two verbs

Separating `propose` from `apply` means the proposal file is a durable artifact. Adopters can:

- Inspect what the agent proposed before approving (no surprise mutations).
- Edit the disposition on a row before approving (override the agent's choice).
- Hand-craft a proposal file from scratch and run `apply` against it.
- Version-control proposal files alongside the project's `.dw-lifecycle/` config.

The JSON file IS the protocol. The skill is a thin shell around it.

## Why the substantive-reason validator exists

The project rule `Just for now is bullshit` (in `.claude/rules/agent-discipline.md`) names a class of failures where a deferral is dressed up as discipline — `for now`, `next pass`, `will fix later`, `TBD` — and the hedge becomes the canonical disposition because nothing else tracks the work. The validator refuses those phrases mechanically so a wontfix reason has to constitute an actual explanation. The `≥40 character` minimum forces enough text to be a real sentence rather than a one-word dismissal.

If the operator's reason is genuinely "this conflicts with constraint X and re-opening would require a Y-scale redesign," that sentence passes. If it's "fix it next sprint," it fails — and the agent has to either write a real explanation OR file an issue via `promote-to-issue`.
