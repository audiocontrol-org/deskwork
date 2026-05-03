---
name: induct
description: Teleport an entry to an operator-chosen stage (works from Blocked, Cancelled, or any pipeline stage)
---

## Induct

Move an entry to a chosen stage. Universal teleport — works from Blocked, Cancelled, Final (revoke Final-status), or any pipeline stage to go backwards.

### Input

```
/deskwork:induct <slug> --to <Stage>
/deskwork:induct <slug>           # uses default destination
```

Defaults:
- From Blocked: <priorStage>
- From Cancelled: <priorStage>
- From Final: Drafting (one stage back)
- From any pipeline stage: refuse without --to (induction backwards is intentional; require explicit target)

### Steps

1. Resolve `<slug>` → uuid.
2. Read sidecar.
3. Determine target stage:
   - If `--to <stage>` given, use it.
   - Else apply defaults above.
4. Validate target is a pipeline stage (cannot induct to Blocked/Cancelled directly — use /deskwork:block or /deskwork:cancel).
5. Update sidecar:
   - currentStage: <target>
   - priorStage: undefined (clears Blocked/Cancelled stash)
   - reviewState: undefined
   - iterationByStage[<target>]: preserve if present (operator picks up where they left off)
   - updatedAt: <now>
6. Append journal event: { kind: "stage-transition", from: <prior>, to: <target> }.
7. Run `deskwork doctor` to validate.

### Error handling

- **Target stage is Blocked or Cancelled.** Refuse: "use /deskwork:block or /deskwork:cancel to set those states."
- **Target stage is Published.** Refuse: "use /deskwork:publish for the Final → Published transition; Published items are frozen."
- **From a pipeline stage without --to.** Refuse: "going backwards in pipeline is intentional; pass --to <stage>."
