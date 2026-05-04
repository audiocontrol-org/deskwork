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
| 10 | Release hardening (`doctor` rule completion) | Complete |

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
- 2026-05-03 independent PRD conformance audit: `2026-05-03-prd-conformance-audit.md`

## Current status

The reopened remediation arc and its release-hardening follow-up are complete. The remaining items are narrow hardening or deferred portability backlog rather than blockers for the next `dw-lifecycle` plugin release.

PR [#172](https://github.com/audiocontrol-org/deskwork/pull/172) is merged.

## Open follow-ups (non-blockers)

- `branchExists` only checks local refs; remote-only `origin/feature/<slug>` collision still creates a tracking branch.
- `TEMPLATES_DIR` resolution via `import.meta.url` works under tsx but would break if a `dist/` build is added.
- The journal-entry override seam is the first portability slice. Broader feature-doc template/file-layout customization remains deferred under [#123](https://github.com/audiocontrol-org/deskwork/issues/123).

## Post-ship investigation

[#185](https://github.com/audiocontrol-org/deskwork/issues/185) — *"dw-lifecycle plugin skills unreachable as user-typed slash commands in installed plugin."* Filed during a 2026-05-04 dogfood session that surfaced `/dw-lifecycle:help` returning *"Unknown command"* in an apparently-installed plugin. Investigation across four probes (remove `name:` from SKILL.md frontmatter; add `commands/` shim; `/plugin marketplace update`; full marketplace remove + add + install) confirmed the dw-lifecycle plugin source has no defect. Root cause was an upstream Claude Code 2.1.x bug: `installed_plugins.json` registrations whose declared `installPath` cache directories never existed, papered over by `/plugin marketplace update` cycles that bumped `lastUpdated` without rebuilding the cache. The clean-room reinstall (`marketplace remove → add → install`) worked. Adopter-facing recovery sequence has been added to the deskwork plugin's troubleshooting section in `plugins/deskwork/README.md` (commit `d632772`). A new project rule codifying the global slash-command namespace pollution constraint surfaced during probe 2 has landed at `.claude/rules/agent-discipline.md` (commit `b789079`).
