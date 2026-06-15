---
id: TASK-37
title: >-
  AUDIT-20260614-44 — Tagged plugin releases are not reproducible because
  first-run install floats dependency versions
status: Done
assignee: []
created_date: '2026-06-14 23:00'
updated_date: '2026-06-15 01:15'
labels:
  - 'type:migrated-finding'
  - 'feature:design-control'
  - 'finding:AUDIT-20260614-44'
dependencies: []
references:
  - 'audit:design-control:AUDIT-20260614-44'
priority: medium
ordinal: 37000
---

Done in 2bca7dc2 — ship a committed `plugins/design-control/package-lock.json`
and switch the bin-shim bootstrap to `npm ci` against it, so every adopter at a
release tag gets a byte-identical runtime. `.gitignore` un-ignores the lockfile
(the blanket `plugins/*/package-lock.json` rule was written for empty thin-shell
plugins); `bump-version.ts` keeps the lock's self-version in lockstep.



