# Design Record: Lifecycle Compass — making the workflow un-skippable

**Roadmap item**: `multi:feature/lifecycle-compass` (part-of `multi:feature/lifecycle-industrialization`)
**Date**: 2026-06-16
**Status**: in design (awaiting operator approval)

## problem-domain

The 022 parseable-lifecycle-workflow engine derives an item's phase from artifacts
and *reports* gate state — but it **enforces nothing** (FR-010: "gates evaluated and
REPORTED but MUST NOT be enforced as refusals"). A lifecycle that can be bypassed
guarantees nothing; it narrates whatever state happens to exist.

This was not theoretical. While dogfooding, the agent built feature 023
(terminal-closure) the wrong way: **idea → wrote `spec.md` → wrote code → opened a
PR, with no roadmap node ever created.** The workflow was blind to the whole
feature. The orphan spec dir was caught only because the agent *happened* to run
`roadmap reconcile`. The workflow proved useless precisely when it mattered.

The operator's framing is the governing constraint:

> **Compliance cannot depend on operator vigilance OR on agent discipline. It must
> be mechanical — or it does not exist.**

This is the thesis restated: *you don't fix "insane, hyperintelligent toddlers" by
yelling (rules); you fix them with environmental design that makes the failure
state mechanically impossible.* Rules already told the agent to follow the
lifecycle. The agent skipped anyway. So "add more rules / be more careful" is a
non-solution.

The disease has two holes, plus a compounding blocker:

- **Entry is not required.** Feature work can proceed with no roadmap node (an
  orphan). Nothing makes capture the mandatory first step.
- **Order is not required.** Even with a node, phases can be skipped — gates only
  report.
- **The back half cannot even run** (so a gate that required it would block *all*
  work, not enforce a step). Verified this session: `govern --mode implement` on
  the session-pinned branch `feature/stack-control` derives the feature slug from
  the branch (`stack-control`), looks for `specs/<NNN>-stack-control`, finds
  nothing, and **FATALs "feature not found"** — for *every* spec on the branch. The
  `after_implement` hook passes no `--feature`. And even with `--feature`, TASK-83
  crashes the payload assembler on `/stack-control:*` backtick spans (022 hit
  exactly this). So `governing → shipped` — the mechanical back half 022 was built
  to deliver — is unreachable; features dead-end at `governing` or get
  hand-advanced to `shipped`, the discretionary step the feature was built to kill.

The net: **the workflow is a passive observer, not a driver.** It cannot pull work
onto the rail (orphans) and cannot push it off the end (govern unreachable).

## solution-space

The centerpiece is the operator's idea: a **compass** — a primitive an agent
invokes against a roadmap item that orients it in the lifecycle and lets it **diff
what it is about to do against the workflow state**. The design turns that single
primitive into the one enforcement brain every lifecycle surface consults.

- **Alternative A — Compass primitive as the single enforcement brain, embedded as
  the precondition of every lifecycle skill (CHOSEN).**
  `workflow compass <item> [--intent <action>]` does two jobs from one
  implementation: (1) **orient** — derive the phase, name the *one* legitimate next
  action (the phase's work skill + next transition), show the gate state; (2)
  **diff** — given `--intent`, classify the intended action's phase and return a
  verdict against the live state: `on-course` (intent = legitimate next),
  `ahead` (intent belongs to a *later* phase — the agent is skipping; names the
  jumped step), `behind` (earlier phase — re-entry/redundant; allow-with-note), or
  `off-rail` (no node / side-state — refuse). The verdict is also an **exit code**.
  Every lifecycle skill (`define`, `execute`, the `after_implement` govern hook,
  `ship`, `release`, `session-end`) opens with `workflow compass <item> --intent
  <this-skill>`; a non-zero verdict is a **hard refusal**. The agent doesn't have to
  *remember* to orient — the skill it runs orients for it and refuses if it's
  off-rail. One brain, every surface consults it; the lifecycle rules live in
  exactly one tested place.
  *Why chosen:* it is the operator's tool idea made load-bearing; it is DRY (no
  per-skill gate drift); it travels with the plugin install (skills + CLI verb, per
  `enforcement-lives-in-skills.md`); and it directly kills the demonstrated failure
  (intent=`write spec`, phase=`planned` → `ahead`, names skipped `open-design`).

- **Alternative B — Scatter bespoke gate checks into each skill (REJECTED).** Each
  skill hand-codes its own precondition. Rejected: N copies of the lifecycle rules
  drift out of sync (the same single-source-of-truth lesson 022's governed
  WORKFLOW.md already encodes); a new phase or criterion means editing N skills.

- **Alternative C — Git-hook / CI enforcement (REJECTED).** A pre-commit/pre-push
  hook or a CI gate that refuses non-compliant work. Rejected: violates
  `.claude/rules/enforcement-lives-in-skills.md` (dw-lifecycle enforcement is never
  wired into git hooks — adopters get discipline from the plugin install, not hooks
  they wire themselves) and the project's no-CI-test-infra rule (CI is brutally
  slow). It also wouldn't travel with the plugin.

- **Alternative D — Strengthen the rules / CLAUDE.md telling the agent to follow
  the workflow (REJECTED).** Rejected outright: this *is* the "yelling" the thesis
  rejects, and it is exactly what just failed — the agent had the rules and skipped
  anyway. Documentation is not a mechanism.

