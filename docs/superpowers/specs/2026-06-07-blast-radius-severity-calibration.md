---
title: Blast-radius severity calibration for the audit-barrage protocol
date: 2026-06-07
status: accepted (field-test in progress)
feature: pluggable-lifecycle-providers / multi/migrate-audit-barrage (audit protocol)
supersedes-open-question: "severity calibration — what IS a HIGH" (DEVELOPMENT-NOTES, 2026-06-07)
---

# Blast-radius severity calibration (Approach A — rubric rewrite)

## Problem

Finding severity in the audit-barrage is each auditor model's free-text self-rating
(`Severity: high|medium|...`), parsed by the lift; a cross-model cluster inherits the
**max** severity across its members. The rubric the models are given (in
`plugins/stack-control/templates/audit-barrage-prompt.md`) is:

> `high` for correctness bugs adopters will hit; `medium` for design issues that compound;
> `low` for hygiene …

Two defects:

1. **It is code-oriented** ("correctness bugs," "the diff," "adopters will hit") — yet the
   spec-phase barrage feeds a **spec** into the same `{{diff}}` slot using this same prompt.
   When auditing a spec the models have no fit-for-purpose rubric and improvise.
2. **It has no slot for blast-radius.** A self-contradiction in a governance spec has no
   *direct* runtime cost, so a model reaches for HIGH because it *feels* serious — there is
   nowhere to record "real inconsistency, but a reader would obviously resolve it right."

Evidence: in the 004 convergence loop, AUDIT-42 (a real behavioral safety hole) and AUDIT-43
(a spec contradiction) both came back HIGH, even though their downstream costs differ by an
order of magnitude. The protocol treating all HIGHs identically is the gap.

## The calibration axis: downstream blast-radius

A finding's true severity is **the consequence if a downstream consumer acts on the audited
surface as written** — "how bad × how likely to be acted on wrong." The consumer may be an
adopter running the code, or — especially for a spec — an AI agent building **unattended**,
with no human to catch a wrong reading.

Critically, this is **not** "behavioral vs documentation-only." A spec contradiction's cost is
*latent*, not zero: caught post-hoc against already-correct code it is cheap, but the same
contradiction encountered *before* implementation can drive an agent to build the wrong branch,
produce divergent implementations across a parallel build, or propagate as an editing cascade
(cf. AUDIT-41). In spec-governance specifically, the spec **is** the deliverable — internal
consistency is behaviorally load-bearing downstream. So a high-divergence, non-disambiguated
contradiction is genuinely HIGH; a contradiction a reader would obviously resolve correctly is
not. The axis ranks by downstream consequence, not by how alarming a finding feels.

## Decision

**Approach A only** (operator decision 2026-06-07): rewrite the rubric at the source; field-test
in this project; add machinery (a calibration pass, a second axis) only if A proves insufficient.
Do not change too much at once without real-world evidence.

### Where it lives

Edit the **plugin default** `plugins/stack-control/templates/audit-barrage-prompt.md` directly,
on the `feature/pluggable-lifecycle-providers` branch. NOT a project-local override.

Rationale: the calibrated rubric is a **general** improvement (the old rubric was wrong for
everyone), not a project-specific preference, so it belongs in the default. A `.stack-control/`
override would (a) copy the whole prompt → silent drift the moment the default's other sections
change (the install-drift failure class from 2026-06-07), and (b) park a general fix where
adopters never receive it. The feature branch already provides all the isolation needed —
this repo is the monorepo, so the worktree barrage reads the source template immediately
(field test works on-branch), and nothing reaches adopters until we choose to merge + release,
which is far off.

### The rubric (replaces the `blocking/high/medium/low/informational` scale)

> **Rate each finding by downstream blast-radius — the consequence if a downstream consumer
> acts on the audited surface *as written*.** The consumer may be an adopter running the code,
> or — especially for a spec — an AI agent building **unattended** from it, with no human to
> catch a wrong reading. Rate by what would actually happen if this shipped as-is, **not by how
> alarming the finding feels.**
>
> - `blocking` — acting on it as-written breaks the feature's stated goals; OR (spec) it forces
>   an agent to a wrong implementation and nothing in the artifact signals which reading is
>   intended.
> - `high` — a correctness/safety defect a consumer will hit; OR a spec contradiction/ambiguity
>   where the plausible readings **diverge materially** in what gets built **and** the artifact
>   doesn't disambiguate — an agent would plausibly build the wrong one.
> - `medium` — a design issue that compounds; OR a spec inconsistency a reasonable consumer
>   would **resolve correctly** anyway (readings barely diverge, or context makes the intended
>   one obvious).
> - `low` — hygiene; cosmetic wording with no behavioral or implementation consequence.
> - `informational` — context worth seeing, not itself a defect.
>
> **Calibrate by consequence, not by alarm.** A genuine contradiction a reader would obviously
> resolve the right way is at most `medium`. A quietly-plausible wrong reading an agent would
> actually build is `high`/`blocking` even if it looks minor. A spec's internal consistency is
> load-bearing — it is the input to an unattended build.

### Scope boundary (deliberate)

Rewrite the **rubric** + the minimal spec-aware framing it needs. **Leave** the rest of the
template's code-ish phrasing ("the diff," "cite line numbers") as-is. A full code-vs-spec prompt
fork is beyond Approach A; add it only if the field test shows the code-framing is hurting spec
audits.

## Field test (no unit test)

You cannot unit-test an LLM's rating, and the project rule is "don't test the model's response
to a prompt." The test is **observation on live runs**: the next 004 re-barrage uses the new
rubric, and we watch whether HIGH ratings now track blast-radius. That run conveniently *is* the
004 loop resume — one action does both. Adjust the rubric on evidence.

## What this does and does not do

- **Does:** make severity *honest* — the gate blocks on real downstream consequence, and a
  genuinely cosmetic finding a model panic-rated HIGH drops to medium/low, so a later override
  decision becomes clear-cut when only low-blast-radius findings survive.
- **Does NOT:** promise faster 004 convergence. Both AUDIT-42 and AUDIT-43 would still rate HIGH
  under this rubric (42 is a safety hole; 43 was high-divergence with no disambiguation). If the
  spec genuinely has more high-blast-radius issues, the loop *should* keep finding them.

## Follow-ups (not in this increment)

- If A proves inconsistent across stochastic models, escalate to a **calibration pass**
  (Approach B): a post-barrage step, ideally multi-model, that re-rates each clustered finding's
  severity against this rubric before the gate counts it. More thesis-aligned (mechanism, not
  instruction) but earns its cost only if A is insufficient.
- Promote the rubric to all phases / reconcile any code-vs-spec prompt split if the field test
  shows the residual code-framing matters for spec audits.
