# Roadmap

Forward-looking plan for the deskwork project. Active initiatives, near-term planned work, and the long-term arc the architecture is converging toward. No dates — milestones, not deadlines.

For released history see [GitHub releases](https://github.com/audiocontrol-org/deskwork/releases). For the open backlog see [`gh issue list`](https://github.com/audiocontrol-org/deskwork/issues).

## Recently shipped

### Decompose `agent-discipline.md` (566 → 157 lines)

Shipped as the `decompose-agent-discipline` feature (parent [#388](https://github.com/audiocontrol-org/deskwork/issues/388); merged via PR [#391](https://github.com/audiocontrol-org/deskwork/pull/391)). Docs at `docs/1.0/003-COMPLETE/decompose-agent-discipline/`.

Triaged all 21 rule entries to their most effective home: 3 deletes (dead/stale/bait-removed), 2 TDD tool-fixes (`--no-tailscale` deprecated no-op + `DESKWORK_STUDIO_NO_TAILSCALE` env hatch; frontmatter namespace write-guard), pointer-shrinks of entries whose skill bodies already owned the text, composition into skill bodies (`implement`/`setup`/`issues`/`scope-inventory`/`complete`/`define`/`deskwork:iterate`/`deskwork:approve`), and minimum-form stays-shrunk for irreducible always-on defaults. Entry 12 ("Just for now") left untouched per operator decision. Post-merge audit-barrage surfaced + fixed a security-posture inversion in the `--no-tailscale` change (AUDIT-01) that the green test suite missed. Spun off [#387](https://github.com/audiocontrol-org/deskwork/issues/387) (retire review/audit skills) and [#392](https://github.com/audiocontrol-org/deskwork/issues/392) (promote-findings non-code task shape).

### Audit-barrage — multi-model parallel auditing (Design A)

Shipped as Phase 12 of the scope-discovery feature (parent [#353](https://github.com/audiocontrol-org/deskwork/issues/353)).

A pair of CLI verbs — `dw-lifecycle audit-barrage-render` + `dw-lifecycle audit-barrage` — that fire N installed CLI tools (`claude`, `codex`, `gemini`, plus whatever else the operator configures) in parallel against a uniform audit prompt and capture per-model stdout to `.dw-lifecycle/scope-discovery/audit-runs/<timestamp>-<feature>/<model>.md`. The operator walks the run dir during triage and lifts findings into the canonical feature audit-log via the existing closure workflow.

This is the **third independent audit surface** in the project's audit posture. The first is the in-band self-audit (same model + same context); the second is the SDD two-reviewer cycle (`/dw-lifecycle:review`); the third is this audit-barrage (multiple model families running independently). The three are additive — the barrage does NOT replace the other two; it adds genetic diversity in failure modes.

Primitives shipped:

- `dw-lifecycle audit-barrage-render` — pure prompt-rendering verb (template + vars JSON → rendered audit prompt); project-override at `.dw-lifecycle/scope-discovery/audit-barrage-prompt.md` precedes plugin default.
- `dw-lifecycle audit-barrage` — parallel CLI fan-out verb; model battery loaded from `.dw-lifecycle/scope-discovery/audit-barrage-config.yaml` (override) or plugin default; per-model stdout / stderr / exit-code captured under run-dir.
- `/dw-lifecycle:audit-barrage` skill prose covering invocation workflow + triage steps + override paths.
- `/dwab` (Scheme A) / `/dw-ab` (Scheme B) / `/dw-audit-barrage` (Scheme C) shortcut via `install-shortcuts`.
- Schema-validated YAML config at `scope-discovery/schema/audit-barrage-config.yaml.schema.json`.
- Local smoke `scripts/smoke-audit-barrage.sh` (NOT wired into CI per project rule).

**Acceptance signal met overwhelmingly.** The Phase 12 self-dogfood (audit-barrage feature auditing itself) surfaced 4 cross-model HIGH-confidence findings + 7 single-model findings, ALL of which the in-band self-audit + the SDD review cycle missed. See `docs/1.0/001-IN-PROGRESS/scope-discovery/audit-log.md` § "2026-05-29 — Phase 12 audit-barrage self-dogfood" for the canonical record.

Design A primitives are the foundation Design B (lifecycle auto-fire + meta-audit synthesizer) and Design C (continuous background daemon) compose over. See § "Audit-barrage feature shape" below for the long-term arc.

### Hygiene — recurring debt burndown infrastructure

Shipped across v0.26.0 → v0.26.5 (parent [#323](https://github.com/audiocontrol-org/deskwork/issues/323) closed; all phase issues [#324](https://github.com/audiocontrol-org/deskwork/issues/324)–[#333](https://github.com/audiocontrol-org/deskwork/issues/333) + [#343](https://github.com/audiocontrol-org/deskwork/issues/343) closed).

A family of UNIX-style `/dw-lifecycle:*` skills that surface debt on demand and drive operator-triggered batched-proposal cycles. The skills share no persistent state — every skill reads live state (GitHub via `gh`, workplans via grep, branches via git) and mutates the same source-of-truth. Skills shipped:

- `dw-lifecycle:debt-report` — read-only cross-source debt snapshot
- `dw-lifecycle:triage-issues` — batched-proposal cycle for stale issues
- `dw-lifecycle:promote-deferrals` — workplan TBD → GH issue or substantive-reason inline
- `dw-lifecycle:archive-branch` — preserve-work-then-delete for parked branches
- `dw-lifecycle:close-shipped` — release-time pending-verification labeling, with 4-source evidence walker (commit-log + audit-log + tooling-feedback + workplan checkboxes)
- Lifecycle integration: `session-end-hygiene`, `session-start-recommendation`, `complete-parent-closure`
- npm Trusted Publisher CI workflow (no per-developer OTP for `make publish`)

**Why this closed a structural problem:** shipping was rewarded; closure wasn't, unless the lifecycle gated closure structurally. Hygiene mechanized the closure half of the lifecycle so it can't be skipped without explicit override.

The hygiene feature's documents still live at `docs/1.0/001-IN-PROGRESS/hygiene/` pending the `/dw-lifecycle:complete` invocation that would move them to `003-COMPLETE/`. That's a paperwork follow-up; the substantive work is shipped and reachable on the registry.

## Active initiatives (in-flight)

### Graphical entries — image-based review workflow extension

Extends deskwork beyond longform markdown into image-review surfaces (annotated screenshots, design specs with image attachments, photo essays). Currently in Phase 6 (studio lane-management + pipeline-editor pages). Phase 7+ introduces groups (members[] schema + multi-lane composed views), annotation extensions (threads + spatial anchors), and the image review + iteration surfaces.

Serves as the canonical canary for the scope-discovery protocol. Phase 6 dogfood produced [#349](https://github.com/audiocontrol-org/deskwork/issues/349) feedback validating most surfaces; Phase 7 will produce the validation milestone for the [#318](https://github.com/audiocontrol-org/deskwork/issues/318) clustering algorithm against genuinely novel input.

Parent: [#301](https://github.com/audiocontrol-org/deskwork/issues/301) (still open).

## Audit-barrage feature shape

Design A — operator-triggered audit-barrage skill — shipped as Phase 12 of scope-discovery (parent [#353](https://github.com/audiocontrol-org/deskwork/issues/353)); see "Recently shipped" above for the primitives and acceptance-signal evidence. This section is the long-term arc; Design B and Design C compose over the v1 primitives.

Goal of the family: replace the operator's manually-run codex audit with an automated battery that fires multiple LLMs against the same work, gives genetic diversity in failure modes, runs out-of-band so the implementation team focuses on features, and removes the audit-quality dependency on operator discipline.

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

### Design A — operator-triggered audit-barrage skill (SHIPPED)

The first shippable shape. Now live as Phase 12 of scope-discovery. Operator workflow is the verb pair `dw-lifecycle audit-barrage-render` → `dw-lifecycle audit-barrage`:

```
/dw-lifecycle:audit-barrage --feature <slug> [--prompt-file <path>] [--models <list>]
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

### Design A.5 — Phase 13 anti-deferral discipline + closure triad (SHIPPED)

Phase 13 of scope-discovery ships the **anti-deferral mechanization layer** that pairs structurally with Design A. Where Design A produces audit findings (via the cross-model barrage), Design A.5 ensures every open finding gets worked through to completion without manual status-flip discipline:

| Verb | Status transition | Spec |
|---|---|---|
| `/dw-lifecycle:promote-findings` | walks `Status: open`; default-and-only-agent-pickable disposition is "scope into workplan as TDD-first task". | Phase 13 Task 1. |
| `dw-lifecycle check-open-findings` (implement-loop gate) | refuses `/dw-lifecycle:implement` task pickup while any open finding exists. No bypass flag. | Phase 13 Task 2. |
| `dw-lifecycle check-fix-task-tdd` + `fix-task-tdd-discipline` doctor rule | refuses `Closes AUDIT-<id>` commits without a passing test cited by the matching workplan task block. | Phase 13 Task 3. |
| `dw-lifecycle apply-audit-flips` | `open → fixed-<sha>` from commit `Closes AUDIT-<id>` references. | Phase 13 Task 4 Step 2. |
| `dw-lifecycle close-shipped-audit-findings` | `fixed-<sha> → verified-<date>` via release-range SHA membership; default dry-run. | Phase 13 Task 4 Step 1. |
| `/dw-lifecycle:re-audit-fixed-findings` | `fixed-<sha> → verified-<date>` via empirical re-audit non-surfacing; flags re-surfacing fixes. | Phase 13 Task 4 Step 3. |

**Operator's framing (the anchor):** *"Filing a bug report isn't good enough. It MUST BE SCOPED INTO THE WORKPLAN, otherwise it won't get picked up by the implementation loop. (...) A broken implementation is not done — it's broken. And, along with the discipline to scope the fix, TDD principles should apply such that a test that exercises the bug is written before the fix is implemented."*

Design B builds on this foundation. The auto-fire waypoints Design B adds will route findings through promote-findings → workplan → TDD-enforced implement loop → apply-audit-flips → close-shipped-audit-findings / re-audit-fixed-findings naturally, with no manual disposition steps. Design A.5 is the discipline layer; Design B is the cadence layer on top.

### Design B — lifecycle-triggered automation + meta-audit (NEXT)

Design A's primitives (verb pair `audit-barrage-render` + `audit-barrage`, project-override paths, run-dir conventions, INDEX.md schema, model battery YAML) are the foundation Design B composes over. Design B is the next major architectural extension to the family — it adds (a) automatic firing tied to lifecycle waypoints and (b) a meta-audit synthesizer that compresses the N raw model outputs to a single ranked-findings summary the operator triages instead of the raw runs.

Design B composes additionally over the hygiene feature's lifecycle-integration primitives (`session-end-hygiene`, `session-start-recommendation`, `complete-parent-closure`, `close-shipped`) — the auto-fire gates already exist as natural extension points:

1. **Auto-fire at lifecycle waypoints.** The audit-barrage runs automatically at `/dw-lifecycle:session-end`, `/dw-lifecycle:complete`, and `/release` Pause 5. No explicit operator invocation; the firing is tied to the natural shipping cadence. Each gate already invokes hygiene helpers; the audit-barrage hook lands as a sibling step.
2. **Meta-audit synthesizer.** After the N raw audit files land, a meta-audit pass runs a SINGLE LLM call against the raw runs with a synthesis prompt: *"rank these findings by confidence × actionability; de-duplicate; flag high-confidence cross-model agreement; emit a single structured findings block."*
3. **High-confidence auto-promote to audit-log.** Findings where M of N models converge get auto-lifted into the canonical audit-log as `Status: pending-operator-review`. Low-confidence findings stay in the raw runs dir.

**Discipline shift after Design B:** operator's review surface collapses from "three raw audit files per session" to "one meta-audit summary per release." The cross-model raw data is preserved as evidence; the operator's attention surface is dramatically smaller.

The meta-audit synthesizer is itself a CLI invocation (same pattern as the per-model audits — one extra subprocess at the end of the parallel barrage).

### Design C — continuous background audit daemon

A long-running process that watches for new commits and fires audit jobs continuously in the background. Audit-runs accumulate without explicit operator action; the orchestrator-loop reads them per-turn alongside the existing audit-log.

Most ambitious. Highest cost (continuous-audit run-rate). Highest decoupling (audits no longer tied to operator-driven shipping actions at all).

Design C is exploratory. The roadmap acknowledges it as the eventual end-state; commits to it only after Design A + B prove the model-diversity payoff justifies the always-on cost.

## Autonomous implementation loop — long-term arc

The deskwork lifecycle skills (`/dw-lifecycle:implement`, `/dw-lifecycle:review`, `/dw-lifecycle:ship`, hygiene family, audit-barrage triad) are converging toward a single end-state vision the operator has named explicitly:

> *"A fully autonomous implementation loop that is self-regulating and self-correcting. Ultimately, I want to be able to point an orchestrator agent at a workplan, fire off `/dwi`, then come back when the entire workplan is fully implemented, fully tested, and fully audited — unless there are ambiguities in the spec uncovered during execution that can only be resolved by asking the operator to provide direction."*

Every recent Phase has been a piece of this. The pieces aren't a feature backlog in their own right — they're the mechanization of *"the operator's toolkit evolves under your direction"* extended to multi-task autonomous operation.

### What's in place

| Phase / mechanism | Role in the autonomous loop |
|---|---|
| Workplan-aware gate (Phase 15 T1) | Refuses pickup when open findings aren't the next N tasks → loop can't drift |
| End-of-task audit-barrage hook (Phase 15 T4) | Auto-fires after every commit; no operator prompts at run-time |
| `promote-findings --auto` (Phase 13 T1) | Default-scopes findings without dispositioning prompts |
| `slush-remaining` + dampener (Phase 15 T7) | Breaks nit-loops automatically |
| TDD commit-msg gate (Phase 13 T3) | Refuses fix-task commits without a failing test first |
| `apply-audit-flips` + `close-shipped-audit-findings` (Phase 13 T4) | Closure mechanization — commits flip statuses; releases propose verification |
| `slush-remaining` HIGH-filter + latest-scope (#380, v0.29.3) | Severity filter is defense-in-depth; latest-scope matches operator's "this barrage's findings" intent |
| Phase 16 (#383, shipped) | Audit-barrage always fires on new diff; dampener controls disposition, not gating. Closes the audit-coverage hole revealed by the graphical-entries 70-task burndown. |

The mechanical pieces — implement, audit, scope-findings, slush-nits, close-shipped — are largely complete. The loop is structurally self-correcting today: every commit gets cross-model audited (post-Phase-16); every finding gets scoped or slushed; every fix is TDD-gated; every release is verification-tracked.

### What isn't yet built

What's missing is the **operator-interaction surface for genuine spec ambiguity**. Rough order of how blocking each gap is for the full vision:

1. **Spec-ambiguity surface.** Today the agent's default is *"make the reasonable call; operator redirects if wrong."* That's correct for interactive sessions but fails for overnight autonomous loops — a bad call early on propagates 30 tasks deep before anyone sees it. There's no structural way to halt with *"this task has a genuine ambiguity; here's the question; here's the options; awaiting direction."* Three flavors of ambiguity matter:
   - **Local** — sub-decision in execution (lib choice, naming). Skip-and-proceed is safe.
   - **Spec-fork** — design has a real choice (option A or B). Affects only THIS task's implementation. Skip safe iff downstream tasks don't touch the disputed surface.
   - **Cross-cutting** — answer changes a shared contract / pattern. Skip is UNSAFE; downstream tasks WILL touch the same surface.
   
   The agent has to honestly classify which flavor before deciding whether to skip. *"Vibes call"* — but it's a judgment the agent has visibility for (it can grep downstream usage).

2. **Skip-around-blocked-tasks subtlety.** Halt-and-wait is the strict-serial case; *"skip this one and keep going on what's independent"* is what makes the autonomous loop actually amortize the operator's offline time. Tensions:
   - Dependency inference is ambiguous (workplan has implicit *"earlier first"* but no declared dep graph). Forging ahead on task M when M depends on the resolution of blocked task N risks **lock-in** — the operator's eventual answer to N may require ripping out M's work.
   - Workplan-aware gate interaction: a blocked task needs a third state — neither `- [ ]` (loop can pick up) nor `- [x]` (done) — so the gate walks past it. `- [?]` or `(blocked-awaiting-AUDIT-<id>)` is a candidate shape.
   - Cascading blocks: agent skips N → hits another ambiguity at N+1 → skips → etc. Need a cap (e.g. *"3 outstanding blocks, halt entirely"*) so the operator doesn't return to a tangled mess.

3. **Halt-and-resume primitive.** Even after (1) lands, the loop needs a clean *"paused, awaiting operator on Q"* state + a resume verb. Today a paused loop is an idle Claude Code session — no structural state, no way for next-session restart to know where it left off mid-task. Candidate shape: `awaiting-operator/<task-id>.md` files (question + recommendation + impact classification + rollback cost estimate), operator answers async via a CLI verb or studio surface, audit-log records every block + every resume.

4. **Final-verification gate.** Workplan-exhaustion stops the loop, but *"workplan exhausted"* ≠ *"feature shippable."* A `/dw-lifecycle:complete`-style aggregate gate: all tests green, tsc clean, no open findings, audit-log clean, smoke green. Today these are spread across separate verbs; an aggregate would be the *"yes, the burndown actually finished"* signal.

5. **Re-entry idempotence.** If the loop's session dies mid-task (context exhaustion, network, restart), `/dwi` against the same workplan should pick up cleanly. The workplan-aware gate already handles most of this, but the in-flight barrage hook + auto-flips have failure modes that could leave the state inconsistent. Worth a discipline pass when it surfaces.

6. **Resource-budget self-stop.** *"Run until done"* needs a budget. Wall-clock cap? Task count cap? *"This loop has been going for 4 hours, halt and report what's left"* so the operator isn't surprised by a 24h runaway.

### Design framing for the spec-ambiguity surface (when work begins)

The framing the operator anchored on, captured here so future sessions don't re-derive it:

> *"This isn't 'the agent decides everything autonomously.' It's 'the agent decides cheaply, halts loudly, and packages every halt with enough context that an operator can answer in 30 seconds without re-deriving the situation.'"*

The blocking primitive is as much about **legibility** (what is being asked, what is the consequence, what is the rollback cost) as about the halt itself. The agent's job at block-time is to produce a structured prompt the operator can answer in 30 seconds; the operator's job is to answer; the resume mechanism handles re-integration.

Failure modes to design against:

- **Optimistic local classification.** The agent claims local impact, skips, and the answer turns out to be cross-cutting → rework. Mitigation: every skip-decision logs the agent's grep evidence; track skipped-then-required-revert events as a feedback signal for tightening the heuristic.
- **Cascading blocks.** Cap on outstanding blocks → halt entirely.
- **Re-entry order.** When the operator unblocks N after the agent shipped M..M+2, the resumed work on N has to integrate cleanly with the diff that landed in M..M+2. Rebasing logic, branch state, audit-log re-runs — all need a story.

(1) is hardest because the *"is this a genuine ambiguity or am I just being lazy?"* judgment is exactly the kind of call the agent has a mixed track record on. (4) is easiest — composition of existing verbs. (2), (3), (5), (6) are middle-difficulty plumbing.

### Status

This section is **the long-term arc**, not committed work. Phase 16 (audit-coverage hole) is the audit-half of *"fully audited"*; that lands first. The autonomous-but-self-interruptible-on-real-ambiguity half is the next frontier, likely a Phase 17/18 after we have feedback from running the autonomous loop end-to-end on a real burndown.

## Design-loop — UX/UI surface-change discipline as a plugin (north star)

*Working name `design-loop`; finalized at `/dw-lifecycle:define`. Full narrative +
architectural commitments: [`DESIGN-DISCIPLINE-THESIS.md`](./DESIGN-DISCIPLINE-THESIS.md).
Provenance audit: [`docs/superpowers/specs/audiocontrol-uxui-discipline-session-audit.md`](./docs/superpowers/specs/audiocontrol-uxui-discipline-session-audit.md).*

A new deskwork plugin that reduces a **hard-won UX/UI discipline** to portable practice.
The discipline was earned in a sibling project (audiocontrol) at real cost — a multi-day,
screenshot-by-screenshot redesign loop — and is currently trapped there: scattered across
one repo's `tools/`, docs, and a half-shipped feature branch. Per deskwork's own principle
(*the discipline does not exist for an adopter who installs the plugin and follows the
README*), it has to ship as installable skills + CLI verbs + tooling, not stay maintainer
lore.

**The discipline in one line:** model UI changes with **lo-fi wireframes** (so they can't
be mistaken for implementation guidance), keep visual identity in a **settled design
language** (not inside mockups), and verify the realized thing with **device-free
deterministic screenshots** (visual truth anchored in real components, never a static
artifact that rots).

### North-star shape

Three stages, each an installable surface:

1. **Design language** — a skill to scaffold + maintain a per-surface design-language
   spec, and to generate a **living styleguide gallery** from the project's real
   components (so the gallery can't drift from as-built).
2. **Lo-fi wireframe kit + inverted-teeth gate** — a portable `sketch-kit.css` + `.sk-*`
   vocabulary, an authoring skill, and a `check-mockup-lofi`-style gate (CLI verb +
   skill-body enforcement, **never a git hook** per `.claude/rules/enforcement-lives-in-skills.md`)
   that keeps explorations *structurally* incapable of impersonating the product.
3. **Device-free capture + visual baselines** — a fixture-rendered capture engine
   (surface → deterministic PNG) plus a `visual-compare` / `visual-update-baseline` pair
   (exact-hash regression + re-bless), framework-agnostic enough for the server-rendered
   Hono studio *and* an adopter's Astro/Next/React site.

Governance reuses deskwork's existing ACCEPTED/REJECTED exploration archive
(`DESIGN-STANDARDS.md` + `docs/studio-design/`), extended so each entry's *visual* is a
lo-fi wireframe, never a hi-fi mockup.

### Why now, and the first dogfood

The sites→lanes clean break forces a redesign of the studio's content-browser and
scrapbook surfaces. That redesign is the **first dogfood** of the loop — building the loop
first is what keeps the redesign from repeating the audiocontrol screenshot-loop pain.
deskwork already carries two legs of the discipline (`.claude/rules/ui-verification.md`
for "look-don't-deduce / prove-don't-assert"; the design-decision archive); the gaps to
build are the **lo-fi wireframe kit + inverted-teeth gate** and the **fixture-rendered
device-free capture + baseline harness**.

### Status

North star, not yet committed work. Kickoff is feature-request [#424](https://github.com/audiocontrol-org/deskwork/issues/424), which seeds
`/dw-lifecycle:define` → `:setup` → PRD iteration. Composition-first per the project's
principle: the capture engine, the archive, and the enforcement-in-skills pattern all
compose existing deskwork primitives rather than introduce parallel infrastructure.

## Cross-cutting principles

These shape every roadmap item:

- **Capture mode vs. scope mode.** Specs capture exhaustively; scoping is an explicit operator-driven pass. Agents do not pre-cut scope during capture.
- **Just for now is bullshit.** No "TODO" / "fix later" / "stub for now" code comments. Either fix in place or file a GH issue with the deferral rationale.
- **Closure as structural step, not aspirational.** Shipping is rewarded; closure isn't, unless the lifecycle gates closure structurally. Hygiene closes this asymmetry.
- **Composition over new infrastructure.** Each new feature composes existing primitives (audit-log, tooling-feedback, dispatch-wrapper, controller, escalation surface, mediation) when possible.
- **Operator owns scope decisions.** The agent surfaces options + provenance + tradeoffs; the operator picks. Audit findings, closure dispositions, design picks — all operator-driven.
- **Adopters use only public paths.** No privileged dev shortcuts. Dogfood happens via the publicly-advertised marketplace install.

## Backlog signal

~117 open issues at the time of this roadmap (up from ~100 a release-cycle earlier — active development period accreted new work faster than the hygiene tooling closed shipped items). The hygiene feature's `debt-report` skill surfaces the snapshot on demand:

```
dw-lifecycle debt-report
```

Two of the three "confirmed shipped-but-open" issues cited in earlier versions of this roadmap ([#284](https://github.com/audiocontrol-org/deskwork/issues/284) + [#289](https://github.com/audiocontrol-org/deskwork/issues/289)) closed since hygiene's `close-shipped` shipped; [#292](https://github.com/audiocontrol-org/deskwork/issues/292) remains open pending its own verification. The closure-lifecycle is now mechanized; the burndown signal is what to watch over the next few release cycles.

Categories:
- **Phase parent metadata** — closure path: hygiene's `complete-parent-closure` (now shipped); fires automatically when child phase issues all close.
- **Real deferrals** (active features' planned work) — track via their respective workplans.
- **Adopter / studio / doctor bugs** — feed into next regular release cycles.
- **Audit-barrage backlog** — new bucket; will accumulate as the feature ships and the operator triages cross-model findings into actionable items.

## Status of the protocol's own dogfood signal

The graphical-entries canary's tooling-feedback log surfaces friction items the protocol itself produces. v0.25.0 closed 10 of the canary's first 10 TF entries plus four follow-ups from [#349](https://github.com/audiocontrol-org/deskwork/issues/349) ([#350](https://github.com/audiocontrol-org/deskwork/issues/350), [#351](https://github.com/audiocontrol-org/deskwork/issues/351), [#352](https://github.com/audiocontrol-org/deskwork/issues/352)). The dogfood loop is the truth signal for whether the protocol earns its keep against real work; the loop is converging.
