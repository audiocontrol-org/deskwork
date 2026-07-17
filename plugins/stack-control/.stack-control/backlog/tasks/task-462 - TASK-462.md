---
id: TASK-462
title: TASK-462
status: To Do
assignee: []
created_date: '2026-07-17 22:57'
labels:
  - agent-found
  - 'type:gap'
dependencies: []
ordinal: 461000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
036 config loader omits plane from KNOWN_TOP_LEVEL, so an installation config carrying a plane: block fails loud; PlaneConfig.url is declared (T003) but unparsed. Sidecar daemon + plane serve resolve the plane URL via --plane-url > STACKCTL_CP_URL only. Wire the loader to accept plane.url with env precedence.
<!-- SECTION:DESCRIPTION:END -->
