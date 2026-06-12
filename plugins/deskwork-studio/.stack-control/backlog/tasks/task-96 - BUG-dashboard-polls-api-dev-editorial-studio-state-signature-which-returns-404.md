---
id: TASK-96
title: >-
  BUG: dashboard polls /api/dev/editorial-studio/state-signature which returns
  404
status: To Do
assignee: []
created_date: '2026-06-10 19:31'
labels:
  - 'type:imported-issue'
  - bug
dependencies: []
references:
  - gh-68
ordinal: 96000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Friction surfaced during 2026-04-28 dogfood

The studio dashboard at `/dev/editorial-studio` makes a polling request to `/api/dev/editorial-studio/state-signature` (presumably for auto-refresh — the page footer shows `auto-refresh · 10s`). The endpoint returns 404:

```
[ERROR] Failed to load resource: the server responded with a status of 404 (Not Found) @ http://localhost:47323/api/dev/editorial-studio/state-signature:0
```

Auto-refresh either silently doesn't work, or the dashboard does a full reload as a fallback. Either way the polling endpoint is missing or misnamed.

## What changes

Either:
1. **Implement the endpoint** — it's a cheap signature of the calendar + journal state (e.g., a hash of mtime + size of `.deskwork/calendar.md` + recent journal files). Client polls every 10s; on signature change, the dashboard refetches.
2. **Wire the client to the right path** — if the endpoint already exists at a different URL, fix the client.

## Acceptance

- Loading the dashboard at `/dev/editorial-studio` produces zero console errors related to state-signature.
- Auto-refresh footer behavior matches its label (every 10s the dashboard checks for updates).
- A change made via CLI (e.g., `deskwork plan` from a separate terminal) reflects in the dashboard within ~10s without manual reload.

## Origin

Surfaced 2026-04-28 by loading `http://localhost:47323/dev/editorial-studio` against the deskwork-internal collection. Part of the Phase 23 dogfood arc.
<!-- SECTION:DESCRIPTION:END -->
