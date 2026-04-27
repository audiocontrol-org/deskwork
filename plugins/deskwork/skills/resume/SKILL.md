---
name: resume
description: Restore a Paused calendar entry to whichever non-terminal stage it was in before pausing. Reads pausedFrom (recorded by /deskwork:pause) so the entry returns to the right place automatically.
---

## Resume

Move a `Paused` calendar entry back to its prior stage. The helper reads the `pausedFrom` value (set by `/deskwork:pause`) and flips the entry back. The operator doesn't have to remember where it was.

### Input

The user provides the slug to resume. Examples:

- `/deskwork:resume draft-half-finished`
- `/deskwork:resume --site editorialcontrol stuck-on-reference`

### Steps

1. Resolve `--site` (or default).
2. Invoke the helper:

   ```
   deskwork resume [--site <slug>] <slug>
   ```

   The helper:
   - Verifies the entry exists and is in `Paused`
   - Reads `pausedFrom` and restores the entry to that stage
   - Clears `pausedFrom`

3. Report: slug, site, restored stage, and a brief reminder of what happens at that stage (e.g. "Outlining — `/deskwork:outline` to continue").

### Error handling

- **Entry not Paused** — refuse with the entry's current stage. Don't try to "resume" something that's not paused.
- **`pausedFrom` missing on a Paused entry** — refuse. This means a hand-edit set the stage to `Paused` without recording where it came from. The operator must move the entry to the right stage manually (edit the calendar table) since the system can't guess the right destination.
- **Unknown slug** — list Paused entries so the operator can recognize a typo.
