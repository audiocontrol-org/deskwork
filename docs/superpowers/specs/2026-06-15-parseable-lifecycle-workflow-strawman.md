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

- **Teeth (v1):** gates are **reported, not enforced** (no hard refusal). But
  transition **effects are automatic** — when you advance a stage, the tooling
  (not agent discretion) applies *all* the required doc + status updates. In
  Jira terms: post-functions automated; conditions/validators reported.
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
  `docs/superpowers/specs/*-design.md` family) but currently leaves to operator
  memory.
- **Every stage is an opinionated stack-control FRONTEND over a swappable
  BACKEND.** `define`→Spec Kit, `execute`→`/speckit-implement`, `govern`→model
  CLIs — and now `design`→a design backend (default `superpowers:brainstorming`,
  possibly third-party). The frontend owns the *opinion + contract* (the
  "stack-control way"); the backend owns the *mechanism* and is selected by
  **capability, never vendor identity** (succession rule, execution-backend
  port). This is a first-class principle, not specific to the design stage.

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

## The phase spine

| # | phase | the WORK (agent does) | done-by |
|---|---|---|---|
| 0 | `captured` | a found bug/gap exists in the backlog | `/stack-control:backlog capture` |
| 1 | `planned` | promoted to a roadmap node, awaiting design | `roadmap add` / `backlog promote` |
| 2 | `designing` | **free-form exploration → a design record** (problem domain, solution space, decisions, rejected alternatives) | `/stack-control:design` (frontend) → backend (default `superpowers:brainstorming`) → `docs/superpowers/specs/<date>-<slug>-design.md` |
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

- writes + commits `docs/superpowers/specs/<date>-<topic>-design.md` (its step 6);
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

**This already exists as a convention.** The `docs/superpowers/specs/*-design.md`
family IS this artifact — `2026-06-08-roadmap-protocol-design.md` was the named
source of truth for spec 006 (its frontmatter: `status: design-approved
(brainstorming output; feeds /speckit-specify)`). The workflow doesn't invent
the artifact or the skill; it makes producing it a **named, required phase** and
**redirects brainstorming's terminal handoff** from its hardcoded `writing-plans`
to Spec Kit (`/speckit-specify` via `/stack-control:define`).

**This document is itself a `designing`-phase artifact** — the free-form
conversation defining `parseable-lifecycle-workflow`, captured as it happens.
We are dogfooding the phase we're inventing. (It's a strawman, not yet
converged to the full template above — that conversion is the remaining
`designing` work for this feature.)

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
3. **Phase-derivation inputs.** The derive predicates depend on a "spec-govern
   converged" and "impl-govern converged" signal. Today governance graduation
   has **no on-disk record** (backlog TASK-19) — the workflow needs that record
   to derive `governing` vs `shipped` reliably. This is a real dependency.
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
