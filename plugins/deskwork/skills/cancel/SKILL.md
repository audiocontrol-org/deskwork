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

1. Resolve `<slug>` → uuid.
2. Read sidecar.
3. Validate: currentStage must be in pipeline; not already Cancelled.
4. Update sidecar:
   - priorStage: <currentStage>
   - currentStage: "Cancelled"
   - reviewState: undefined
   - updatedAt: <now>
5. Append journal event: { kind: "stage-transition", from: <prior>, to: "Cancelled", reason: <reason if given> }.
6. Run `deskwork doctor` to validate.

### Error handling

- **Already Cancelled.** Refuse: "entry is already Cancelled."
- **Currently Blocked.** Suggest /deskwork:induct first.
