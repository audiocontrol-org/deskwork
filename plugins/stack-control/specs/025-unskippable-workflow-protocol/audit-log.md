---
slug: 025-unskippable-workflow-protocol
targetVersion: ""
---

# Audit log — 025-unskippable-workflow-protocol

## 2026-06-16 — audit-barrage lift (20260616T232510951Z-025-unskippable-workflow-protocol-phase-1)

### AUDIT-20260616-01 — Fixture silently inherits a digit-led phase-id constraint from PHASE_HEADER_RE, undocumented on FixturePhase

Finding-ID: AUDIT-20260616-01
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    src/__tests__/fixtures/workflow/unskippable-fixtures.ts:31-35 (FixturePhase.id) + 88-90 (renderTasks) coupled to src/govern/incremental-audit.ts:28 (PHASE_HEADER_RE)

`renderTasks` emits each header as `` `## Phase ${phase.id}: fixture phase ${phase.id}` `` (line 89), and `governedPathsFor` (lines 65-74) re-parses that text with `parsePhases`, whose `PHASE_HEADER_RE = /^##\s+Phase\s+([0-9][0-9A-Za-z.]*)\b.*$/` requires the id to be **digit-led**. A test author who passes a non-numeric phase id — `{ id: 'setup', ... }` or `{ id: 'a', ... }`, both natural choices — produces a header (`## Phase setup: …`) that the regex does **not** match. `parsePhases` then finds zero phases for that id, so `governedPathsFor('setup')` throws `phase 'setup' not in fixture tasks.md`, and worse, `checkpointPhase('setup')` will happily write a checkpoint keyed `phase-setup` (lines 81-92) that the resolver-under-test can never rediscover. The `FixturePhase.id` doc-comment (line 32) says only "its id" — nothing signals the constraint.

Blast radius: this is test infrastructure, so the consequence is a confusing/misleading test failure rather than a shipped defect — but the failure points the author at "phase not in tasks.md" when the real cause is "id wasn't digit-led," which costs debugging time and could mask a genuine resolver bug. The current two consumers use `'1'/'2'/'3'` so they're unaffected; the trap is latent for the next author. Fix: document the digit-led requirement on the `id` field, or assert `/^[0-9]/.test(phase.id)` in `makeUnskippableFixture` with a message that names the grammar.

---

### AUDIT-20260616-02 — FixturePhase path contract ("must contain `/`, no `:`") is promised in a comment but never enforced; violation fails with a misdirecting message

Finding-ID: AUDIT-20260616-02
Status:     open
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    src/__tests__/fixtures/workflow/unskippable-fixtures.ts:33 (doc) + 65-74 (governedPathsFor) coupled to src/govern/incremental-audit.ts:73-90 (extractScopedPaths)

