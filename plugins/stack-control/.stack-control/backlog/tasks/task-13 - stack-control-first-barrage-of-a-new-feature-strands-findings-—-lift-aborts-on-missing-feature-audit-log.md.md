---
id: TASK-13
title: >-
  stack-control: first barrage of a new feature strands findings — lift aborts
  on missing feature audit-log.md
status: Done
assignee: []
created_date: '2026-06-10 18:33'
updated_date: '2026-06-11 00:27'
labels:
  - agent-found
  - 'type:bug'
  - promoted
dependencies: []
references:
  - gh-441
ordinal: 13000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Recovered from #441 (closed NOT_PLANNED during the GitHub->backlog migration, which dropped the body). Detail below is the original issue body; provenance ref gh-441 is in frontmatter.

stack-control tooling friction, surfaced while dogfooding the stack-control regime on the design-control feature (2026-06-10).

## Symptom

The first end-of-task barrage of every brand-new feature strands its findings: `implement-hook --feature <slug>` fires the barrage cleanly (all models exit 0), but then `audit-barrage-lift` fails with `audit-log not found at <feature-docs>/audit-log.md` and the hook aborts the whole chain. The feature audit-log is never created by `setup`/`define`, so every new feature hits this on its first barrage.

## Why it matters

The fired barrage's findings are stranded in the run-dir. Re-running `implement-hook` skips on the no-new-diff guard (tip unchanged), so the findings never lift without manual intervention.

## Workaround used

Hand-created the feature `audit-log.md` from the canonical header, then ran `audit-barrage-lift --feature <slug> --run-dir <run-dir> --apply` directly to lift the already-fired barrage.

## Suggested fix

`audit-barrage-lift` (or the hook) should scaffold the audit-log from the canonical header when absent — the same auto-scaffold-on-first-use pattern stack-control's backlog store already follows.

## Provenance

Logged as TF-001 in https://github.com/audiocontrol-org/deskwork/blob/feature/design-control/plugins/design-control/specs/001-design-control/tooling-feedback.md — observed against the dw-lifecycle verb; stack-control vendored the surface, so it inherits unless already fixed. Filed per the new policy: tooling friction goes to GitHub issues (reliably cross-project). Local backlog ref: design-control installation TASK-3.
<!-- SECTION:DESCRIPTION:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
- **Promoted-to:** tasks:specs/013-audit-protocol-hardening

Verified fixed in the formally-installed v0.42.0 marketplace copy (2026-06-11): first audit-barrage-lift against a specs/NNN-slug feature with NO audit-log.md exits 0, scaffolds the canonical header (slug + targetVersion + title) at the resolved root, and lands the findings (AUDIT-20260611-NN). Old behavior was the exit-2 abort stranding the run. Explicit-run-dir re-lift also verified non-stranding. Closed per operator direction after installed-release verification.
<!-- SECTION:NOTES:END -->
