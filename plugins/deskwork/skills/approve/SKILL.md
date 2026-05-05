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
5. Build the next stage's primary artifact path:
   - Planned: `<contentDir>/<slug>/scrapbook/plan.md`
   - Outlining: `<contentDir>/<slug>/scrapbook/outline.md`
   - Drafting: `<contentDir>/<slug>/index.md`
   - Final: same path as Drafting (no new file)
6. If the next-stage artifact does not exist, scaffold it via Write tool:

```
---
title: <sidecar.title>
deskwork:
  id: <sidecar.uuid>
  stage: <nextStage>
  iteration: 0
---

# <sidecar.title>

(seed from prior stage's content if appropriate; else blank)
```

   - For Planned/Outlining/Drafting: seed from prior stage's artifact content as a starting point (per S1 in the design spec).
   - For Final (no new file): skip this step.

7. Update the sidecar via Edit tool:
   - currentStage: <nextStage>
   - iterationByStage[<nextStage>]: preserve if already set (re-induction case), else 0
   - reviewState: undefined (delete the field)
   - priorStage: undefined (delete; not blocked/cancelled)
   - updatedAt: <ISO 8601 now>

8. Append journal event by writing `.deskwork/review-journal/history/<timestamp>-<random>.json`:

```
{
  "kind": "stage-transition",
  "at": "<ISO 8601 now>",
  "entryId": "<uuid>",
  "from": "<priorStage>",
  "to": "<nextStage>"
}
```

9. Run `deskwork doctor` to validate. If doctor fails, surface failures to operator and refuse to commit.

### Error handling

- **Currently Final.** Refuse: "use /deskwork:publish for Final → Published."
- **Currently Blocked/Cancelled.** Refuse: "entry is <stage>; use /deskwork:induct to bring it back first."
- **Currently Published.** Refuse: "Published entries are frozen; future fork-on-edit model is deferred."
