---
id: TASK-21
title: >-
  BUG: v0.16.0 doctor missing legacy-calendar-to-sidecars rule MIGRATING.md says
  it ships
status: To Do
assignee: []
created_date: '2026-06-10 19:00'
labels:
  - agent-found
  - 'type:bug'
dependencies: []
references:
  - gh-218
ordinal: 21000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Imported from https://github.com/audiocontrol-org/deskwork/issues/218

## Bug: v0.16.0's `doctor` is missing the `legacy-calendar-to-sidecars` rule that `MIGRATING.md` says it ships

### Symptom

Adopters upgrading from v0.10.x → v0.11.0+ (Phase 30 / entry-centric pipeline) are told by `MIGRATING.md` to run:

```bash
deskwork doctor --check          # dry-run
deskwork doctor --fix=all        # apply
```

…to convert their legacy `calendar.md` (table-based, single file per site) into per-entry sidecars at `.deskwork/entries/<uuid>.json` (the new source-of-truth).

In a fresh v0.16.0 install (marketplace), `deskwork doctor --check` against a project with a fully-populated legacy calendar reports zero migration-related findings. Output is the standard rule findings only — `missing-frontmatter-id`, `orphan-frontmatter-id`, etc.

`deskwork doctor --fix=all` therefore does not perform the v0.11.0 calendar→sidecar migration. The studio dashboard continues to show "0 on the calendar" because the studio reads from `.deskwork/entries/<uuid>.json` (per `packages/studio/src/pages/dashboard.ts`) and those sidecars don't exist.

### What's actually installed

`@deskwork/core@0.16.0`'s doctor ships exactly six rules:

```
calendar-uuid-missing
duplicate-id
legacy-top-level-id-migration
missing-frontmatter-id
orphan-frontmatter-id
schema-rejected
```

None of these create sidecars. There's no `legacy-calendar-to-sidecars`, `phase-30-migration`, `migrate-stages`, or similar.

### What evidence supports the migration tool *should* exist

The pieces are present, just not wired:

- `@deskwork/core/dist/calendar/parse.js` defines `LEGACY_STAGE_MAP`:
  ```
  Ideas: 'Ideas', Planned: 'Planned', Outlining: 'Outlining', Drafting: 'Drafting',
  Final: 'Final', Published: 'Published', Blocked: 'Blocked',
  Paused: 'Blocked',          // migration: legacy Paused → new Blocked
  Cancelled: 'Cancelled',
  Review: null,               // dropped: review is a state, not a stage
  Distribution: null,         // not a stage: shortform is a separate model
  ```
  with the comment: *"Not used at steady-state runtime — only invoked by the doctor migration that converts a legacy calendar.md into one sidecar per entry."*
- `entry/create.js`'s `createFreshEntrySidecar` (called by `add` / `ingest --apply`) is exactly the function the migration would loop over per legacy row.
- `MIGRATING.md` (v0.11.0 and v0.12.0 sections) explicitly tells adopters to run `deskwork doctor --fix=all` to perform this migration.

So either:
- The rule was written but never registered (look in `doctor/registry` or `doctor/runner`'s rule list), OR
- `MIGRATING.md` is stale and the migration tool was deferred / removed.

### Reproduction

1. Fresh marketplace install of deskwork@0.16.0 + deskwork-studio@0.16.0.
2. Project with a populated legacy calendar (single `docs/editorial-calendar-<site>.md` per site, table-based, stages including `Ideas`/`Planned`/`Outlining`/`Drafting`/`Review`/`Paused`/`Published`).
3. `deskwork doctor --check` — output mentions only the six standard rules, no migration finding.
4. `deskwork doctor --fix=all --yes` — calendar.md unchanged, `.deskwork/entries/` is empty (or missing).
5. Open studio at `/dev/editorial-studio` — every stage column shows "№ 00".

### Current adopter impact

- Studio dashboard is unusable for adopters with legacy calendars. Shows 0 entries; offers no CTA to migrate.
- The CLI side still works (`doctor`'s legacy parser still understands the table format and reports binding findings) so the data isn't lost.
- Adopters either roll back to a pre-Phase-30 version or write their own one-shot sidecar generator.

### Suggested fixes (in priority order)

1. **Ship the missing rule.** Register a `legacy-calendar-to-sidecars` (or similarly-named) rule in the doctor registry that walks each legacy calendar's stage sections, applies `LEGACY_STAGE_MAP`, calls `createFreshEntrySidecar` per row (skipping `Review`/`Distribution` per the map), and reports the count + dropped entries. This is the obvious match for the docs.
2. **If migration is intentionally deferred:** update `MIGRATING.md` to remove the `doctor --fix=all` instruction and replace with the actual procedure (run `ingest` per file? bulk one-shot script? roll-your-own?). The current docs set adopter expectations against actual installed behavior.
3. **In-studio CTA.** When the studio detects a legacy calendar.md AND zero sidecars, render a banner: *"Found N entries in calendar.md but no sidecars. Run `deskwork doctor --fix=migrate-legacy-calendar` to import them."*

### Acceptance

- `MIGRATING.md`'s adopter-action snippet (`deskwork doctor --fix=all`) actually does what it says: walks each legacy calendar row, writes `.deskwork/entries/<uuid>.json`, and the studio's dashboard renders all entries on next load.
- Studio shows zero ambiguity when sidecars are missing — either auto-migrate, prompt, or document the gap.

### Origin

Surfaced 2026-05-06 mid-session. Operator upgraded plugin from v0.9.5 → v0.16.0; the studio went from rendering 29 calendar entries to rendering 0. Followed `MIGRATING.md`'s instructions; `--fix=all` reported only the standard six-rule findings and made no changes. Filing while we manually write a one-shot migration script for our project — happy to upstream the script as a starting point if useful.
<!-- SECTION:DESCRIPTION:END -->
