---
name: group
description: "CRUD on group entries — list, show, create, update, add-member, remove-member, archive, restore. A group is an entry with the `members` field PRESENT (an empty array marks a group declared and awaiting its first add-member; absent means regular entry). Multi-group membership and cross-lane membership are both supported. Cancel uses the universal /deskwork:cancel verb (with --cascade for member propagation)."
---

## Group — manage group entries

A **group** is an entry whose `members` field is PRESENT on the sidecar. An empty `members: []` is the canonical "group declared, awaiting members" state — `group create` writes that shape so the new group is visible to `group list` / `group show` immediately, before the first `add-member` runs. An entry without a `members` field is a regular (non-group) entry; group-only verbs (`show`, `update`, `add-member`, `remove-member`, `archive`, `restore`) refuse against it. Per Phase 7 Task 7.1.2 there is no separate Group entity — same schema, same code paths, plus the `members` field. Group entries live alongside regular entries under `.deskwork/entries/<uuid>.json`; the dashboard, doctor, and review surfaces all treat them as entries with the extra members affordance.

The `group` verb is a CRUD family for the group-specific lifecycle (creation, member edits, archive). Stage transitions on the group itself (approve / iterate / publish / block) use the same universal verbs as regular entries. Cancel uses the universal `/deskwork:cancel`; its `--cascade` flag is the opt-in member-cancel propagation per Step 7.2.6.

### Subcommands

| Verb | Purpose |
|---|---|
| `list` | enumerate groups (active by default; pass `--include-archived` for the full set) |
| `show <slug>` | print a group's metadata + members (with per-member slug / lane / stage) |
| `create <slug>` | write a new group entry into a lane |
| `update <slug>` | mutate the group's `title` |
| `add-member <group> <member>` | append (or insert at `--at <index>`) a member UUID |
| `remove-member <group> <member>` | remove the member from the group's `members[]` |
| `archive <slug>` | soft-archive a group (sets `archivedAt`; preserves history) |
| `restore <slug>` | clear `archivedAt` |

### Input

```
/deskwork:group list [--include-archived]
/deskwork:group show <slug-or-uuid>
/deskwork:group create <slug> --lane <lane-id> [--artifact-path <path>] [--title <text>]
/deskwork:group update <slug-or-uuid> [--title <text>]
/deskwork:group add-member <group-slug-or-uuid> <member-slug-or-uuid> [--at <index>]
/deskwork:group remove-member <group-slug-or-uuid> <member-slug-or-uuid>
/deskwork:group archive <slug-or-uuid>
/deskwork:group restore <slug-or-uuid>
/deskwork:cancel <slug>                          — cancel just the group (universal verb)
/deskwork:cancel <slug> --cascade                — cancel the group AND every member
```

### Steps

