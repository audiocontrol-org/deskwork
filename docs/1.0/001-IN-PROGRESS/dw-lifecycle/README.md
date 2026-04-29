---
slug: dw-lifecycle
targetVersion: "1.0"
date: 2026-04-29
branch: feature/deskwork-dw-lifecycle
parentIssue:
---

# Feature: dw-lifecycle

Project lifecycle orchestration plugin for Claude Code. Composes `superpowers` (process disciplines, required) and `feature-dev` (specialist agents, recommended) into a single end-to-end flow: define → setup → issues → implement → review → ship → complete. Ships as a sibling plugin to `deskwork` inside the same marketplace.

## Status

| Phase | Description | Status |
|---|---|---|
| 1 | Plugin scaffolding | Complete |
| 2 | Bin foundation (`install`, `doctor`) | Complete |
| 3 | Doc tree + workplan I/O + `setup` | Complete |
| 4 | Tracking + transitions + journal (`journal-append`, `transition`, `issues`) | Complete |
| 5 | Skills (15 SKILL.md content rewrites) | Complete |
| 6 | Release prep (README, smoke, audit) | Complete |

## Key Links

- Branch: `feature/deskwork-dw-lifecycle`
- Design / PRD: `design.md`
- Workplan: `workplan.md`
- Plugin source: `plugins/dw-lifecycle/`
- Local smoke: `scripts/smoke-dw-lifecycle.sh`
- Parent Issue: <parentIssue>

## v0.1.0 release readiness

All implementation phases complete. 63/63 vitest tests pass. tsc clean. Plugin manifest validates. Local smoke (`./scripts/smoke-dw-lifecycle.sh`) passes against a fresh tmp repo.

The actual v0.1.0 release ceremony is gated on upstream issue [audiocontrol-org/deskwork#81](https://github.com/audiocontrol-org/deskwork/issues/81) (empty-`vendor/` packaging regression). Hold tag until that ships in a verified v0.8.x patch.

## Open follow-ups (non-blockers)

- `targetVersion` arg not validated at the CLI boundary (slug is). Path traversal via `--target ../../etc` would still escape the docs tree; same fix pattern as slug.
- `branchExists` only checks local refs; remote-only `origin/feature/<slug>` collision still creates a tracking branch.
- `TEMPLATES_DIR` resolution via `import.meta.url` works under tsx but would break if a `dist/` build is added.
- `parentIssue: ''` placeholder renders as empty trailing in the README template until `dw-lifecycle issues` runs.
