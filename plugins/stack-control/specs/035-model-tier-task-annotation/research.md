# Research: Model-tier task annotation at the tasks-authoring seam

Phase 0 decisions. Each implementation-altitude question the design record left open (its § Open
questions) is resolved here, plus the plan's structural picks. Every decision traces to a locked
design decision (D1–D6 in the plan) and an FR. The load-bearing directional decision — *inject at
the define seam, generator proposes / existing gate guarantees* — was settled in the design record
(Alternative D) and is restated briefly in Decision 6, not re-opened.

## Decision 1 — Capability ranking source: an explicit declared constant, not Set-iteration

**Decision**: Add an explicit `MODEL_CAPABILITY_RANK: readonly string[]` to
`src/execute/accepted-models.ts`, ordered capability-ascending:
`['haiku', 'sonnet', 'opus', 'fable']`. The bucket-binding ranking function ranks each `tier_map`
label by the index of its resolved model in this array. `accepted-models.ts` remains the single
model-vocabulary source (Principle III/IX) — the rank lives beside `ACCEPTED_MODELS` and
`ACCEPTED_MODELS_LABEL`, not in a new model-naming location.

**Rationale**:
- Today `accepted-models.ts` only has a `Set` (`ACCEPTED_MODELS`) and a display label
  (`ACCEPTED_MODELS_LABEL`). Its comment *claims* the label order is "capability-tier ascending so
  error messages read naturally" — but a `Set` has **no ordering contract** a consumer may depend
  on, and no explicit ranking constant exists. FR-004a requires ranking labels by the *capability
  order of the resolved model*; that order must be an explicit, declared, testable datum — not
  inferred from `Set` insertion order (a fragile implicit dependency).
- One declared array makes the ordering auditable and unit-testable (a RED test pins the exact
  sequence), and makes the *declared, deterministic* nature of `fable`'s placement explicit in a
  comment: `fable`'s rank is a **declared deterministic ordering, not an absolute-capability
  claim**. Most `tier_map`s only bind `haiku`/`sonnet`/`opus`, so `fable`'s exact rank rarely binds
  a bucket in practice — but it is fully defined for determinism when it does.
- Keeping the rank in `accepted-models.ts` preserves the "single model-vocabulary source" invariant:
  a second host's accepted-model set (the D4 open consideration in 033) contributes its own rank
  behind the same seam, with no edit elsewhere.

**Alternatives considered**:
- **Depend on `ACCEPTED_MODELS` Set iteration order** — rejected: `Set` iteration order is insertion
  order, an implicit contract no reader should lean on; a future refactor reordering the literal
  would silently reorder buckets. FR-004a needs an *explicit* order.
- **Put the rank in `tier-requirement.ts`** — rejected: that would re-declare model names outside
  `accepted-models.ts`, splitting the single model-vocabulary source (Principle III) across two
  files. The rank is model-vocabulary data; it belongs with the model set.

## Decision 2 — `tier-vocab` verb vs. reusing the config-loader at the seam

**Decision**: Add a new thin read verb `stackctl tier-vocab [--json]`
(`src/subcommands/tier-vocab.ts`) rather than having the define skill body read raw config inline.
The verb resolves the enclosing installation (`findInstallation`), reads `config.tierMap`, computes
the bucket bindings via the Decision-1 ranking function, and emits the labels + per-label resolved
model + `{cheapest, mid, mostCapable}` bindings as JSON (default). Absent/empty `tier_map` →
`{configured:false}` + a loud human advisory, **exit 0**. Malformed config / no installation → fail
loud, non-zero. Registered like `resolve-tiers`: in `src/cli.ts` `SUBCOMMANDS`, in
`src/cli-help/surfaces/spec-misc.ts` for `--help` parity, and in
`src/capability/fronted-operations.ts` `INTERNAL_VERBS` (read-only computation fronted by the
`/stack-control:define` skill — no standalone `/stack-control:tier-vocab` skill, exactly as
`resolve-tiers` is fronted by `/stack-control:execute`).

**Rationale**:
- The seam needs the *same* config read the execute side already fronts through a verb. Mirroring
  `resolve-tiers`'s "read config → compute → emit JSON or fail loud" boundary gives a **testable,
  deterministic** surface (the four states are unit tests on config fixtures) instead of YAML parsing
  + installation resolution + bucket-binding improvised in skill prose each run.
- The bucket bindings (`{cheapest, mid, mostCapable}`) are *computed* (the ranking function), not
  raw config. The render block needs those computed bindings; the verb computes them once so the JSON
  it emits and the block the seam injects agree by construction (they call the same function).
