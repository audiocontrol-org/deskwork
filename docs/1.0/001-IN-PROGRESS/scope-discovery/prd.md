---
slug: scope-discovery
title: Scope discovery — canonize audiocontrol pilot into dw-lifecycle
targetVersion: "1.0"
date: 2026-05-25
parentIssue: 
deskwork:
  id: 4e4d6912-3edf-4aeb-b6ed-ba455f362f14
designSpec: docs/superpowers/specs/2026-05-24-scope-discovery-design.md
canary: graphical-entries
---

# PRD: Scope discovery — canonize audiocontrol pilot into dw-lifecycle

## Problem Statement

The `dw-lifecycle` plugin's existing skill set (`define / setup / implement / review / ship`) carries a project through a feature lifecycle but does NOT enforce upfront scope discovery on system-wide work, and does NOT enforce sibling-enumeration on sub-agent dispatches. Both are agent-side discipline gaps that have been measurably expensive in real work — the audiocontrol pilot's motivation: *"the Roland S-330/S-550 v3 redesign (May 2026), which spent ~230 operator turns over 60 hours doing brute-force discovery the agent should have done in 10–15 minutes at session start. ... The protocol treats agent-side enforcement as code, not directives — passive rules in CLAUDE.md and agent prompts have demonstrably failed against persistent pathologies in this repo. Every gate the protocol introduces is code-shaped: it rejects the bad shape mechanically, not by asking the agent to remember."* Audiocontrol built and validated the protocol in-repo: `/scope-inventory <slug>` upfront discovery, `/scope-widen "<complaint>"` mid-implementation widening, pre-commit clone-detector gate, sub-agent dispatch wrapper with `Searched/Included/Excluded` grammar enforcement, Step 0 refactor-preconditions, anti-patterns + adopter-manifests + editor-symmetry + deprecation-queue scan types. Paper-tested at 87.5% coverage against the s550 redesign's 32 documented surfaces. This feature canonizes the protocol into `dw-lifecycle` so any project gets it. The audiocontrol pilot's repo-local copy becomes one adopter among many; the deskwork repo becomes the second adopter (the canary), exercising the canonization end-to-end against the in-flight `graphical-entries` feature.

## Solution

Move the audiocontrol-piloted Scope Discovery Protocol's CODE (scanners, validators, discovery agents, dispatch wrapper, Step 0 enforcement) into the `dw-lifecycle` plugin as plugin-shipped TypeScript modules, while leaving the CONFIG (dispositioned baselines + anti-patterns + adopter-manifests + editor-symmetry + deprecation-queue) project-owned at `<projectRoot>/.dw-lifecycle/scope-discovery/`. Add ~18 new `/dw-lifecycle:*` slash commands, update 5 existing skills (`define / implement / review / doctor / customize`) for auto-invocation at the right pipeline phase with per-phase opt-out flags. Pre-commit hook + dispatch wrapper + agent-prompt mirrors land as opt-in scaffolds via dedicated install skills. The deskwork repo itself becomes the second adopter (the canary, with audiocontrol's pilot the first); the in-flight `graphical-entries` feature provides the real-world validation case — its `/dw-lifecycle:setup` auto-runs `/scope-inventory` and the resulting paper-test coverage matrix is the v1 acceptance signal.

## Acceptance Criteria

