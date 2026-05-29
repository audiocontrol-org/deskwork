---
slug: burndown-dw-lifecycle
date: 2026-05-29
kind: burndown-marching-orders
lane: dw-lifecycle
source: docs/1.0/001-IN-PROGRESS/hygiene/issue-closure-audit-2026-05-29.md
---

# Marching Orders — dw-lifecycle plugin

The `dw-lifecycle` plugin (at [`plugins/dw-lifecycle/`](../../plugins/dw-lifecycle/)) ships project-lifecycle orchestration: define → setup → issues → implement → review → ship → complete + the hygiene-skill family (debt-report, triage-issues, promote-deferrals, close-shipped, archive-branch). Scope-discovery sub-system lives under this plugin but has its own marching-orders sheet ([`scope-discovery.md`](scope-discovery.md)).

**Status as of 2026-05-29:** Phases 1–6 + hygiene complete and shipped. Phase 7 (setup-helper + define-skill fixes) and Phase 8 (customize-hooks) remain open per the umbrella tracker [#134](https://github.com/audiocontrol-org/deskwork/issues/134).

## Quick fixes (~1 hour each)

| # | Title | Action | Size | Deps |
|---|---|---|---|---|
| [#127](https://github.com/audiocontrol-org/deskwork/issues/127) | `dw-lifecycle:define` SKILL prescribes bare `/tmp/feature-definition-<slug>.md` | Replace with `mktemp -t feature-definition-<slug>.XXXXXX` per `.claude/rules/file-handling.md`; update the matching prose in SKILL.md | ~5 LOC SKILL.md edit | none |
| [#116](https://github.com/audiocontrol-org/deskwork/issues/116) | `/dw-lifecycle:help` Step 3 "list dw-lifecycle-related issues" has unspecified search predicate | Document the exact `gh issue list` query (label / title-prefix / both); land it in SKILL.md | ~10 LOC SKILL.md edit | none |
| [#126](https://github.com/audiocontrol-org/deskwork/issues/126) | `dw-lifecycle:setup` SKILL prose drift with helper behavior | Read setup.ts current behavior; reconcile SKILL.md prose (helper does worktree creation; SKILL no longer says to use `superpowers:using-git-worktrees` for that step) | ~20 LOC SKILL.md edit | none |

## Medium effort (1-2 days)

| # | Title | Action | Size | Deps |
|---|---|---|---|---|
| [#258](https://github.com/audiocontrol-org/deskwork/issues/258) | `install-shortcuts` concurrent-invocation tmp race + partial-install orphan recovery | Atomic-write via `mktemp + rename`; add manifest verification; integration smoke that races two installs | ~80 LOC + smoke | none |
| [#211](https://github.com/audiocontrol-org/deskwork/issues/211) | `dw-lifecycle install` no per-field CLI override flags | The `--config-overlay <path>` mitigation shipped (closed Phase 11 T2). Remaining work: schema-extension (richer statusDirs roles than the three-state default) | ~150 LOC + schema delta | needs design call on statusDirs vocabulary |
| [#347](https://github.com/audiocontrol-org/deskwork/issues/347) | Stale-branch sessions silently re-implement shipped work (graphical-entries instance) | Session-start probe: `git log --oneline origin/main..HEAD` warning when branch carries >N commits without rebase; surface in session journal | ~30 LOC + integration smoke | none |
| [#135](https://github.com/audiocontrol-org/deskwork/issues/135) | Phase 7: dw-lifecycle setup-helper + define-skill bug fixes | Umbrella — most sub-items closed in audit. Verify and close. | meta | #126, #127 |

## Larger / sprint-sized

| # | Title | Action | Size | Deps |
|---|---|---|---|---|
| [#122](https://github.com/audiocontrol-org/deskwork/issues/122) | Session skills tailoring — session-start/session-end hardcoded to deskwork journal shape | Adopter-side template seam — per-project `journal-entry` override via the customize-hooks resolver (#136) | sprint | #136 |
| [#123](https://github.com/audiocontrol-org/deskwork/issues/123) | feature-doc format + file layout project-coupled | Per-project templates for prd.md / workplan.md / README.md; same resolver seam as #122 | sprint | #136 |
| [#136](https://github.com/audiocontrol-org/deskwork/issues/136) | Phase 8: customize-hooks (session/template tailoring + deskwork peer integration) | The capability that unblocks #122 + #123 + #133. Sprint-scoped; needs PRD pass via deskwork iterate/approve | sprint | none — this is the blocker |
| [#133](https://github.com/audiocontrol-org/deskwork/issues/133) | Phase 29: post-release customer acceptance playbook (`/post-release:walk` + `/post-release:file-issues`) | Sprint-scoped per the existing v2 design doc; deferred pending Phase 30 (shipped) | sprint | #136 |
| [#134](https://github.com/audiocontrol-org/deskwork/issues/134) | Umbrella: Phase 7 + 8 follow-up (post-v0.1.0) | Closes when #122, #126, #127 close (per audit log) | meta | #122, #126, #127, #136 |

## Operator triage required

| # | Title | Why operator needs to decide |
|---|---|---|
| [#314](https://github.com/audiocontrol-org/deskwork/issues/314) | Canonicalize visual-verification gate in dw-lifecycle | Cross-cuts scope-discovery + studio; pick the shape: a skill that dispatches the gate, a pre-push hook, or a rule update. Trade-offs in the issue body. |

## Already-tracked / informational

- The audit closed #115, #185, #196, #209, #210, #212, #213 — see hygiene's audit log for evidence.
- `dw-lifecycle` mirrors `@deskwork/core` versioning in lockstep — every release of this plugin bumps `plugin.json` to match the published npm package.
