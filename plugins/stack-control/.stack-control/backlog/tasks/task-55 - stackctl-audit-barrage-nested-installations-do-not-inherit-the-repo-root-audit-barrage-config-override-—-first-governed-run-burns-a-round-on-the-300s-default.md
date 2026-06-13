---
id: TASK-55
title: >-
  stackctl audit-barrage: nested installations do not inherit the repo-root
  audit-barrage-config override — first governed run burns a round on the 300s
  default
status: To Do
assignee: []
created_date: '2026-06-12 06:26'
updated_date: '2026-06-12 06:30'
labels:
  - 'type:imported-issue'
  - promoted
dependencies: []
references:
  - gh-461
ordinal: 55000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## What

A nested stack-control installation does **not** inherit the repo root's `.stack-control/audit-barrage-config.yaml` override — the barrage falls back to the plugin-default model battery (claude `timeout_seconds: 300`).

Observed 2026-06-11 on `feature/design-control`: the repo-root override had already bumped claude to 900s (specs/014 dogfood, run `20260611T023019180Z`), but a governed run in the nested `plugins/design-control` installation ran with the 300s default and hit the fleet floor:

```
audit-barrage: WARNING — model 'claude' produced no output (timed out after 300s)
audit-barrage: FLOOR SHORTFALL — required 2 emitting model(s), got 1 (non-emitting: claude, gemini)
govern: FATAL — audit-barrage OUTAGE or fleet-floor shortfall (exit 1).
```

(run `20260611T062218157Z-design-control-after_clarify`, committed under `plugins/design-control/.stack-control/audit-runs/`)

Workaround: hand-seed a copy of the root override into the nested installation (`plugins/design-control/.stack-control/audit-barrage-config.yaml`, commit `90bc5507`). That copy now drifts independently — the same fleet evidence (gemini disabled at 94.1% failure; claude 900s for protocol-size payloads) is maintained in two places.

## Why it matters

- Fleet-tuning evidence is repo-global (which CLIs are installed, their quota and latency behavior), but the override is per-installation — every new nested installation re-discovers the same floor shortfall the hard way, on its first governed run.
- The failure mode is expensive: a full barrage round burns to a FATAL after the slowest configured timeout.
- Config copies drift (the seeded copy's header initially narrated a different feature's history — lifted as AUDIT-20260611-14 in the design-control audit-log).

## Suggested fix

Resolve the barrage config with a fallback chain: nearest enclosing installation's override → repo-root installation's override → plugin default. (Or: document per-installation seeding as a `stackctl setup` step so the copy is created intentionally rather than discovered via a floor shortfall.)

Provenance: design-control feature `tooling-feedback.md` (session 2026-06-11, second entry); audit-log AUDIT-20260611-14.
<!-- SECTION:DESCRIPTION:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
- **Promoted-to:** tasks:specs/016-anchor-unification
<!-- SECTION:NOTES:END -->