- Read-only, mutates nothing → no front-door *mediation* required, but it MUST keep
  `check-front-door` exit 0 (028 US4) — hence the `INTERNAL_VERBS` + help-descriptor registration.

**Alternatives considered**:
- **Reuse `loadInstallationConfig` inline in the skill body** — rejected: unstable/untestable prose,
  and it would re-derive the bucket bindings the render block needs (duplicating the ranking). The
  verb is the deterministic boundary.
- **Fold vocab into `resolve-tiers`** (e.g. a `--vocab` mode) — rejected: `resolve-tiers` is a
  spec-scoped *execute-time* gate keyed on `--spec <dir>/tasks.md`; `tier-vocab` is an
  installation-scoped *authoring-time* read with no spec/tasks input. Different inputs, different
  lifecycle phase, different exit-code contract (tier-vocab exits 0 on absent map; resolve-tiers
  fails). Overloading one verb muddies both.

## Decision 3 — Ranking function placement and the deterministic bucket-binding rules

**Decision**: Place the pure ranking function `bucketBindings(tierMap): TierBuckets` in
`src/workflow/tier-requirement.ts` beside `renderTierRequirement` (the render block is its only
consumer; the `tier-vocab` verb imports it). It imports `MODEL_CAPABILITY_RANK` from
`accepted-models.ts`. The bucket rules (fully specified in data-model.md § Tier ranking):
- Rank each label by the capability rank of the model it resolves to.
- `cheapest` = the label of **minimum** rank; `mostCapable` = the label of **maximum** rank.
- `mid` = the label of the **median** rank. **Even-count median rule**: choose the **lower-middle**
  by rank (index `floor((n-1)/2)` of the labels sorted ascending by rank). **Two-label collapse**:
  `mid = cheapest` (the lower of the two) — documented in data-model.md.
- **Tie-breaking**: when two labels share a rank (both resolve to the same model, or two models
  share a rank — which cannot happen with the injective `MODEL_CAPABILITY_RANK` but the rule is
  stated for completeness), break by **label string ascending**.

**Rationale**: The render module and the verb both need the bindings; co-locating the pure function
with the text that describes it keeps binding logic and its prose in one module + one test file.
The rules are chosen to be **total and deterministic** for any label count/naming (FR-004a/FR-010) —
including 1-, 2-, and 4+-label maps and ties — so no `tier_map` shape produces an undefined binding.
The lower-middle even-median and the two-label `mid=cheapest` collapse both bias `mid` toward the
cheaper end, matching the heuristic's intent (only genuinely cross-cutting work escalates to
most-capable).

**Alternatives considered**:
- **Upper-middle even-median** — rejected: biasing `mid` toward the more capable model would push
  standard work to the pricier tier, against the barbell "industrialize execution cheaply" thesis.
  Consistency matters more than the exact choice; lower-middle is documented and tested.
- **A separate `tier-ranking.ts` module now** — deferred to the file-size trigger (plan § Complexity
  Tracking): the function is ~40 lines; a premature split adds a file for no gain. If
  `tier-requirement.ts` approaches the cap, the function moves and the render module imports it.

## Decision 4 — Static-template single-sourcing: shared string constants + a drift test

**Decision**: `renderTierRequirement`'s module exports small **canonical-string constants** (e.g.
the `[tier:<label>]` format clause and the heuristic clause — the exact strings named in
render-tier-requirement.md § Shared constants). Both consumers use them: the seam injection renders
them into the backend conversation; the template exemplification embeds the same clauses in
`tasks-template.md`. A **drift test** (`tasks-template-drift.test.ts`) asserts the template's tier
section *contains* each exported canonical constant. Because a static markdown template cannot call
the TS render function, this shared-constant + drift-test pair **is** the FR-012 single-sourcing
mechanism for the template surface.

**Rationale**: FR-012 requires the seam and the template to not drift. The seam injection genuinely
single-sources (it calls `renderTierRequirement`). The template is static markdown the backend reads
directly — it cannot execute TS — so identity-by-construction is impossible there. The next-best
guarantee is *mechanical drift detection*: if an edit changes the canonical format/heuristic string
in the TS module but not the template (or vice-versa), the drift test goes RED. This makes the two
surfaces provably-aligned at CI/floor time rather than by hope.

**Alternatives considered**:
- **Generate the template from the render module at build time** — rejected: adds a build step +
  generated-file hygiene to a plugin that ships static templates; the template also carries
  non-tier content (`[P]`/`[US n]` docs, phase structure) the render module does not own, so full
  generation over-reaches. The drift test covers the tier section precisely without owning the whole
  file.
