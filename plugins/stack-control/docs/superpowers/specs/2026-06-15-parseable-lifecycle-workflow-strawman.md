# Parseable Lifecycle Workflow — STRAWMAN for discussion

**Status:** strawman — for operator reaction, not yet a spec. Feeds
`multi:feature/parseable-lifecycle-workflow` (roadmap), part-of
`multi:feature/lifecycle-industrialization`.

**Date:** 2026-06-15

> This document is a *design strawman* to react to. It is NOT the canonical
> `WORKFLOW.md` and is NOT governed/parsed yet. The grammar shown below is a
> proposal for what the canonical doc *would* look like.

---

## Settled going in

- **Gate criteria are MECHANICAL, published, unambiguous, debate-free** — this is
  the heart (see the dedicated section). Every entrance/exit criterion is a
  computable true/false predicate over artifacts that already exist; the criteria
  live in the governed `WORKFLOW.md` (published, single source); the engine
  answers "are we done / how much more / can we move to X" deterministically. The
  query engine has **standalone value independent of advancing anything.**
- **Teeth (v1):** gates are **evaluated + reported, not enforced as refusals** (no
  hard gating). "Report-only" means we tell you the criteria's true/false status;
  we don't *block*. The criteria themselves are not soft — only the refusal is
  deferred. Separately, transition **effects are automatic** — when you DO advance,
  the tooling (not agent discretion) applies all the required doc + status updates.
  In Jira terms: conditions/validators are mechanical + reported; post-functions
  automated. But driving is a layer ON TOP of the queryable criteria, not the point.
- **Unit:** a **roadmap node** (`<phase>:<kind>/<slug>`). "What's next for XYZ"
  reads XYZ as a node. The spec dir is an *artifact produced during XYZ's
  middle phases*, not the unit.
- **Source of truth:** a governed, grammar-parsed `WORKFLOW.md`
  (document-primitives pattern — third use after ROADMAP.md, DESIGN-INBOX.md).
- **There is a `designing` phase BEFORE `specifying`.** Its work is the
  free-form exploration conversation; its required artifact is a **design
  record** capturing problem domain, solution space (incl. rejected
  alternatives), and initial decisions. The record informs every downstream
  phase. This formalizes a convention the repo already runs informally (the
  `*-design.md` family, historically at the repo-root `docs/superpowers/specs/` —
  now corrected to live in the installation domain; see Ratified 2026-06-16) but
  currently leaves to operator memory.
- **Every stage is an opinionated stack-control FRONTEND over a swappable
  BACKEND.** `define`→Spec Kit, `execute`→`/speckit-implement`, `govern`→model
  CLIs — and now `design`→a design backend (default `superpowers:brainstorming`,
  possibly third-party). The frontend owns the *opinion + contract* (the
  "stack-control way"); the backend owns the *mechanism* and is selected by
  **capability, never vendor identity** (succession rule, execution-backend
  port). This is a first-class principle, not specific to the design stage.

---

## Ratified 2026-06-16 (operator decisions this session)

These framing decisions were the gate on converging this strawman to a spec.
All are now settled — downstream design and the spec inherit them:

