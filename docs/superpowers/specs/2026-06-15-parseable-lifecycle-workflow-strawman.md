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
| 2 | `designing` | **free-form exploration → a design record** (problem domain, solution space, decisions) | a design conversation + `/stack-control:design` (NEW skill) |
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
- derive: design record present ∧ no spec dir
- work: /stack-control:design        # free-form exploration → design record
- next: specifying

## phase: specifying
- derive: node in-flight ∧ spec present ∧ spec-govern not converged
- work: /stack-control:define        # spec authored FROM the design record
- entry-gate: all depends-on shipped          # REPORTED (soft in v1)
- next: implementing

## transition: planned → designing
- codename: open-design
- exit-gate: (none — entering exploration; the record is scaffolded here)
- effect: roadmap advance {item} --to in-flight
- effect: workflow scaffold-design {item} {design-doc}   # NEW verb — writes the templated record skeleton
- effect: workflow link-design {item} {design-doc}       # NEW verb (gap)
- effect: journal append "opened design exploration for {item}"
- effect: commit "chore(stack-control): open design {design-doc} for {item}"

## transition: designing → specifying
- codename: design-to-spec
- exit-gate: design record's required sections are all filled (problem domain, solution space, ≥1 decision, open questions)
- effect: workflow link-spec {item} {spec-dir}    # spec's source-of-truth = the design record
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

The `open-design` transition **scaffolds** the record so it exists from the
start (hard to skip), and the `design-to-spec` exit-gate checks it's filled
(reported in v1). Required sections (strawman template):

```
# <feature> — design record
- problem domain        : the pain, who has it, why now
- solution space        : approaches CONSIDERED, incl. ones rejected + why
- decisions             : what we chose, the reasoning
- open questions        : explicitly deferred to the spec
- provenance            : source conversation (date), participants
```

**This already exists as a convention.** The `docs/superpowers/specs/*-design.md`
family is exactly this artifact — `2026-06-08-roadmap-protocol-design.md` was
the named source of truth for spec 006. The workflow doesn't invent the
artifact; it makes producing it a **named, required phase** instead of an
operator-remembered habit.

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
6. **Capturing a free-form conversation faithfully.** The design record is
   written by an *agent* from a *conversation* — that's phase WORK, not a
   mechanical effect. How do we keep it honest/complete (the agent's failure
   modes are forgetting + hallucination)? Options: a required-section checklist
   the exit-gate verifies (structural, mechanical); an explicit "capture the
   rejected alternatives" prompt in the `/stack-control:design` skill body; an
   operator review gate before `design-to-spec`. Probably all three.
7. **Mid-stream re-design.** Design also happens AFTER specifying/implementing
   (the `/frontend-design` rule, `feature-extend` re-design). v1 models the
   linear `planned → designing → specifying` case; re-entry to `designing` from
   a later phase is a real case to handle — captured here, not yet designed.
8. **`/stack-control:design` is a NEW skill.** The spine names it as the
   `designing`-phase work surface. It doesn't exist yet — it's the conversational
   exploration skill that produces the design record. New surface this feature
   implies.
