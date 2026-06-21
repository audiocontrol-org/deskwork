---
id: TASK-316
title: >-
  Audit payload out-of-window false alarms: per-phase barrage flags
  referenced-but-out-of-window files as absent/not-imported and raises false
  HIGHs
status: Done
assignee: []
created_date: '2026-06-20 03:53'
updated_date: '2026-06-21 01:26'
labels:
  - agent-found
  - 'type:gap'
dependencies: []
ordinal: 316000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The per-phase audit-barrage payload is scoped to the phase's own files. The auditor then flags a referenced-but-out-of-window file as 'absent from the diff' / 'not imported' / 'gate missing' and raises a FALSE HIGH it cannot disconfirm. Recurred 3x across the 028 US3/US4 govern cycles — runIntercept's resolveInstalled wiring, the local normalize import in reconcile.ts, and the extend SKILL check-front-door gate were ALL present but flagged absent because they sat outside the per-phase payload window — each forcing a substantive --override. Sibling of TASK-263 (in-window exclusion of a split-out file); this is the out-of-window inclusion variant. Fix: widen the payload to include referenced-but-out-of-window files the findings depend on, OR feed the auditor enough surrounding context to disconfirm an 'absent' claim, OR teach the prompt that out-of-window = not-in-scope-this-phase (not a defect).
<!-- SECTION:DESCRIPTION:END -->
