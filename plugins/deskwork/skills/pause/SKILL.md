---
name: pause
description: Move a non-terminal calendar entry (Ideas / Planned / Outlining / Drafting / Review) into the Paused holding stage. Records where it came from so resume puts it back. Use when an entry stops being actively worked but isn't dead.
---

## Pause

Move a calendar entry into the `Paused` holding stage. Use when an entry has stalled, is blocked on an external dependency, or has been set aside without being killed. The prior stage is recorded on the entry as `pausedFrom` so `/deskwork:resume` restores the entry to where it was.

`Paused` is non-terminal. `Published` entries can't be paused (they're already shipped); already-Paused entries can't be re-paused (would erase the original `pausedFrom`).

### Input

The user provides the slug to pause. Examples:

- `/deskwork:pause draft-half-finished`
- `/deskwork:pause --site editorialcontrol stuck-on-reference`

### Steps

1. Resolve `--site` (or default).
2. Invoke the helper:

   ```
   deskwork pause [--site <slug>] <slug>
   ```

   The helper:
   - Verifies the entry exists and is in a non-terminal stage
   - Records `pausedFrom = <prior stage>` on the entry
   - Flips the entry to `Paused`

3. Report: slug, site, prior stage (now stored as `pausedFrom`), and a reminder that `/deskwork:resume <slug>` returns it.

### Error handling

- **Entry already Paused** — refuse. Don't double-pause; the original `pausedFrom` would be lost. If the operator wants to change the resume target, they can edit the calendar by hand or resume + re-pause.
- **Entry is Published** — refuse. Published is terminal; pausing a shipped post would lie about its state. If the operator wants to mark a published post as "needs revision", that's a different workflow (re-review).
- **Unknown slug** — list pausable entries (anything not Published / Paused) so the operator can recognize a typo.
