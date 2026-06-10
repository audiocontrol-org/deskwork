---
id: TASK-14
title: >-
  ingest writes to per-site calendarPath; approve writes only to unified
  .deskwork/calendar.md (v0.16+ divergence)
status: To Do
assignee: []
created_date: '2026-06-10 18:59'
labels:
  - agent-found
  - 'type:bug'
dependencies: []
references:
  - gh-234
ordinal: 14000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Imported from https://github.com/audiocontrol-org/deskwork/issues/234

## Summary

In v0.17.1 the legacy per-site `calendarPath` markdown file and the unified `.deskwork/calendar.md` end up out of sync because `ingest` and `approve` write to different files.

- `deskwork ingest` writes new entries into the per-site `calendarPath` markdown file (e.g. `docs/editorial-calendar-<site>.md`).
- `deskwork approve` writes only to the unified `.deskwork/calendar.md` and updates `.deskwork/entries/<uuid>.json`.

Result: after `ingest` then `approve`, the per-site `calendarPath` file shows the entry's pre-approve stage; the unified calendar shows the post-approve stage. Other commands (e.g. an in-house tool that still parses the per-site file) see stale state.

## Reproduction

Project layout: `audiocontrol`, `editorialcontrol` sites; `calendarPath` is `docs/editorial-calendar-<site>.md`; `contentDir` is the parent `src/sites/<site>/content/`.

```sh
# 1. Ingest a markdown entry into the per-site calendar at Drafting
deskwork ingest --site audiocontrol --slug bridges --state Drafting \
  src/sites/audiocontrol/content/pages/bridges/index.md --apply
# Result:
#   docs/editorial-calendar-audiocontrol.md   has bridges in ## Drafting
#   .deskwork/entries/<uuid>.json             currentStage: Drafting
#   .deskwork/calendar.md                     does not exist yet

# 2. Approve the entry: Drafting -> Final
deskwork approve "$(pwd)" --site audiocontrol bridges
# Result:
#   docs/editorial-calendar-audiocontrol.md   STILL shows bridges in ## Drafting   <-- stale
#   .deskwork/entries/<uuid>.json             currentStage: Final
#   .deskwork/calendar.md                     created, bridges in ## Final
```

After step 2 the two calendar files disagree about `bridges`'s stage. The per-site file has no `## Final` lane (legacy schema only goes up to `## Published`), so `approve` couldn't move the row even if it tried.

## Expected behavior

One of:

1. **`approve` writes to per-site `calendarPath` too** — moves the row out of its current lane (deletes it from `## Drafting` in the legacy file) and re-emits to whatever lane the legacy file uses for the post-approve stage. Requires a stage-name mapping from the unified vocabulary (`Final`, `Published`) onto the legacy file's lanes.
2. **`ingest` stops writing to per-site `calendarPath`** — both commands write only to `.deskwork/calendar.md` and per-entry sidecars. The per-site file becomes obsolete.
3. **`calendarPath` becomes optional in the config schema** — projects that have migrated past the per-site file can drop the field. Currently `REQUIRED_SITE_KEYS = ['contentDir', 'calendarPath']` (`packages/core/src/config.ts`) means deletion of the legacy file requires a config rewrite, and there's no obvious value to point `calendarPath` at if the project has fully moved to the unified layout.

Option 2 + 3 together would be the cleanest forward path — the per-site `calendarPath` is a v0.x compat affordance that the unified calendar has superseded.

## Workaround

Manually delete or update the stale row in the per-site `calendarPath` file after every `approve`, OR don't trust the per-site file as a source of truth.

## Versions

- deskwork v0.17.1
- deskwork-studio v0.17.1
- Node 22

## Related

- Per-entry sidecars + unified calendar landed in v0.16.0 (commit on this repo: "migrate: legacy calendar.md tables → per-entry sidecars (deskwork v0.16.0)") — that migration appears to have updated `approve` but not `ingest` to the new write target.
<!-- SECTION:DESCRIPTION:END -->
