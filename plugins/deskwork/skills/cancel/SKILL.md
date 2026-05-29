---
name: cancel
description: "Move an entry to Cancelled (intent: abandoned; resumable but rare). Universal verb — operates on every entry shape, including group entries. Use --cascade on a group to propagate the cancellation to its members."
---

## Cancel

Mark an entry as Cancelled — formally abandoned. Like Blocked but signals intent.

### Input

```
/deskwork:cancel <slug>
/deskwork:cancel <slug> --reason "<reason>"
/deskwork:cancel <slug> --cascade                 — group: also cancel every member
/deskwork:cancel <slug> --reason "<reason>" --cascade
```

### Steps

1. Resolve `<slug>` → entry uuid via `.deskwork/entries/`.
2. Run `deskwork cancel <uuid> [--reason "<reason>"] [--cascade]` (the underlying CLI helper). Cancel is now an atomic operation that:
   - Validates currentStage is a linear-pipeline stage (not Published / Blocked / Cancelled).
   - Updates the sidecar (`currentStage` → `Cancelled`; `priorStage` set to the previous stage so a later `/deskwork:induct` can restore the entry if the operator reverses the cancellation).
   - Appends a `stage-transition` journal event (with `reason` when supplied).
   - When `--cascade` is passed AND the entry's `members[]` is non-empty: walks each member and cancels it too (members already off-pipeline are SKIPPED rather than refused, so a partially-cancelled group still cancels cleanly).
   - Regenerates `calendar.md`.
3. Run `deskwork doctor` to validate.

### Defaults

- **No `--cascade` (default behaviour).** Per the universal-verb-no-cascade rule (DESKWORK-STATE-MACHINE.md Commandment II), cancel does NOT propagate to members. On a group entry the group's own stage flips to Cancelled and the members are untouched. This matches the Approve behaviour — approve on a group does NOT propagate either.
- **`--cascade` is a no-op on non-group entries** (entries without a `members[]` array, or with an empty array). The flag's signal is "if this entry has members, cancel them too"; safe to pass against any entry.

### Error handling

- **Already Cancelled.** CLI refuses with `Cannot cancel: entry is already Cancelled.`
- **Currently Blocked.** CLI refuses with `Cannot cancel: entry is already Blocked.` Suggest running `/deskwork:induct` first to return the entry to its prior pipeline stage, then `/deskwork:cancel`.
- **Currently Published.** CLI refuses with `Cannot cancel: Published is terminal.`
- **`--cascade` against a member that's already Cancelled / Blocked / terminal.** The cascade does NOT abort; the member is SKIPPED and surfaces in the result's `skippedMembers[]` so the operator can audit what was passed over. Members that fail to resolve (dangling member UUID per doctor's `group-member-missing`) are also reported as skipped with a `read failed:` reason.

### Safety rules

- **Cancel is irreversible-by-default but recoverable via `/deskwork:induct`.** Cancel records `priorStage` on the sidecar so a later `induct` can return the entry to its previous linear stage. The cascade does NOT record per-member `cascadeFrom` linkage today; restoring a cascade requires re-inducting each member individually.
- **`--cascade` does not enforce recursion checks.** A group whose member is itself a group is rejected by doctor's `group-recursive` rule (Phase 7 Task 7.5.1) at audit time; the CLI deliberately does NOT enforce recursion at cancel time. If a recursive group somehow exists on disk, the cascade walks transitively — every nested group + every nested member is cancelled.
