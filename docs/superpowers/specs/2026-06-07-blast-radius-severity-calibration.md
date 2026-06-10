---
title: Blast-radius severity calibration for the audit-barrage protocol
date: 2026-06-07
status: accepted (converged through 3 design-doc barrage iterations; field-test in progress)
feature: pluggable-lifecycle-providers / multi/migrate-audit-barrage (audit protocol)
supersedes-open-question: "severity calibration — what IS a HIGH" (DEVELOPMENT-NOTES, 2026-06-07)
governed-by: cross-model barrage over this doc, iterations 1–3
  (20260607T134646173Z / T152430330Z / T152816675Z, claude + codex); converged via
  two-consecutive-0-HIGH (see § Design review).
---

# Blast-radius severity calibration (Approach A — rubric rewrite)

## Problem

The defect this increment fixes: **finding severity is an uncalibrated, free-text
self-rating with no shared definition of what each level means.** Each auditor model
emits a `Severity: high|medium|...` line on its own judgment; the lift parses it; a
cross-model cluster inherits the **max** severity across its members. The only guidance
the models get is one line at `plugins/stack-control/templates/audit-barrage-prompt.md:56`
that maps each level to a short code-oriented gloss (HIGH → adopter-facing correctness defects,
MEDIUM → design issues that compound, LOW → hygiene) with **no notion of downstream blast-radius.**

(This doc deliberately *describes* the old rubric rather than quoting it verbatim. A verbatim
quote of the live template text, fed back into the barrage that renders this same template, makes
auditor models mis-count the quote as a *second live rubric* in their own prompt — the recurring
false HIGH in § Design review, iteration 3. Describing it removes the confusion at the root.)

That rubric gives the models nowhere to record *"real issue, but a reader would obviously
resolve it right"* vs *"looks minor, but an agent would build it wrong."* So models rate by
**how alarming a finding feels**, not by its consequence. The symptom that surfaced the gap:
the 004 convergence loop kept producing one HIGH per round on an exhaustively-detailed spec,
which prompted the operator's question — *"what IS a HIGH?"* Without a shared, consequence-based
definition, the severity axis the gate depends on is not reliable.

**A separate, real issue we are NOT fixing in this increment:** the same prompt is
code-oriented (it speaks of "the diff," line-number citations, and adopter-facing correctness
defects) and is reused verbatim to audit *specs* (the spec goes into the `{{diff}}` slot). That
framing mismatch is genuine but is a distinct lever from severity calibration; see § Scope
boundary and § Bounded non-goals. We name it here so it is not mistaken for in-scope.

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

Replace **exactly the severity-criteria sentence at `audit-barrage-prompt.md:56`** (the
`Use blocking only for …` sentence) with the rubric block below. The
`Severity: <blocking | high | medium | low | informational>` **format placeholder at line 50
stays** (it is the field shape, not criteria). There is exactly **one** criteria location —
verified by grep (count = 1) — do not add a second copy elsewhere. After editing, re-grep the
template to confirm exactly one criteria location remains. The five-level **vocabulary and the
lift parser are deliberately UNCHANGED** — this edit changes the *criteria* for assigning each
level, not the levels themselves. No parser, gate, or severity-string change is implied; an
implementer must not rename a level.

### The rubric (replaces the *criteria* for the existing five-level scale)

> **Rate each finding by downstream blast-radius — the consequence if a downstream consumer
> acts on the audited surface *as written*.** The consumer may be an adopter running the code,
> or — especially for a spec — an AI agent building **unattended** from it, with no human to
> catch a wrong reading. Rate by what would actually happen if this shipped as-is, **not by how
> alarming the finding feels.** State the blast-radius reasoning in the finding body for **every**
> finding, at every level.
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
barrages — *not* a single N=1 run).

**Stochastic-correctness stance (operator, 2026-06-07):** we do **not** need a clean signal from
any one run. We build confidence the rubric works **over many runs** — or find out it fails
spectacularly (which is loud and obvious, not subtle). This disposes of the "changing the rubric
mid-004-loop confounds the loop's convergence signal" concern: the confound is real for a *single*
crossover round but immaterial against an accumulating multi-run signal, so we do **not** freeze
the rubric or wait for a fresh artifact — we change it now and read the *trend*, not the one round.
A single high→medium re-rating across the rubric change is noise; a sustained pattern is signal.

Per-run, the contract is (each criterion a DIRECT observable, not a counterfactual guess):

**A is working if, across runs:**
- no genuine high-blast-radius finding (a safety hole, or a high-divergence non-disambiguated
  contradiction) is rated **below** HIGH; AND