1. Resolve the operator-supplied slug or UUID via `resolveEntryUuid`.
2. Run the matching subcommand via `deskwork group <verb> [args...]`:
   - **`list`** walks every sidecar via `readAllSidecars` and filters to entries with the `members` field PRESENT (including empty-array declared groups — see the header for the empty-vs-absent semantic). Active groups only by default; `--include-archived` appends groups carrying a non-empty `archivedAt`. Each row emits uuid / slug / title / lane / currentStage / memberCount / archived / archivedAt; newly-created groups appear with `memberCount: 0`.
   - **`show <slug>`** loads the group entry plus each member's sidecar, enriching every member row with the member's own slug / title / lane / currentStage / archived state. Members whose UUID does not resolve are reported with `missing: true` rather than aborting — doctor's `group-member-missing` rule (Task 7.5.2) handles the repair.
   - **`create <slug> --lane <lane-id>`** writes a new group sidecar at `.deskwork/entries/<uuid>.json` with `members: []` (the empty-array form is the operator-intent marker per Task 7.5.5 — "this is a group awaiting members"). Defaults `--title <text>` to the slug when omitted; `--artifact-path <path>` is optional and binds an editable content body (e.g. `manifesto.md`) the group can iterate on. The group's `currentStage` initializes to the lane template's first `linearStages` entry. Refuses when the lane id doesn't resolve, when the lane is archived, when the slug collides with an existing entry, or when the template has no `linearStages` defined.
   - **`update <slug>`** mutates the group's `title` in place. At least one patch flag is required (the only mutable field today is `--title`). Works against both populated and declared-empty groups; refuses against entries without the `members` field at all (regular entries). Slug rename uses the existing rename-slug flow; lane move uses `/deskwork:lane move`; uuid is immutable; `members[]` is owned by `add-member` / `remove-member`.
   - **`add-member <group-slug> <member-slug> [--at <index>]`** resolves the member slug to its UUID, then appends (default) or inserts at the 0-based `--at <index>` (`0 <= index <= members.length` — `members.length` is the append position). The same entry UUID CAN be in multiple groups simultaneously (Step 7.2.4 multi-group membership). Members may span lanes (Step 7.2.5 cross-lane membership) — the verb does NOT check that the member's `lane` matches the group's `lane`. Refuses on self-membership (the group's own UUID), duplicate-within-group, missing member, or out-of-range index.
   - **`remove-member <group-slug> <member-slug>`** removes the member UUID from the group's `members[]`. Refuses if the member is not present (silent no-op would hide operator typos per CLI-discipline). Removing from one group does NOT affect the same entry's membership in any other group.
   - **`archive <slug>`** sets `archivedAt` on the group entry to the current ISO datetime. The group disappears from default `group list` output and is skipped by the dashboard / studio renderers. The group's `currentStage` is untouched — archive is a listing-affordance soft-hide, not a stage transition. Members are NOT archived.
   - **`restore <slug>`** removes `archivedAt`. The group reappears in `list` output and is rendered again.
3. Run `deskwork doctor` to validate (catches recursive groups, dangling member UUIDs, and groups with all-cancelled members — see Task 7.5 rules).

### Defaults

- `group list` excludes archived groups by default. Pass `--include-archived` for the full set.
- `group create --title <text>` defaults to the slug when omitted.
- `group create` initializes `members: []` (NOT `members: undefined`) — the empty array carries the operator-intent signal that distinguishes "intentionally a group, awaiting members" from "regular entry that happens to have no members." Doctor's `group-empty-members-array` informational rule (Task 7.5.5) surfaces this dual representation for operators who want to normalize.
- `group add-member` appends to `members[]` when `--at` is omitted (insertion at `members.length`).
- `group cancel` uses the universal `/deskwork:cancel` verb. Pass `--cascade` to propagate the cancellation to every member; default behaviour cancels only the group.

### Error handling

Two refusal-message families fire when a group-only verb is invoked against a non-group entry (one without a `members` field on the sidecar). The two families are distinct on purpose — the catalog below preserves each verb's literal text so an adopter grepping the message finds the right code path:

- **`show` / `update`** emit `entry is not a group (no \`members\` field on the sidecar)...` — these are the read / metadata-mutation verbs.
- **`add-member` / `remove-member` / `archive` / `restore`** emit `entry has no \`members\` field...` — these are the member-mutation and listing-affordance verbs.

A `members: []` entry IS a group (the declared-empty marker per Task 7.5.5) and passes the non-group check for every verb above; only entries without the `members` field at all are refused.

- **`list` / `show` on a project with no sidecars.** `list` emits `{ groups: [] }`; `show <slug>` refuses with the slug-not-found error from `resolveEntryUuid`.
- **`show <slug>` against a non-group entry.** Refused with `Cannot show group "<slug>": entry is not a group (no \`members\` field on the sidecar). Group-only verbs require the \`members\` field to be present; regular entries should be read via the universal entry paths.` Pointer: use the universal entry read paths for non-group entries.
- **`create <slug>` with an unknown lane.** Refused with the loader's underlying `Lane config "<id>" not found at <path>` error. Pointer: list existing lanes with `deskwork lane list`.
- **`create <slug>` into an archived lane.** Refused with `Cannot create group "<slug>" in archived lane "<id>". Restore the lane first via "deskwork lane restore <id>".`
- **`create <slug>` with a colliding slug.** Refused with `Cannot create group "<slug>": slug collision with entry <uuid> (currentStage="..."). Pick a different slug.`
- **`create <slug>` against a template with no linearStages.** Refused with the configuration-error message naming the template id; repair the template before creating a group.
- **`update <slug>` with no patch flags.** Refused with `Cannot update group "<slug>": no patch fields supplied. Pass --title <text>.`
- **`update <slug>` against a non-group entry.** Refused with `Cannot update group "<slug>": entry is not a group (no \`members\` field on the sidecar). Group-only verbs require the \`members\` field to be present; regular entries should be mutated via the universal entry verbs.` Same `entry is not a group` family as `show` (see family note above).
- **`add-member <group> <member>` with the member already in the group.** Refused with `member "<slug>" (UUID <uuid>) is already in this group. Duplicates within a single group are refused; the same entry CAN be a member of multiple groups simultaneously (Step 7.2.4).`
- **`add-member <group> <group>` (self-membership).** Refused with `refused self-membership. A group cannot contain itself as a member (1-element cycle).`
- **`add-member <group> <member> --at <i>` with `i` out of range.** Refused with `--at <i> is out of range. Valid range: 0..<members.length> (inclusive; <members.length> is the append position).`
- **`add-member <group> <member> --at <not-an-integer>`.** Refused with `Invalid --at value "<value>": must be a non-negative integer (0-based insertion index).`
- **`add-member` against a non-group entry.** Refused with `Cannot add member to "<slug>": entry has no \`members\` field.` Pointer: `deskwork group create <slug> --lane <lane>` first. (`entry has no \`members\` field` family — see family note above.)
- **`remove-member <group> <member>` with the member not present.** Refused with `member "<slug>" (UUID <uuid>) is not in this group's \`members[]\`. Current members: <list>.`
- **`remove-member` against a non-group entry.** Refused with `Cannot remove member from "<slug>": entry has no \`members\` field.` (`entry has no \`members\` field` family.)
- **`archive <slug>` against a non-group entry.** Refused with `Cannot archive group "<slug>": entry has no \`members\` field.` (`entry has no \`members\` field` family.)
- **`archive <slug>` against a group already archived.** Refused with `already archived (archivedAt=<timestamp>).`
- **`restore <slug>` against a non-group entry.** Refused with `Cannot restore group "<slug>": entry has no \`members\` field.` (`entry has no \`members\` field` family.)
- **`restore <slug>` against a group not archived.** Refused with `not archived (no archivedAt field).`

### Safety rules

- **The `members[]` field is the only schema delta for groups.** Phase 7 Task 7.1 shipped the schema; this task adds the CRUD verbs that operate on it. Nothing in `group <verb>` requires a new field — `currentStage`, `lane`, `artifactPath`, `archivedAt`, etc. are all pre-existing Entry fields.
- **Cancel propagation is opt-in via `--cascade` on `/deskwork:cancel`.** Per DESKWORK-STATE-MACHINE.md Commandment II + the universal-verb rule, cancel on a group does NOT propagate by default. The `--cascade` flag is the operator's opt-in signal; the cascade walks `members[]` and cancels each (skipping members already off-pipeline). Approve does NOT have a `--cascade` equivalent — group approve always operates on the group only.
- **Multi-group membership is supported.** The same entry UUID can appear in multiple groups' `members[]` arrays simultaneously. Removing the member from one group does NOT affect its membership in any other group. The studio surfaces (Task 7.3) render a "Member of: <group-1>, <group-2>" badge listing every parent.
- **Cross-lane membership is supported.** A group in lane A can contain members in lane A, lane B, the default lane — any combination. The `add-member` verb does NOT enforce a same-lane check. Studio's Phase 5 multi-lane composed-view (Task 7.4) renders members in their own lane's columns.
- **Recursive groups are out of scope for v1.** A group whose member is itself a group is rejected by doctor's `group-recursive` rule (Phase 7 Task 7.5.1) at audit time. The CLI deliberately does NOT enforce recursion at write time per the task scope — the doctor rule is the authoritative check.
- **Archive is the preferred disposition for retired groups**, not cancel. Per the project's content-management-databases-preserve rule, archive hides the group from active surfaces while preserving its history (sidecar, journal, member array). Cancel records terminal abandonment intent; archive records visibility intent. They compose — an archived group can also be cancelled, and vice versa.
- **A group with no editable artifact is "metadata-only."** When `artifactPath` is absent, `/deskwork:iterate` refuses with the metadata-only message (per Task 7.7.2). To iterate on a group, create it with `--artifact-path <path>` so the group has a content body to address comments on.
