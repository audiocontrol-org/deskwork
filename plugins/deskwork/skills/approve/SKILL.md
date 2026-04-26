---
name: approve
description: Terminal write step for the review loop. Transitions an `approved` workflow to `applied`. For longform, disk is already the approved content (SSOT) — the helper just finalizes. For shortform, the approved markdown is written into the calendar's distribution record.
---

## Approve

Finalize an approved review workflow.

### Prerequisite

The workflow must be in state `approved`. The operator clicks Approve in the studio to move from `in-review` → `approved`. That records both the state and an approve annotation pinning which version was approved.

### Input

```
/deskwork:approve <slug>                                            # longform
/deskwork:approve --site <s> <slug>
/deskwork:approve <slug> --platform reddit --channel r/foo          # shortform
```

### Longform behavior

Disk already has the approved content. The helper:
- Verifies `approvedVersion === workflow.currentVersion` (if disk moved on since the approve click, it refuses)
- Transitions the workflow to `applied`
- Does NOT modify disk — the file is already correct

If disk has moved on, the operator must either re-click Approve on the new current version or iterate back to the approved version.

### Shortform behavior

There is no per-post file for shortform. The approved markdown gets written into the matching `DistributionRecord.shortform` field in the calendar. Requires `--platform` and optionally `--channel`.

### Steps

1. Resolve `--site`.
2. Pass `--platform` / `--channel` iff the workflow is shortform.
3. Invoke the helper:

```
deskwork approve [--site <slug>] <slug> \
                    [--platform <p>] [--channel <c>]
```

4. For longform, suggest the user run `git diff <file>` and commit. For shortform, suggest committing the calendar diff.

### Error handling

- **Workflow not in `approved`** — helper refuses. Operator clicks Approve in the studio first.
- **Disk moved on** — helper refuses with the two paths forward. Do NOT bypass.
- **Missing distribution record (shortform)** — helper refuses. Operator creates the record via `/deskwork:distribute` first.
