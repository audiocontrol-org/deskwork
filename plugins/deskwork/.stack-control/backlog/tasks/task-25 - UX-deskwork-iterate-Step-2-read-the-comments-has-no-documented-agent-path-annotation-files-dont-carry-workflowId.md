---
id: TASK-25
title: >-
  UX: /deskwork:iterate Step 2 'read the comments' has no documented agent path;
  annotation files don't carry workflowId
status: To Do
assignee: []
created_date: '2026-06-10 19:00'
labels:
  - agent-found
  - 'type:gap'
dependencies: []
references:
  - gh-84
ordinal: 25000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Imported from https://github.com/audiocontrol-org/deskwork/issues/84

## Friction during dogfood

The `/deskwork:iterate` skill (in v0.8.6 cache) tells the agent at Step 2:

> Read the studio's pending comments (the operator's unresolved comments on the current version).

…with **no documented path** for how. There's no CLI subcommand, no documented API endpoint, and no documented file pattern. Surfaced during dogfood today on the deskwork-internal collection — agent ran `/deskwork:iterate release-skill-design`, the helper said *"File on disk is identical to workflow v1 — no revision to snapshot. Write the revision to disk first..."* (correct behavior — there ARE pending comments to address), but the agent had to discover by hand:

1. Tried `curl /api/dev/editorial-review/<workflowId>` → 404
2. Tried `curl /api/dev/editorial-review/<workflowId>/comments` → 404
3. Grepped `packages/studio/src/routes/api.ts` and found the actual endpoint: `GET /api/dev/editorial-review/annotations?workflowId=<id>&version=<n>`
4. Tried to find them on disk via `find .deskwork -name "*<workflowId>*"` — annotation files don't contain the workflowId in their filename (they're at `.deskwork/review-journal/history/<timestamp>-<commentId>.json`), so the search returned nothing
5. Eventually grepped for `annotation` in the source to confirm they DO go to history with the comment's own UUID as the filename component

Spent ~3-5 minutes of detective work on what should be a one-command lookup.

## Why it matters

The iterate skill is the highest-cycle agent operation in the deskwork pipeline (every iteration runs through it). Step 2's vagueness forces the agent to either:
- Cache the API endpoint from a prior dogfood session (fragile; agents start fresh)
- Re-discover via source-grep every time (wasteful)
- Read every history file (slow + brittle)

For a skill explicitly designed to be agent-driven, having a key step undocumented is a real gap.

## Suggested fix

Pick one (in order of preference):

1. **`deskwork iterate-prep <slug>` CLI subcommand.** Reads `.deskwork/review-journal/` directly, prints unresolved comments for the current workflow + version as JSON. Agent runs this once, gets the comments, decides dispositions, rewrites file, runs `deskwork iterate`. No HTTP dependency — works whether the studio is running or not.

2. **Document the studio API endpoint in the skill doc.** Add to Step 2: *"Fetch pending comments via `curl http://localhost:<port>/api/dev/editorial-review/annotations?workflowId=<id>&version=<n>`. The studio must be running."* Lighter touch but couples the agent to the studio's HTTP surface.

3. **Add `--list-comments` (or similar) flag to `deskwork iterate`** itself, similar to `deskwork ingest`'s dry-run pattern. `deskwork iterate <slug> --list-comments` prints the pending-comment JSON without doing anything else.

I'd weight option 1 highest — keeps the agent off the HTTP surface entirely, mirrors the existing `deskwork ingest` (dry-run-first) ergonomics, and the studio doesn't need to be running for the agent to know what to address.

## Adjacent: annotation history filenames don't carry workflowId

Even if option 1 above ships, the on-disk pattern is awkward:

```
.deskwork/review-journal/history/
├── <ts>-created-<workflowId>.json
├── <ts>-version-<workflowId>-vN.json
├── <ts>-state-<workflowId>-<ts>.json
└── <ts>-<commentId>.json                 ← no workflowId in the name!
```

A comment's filename is `<timestamp>-<commentId>.json` — there's no workflow scoping in the name. To find "all annotations for workflow X" via the filesystem, you have to read every `<ts>-<uuid>.json` file in `history/` and check its `entry.workflowId` payload.

Suggested rename pattern (forward-compatible — old files keep working since the JSON's `entry.workflowId` is canonical): `<timestamp>-annotation-<workflowId>-<commentId>.json`. Symmetrical with the other event types, supports `find -name "*<workflowId>*"` for filesystem-level filtering.

This second item is lower priority than fix #1 above, but they're the same root cause: discoverability of annotations from the agent side.
<!-- SECTION:DESCRIPTION:END -->
