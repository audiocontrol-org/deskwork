---
slug: pluggable-lifecycle-providers
targetVersion: "1.0"
date: 2026-06-04
branch: feature/pluggable-lifecycle-providers
parentIssue: 
---

# Feature: pluggable-lifecycle-providers

Make `dw-lifecycle`'s authoring layer pluggable via a provider port (`native` | `spec-kit` | `kiro` | future), backed by a normalized `lifecycle-manifest.yaml` that the differentiated back half (audit barrage, finding state machine, scope/clone/debt governance) reads regardless of which provider authored the plan. Ports-and-adapters with the manifest as the port; the back half branches on `capabilities()`, never on provider identity.

## Status

| Phase | Description | Status |
|---|---|---|
| 1 | Stabilize PRD via deskwork review | ✅ Done (PRD `Final` 2026-06-04) |
| 2 | Extract the lifecycle manifest (schema + validator; back half reads it; `native` emits) | In progress |
| 3 | Provider port + `native` adapter | Not started |
| 4 | `reconcile()` core + re-sync command | Not started |
| 5 | `spec-kit` adapter | Not started |
| 6 | `kiro` importer | Not started |
| 7 | Tracker capability + `gh`-skill gating | Not started |
| 8 | Customization polish (project-local adapter override seam) | Not started |

## Key Links

- Branch: `feature/pluggable-lifecycle-providers`
- PRD: `prd.md`
- Workplan: `workplan.md`
- Parent Issue: 
