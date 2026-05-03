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

1. Resolve `<slug>` → uuid.
2. Read sidecar.
3. Validate: currentStage must be a pipeline stage (Ideas/Planned/Outlining/Drafting/Final/Published). If already Blocked or Cancelled, refuse.
4. Update sidecar:
   - priorStage: <currentStage>
   - currentStage: "Blocked"
   - reviewState: undefined
   - updatedAt: <now>
5. Append journal event: { kind: "stage-transition", from: <prior>, to: "Blocked", reason: <reason if given> }.
6. Run `deskwork doctor` to validate.

### Error handling

- **Already Blocked or Cancelled.** Refuse with the entry's current state.
