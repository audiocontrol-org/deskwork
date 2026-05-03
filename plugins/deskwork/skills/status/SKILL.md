---
name: status
description: Per-entry summary (currentStage, iteration counts, reviewState) — successor to review-help
---

## Status

Show the state of a single entry, or all active entries.

### Input

```
/deskwork:status                # all active entries (non-Published, non-Cancelled)
/deskwork:status <slug>         # specific entry
/deskwork:status --all          # every entry, all stages
```

### Steps

1. Resolve project root.
2. Read all sidecars from `.deskwork/entries/*.json`.
3. Filter:
   - Default: entries with currentStage NOT in [Published, Cancelled]
   - --all: no filter
   - <slug>: single entry
4. For each entry, format:

```
<slug>  [<currentStage>]  iteration: <iterationByStage[currentStage]>  reviewState: <reviewState or "—">
   updated: <updatedAt>
```

5. If `--json` flag, output structured JSON instead.

### Error handling

- **Slug not found.** Surface error.
