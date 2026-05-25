---
slug: scope-discovery
targetVersion: "1.0"
date: 2026-05-25
branch: feature/scope-discovery
parentIssue: "#273"
designSpec: docs/superpowers/specs/2026-05-24-scope-discovery-design.md
canary: graphical-entries
---

# Feature: scope-discovery

Canonize the audiocontrol-piloted Scope Discovery Protocol into the `dw-lifecycle` plugin so any project using dw-lifecycle gets it. Plugin holds CODE (scanners, validators, discovery agents, dispatch wrapper, Step 0 enforcement); project holds CONFIG (clones.yaml, anti-patterns.yaml, adopter-manifests.yaml, etc.) per THESIS Consequence 3. New slash commands compose into the existing `/dw-lifecycle:define/implement/review/doctor/customize` pipeline with per-phase opt-out flags. Pre-commit hook + dispatch wrapper + agent-prompt mirrors land as opt-in scaffolds. The in-flight `graphical-entries` feature becomes the canary — v1 ships BEFORE graphical-entries enters implementation, and the v1 acceptance signal is a paper-test coverage matrix (combined coverage > ~80%) against graphical-entries' documented surfaces. Audiocontrol pilot motivation: 60 hours / 230 turns of brute-force discovery in May 2026 that the agent should have done in 10–15 minutes at session start; the protocol treats agent-side enforcement as code, not directives.

## Status

| Phase | Description | Status |
|---|---|---|
| 1 | Plugin-side scanner core (clone-detector) | Complete (acceptance gate green; 347/347 tests pass) |
| 2 | Anti-patterns + refactor-preconditions + adopter-manifests scanners | Complete (401/401 tests pass; all 4 scanner subcommands registered) |
| 3 | Four universal discovery agents + synthesis pass | Complete (415/415 tests pass; scope-inventory orchestrates 4 agents + manifest-validator; YAML override loader honored) |
| 4 | Config-activated discovery agents | Complete (438/438 tests pass; regime-holdout-detector / editor-symmetry-scanner / adopter-manifest-checker config-activated; three Phase 4 agents pay zero cost when activator files are absent) |
| 5 | Dispatch wrapper + skill-prose convention template | Complete (495/495 tests pass; `wrap()` library API + forbidden-deferral overrides + refactor-marker auto-prelude + skill-prose template shipped) |
| 6 | CLI subcommands (~20 new verbs) | In progress — 14 of ~20 verbs landed (`detect-clones`, `check-anti-patterns`, `check-adopters`, `check-refactor-preconditions`, `scope-inventory`, `check-editor-symmetry`, `batch-dispose`, `check-disposition-survivor`, `scope-summary`, `check-deprecations` (shell; scan port pending [#287](https://github.com/audiocontrol-org/deskwork/issues/287)), `validate-scope-discovery`, `scope-export`, `refresh-clones-baseline`, `dispose-clone`); `--gate-mode` flag landed on all four check-* subcommands; `scope-widen` + Task 4 install/migrate/uninstall verbs pending. |
| 7 | Slash command skill prose (~18 new + 5 updated) | Not started |
| 8 | Install / migrate / uninstall machinery | Not started |
| 9 | Doctor rule additions | Not started |
| 10 | Canary install + graphical-entries paper-test deliverable (v1 acceptance signal) | Not started |

## Key Links

- Branch: `feature/scope-discovery`
- Worktree: `/Users/orion/work/deskwork-work/scope-discovery`
- PRD: `prd.md`
- Workplan: `workplan.md`
- Design spec: `../../../superpowers/specs/2026-05-24-scope-discovery-design.md`
- Audiocontrol pilot (source-of-truth): `~/work/audiocontrol-work/audiocontrol-scope-discovery-protocol/`
- Pilot's canonical README: `~/work/audiocontrol-work/audiocontrol-scope-discovery-protocol/docs/scope-discovery/README.md`
- Parent Issue: (to be filed by `/dw-lifecycle:issues`)
- **Canary feature**: `graphical-entries` (spec at `docs/superpowers/specs/2026-05-16-graphical-entries-design.md`)

## Sequencing constraint

scope-discovery v1 ships BEFORE `graphical-entries` enters implementation. The two features are temporally coupled: graphical-entries' `/dw-lifecycle:setup` auto-invokes `/scope-inventory`, which is what the canary exercises. If scope-discovery v1 isn't ready when graphical-entries needs to start, the canary doesn't run and v1 loses its acceptance signal.
