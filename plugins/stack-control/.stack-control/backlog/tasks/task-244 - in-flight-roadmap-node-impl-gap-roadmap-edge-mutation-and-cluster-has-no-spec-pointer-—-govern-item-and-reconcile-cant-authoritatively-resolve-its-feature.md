---
id: TASK-244
title: >-
  in-flight roadmap node impl:gap/roadmap-edge-mutation-and-cluster has no spec:
  pointer — govern --item and reconcile can't authoritatively resolve its
  feature
status: To Do
assignee: []
created_date: '2026-06-18 23:17'
labels:
  - agent-found
  - 'type:gap'
dependencies: []
ordinal: 244000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The node advanced to the implementing phase with design:/design-approved:/analyze-clean: markers but no spec: specs/027-roadmap-edge-mutation-and-cluster pointer. govern --item fails 'no spec: pointer; cannot resolve a feature to govern'. There is no verb to set spec: on an existing node (the very edge/field-mutation gap 027 fixes), so it can't be added without a forbidden hand-edit. Workaround: govern --feature 027-roadmap-edge-mutation-and-cluster. Fix: have the spec-finalize/advance path stamp spec:, or add a set-field verb.
<!-- SECTION:DESCRIPTION:END -->