- [ ] All ~18 new `/dw-lifecycle:*` slash commands exist and are discoverable via the Claude Code slash-command picker
- [ ] 5 existing skills (`define`, `implement`, `review`, `doctor`, `customize`) updated for auto-invocation + opt-out flags
- [ ] Plugin-shipped CODE at `plugins/dw-lifecycle/src/scope-discovery/`: scanners (clone-detector, anti-patterns, refactor-preconditions, deprecations, adopter-manifests, editor-symmetry), four universal discovery agents (ui-route-enumerator, ast-grep-matrix, clone-detector-reader, prd-themed-pattern-hunter), synthesis pass, three config-activated agents (regime-holdout-detector, editor-symmetry-scanner, adopter-manifest-checker), dispatch wrapper, Step 0 enforcement
- [ ] JSON Schemas for project CONFIG ship at `plugins/dw-lifecycle/src/scope-discovery/schema/` (clones.yaml, anti-patterns.yaml, adopter-manifests.yaml, migration-map.yaml, scope-manifest.yaml, config.yaml)
- [ ] Adversarial validator harnesses with gutted-stub self-check: clone-detector (4 scenarios), dispatch-wrapper (43 scenarios), anti-patterns, refactor-preconditions; `/dw-lifecycle:validate-scope-discovery` runs them all
- [ ] Step 0 enforcement: schema validator + parse-time + commit-time + dispatch-time; `canonical_side` + `canonical_reason` (4 branches) + `tests` + `tests_proof.sha` + `tests_proof.demonstration` (3 branches)
- [ ] Dispatch wrapper enforces `Searched/Included/Excluded` grammar + forbidden-deferral phrase list; refactor marker auto-appends `REFACTOR_PRECONDITIONS_CHECKLIST` prelude
- [ ] Pre-commit hook scaffold installable via `/dw-lifecycle:install-scope-discovery-hooks` with merge/replace/force flags + hooks-installed.json provenance
- [ ] Static agent-prompt mirrors installable via `/dw-lifecycle:install-agent-prompts`; canonical fragment is plugin-shipped `refactor-preconditions-checklist.md`; `/dw-lifecycle:doctor` checks drift
- [ ] Migration helper `/dw-lifecycle:migrate-from-pilot` reads audiocontrol's existing `tools/scope-discovery/` + `docs/scope-discovery/`; produces per-file contribute-back-vs-customize-override report
- [ ] Greenfield install path: `/dw-lifecycle:install-scope-discovery` bootstraps empty config dir + schemas + README pointer
- [ ] **Canary: deskwork-as-adopter install completes.** `.dw-lifecycle/scope-discovery/` exists in deskwork; baseline `clones.yaml` populated from initial detector run; deskwork-specific anti-patterns authored (hardcoded stage references, legacy `reviewState`, single-pipeline assumptions, `host`-required studio surfaces)
- [ ] **Canary: `graphical-entries` exercises the protocol.** `/dw-lifecycle:setup graphical-entries` auto-runs `/scope-inventory`; resulting manifest enumerates sibling sites; operator-reviewed-useful
- [ ] **Acceptance signal: paper-test coverage matrix.** `docs/1.0/001-IN-PROGRESS/scope-discovery/paper-test-graphical-entries.md` produced; combined coverage > ~80% against graphical-entries' documented surfaces. If below ~80%, design refinement before ship.
- [ ] Full test suite (vitest) passes for `@deskwork/plugin-dw-lifecycle` package; no regressions in existing dw-lifecycle skills

## Out of Scope

- **Plugin-extension-point intercept of the Agent tool.** Currently no Claude Code extension point allows a plugin to wrap every Agent invocation in an adopter project. v1 ships library-API + skill-prose convention; the intercept depends on upstream Claude Code work.
- **Studio surface for the clones backlog.** dw-lifecycle has no studio today. Captured as future work for whenever a dw-lifecycle studio lands.
- **Per-language scanners beyond TypeScript.** v1 supports `.ts/.tsx` (jscpd + ts-morph + ast-grep). Plug-in points exist for `.go`, `.py`, `.rs`, `.kt`, `.java`; language packs are subsequent features.
- **v2 enhancement-class discovery agents.** Per the pilot's "Honest limitations": `dom-visual-walker` (Playwright-driven), `a11y-audit` (axe-core), `vestigial-copy-audit`, `component-roster`. Each is its own future feature; the plugin's discovery-agent interface accepts additional agents without API changes.
- **CI integration for adopter projects.** v1 ships pre-commit gates as the default. Plugin documents a `.github/workflows/scope-discovery.yml` exemplar; adopters wire it themselves.
- **Cross-project rollup view.** Multi-repo organizations consume `dw-lifecycle scope-export --json`; the rollup UI is downstream.
- **CI test infrastructure for dw-lifecycle itself.** Per the deskwork project rule *"No test infrastructure in CI."* Local vitest only.

## Technical Approach

scope-discovery v1 ships in 10 phases. Plugin-side CODE phases land first (Phases 1–7), then install / migration / doctor wiring (Phases 8–9), then the deskwork canary install + `graphical-entries` paper-test deliverable (Phase 10 — the v1 acceptance signal). The full design rationale, schema specifications, dispatch wrapper enforcement rules, real-world validation case mapping, and risk analysis live in the design spec at `docs/superpowers/specs/2026-05-24-scope-discovery-design.md`. Plugin-default + project-override boundary per THESIS Consequence 3: CODE in plugin; CONFIG in project; per-file scanner overrides via `/dw-lifecycle:customize scope-discovery <name>`. Integration with the existing dw-lifecycle pipeline is hybrid: explicit slash commands + auto-invocation in `define/implement/review` with per-phase opt-out flags. Pre-commit hook + dispatch wrapper + agent-prompt mirrors are opt-in scaffolds (plugin does not reach into the adopter's `.githooks/` or wrap their Agent tool without explicit consent). Real-world validation: the in-flight `graphical-entries` feature becomes the canary. scope-discovery v1 ships BEFORE `graphical-entries` enters implementation (sequencing constraint). `graphical-entries'` `/dw-lifecycle:setup` auto-runs `/scope-inventory`; the resulting manifest enumerates sibling sites in deskwork's codebase (hardcoded stage references, legacy `reviewState` consumers, single-pipeline assumptions, comment-annotation readers, studio review-surface routes); Step 0 enforces refactor-preconditions on every clone group the lanes-and-templates refactor touches; dispatch wrapper engages on every sub-agent dispatched during implementation; `/scope-widen` handles mid-implementation operator complaints. Combined paper-test coverage > ~80% against `graphical-entries'` documented surfaces is the v1 acceptance signal.
