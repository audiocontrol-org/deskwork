---
name: cancel
description: Move an entry to Cancelled (intent: abandoned; resumable but rare)
---

## Cancel

Mark an entry as Cancelled — formally abandoned. Like Blocked but signals intent.

### Input

```
/deskwork:cancel <slug>
/deskwork:cancel <slug> --reason "<reason>"
```

### Steps

1. Resolve `<slug>` → entry uuid via `.deskwork/entries/`.
2. Run `deskwork cancel <uuid> [--reason "<reason>"]` (the underlying CLI helper). Cancel is now an atomic operation that:
   - Validates currentStage is a linear-pipeline stage (not Published / Blocked / Cancelled).
   - Updates the sidecar (`currentStage` → `Cancelled`; `priorStage` set to the previous stage so a later `/deskwork:induct` can restore the entry if the operator reverses the cancellation).
   - Appends a `stage-transition` journal event (with `reason` when supplied).
   - Regenerates `calendar.md`.
3. Run `deskwork doctor` to validate.

### Error handling

- **Already Cancelled.** CLI refuses with `Cannot cancel: entry is already Cancelled.`
- **Currently Blocked.** CLI refuses with `Cannot cancel: entry is already Blocked.` Suggest running `/deskwork:induct` first to return the entry to its prior pipeline stage, then `/deskwork:cancel`.
- **Currently Published.** CLI refuses with `Cannot cancel: Published is terminal.`
