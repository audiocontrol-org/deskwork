---
id: TASK-40
title: >-
  Phase 7: Groups — members field + CRUD + review surface + multi-lane
  composition
status: To Do
assignee: []
created_date: '2026-06-10 19:31'
labels:
  - 'type:imported-issue'
  - enhancement
dependencies: []
references:
  - gh-308
ordinal: 40000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Deliverable:** `/deskwork:group` skill family; group review surface with member panel (multi-lane composition); doctor rules for recursion + dangling members.

### Task 7.1: Schema delta — members[] on entry

- [ ] Step 7.1.1: Extend `EntrySidecar` schema with `members?: string[]` (array of member entry UUIDs).
- [ ] Step 7.1.2: Entries with non-empty `members[]` are groups; otherwise they're regular entries. No separate "group" entity — same schema, same code paths, plus the `members` field.
- [ ] Step 7.1.3: Optional `artifactPath` on group entries: when set, the group has a content body (e.g. `manifesto.md`); when absent, the group is metadata-only.

### Task 7.2: `/deskwork:group` skill family

- [ ] Step 7.2.1: Author SKILL.md at `plugins/deskwork/skills/group/SKILL.md` covering: `list`, `show <slug>`, `create <slug> --lane <lane-id> [--artifact-path <path>]`, `update <slug> [--title <text>]`, `add-member <group-slug> <member-slug>`, `remove-member <group-slug> <member-slug>`, `archive <slug>`. Cancel uses the universal `/deskwork:cancel`.
- [ ] Step 7.2.2: CLI implementation at `packages/cli/src/commands/group.ts`.
- [ ] Step 7.2.3: Member ordering: members are an ordered array; `add-member` appends by default; `--at <index>` inserts; studio drag-to-reorder updates the array.
- [ ] Step 7.2.4: Multi-group membership supported: an entry can be a member of multiple groups simultaneously.
- [ ] Step 7.2.5: Cross-lane membership: members may span lanes; no lane-binding constraint on `add-member`.
- [ ] Step 7.2.6: Cancel propagation: cancelling a group does NOT propagate to members by default (universal-verb rule); `--cascade` is supported opt-in per PRD § Group lifecycle edge cases.

### Task 7.3: Group review surface — Members section

- [ ] Step 7.3.1: When the entry's `members[]` is non-empty, the review surface renders an additional "Members" section.
- [ ] Step 7.3.2: Each member row shows: slug, title, lane (badge), current stage, clipboard-copy link to the member's review surface.
- [ ] Step 7.3.3: Member entries' own rows on the lane dashboard show a "Member of: <group slug>" badge with back-link.
- [ ] Step 7.3.4: When an entry is a member of multiple groups, the badge shows all parents.

### Task 7.4: Group multi-lane review composition

- [ ] Step 7.4.1: A group's review surface renders members in a coordinated multi-lane composition — one column per lane the group spans, members positioned in their lane's stage column, with the group's own stage above.
- [ ] Step 7.4.2: Reuse Phase 5's multi-lane composed-view machinery; scope it to one group's member set.
- [ ] Step 7.4.3: Empty `members[]` falls back to a single-column rendering of the group's own content body (or empty-state if no `artifactPath`).

### Task 7.5: Doctor rules — recursion + dangling members

- [ ] Step 7.5.1: `group-recursive` rule: a group has a member whose `members` array is non-empty → refuse (recursive groups out of scope per v1). Repair: prompts to flatten or unbind.
- [ ] Step 7.5.2: `group-member-missing` rule: a member UUID doesn't resolve. Repair: prompts to remove the dangling reference.
- [ ] Step 7.5.3: `group-all-members-cancelled` informational rule: every member is in `Cancelled`; surface for operator review (cancel the group, remove cancelled members, or leave as-is).
- [ ] Step 7.5.4: Doctor builds a UUID → lane index once per run for efficient member-lookup-across-lanes per PRD § Risks mitigation.

### Task 7.6: Studio group-management page

- [ ] Step 7.6.1: Server-render page at `/dev/groups/` listing every group with member count + lane badges.
- [ ] Step 7.6.2: Per-group surface: members editor with drag-to-reorder, add / remove member buttons (clipboard-copy `/deskwork:group add-member` / `remove-member`).
- [ ] Step 7.6.3: Lifecycle controls: archive / cancel actions clipboard-copy the relevant verb.

### Task 7.7: Iterate semantics on groups

- [ ] Step 7.7.1: Group with `artifactPath`: iterate addresses comments on that file (same as any entry).
- [ ] Step 7.7.2: Group without `artifactPath`: iterate refuses with "group has no editable artifact — iterate operates on the content body when present; otherwise this group is metadata-only."
- [ ] Step 7.7.3: Update `/deskwork:iterate` skill prose to enumerate the group case.

### Task 7.8: Integration tests

- [ ] Step 7.8.1: Tmp-fixture: create a group spanning 2 lanes (`mockups` + `feature-doc`); add 2 members from each lane; advance group through its own stages independently of members; verify members can be in different stages from group.
- [ ] Step 7.8.2: Approve on group does not propagate; cancel with `--cascade` does propagate; recursive-group attempt refused by doctor.

**Acceptance Criteria:**

- [ ] Groups have full lifecycle: create / add-member / remove-member / archive / cancel; cross-lane membership works.
- [ ] Group approve doesn't propagate to members by default; `--cascade` opt-in works.
- [ ] Recursive groups refused via `group-recursive` doctor rule; dangling members surfaced via `group-member-missing`.
- [ ] Group review surface renders multi-lane member composition; member entries show "Member of:" badges.

Part of #301.
<!-- SECTION:DESCRIPTION:END -->
