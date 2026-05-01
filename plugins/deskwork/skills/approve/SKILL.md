---
name: approve
description: Graduate an entry to the next pipeline stage; finalizes the operator's approval click in the studio
---

## Approve

Graduate an entry from its current pipeline stage to the next. Approve IS the act of advancing — there is no "approve but stay."

### Prerequisite

The entry's sidecar must have `reviewState: "approved"` (set by the operator clicking Approve in the studio).

### Input

```
/deskwork:approve <slug>
```

### Steps

1. Resolve `<slug>` → entry uuid via `.deskwork/entries/`.
2. Read `.deskwork/entries/<uuid>.json` into sidecar.
3. Validate gates:
   - sidecar.reviewState === "approved". If not, refuse: "click Approve in the studio first."
   - sidecar.currentStage in [Ideas, Planned, Outlining, Drafting]. If Final: refuse: "use /deskwork:publish for Final → Published." If Blocked/Cancelled: refuse with state-specific message.
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

- **reviewState not approved.** Refuse: "click Approve in the studio first; sidecar.reviewState=<actual>."
- **Currently Final.** Refuse: "use /deskwork:publish for Final → Published."
- **Currently Blocked/Cancelled.** Refuse: "entry is <stage>; use /deskwork:induct to bring it back first."
- **Currently Published.** Refuse: "Published entries are frozen; future fork-on-edit model is deferred."
