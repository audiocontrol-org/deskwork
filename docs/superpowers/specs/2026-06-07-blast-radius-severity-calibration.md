---
title: Blast-radius severity calibration for the audit-barrage protocol
date: 2026-06-07
status: accepted (field-test in progress)
feature: pluggable-lifecycle-providers / multi/migrate-audit-barrage (audit protocol)
supersedes-open-question: "severity calibration — what IS a HIGH" (DEVELOPMENT-NOTES, 2026-06-07)
governed-by: cross-model barrage over this doc, run 20260607T134646173Z-design-blast-radius-calibration
  (claude + codex); findings folded in (see § Design review).
---

# Blast-radius severity calibration (Approach A — rubric rewrite)

## Problem

The defect this increment fixes: **finding severity is an uncalibrated, free-text
self-rating with no shared definition of what each level means.** Each auditor model
emits a `Severity: high|medium|...` line on its own judgment; the lift parses it; a
cross-model cluster inherits the **max** severity across its members. The only guidance
the models get is one line in `plugins/stack-control/templates/audit-barrage-prompt.md:56`:

> `high` for correctness bugs adopters will hit; `medium` for design issues that compound;
> `low` for hygiene …

That rubric gives the models nowhere to record *"real issue, but a reader would obviously
resolve it right"* vs *"looks minor, but an agent would build it wrong."* So models rate by
**how alarming a finding feels**, not by its consequence. The symptom that surfaced the gap:
the 004 convergence loop kept producing one HIGH per round on an exhaustively-detailed spec,
which prompted the operator's question — *"what IS a HIGH?"* Without a shared, consequence-based
definition, the severity axis the gate depends on is not reliable.

**A separate, real issue we are NOT fixing in this increment:** the same prompt is
code-oriented ("the diff," "cite line numbers," "correctness bugs adopters will hit") and is
reused verbatim to audit *specs* (the spec goes into the `{{diff}}` slot). That framing
mismatch is genuine but is a distinct lever from severity calibration; see § Scope boundary
and § Bounded non-goals. We name it here so it is not mistaken for in-scope.

### Why AUDIT-42/43 are NOT the motivating evidence (and what they actually show)

Earlier discussion used AUDIT-42 (a coverage safety-hole) and AUDIT-43 (an FR-010 spec
contradiction) — both rated HIGH — as if they proved miscalibration. They do **not**, and the
honesty matters: under the blast-radius lens below, **both are legitimately HIGH** (42 is a
safety hole; 43 was a high-divergence contradiction an agent could build wrong). They are not
an order of magnitude apart, and the new rubric does **not** demote either. So 42/43 are not
evidence the protocol *miscalibrates* — they are the worked example the rubric must **not
break** (a correct rubric keeps both at HIGH). We do not yet have a captured instance of the
old rubric inflating a genuinely-low-blast-radius finding to HIGH; surfacing whether that
happens is precisely what the field test (below) is for.

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
consistency is behaviorally load-bearing downstream. The axis ranks by downstream consequence,
not by how alarming a finding feels.

## Decision

**Approach A only** (operator decision 2026-06-07): rewrite the rubric at the source; field-test
in this project; add machinery (a calibration pass, a second axis) only if A proves insufficient
*by the criterion defined below*. Do not change too much at once without real-world evidence.

### Where it lives — the plugin default (path verified)

Edit the **plugin default** `plugins/stack-control/templates/audit-barrage-prompt.md` directly,
on the `feature/pluggable-lifecycle-providers` branch. NOT a project-local override.

Rationale: the calibrated rubric is a **general** improvement (the old rubric had no
blast-radius definition for anyone), not a project-specific preference, so it belongs in the
default. A `.stack-control/` override would (a) copy the whole prompt → silent drift the moment
the default's other sections change (the install-drift failure class from 2026-06-07), and
(b) park a general fix where adopters never receive it. The feature branch already isolates it
from adopters until we choose to merge + release, which is far off.

