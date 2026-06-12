---
id: TASK-56
title: >-
  stackctl govern: feature resolution anchors at the repo root, and the
  backlog/slush step anchors at cwd — nested installations need --repo-root and
  still lose the slush lane
status: To Do
assignee: []
created_date: '2026-06-12 06:26'
updated_date: '2026-06-12 06:30'
labels:
  - 'type:imported-issue'
  - promoted
dependencies: []
references:
  - gh-460
ordinal: 56000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## What

`stackctl govern` (and the `govern.sh` shim) anchor feature resolution at the **repo root**, not the enclosing stack-control installation — and the two resolution paths inside one govern run disagree about the anchor:

1. Run from the repo root with no flags, govern FATALs on a nested installation's feature:
   ```
   govern: FATAL — feature 'design-control' not found under <repo>/specs/<NNN>-design-control (speckit) or <repo>/docs/*/001-IN-PROGRESS/design-control (legacy-docs).
   ```
   The feature actually lives at `plugins/design-control/specs/001-design-control` (nested installation with its own `.stack-control/config.yaml`).
2. Passing `--repo-root plugins/design-control` fixes the feature lookup, but the **backlog-store / slush resolution still resolves from cwd**, not `--repo-root`:
   ```
   govern: no backlog store resolved (no stack-control installation found from <repo root> (no .stack-control/config.yaml at or above it) — run `stackctl setup`) — backlog-store payload exclusion skipped (nothing to exclude).
   govern: slush-findings non-fatal exit 1: no stack-control installation found from <repo root> — run `stackctl setup`
   ```
   So one govern invocation simultaneously believes the installation is `plugins/design-control` (feature, run-dir, audit-log) and "no installation found" (backlog exclusion, slush).

Observed 2026-06-11 on `feature/design-control`, runs `20260611T055621128Z` / `20260611T062812148Z` under `plugins/design-control/.stack-control/audit-runs/`.

## Why it matters

- The `after_implement` governance hook runs from the repo root (Spec Kit drives it there), so the default invocation fails loud on every nested-installation feature; the operator/agent has to know the `--repo-root` workaround.
- With the workaround, the slush step silently degrades (non-fatal exit 1), so barrage residuals never route to the installation's backlog — the disposition protocol loses its parking lane.
- `stackctl session-start` already resolves the nearest enclosing installation from cwd; govern's mixed anchoring is inconsistent with that contract.

## Suggested fix

Anchor every resolution inside one govern run — feature root, run-dir, audit-log, backlog store, slush — at the same enclosing installation (nearest ancestor of cwd, or of `--repo-root` when given). This looks like the same root cause family as the stack-control backlog's anchor-unification capture (TASK-45: installation over --repo-root).

Provenance: design-control feature `tooling-feedback.md` (session 2026-06-11, first entry).
<!-- SECTION:DESCRIPTION:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
- **Promoted-to:** spec:specs/016-anchor-unification
<!-- SECTION:NOTES:END -->
