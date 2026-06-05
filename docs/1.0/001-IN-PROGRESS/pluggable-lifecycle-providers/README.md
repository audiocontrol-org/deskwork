---
slug: pluggable-lifecycle-providers
targetVersion: "1.0"
date: 2026-06-04
branch: feature/pluggable-lifecycle-providers
parentIssue: 
---

# Feature: pluggable-lifecycle-providers

Make `dw-lifecycle`'s authoring layer pluggable via a provider port (`native` | `spec-kit` | `kiro` | future), backed by a normalized `lifecycle-manifest.yaml` that the differentiated back half (audit barrage, finding state machine, scope/clone/debt governance) reads regardless of which provider authored the plan. Ports-and-adapters with the manifest as the port; the back half branches on `capabilities()`, never on provider identity.

> **North Star (ideal end-state):** deskwork as the provider-agnostic control plane that takes ANY provider's dependency-annotated plan and both **governs it** (cross-model audit/findings/scope) and **executes it better than the provider's single-agent grinder** — a parallel, multi-CLI, worktree-isolated engine that fans tranches of independent tasks across multiple LLM CLIs. See `prd.md` § North Star. The phases below are the incremental path; this is the destination.

## Status

**Approach pivoted 2026-06-04 → integration-first.** Rather than building the manifest/port abstraction up front (the manifest-first phase plan below), we adopted Spec Kit as a real management layer and let the interface emerge from concrete integration — to avoid building the wrong shape. We dogfooded Spec Kit's *own* native flow (`constitution → specify → clarify → plan → tasks → analyze → implement`) to build the first slice. The phase table below is the original manifest-first plan and is **superseded pending an explicit workplan restructure** around the slices + north star.

### Slices (integration-first path toward the north star)

| Slice | Description | Status |
|---|---|---|
| — | Stabilize PRD via deskwork review | ✅ Done (PRD `Final` 2026-06-04) |
| 001 | deskwork governance as a Spec Kit `after_implement` extension (govern a foreign plan) | ✅ Done — fires automatically, cross-model, caught real self-bugs. `specs/001-speckit-backhalf-slice/` |
| next | Parallel multi-CLI, worktree-isolated **execution** engine (north-star headline; nobody else does cross-CLI) | Captured, not started |
| substrate | Manifest / provider port / `reconcile()` / tracker (full pluggability, beneath govern+execute) | Deferred — sequence after slices prove shape |

### Original manifest-first phases (superseded — see pivot note above)

| Phase | Description | Status |
|---|---|---|
| 1 | Stabilize PRD via deskwork review | ✅ Done |
| 2 | Extract the lifecycle manifest (schema + validator; back half reads it; `native` emits) | Superseded → "substrate" |
| 3 | Provider port + `native` adapter | Superseded → "substrate" |
| 4 | `reconcile()` core + re-sync command | Superseded → "substrate" |
| 5 | `spec-kit` adapter | Partially realized by slice 001 (Spec Kit live) |
| 6 | `kiro` importer | Not started |
| 7 | Tracker capability + `gh`-skill gating | Not started |
| 8 | Customization polish (project-local adapter override seam) | Not started |

## Key Links

- Branch: `feature/pluggable-lifecycle-providers`
- PRD: `prd.md`
- Workplan: `workplan.md`
- Parent Issue: 
