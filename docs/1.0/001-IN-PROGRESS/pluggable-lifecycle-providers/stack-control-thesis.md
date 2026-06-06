# stack-control — thesis & foundations

> **Read this first.** This is the *why* behind stack-control. Every foundational document (constitution, roadmap, PRD, plugin README, the succession rule) points here so that every new developer and every fresh agent session inherits the same grounding. If a design choice or piece of work doesn't trace back to the thesis below, that's the signal to stop and reconsider.

## The thesis

> **Invest heavily in up-front design and tooling; industrialize execution.**

stack-control is a **barbell**. The up-front half — design, scoping, spec authoring, insight capture, cross-model spec governance, scope discovery — is where human judgment and *all* the leverage live, so the control plane invests **disproportionately** there: rich, rigorous, low-friction, well-tooled. The back half — execution — is then **industrialized**: parallel, worktree-isolated, multi-backend, unattended, cheap to run, and **independent of operator mood or attention**. Execution is the commodity end; design is where value is created.

The arc is **craftsman → industrialist**: from hand-wrought code and direct hardware communion to heavy up-front design feeding an automated production line whose output quality doesn't depend on how the operator feels that day. *"The blacksmith is obsolete, and so is the argument about whether machines should touch the horseshoe."*

## Origin

stack-control grew out of building real software with coding agents and hitting the same walls repeatedly. The full story — history and hard-won principles — is the motivating devlog:

- **Blog:** ["Coding Agents Are Insane, Hyperintelligent Toddlers"](https://stackcontrol.org/blog/the-lifecycle-and-why-agents-need-one/) (Orion Letizi)
- **Home:** [stackcontrol.org](https://stackcontrol.org) — *"Coding agents need a babysitter."* An assembly line for agentic coding; sibling to audiocontrol.org and editorialcontrol.org.

stack-control is the **successor to `dw-lifecycle`** (see `.claude/rules/stack-control-succession.md`). The rebuild sheds the bespoke PRD/workplan spine for **Spec Kit** (a community standard) and keeps the **teeth** that actually worked: **audit-barrage** and **scope-discovery**.

## Hard-won principles (the load-bearing ones)

Coding agents are *"faster than you, [they have] read more than you, and [they] will lie to your face with total confidence."* The homepage puts it bluntly: *"insane, hyperintelligent toddlers — they lie, they get bored, and they shove beans up their nose the second you stop watching."* The principles all follow from taking that seriously:

1. **You cannot fix a toddler by yelling at it.** Rules and admonishment don't change agent behavior; **environmental and process design** does. Engineer the environment so failure states are *mechanically impossible*, not merely discouraged. *Detection over instruction.*
2. **The All-Caps Signal.** When the operator catches themselves typing in rage (the SHOUTING in the repo's rules — `MEMORIES ARE FUCKING USELESS`, etc.), that moment marks a needed re-architecture. **SHOUTING rules are re-architecture scars — the highest-signal rules in the repo, not noise.**
3. **Memory loss → durable written artifacts.** Agents lose context at compaction boundaries. Specs, workplans, run records, the design-inbox — written artifacts that survive the context window are how continuity is preserved.
4. **Task drift → credible tests.** Agents skip the boring middle, leaving work *"technically present and functionally hollow"* (175 green UI tests with dead sliders). Tests must prove **user-facing behavior**. Corollary for execution: per-task **liveness ≠ correctness**; correctness is the audit's job.
5. **Rulebooks fail → context-scoped skills.** *"A rule in a big document is a rule the agent doesn't follow."* A 773-line `CLAUDE.md` didn't work. Decompose policy into **context-scoped processes and concrete skills** that fire where they're needed. (This is itself a constraint on how we add governance: don't accrete; decompose.)
6. **Stochastic correctness.** *"Individual agents are like insane, hyperintelligent toddlers with a tendency to lie. Pit multiple agents together continuously and they tend to correct each other's mistakes."* This is the **audit-barrage**: multiple independent model CLIs (Claude, Codex, Gemini) audit every diff; **cross-model agreement is the reliability signal.** Per the thesis, point this at the *spec* (DEFINE), not just the code — that's the higher-leverage place.
7. **Quiet failures are the dangerous ones.** Scope deferral (*"good enough for now"* tech debt), duplication (copy-paste instead of refactor), and invisible gaps (changed some related code, missed the rest). These don't announce themselves — **scope-discovery** detects them mechanically (clone scans, missed-update surfacing).

## The four-phase lifecycle

stack-control wraps every change in a structured loop instead of letting an agent improvise from prompt to merge:

**DEFINE** (design exhaustively, up front) → **IMPLEMENT** (delegate to subagents at clean boundaries) → **AUDIT** (multi-agent review in parallel against the diff) → **REPEAT** (loop until the diff passes clean).

Per the barbell, **DEFINE gets the heavy investment**; IMPLEMENT is industrialized; AUDIT is the stochastic-correctness teeth; REPEAT is the loop. Spec Kit supplies DEFINE + IMPLEMENT; audit-barrage supplies AUDIT.

## What this means for how we work here

- **Tilt investment toward the design phase.** When weighing a DEFINE-phase capability against an execution-phase one, the thesis favors DEFINE. Design tooling (insight capture, govern-the-spec, scope discovery, rich iteration) is **first-class**, not overhead.
- **Prefer mechanical interlocks over advice.** Hard gates, machine-checkable invariants, fail-loud — not "flagged for review."
- **Lean on stochastic correctness.** Cross-model audit, applied to specs and code.
- **Capture insight low-friction; capture ≠ scope.** Out-of-sequence ideas go to the design-inbox in one move, triaged later. Hold multiple design threads.
- **Outcomes independent of operator mood.** Unattended runs must actually *produce*, not just *not-block* — a quarantine pile is a quiet failure, not a success.

## Canonical links

- Thesis headline + program structure: [`stack-control-roadmap.md`](./stack-control-roadmap.md)
- Settled succession decisions: [`.claude/rules/stack-control-succession.md`](../../../../.claude/rules/stack-control-succession.md)
- Dev principles every spec inherits: [`.specify/memory/constitution.md`](../../../../.specify/memory/constitution.md)
- Feature north star: [`prd.md`](./prd.md)
- Out-of-sequence idea capture: [`design-inbox.md`](./design-inbox.md)
