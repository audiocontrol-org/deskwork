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

1. Resolve `<slug>` → entry uuid via `.deskwork/entries/`.
2. Run `deskwork induct <uuid> [--to <Stage>] [--reason "<reason>"]` (the underlying CLI helper). Induct is now an atomic operation that:
   - Applies the default-stage logic when `--to` is omitted (Blocked/Cancelled → `priorStage`; Final → `Drafting`; any other pipeline stage → refuses without explicit `--to`, because backward induction must be intentional).
   - Validates the target is a linear-pipeline stage (refuses `--to Blocked` and `--to Cancelled`; use `/deskwork:block` or `/deskwork:cancel` for those).
   - Updates the sidecar (`currentStage` → target; clears `priorStage` when leaving an off-pipeline stage; preserves `priorStage` otherwise).
   - Appends a `stage-transition` journal event (with `reason` when supplied).
   - Regenerates `calendar.md`.
3. Run `deskwork doctor` to validate.

### Error handling

- **`--to` omitted on a linear-pipeline stage.** CLI refuses with `--to is required when inducting from a linear-pipeline stage`. Backward / sideways induction requires explicit operator intent.
- **`--to Blocked` or `--to Cancelled`.** CLI refuses with `Target must be a linear-pipeline stage`. Pointer: `deskwork block` / `deskwork cancel`.
- **`--to` matches current stage.** CLI refuses with `Cannot induct: entry is already at <stage>.`
- **No `priorStage` on Blocked/Cancelled entry.** CLI refuses with `Cannot induct ... without --to: ... no priorStage is recorded.` (Happens only for hand-edited sidecars; normal flow always records `priorStage` when transitioning to Blocked/Cancelled.)
