---
slug: 024-lifecycle-compass
targetVersion: ""
---

# Audit log — 024-lifecycle-compass

## 2026-06-16 — audit-barrage lift (20260616T071954281Z-024-lifecycle-compass-phase-1)

### AUDIT-20260616-01 — Exported `Intent` cannot represent the phase-neutral intents this feature already accepts

Finding-ID: AUDIT-20260616-01
Status:     open
Severity:   high
Per-lane:   codex-gpt5=high
Decision:   single-model (gate-counted high)
Surface:    src/workflow/workflow-types.ts:258-261

The new canonical protocol type for an intent is too narrow for the feature it is supposed to model. [`Intent` in `workflow-types.ts`](#/Users/orion/work/deskwork-work/stack-control/plugins/stack-control/src/workflow/workflow-types.ts:258) requires every intent to carry a `phase: PhaseId`, but the same feature’s resolver explicitly defines phase-neutral intents such as `session-end` and returns them with `phase: null` and `kind: 'neutral'` in [`intent-vocabulary.ts:34-39`](#/Users/orion/work/deskwork-work/stack-control/plugins/stack-control/src/workflow/intent-vocabulary.ts:34) and [`81-84`](#/Users/orion/work/deskwork-work/stack-control/plugins/stack-control/src/workflow/intent-vocabulary.ts:81).

The blast radius is larger than a cosmetic type mismatch because `workflow-types.ts` is documented as the shared typed protocol surface for the workflow engine. A downstream consumer building against this exported `Intent` shape will naturally assume every `--intent` maps to a phase, which is false for `session-end`. In unattended use that pushes consumers toward inventing a fake phase or rejecting a valid neutral intent entirely, which changes compass behavior. A reasonable fix is to make the exported intent model itself discriminated, matching the real contract already implemented by `IntentResolution`, rather than publishing a phase-only `Intent` type that contradicts the feature’s accepted inputs.

### AUDIT-20260616-02 — `Verdict.intentPhase` is documented as null only for exceptional paths, but the implementation uses null on a successful neutral verdict

Finding-ID: AUDIT-20260616-02
Status:     open
Severity:   medium
Per-lane:   codex-gpt5=medium
Decision:   single-model (gate-counted medium)
Surface:    src/workflow/workflow-types.ts:246-247

The field comment on [`Verdict.intentPhase`](#/Users/orion/work/deskwork-work/stack-control/plugins/stack-control/src/workflow/workflow-types.ts:246) says the field is null only “in orientation mode / off-rail with no intent.” That is not the behavior the implementation actually ships. In [`computeVerdict`](#/Users/orion/work/deskwork-work/stack-control/plugins/stack-control/src/workflow/compass.ts:68), a phase-neutral `session-end` on a normal in-rail item returns `on-course` with `intentPhase: null`. So `null` is not just an exceptional or no-intent case; it is part of a valid successful verdict path.

This matters because `Verdict` is a shared protocol record, and consumers will use the field comment to decide whether `null` is an error-state sentinel. If they treat `null` as “off-rail/orientation only,” they can mis-handle a legitimate `session-end` close path even though the verdict outcome is `on-course`. The consequence is narrower than the first finding because the runtime behavior is correct today, but the published contract is misleading enough to cause wrong downstream integrations. The fix is to update the field contract so it explicitly names phase-neutral intents as another null-bearing case.

## 2026-06-16 — audit-barrage lift (20260616T072406367Z-024-lifecycle-compass-phase-1)

### AUDIT-20260616-03 — `Verdict` can encode contradictory `outcome`/`exitCode` pairs

Finding-ID: AUDIT-20260616-03
Status:     open
Severity:   medium
Per-lane:   codex-gpt5=medium
Decision:   single-model (gate-counted medium)
Surface:    `src/workflow/workflow-types.ts:233-260`

The new contract says `exitCode` mirrors `VERDICT_EXIT[outcome]` and that callers can gate on the code without parsing prose, but the type surface does not actually enforce that invariant. `VERDICT_EXIT` is defined as the source of truth at lines 233-238, yet `Verdict.exitCode` is widened to plain `number` at line 260. A consumer can therefore construct `{ outcome: 'ahead', exitCode: 0 }` and still satisfy the exported interface, even though that state contradicts the documented protocol.

The blast radius is moderate because this file is the shared primitive for downstream skill and CLI code, and the feature explicitly relies on unattended consumers reading this contract correctly. If one caller trusts `outcome` while another trusts `exitCode`, the same verdict object can be interpreted both as "proceed" and "refuse." A reasonable fix is to make the type carry the invariant instead of leaving it in comments: either model `Verdict` as a discriminated union keyed by `outcome`, or at minimum derive `exitCode` from `outcome` with a correlated type rather than `number`.

## 2026-06-16 — audit-barrage lift (20260616T073529335Z-024-lifecycle-compass-after_implement)

### AUDIT-20260616-04 — `extractScopedPaths` over-strips any colon-bearing span, silently dropping `file:line` governed paths

Finding-ID: AUDIT-20260616-04
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    src/govern/incremental-audit.ts:61-77 (the `token.includes(':')` guard)

The FR-012 fix changes the path filter to `if (token === undefined || !token.includes('/') || token.includes(':')) continue;`. This correctly drops `/stack-control:define` skill references, but it is far blunter than the contract specified. `research.md` R6 and `govern-resolution.md` call for excluding "a `/<plugin>:<verb>` `:`-bearing token / a token that is not a plausible installation-relative path" — i.e. classify the *namespace* shape, not "any colon." The blunt `includes(':')` also discards legitimate `file:line` path spans such as `` `src/govern/protocol.ts:141` `` — a form that appears verbatim in this very feature's own contract docs (`govern-resolution.md` writes `src/govern/protocol.ts:141`, `incremental-audit.ts:61`, `checkpoint-state.ts`). If govern ever assembles a payload over a tasks/spec body that scopes a path with a trailing line number, that path is now silently absent from the governed-path set.

Blast radius: this is the *opposite* failure from the crash being fixed — instead of crashing loudly (the old behavior), govern now under-scopes silently. A real governed file dropped from the scope set means the cross-model barrage never audits it, and nothing surfaces the omission. The fix traded a loud crash for a quiet gap. The test suite (`govern-resolution.test.ts`) only exercises `/<plugin>:<verb>` tokens and bare paths — no `file.ts:42` case — so the regression is untested. A more precise fix strips a trailing `:<digits>` suffix and excludes only `/<plugin>:<verb>` namespace tokens, then re-validates the remainder as an install-relative path.

---

### AUDIT-20260616-05 — `emitAdvance` identifies the enforced back-half gate by array position, not by the semantic `governing → shipped` transition

Finding-ID: AUDIT-20260616-05 (claude-02 + codex-01; cross-model)
Status:     open
Severity:   medium
Per-lane:   claude=medium, codex=high
Decision:   agreement (gate-counted medium)
Surface:    src/subcommands/workflow.ts:234-249 (the new terminal-gate refusal block in `emitAdvance`)

The US5 enforcement decides which transition gets real teeth with `const terminalPhaseId = r.doc.phases[r.doc.phases.length - 1]!.id; if (t.to === terminalPhaseId && t.exitGate.length > 0) { ... refuse ... }`. This couples "the back-half `governing → shipped` gate" to a positional assumption: that the last element of `doc.phases` is always `shipped`. The feature's entire premise — per the design record and `data-model.md` — is the *specific* `governing → shipped` transition being a refusal while mid-pipeline stays advisory. Encoding that as "whatever transition targets the last phase in the array" is fragile in two ways: (a) if side-states (`blocked`/`cancelled`/`retired`) are ever included in `doc.phases`, `[length-1]` is no longer `shipped` and the wrong (or no) transition is enforced; (b) an adopter's governed `WORKFLOW.md` with a differently-ordered or differently-named terminal phase silently changes which gate has teeth — `enforcement-lives-in-skills.md` makes WORKFLOW.md adopter-customizable, so this is a real configuration surface, not a hypothetical.

Blast radius: the feature ships to bind adopting agents. If an adopter reorders phases or names their terminal phase something other than the array tail, the back-half gate either enforces the wrong transition or goes silently advisory — defeating the one gate this phase exists to add teeth to, with no error. The default bundled WORKFLOW.md works, so this is not blocking, but the enforcement should resolve the transition by its semantic identity (the `governing → shipped` codename, or a phase flagged terminal-in-linear-pipeline), not by `phases.length - 1`.

---

### AUDIT-20260616-06 — Contract docs name the CLAUDE.md SPECKIT marker as the fallback source; the implementation reads `.specify/feature.json` instead

Finding-ID: AUDIT-20260616-06
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    src/govern/feature-resolution.ts:32-51 (`readActiveFeatureSlug`) vs contracts/govern-resolution.md FR-011 + research.md R5

`govern-resolution.md` FR-011 states the fallback explicitly: "Fall back to the **CLAUDE.md SPECKIT marker** (`specs/<NNN>-<slug>/plan.md`) when no item is supplied but a marker is present," and `research.md` R5 repeats "falling back to the CLAUDE.md SPECKIT marker." The shipped resolver does something different: `readActiveFeatureSlug` reads `.specify/feature.json`'s `feature_directory` key and returns its basename. The function's own comment defends this as the better choice ("Reading the tool's pointer rather than inventing a parallel 'active feature' notion keeps faith with Principle VIII") — which is a reasonable engineering call — but the four design artifacts that an agent or operator reads to understand the resolution order all describe a *different* marker source than the code uses.

Blast radius: this is documentation/implementation drift in a spec set explicitly authored to be built-from unattended. An agent debugging "why didn't govern find my feature on the session-pinned branch" follows the contract, inspects/creates a CLAUDE.md SPECKIT marker, and finds it has no effect because the code only consults `.specify/feature.json`. The two markers can also disagree, producing a resolution the docs can't explain. Either update the contract+research to name `.specify/feature.json` as the marker source, or make the resolver actually consult the CLAUDE.md marker the docs promise. Pick one; the artifacts must agree.

---

### AUDIT-20260616-07 — Convergence-record key is derived two different ways on the write and read paths; they only agree when spec-dir resolution succeeds

Finding-ID: AUDIT-20260616-07 (claude-04 + codex-02; cross-model)
Status:     open
Severity:   medium
Per-lane:   claude=medium, codex=high
Decision:   agreement (gate-counted medium)
Surface:    src/govern/feature-resolution.ts:96-116 (`resolveConvergenceItem`) vs src/workflow/workflow-context.ts:38-42 (`convergenceKeyFor(item)`)

FR-013's stated goal is that govern's write side and the workflow read side key the convergence record by the *same* canonical node id. The read side does this unconditionally: `convergenceKey = convergenceKeyFor(item)` which returns `item.identifier`. The write side, however, is conditional: `resolveConvergenceItem` calls `resolveIdentityFromSpecDir(model, featureRoot)` and returns `id.nodeId` only if a node matches the governed spec dir — otherwise it falls back to `relative(repoRoot, featureRoot)` (the spec-dir path), explicitly *not* the node id. So the "one canonical identity" holds only when `resolveIdentityFromSpecDir` matches; the two paths derive the key through different machinery (write: model-lookup-by-spec-dir-path-equality; read: `item.identifier` directly).

Blast radius: when `resolveIdentityFromSpecDir` fails to match a node that nonetheless exists (e.g. the node's `spec:` pointer and govern's resolved `featureRoot` differ by a trailing slash, a symlinked path, or a normalization the `relSpec` comparison misses), govern writes the record under the spec-dir-relative key while the read side looks it up under the node id. They diverge, the gate reads "not converged," and a genuinely-governed feature cannot graduate. This is fail-*safe* (the gate stays closed, never a false graduation — the comment notes this), so it is not blocking, but it reintroduces exactly the write/read key-disagreement class FR-013 set out to eliminate, just in a narrower window. Unifying both sides to resolve the key from the roadmap node (the read side already has the node; the write side should resolve and require it, failing loud rather than falling back to a second key shape) would close the asymmetry.

---

### AUDIT-20260616-08 — Compass orientation reports `p.exit`, but advance enforcement evaluates `t.exitGate` — verify they reference the same criteria

Finding-ID: AUDIT-20260616-08
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    src/subcommands/workflow.ts:174 (orientation: `evaluateGate(p.exit, gate)`) vs src/subcommands/workflow.ts:243 (advance: `evaluateGate(t.exitGate, gate)`)

The compass orientation mode reports the gate via the *phase's* exit gate: `if (gate !== null) reportGate('exit gate', evaluateGate(p.exit, gate));`. The new advance refusal evaluates the *transition's* exit gate: `const result = evaluateGate(t.exitGate, gate);`. These are two different fields on two different entities (`Phase.exit` vs `Transition.exitGate`). If, for the `governing → shipped` boundary, the phase's exit criteria and the transition's exitGate criteria are not identical, then `workflow compass <item>` shows the operator one set of unmet criteria while `workflow advance` refuses on a different set — the orientation surface and the enforcement surface disagree about what's blocking graduation.

Blast radius: the compass is sold as "the single orientation-and-enforcement primitive" whose orientation tells an agent the exit-gate state and whose enforcement holds it. If orientation and enforcement read different gate definitions, an agent satisfies the criteria the compass *reported*, then hits a refusal at advance citing criteria it was never shown — the un-skippable-workflow contract leaks. If `Phase.exit` and the corresponding `Transition.exitGate` are guaranteed identical by the 022 grammar (one derived from the other), this is a non-issue and the two call sites should ideally read the same field for clarity. If they can diverge, this is a real inconsistency between the two halves of the same primitive. The fix is to source both surfaces from one gate definition.

### AUDIT-20260616-09 — session-end promises compass warnings but the CLI never records them

Finding-ID: AUDIT-20260616-09
Status:     open
Severity:   medium
Per-lane:   codex=medium
Decision:   single-model (gate-counted medium)
Surface:    skills/session-end/SKILL.md:24-32; src/subcommands/session-end.ts:159-243

The skill says session-end consults the compass and records off-rail items as warnings in the session record, but `runSessionEndCli` has no item input, no compass call, no warning field for compass results, and no journal/report write path for off-rail lifecycle state. The only warnings rendered are uncommitted non-doc changes.

Blast radius is medium because session-end is deliberately advisory, not a hard gate, but the advertised backstop for raw/off-rail work does not exist in the executable close path. An agent relying on the documented behavior will close a session without preserving the off-rail warning for the next session. A reasonable fix is to either add a concrete item/orientation input and persist the warning, or narrow the SKILL.md claim to manual operator-facing orientation that is not recorded by `stackctl session-end`.

## 2026-06-16 — audit-barrage lift (20260616T080239759Z-024-lifecycle-compass-after_implement)

### AUDIT-20260616-10 — FR-008 "capture fused to authoring" is specified as atomic node *creation* but implemented as *refusal-requiring-a-pre-existing-node* — quickstart Scenario 3 contradicts the shipped behavior

Finding-ID: AUDIT-20260616-10 (claude-01 + claude-02 + codex-01 + codex-02; cross-model)
Status:     open
Severity:   high
Per-lane:   claude=high, codex=high
Decision:   agreement (gate-counted high)
Surface:    specs/024-lifecycle-compass/quickstart.md (Scenario 3) + data-model.md (§ "State transitions touched" entry gate) + tasks.md T031 + skills/define/SKILL.md + src/__tests__/capture-fusion.test.ts

The spec artifacts describe FR-008 as **atomic node creation inside authoring**. quickstart.md Scenario 3 states literally: `/stack-control:define <new-feature>` → "a roadmap node exists in the same move", then `stackctl roadmap show <new-node>  # expect: node exists`. data-model.md says "capture-fusion makes the node→spec creation atomic (US3)". tasks.md T031: "the `define` / `speckit-specify` path **creates** the roadmap node ... atomically with the spec dir."

The shipped behavior is the opposite mechanism. The `define` SKILL.md precondition refuses when no node exists ("If no item resolves (a spec dir with no roadmap node is off-rail), refuse loud and **direct the operator to capture/design it first**"), and `capture-fusion.test.ts` codifies exactly this: `authoring (define) is refused for an item with no roadmap node (off-rail)` and `authoring proceeds only once the node exists`. There is **no node-creation logic anywhere in the diff** — the `define` SKILL.md change adds only the compass precondition. So "capture fused to authoring" is realized as *"authoring requires prior capture"*, not *"authoring performs capture."* data-model.md even contradicts itself inside one bullet: "capture-fusion makes the node→spec creation atomic" vs. "Enforced as a refusal now."

Blast radius: an unattended agent running quickstart Scenario 3 to *validate* the feature would observe `/stack-control:define` on a brand-new feature **refuse** (off-rail) instead of creating a node — a false "feature broken" signal. Worse, an agent re-implementing FR-008/T031 from the spec text would build node-creation-inside-define, directly contradicting the shipped refusal model and the test suite. T031 is marked `[X]` done and "no orphan-producing path remains", but the atomic-creation half it claims is neither present in the diff nor covered by a test (the `authoring proceeds` test asserts the *precondition*, not creation). Fix: reconcile quickstart Scenario 3, data-model.md, and T031 to the refusal model ("authoring requires a captured+designed node; orphan is a hard error"), or implement and test the atomic creation the spec promises — pick one and make all five artifacts agree.

### AUDIT-20260616-11 — The compass verdict's `ahead`/`behind` classification depends on `doc.phases` array position — the same array-position root cause as T039, but in the verdict path T039 does not cover

Finding-ID: AUDIT-20260616-11
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    src/workflow/compass.ts:13-16 (`ordinal`) + :70-86 (the ordinal comparisons) vs. tasks.md T039

`compass.ts` classifies intent via `ordinal(doc, id)` = `doc.phases.findIndex(p => p.id === id)` and compares `intentOrd`, `currentOrd`, `nextOrd` to decide `on-course` / `behind` / `ahead`. This is correct only when `doc.phases` is in strict linear-pipeline order **and** terminal side-states (`blocked`/`cancelled`/`retired`) do not sit among the pipeline phases — otherwise `intentOrd <= currentOrd` (behind) and `intentOrd === nextOrd` (on-course) misclassify. T039 already scoped the parallel defect in `emitAdvance` (`r.doc.phases[length-1]` as the terminal phase), explicitly noting an adopter WORKFLOW.md "whose terminal phase is not the array tail, or with a side-state in `phases`." But T039's file scope is `src/subcommands/workflow.ts` (the US5 refusal block) only — the identical array-position assumption in `compass.ts`'s verdict computation is unscoped.

`legitimateNextPhase` correctly reads the robust `phase.next` field, but the result is immediately converted back to an array index (`nextOrd = ordinal(doc, nextId)`) for the equality check, re-introducing the array-position dependency the `.next` field was meant to avoid. So under adopter customization the compass could return `behind` (exit 0, "proceed") for an action that is actually `ahead`, defeating the un-skippable guarantee for the customized case.

Blast radius: the bundled WORKFLOW.md orders phases linearly with side-states excluded from the pipeline ordinal space, so today this is correct — hence medium, not high. The risk is adopter customization, exactly the "harden the adopter-customized case" framing T039/T040 already adopt. Fix: either derive ordinals from a validated linear pipeline projection (excluding side-states) shared by compass + emitAdvance, or assert at load time that `phase.next` chains define the ordering and that side-states are not in the pipeline ordinal space — and fold this into T039's scope so one fix covers both the verdict and the gate.

### AUDIT-20260616-12 — Contracts and plan reference a `ship` finishing skill that no SKILL.md in the diff provides; the embedding actually went to `design`

Finding-ID: AUDIT-20260616-12
Status:     open
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    specs/024-lifecycle-compass/contracts/skill-precondition.md + plan.md (Project Structure, `skills/ship/SKILL.md`) vs. the SKILL.md files actually changed (define/design/execute/release/session-end) + README.md

`skill-precondition.md` repeatedly names `ship` as a finishing skill that embeds the compass ("the *finishing* skills (`ship`/`release`/`session-end`)"), and plan.md's Project Structure lists `skills/ship/SKILL.md  # FR-006`. But the diff modifies SKILL.md only for `define`, `design`, `execute`, `release`, `session-end` — there is no `ship/SKILL.md` change, and README.md states the advancing set as "`define`, `design`, `execute`, `release`" (with `design` getting the embedding, which the contracts never mention as a precondition skill). The `ship`/`release` intent aliases both map to `shipped` in `intent-vocabulary.ts`, so functionally `release` covers the back-half, but the artifact set is inconsistent about whether `ship` exists as a skill and whether `design` is in the gated set.

Blast radius: purely documentation hygiene — no runtime behavior is wrong (the alias map is complete and `release` is wired). A reader cross-referencing the contracts to find/verify a `ship` skill finds none, and finds a `design` precondition the contracts never list. Low. Fix: align the skill-name set across plan.md, skill-precondition.md, and README.md — either add `design` and drop `ship` from the contract prose, or note `ship` is an alias of `release` with no standalone skill.

---

**Summary for triage:** the strongest signal is **claude-01** (HIGH) — the FR-008 "atomic capture-fusion" the spec/quickstart/data-model promise was not built; a refusal mechanism was shipped instead, and quickstart Scenario 3 will not behave as written. claude-02 and claude-04 are doc-vs-impl drift in the contract artifacts (session-end's refusal posture; the `ship` skill phantom). claude-03 extends the already-scoped T039 array-position root cause into the compass verdict path, which T039's file scope misses. I checked the verdict matrix logic (the `skippedStep ⇔ ahead` invariant holds), the exit-code distinctness (3/4/2), the `extractScopedPaths` file:line handling (claude-01-prior fix is sound), and the convergence-key read/write agreement (`convergenceKeyFor` vs `resolveConvergenceItem` both resolve to nodeId) — those came back clean.

### AUDIT-20260616-13 — Malformed active feature marker is silently ignored

Finding-ID: AUDIT-20260616-13
Status:     open
Severity:   medium
Per-lane:   codex=medium
Decision:   single-model (gate-counted medium)
Surface:    src/govern/feature-resolution.ts:43-54

`readActiveFeatureSlug` returns `null` both when `.specify/feature.json` is absent and when it exists but cannot be parsed. That collapses “no active Spec Kit pointer” and “corrupt active pointer” into the same state, allowing `resolveFeatureSlug` to continue to a branch-derived candidate or emit a generic no-feature error.

For governance, a present-but-invalid marker is not a clean absence; it means the authoritative active-feature pointer cannot be trusted. The blast radius is that a malformed marker can be hidden by an incidental branch slug, causing govern to run against the wrong feature. A reasonable fix is to fail loud when the marker file exists but is unreadable or lacks a valid `feature_directory`, while still returning `null` when the file is genuinely absent.

## 2026-06-16 — audit-barrage lift (20260616T084614001Z-024-lifecycle-compass-after_implement)

### AUDIT-20260616-14 — Eager marker read crashes every govern path on a malformed `.specify/feature.json`, defeating the explicit `--feature`/`--item` escape hatch

Finding-ID: AUDIT-20260616-14 (claude-01 + codex-02; cross-model)
Status:     open
Severity:   medium
Per-lane:   claude=medium, codex=high
Decision:   agreement (gate-counted medium)
Surface:    src/subcommands/govern.ts (`const markerSlug = readActiveFeatureSlug(repoRoot);` in `runGovern`) + src/govern/feature-resolution.ts:60-86 (`readActiveFeatureSlug`)

`readActiveFeatureSlug` now *throws* (codex-03 fix) when `.specify/feature.json` is present but unparseable or missing `feature_directory`. But in `govern.ts` it is called **unconditionally** on every govern run — after `explicitSlug` is already resolved from `--item`/`--feature`/`GOVERN_FEATURE_SLUG`, and regardless of whether the marker is needed. Because `resolveFeatureSlug` short-circuits and returns `explicit` immediately when an explicit slug is present, the marker value is *discarded* in that case — yet the eager read can still FATAL the entire run first.

Blast radius: a transiently- or manually-malformed marker (partial write, hand edit) makes **all** govern invocations crash, including the `--feature`/`--item` paths whose entire purpose is to override resolution. The operator's explicit escape hatch can't escape a broken marker. The fail-loud intent is right; the placement is wrong. Fix: only read/validate the marker when no explicit slug resolved (i.e. when the marker is actually a resolution candidate), or catch-and-defer so a malformed marker only fails the run when the marker is the chosen source.

### AUDIT-20260616-15 — TASK-139 collision tests don't reproduce an actual basename collision — false confidence in the FR-013 re-key

Finding-ID: AUDIT-20260616-15
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    src/__tests__/workflow/canonical-identity.test.ts (`collisionRoadmap`, `convergenceKeyFor` test, the SC-005 test) + contracts/canonical-identity.md

The collision fixtures use `specs/010-compass` and `specs/020-compass` with the inline comment *"Both spec dirs basename to 'compass'; the canonical key must still differ."* That comment is false: `basename('specs/010-compass')` is `010-compass` and `basename('specs/020-compass')` is `020-compass` — **distinct** basenames. The old `basename(item.spec)` keying would already have produced distinct keys for these two items, so they never collided. The SC-005 test's `expect(...b...implRecordConverged).toBe(false)` passes trivially because B simply has no record under any key, old or new.

The contract itself warned about exactly this (`canonical-identity.md`: *"specs/010-foo/ and specs/020-foo/ (shared basename foo if keyed naively differently — construct the collision per TASK-139's actual shape)"*), and the test did not construct the real shape. Net: the tests are RED-before/GREEN-after only because the key *moved* from basename to nodeId, not because a basename **collision** is disambiguated. A regression that reintroduced basename keying would still pass these tests for any normally-numbered spec dirs. The fix should use two items whose spec-dir basenames are genuinely identical (e.g. nested trees both ending `…/compass`) so the collision is actually exercised.

### AUDIT-20260616-16 — `govern` collapses a compass refusal to exit 2 (usage), discarding the ahead/off-rail distinction the compass contract preserves

Finding-ID: AUDIT-20260616-16 (claude-03 + codex-01; cross-model)
Status:     open
Severity:   high
Per-lane:   claude=low, codex=high
Decision:   adjudicated (gate-counted high) — blast-radius=unstated, reachability=unstated, fix-debt=no; no down-calibration signal — high retained.
Surface:    src/subcommands/govern.ts (the `if (flags.item !== undefined)` compass-precondition block → `process.exit(2)`)

The compass CLI contract (compass-cli.md, workflow-types `VERDICT_EXIT`) deliberately splits refusal codes: `ahead` → 3, `off-rail` → 4, usage/unknown-intent → 2, precisely so an embedding caller "can name the precise violated invariant without parsing prose" (FR-003). The new `govern --item` precondition refuses with `process.exit(2)` for *any* non-zero compass verdict, folding `ahead` and `off-rail` into the usage code.

Blast radius is small today (govern's refusal message text carries the outcome, and no current caller branches on govern's numeric code), but it quietly breaks the exit-code contract this feature spent effort establishing: a future `execute`/hook wrapper that gates on govern's exit code can't distinguish "refused: a step was skipped" from "refused: off-rail" from "bad usage." Propagate `pre.verdict.exitCode` instead of hardcoding `2`.

### AUDIT-20260616-17 — FR-009 orphan backstop is narrower than documented: the automated `after_implement` (no-`--item`) govern path only detects an orphan post-barrage at convergence-write

Finding-ID: AUDIT-20260616-17
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    src/govern/feature-resolution.ts (`resolveConvergenceItem`) + src/subcommands/govern.ts (compass precondition gated on `flags.item !== undefined`) + README.md FR-009 / data-model.md "Orphan Spec Dir"

The data-model and `define`/README copy state the FR-009 backstop as *"every spec-resolving verb raises a hard error"* and *"the compass reports it off-rail."* In the implementation the compass precondition in `govern` fires **only when `--item` is supplied**. The primary automated path — the `after_implement` hook — supplies no `--item` (acknowledged in the T039 note: *"the hook does not yet supply it"*), so for that path govern resolves the feature by branch/marker, runs the **full cross-model barrage**, and only fails when `resolveConvergenceItem` throws at convergence-write because no node references the dir.

Two problems: (1) for an orphan spec dir the hard error arrives *after* an expensive barrage rather than as a precondition — wasted cycles, late failure; (2) the compass itself resolves by **node id**, not by scanning `specs/` for dirs lacking a node, so there is no verb that proactively flags an orphan dir like `specs/099-orphan` — it's only caught if something happens to query that exact id or govern reaches convergence-write. The documented "every spec-resolving verb refuses … caught if they appear another way" overclaims relative to what's wired. Either narrow the docs to the paths actually enforced, or move the orphan/off-rail check ahead of payload assembly on the hook path.

### AUDIT-20260616-18 — `roadmapInstallRoot` assumes `ROADMAP.md` sits at the installation root and slices the path with a hardcoded `/`

Finding-ID: AUDIT-20260616-18
Status:     open
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    src/workflow/identity.ts:75-82 (`roadmapInstallRoot`) and its use in `resolveIdentityFromSpecDir`

`roadmapInstallRoot` derives the installation root as `docPath.slice(0, docPath.lastIndexOf('/'))` — i.e. `dirname(ROADMAP.md)`. This is then used as the base for `relSpec(...)` to compare an incoming (possibly absolute) governed feature dir against each node's installation-relative `spec:` pointer. If the roadmap is ever configured at a nested path (not directly at the install root), the base is wrong and the absolute-vs-relative spec-dir comparison can mismatch (`relative()` emits `../…`), causing `resolveIdentityFromSpecDir` to return `null` for a feature that actually has a node — which then trips the `resolveConvergenceItem` "orphan/legacy" FATAL and leaves the graduate gate closed.

Today the setup skill writes `ROADMAP.md` at the install root so the assumption holds, but the function hardcodes that coupling rather than threading the real installation root (which the callers already have via `installation.root`), and it string-slices on `/` instead of using `node:path`. Low severity because the current layout satisfies the assumption, but it's a latent coupling that a config change would silently break; prefer passing the resolved installation root through rather than re-deriving it from the doc path.

## 2026-06-16 — audit-barrage lift (20260616T091355265Z-024-lifecycle-compass-after_implement)

### AUDIT-20260616-19 — govern.ts convergence comment describes a spec-dir fallback that the code it calls does NOT implement (fail-loud instead)

Finding-ID: AUDIT-20260616-19 (claude-01 + claude-02 + codex-03; cross-model)
Status:     open
Severity:   medium
Per-lane:   claude=medium, codex=high
Decision:   agreement (gate-counted medium)
Surface:    src/subcommands/govern.ts (@@ -914 hunk, the `recordGovernConvergence` block) vs src/govern/feature-resolution.ts:`resolveConvergenceItem`

The inline comment introduced at the convergence-write site in `govern.ts` states: *"When no node resolves (orphan/legacy), fall back to the installation-relative spec dir (still collision-free), never the bare basename."* But the function it immediately calls, `resolveConvergenceItem`, does the opposite — when `resolveIdentityFromSpecDir` returns null it **throws** a `GovernProtocolError` (and its own doc-comment says *"FAIL LOUD, never key by a divergent fallback shape … Both raise"*). There is no spec-dir fallback anywhere in the resolution path.

The two comments in the same diff directly contradict each other, and the surviving govern.ts comment describes behavior that was deliberately removed. The runtime is still safe (the throw is swallowed by the surrounding `try` and the comment's *"write failure leaves the gate CLOSED"* clause is honored), so there is no functional defect. The blast radius is maintainer-confusion: someone debugging *"why didn't my orphan feature graduate?"* will read the govern.ts comment, conclude a spec-dir-keyed convergence record was written (and thus the gate could open), and look in the wrong place — the actual behavior is the inverse (nothing written, gate stays closed). A reasonable fix is to rewrite the govern.ts comment to match the fail-loud contract: *"when no node resolves the convergence write fails loud and the gate stays closed (fail-safe); there is no spec-dir fallback key."*

### AUDIT-20260616-20 — session-end (phase-neutral intent) returns `off-rail` on a terminal side-state node, contradicting the README/SKILL claim "off-rail only when no node exists"

Finding-ID: AUDIT-20260616-20
Status:     open
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    src/workflow/compass.ts:`computeVerdict` (side-state short-circuit precedes the neutral branch) vs README.md "Lifecycle compass" section + skills/session-end/SKILL.md

`computeVerdict` checks `currentPhase.kind === 'side-state'` and returns `off-rail` **before** the `intent.kind === 'neutral'` branch. So for a `blocked`/`cancelled`/`retired` item, `session-end --intent session-end` yields `off-rail`. But the session-end SKILL.md states *"the verdict is `on-course` on any real node and `off-rail` only when no node exists,"* and the README echoes the phase-neutral framing. A blocked item **is** a real node, yet the verdict is `off-rail` — the documented invariant is false for side-states.

Blast radius is low because session-end's compass consultation is explicitly advisory/manual (it never refuses to close), and an `off-rail` reading for a blocked item is arguably *more* informative than misleading. But it is a falsifiable doc-vs-code contradiction an agent could act on (e.g. deciding the orientation aid is "broken" when it reports off-rail for a node it expected on-course). The cheapest fix is to tighten the doc wording to *"on-course on any pipeline node; off-rail with no node or a terminal side-state"* (matching the data-model's narrower "any pipeline node" phrasing), or move the neutral branch above the side-state check if neutral intents are meant to orient even on side-states.

### AUDIT-20260616-21 — `resolveFeatureFromItem` collapses the canonical node id back to `basename(specPointer)` for govern's feature-root lookup, partially re-opening the FR-013 basename seam

Finding-ID: AUDIT-20260616-21
Status:     open
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    src/govern/feature-resolution.ts:`resolveFeatureFromItem` (returns `basename(id.specPointer)`)

FR-013's stated purpose is *one canonical identity* (the node id) so the basename-collision class is eliminated. `resolveFeatureFromItem` resolves the canonical identity correctly, then **discards** the node id and returns `basename(id.specPointer)` as the govern slug, which is fed to `resolveFeatureRoot` to locate the spec dir. The convergence **record key** is safe (it goes through `resolveConvergenceItem` → node id), but the feature-root *lookup* still keys on the basename. For the exact TASK-139 collision shape the diff's own test constructs (`specs/lane-a/compass`, `specs/lane-b/compass`, both basename `compass`), two distinct items would yield the same govern slug, so `resolveFeatureRoot` could resolve to the wrong feature's files even though the convergence record is correctly distinct.

Blast radius is low in practice: the standard `specs/NNN-<slug>` layout makes basenames unique via the numeric prefix, so the collision requires the exotic same-basename-different-parent layout the test invents. But it is a latent inconsistency — the seam FR-013 set out to close is left half-open at the govern feature-root-resolution layer. A cleaner approach would thread the resolved `specDir` (or node id) through to feature-root resolution rather than round-tripping through a basename slug, so the same canonical identity governs both the record key and the file lookup.

### AUDIT-20260616-22 — Compass approves release when the graduation gate is unmet

Finding-ID: AUDIT-20260616-22
Status:     open
Severity:   high
Per-lane:   codex=high
Decision:   adjudicated (gate-counted high) — blast-radius=unstated, reachability=unstated, fix-debt=no; no down-calibration signal — high retained.
Surface:    src/workflow/compass.ts:74-89; src/workflow/intent-vocabulary.ts:24-29; README.md:178

`release` / `ship` resolve to the `shipped` phase, and `computeVerdict` only compares phase ordinals. From `governing`, `intentOrd === nextOrd`, so the compass returns `on-course` without evaluating the `governing → shipped` exit gate. That contradicts the README’s contract that `release` hard-refuses until the back-half gate is satisfied.

Blast radius is high because every lifecycle skill is supposed to trust the compass exit code. A release skill using this precondition can proceed even when `record-converged impl` is missing. The fix is to make transition/graduation intents evaluate the relevant transition exit gate and return a refusal verdict when unmet.

### AUDIT-20260616-23 — Back-half gate enforcement depends on the last array entry, not the shipped transition

Finding-ID: AUDIT-20260616-23
Status:     open
Severity:   medium
Per-lane:   codex=medium
Decision:   single-model (gate-counted medium)
Surface:    src/subcommands/workflow.ts:234-249; src/workflow/compass.ts:12-20

`emitAdvance` treats the enforced terminal transition as `t.to === r.doc.phases[r.doc.phases.length - 1]!.id`. That makes enforcement depend on phase array position rather than the semantic `governing → shipped` transition. `compass.ts` has the same array-position assumption via `findIndex`.

Blast radius is medium: the bundled workflow may work, but adopter-customized `WORKFLOW.md` can reorder terminal states or include side-states in `phases`, causing the wrong transition to be enforced or intent ordering to be misclassified. A shared linear-pipeline resolver based on `phase.next` / the graduate transition should feed both compass and advance enforcement.

## 2026-06-16 — audit-barrage lift (20260616T092634951Z-024-lifecycle-compass-after_implement)

### AUDIT-20260616-24 — govern `--item` compass precondition hardcodes `intent: 'govern'`, mis-gating `--mode spec`

Finding-ID: AUDIT-20260616-24
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    src/subcommands/govern.ts (the `if (flags.item !== undefined)` precondition block)

The new `--item` compass precondition runs before the mode branch and always declares `intent: 'govern'`. Since `govern` accepts `--mode spec` (which fires at the `specifying → implementing` gate on an item still at `specifying`), and the `govern` intent resolves to the `governing` phase, a spec-mode govern via `--item` on a pre-governing item produces an `ahead` verdict (exit 3) and is hard-refused with a misleading "the `implementing` step is skipped" message — even though spec-govern is exactly the step meant to run at `specifying`. Bounded today because spec audit-barrage is operator-parked/opt-in, hence medium not high; but it's a real logic defect — the intent must derive from `flags.mode`, not be hardcoded.

### AUDIT-20260616-25 — Orientation-mode compass on an orphan exits 0, contradicting quickstart Scenario 3's "hard error"

Finding-ID: AUDIT-20260616-25
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    src/subcommands/workflow.ts:152-159 + specs/024-lifecycle-compass/quickstart.md Scenario 3

`emitCompass` returns right after orientation with no exit-code override, so a node-less item prints `off-rail: no roadmap node ...` to stdout but exits 0 (matching the `compass-cli.md` Mode-1 contract). But `quickstart.md` Scenario 3 advertises the bare `stackctl workflow compass 099-orphan` (no `--intent`) as the orphan "hard error" check. An agent automating that command and gating on exit code — the whole FR-003 premise — proceeds on an orphan. `capture-fusion.test.ts` only exercises the `--intent define` form, so the suite doesn't catch the path the quickstart shows. Reconcile code↔quickstart (either exit non-zero on `!hasNode`, or fix the quickstart to use `--intent`).

### AUDIT-20260616-26 — Off-rail orphan verdict reports a fabricated `current phase: captured`

Finding-ID: AUDIT-20260616-26
Status:     open
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    src/workflow/compass-resolve.ts (no-node branch) + workflow.ts:197 + compass.ts:56-58

`resolveCompass` returns `currentPhase: { id: doc.phases[0].id }` (`captured`) for a node-less item, which flows into the off-rail `Verdict.currentPhase`; the CLI then prints `current phase: captured` for an item that has no node. The reason line corrects it and `--json` consumers read `outcome`, so it's cosmetic — but a consumer keying off `verdict.currentPhase` without checking `outcome` would mis-attribute the orphan to `captured`.

### AUDIT-20260616-27 — data-model § Intent documents a `{ name, phase }` shape the implementation deliberately does not publish

Finding-ID: AUDIT-20260616-27
Status:     open
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    specs/024-lifecycle-compass/data-model.md (§ Intent) vs workflow-types.ts + intent-vocabulary.ts

`data-model.md` § Intent describes `Intent { name; phase }`. The code publishes `IntentResolution { kind; phase: PhaseId | null }`, and `workflow-types.ts` explicitly comments that the phase-only `Intent` is "intentionally NOT published" (it would contradict the phase-neutral `session-end` input). The data-model table wasn't updated to match — doc-only drift, but an agent generating from the data-model would look for an entity that doesn't exist.

### AUDIT-20260616-28 — intent-vocabulary fail-loud "known set" includes `backlog`/`roadmap`, which the contract's example omits

Finding-ID: AUDIT-20260616-28
Status:     open
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    src/workflow/intent-vocabulary.ts:48-66 + contracts/intent-vocabulary.md (fail-loud example)

`buildIntentVocabulary` inverts every work-bearing phase, so `backlog` (captured) and `roadmap` (planned) are valid intents (the test asserts this). The contract's fail-loud example lists a known-set that omits them. The runtime message is correct and self-consistent; the hand-written contract example is stale. Harmless, but the contract example should include them or be marked illustrative.

I've written these to the plan file as the audit deliverable. This is an audit report, not an implementation plan — there's nothing to execute.

The audit is complete. I've delivered five findings (2 medium, 3 low) plus excluded the three already-triaged correctness shapes (T039/T040/T041). Per the ExitPlanMode tool's own guidance, this is an audit/research deliverable rather than a code-implementation plan, so there's no plan to execute or approve — the findings above (and persisted to the plan file) are the output.

Summary for triage:
- **claude-01 (medium)** — real logic defect: govern's `--item` precondition hardcodes `intent: 'govern'`, so spec-mode govern is wrongly refused on pre-governing items. Worth a fix even though spec-govern is parked.
- **claude-02 (medium)** — code/quickstart inconsistency: bare-orientation orphan check exits 0 while the quickstart presents it as a hard error; an agent gating on that command's exit code would proceed on an orphan.
- **claude-03/04/05 (low)** — fabricated `current phase` on orphan verdicts; data-model § Intent drift vs the published `IntentResolution`; contract's known-intent example omits `backlog`/`roadmap`.

### AUDIT-20260616-29 — Release compass goes green without checking the release gate

Finding-ID: AUDIT-20260616-29
Status:     open
Severity:   high
Per-lane:   codex=high
Decision:   single-model (gate-counted high)
Surface:    src/workflow/compass.ts:74-89; src/__tests__/workflow/compass.test.ts:61-63; skills/release/SKILL.md:14-20

`release`/`ship` map to `shipped`, and `computeVerdict` only compares phase ordinals. From `governing`, it returns `on-course` whenever the intent phase equals the next phase, without evaluating the `governing → shipped` exit gate. The test locks this in: `ship from governing reaches shipped` expects `on-course` with no convergence record fixture.

Blast radius is high because `skills/release/SKILL.md` tells agents to proceed on compass exit 0. A downstream agent following the skill can enter release work before `record-converged impl` exists, contradicting the feature’s “un-skippable” enforcement goal. A reasonable correction is to include transition gate context in the verdict path and make graduation intents return a refusal verdict when the transition exit gate is unmet.

### AUDIT-20260616-30 — Back-half advance enforcement depends on array position instead of workflow semantics

Finding-ID: AUDIT-20260616-30
Status:     open
Severity:   medium
Per-lane:   codex=medium
Decision:   single-model (gate-counted medium)
Surface:    src/subcommands/workflow.ts:234-249; src/workflow/compass.ts:12-14

`emitAdvance` decides whether a transition is the enforced terminal transition by taking `r.doc.phases[r.doc.phases.length - 1]` and checking `t.to === terminalPhaseId`. The workflow grammar already has explicit `next` links and transition records, so array-last is a second, weaker source of lifecycle meaning.

Blast radius is medium: the bundled default works, but adopter overrides are first-class in this feature. If an override reorders phases or adds a non-linear phase, the shipped gate can be applied to the wrong transition or missed entirely. The same ordering assumption appears in compass ordinal comparison, so the correction should derive a validated linear pipeline from `next`/transition semantics and share it across compass and advance.

### AUDIT-20260616-31 — Govern reports success when it fails to write the canonical convergence record

Finding-ID: AUDIT-20260616-31
Status:     open
Severity:   high
Per-lane:   codex=high
Decision:   single-model (gate-counted high)
Surface:    src/subcommands/govern.ts:976-1014; README.md:178

After convergence, `runGovern` attempts `resolveConvergenceItem` and `recordGovernConvergence`, but catches any failure as a warning and still prints `implementation governed`, emits `graduated`, and exits 0. The README claims “the govern convergence-write refuses on a node-less governed dir,” but the code explicitly does not refuse; it leaves the gate closed while reporting success.

Blast radius is high because a caller can trust govern’s exit code and terminal outcome as evidence that governance completed, while the workflow gate has no record to read. The workflow may still block `advance`, but the command contract and documentation are false at the point automation consumes them. The write failure should be terminal for workflow-driven governance, or the command must clearly distinguish standalone governance from workflow-governed convergence before returning success.