The `files` doc-comment (line 33) states paths "must contain `/`, no `:`", but `makeUnskippableFixture` validates neither. A path lacking `/` is silently skipped by `extractScopedPaths` (line 77: `if (... !raw.includes('/')) continue`); a path bearing a residual `:` is dropped at line 86. Either drop makes the affected phase parse to `files: []`, so `governedPathsFor` throws `phase '<id>' has no governed files` (lines 70-72) — a message that misdirects the author to "I forgot to add files" when the real cause is a malformed path. The contract is load-bearing (it's what keeps the fingerprint scope non-empty), so silently relying on a doc-comment is fragile.

Blast radius: test-only, fail-loud, so low — but the loud failure names the wrong cause. A two-line guard in `makeUnskippableFixture` (reject any `file.path` not matching the documented shape, with a message quoting the offending path and the rule) converts a misdirecting failure into a self-explaining one and makes the contract executable rather than aspirational.

---

### AUDIT-20260616-03 — research.md records hard line-number anchors into code the same feature is about to refactor — they rot on the first extraction

Finding-ID: AUDIT-20260616-03
Status:     open
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    specs/025-unskippable-workflow-protocol/research.md:114-160 (Implementation anchors section)

The anchors pin precise line numbers — `govern.ts:401`, `govern.ts:412`, `govern.ts:439`, `govern.ts:767`, `gate-eval.ts:105`, `workflow-types.ts:44` — and in the same breath declare those very symbols "TO EXTRACT" into a new `src/govern/phase-checkpoint-status.ts` (line 130-133) and add a `case` to the `gate-eval.ts` switch (line 153). The moment T-series extraction/insertion lands, every one of those line numbers is wrong. The project's own documentation rule warns against rot-prone specifics; though it scopes that to adopter-facing docs and this is an internal research artifact (hence low, not higher), a future agent reading these anchors after the refactor will be sent to the wrong lines.

Blast radius: low — internal doc, and the symbol names remain searchable even when the line numbers drift. Recommend anchoring by symbol name only (`resolvePhaseCheckpointStatuses` in `govern.ts`) and dropping the `:NNN` suffixes, or explicitly stamping the section "line numbers point-in-time as of 3dc01a42, pre-extraction."

---

### AUDIT-20260616-04 — editPhaseFile performs no phase-membership check and its "goes stale" promise is conditional on content actually differing

Finding-ID: AUDIT-20260616-04
Status:     open
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    src/__tests__/fixtures/workflow/unskippable-fixtures.ts:93 (editPhaseFile) + 38 (doc-comment)

`editPhaseFile: (path, content) => base.write(path, content)` (line 93) is documented as "Overwrite a phase file's content → its checkpoint fingerprint goes stale" (line 38). Two unstated preconditions make that promise leaky: (a) it accepts any `path`, with no check that the path is actually a governed file of some checkpointed phase — a typo'd path silently writes a stray file and no fingerprint changes, so a staleness-asserting test fails for an invisible reason; (b) if `content` equals the file's current content, the fingerprint is unchanged and the phase stays *current*, contradicting the doc's unconditional "goes stale."

Blast radius: low and test-only; the one current consumer (`graduate-gate.test.ts`, the "editing phase 2 … stale" case) passes a real path with genuinely different content, so it's correct today. The risk is the next author trusting the doc-comment literally. A cheap hardening: assert the target path resolves to a known phase file and (optionally) that the new content differs, failing loud otherwise.

---

### AUDIT-20260616-05 — Checked-clean: fixture/parser grammar match, fail-loud guards, and fingerprint coupling are sound

Finding-ID: AUDIT-20260616-05
Status:     open
Severity:   informational
Per-lane:   claude=informational
Decision:   single-model (gate-counted informational)
Surface:    src/__tests__/fixtures/workflow/unskippable-fixtures.ts (whole file)

Items I checked that came back clean: (1) the rendered header `## Phase 1: fixture phase 1` **does** match `PHASE_HEADER_RE` for digit-led ids (the `.*$` swallows the `: title`), so the common path parses correctly — my initial suspicion of a grammar mismatch was unfounded. (2) `governedPathsFor` correctly mirrors real govern by deriving scope from the *parsed* tasks.md rather than the raw input, so the fixture's fingerprint matches what `govern --phase` would compute. (3) The empty-scope guards are present and fail loud (lines 67-72), consistent with `computeScopeFingerprint`'s throw-on-empty and FR-004. (4) `checkpointPhase` keys `checkpoint`/`auditLogSection` as `phase-<id>` exactly as the 021 shape requires, so the staleness test's stale-detection is exercising the real currency predicate, not a fixture-local shortcut. The fixture is structurally correct for its documented (digit-led, slash-bearing) usage; my findings above are all robustness/documentation hardening, not correctness defects in the current consumers.

---

These findings are the audit deliverable — the diff under review is test/doc infrastructure with no shipped-product surface, so all severities are calibrated accordingly (one `medium` latent footgun, the rest `low`/`informational`). No `blocking` or `high` findings: the fixture is correct for its current consumers, and the RED tests that depend on it (`composed-record.test.ts`, `graduate-gate.test.ts`) use only digit-led ids and well-formed paths.

### AUDIT-20260616-06 — Speckit wrapper target points at a non-existent payload surface

Finding-ID: AUDIT-20260616-06
Status:     open
Severity:   high
Per-lane:   codex=high
Decision:   single-model (gate-counted high)
Surface:    specs/025-unskippable-workflow-protocol/research.md:155-157

The implementation anchor says to inject wrapper precondition blocks into `.claude/skills/speckit-{specify,plan,tasks,implement}/SKILL.md`, but this plugin tree exposes stack-control skill payloads under `skills/*/SKILL.md`; the audited repository does not have that `.claude/skills/speckit-*` surface. An unattended implementer following this anchor will naturally patch or create the wrong tree, leaving the active Codex/plugin skills unprotected.

The blast radius is high because US4’s direct backend-skill refusal is one of the feature’s core enforcement promises. A reasonable fix is to name the actual installed/vendored backend skill locations this plugin ships or consumes, and define how those wrappers are discovered during install/runtime instead of anchoring to a Claude-only path.

### AUDIT-20260616-07 — Shortcut audit excludes the wrapper surface it must enforce

Finding-ID: AUDIT-20260616-07
Status:     open
Severity:   medium
Per-lane:   codex=medium
Decision:   single-model (gate-counted medium)
Surface:    specs/025-unskippable-workflow-protocol/research.md:155-161

The research adds a wrapper/precondition surface for backend Speckit skills at lines 155-157, but the no-shortcuts audit at line 161 is scoped only to `skills/*/SKILL.md`. That means the audit contract does not cover the newly introduced wrapper blocks or backend Speckit skill bodies, even though those are exactly where a direct backend invocation could expose operator-facing shortcut language.

The blast radius is medium: the core graduate gate can still be implemented correctly, but the enforcement audit will give a false clean result for part of the protocol surface. The fix is to define the audit’s input set as data that includes both stack-control skills and the wrapped backend Speckit skill payloads, with tests proving both classes are scanned.

## 2026-06-17 — audit-barrage lift (20260617T012701495Z-025-unskippable-workflow-protocol-phase-1)

### AUDIT-20260617-01 — US1 graduate gate bypasses the purpose-built `enumeratePhases` substrate; docstring falsely claims it uses it, and its zero-phase semantics diverge from the US2 cadence

Finding-ID: AUDIT-20260617-01
Status:     open
Severity:   high
Per-lane:   claude=high
Decision:   single-model (gate-counted high)
Surface:    src/govern/compose-convergence.ts:27-55 (+ phase-checkpoint-status.ts:60-100, phase-enumeration.ts:9-12, execute-check.ts:14,127)

`phase-enumeration.ts` documents itself as *"the shared substrate the US1 graduate gate … and the US2 execute cadence both read."* But `enumeratePhases` is imported **only** by `execute-check.ts` (US2). The US1 gate path (`gate-eval.ts` → `composeConvergedImpl` → `evaluatePhaseCheckpoints` → `resolvePhaseCheckpointStatuses`) re-derives phases via `parsePhases` and never touches the substrate built for it. The two then disagree on the malformed-input case the substrate exists to police: zero `## Phase` headers → US2 cadence **throws FATAL** (`phase-enumeration.ts:35-40`); US1 gate returns soft `{met:false, unmet:[]}` (`compose-convergence.ts:48-50`). The `evaluatePhaseCheckpoints` docstring (`:29-30`) claims it *"Fails loud (FR-004) on … zero derivable phases … via `enumeratePhases`"* — both halves false, and it directly contradicts the body comment 6 lines below. An unattended agent trusts a fail-loud guarantee the gate doesn't provide. Fix: route the gate through `enumeratePhases`, or make the soft divergence explicit and correct the false docstring + substrate contract.

### AUDIT-20260617-02 — Gate derives the feature slug as `basename(specDirPath)` — an unverified duplicate of govern's `resolveFeatureSlug` that can read the wrong checkpoint dir and make a fully-governed feature un-graduatable

Finding-ID: AUDIT-20260617-02 (claude-02 + codex-01; cross-model)
Status:     open
Severity:   high
Per-lane:   claude=high, codex=high
Decision:   agreement (gate-counted high)
Surface:    src/workflow/gate-eval.ts:161-165 (vs govern.ts:620-646)

The gate keys checkpoints on `basename(ctx.specDirPath)` and *asserts* this equals govern's slug. But `resolveFeatureSlug` (`govern.ts:641-646`) selects from explicit/branch/marker via a `featureRootExists` predicate — not unconditionally the spec-dir basename (on `feature/stack-control` the branch slug is `stack-control`, not `025-…`). govern writes under `<resolveFeatureSlug>/`; the gate reads under `<basename(specDirPath)>/`. On divergence every phase reads `missing` → `met:false` → the feature **can never graduate despite being fully governed**, and produces a non-terminating loop (govern says converged under slug A, gate says missing under slug B). Fix: have the gate call the same `resolveFeatureSlug` so write-key and read-key cannot drift.

### AUDIT-20260617-03 — Empty-file-list fail-loud guard is cloned across `enumeratePhases` and `resolvePhaseCheckpointStatuses` with divergent messages — against the anti-clone claim in the research anchor

Finding-ID: AUDIT-20260617-03
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    src/govern/phase-checkpoint-status.ts:67-73 (vs phase-enumeration.ts:41-49)

The FR-004 "phase exists but names no files → throw" guard is implemented twice with distinct messages, even though the research T008/T009 anchor explicitly claimed *"no clone — project anti-clone discipline"* for this extraction. They agree today but will drift. This is the same seam that produces claude-01: delegating to `enumeratePhases` would unify both the zero-phase and empty-file-list semantics for free.

### AUDIT-20260617-04 — Zero-phase gate returns `met:false` with empty `unmet[]` — no phase named, defeating the SC-001/SC-002 "name the offending phase" intent for the no-phases case

Finding-ID: AUDIT-20260617-04
Status:     open
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    src/govern/compose-convergence.ts:48-50

Zero statuses → `{met:false, unmet:[]}`. A compass consumer rendering "blocked because {unmet}" gets a "blocked, no reason" verdict. Even granting the deliberate soft-unmet choice, surface a synthetic reason (`noPhases` flag) so the read-only compass can explain *why*.

### AUDIT-20260617-05 — US2–US5 implementation surfaces named in the commit range/research are absent from the audited diff

Finding-ID: AUDIT-20260617-05 (claude-05 + codex-02; cross-model)
Status:     open
Severity:   medium
Per-lane:   claude=informational, codex=medium
Decision:   adjudicated (gate-counted medium) — blast-radius=unstated, reachability=unstated, fix-debt=no; no down-calibration signal — medium retained.
Surface:    (the audited diff vs. the stated commit range)

The diff contains only the US1 gate slice + fixtures + research narrative; `execute-check.ts` cadence, `speckit-wrapper/refusal.ts`, `no-shortcuts-audit.ts`, and the `WORKFLOW.md` gate edits (incl. research's claim that `start-governing` gains `all-phase-checkpoints-current impl` — which warrants its own chicken-and-egg review at the transition *into* governing) are not in-range. Flagging so the operator confirms the slice was scoped deliberately.

---

The full report is written to the plan file. The two `high` findings (claude-01, claude-02) share a root cause — the gate path re-derives phase enumeration and slug resolution instead of reusing the existing primitives — so a single refactor (route the gate through `enumeratePhases` + `resolveFeatureSlug`) would close claude-01, -02, and -03 together.

This is an analysis/report task, not an implementation plan — per the ExitPlanMode guidance I won't use it. The audit is complete: five findings emitted above (2 high, 1 medium, 1 low, 1 informational) and written to the plan file. No code changes were made.

**Bottom line for triage:** the two `high` findings collapse to one root cause — the US1 graduate gate re-derives both phase enumeration (`parsePhases` instead of the purpose-built `enumeratePhases`) and the feature slug (`basename(specDirPath)` instead of `resolveFeatureSlug`) rather than reusing the existing primitives. claude-02 is the more dangerous of the two: a slug mismatch produces a govern-says-done / gate-says-missing loop where a fully-governed feature can never graduate. claude-01 layers a false docstring on top of that drift. Routing the gate through `enumeratePhases` + `resolveFeatureSlug` would close claude-01, -02, and -03 at once.

## 2026-06-17 — audit-barrage lift (20260617T014235042Z-025-unskippable-workflow-protocol-phase-1)

### AUDIT-20260617-06 — Write-side key derivation (govern.ts) absent from the diff — the `featureCheckpointKey` single-source claim is unverifiable, and if govern still keys off `resolveFeatureSlug` the feature is un-graduatable

Finding-ID: AUDIT-20260617-06
Status:     open
Severity:   high
Per-lane:   claude=high
Decision:   single-model (gate-counted high)
Surface:    src/govern/phase-checkpoint-status.ts:21-31 (featureCheckpointKey) + src/workflow/gate-eval.ts:166-168; missing surface: src/subcommands/govern.ts (write side)

`featureCheckpointKey` is introduced as the *canonical* namespace key and its docblock asserts that **both** the writer (`govern`) and the reader (the US1 gate) "MUST derive the key through THIS one function." The diff shows exactly one caller — `gate-eval.ts:168` (`composeConvergedImpl(..., featureCheckpointKey(ctx.specDirPath), tasksPath)`), the read side. The write side (`govern.ts`'s `writePhaseCheckpoint` call and the `featureSlug` it passes) is not in the diff. The remediation commit `bd5366bc` claims to close the codex-01/claude-02 HIGH on exactly this drift, but the artifact under review only demonstrates the read half.

Blast radius: if `govern.ts` writes checkpoints under `resolveFeatureSlug` (which the docblock explicitly flags as the wrong key that "may return a branch/explicit slug that differs from the spec dir name") while the gate reads under `basename(specDirPath)`, then a fully-governed feature addresses `…/phase-checkpoints/<branch-slug>/` on write and `…/phase-checkpoints/<spec-dir-basename>/` on read. Every phase reads as `missing`, the graduate gate never opens, and the workflow loops forever — the precise failure the abstraction exists to prevent. A reasonable fix: include the govern.ts change in the reviewable set (or, if govern already keys off the feature-root basename, have it *import* `featureCheckpointKey` rather than duplicate the basename logic inline, so the single-source guarantee is enforced by the compiler, not by comment).

---

### AUDIT-20260617-07 — Pre-025 / non-phased features become permanently un-graduatable on upgrade — no migration or backfill surface

Finding-ID: AUDIT-20260617-07
Status:     open
Severity:   high
Per-lane:   claude=high
Decision:   single-model (gate-counted high)
Surface:    src/govern/compose-convergence.ts:46-55 + src/workflow/gate-eval.ts:158-168

`evaluatePhaseCheckpoints` returns `met:false / reason:'no-phases'` for any `tasks.md` with zero `## Phase` headers, and the graduate + start-governing gates consume that as a hard block. For a *new* feature authored under 025 this is correct. But the diff adds this requirement to `transition:graduate` and `transition:start-governing` (FR-002/FR-005) with no shown migration path for features that are **already in flight** when 025 lands: a feature mid-`implementing` whose `tasks.md` predates the `## Phase` grammar, or that was governed via the old whole-feature `record-converged impl` run, now has no per-phase checkpoints and a possibly non-phased tasks.md.

Blast radius: on upgrade, every in-progress feature that has not been governed phase-by-phase silently loses the ability to graduate — the gate returns false and nothing in the artifact tells the operator that a one-time backfill (re-run `govern --phase` across existing phases, or a doctor migration) is required. The audit checklist's "fresh install vs upgrade" case is unaddressed. A reasonable fix: a documented backfill verb or doctor rule, or an explicit grandfather predicate (e.g. honor a legacy whole-feature converged record when no `## Phase` headers exist), with the upgrade behavior stated in the spec.

---

### AUDIT-20260617-08 — Gate path collapses the named-unmet-phase reasons (SC-001/SC-002) to a bare boolean

Finding-ID: AUDIT-20260617-08
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    src/govern/compose-convergence.ts:57-100 + src/workflow/gate-eval.ts:146-169

`evaluatePhaseCheckpoints` carefully builds `unmet: UnmetPhase[]` naming each offending phase and *why* (`missing` | `stale` | `no-phases`) — the docblocks tie this to SC-001/SC-002 ("naming each offending phase"). But the only consumer shown, `composeConvergedImpl`, returns `.met` (a bare boolean), and `evaluateCriterion` is boolean-typed by contract, so the gate path discards every reason. There is no surface in the diff that calls `evaluatePhaseCheckpoints` to render the names to the operator.

Blast radius: if no reporting/compass surface actually consumes the richer result (none is shown), the SC-001/SC-002 "tell the operator which phase is stale" promise is dead information — an operator hitting an unmet graduate gate sees only "gate not met," not "phase 3 stale, phase 5 missing," which is the whole point of naming. This may be satisfied by an out-of-diff status command; if so, point to it. Otherwise the reporting caller is a missing surface and the named-reason machinery is unreachable.

---

### AUDIT-20260617-09 — Fixture computes the checkpoint fingerprint over un-normalized paths while the reader normalizes — coincides only because fixture paths exist at root

Finding-ID: AUDIT-20260617-09
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    src/__tests__/fixtures/workflow/unskippable-fixtures.ts:118-140 (checkpointPhase/governedPathsFor) vs src/govern/phase-checkpoint-status.ts:88-93

`checkpointPhase` writes its fingerprint as `computeScopeFingerprint(base.root, governedPathsFor(phaseId))`, where `governedPathsFor` returns the **raw parsed** paths (no dedup, no installation-relative normalization). The read path, `resolvePhaseCheckpointStatuses`, computes `computeScopeFingerprint(installationRoot, normalizeGovernedPaths(installationRoot, phase.files))` — normalized and Set-deduped. The two fingerprints agree here only because every fixture file is written to disk under `base.root`, so `normalizeGovernedPaths`' `existsSync` branch returns each path unchanged. The fixture's own comment claims it keys "IDENTICALLY to what `govern --phase` writes."

Blast radius: the fidelity claim is conditional, not structural. If govern's real write path normalizes (it shares `normalizeGovernedPaths`) and the fixture does not, the fixture is not faithfully mimicking govern — and any future fixture phase that names a duplicate path, a directory, or a git-toplevel-relative path that triggers prefix-stripping would write a fingerprint the reader recomputes differently, producing a *false-stale* (or false-current) test that passes for the wrong reason. A reasonable fix: have `checkpointPhase` derive its fingerprint through the same `normalizeGovernedPaths` the reader uses, so the fixture and the production read path can never diverge.

---

### AUDIT-20260617-10 — `all-phase-checkpoints-current` criterion is consumed in gate-eval but its registration in `CRITERION_KINDS` is not in the reviewable diff

Finding-ID: AUDIT-20260617-10
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    src/workflow/gate-eval.ts:146 (new switch case); missing co-change: src/workflow/workflow-types.ts (CRITERION_KINDS), templates/WORKFLOW.md

`gate-eval.ts` adds `case 'all-phase-checkpoints-current'`, and `research.md` lists the required co-changes: add `all-phase-checkpoints-current` to `CRITERION_KINDS` in `workflow-types.ts`, and wire the criterion into the `graduate`/`start-governing` exit-gates in `templates/WORKFLOW.md` (parsed by `workflow-grammar.ts`). None of those three surfaces is in this diff.

Blast radius: this is a load-bearing co-change — if `CRITERION_KINDS` does not include the new kind, the WORKFLOW.md grammar rejects `all-phase-checkpoints-current impl` at parse time and throws a `WorkflowError` when the workflow loads, breaking *every* transition for the feature, not just graduate. The switch case added here is unreachable until the kind parses. I can't confirm the co-change is present or absent from the diff alone; flagging so the operator verifies all three surfaces landed atomically with the gate-eval case.

---

### AUDIT-20260617-11 — `FixturePhase.id` digit-led requirement is documented but not asserted — a non-digit-led id silently drops from enumeration

Finding-ID: AUDIT-20260617-11
Status:     open
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    src/__tests__/fixtures/workflow/unskippable-fixtures.ts:20-32, 92-115

The `FixturePhase.id` docblock warns that the id MUST be digit-led because `PHASE_HEADER_RE` selects only `[0-9][0-9A-Za-z.]*`, and a non-digit-led id "would vanish from enumeration." But `makeUnskippableFixture` never validates the id at construction. The drop is only caught indirectly — `governedPathsFor`/`checkpointPhase` throw "phase not in fixture tasks.md" — and only if a test actually checkpoints that phase. A test that constructs the phase but exercises a different path inherits a silently-missing phase.

Blast radius: contained to test reliability — a malformed fixture produces a misleading green/odd-failure rather than a clear construction-time error. Given the file already fails loud on path-grammar drops (`governedPathsFor` written-vs-parsed equality) and no-op edits (`editPhaseFile`), the symmetric guard is a one-line `if (!/^[0-9]/.test(phase.id)) throw …` in the constructor. Low because it only bites fixture authors, not the shipped gate.

---

### AUDIT-20260617-12 — `evaluatePhaseCheckpoints` / `composeConvergedImpl` give direct callers a raw ENOENT on missing tasks.md, while the gate pre-guards — inconsistent contract

Finding-ID: AUDIT-20260617-12
Status:     open
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    src/govern/compose-convergence.ts:46-72 + src/govern/phase-checkpoint-status.ts:78 (readFileSync)

`gate-eval.ts` guards `existsSync(tasksPath)` and returns `false` (a named "unmet, not crash" verdict) before calling `composeConvergedImpl`. But `composeConvergedImpl`/`evaluatePhaseCheckpoints` themselves do not guard — they reach `resolvePhaseCheckpointStatuses`, which does `readFileSync(tasksPath, 'utf8')` and throws a raw `ENOENT` on a missing file. The research note positions `composeConvergedImpl` as also feeding a reconcile/reporting concern (FR-001a), i.e. it has callers beyond the gate.

Blast radius: low — any non-gate caller (the convergence reconcile/reporting path) that passes a feature without a `tasks.md` gets an unstyled filesystem stack trace instead of the module's deliberate "no per-phase governance → unmet" verdict, which is the same robustness the gate path was given. The contract is asymmetric: robustness lives in the caller, not the module. A reasonable fix: move the `existsSync` check inside `evaluatePhaseCheckpoints` so all callers get the named verdict uniformly.

### AUDIT-20260617-13 — Start-governing gate is authored but not enforced

Finding-ID: AUDIT-20260617-13
Status:     open
Severity:   high
Per-lane:   codex=high
Decision:   single-model (gate-counted high)
Surface:    templates/WORKFLOW.md:129-136; src/subcommands/workflow.ts:240-248; src/workflow/transition-engine.ts:110-114

`templates/WORKFLOW.md` adds `all-phase-checkpoints-current impl` to the `implementing -> governing` transition at lines 129-136, but the workflow advance path only refuses unmet gates when the transition target is the terminal phase. The transition engine also documents that exit gates are not enforced by `applyTransition` itself. That means an adopter can still advance from `implementing` to `governing` with missing or stale per-phase checkpoints; the new criterion is merely reported on that boundary, not unskippable.

Blast radius is high because this directly weakens the feature’s phase-boundary guarantee. The final `governing -> shipped` gate still blocks release, so this is not a total bypass, but downstream operators and unattended agents can enter the governing phase before the required phase checkpoints exist. A reasonable fix is to make this transition an enforced gate too, or move the required enforcement to the command surface that performs the implementing-to-governing handoff.

### AUDIT-20260617-14 — Research keeps prohibited deferred-work wording in the governed spec artifact

Finding-ID: AUDIT-20260617-14
Status:     open
Severity:   medium
Per-lane:   codex=medium
Decision:   single-model (gate-counted medium)
Surface:    specs/025-unskippable-workflow-protocol/research.md:161-165

The research anchor describes the corrected US4 mechanism and then records a separate filed item for the deeper point-of-invocation refusal at lines 161-165. The audit prompt’s hard constraint explicitly says to surface deferred-work phrasing in the diff, and this is in the spec material that unattended agents may later consume as implementation guidance.

Blast radius is medium because the same paragraph also states the honest boundary and the graduate gate defense, so an implementer can infer the current intended scope. The risk is that the spec artifact normalizes a shortcut-shaped gap in the exact area this feature is meant to make non-discretionary. A reasonable fix is to rewrite the note as a present boundary statement plus an explicit out-of-scope design gap, without deferred-work phrasing.

---

## GOVERN_OVERRIDE — 2026-06-17 (operator decision)

The per-phase implement-mode govern was run repeatedly against the 025 feature during its
own dogfood. It **caught and we fixed two cross-model HIGH bugs** in the US1 gate (the
checkpoint-key drift; the false-substrate docstring — commit `bd5366bc`, full suite green).
Subsequent re-govern rounds **plateaued** (`.claude/rules/spec-audit-diminishing-returns.md`):
the residuals are no longer happy-path defects but a scoping artifact + design forks. Per the
rule, the operator chose **override-and-graduate; forks as follow-ons** (2026-06-17). The
retroactive per-phase sweep over a *finished* feature is stopped (the cadence is designed to
run DURING implementation; run after, with a whole-history diff base scoped to one phase's
files, it manufactures cross-phase scoping artifacts).

Residual dispositions:

- **claude-01 (3rd round, HIGH) — NOT A DEFECT (per-phase scoping false-positive).** It
  claims the govern.ts write-side `featureCheckpointKey` change is "absent from the diff." It
  IS committed (`bd5366bc`: govern.ts imports `featureCheckpointKey` and writes under it) and
  proven by `checkpoint-key-consistency.test.ts` + the green suite; it was simply outside
  *phase-1's* audited file scope, so the barrage could not see it. No action.
- **codex-01 (AUDIT-20260617-13, HIGH) — SCOPED: TASK-152.** start-governing gate is authored
  but advisory (the 024 advance engine enforces only the terminal transition). Bounded: US2's
  execute cadence writes the checkpoints during implementing and the graduate gate (enforced)
  blocks shipping — defense-in-depth holds. Fork (enforce vs honest-boundary) is TASK-152.
- **claude-02 (3rd round, HIGH) — SCOPED: TASK-153.** pre-025 / in-flight features have no
  per-phase checkpoints → un-graduatable on upgrade, no backfill/grandfather. Genuine design
  gap; operator scope call captured as TASK-153.
- **codex-02 (AUDIT-20260617-14, MEDIUM) — WON'T-FIX (not a deferral).** The research note
  references a *filed* follow-on roadmap item
  (`design:gap/speckit-bypass-point-of-invocation-refusal`), which IS a disposition, not a
  "for now" shortcut. Naming a filed follow-on is the sanctioned capture-then-scope shape.

The 025 implementation is complete + verified (264 test files / 1731 tests green; `spec-check`
exit 0). Governance is overridden at the plateau with the residuals scoped above; the roadmap
node's formal graduation is the operator's separate workflow step.
