---
name: approve
description: Terminal write step for the review loop. Transitions an `approved` workflow to `applied`. For longform, disk is already the approved content (SSOT) — the helper just finalizes. For shortform, the approved markdown body is read from the on-disk scrapbook file and written into the calendar's `DistributionRecord.shortform` field.
---

## Approve

Finalize an approved review workflow.

### Prerequisite

The workflow must be in state `approved`. The operator clicks Approve in the studio to move from `in-review` → `approved`. That records both the state and an approve annotation pinning which version was approved.

### Input

```
/deskwork:approve <slug>                                            # longform
/deskwork:approve --site <s> <slug>
/deskwork:approve <slug> --platform reddit --channel rprogramming   # shortform
```

### Longform behavior

Disk already has the approved content. The helper:
- Verifies `approvedVersion === workflow.currentVersion` (if disk moved on since the approve click, it refuses)
- Transitions the workflow to `applied`
- Does NOT modify disk — the file is already correct

If disk has moved on, the operator must either re-click Approve on the new current version or iterate back to the approved version.

### Shortform behavior

Shortform is now disk-backed: the body lives in `<contentDir>/<slug>/scrapbook/shortform/<platform>[-<channel>].md` (the same file the studio's review surface saves into when the operator clicks Save / Iterate / Approve). On approve, the helper:

- Reads the body content from that on-disk file (the source of truth)
- Writes the body into the matching `DistributionRecord.shortform` field on the calendar entry, preserving cross-tool readability of the calendar's `## Shortform Copy` section
- Transitions the workflow to `applied`

Requires `--platform` and optionally `--channel` so the helper can locate the right file and the right distribution record.

### Steps

1. Resolve `--site`.
2. Pass `--platform` / `--channel` iff the workflow is shortform.
3. Invoke the helper:

```
deskwork approve [--site <slug>] <slug> \
                    [--platform <p>] [--channel <c>]
```

4. For longform, suggest the user run `git diff <file>` and commit. For shortform, suggest committing the calendar diff plus the scrapbook file.

### Error handling

- **Workflow not in `approved`** — helper refuses. Operator clicks Approve in the studio first.
- **Disk moved on** — helper refuses with the two paths forward. Do NOT bypass.
- **Missing scrapbook file (shortform)** — helper refuses. The shortform workflow should have been started via `/deskwork:shortform-start`, which scaffolds the file.
- **Missing distribution record (shortform)** — helper creates or updates the matching `DistributionRecord` when writing the approved body. If the entry is not yet `Published`, the helper refuses with a clear message — run `/deskwork:publish <slug>` first.