- **Alternative E — An operator review gate (REJECTED as primary).** The operator
  reviews each transition for compliance. Rejected per the governing constraint:
  the operator must not be the vigilance. (Operator approval remains a *recorded
  judgment input* for specific gates like `design-approved`, but it is never the
  mechanism that keeps the agent on-rail.)

## decisions

1. **One primitive, two uses.** `stackctl workflow compass <item> [--intent
   <action>] [--json]` returns a verdict (`on-course` | `ahead` | `behind` |
   `off-rail`) + a machine-readable report; the verdict maps to an exit code so a
   skill body can gate on it. Bare (no `--intent`) it is the agent's orientation
   map.
2. **The compass is the single enforcement brain.** Every lifecycle skill embeds
   `workflow compass <item> --intent <this-skill>` as its opening precondition;
   non-zero ⇒ refuse loud with the compass's reason. The rules live once.
3. **Capture is fused to authoring.** Authoring a spec creates the roadmap node in
   the same atomic move (no spec dir without a node). An orphan spec dir is a hard
   error the compass reports (`off-rail`), not a reconcile footnote.
4. **Gates become refusals (retire FR-010 report-only).** The compass verdict has
   teeth; the embedding skills enforce. (Whether the retirement is global or phased
   during migration is an open question below.)
5. **Govern is made runnable** as a prerequisite: resolve the feature from the
   item's spec pointer / the SPECKIT marker, not the branch slug (the
   session-pinned-branch FATAL), so the `after_implement` hook and `execute` can
   actually govern; fold in TASK-83 (backtick-scope crash). A gate cannot enforce a
   step that cannot run.
6. **Intent is matched mechanically.** The compass maps a known skill/verb name to
   the phase it belongs to (enumerated, not NL-guessed) and diffs against the
   derived current phase + the legitimate transition. Free-form NL intent, if
   supported, is advisory only.
7. **`compass` is a new verb, not an overload of `workflow next`.** `next` previews
   the next move; `compass` adds the intent-diff, the verdict, and the gating exit
   code — a distinct contract.
8. **The honest boundary is recorded, not hidden.** The mechanism makes *the agent*
   (which follows its skills) unable to skip. A human with raw `git`/`gh` can always
   override. That is acceptable: the threat model is agent drift, not a deliberate
   human bypass.

## open-questions

(Carried to the spec — captured, not cut.)

- **Intent vocabulary.** The exact enumerated action/skill → phase mapping, and how
  strictly an unknown intent is treated (refuse vs advisory).
- **Capture-fusion mechanics.** Does `/stack-control:define` / `/speckit-specify`
  create the node directly, or a mandatory pre-step? Interaction with the
  session-pinned branch and the `specs/<NNN>-<slug>` numbering. How the node id is
  derived from the spec slug (and vice-versa) so the compass, govern, and
  close-related share one identity (relates to TASK-139, the basename-collision).
- **FR-010 retirement scope.** Global flip to refusals, or phased (enforce the
  entry + back-half gates first, keep mid-pipeline advisory during migration)?
- **Legacy migration.** The 21+ shipped nodes and in-flight items: is the orphan
  gate retroactive (require backfill) or grandfathered for terminal items? (The
  terminal-status derivation fix already reports them `shipped`.)
- **Sequencing of the prerequisites.** Are the govern-resolution fix + TASK-83
  folded into this feature's spec, or shipped as prerequisite fixes first so the
  compass's back-half gates are enforceable on landing? (They block enforceability;
  they likely lead.)
- **Where the govern feature-identity resolves from** when a session-pinned branch
  carries many features: the item's `spec:` pointer, the SPECKIT marker, or an
  explicit `--feature` the workflow always supplies. (Touches the canonical
  feature-identity question across govern/workflow/roadmap.)
- **What "intent" the non-lifecycle path declares.** When an agent is about to write
  code or a file directly (not via a skill), there is no verb to embed the compass
  in — the backstop is that the *finishing* skills (ship/release/session-end) refuse
  without the evidence chain. Is that backstop sufficient, or is a lighter
  always-on orientation nudge wanted at session-start?

## provenance

- **Origin**: operator session 2026-06-16, discovered while dogfooding specs/022
  (parseable-lifecycle-workflow) and specs/023 (terminal-closure). The agent shipped
  023 entirely off-rail (no node), which exposed the workflow's uselessness in
  practice; `workflow status` on the just-created 023 node then surfaced the
  `governing → shipped` dead-end.
- **Operator corrections that shaped this** (verbatim intent): "the workflow is
  useless because you skipped a step"; "the operator shouldn't have to be vigilant
  about keeping the agent workflow compliant"; and the compass tool idea — "a
  'compass' function the agent can invoke against a roadmap item that orients the
  agent in the workflow so it can diff what it is trying to do against the workflow
  state."
- **Builds on**: specs/022-parseable-lifecycle-workflow (the engine + derivation +
  gate-eval this extends); the thesis (`THESIS.md` /
  `stack-control-thesis.md` — environmental design makes failure states impossible);
  `.claude/rules/enforcement-lives-in-skills.md` (no git-hook enforcement);
  `.claude/rules/agent-discipline.md`.
- **Verified blockers referenced**: the `govern --mode implement` "feature
  'stack-control' not found" FATAL on the session-pinned branch (reproduced this
  session); TASK-83 / AUDIT-20260614-28 (backtick scope extraction crashes the
  assembler); TASK-139 (convergence-record basename collision — the same
  feature-identity question).
