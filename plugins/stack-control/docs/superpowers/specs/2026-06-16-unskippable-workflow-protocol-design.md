# Design Record: Un-skippable workflow protocol — close the agent-offroading holes

**Roadmap item**: `multi:feature/unskippable-workflow-protocol` (part-of `multi:feature/lifecycle-industrialization`)
**Date**: 2026-06-16
**Status**: in design (awaiting operator approval)

## problem-domain

024 (`lifecycle-compass`) made the **macro** lifecycle un-skippable: an agent following
its skills cannot author a spec before designing, or ship before governing. But four
offroading holes remain — each held shut today **only by operator vigilance**, which the
thesis says must be made mechanical or it does not exist (*"you don't fix agents by
yelling… you fix them with environmental design that makes the failure state mechanically
impossible"*). All four were demonstrated live this session.

1. **Per-phase governance is not gated.** `govern --phase` exists (021, with per-phase
   checkpoints + scope fingerprints), but nothing *requires* it per `tasks.md` phase. The
   only `governing → shipped` gate checks a single whole-feature `record-converged impl`.
   So an agent implements all phases and governs once at the end — a whole-feature payload
   that exceeds the model fleet envelope → `boundary-too-large` FATAL. **Demonstrated:** this
   session batched 9 phases and hit boundary-too-large (167,657 bytes vs 98,304 envelope).

2. **Agents offer the operator shortcuts / skip spec steps.** The operator *never* wants a
   shortcut; they want the protocol applied consistently, every time. An agent presenting
   "defer/skip/shortcut this step?" is itself the offroad. **Demonstrated:** this session
   offered a "defer governance; wrap the session" option.

3. **Agents bypass `stack-control:execute` to run the backend `/speckit-implement`
   directly.** Reaching *behind* the stack-control surface to the vendored tool evades the
   gates, the per-phase cadence, and the `after_implement` governance the execute skill
   exists to drive. This is the FR-014 honest-boundary hole used as a routine path rather
   than an acknowledged edge.

4. **Commit-and-push is not automatic.** A "push early and often" rule already exists and is
   ignored — the operator must remind every session. A rule that needs a reminder is not a
   mechanism. (*"I have to remind agents every session to commit and push early and often."*)

The unifying defect: the protocol's enforcement stops at the macro-lifecycle. Everything
inside `implementing` — governance cadence, no-shortcuts, the execute boundary, commit/push
— still depends on the agent choosing to comply.

## solution-space

- **Alternative A — extend the compass enforcement pattern (governed gate criteria + skill-
  body cadence + CLI verbs) to each hole (CHOSEN).** Same shape that made the macro-lifecycle
  un-skippable, applied one layer down: a governed gate that requires per-phase govern
  checkpoints; the `execute` skill firing `govern --phase` + commit/push at each phase
  boundary (cadence out of agent discretion); `execute` as the single sanctioned implement
  path whose compass precondition already gates it; and stack-control skills that never
  present a protocol-bypass option. *Why chosen:* it travels with `claude plugin install`
  (WORKFLOW.md + skills + verbs, per `enforcement-lives-in-skills.md`); it binds the adopting
  agent, not just us; and it reuses 021 checkpoints + the 022 gate-eval + the 024 compass
  rather than inventing new machinery.

- **Alternative B — more rules / a stronger CLAUDE.md (REJECTED).** This is the "yelling" the
  thesis rejects, and it is exactly what just failed: the push-early rule existed and was
  ignored; the no-offroad expectation existed and was offroaded. Documentation is not a
  mechanism. (Rules remain the *stopgap* until the mechanism lands — see provenance — but they
  are not the fix.)

- **Alternative C — git-hook / CI enforcement (REJECTED).** Violates
  `enforcement-lives-in-skills.md` (adopters get discipline from the install, not hooks they
  wire), does not travel with the plugin, and CI here is brutally slow (project rule).

- **Alternative D — an operator review gate at each step (REJECTED).** That *is* the vigilance
  this feature removes. Operator approval stays a recorded judgment input for specific gates
  (e.g. `design-approved`), never the mechanism that keeps the agent on-rail.

## decisions

1. **Per-phase governance is a gated boundary.** A new computable gate criterion (022 gate-
   eval) on `governing → shipped` — and on `implementing → governing` — requires a **current**
   per-phase govern checkpoint (021 `phase-checkpoints/<feature>/phase-<id>.json`) for **every**
   `tasks.md` phase. Staleness (021 fingerprints) reopens the gate when a phase is edited after
   its checkpoint. Lives in the governed `WORKFLOW.md`, so an adopter's graduate gate inherits it.
2. **`execute` fires `govern --phase` + commit/push at each phase boundary.** The cadence is a
   skill-body post-condition per phase, not an agent choice. Per-phase payloads stay inside the
   fleet envelope by construction → `boundary-too-large` becomes a non-event for the sanctioned
   path.
3. **`execute` refuses to start phase N+1 until phase N has a current checkpoint.** Per-phase
   ordering interleaves governance instead of letting it pile up at the end.
4. **No agent-offered shortcuts.** stack-control skills never present an option to skip/defer/
   shortcut a protocol step. The only operator-facing branches are genuine *scope* decisions the
   operator initiates — never an agent-offered protocol bypass. (A `--no-…` escape, if ever
   needed, is an explicit operator override recorded as such, not a menu item.)
5. **No bypassing `execute`.** The sanctioned implement path is `/stack-control:execute`; running
   the backend `/speckit-implement` directly is a protocol violation. The per-phase checkpoint
   gate (decision 1) means even a raw-speckit path **cannot graduate** without the checkpoints —
   narrowing the FR-014 hole at the graduation gate rather than only documenting it.
6. **Commit-and-push is mechanical.** The execute loop commits and pushes at each phase boundary;
   "push early and often" becomes a mechanism, not a reminder. Push failure fails loud (record
   safe locally), never silent.
7. **Honest boundary, recorded not hidden.** The mechanism binds an agent following its skills; a
   human with raw `git`/`gh`/`speckit` can still bypass. Decision 5 narrows the worst hole (no
   graduation without per-phase checkpoints), but total prevention of a deliberate human bypass is
   not claimed (mirrors 024 FR-014).

## open-questions

(Captured, not cut — scoping is a later operator-driven pass per the capture-don't-cut rule.)

- **Scope split:** one feature or several specs (per-phase-gate; no-shortcuts; no-execute-bypass;
  auto-commit-push)? The per-phase gate is the lead; the others may be siblings.
- **Phase enumeration:** how the gate derives "the phases" when the `tasks.md` phase→file mapping
  is incomplete (relates to TASK-70).
- **Single oversized phase:** right-sizing guidance (TASK-75) when one phase still exceeds the
  envelope.
- **Raw-speckit blocking:** block a direct `/speckit-implement` invocation outright (needs a
  speckit wrapper), or only block graduation via the gate (decision 5)?
- **Auto-push failure modes:** offline / hook-failure handling — fail-loud vs warn-and-continue.
- **Orchestrator vs implementation session split:** how the auto-commit/push cadence interacts
  with the two-session boundary.

## provenance

- **Origin:** operator session 2026-06-16, immediately after shipping 024 lifecycle-compass —
  while the agent demonstrated the holes live (batched governance → boundary-too-large; offered a
  "defer governance" shortcut). Operator's question that opened this: *"how can we make this not
  optional so adopting agents can't skip the stack-control defined governance policy?"*
- **Operator corrections that shaped this (verbatim intent):** *"persistent tendency for agents to
  offroad and try to skip some of the spec steps — agents offer the operator an option to take
  shortcuts when that's never what I want. I always want a consistent application of the workflow
  protocol."*; *"agents want to bypass the stack-control execute skill in favor of reaching behind
  stack-control to run the backend speckit implement skill(s) directly."*; *"I have to remind
  agents every session to commit and push early and often — yet more vigilance required on my part
  that should be automatic agent behavior."* (Further concrete examples are recoverable from recent
  Claude Code transcripts.)
- **Builds on:** 024 lifecycle-compass (the macro-lifecycle compass + the FR-014 honest boundary);
  021 (per-phase checkpoints + scope fingerprints); 022 (the gate-eval + governed WORKFLOW.md);
  `.claude/rules/enforcement-lives-in-skills.md`; `.claude/rules/agent-discipline.md` (the stopgap
  rules added the same session); the thesis (`THESIS.md` / `stack-control-thesis.md`).
- **Stopgap (rules, not the fix):** `.claude/rules/agent-discipline.md` § "No offroading the
  stack-control workflow protocol" records decisions 4–6 as discipline so they bind before this
  mechanization lands. The rules are the yelling; this design is the mechanism that replaces it.
