---
id: TASK-464
title: TASK-464
status: To Do
assignee: []
created_date: '2026-07-18 02:53'
labels:
  - agent-found
  - 'type:gap'
dependencies: []
ordinal: 463000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
036 govern round-2: AUDIT-20260718-08 (production sidecar does not deliver accepted commands to a local run) and AUDIT-20260718-19 (plane runtime never wires command acknowledgements — commands held forever, replayed after handled) are the production command->run delivery+ack wiring. Folds into the same command->run fan-in as TASK-461. The plane-side lifecycle PRIMITIVES (per-target ack signature, store state-transition op, commandStatus reads durable state, expiry status) are being fixed now; the end-to-end production ack ingestion from a real sidecar is this gap.
<!-- SECTION:DESCRIPTION:END -->