- **every** finding — including agreed-`high`/`blocking` ones — carries an explicit **blast-radius
  rationale** in its body that reasons by *consequence if acted on*, not by alarm. Requiring the
  rationale on HIGH too (not just MED/LOW) is the only observable that catches **correlated panic**:
  under max-aggregation, if all models wrongly rate a trivially-resolvable item `high`, their spread
  is 0 and a divergence-only check passes — so an agreed-but-*unjustified* HIGH must read as a
  failure; AND
- the **maximum pairwise severity spread** among all model ratings for the same clustered finding
  is **≤ 1 level** (N-model-general — not hardcoded to two models; see the max-aggregation limitation).

**A is insufficient → escalate to Approach B if, across runs:**
- the same finding is rated **2+ severity levels apart** across models on the same run (the
  panic-vote / max-aggregation failure the rubric cannot fix from the prompt alone); OR
- a genuinely-cosmetic finding keeps landing at HIGH with no blast-radius justification.

A natural paired baseline is available for optional corroboration (not required): the pre-change
runs of an artifact ran under the OLD rubric (e.g. 004 iteration 8; design-doc iterations 1–2) and
post-change runs under the NEW rubric on the **same** artifact, so a same-artifact old-vs-new
severity comparison is observable if a sharper signal is wanted.

**Who evaluates:** the operator/agent reads each run's findings, severities, and blast-radius
rationale, and compares against this contract. The judgment is qualitative; the contract is
falsifiable — it names the observable that fires the B gate.

## On the gate (stated, since the calibration's effect runs through it)

The convergence gate (FR-010) blocks on open **HIGH/BLOCKING** severity and slushes residual
MED/LOW once the dampener engages. So re-rating a finding *across* the HIGH threshold
(panic-`high` → true `medium`) **does** change gate/convergence behavior — that is the **intended**
effect (an honestly-`medium` finding shouldn't block graduation like a real HIGH). What the rubric
does NOT do is *artificially* deflate a genuine HIGH to dodge the gate; it only moves a finding
when its true blast-radius is lower. "Doesn't promise faster convergence" therefore means: it won't
*manufacture* convergence by deflation — not that it leaves the gate untouched.

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
  model on each finding. It also does **not** fix a *false-premise* HIGH (a model rating a factually
  wrong claim HIGH) — only verify-premise-against-the-artifact does that (see § Design review).

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

This design was put through the **full convergence protocol** — three cross-model barrage
iterations (claude + codex) — before any code, and **converged via two-consecutive-0-HIGH**:

- **Iteration 1** (`20260607T134646173Z`): 2 HIGH + 6 MED + 2 LOW. Folded in: max-aggregation
  limitation, the 42/43-motivation honesty fix, the field-test contract, narrowed problem +
  generality scope, sharper blocking/high boundary, criteria-not-scale heading. On verify-premise:
  claude-01 ("rubric appears twice") was factually wrong (criteria appear once, at line 56);
  claude-02 (field-test-path unverified) was valid → verified + recorded in § Where it lives.
- **Iteration 2** (`20260607T152430330Z`): **0 HIGH**, 1 MED + 1 LOW. Folded in: the success
  criterion made a direct observable (was a counterfactual); scope/non-goals reframed as bounded
  with triggers.
- **Iteration 3** (`20260607T152816675Z`): one HIGH that is **false on verify-premise** (it
  re-raised "rubric appears twice"; the template has exactly one criteria location — grep count = 1
  — and the recurrence is caused by this doc previously *quoting* the old rubric verbatim, which
  inflated the rendered-prompt count to 3; fixed at the root by de-quoting in § Problem). With that
  HIGH dispositioned false, **iterations 2 and 3 are two consecutive 0-open-HIGH runs → the dampener
  engages → converged (branch b).** The four real MEDs were folded: the gate threshold stated +
  convergence claim reconciled (§ On the gate); the consistency criterion made N-model-general and
  given a correlated-panic observable (rationale-required-on-HIGH); the mid-loop-confound resolved
  by the stochastic-correctness stance (§ Field test).

**Meta-lesson recorded for the protocol:** the recurring false HIGH demonstrates that
*calibration (instruction)* cannot fix a finding whose *premise* is false — the model rates a
factually-wrong claim HIGH because it believes the premise. Only **verify-premise-against-the-
artifact** (a mechanism) kills it. This is independent evidence for putting a verification step in
the protocol (Approach-B-shaped) rather than relying on prompt instruction alone.