- **Skip the template edit entirely (seam-only)** — rejected: FR-011 is in scope (clarified 2026-07-08,
  "all in"); direct/native `/speckit-tasks` use outside the front door should still model the tag.
  The drift test is what keeps that exemplification honest.

## Decision 5 — The `UNSET` sentinel: syntactically a possible key, mitigated by advisory + the floor

**Decision**: Use `[tier:UNSET]` as the explicit unresolved sentinel emitted per task when the
installation has no `tier_map` (FR-009). Confirmed against `src/execute/tier-resolution.ts`: `UNSET`
is **not** a reserved token in the resolver — `resolveTier` checks
`Object.prototype.hasOwnProperty.call(tierMap, tierLabel)`, so:
- With **no `tier_map`** (the FR-009 state), a tiered task hits the `tierMap === undefined` branch →
  `no-map` error → `resolve-tiers` exits 1. (So even the `UNSET`-tagged tasks fail loud at execute,
  as intended.)
- If a `tier_map` **is** later configured but does **not** contain a key literally named `UNSET`
  (the normal case), `[tier:UNSET]` → `unknown-tier` error → exit 1. Fail-loud, as intended.
- **Edge**: a `tier_map` that *literally declares a key named `UNSET`* mapping to an accepted model
  would resolve `[tier:UNSET]` to that model — silently treating the "unset" sentinel as a real
  tier. This is a genuine (if pathological) collision.

**Mitigation** (documented, not code-enforced): `UNSET` is an all-caps sentinel no sane operator
names a semantic tier; the FR-009 path *only* emits it when `tier_map` is **absent** (so the collision
requires the operator to both leave the map absent at authoring time *and* later add a literal
`UNSET` label); and the loud advisory printed alongside names the missing `tier_map` and the config
path, steering the operator to configure real labels rather than adopt `UNSET`. The deterministic
floor still does the right thing in every non-pathological case. We deliberately do **not** add a
reserved-word check to the config loader (that would be new validation on the *unchanged* consuming
machinery — out of scope per the spec Assumptions); the sentinel's safety rests on the advisory +
operator discipline + the fact that no real `tier_map` names a label `UNSET`.

**Rationale**: An explicit, human-legible sentinel that the *existing* floor already rejects
(`no-map`/`unknown-tier`) is exactly the no-silent-default posture (Principle V) — it surfaces the
gap at the tasks phase (advisory) and again fail-loud at execute, without inventing a label or
blocking generation.

**Alternatives considered**:
- **Emit no tag at all when `tier_map` is absent** — rejected: an untagged task is the `no-tier`
  error, indistinguishable from a generation miss; the explicit `[tier:UNSET]` + advisory tells the
  operator *why* (map not configured) vs. *the generator forgot*.
- **Reserve `UNSET` in the config loader** — rejected: edits the unchanged consuming machinery
  (out of scope) to defend a pathological collision the advisory already steers away from.

## Decision 6 — Seam injection vs. vendored edit (restated; settled in the design record)

**Decision (restated, not re-opened)**: Inject the tier requirement at the `/stack-control:define`
tasks seam (Alternative D), mirroring `skills/design/SKILL.md` step 2's `renderHouseRules` injection
bracketed by the front-door `enter`/`exit` marker — **not** by editing the vendored `/speckit-tasks`
SKILL.md/`setup-tasks.sh`. The template exemplification (FR-011) is the *secondary, non-load-bearing*
surface for direct/native use, kept honest by the drift test.

**Rationale**: Capability, not vendor (Principle III) — the seam is where stack-control's opinion
attaches without forking rehomed backend files (fork-drift risk), and a static vendored template
naturally hardcodes a `fast/balanced/powerful` vocabulary that mismatches a differently-configured
`tier_map` (US2). The design record settled this (Decisions 1–2, Alternatives A/B/C rejected); it is
recorded here only so the plan artifacts are self-contained. It is **not** an open question.

## Carried-forward (resolved by the above)

The design record's § Open questions map to decisions as: read surface → Decision 2 (new
`tier-vocab` verb); empty/absent `tier_map` → Decision 5 (`[tier:UNSET]` + advisory, exit 0); label
binding for non-default vocabularies → Decision 1 + Decision 3 (`MODEL_CAPABILITY_RANK` + the ranking
function); deferred configurable default tier → stays deferred (Principle V; spec Assumptions);
single-sourcing → Decision 4 (`renderTierRequirement` + shared constants + drift test); feature-sized
vs point-sized → the operator scoped this as a feature (this spec-driven chain).
