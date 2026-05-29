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
| 6 | CLI subcommands (~20 new verbs) | In progress — 16 of ~20 verbs landed (adds `migrate-from-pilot` closing [#291](https://github.com/audiocontrol-org/deskwork/issues/291) on top of the prior 15: `check-clones` (with `detect-clones` back-compat alias), `check-anti-patterns`, `check-adopters`, `check-refactor-preconditions`, `scope-inventory`, `check-editor-symmetry`, `batch-dispose`, `check-disposition-survivor`, `scope-summary`, `check-deprecations`, `validate-scope-discovery`, `scope-export`, `refresh-clones-baseline`, `dispose-clone`, `scope-widen`); `--gate-mode` flag landed on all four check-* subcommands. |
| 7 | Slash command skill prose (~18 new + 5 updated) | In progress (19 of 19 new skills authored — adds `migrate-from-pilot` for [#291](https://github.com/audiocontrol-org/deskwork/issues/291); 4 install-related landed in Phase 8; `scope-widen` skill landed alongside the verb implementation per [#292](https://github.com/audiocontrol-org/deskwork/issues/292); Task 2 updated-skill prose now 5/5 — `/dw-lifecycle:implement` documents auto-scope-widen + dispatch-wrapper engagement + `--no-scope-widen`). Phase 11 Task 12 added inventory-vs-discovery thesis paragraphs to `scope-inventory`, `scope-widen`, `check-anti-patterns`, `check-adopters`, `check-deprecations`, `check-editor-symmetry` skills. |
| 8 | Install / migrate / uninstall machinery | In progress — 5 of 5 install commands landed (`install-scope-discovery`, `install-scope-discovery-hooks`, `install-agent-prompts`, `uninstall-scope-discovery-hooks`, `migrate-from-pilot` closing [#291](https://github.com/audiocontrol-org/deskwork/issues/291)). 821/821 tests pass. |
| 9 | Doctor rule additions | Complete (8 doctor rules added; repair hints + selective --fix support; 737/737 tests pass — 2 pre-existing failures unchanged) |
| 10 | Canary install + graphical-entries paper-test + v1 dogfood handoff | Shipped at v1 — 60.9% paper-test coverage measured; ship-gate reframed to dogfood feedback via graphical-entries (TF log). Friction tracked at issues [#293](https://github.com/audiocontrol-org/deskwork/issues/293)-[#296](https://github.com/audiocontrol-org/deskwork/issues/296); pilot-import follow-ups at [#284](https://github.com/audiocontrol-org/deskwork/issues/284) (amend), [#285](https://github.com/audiocontrol-org/deskwork/issues/285) (amend), [#288](https://github.com/audiocontrol-org/deskwork/issues/288)-[#290](https://github.com/audiocontrol-org/deskwork/issues/290). |
| 12 | Multi-model audit barrage ([#353](https://github.com/audiocontrol-org/deskwork/issues/353); ROADMAP.md § "Audit-barrage feature shape" Design A) | Not started — captured in workplan; PRD approved 2026-05-29. NEW `/dw-lifecycle:audit-barrage` CLI verb + skill that fires `claude`, `codex`, `gemini` CLIs in parallel against a feature's recent work; persists raw per-model output under `.dw-lifecycle/scope-discovery/audit-runs/<timestamp>-<feature>/`; surfaces operator-side triage workflow. Goal: replace operator's manually-run codex audit with automated cross-model coverage; genetic diversity in audit failure modes; runs out-of-band so implementation team focuses on features; removes audit-quality dependency on operator discipline. Design B (auto-fire at lifecycle waypoints + meta-audit synthesizer) and Design C (continuous background daemon) deferred to follow-ups. CLI-based not API-based per ROADMAP rationale (usage-based pricing, existing CLI auth, established subprocess pattern). 7 tasks captured. |
| 13 | Audit-finding lifecycle — anti-deferral discipline + workplan promotion ([#355](https://github.com/audiocontrol-org/deskwork/issues/355); extension 2026-05-29) | In progress — Task 1 landed (`9bd4247` + review-fix `b02a224`). NEW `/dw-lifecycle:promote-findings` skill + CLI + library: walks audit-log for `Status: open`; default disposition is "scope into workplan as TDD-first fix task"; agent CANNOT pick deferral. Propose-then-apply protocol with atomic all-or-nothing pre-validation; substantive-reason validator (≥40 chars; banned-phrase canon from hygiene + PRD-mandated additions); workplan idempotency guard via `(fix-finding-<id>):` marker; audit-log editor restricted to field-block boundary (no body-prose false-match); deterministic insertion tiebreaker for equal anchors; informational disposition rejects blank rationale. 96 promote-findings tests; plugin suite at 2097/2097. Code review surfaced 2 BLOCKING + 3 HIGH findings on Task 1; all addressed inline + regression tests. Tasks 2 (implement-loop refusal gate), 3 (mechanical TDD enforcement), 4 (closure-side automation), 5 (live verification + dogfood), 6 (cross-references) remain. |
| 14 | Friction-fix sweep — `feature/deskwork-plugin` TF log imports (operator decision 2026-05-29) | In progress — AUDIT-20260529-12..15 imported from deskwork-plugin/tooling-feedback.md (TF-002/003/004/005); hygiene-feature TF entries (deskwork-plugin TF-001 → [#361](https://github.com/audiocontrol-org/deskwork/issues/361); hygiene TF-001 validate-return refactor-cue) claimed by `feature/hygiene`. Four fix tasks scoped per Phase 13 anti-deferral discipline: Task 1 quiets the orchestrator-turn 3/6 NOTE (AUDIT-12); Task 2 relaxes validate-return grammar false-positives (AUDIT-13, [#362](https://github.com/audiocontrol-org/deskwork/issues/362) Medium); Task 3 adds `--response-file -` stdin (AUDIT-14, [#362](https://github.com/audiocontrol-org/deskwork/issues/362) Light); Task 4 verifies TF-005 fix lands on merge (AUDIT-15, `fixed-37683c8` on `feature/deskwork-plugin`). All four tasks pending. |
| 11 | Pattern discovery loop with self-correcting controller ([#316](https://github.com/audiocontrol-org/deskwork/issues/316)) | In progress — Tasks 1, 2, 3, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14 landed. **KeygroupSummary-shape acceptance criterion now met** — end-to-end repro test at `plugins/dw-lifecycle/src/__tests__/scope-discovery/phase-11-acceptance/keygroup-summary-repro.test.ts` simulates the dogfood pass (BEFORE inventory-only blind to the gap → AFTER Phase 11 loop catches it) and emits a `DOGFOOD GAP SIGNAL` block to stdout. Full plugin suite at 1295/1295. **Task 12: naming alignment** resolved 2026-05-26 via hybrid option — `scope-inventory` retains its operator-facing name; new `discovery-agents/README.md` documents the inventory-vs-discovery agent fleet split; new `synthesis-report.ts` module surfaces three operator-visible categories (registered-pattern match / discovered candidate / novel-shape candidate) in `synthesis.md` evidence-trail + scope-inventory + scope-widen + synthesis-cli stderr summaries; SKILL.md prose updated across `scope-inventory`/`scope-widen`/`check-anti-patterns`/`check-adopters`/`check-deprecations`/`check-editor-symmetry` to make the inventory-vs-discovery distinction explicit; agent-discipline rule "Inventory vs discovery — how to read scope-discovery reports" documents the operator-discipline cue + the failure mode it closes (KeygroupSummary-shape regression shipping because a green inventory report was read as "no anti-patterns"); 10 new vitest scenarios in `synthesis-report.test.ts`. Task 13: multi-content-type generality — scan engine + catalog schema verified content-type-agnostic across `.ts/.tsx`, `.md/.markdown`, `.css/.scss`, `.html/.htm`, `.yaml/.yml`, `.json`. Task 6: `/dw-lifecycle:implement` augmented with the autonomous per-turn audit/judge stack — `runOrchestratorTurn` library at `plugins/dw-lifecycle/src/scope-discovery/orchestrator-loop/` composes Tasks 2-11 into a deterministic cycle. Prior task highlights — Task 1: polymorphic pattern-handler dispatcher (regex / negative-space / coverage / outlier / semantic) with KeygroupSummary repro from [#315](https://github.com/audiocontrol-org/deskwork/issues/315); G5 + G6 stubs at [#318](https://github.com/audiocontrol-org/deskwork/issues/318) / [#319](https://github.com/audiocontrol-org/deskwork/issues/319). Task 2: Loop foundation — `status:` + `provenance:` on every registry-driven catalog entry; reversibility primitive; new doctor rule `catalog-entry-missing-status`. Task 11: cross-surface uniformity — editor-symmetry-matrix filters non-active adopter-manifest rows; regime-holdout-detector stamps `status_provenance` on every finding. Task 14: tooling-feedback closure → audit-log import workflow with `/dw-lifecycle:tooling-feedback-import`. Task 4 remains. |

## v1 Ship + Dogfood Handoff

Phase 10 produced a 60.9% paper-test coverage measurement (33/35 surfaces caught by `scope-inventory`, 27/35 by Step 0 refactor-precondition enforcement, 4/35 by the deskwork-specific anti-pattern starter set; `scope-widen` deferred). Operator decision 2026-05-25: ship v1 at measured coverage with the ship gate reframed from "coverage percentage" to "dogfood feedback from the graphical-entries implementation team." This mirrors the audiocontrol pilot pattern that produced 16 TF entries over two months and hardened the protocol via the audit cycle on that log.

- **Dogfood handoff README:** [`../graphical-entries/dogfood-handoff.md`](../graphical-entries/dogfood-handoff.md)
- **Tooling-feedback log (graphical-entries team adds entries as friction surfaces):** [`../graphical-entries/tooling-feedback.md`](../graphical-entries/tooling-feedback.md)
- **Template (for future adopters):** [`../../../../plugins/dw-lifecycle/templates/scope-discovery/tooling-feedback.md`](../../../../plugins/dw-lifecycle/templates/scope-discovery/tooling-feedback.md)
- **Agent-discipline rule:** `.claude/rules/agent-discipline.md` § "scope-discovery v1 — dogfood feedback via tooling-feedback.md"

### Open follow-ups (operator-visible)

Phase 10 friction (newly filed):
- [#293](https://github.com/audiocontrol-org/deskwork/issues/293) — `.jscpd.json` config-path mismatch on install
- [#294](https://github.com/audiocontrol-org/deskwork/issues/294) — `install-scope-discovery-hooks` hardcodes binary path
- [#295](https://github.com/audiocontrol-org/deskwork/issues/295) — hook chain writes unsupported `check-editor-symmetry --gate-mode` flag
- [#296](https://github.com/audiocontrol-org/deskwork/issues/296) — anti-pattern starter-set expansion

Pilot-import follow-ups (already-deferred):
- [#284](https://github.com/audiocontrol-org/deskwork/issues/284) — batch-dispose paste-ready hint (amended from TF-014)
- [#285](https://github.com/audiocontrol-org/deskwork/issues/285) — pattern-type dispatcher + `negative_match_classes:` schema (amended from TF-015)
- [#288](https://github.com/audiocontrol-org/deskwork/issues/288) — anti-pattern `canonical_file` field (TF-002)
- [#289](https://github.com/audiocontrol-org/deskwork/issues/289) — disposition-survivor gate hook-chain integration (TF-013)
- [#290](https://github.com/audiocontrol-org/deskwork/issues/290) — primitive-extraction dispatch hygiene (TF-016)

Operator-deferred (now resolved):
- [#291](https://github.com/audiocontrol-org/deskwork/issues/291) — `migrate-from-pilot` landed; verb reads the pilot's `tools/scope-discovery/` + `docs/scope-discovery/`, copies CONFIG verbatim, diffs CODE per-file against the plugin defaults, and emits a contribute-back-vs-customize-override report. 38 vitest scenarios; smoke-tested against the audiocontrol pilot.

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