- **Engine shape (resolves open-decision #5 / Q5):** the workflow is a **NEW
  `workflow` verb family that CONSUMES the roadmap node-reader** — not phase-awareness
  bolted onto the `roadmap` reasoner. Phase-derivation reuses the existing node model;
  the net-new surface (the governed `WORKFLOW.md` grammar, the transition units, the
  effect manifest, `workflow status|can-enter|next|advance`) lives in its own family.
  `roadmap` stays focused on the DAG; `workflow` owns phases/transitions/effects.
  Rationale: `roadmap` has never fired effects; folding effect-execution into it
  couples two concerns. Composition over a fork.
- **Unit (ratified):** the unit IS the **roadmap node** (`<phase>:<kind>/<slug>`);
  the spec dir is a mid-phase artifact the node produces during
  specifying/implementing. Consistent with what `session-start` and
  `roadmap reconcile` already key on.
- **TASK-19 scope (resolves open-decision #3):** **TASK-19
  (governance-graduation-record) is PULLED INTO this feature's scope.** This feature
  delivers BOTH the on-disk govern-convergence record AND every mechanical gate that
  reads it — including the full back-half `governing → shipped` exit gate. No
  report-only interim for the back half. Consequence: the `governing` exit criterion
  (`impl-govern convergence recorded ∧ converged`) is in scope here, not deferred;
  the spec must design the graduation record's shape and write path.
- **Design-record placement (operator correction):** design records live **INSIDE
  the stack-control configuration domain** (the installation root that owns
  `.stack-control/config.yaml`), NOT at the repo root. The repo-root
  `docs/superpowers/specs/` is deskwork's *shared* archive; writing a
  stack-control-specific design doc there leaks across the installation boundary and
  violates the isolation invariant (constitution Additional Constraints,
  installation-anchor). The `designing`-phase convention path is therefore
  **domain-relative**: `<install-domain>/docs/superpowers/specs/<date>-<slug>-design.md`
  (for this monorepo's dogfood, `plugins/stack-control/docs/superpowers/specs/`). This
  is the design-doc instance of the already-tracked
  `design:gap/project-relative-doc-discovery` — the `/stack-control:design` frontend
  MUST resolve the record path against the installation (the same anchor every
  state-writing verb uses), never a hardcoded repo-root path. This strawman was first
  written to the repo root and moved into the domain on 2026-06-16 as the corrective;
  the spec must make the domain-relative path the only path the frontend can write.

---

## Core principle: the current phase is DERIVED, never stored

The workflow doc defines the phase *vocabulary* and the *transitions*. An item's
*current phase* is a **pure function of artifacts that already exist** — no new
state field, no second source of truth, no drift:

| Observed state | Derived phase |
|---|---|
| in backlog, no roadmap node | `captured` |
| node `status: planned`, no design record, no `spec:` field | `planned` |
| design record present, no spec dir yet | `designing` |
| node `in-flight`, `spec:` present, spec-govern not converged | `specifying` |
| spec converged, `tasks.md` < 100% | `implementing` |
| `tasks.md` 100%, no impl-govern record | `governing` |
| impl-govern converged, released | `shipped` |
| node `status: blocked` / `cancelled` / `retired` | terminal side-states |

This is the same computation `session-start` and `roadmap reconcile` already do
informally — the workflow engine just makes it explicit and total.

---

## Stage gates: mechanical, published, unambiguous — and queryable on their own

**This is the heart of the feature, and it stands independent of "driving."** You
ask the criteria; you do not have to advance anything. Operator requirement,
verbatim intent: *entrance and exit criteria for any stage must be mechanical,
well-publicized, unambiguous, and not subject to debate.*

Every stage publishes two criteria sets in the governed `WORKFLOW.md`: its
**entrance criteria** (what must hold to enter) and **exit criteria** (what must
hold to be done). The three hard properties:

- **Mechanical** — every criterion is a computable predicate over artifacts that
  already exist: *file exists*, *section present*, *count ≥ N*, *tasks 100%*,
  *tree clean*, *recorded approval present*. No criterion is a judgment call.
- **Published** — they live in `WORKFLOW.md` (single source), never in skill prose
  or anyone's head. "What does it take to exit `designing`?" is answered by
  reading the doc — identically by every agent, every session.
- **Unambiguous / debate-free** — a criterion evaluates to exactly true/false on
  the artifacts. There is nothing to argue about.

### Judgment criteria are still mechanical — they check a RECORDED decision

"Is the design actually complete and good?" is a judgment — but the *criterion*
the engine checks is **"operator approval recorded: yes/no"**, which is mechanical
and debate-free. The judgment happens in the operator's head; the gate checks the
recorded marker. Same shape as the whole system: operator decides, tooling records
+ checks the record ("agent posts evidence, operator decides" → the decision, once
made, is a mechanical fact). **No criterion is a debate; some criteria are a
recorded operator decision.** That dissolves the mechanical-vs-judgment tension.

### The query surface — your three questions, mechanically answered

| operator asks | engine | answer |
|---|---|---|
| "are we done with this stage?" | `workflow status {item}` | current stage's exit criteria — all met? (bool) |
| "how much more before the next stage?" | `workflow status {item}` | the UNMET exit criteria, enumerated (M of N met) |
| "can we move to {stage} yet?" | `workflow can-enter {item} {stage}` | {stage}'s entrance criteria — met? + what's missing |

All read-only, deterministic, write nothing. **This query engine is the
foundation**; the effects/advance manifest is a separate layer built on top. You
query the gates without ever advancing.

### Example mechanical criteria (strawman)

| stage | exit criteria — every one a true/false predicate |
|---|---|
| `designing` | design record exists · required sections present · solution-space ≥ 2 alternatives · operator-approval recorded |
| `specifying` | spec dir exists · speckit chain complete (`analyze` clean) · spec-govern converged (recorded) |
| `implementing` | `tasks.md` 100% · suite green (recorded run) · tree clean |
| `governing` | impl-govern convergence **recorded ∧ converged**  ← needs TASK-19 governance-record |
| `shipped` | released (version tag present) · post-release verification recorded |

The `governing` row is why TASK-19 (governance-graduation-record) is a real
prerequisite: without a *recorded* convergence fact, that exit criterion cannot be
mechanical — it would fall back to "the agent says it's governed," which is exactly
the debate this feature exists to kill.

---

## The phase spine

| # | phase | the WORK (agent does) | done-by |
|---|---|---|---|
| 0 | `captured` | a found bug/gap exists in the backlog | `/stack-control:backlog capture` |
| 1 | `planned` | promoted to a roadmap node, awaiting design | `roadmap add` / `backlog promote` |
| 2 | `designing` | **free-form exploration → a design record** (problem domain, solution space, decisions, rejected alternatives) | `/stack-control:design` (frontend) → backend (default `superpowers:brainstorming`) → `<install-domain>/docs/superpowers/specs/<date>-<slug>-design.md` (domain-relative; see Ratified 2026-06-16) |
| 3 | `specifying` | author + converge the spec (from the design record) | `/stack-control:define` + speckit chain + `govern --mode spec` |
| 4 | `implementing` | execute the spec (write the code) | `/stack-control:execute` (speckit-implement) |
| 5 | `governing` | cross-model audit-barrage convergence on the impl | `govern` (after_implement) |
| 6 | `shipped` | graduated: tasks done, governed, released | `/stack-control:release` + graduate |

Side-states (`blocked` / `cancelled` / `retired`) are reachable from any phase
via an induct-style move; they mirror the roadmap statuses we already have.

---

## Proposed grammar (governed `WORKFLOW.md`)

Heading-keyed units, exactly like ROADMAP.md. Two unit kinds: **phase** (node)
and **transition** (edge that carries effects). `{item}`, `{spec-dir}` are
template params bound at advance time.

```
---
doc-grammar: workflow
---

# stack-control — lifecycle workflow

## phase: planned
- derive: node status=planned ∧ no design record ∧ no spec field
- work: roadmap add / backlog promote
- next: designing

## phase: designing
- derive: node design: field present ∧ no spec dir
- work: /stack-control:design     # opinionated frontend; drives a design backend (default superpowers:brainstorming) → *-design.md
- next: specifying

## phase: specifying
- derive: node in-flight ∧ spec present ∧ spec-govern not converged
- work: /stack-control:define        # spec authored FROM the design record
- entry-gate: all depends-on shipped          # REPORTED (soft in v1)
- next: implementing

## transition: planned → designing
- codename: open-design
- exit-gate: (none — entering exploration; superpowers:brainstorming writes the record itself)
- effect: roadmap advance {item} --to in-flight
- effect: journal append "entered designing for {item}"
- effect: commit "chore(stack-control): {item} → designing"

## transition: designing → specifying
- codename: design-to-spec
- exit-gate: design record exists ∧ required sections filled (problem domain, solution space incl. rejected alternatives, ≥1 decision, open questions) ∧ brainstorming's user-review approved
- effect: workflow link-design {item} {design-doc}   # NEW verb — set node design: field (doc now exists)
- effect: workflow link-spec {item} {spec-dir}       # spec's source-of-truth = the design record
- effect: journal append "design finalized {design-doc}; opened spec {spec-dir} for {item}"
- effect: commit "chore(stack-control): design→spec for {item}"

## transition: governing → shipped
- codename: graduate
- exit-gate: tasks.md 100% ∧ suite green ∧ tree clean ∧ impl-govern converged
- effect: roadmap advance {item} --to shipped
- effect: roadmap reconcile                       # recompute frontier; surface newly-ready dependents
- effect: journal append "graduated {item}"
- effect: commit "chore(stack-control): graduate {item} to shipped"
```

---

## The design record (the pre-spec artifact)

The `designing` phase exists to **capture the exploration, not just the
conclusion** — the same discipline as the design-standards ACCEPTED/REJECTED
archive and the spec-audit-failure-modes log. A record that states only the
final decision is incomplete; it must show what was considered and why the
alternatives lost, so the spec, the implementation, and any future
re-litigation inherit the reasoning instead of re-deriving it.

**The work surface is `/stack-control:design` — an opinionated FRONTEND over a
swappable BACKEND** (default `superpowers:brainstorming`, possibly third-party).
Same pattern as `define`→Spec Kit. The frontend owns the *opinion*; the backend
owns the *mechanism*.

**What the backend supplies (default = brainstorming):**

- writes + commits the design record at the convention path (its step 6) — the
  frontend supplies the domain-relative `<install-domain>/docs/superpowers/specs/`
  base (Ratified 2026-06-16); the backend must not hardcode a repo-root path;
- proposes 2-3 approaches with trade-offs (the explore-alternatives method);
- a **user-review gate** ("review the written spec… wait for the response");
- a **self-review** (placeholder / consistency / scope / ambiguity scan);
- a **HARD-GATE** against implementing before design approval.

**The backend contract** (so a backend is selectable by *capability*, not vendor):
conduct a structured exploration → emit a design record at the convention path
with the required sections → support an approval gate → be drivable in-session.

**What the frontend's opinion ADDS / OVERRIDES (the "stack-control way"):**

- **Override the backend's YAGNI with capture-everything.** Brainstorming's Key
  Principles say *"YAGNI ruthlessly — remove unnecessary features from all
  designs"* — which **directly violates** `agent-discipline.md` § Capture mode vs
  scope mode (*"capture everything… THEN scope it; never insert scope-cuts the
  operator didn't ask for"*). The frontend MUST suppress the backend's
  scope-cutting; the design record captures the full domain, scoping is the
  operator's later explicit pass.
- **Terminal handoff = Spec Kit, not `writing-plans`.** The frontend intercepts
  the backend's hardcoded terminal state and routes to the workflow's
  `design-to-spec` transition (→ `/stack-control:define` → `/speckit-specify`).
  The backend stays workflow-agnostic.
- **Anchor to a roadmap item + set the `design:` pointer** on entry (the unit is
  the node; the pointer makes phase-derivation work mid-exploration — Q9).
- **Required-section contract** the `design-to-spec` exit-gate can mechanically
  verify (problem domain, solution space incl. rejected alternatives, decisions,
  open questions, provenance).

So capture-faithfulness (open Q#6) is *mostly* in the backend, but the **frontend
is load-bearing** — without it the backend's generic opinions (YAGNI, plan-handoff)
break stack-control rules. The workflow then adds the mechanical layer: the
exit-gate verifies required sections (structural, not judgment), and the
transition fires the bookkeeping effects (link to node, journal, route to spec).

**This already exists as a convention.** The `*-design.md` family IS this artifact
— `2026-06-08-roadmap-protocol-design.md` was the named source of truth for spec 006
(its frontmatter: `status: design-approved (brainstorming output; feeds
/speckit-specify)`). The workflow doesn't invent the artifact or the skill; it makes
producing it a **named, required phase**, **relocates it into the installation
domain** (Ratified 2026-06-16 — the historical instances at repo-root
`docs/superpowers/specs/` predate the correction), and **redirects brainstorming's
terminal handoff** from its hardcoded `writing-plans` to Spec Kit (`/speckit-specify`
via `/stack-control:define`).

**This document is itself a `designing`-phase artifact** — the free-form
conversation defining `parseable-lifecycle-workflow`, captured as it happens.
We are dogfooding the phase we're inventing. (It's a strawman, not yet
converged to the full template above — that conversion is the remaining
`designing` work for this feature.)

---

## Opinion injection — how a frontend bends a backend it doesn't control

This is the reusable crux for *every* stack-control frontend-over-third-party-
backend (design now; the execution backends later). Get the shape right once.

### The constraint that forces the shape

The design conversation is **interactive** — the operator is in the loop,
answering clarifying questions one at a time. That means the backend **cannot be
isolated in a sub-agent** (sub-agents are non-interactive task executors). The
backend runs in the **main session**, so its SKILL.md instructions (including its
*conflicting* opinions, e.g. "YAGNI ruthlessly") are unavoidably in the same
context as the frontend's. **You do not control the backend's process.**

### The principle: bend the backend at the SEAM, not inside its process

Since you can't control a third-party tool's internals, the durable lever is
**the contract its OUTPUT must satisfy + the gate that enforces it** — not an
instruction you hope its process honors. In-context precedence is best-effort
*guidance*; the gate is *teeth*. Stated as a rule for all frontends:

> **Prefer opinions you can gate. An opinion with no mechanical or operator
> backstop is a weak opinion.** (Thesis: fix agents with environment, not yelling.)

### Three layers, each opinion backed by whichever can check it

1. **Soft — in-context precedence, restated at point-of-use.** The frontend
   states the opinion up front AND re-injects the override at the *specific
   backend step where the conflict bites* (e.g. at brainstorming's scope-check
   self-review: "do NOT cut scope here; capture it as an open question"). A
   preamble-only override is the version the model forgets mid-conversation.
2. **Mechanical gate — for structurally checkable opinions.** The `design-to-spec`
   exit-gate verifies: required sections present, `design:` pointer set, terminal
   routed to Spec Kit (the workflow *owns* what fires next, so `writing-plans`
   structurally cannot fire). These hold regardless of whether the soft layer held.
3. **Operator gate — for judgment opinions, recorded as a mechanical fact.** "Is
   the capture complete? did the backend silently cut scope?" can't be checked by
   inspecting the artifact alone. The backstop is the **operator-review gate**
   (brainstorming already has one) — agent posts the record, operator decides it's
   faithful. Crucially, that decision is **recorded** (an approval marker), and the
   `designing` exit criterion checks the *marker* — so even this lands as a
   mechanical, debate-free gate (see Stage gates § judgment criteria). The judgment
   is the operator's; the criterion is the recorded fact.

### Single-source opinion: inject AND check from one block

The frontend declares its opinion ONCE as a named, versioned **house-rules block**;
two consumers read it — the frontend *injects* it into the backend conversation,
and the exit-gate *checks* against it. (Same one-source-many-consumers shape as
the governed docs: parsed AND rendered from one file.) Strawman house-rules:

| # | rule | backed by |
|---|---|---|
| R1 | capture everything; no unrequested scope-cuts (overrides backend YAGNI) | operator gate |
| R2 | record has sections {problem, solution-space incl. rejected, decisions, open-Qs, provenance} | mechanical gate |
| R3 | terminal handoff → Spec Kit, never `writing-plans` | structural (workflow owns next) |
| R4 | anchored to a roadmap item; `design:` pointer set | mechanical gate |

### Worked against the YAGNI conflict

- **Soft:** frontend re-states "capture, don't cut" at the backend's scope-check step.
- **Mechanical:** exit-gate confirms the solution-space section exists with ≥2 alternatives.
- **Operator:** the review gate surfaces the record; operator catches anything dropped.

No single layer is trusted; the opinion that MUST hold is the one with a backstop.

---

## How the three operator asks map

- **"what's next for XYZ?"** → `stackctl workflow next {item}` — derives the
  current phase, names the next transition, its WORK (which skill/verb), and a
  **preview** of the effects that will fire. Report-only; writes nothing.
- **"do the next workflow step for XYZ"** → `workflow next` tells the agent the
  exact work to do (unambiguous because the doc declares it); the agent does the
  substantive work; then `workflow advance` applies the bookkeeping.
- **"move XYZ to the next stage"** → `stackctl workflow advance {item}`
  (dry-run → `--apply`) — reads the transition's effect manifest and **fires the
  declared verbs in order, atomically**. No agent discretion over which docs or
  statuses change.

---

## The constraint that kills the debate

**Every `effect:` is a call to an existing governed `stackctl` verb, from a
fixed vocabulary — never a prose instruction.** There is nothing to interpret,
so nothing to relitigate. v1 effect palette (strawman):

```
roadmap advance {item} --to {status}
roadmap reconcile
journal append {message}
doc set-status-field {path} {field} {value}    # e.g. feature README status table
commit {templated-message}
```

When a transition needs an effect that *isn't* a known verb, that is the signal
to **add the verb** — not to write a prose effect. (Field-proven this session:
re-parenting a roadmap edge had no verb, so it became TASK-137 →
`impl:gap/roadmap-reparent-verb`. The `workflow link-spec` effect above is the
same shape — a likely new verb the workflow surfaces.)

---

## Worked example — what this session SHOULD have been

When I graduated `design:feature/roadmap-protocol` (006) by hand earlier today, I:
1. ran `roadmap advance ... --to shipped` (a discretionary call I had to choose),
2. had to *remember* to `git commit` ROADMAP.md,
3. had to *notice* the ripple that unblocked `design:gap/roadmap-order-gating`.

Three discretionary steps. Under this workflow it is one command:

```
stackctl workflow advance design:feature/roadmap-protocol --apply
# fires the `graduate` transition: advance→shipped, reconcile (surfaces the
# newly-ready dependent), journal, commit — atomically, zero discretion.
```

---

## Open design decisions (for the spec)

1. **Atomicity.** All-or-nothing is required (a half-applied transition is worse
   than none). v1 options: (a) "validate every effect can fire, then fire in
   order, fail loud + roll back on first error"; (b) real staged transaction.
   Strawman picks (a) for v1.
2. **Effect vocabulary.** Is the 5-verb palette above the right v1 set? What's
   missing (e.g. `workflow link-spec`, a `release`-firing effect)?
3. **[RESOLVED 2026-06-16] Phase-derivation inputs.** The derive predicates depend
   on a "spec-govern converged" and "impl-govern converged" signal. Today governance
   graduation has **no on-disk record** (backlog TASK-19) — the workflow needs that
   record to derive `governing` vs `shipped` reliably. **Decision: TASK-19 is pulled
   INTO this feature's scope** (see Ratified 2026-06-16) — this feature designs and
   ships the graduation record + the gates that read it. No longer an external
   dependency; it is in-scope work.
4. **Where transitions fire side-effecting skills.** Some effects (`release`,
   `govern`) are heavy and interactive. Does `workflow advance` *invoke* them,
   or only the lightweight bookkeeping, leaving heavy work to the explicit
   skill? Strawman: advance fires only bookkeeping verbs; heavy phase-work stays
   an explicit skill the agent runs.
5. **Reuse vs new.** `workflow next` overlaps `session-start` and `roadmap next`
   heavily. Is the workflow engine a new verb family, or an extension of the
   roadmap reasoner with phase-awareness layered on?
6. **[MOSTLY RESOLVED] Capturing faithfully = `superpowers:brainstorming`.**
   Brainstorming already supplies the 2-3-alternatives requirement, the
   user-review gate, the spec self-review, and the HARD-GATE. The workflow adds
   only the mechanical required-section exit-gate on top. Not a net-new capture
   mechanism.
7. **Mid-stream re-design.** Design also happens AFTER specifying/implementing
   (the `/frontend-design` rule, `feature-extend` re-design). v1 models the
   linear `planned → designing → specifying` case; re-entry to `designing` from
   a later phase is a real case to handle — captured here, not yet designed.
8. **`/stack-control:design` IS a new frontend skill — over a swappable backend.**
   Not a from-scratch design tool, and not bare brainstorming either: an
   opinionated frontend (the "stack-control way") that drives a backend (default
   `superpowers:brainstorming`). Open sub-questions: (a) how does the frontend
   *suppress the backend's YAGNI* in practice — a prepended instruction, a
   wrapper prompt, a forked backend invocation? (b) what's the minimal backend
   contract for capability-based selection? (c) does the frontend drive the
   backend in-session (sub-agent / skill invocation) or shell out?
9. **Deriving `designing` before the doc exists.** Brainstorming writes the
   `*-design.md` only at its END (step 6). So between entering `designing` and
   that write, there is no design record to derive on — the item would mis-derive
   as `planned`. Options: set the node `design:` field on `open-design` (pointer
   before the file exists, derive on the field) vs. accept a transient
   "designing, pre-record" sub-state. Needs a decision; the `spec:`-field
   precedent argues for a `design:` pointer.
