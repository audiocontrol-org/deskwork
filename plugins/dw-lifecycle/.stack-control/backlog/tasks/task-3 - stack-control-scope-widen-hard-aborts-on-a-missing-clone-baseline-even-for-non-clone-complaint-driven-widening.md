---
id: TASK-3
title: >-
  stack-control: scope-widen hard-aborts on a missing clone baseline, even for
  non-clone (complaint-driven) widening
status: To Do
assignee: []
created_date: '2026-06-10 20:07'
labels:
  - 'type:imported-issue'
dependencies: []
references:
  - gh-448
ordinal: 3000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
stack-control tooling friction, surfaced while registering audit-barrage leakage classes on design-control (2026-06-10).

## Symptom

`stackctl scope-widen "<complaint>" --slug <s> --manifest <m> --prd-path <p>` hard-fails when the installation has no clone baseline:

```
scope-widen: clone-detector-reader failed: cannot read .../.stack-control/scope-discovery/clones.yaml: ENOENT
Generate the baseline first: stackctl check-clones --refresh-baseline
```

The whole widen aborts — including the parts that do not depend on clone data (the observed run's applied delta was +3 themes, +0 modules, +0 regime-holdouts; nothing clone-derived).

## Why it matters

The first scope-widen of a freshly-set-up installation is exactly when the baseline doesn't exist yet — and the verb that motivated the widen (audit-barrage finding registration, per the working convention "genuine defeat -> fixture + scope-widen") has nothing to do with clones. Recovery required two extra setup verbs (`install-scope-discovery`, `refresh-clones-baseline`) before the registration could run. Inconsistent with the plugin's own auto-scaffold-on-first-use pattern: the backlog store self-seeds (announced) when missing; the scope-discovery state does not.

## Suggested fix

Either (a) auto-seed the missing scope-discovery state on first use, announced, matching the backlog-store pattern; or (b) degrade the clone-reader arm to an announced skip ("clone baseline absent; clone-derived widening unavailable this run") and let the complaint-driven arms proceed. The quoted remediation command does work as printed — the friction is the hard abort, not the message.

## Provenance

Observed registering the 2026-06-10 design-control lint-barrage leakage classes (deskwork commit b4720f48). Filed per the tooling-friction-to-GitHub-issues policy.
<!-- SECTION:DESCRIPTION:END -->
