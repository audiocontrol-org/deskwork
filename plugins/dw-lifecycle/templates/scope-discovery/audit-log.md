# Audit Log — feature/<feature-slug>

This document is the feature-local audit log for `feature/<feature-slug>`.

How to operate this log:

- Treat new or updated entries as actionable work, not bookkeeping.
- The audit log is the source of truth for current finding state.
- Never delete findings. Update entries in place under the same `Finding-ID`.
- `fixed-<sha>` means a fix landed; `verified-<date>` requires re-exercising the surface.
- If work is deferred, change `Status:` to `acknowledged-<ref>` with the issue, workplan section, or operator-approved plan.

Status quick-reference:

- `open` — reported; not yet resolved
- `acknowledged-<ref>` — accepted but deferred
- `fixed-<sha>` — fix landed, awaiting verification rerun
- `verified-<date>` — fix re-checked against the original surface
- `withdrawn-<date>` / `superseded-by-<finding-id>` — closed without deletion
- `informational` — observation only; no remediation required

Canonical grep queue:

- unfinished work: `grep -nE "^Status:[[:space:]]+(open|acknowledged|fixed-)" docs/<v>/001-IN-PROGRESS/<feature-slug>/audit-log.md`
- new findings: `grep -nE "^Status:[[:space:]]+open" docs/<v>/001-IN-PROGRESS/<feature-slug>/audit-log.md`

---
