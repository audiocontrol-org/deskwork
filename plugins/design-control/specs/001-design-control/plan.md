---
slug: design-control
targetVersion: "1.0"
date: 2026-06-05
branch: feature/design-control
parentIssue: 424
---

# Implementation Plan: design-control — portable UX/UI surface-change discipline

> Ported 2026-06-10 from the dw-lifecycle feature README (`docs/1.0/001-IN-PROGRESS/design-control/README.md`;
> git history preserves the original) into the stack-control regime. The phase status table that
> lived in the README is NOT duplicated here — phase-level status lives in the plugin
> [`ROADMAP.md`](../../ROADMAP.md); fine-grained task status lives in [`tasks.md`](tasks.md).

> **Read [`DESIGN-DISCIPLINE-THESIS.md`](../../../../DESIGN-DISCIPLINE-THESIS.md) first — every session.**
> Its opening section ("the lifecycle philosophy") is the WHY beneath this whole plugin:
> agents are capable-but-unreliable, so *policy is enforced by a process, not a rule* —
> engineer the crib, use stochastic correctness (cross-model audit-barrage) + scope-discovery,
> and never roll your own verification. Everything in this feature is that philosophy applied
> to UX/UI surface changes. (Sibling: the **stack-control** plugin; source essay:
> <https://stackcontrol.org/blog/the-lifecycle-and-why-agents-need-one/>.)

## Summary

A deskwork marketplace plugin that productizes a hard-won UX/UI surface-change discipline as
**workflow tooling orchestrating an existing engine — `/frontend-design` — with NO roll-your-own
visual-verification engine.** It fixes the failure mode where changing a UI surface "blind"
degenerates into a screenshot-by-screenshot correction loop (audiocontrol S-550: ~32 surfaces
entered scope, zero found proactively): mockups did double duty (UX + visual design), so stale
detail shipped as if intended and visual identity had no durable home. The discipline threads
`/frontend-design` through three concerns anchored by two durable reference artifacts — a
deliberately **lo-fi wireframe** (UX *spirit*) and a **design-language spec** (visual *letter*) —
and verifies by *looking*: author a wireframe → operator picks → translate intent into the local
design language → implement → referee a screenshot against spirit + letter (advisory evidence,
never a gate). v1 ships in two modes: **`v1-scaffold`** (wireframe kit + allowlist lint +
design-language spec + archive + `status`; zero referee dependency) and a gated
**`v1-referee-preview`** (the advisory referee, which must earn trust via an adversarial
falsification set).

See [`spec.md`](spec.md) for the full design-of-record and
[`docs/superpowers/specs/2026-06-04-design-control-design.md`](../../../../docs/superpowers/specs/2026-06-04-design-control-design.md)
for the converged design (11 audit-barrage rounds → two consecutive zero-HIGH).

## Technical Context

- **Language/runtime:** TypeScript strict, `@/` imports, no `any`/`as`/`@ts-ignore`, files
  < 300–500 lines, no fallbacks/mock-data outside tests (throw instead).
- **Tests:** `npm --workspace @deskwork/plugin-design-control test` runs `tsc --noEmit && vitest`.
  TDD-shaped: each task writes failing tests first, then minimal implementation.
- **Build order is inverted:** ship the scaffold (Phases 1–4) first with zero referee risk; build
  the referee (Phase 5) last as a constrained evidence-spike, gated on its falsification set.
  Until Phase 5's adversarial set passes, referee output is optional evidence and no "catches
  these cases" claim ships.
- **Enforcement lives in skills / CLI verbs, never git hooks** (per
  `.claude/rules/enforcement-lives-in-skills.md`).
- **Orchestrate existing engines, don't build them:** `/frontend-design` is the engine for the
  authoring concerns; the referee is a cross-model audit-barrage (see the spec's DESIGN
  AMENDMENT). Any UI/CSS authored here (the sketch-kit) is a static lo-fi convention.

## Project Structure

### Documentation (this feature)

```text
plugins/design-control/specs/001-design-control/
├── spec.md               # design-of-record (ported PRD, operator-approved)
├── plan.md               # this file
├── tasks.md              # phase/task breakdown with checkbox status (ported workplan)
├── audit-log.md          # append-only audit-barrage findings log
├── tooling-feedback.md   # append-only tooling-friction log (TF-001…)
├── scope-manifest.yaml   # scope-discovery manifest
├── scope-inventory/      # scope-inventory run records
└── mockups/sketch-kit/   # sketch-kit theme exploration (DECISION.md = operator pick)
```

### Source Code (plugin root)

```text
plugins/design-control/
├── src/wireframe-kit/    # sketch-kit SSOT module (assets, vocabulary, themes)
├── src/lint/             # check-mockup-lofi: dual-axis allowlist lint
├── src/design-language/  # spec schema, link-liveness, and spec-file validation
├── src/archive/          # ACCEPTED/REJECTED archive primitives + persistence
├── src/status/           # design-control status gates over artifact/manifest state
├── src/manifests/        # referee-request manifest schema + validators
├── src/referee/          # barrage prompt/templates + preview-mode orchestration seams
├── src/capture/          # baseline/capture contracts and stable-region helpers
├── src/provenance/       # driving-vs-derived artifact provenance and acceptance checks
├── skills/               # operator-facing skill surfaces shipped with the plugin
├── bin/                  # public command shims and validation entrypoints
├── assets/               # sketch-kit.css + bundled OFL webfonts
└── audit/                # re-runnable lint adversarial-barrage prompt + script
```

## Key Links

- Branch: `feature/design-control` (based on `feature/deskwork-plugin` — inherits the design-control
  kickoff docs + the sites→lanes content-browser/scrapbook work that is the Phase 6 dogfood target)
- Spec (design-of-record): [`spec.md`](spec.md)
- Tasks: [`tasks.md`](tasks.md)
- Roadmap (phase-level status): [`../../ROADMAP.md`](../../ROADMAP.md)
- Converged design: [`docs/superpowers/specs/2026-06-04-design-control-design.md`](../../../../docs/superpowers/specs/2026-06-04-design-control-design.md)
- Thesis: [`DESIGN-DISCIPLINE-THESIS.md`](../../../../DESIGN-DISCIPLINE-THESIS.md)
- Parent Issue: [#424](https://github.com/audiocontrol-org/deskwork/issues/424)