**Field-test-path verification (do not assume — verified 2026-06-07):** the live barrage *does*
load this exact file. Evidence: (a) the real 004 run `20260607T101208624Z`'s `PROMPT.md` contains
this template's line-56 rubric text verbatim; (b) `spec-governance/scripts/bash/govern-spec.sh`
resolves stackctl from `git rev-parse --show-toplevel/plugins/stack-control/bin/stackctl` — the
source bin → source renderer → `DEFAULT_PROMPT_TEMPLATE_PATH` = source `templates/`; (c)
`.specify/extensions/` carries **no** `spec-governance` install and **no** prompt-template copy
to shadow the source. So editing the source template changes the next 004 run. (Residual note:
if the loop were ever resumed via an auto-firing *installed* `.specify` hook rather than the
manual source-bin invocation, the install-drift class could reappear — but that path is not
installed and not how we drive the loop.)

### The exact edit (one location; parser untouched)

Replace **exactly the severity-criteria sentence at `audit-barrage-prompt.md:56`** with the
rubric block below. The `Severity: <blocking | high | medium | low | informational>` **format
placeholder at line 50 stays** (it is the field shape, not criteria). There is exactly **one**
criteria location — do not add a second copy elsewhere, or the model anchors on whichever it
reads last. The five-level **vocabulary and the lift parser are deliberately UNCHANGED** — this
edit changes the *criteria* for assigning each level, not the levels themselves. No parser,
gate, or severity-string change is implied; an implementer must not rename a level.

### The rubric (replaces the *criteria* for the existing five-level scale)

> **Rate each finding by downstream blast-radius — the consequence if a downstream consumer
> acts on the audited surface *as written*.** The consumer may be an adopter running the code,
> or — especially for a spec — an AI agent building **unattended** from it, with no human to
> catch a wrong reading. Rate by what would actually happen if this shipped as-is, **not by how
> alarming the finding feels.**
>
> - `blocking` — acting on it as-written breaks the feature's stated goals; OR (spec) the **more
>   natural reading an agent reaches first is the wrong one**, so it will likely be built wrong
>   by default and nothing in the artifact corrects it.
> - `high` — a correctness/safety defect a consumer will hit; OR a spec contradiction/ambiguity
>   where the readings are **roughly equally plausible** and the artifact doesn't disambiguate —
>   an agent might build either, including the wrong one.
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

Rewrite **only the severity-criteria sentence** + the minimal spec-aware framing the rubric
itself carries. **Leave** the rest of the template's code-ish phrasing ("the diff," "cite line
numbers") as-is. This is a **bounded non-goal**, not an oversight or an open-ended "later": the
code-framing mismatch (§ Problem) is a *separate* lever, and changing it now would be two changes
at once against one field test. **Entry-into-scope trigger:** it becomes in-scope work the moment
a field-test run shows the residual code-framing is degrading spec audits (§ Bounded non-goals).

## Known limitation: max-severity aggregation bounds A's effect

The lift assigns a cluster the **max** severity across its member models. So a per-model rubric
*amplifies* miscalibration rather than averaging it: if every model but one rates a
trivially-resolvable contradiction `medium` and a single model panic-rates it `high`, the
cluster still inherits `high`. **A's calibration therefore only takes full effect when all
models calibrate consistently** — a stronger condition than "the rubric is clearer." This bounds
A's expected effect size, and it is *why* a split-severity observation (below) is itself the
trigger for Approach B: a single calibrated re-rater (B) is immune to the panic-vote problem,
whereas instruction-only A is not. This is the central reason B remains on the table.

## Field test + evaluation contract (no unit test)

You cannot unit-test an LLM's rating, and the project rule is "don't test the model's response
to a prompt." The test is **observation across live runs** (the 004 re-barrages + future
barrages — *not* a single N=1 run; one run is too thin, and we already predict 42/43 won't
change). Before reading a run, the contract is:

**A is working if, across runs (each criterion is a DIRECT observable, not a counterfactual guess):**
- no genuine high-blast-radius finding (a safety hole, or a high-divergence non-disambiguated
  contradiction) is rated **below** HIGH; AND
- every `medium`/`low` finding carries an explicit **blast-radius rationale** in its body — the
  rating visibly reasons by *consequence if acted on*, not by alarm; AND
