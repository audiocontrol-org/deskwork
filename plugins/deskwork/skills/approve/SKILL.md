---
name: approve
description: Graduate an entry to the next pipeline stage. The operator's `/deskwork:approve <slug>` invocation IS the approval — the studio's Approve button is a clipboard-copy of this slash command per THESIS Consequence 2.
---

## Approve

Graduate an entry from its current pipeline stage to the next. Approve IS the act of advancing — there is no "approve but stay."

The operator's `/deskwork:approve <slug>` invocation IS the approval. Per THESIS Consequence 2, the studio's Approve button is a clipboard-copy of this slash command — the studio does NOT mutate sidecar state; the skill does. There is therefore no "click Approve in the studio first" pre-step on the sidecar; the command's invocation is the click's downstream effect.

### Input

```
/deskwork:approve <slug>
```

### Steps

1. Resolve `<slug>` → entry uuid via `.deskwork/entries/`.
2. Read `.deskwork/entries/<uuid>.json` into sidecar.
3. Validate stage gate:
   - sidecar.currentStage in [Ideas, Planned, Outlining, Drafting]. If Final: refuse: "use /deskwork:publish for Final → Published." If Blocked/Cancelled: refuse with state-specific message. If Published: refuse: "Published entries are frozen."
4. Compute nextStage from this map:
   - Ideas → Planned
   - Planned → Outlining
   - Outlining → Drafting
   - Drafting → Final
5. Run `deskwork approve <uuid>` (the underlying CLI helper). Approve is now an atomic operation that:
   - Snapshots `<dir>/index.md` → `<dir>/scrapbook/<priorStage>.md` (lowercased) before any other mutation, so a kill-power between snapshot and sidecar-write leaves the snapshot durable on disk. (Skipped when `index.md` doesn't exist — common at Ideas where only `idea.md` exists.) Refused when a prior snapshot exists with conflicting content; resolve manually then re-run.
   - Archives every active `comment` annotation as a fold-only `archive-comment` event — the prior-stage comments are preserved in the audit trail (`listEntryAnnotationsRaw`) but no longer render in the active marginalia sidebar after the transition. The first iterate at the new stage starts with a clean slate; comments authored against the snapshotted content cannot reliably rebase across the document evolution that the next stage will produce.
   - Updates the sidecar (currentStage advances; reviewState clears; updatedAt refreshes).
   - Appends a `stage-transition` journal event.
   - Regenerates `calendar.md`.
6. Run `deskwork doctor` to validate. If doctor fails, surface failures to operator and refuse to commit.

### What approve does NOT do

`index.md` is left unchanged on approve. The first `/deskwork:iterate` at the new stage is responsible for transforming `index.md` into the new stage's artifact (e.g. outline → draft body, plan → outline). Approve preserves the prior stage's content in `scrapbook/<priorStage>.md` so the iterate at the new stage has it as reference; it does NOT scaffold a fresh artifact.

### Error handling

- **Currently Final.** Refuse: "use /deskwork:publish for Final → Published."
- **Currently Blocked/Cancelled.** Refuse: "entry is <stage>; use /deskwork:induct to bring it back first."
- **Currently Published.** Refuse: "Published entries are frozen; future fork-on-edit model is deferred."
- **Conflicting prior snapshot.** Refuse with the snapshot path. The fix path is operator resolution (they likely hand-edited a prior snapshot). Decide which copy to keep, leave it under `scrapbook/<priorStage>.md`, then re-run approve.
