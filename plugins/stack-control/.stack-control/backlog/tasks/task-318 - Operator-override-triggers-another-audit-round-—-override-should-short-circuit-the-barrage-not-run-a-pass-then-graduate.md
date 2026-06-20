---
id: TASK-318
title: >-
  Operator override triggers another audit round — override should short-circuit
  the barrage, not run a pass then graduate
status: To Do
assignee: []
created_date: '2026-06-20 05:26'
labels:
  - agent-found
  - 'type:gap'
dependencies: []
ordinal: 318000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Operator-approved governance defeat (--override), used when the audit-barrage is ringing at diminishing returns, currently still fires a full barrage pass before honoring the override. convergence-loop.ts:20-25 documents it: govern routes --override through the gate so an overridden run STILL produces a barrage record (gate returns OPEN, driver sees converged). That defeats the purpose — the operator overrides precisely to STOP auditing, but the override path runs another round first. Fix: when --override is supplied, govern short-circuits the barrage entirely — record the override reason in the audit trail and graduate, firing NO render/barrage/lift/slush pass. Open question: should the override persist keyed to the audited fingerprint so later govern invocations on unchanged code graduate without re-auditing, invalidated only when code changes. Part of multi:feature/govern-operability P4 loop hygiene; sibling of .claude/rules/spec-audit-diminishing-returns.md (override is the sanctioned plateau escape; this makes the escape actually escape).
<!-- SECTION:DESCRIPTION:END -->
