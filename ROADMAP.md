# Roadmap

Forward-looking plan for the deskwork project. Active initiatives, near-term planned work, and the long-term arc the architecture is converging toward. No dates — milestones, not deadlines.

For released history see [GitHub releases](https://github.com/audiocontrol-org/deskwork/releases). For the open backlog see [`gh issue list`](https://github.com/audiocontrol-org/deskwork/issues).

## Active initiatives (in-flight)

### Hygiene — recurring debt burndown infrastructure

A family of UNIX-style `/dw-lifecycle:*` skills (`debt-report`, `triage-issues`, `promote-deferrals`, `archive-branch`, `close-shipped`) that surface debt on demand and drive operator-triggered batched-proposal cycles. The skills share no persistent state — every skill reads live state (GitHub via `gh`, workplans via grep, branches via git) and mutates the same source-of-truth.

Phase 1 (`debt-report`) and Phase 2 (`triage-issues`) shipped to the in-flight `feature/hygiene` branch. Remaining phases (`promote-deferrals`, `archive-branch`, `close-shipped`, lifecycle integration, dogfood) are scoped in the feature's workplan.

**Why it's load-bearing:** closes the structural asymmetry between shipping and closing. Every release cycle ships substantive work + carefully tracked follow-ups; without recurring burndown the follow-ups rot. Hygiene mechanizes the closure half of the lifecycle.

Parent: [#323](https://github.com/audiocontrol-org/deskwork/issues/323).

### Graphical entries — image-based review workflow extension

Extends deskwork beyond longform markdown into image-review surfaces (annotated screenshots, design specs with image attachments, photo essays). Currently in Phase 6 (studio lane-management + pipeline-editor pages). Phase 7+ introduces groups (members[] schema + multi-lane composed views), annotation extensions (threads + spatial anchors), and the image review + iteration surfaces.

Serves as the canonical canary for the scope-discovery protocol. Phase 6 dogfood produced [#349](https://github.com/audiocontrol-org/deskwork/issues/349) feedback validating most surfaces; Phase 7 will produce the validation milestone for the [#318](https://github.com/audiocontrol-org/deskwork/issues/318) clustering algorithm against genuinely novel input.

Parent: [#301](https://github.com/audiocontrol-org/deskwork/issues/301).

## Planned next — multi-model audit barrage

The next major architectural extension to the scope-discovery protocol. Goal: replace the operator's manually-run codex audit with an automated battery that fires multiple LLMs against the same work, gives genetic diversity in failure modes, runs out-of-band so the implementation team focuses on features, and removes the audit-quality dependency on operator discipline.

### Motivation

The current audit posture has three layers:

| Layer | Cost | Signal |
|---|---|---|
| Self-audit via `/dw-lifecycle:implement` orchestrator loop | Token budget on current task | Lower — same model + same context blind to its own failure modes |
| Two-reviewer SDD cycle (spec + quality) | Sub-agent dispatch tokens | Medium-high — catches real bugs per canary [#349](https://github.com/audiocontrol-org/deskwork/issues/349) §1a |
| Manual codex audit (operator-run) | **Operator attention** | **High — different model finds what Claude misses** |

The operator-attention cost is the binding constraint. The codex audit demonstrably finds what Claude misses, but it requires manual invocation, manual copy-paste, manual finding-by-finding triage. Manual discipline doesn't scale. Automation removes the discipline dependency.

### Implementation posture — CLI-based, not API-based

The battery invokes installed CLI tools, NOT model APIs. Three reasons:

1. **Usage-based pricing** vs. token-based. Running a broad audit barrage against API endpoints accrues meaningful per-call cost. The CLIs are flat-rate.
2. **Authentication already configured.** No API-key handling, no rotation, no per-developer secret-store. The operator's existing CLI setup is the auth surface.
3. **Subprocess orchestration is a well-trodden path.** The plugin already shells out to `gh`, `git`, `npx tsx`, `jscpd`. Adding `claude`, `codex`, `gemini` is the same pattern.

### Design A — operator-triggered audit-barrage skill (v1 milestone)

The first shippable shape:

```
/dw-lifecycle:audit-barrage --feature <slug> [--range <vA>..<vB>] [--models <list>]
```

**Behavior:**
1. Computes the diff to audit: by default `<watermark>..<HEAD>` for the named feature, where `<watermark>` reads from the feature's audit-log; explicit `--range` overrides.
2. Composes a uniform audit prompt from `plugins/dw-lifecycle/templates/audit-barrage-prompt.md` (project-overridable at `.dw-lifecycle/scope-discovery/audit-barrage-prompt.md`). Prompt includes: feature slug, the diff, scope-discovery primitives in play, what to look for, audit-log entry-format expectation.
3. Fires N parallel CLI subprocess invocations:
   - `claude -p "<prompt>"`
   - `codex exec "<prompt>"`
   - `gemini -p "<prompt>"`

   Exact flag sets per CLI verified during implementation; falls back to `--prompt-file <path>` shape if any tool doesn't support stdin/argument prompt.
4. Captures each tool's stdout to `.dw-lifecycle/scope-discovery/audit-runs/<timestamp>-<feature>/<model>.md`.
5. Emits a summary index `.dw-lifecycle/scope-discovery/audit-runs/<timestamp>-<feature>/INDEX.md` listing the run + per-model exit status + file sizes.
6. Reports the run path. Operator reviews the per-model output + lifts high-signal findings into the canonical audit-log via the existing closure-workflow.

**Discipline shift:** operator's manual job changes from "remember to run the codex audit + copy-paste findings" to "review three structured raw audit files." The firing is automated; the triage is human.

**Model battery for v1:**

- **Claude family** (Sonnet 4.6 or current default). The baseline; same model class that runs in-band; included for cross-context comparison.
- **OpenAI Codex CLI** (`codex` binary). The operator's current manual baseline; demonstrably catches what Claude misses.
- **Google Gemini CLI** (`gemini` binary). Third family with independent training corpus; closes the diversity gap.

Project-config knob `.dw-lifecycle/scope-discovery/audit-barrage-config.yaml` lets adopters add / remove models without code changes.

**Acceptance signal:** one full audit-barrage run against an in-flight feature surfaces at least one finding that the in-band self-audit + the SDD review cycle didn't catch, confirmed by operator-side triage.

**Cost:** the implementation is small (~300 lines of TS + tests + the prompt template + the SKILL.md). Most of the work is testing the subprocess orchestration against real CLI behavior.

### Design B — lifecycle-triggered automation + meta-audit

Once Design A is stable and the operator has accumulated cross-model finding patterns, Design B layers:

1. **Auto-fire at lifecycle waypoints.** The audit-barrage runs automatically at `/dw-lifecycle:session-end`, `/dw-lifecycle:complete`, and `/release` Pause 5. No explicit operator invocation; the firing is tied to the natural shipping cadence.
2. **Meta-audit synthesizer.** After the N raw audit files land, a meta-audit pass runs a SINGLE LLM call against the raw runs with a synthesis prompt: *"rank these findings by confidence × actionability; de-duplicate; flag high-confidence cross-model agreement; emit a single structured findings block."*
3. **High-confidence auto-promote to audit-log.** Findings where M of N models converge get auto-lifted into the canonical audit-log as `Status: pending-operator-review`. Low-confidence findings stay in the raw runs dir.

**Discipline shift after Design B:** operator's review surface collapses from "three raw audit files per session" to "one meta-audit summary per release." The cross-model raw data is preserved as evidence; the operator's attention surface is dramatically smaller.

The meta-audit synthesizer is itself a CLI invocation (same pattern as the per-model audits — one extra subprocess at the end of the parallel barrage).

### Design C — continuous background audit daemon

A long-running process that watches for new commits and fires audit jobs continuously in the background. Audit-runs accumulate without explicit operator action; the orchestrator-loop reads them per-turn alongside the existing audit-log.

Most ambitious. Highest cost (continuous-audit run-rate). Highest decoupling (audits no longer tied to operator-driven shipping actions at all).

Design C is exploratory. The roadmap acknowledges it as the eventual end-state; commits to it only after Design A + B prove the model-diversity payoff justifies the always-on cost.

## Cross-cutting principles

These shape every roadmap item:

- **Capture mode vs. scope mode.** Specs capture exhaustively; scoping is an explicit operator-driven pass. Agents do not pre-cut scope during capture.
- **Just for now is bullshit.** No "TODO" / "fix later" / "stub for now" code comments. Either fix in place or file a GH issue with the deferral rationale.
- **Closure as structural step, not aspirational.** Shipping is rewarded; closure isn't, unless the lifecycle gates closure structurally. Hygiene closes this asymmetry.
- **Composition over new infrastructure.** Each new feature composes existing primitives (audit-log, tooling-feedback, dispatch-wrapper, controller, escalation surface, mediation) when possible.
- **Operator owns scope decisions.** The agent surfaces options + provenance + tradeoffs; the operator picks. Audit findings, closure dispositions, design picks — all operator-driven.
- **Adopters use only public paths.** No privileged dev shortcuts. Dogfood happens via the publicly-advertised marketplace install.

## Backlog signal

~100 open issues at the time of this roadmap. The hygiene feature's `debt-report` skill (Phase 1, shipped) surfaces the snapshot on demand:

```
dw-lifecycle debt-report
```

Categories:
- **Confirmed shipped-but-open** ([#284](https://github.com/audiocontrol-org/deskwork/issues/284), [#289](https://github.com/audiocontrol-org/deskwork/issues/289), [#292](https://github.com/audiocontrol-org/deskwork/issues/292)) — closure waits for `close-shipped` workflow (hygiene Phase 5).
- **Phase parent metadata** (17 of the open issues) — closure waits for the phase-parent closure gate (hygiene Phase 6 Task 4).
- **Real deferrals** (active features' planned work) — track via their respective workplans.
- **Adopter / studio / doctor bugs** — feed into next regular release cycles.

## Status of the protocol's own dogfood signal

The graphical-entries canary's tooling-feedback log surfaces friction items the protocol itself produces. v0.25.0 closed 10 of the canary's first 10 TF entries plus four follow-ups from [#349](https://github.com/audiocontrol-org/deskwork/issues/349) ([#350](https://github.com/audiocontrol-org/deskwork/issues/350), [#351](https://github.com/audiocontrol-org/deskwork/issues/351), [#352](https://github.com/audiocontrol-org/deskwork/issues/352)). The dogfood loop is the truth signal for whether the protocol earns its keep against real work; the loop is converging.