- the two models rate the **same** clustered finding within **one** severity level of each other
  (consistency — see the max-aggregation limitation).

(The earlier draft phrased the second criterion as "a finding the old rubric *would have* inflated
now lands lower" — that is a counterfactual the evaluator cannot observe without a control run, so it
was replaced with the direct observable above. A natural paired baseline *is* nonetheless available
for optional corroboration: the pre-change runs of a given artifact ran under the OLD rubric — e.g.
004 iteration 8, design-doc iterations 1–2 — and post-change runs under the NEW rubric on the **same**
artifact, so a same-artifact old-vs-new severity comparison is observable if a sharper signal is wanted.)

**A is insufficient → escalate to Approach B if, across runs:**
- the same finding is rated **2+ severity levels apart** across models on the same run (the
  panic-vote / max-aggregation failure the rubric cannot fix from the prompt alone); OR
- a genuinely-cosmetic finding keeps landing at HIGH with no blast-radius justification.

**Who evaluates:** the operator/agent reads each run's findings, severities, and the
blast-radius rationale in each body, and compares against this contract. The judgment is
qualitative but the contract is falsifiable — it names the observable that fires the B gate.

## Generality claim — honest scope of the evidence

Editing the default changes calibration for **both** spec and code audits, for this project (and
eventually adopters). But the field test exercises **only the spec path** (the 004 re-barrages).
So: the rubric is **validated on spec audits**; its effect on **code-audit** calibration is
**assumed neutral, pending observation** when a code-phase (`govern --mode implement`) barrage
next runs. We still edit the default (correct home), but we do **not** claim proven-general on
spec-only evidence — that would be the unverified-scope claim the project's own discipline flags.
Re-confirm on the first code-phase barrage.

## What this does and does not do

- **Does:** give severity a shared, consequence-based definition so the rating is consistent and
  honest — and so a genuinely-cosmetic finding a model would panic-rate HIGH drops to its true
  level *with a stated rationale*, making a later override decision clear-cut.
- **Does NOT:** promise faster 004 convergence, and does NOT reduce AUDIT-42/43 (both legitimately
  HIGH). If the spec genuinely has more high-blast-radius issues, the loop *should* keep finding
  them. Per the max-aggregation limitation, A's effect is also bounded by the least-calibrated
  model on each finding.

## Bounded non-goals (each with an entry-into-scope trigger)

These are **not** open-ended deferrals — each names the concrete condition under which it enters
scope (per the project's no-"just-for-now" discipline). They are out of *this* increment by design,
not forgotten:

- **Approach B — a calibration pass.** If the field-test contract fires the B gate, add a
  post-barrage step (ideally multi-model, or a single focused re-rater) that re-rates each
  *clustered* finding's severity against this rubric before the gate counts it. B is the natural
  home for calibration precisely because it is immune to the max-aggregation panic-vote problem;
  it is a *mechanism* (thesis-aligned), where A is *instruction*. B earns its cost only once A's
  insufficiency is demonstrated by the contract above.
- **Code-vs-spec prompt framing.** If the field test shows the residual code-framing degrades
  spec audits, split or generalize the prompt's non-rubric framing (the separate code-framing
  lever noted in § Problem).
- **Re-confirm code-audit calibration** on the first `govern --mode implement` barrage (the
  generality claim).

## Design review (this doc was governed before implementation)

This design was itself put through a cross-model barrage (run
`20260607T134646173Z-design-blast-radius-calibration`, claude + codex) before any code. Folded
in: claude-03 (max-aggregation limitation), claude-04 (the 42/43-motivation honesty fix),
claude-05 + codex-02 (the field-test evaluation contract), claude-06 + codex-01 (narrowed
problem + generality scope), claude-07 (sharper blocking/high boundary), claude-08 (criteria-not-
scale heading + parser-untouched note). Two findings were rated HIGH by the barrage; on
verify-premise: claude-01 ("rubric appears twice") was factually wrong (criteria appear once, at
line 56; line 50 is the format placeholder) — addressed by the exact-edit precision above;
claude-02 (field-test-path unverified) was a valid demand — verified and recorded in § Where it
lives.
