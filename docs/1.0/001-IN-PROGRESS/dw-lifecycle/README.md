---
slug: dw-lifecycle
targetVersion: "1.0"
date: 2026-04-29
branch: feature/deskwork-dw-lifecycle
parentIssue: 134
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
| 7 | Post-ship bug fixes (`setup` / `define` / install-path follow-up) | Complete |
| 8 | Customize hooks / tailoring seam | Complete |
| 9 | PRD conformance hardening (audit-driven remediation) | Complete |

## Key Links

- Branch: `feature/deskwork-dw-lifecycle`
- Design / PRD: `design.md`
- Workplan: `workplan.md`
- Plugin source: `plugins/dw-lifecycle/`
- Local smoke: `scripts/smoke-dw-lifecycle.sh`
- Parent Issue: #134

## Reopened Follow-Up

`dw-lifecycle` originally shipped on `main` at v0.9.6, but the feature has since been reopened for post-ship follow-up work under [#134](https://github.com/audiocontrol-org/deskwork/issues/134), with Phase 7 tracked in [#135](https://github.com/audiocontrol-org/deskwork/issues/135) and Phase 8 tracked in [#136](https://github.com/audiocontrol-org/deskwork/issues/136).

This directory has been moved back to `001-IN-PROGRESS` so the documentation state matches the active issue state and branch intent.

## Release status

**Shipped on `main` at v0.9.6** (2026-04-29). The original workplan (T46) envisioned a per-plugin `dw-lifecycle-v0.1.0` tag, but Phase 26's npm-publish architecture pivot (v0.9.5+) and the trunk-based stance documented in `RELEASING.md` superseded that model: dw-lifecycle now rides the unified monorepo version line alongside `deskwork` and `deskwork-studio`. Adopters running `/plugin marketplace update deskwork` see dw-lifecycle@0.9.6 as a new entry.

T46 workplan steps 4–6 (per-plugin tag, PR open, operator-merge) are obsolete artifacts of the original plan. The feature landed via direct fast-forward push to `origin/main` per the trunk-based release model.

Verification at landing: 63/63 vitest tests pass, tsc clean, plugin manifest validates, local smoke (`scripts/smoke-dw-lifecycle.sh`) passes against a fresh tmp repo, bin shim's first-run npm install verified.

## Audit

- 2026-05-03 implementation audit: `2026-05-03-implementation-audit.md`
- 2026-05-03 post-remediation audit: `2026-05-03-post-remediation-audit.md`

## Current status

The reopened remediation arc is complete. The follow-up audit now finds the feature substantially aligned with its PRD/design, and the remaining items are narrow hardening or deferred portability backlog rather than blockers for this feature.

Merge prep is complete and PR [#172](https://github.com/audiocontrol-org/deskwork/pull/172) is open against `main`.

## Open follow-ups (non-blockers)

- `branchExists` only checks local refs; remote-only `origin/feature/<slug>` collision still creates a tracking branch.
- `TEMPLATES_DIR` resolution via `import.meta.url` works under tsx but would break if a `dist/` build is added.
- The journal-entry override seam is the first portability slice. Broader feature-doc template/file-layout customization remains deferred under [#123](https://github.com/audiocontrol-org/deskwork/issues/123).
