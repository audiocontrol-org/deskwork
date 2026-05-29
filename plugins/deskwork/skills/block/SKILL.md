---
name: block
description: Move an entry to Blocked (out of pipeline; resumable)
---

## Block

Set an entry to Blocked. Entry leaves the active pipeline; can be resumed via /deskwork:induct.

### Input

```
/deskwork:block <slug>
/deskwork:block <slug> --reason "<reason>"
```

### Steps

1. Resolve `<slug>` → entry uuid via `.deskwork/entries/`.
2. Run `deskwork block <uuid> [--reason "<reason>"]` (the underlying CLI helper). Block is now an atomic operation that:
   - Validates currentStage is a linear-pipeline stage (not Published / Blocked / Cancelled).
   - Updates the sidecar (`currentStage` → `Blocked`; `priorStage` set to the previous stage so a later `/deskwork:induct` can restore the entry without operator input).
   - Appends a `stage-transition` journal event (with `reason` when supplied).
   - Regenerates `calendar.md` to stay in sync.
3. Run `deskwork doctor` to validate. If doctor fails, surface failures to operator.

### Error handling

- **Already Blocked or Cancelled.** CLI refuses with `Cannot block: entry is already <stage>`.
- **Currently Published.** CLI refuses with `Cannot block: Published is terminal.` (Published entries are frozen; the post-1.0 fork-on-edit model is deferred.)
