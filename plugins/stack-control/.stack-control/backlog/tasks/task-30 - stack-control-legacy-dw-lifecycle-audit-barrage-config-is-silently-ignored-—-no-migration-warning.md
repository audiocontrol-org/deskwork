---
id: TASK-30
title: >-
  stack-control: legacy dw-lifecycle audit-barrage-config is silently ignored —
  no migration warning
status: Done
assignee: []
created_date: '2026-06-11 00:41'
updated_date: '2026-06-22 17:24'
labels:
  - 'type:imported-issue'
  - promoted
dependencies: []
references:
  - gh-446
ordinal: 30000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
stack-control tooling friction, surfaced while running the audit-barrage protocol on design-control (2026-06-10).

## Symptom

A dw-lifecycle-era barrage config override at `.dw-lifecycle/scope-discovery/audit-barrage-config.yaml` is silently ignored by `stackctl audit-barrage`, which reads only `.stack-control/audit-barrage-config.yaml` (CONFIG_OVERRIDE_PATH in `src/scope-discovery/audit-barrage/config-loader.ts`). A project migrating from dw-lifecycle keeps its operator-tuned settings (timeouts, model roster, gemini disablement rationale) in a file nothing reads, with no warning.

## Impact observed

The TF-003 timeout fix (300s -> 600s) had been landed in the dw-lifecycle config copy. The first stackctl-driven lint barrage ran claude at the 300s default, timed out with zero output, and the round had to be re-fired after relocating the fix — a full model-run wasted, and the failure mode was only diagnosable by reading the config-loader source.

## Suggested fix

stack-control's stance is absorb-then-retire for dw-lifecycle: the config loader (or `install-scope-discovery` / a doctor rule) should detect a legacy `.dw-lifecycle/**/audit-barrage-config.yaml` and either warn loudly ("legacy override present and ignored; migrate to .stack-control/") or offer the migration. Silent divergence between two nearly-identical config files is the worst of the options.

## Provenance

Fixed locally for this repo in deskwork commit b0a8b24f (600s re-landed in the read location, provenance comment pointing at the unread copy). Filed per the tooling-friction-to-GitHub-issues policy.
<!-- SECTION:DESCRIPTION:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
- **Promoted-to:** tasks:specs/014-audit-protocol-reliability

specs/014 US2 implemented: loadAuditBarrageConfig probes the legacy dw-lifecycle path and emits the three-line ignored/read/migrate notice; load semantics unchanged. Commits 7c5c745c/e5240167 (RED/fix).
<!-- SECTION:NOTES:END -->
