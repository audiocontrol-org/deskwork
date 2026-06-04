# Audit Log — pluggable-lifecycle-providers

Durable record of audit findings + their dispositions. Status values: `open` → `fixed-<sha>` → `verified-<date>`, or `acknowledged-<date>` with substantive reason.

---

## 2026-06-04 — Pre-implementation documentation barrage

Audit-barrage run against the full feature documentation set (feature-definition.md, design.md, prd.md, workplan.md, README.md) BEFORE any implementation code. Models: `claude` (opus48) + `codex` (gpt-5); gemini disabled per project config. Run dir: `.dw-lifecycle/scope-discovery/audit-runs/20260604T210336770Z-pluggable-lifecycle-providers/`. Both models emitted findings; cross-model agreement (both flagged the same root cause independently) is the HIGH-confidence signal and is marked **[cross-model]**.

Consolidated 21 raw claude findings + 10 raw codex findings into 23 deduped entries.

### HIGH — block authoring the Phase 2 JSON Schema / correct behavior

**AUDIT-20260604-01** — Status: open — **[cross-model: opus48-01 + gpt-5-02]**
Surface: design.md §3 (manifest YAML) vs §3 notes / §4.1 / §4.3; workplan back-half "walks tasks[]".
Title: Task spine shape is self-contradictory — top-level `tasks[]` or nested `phases[].tasks[]`?
The schema example nests `tasks` under each `phases[]` item, but the prose says `tasks[]` is the flat spine the back half walks and `phases[]` is "a thin overlay." Cannot write the JSON Schema or `reconcile()` (matches `provider_task_id` "across the manifest") until the canonical location is fixed. Recommended fix (both models): top-level `tasks[]` spine + `phases[].task_ids[]` references, so reconcile matches one flat collection.

**AUDIT-20260604-02** — Status: open — **[cross-model: opus48-02 + gpt-5-01]**
Surface: design.md §3 (capabilities block) vs §4.3 phase_strategy + §6 tracker; prd/workplan AC.
Title: The `tracker` setting that drives `phase_strategy` is absent from the manifest schema.
§4.3 branches on `tracker == "none"` and §6 defines `tracking.tracker` with four enum values, but §3's schema has no `tracking:` block and no `tracker` field — only a provider-side `capabilities.supplies_issue_tracking` boolean (a different thing). With `additionalProperties: false` the schema would reject a manifest carrying `tracker`. Decide where `tracker` lives (manifest vs `.dw-lifecycle/config.json`), add it to the schema if in-manifest, define its interaction with `supplies_issue_tracking`, and decide whether `github-lazy` is in the v1 enum (named "later" in prose, listed in §6 config block).

**AUDIT-20260604-03** — Status: open — **[cross-model: opus48-03 + gpt-5-04]**
Surface: prd.md OQ-4 disposition vs workplan.md Risks (Phase 6 row).
Title: OQ-4 dispositioned "re-snapshot" in PRD/design but workplan Risks declares the opposite ("freeze at first projection").
Two readers build opposite `ship`-gate behavior after a provider upgrade. Fix the workplan risk row to match the accepted re-snapshot disposition (or reopen OQ-4 if freeze is actually wanted).

**AUDIT-20260604-04** — Status: open — **[cross-model: opus48-05 + gpt-5-03]**
Surface: design.md §2, §7 port; feature-definition/PRD AC #7; workplan Phase 8.
Title: The minimal-provider contract (defaults when only `normalize()` is implemented) is asserted but never specified.
AC #7 promises a stub provider implementing only `normalize()` yields a runnable lifecycle, but §7 lists `detect()/capabilities()/author()/normalize()` with no statement of which are optional and no default-capability fallback values. "deskwork fills the rest via capabilities" is circular if capabilities are what the stub omits. Specify the optional-method set + default capabilities (e.g. `structured_criteria: none`, `decomposition: flat`, `integration_tier: importer`, `reauthor: regenerates`) + default `author()` behavior — or raise the port minimum and change AC #7.

**AUDIT-20260604-05** — Status: open — **[cross-model: opus48-07 + gpt-5-05]**
Surface: design.md §3 (acceptance_criteria under phases[]), §4.2; §5 reconcile.
Title: Acceptance-criteria are modeled at phase level; their projection granularity AND reconcile/merge behavior are unspecified.
(a) Criteria attach to `phases[]`, but providers (esp. Kiro/EARS) author criteria per requirement/task; with the default `single-phase` strategy all criteria collapse under P1, destroying the task↔criterion association the `ship` gate needs. (b) §5.2's merge rules cover only tasks — no rule for how `acceptance_criteria` / their `verified` flags reconcile on re-sync (governance-like state could silently drop or go stale). Specify AC attachment levels (task / group / feature) + the projection rule per provider shape, and add AC rows to the §5.2 merge table with a `verified` preservation/invalidation policy.

**AUDIT-20260604-06** — Status: open — [opus48-06]
Surface: design.md §3 (capabilities top-level) vs §3 notes / §4.2 / §8 OQ-4 ("provenance.capabilities").
Title: design.md is internally inconsistent on whether `capabilities` is top-level or nested under `provenance`.
The §3 YAML places `capabilities:` as a top-level sibling of `provenance:`, but inline comments, §4.2, and OQ-4 all reference the dotted path `provenance.capabilities.*`. Two JSON paths for the same block — schema + every reader (`ship` gate, doctor, reconcile re-snapshot) keys off one and silently misses the other. Pick one location; make all references consistent. (Related to gpt-5-01's "canonical location" theme.)

**AUDIT-20260604-07** — Status: open — [opus48-04; codex gpt-5-07 touches reconcile states]
Surface: design.md §3 (task `status: pending`) + §5.2 ("mark `drifted`/`orphaned-upstream`").
Title: Task `status` enum is undefined, and drift/orphan markings have no defined field or domain.
`phases[].status` enumerates `pending|in-progress|done|deferred` but `tasks[].status` shows only the literal `pending`. §5.2 says "mark drifted / orphaned-upstream" without saying whether those are `status` values, a separate field, or flags. Schema unauthorable + AC #4 ("flags drifted/orphaned") unverifiable until pinned. Fix: define the task `status` enum + add an orthogonal `reconcile_state: unchanged|new|drifted|orphaned-upstream` (a `done` task can also be `drifted`).

**AUDIT-20260604-08** — Status: open — [opus48-08]
Surface: feature-definition/prd AC #2 + workplan Final-verification Step 1.
Title: "byte-identical user-visible behavior" / "compare every emitted artifact byte-for-byte" is falsified by the feature's own new artifact.
Phase 2 has `native` emit the manifest (a brand-new file that didn't exist pre-feature), and the manifest carries non-deterministic `generated_at` + `provenance`. A literal "every artifact byte-for-byte" comparison must fail. Fix: scope AC #2 to "pre-existing markdown artifacts byte-identical; new manifest excluded," and define timestamp normalization for any manifest golden comparison.

### MEDIUM

**AUDIT-20260604-09** — Status: open — **[cross-model: opus48-10 + gpt-5-09]**
Surface: design.md §8 + prd phase table (phases 1–7, Phase 1 = Extract manifest) vs workplan + README (phases 1–8, Phase 1 = Stabilize PRD).
Title: Phase numbering is off-by-one across documents; "Phase 1–2 neutrality guarantee" is ambiguous.
Cross-references to "Phase 2" / "Phase 1–2 neutrality" resolve differently depending on which doc you read. Error-prone for issue filing, status, and AC references. Fix: adopt one canonical numbering OR always qualify ("design-phase N" vs "Planning Phase 1" / "Implementation Phase 1") and rewrite the neutrality AC to name phases unambiguously.

**AUDIT-20260604-10** — Status: open — **[cross-model: opus48-11 + gpt-5-07]**
Surface: design.md §4.1 (synthesized `"<provider>:<ordinal>"` key) vs §5.2 (match by `provider_task_id`) + AC #4.
Title: Ordinal-synthesized `provider_task_id` makes reconcile's preservation guarantee unsound for id-less providers; uniqueness/duplicate/null behavior undefined.
If upstream inserts/deletes a task, every later ordinal shifts → reconcile mis-classifies shifted tasks as Drifted/Orphaned and fails to preserve `status`/`sha`/`governance` (violates AC #4). Docs flag "fragile-key" but never define reconcile's behavior for it, nor duplicate/missing/null `provider_task_id`. Fix: require unique non-null `provider_task_id` for `origin: provider`; define synthesized-key stability + fragile-key handling (refuse / positional fallback / per-task operator confirm); make duplicate/missing keys validation errors or explicit report cases.

**AUDIT-20260604-11** — Status: open — **[cross-model: gpt-5-08 + opus48-20]**
Surface: design.md §5.1, §7; prd OQ-2; workplan Phase 6.
Title: Re-sync contract + `author()` mode enum don't fit importer-tier providers (kiro).
§5.1 says re-sync re-runs `author()` + `normalize()`, but kiro is an importer with `--import-from <path>` and no live authoring; the port still requires `author(featureSlug, mode, ctx)` with `mode: define|plan` (which also drifts from the `define`/`setup` skill names). Undefined whether kiro's `author()` is a no-op, an import-path validator, or unsupported on re-sync. Fix: define re-sync inputs per integration tier + required `author()` behavior for importers + the mode↔skill mapping.

**AUDIT-20260604-12** — Status: open — [opus48-09]
Surface: design §8 / prd "each ships behavior-neutral until the next" vs §6 + prd Phase 6 row + workplan Phase 7.
Title: The blanket "every phase behavior-neutral until the next" guarantee is contradicted by the tracker-default flip.
Flipping the tracker default `github-per-phase` → `none` stops `issues` filing GitHub issues — an operator-visible change, not neutral. Narrow the guarantee to the Phase-1–2 (design-phase) neutrality AC #2 actually promises; label later phases "behavior-additive / intentional default change."

**AUDIT-20260604-13** — Status: open — [opus48-12]
Surface: feature-definition/prd AC #1 + §6 ("only four skills touch gh") vs AC #1 listing `session-*` in the back half.
Title: `session-*` is both "provider/tracker-agnostic back half" and an un-gated `gh` caller.
Project Session Lifecycle has `session-start` "Check open GitHub issues," a `gh` call; §6 gates only `issues`/`pickup`/`complete`/`debt-report` on `tracker`. At `tracker: none` `session-start` would still call `gh`. Decide whether `session-*` is tracker-gated; add it to the gated set or document the exemption.

**AUDIT-20260604-14** — Status: open — [opus48-13]
Surface: feature-definition/prd AC #1 + workplan Final-verification Step 2 (grep gate).
Title: The grep gate for "zero provider-identity branches" is unsound and pointed at the wrong tree.
The regex `provider.*===.*\|providerName\b` misses `switch (prov)` / aliased vars and false-positives on capability code; it searches `src/skills/.../SKILL.md` but the branching logic lives in TS (`src/providers/`, `src/manifest/`). Replace with a sound check over actual TS sources (enumerate provider-name literals, assert none in back-half modules); treat grep as a smoke aid per the project spec-compliance-probe rule.

**AUDIT-20260604-15** — Status: open — [opus48-14]
Surface: prd OQ-1 disposition ("re-key scope-inventory onto tasks") vs workplan Phase 2 (no re-key task) + Phase 2 neutrality claim.
Title: Accepted OQ-1 re-keying of `scope-inventory` is unscheduled and conflicts with Phase 2's zero-behavior-change claim.
No phase schedules the re-key; Phase 2 only says "point scope-inventory at the manifest." Re-keying evidence (phases → tasks) is a behavior change to scope-discovery output, contradicting Phase 2 neutrality. Either schedule it as an explicit task + acknowledge the behavior change, or carry the "tolerate single synthetic phase" path and drop the re-key.

**AUDIT-20260604-16** — Status: open — [opus48-15]
Surface: design §3 (`provenance.source_artifact`) + §5.1 (re-author from fossil) + §7 (native "emits manifest alongside the markdown it already writes").
Title: `native`'s `source_artifact` (the intent fossil it re-authors from) is undefined.
`workplan.md` is being demoted to a ledger (no longer the author), so native has no named authored-intent file; §5.1 re-sync re-runs `author()` + `normalize()` against `source_artifact` — nothing well-defined for native. Also makes the Phase-3 identity AC untestable. Define native's intent artifact (e.g. a dedicated `plan.md`) + its `provenance.source_artifact` path.

**AUDIT-20260604-17** — Status: open — [opus48-16]
Surface: feature-definition §Scope + workplan Architecture ("workplan.md = rendered face of the manifest") vs workplan phase file-lists.
Title: "workplan.md rendered from the manifest" is a stated deliverable that no phase schedules.
Implies a renderer that regenerates `workplan.md` from the manifest; no phase lists it. Schedule the renderer (which phase? trigger? does hand-editing survive the transition?) or correct the scope statement to "manifest and workplan.md coexist as independent files."

**AUDIT-20260604-18** — Status: open — [opus48-17]
Surface: workplan Final-verification Steps 1 & 3.
Title: Two final-verification steps are non-mechanical as written.
Step 3 ("compare spec-kit findings against a native baseline") is flaky — different decompositions yield different findings; the verifiable claim is the mechanism (implement walks N tasks, barrage fires, schema-valid manifest), not finding parity. Step 1 shares the byte-for-byte defect (AUDIT-08). Rewrite to assert mechanism, not parity.

**AUDIT-20260604-19** — Status: open — [opus48-18]
Surface: workplan §Risks (Phase 7 backward-compat) + Phase 7 acceptance + §6.
Title: Phase 7 backward-compat assumes existing features carry a manifest they will not have.
Pre-feature in-flight features have no `lifecycle-manifest.yaml`, and `tracker` may not live in the manifest (AUDIT-02). Specify the migration path: does Phase 7 backfill manifests for in-progress features, or does the config default flip only for fresh installs while existing `.dw-lifecycle/config.json` retains its tracker?

**AUDIT-20260604-20** — Status: open — [gpt-5-06]
Surface: design §5.2; prd OQ-3; workplan Phase 4.
Title: Drift detection says "normalized-exact" but never defines the normalized text.
OQ-3 accepted normalized-exact, but §5.2 still says "text equal" / "text materially changed" without saying which fields participate (title only? + acceptance criteria? raw markdown? phase grouping?) or the normalization algorithm. Incompatible reconcile implementations result. Specify the drift comparison input + normalization.

### LOW

**AUDIT-20260604-21** — Status: open — [opus48-19]
Surface: design §4.3 (phase_strategy) + §3 (no phase_strategy field).
Title: `phase_strategy` value `heuristic-headings` is never defined, and the resolved strategy isn't recorded in the manifest.
Define `heuristic-headings` (what does it key on for a flat provider with no deskwork headings?) or drop it; record the resolved `phase_strategy` in the manifest (e.g. under provenance) so reconcile/doctor know how phases were derived.

**AUDIT-20260604-22** — Status: open — [opus48-21]
Surface: design §3 capabilities (`integration_tier`, `reauthor`, `supplies_issue_tracking`).
Title: Several declared capabilities have no documented consumer, despite the "branch only on capabilities" contract.
Only `structured_criteria` (ship gate) and `decomposition` (phase_strategy) have consumers; `integration_tier`, `reauthor`, `supplies_issue_tracking` appear in the snapshot with no consumer in §§4–7. Specify each one's consumer or remove the unused fields so the schema doesn't imply unbuilt behavior.

**AUDIT-20260604-23** — Status: open — [gpt-5-10; introduced by this session's workplan edit]
Surface: workplan.md Phase 2/3 + Risks table.
Title: workplan still references the superseded `/dw-lifecycle:extend` ceremony in later phases.
Phase 1's Task 4 was marked "superseded (inline)" this session, but Phases 2–8 still say "Detailed task breakdown deferred to `/dw-lifecycle:extend`" and the Risks table says extend "will break Phase 2 into per-skill commits." Sweep those references to the inline task-breakdown process. (This inconsistency was introduced by the 2026-06-04 ceremony-cleanup edit and is the cleanest to fix.)

---

### Triage summary

- **23 open** (8 HIGH, 12 MEDIUM, 3 LOW). **8 cross-model** (highest confidence): -01, -02, -03, -04, -05, -09, -10, -11.
- **4 HIGH block Phase 2's JSON Schema directly**: -01 (task spine), -02 (tracker location), -06 (capabilities path), -07 (status/reconcile_state enums). The Phase 2 deliverable is *literally* the schema — these must resolve first.
- **Most findings are design.md/PRD/workplan precision gaps**, not code bugs — expected for a pre-implementation doc audit. Several are clean doc-fixes (-03, -09, -23, -08); several are genuine design-completion decisions the operator should weigh in on (-01, -02, -04, -05).

## 2026-06-04 — audit-barrage lift (20260604T231633132Z-pluggable-lifecycle-providers)

### AUDIT-20260604-24 — Hardcoded feature slug makes the "generic" governance hook always target `pluggable-lifecycle-providers`

Finding-ID: AUDIT-20260604-24 (claude-01 + claude-02 + claude-06 + claude-07 + codex-01 + codex-02; cross-model)
Status:     fixed-f3dc5751 (slug now derived from the `feature/<slug>` branch + empty-slug guard; no hardcoded default)
Severity:   high
Surface:    plugins/dw-lifecycle/spec-kit/deskwork-governance/scripts/bash/govern.sh:14 + .specify/extensions.yml after_implement hook entry

The `after_implement` hook fires `speckit.deskwork-governance.govern` with **no arguments**; the command body runs `govern.sh` with no env; and `govern.sh` defaults `SLUG="${GOVERN_FEATURE_SLUG:-pluggable-lifecycle-providers}"`. The slug is therefore a baked-in constant, not derived from the work spec-kit just implemented. `FEATURE_DOCS` / `AUDIT_LOG` (lines 16–17) and the `--feature` flag passed to all three `dw-lifecycle` verbs (lines 56–62) all flow from that constant.

The stated contract in the script header and command body is "Branches only on the diff + feature slug … never on which tool authored/executed the plan." But the slug is never *resolved* — it is hardwired. The moment this extension fires on `/speckit-implement` for any feature other than this one, it will lift findings into `docs/1.0/001-IN-PROGRESS/pluggable-lifecycle-providers/audit-log.md` and audit against the wrong feature's audit-log excerpt. As a self-governing slice-001 artifact it happens to work; as the shipped, reusable extension the diff installs into `.specify/extensions.yml`, it is a latent cross-feature data-corruption bug. The fix is to derive the slug from the active spec-kit feature (branch name / current feature dir), not default it to a literal.

### AUDIT-20260604-25 — Every `/speckit-implement` unconditionally fires a multi-model LLM barrage with no gating

Finding-ID: AUDIT-20260604-25
Status:     acknowledged-2026-06-04 (always-fire is the deliberate audit-barrage cost model — CLI-subscription, not metered API; diff-materiality gating is a future enhancement, operator can add a `condition`)
Severity:   medium
Surface:    plugins/dw-lifecycle/spec-kit/deskwork-governance/extension.yml:24-28 (`optional: false`, no `condition`)

The hook is declared `optional: false` with no `condition`, and the command body instructs *"do not treat governance as optional."* The compiled `.specify/extensions.yml` entry confirms `optional: false`, `condition: null`. Consequently **every** implement step — including a one-line typo fix or a doc tweak — spawns `dw-lifecycle audit-barrage`, which fans out real API calls across claude/codex/gemini lanes (govern.sh:60). There is no diff-size threshold, no per-run skip, and no condition to suppress the barrage on trivial changes.

This couples a heavyweight, multi-model, billable, multi-second operation to a high-frequency event. The non-optionality is a deliberate design choice (the "governance is not optional" framing is sound), but the absence of *any* gating — e.g. skip when the diff is below N lines, or when it's docs-only — means the cost/latency is paid uniformly regardless of whether the change merits a cross-model audit. Worth an explicit operator decision: confirm the always-fire contract, or add a `condition` that gates on diff materiality.

### AUDIT-20260604-26 — The smoke re-derives the run-dir by globbing instead of capturing `govern.sh`'s authoritative stdout

Finding-ID: AUDIT-20260604-26
Status:     fixed-88509768 (smoke now captures govern.sh's stdout run-dir instead of globbing)
Severity:   medium
Surface:    scripts/smoke-governance-after-implement.sh:28-36

`govern.sh` prints the run-dir on stdout as its documented result (govern.sh:65, `echo "${RUN_DIR}"`). The smoke discards that stdout (`bash "$GOVERN" || fail …` with no capture) and instead independently re-derives `latest` by globbing `.dw-lifecycle/scope-discovery/audit-runs` for `*-pluggable-lifecycle-providers` and taking `sort | tail -1`. This introduces two avoidable coupling points: (1) the smoke hardcodes the verb's *internal* output directory (`RUNS_DIR`, line 15) rather than trusting govern.sh's returned path, so if `audit-barrage`'s output convention changes the smoke silently asserts against the wrong tree; (2) `sort | tail -1` picks the lexically-last matching dir, which is the *new* run only if run-dir names sort chronologically and no concurrent/stale run for the same slug interferes.

Capture the value govern.sh already emits: `latest="$(GOVERN_DIFF_BASE=… bash "$GOVERN")"` and assert on that exact path. That tests the script's actual contract (its stdout) instead of reverse-engineering it from a hardcoded directory, and removes the `*-pluggable-lifecycle-providers` glob (another instance of the slug hardcoding from finding -01).

### AUDIT-20260604-27 — Headline deliverable — automatic `after_implement` firing — has no automated regression test

Finding-ID: AUDIT-20260604-27
Status:     acknowledged-2026-06-04 (auto-firing demonstrated live in run 20260604T233543076Z; full agent-harness automation is inherently manual — quickstart documents it; a cheap structural assertion on the compiled hook entry is a noted future add)
Severity:   medium
Surface:    scripts/smoke-governance-after-implement.sh:5-9 (comment) + the T009 hook wiring

The smoke's own header states it exercises `govern.sh` *directly* and that "Automatic hook firing (SC-001) is verified separately by the manual `/speckit-implement` run in quickstart.md." The primary thing this commit-range adds (T009: the `after_implement` hook in `extension.yml` + its compilation into `.specify/extensions.yml`) is therefore covered only by a manual run. The wiring path — extension.yml hook declaration → registry registration → spec-kit actually invoking the command after implement — is untested by any script that can be re-run.

This is a defensible scope cut (genuine hook-firing needs the spec-kit harness), but it leaves the diff's headline contract resting on a one-time manual walkthrough. If the hook shape regresses (see -06) or the registry registration drifts, nothing fails fast. At minimum, a smoke could assert the compiled `.specify/extensions.yml` contains a `deskwork-governance` entry under `hooks.after_implement` with `command: speckit.deskwork-governance.govern` — a cheap structural check that the wiring survives, short of driving the full harness.

### AUDIT-20260604-28 — Smoke `lanes >= 2` conflates "barrage ran" with "≥2 model CLIs authenticated"

Finding-ID: AUDIT-20260604-28
Status:     acknowledged-2026-06-04 (hand-run smoke; the ≥2-authenticated-CLI prerequisite is real — noted, not a governance defect; future smoke could assert on the lift signal instead of raw lane count)
Severity:   low
Surface:    scripts/smoke-governance-after-implement.sh:38-44

The smoke fails unless it finds `>= 2` non-empty lane `.md` files in the run-dir. But the number of populated lanes depends on how many of claude/codex/gemini are installed and authenticated in the environment running the smoke. A machine with only one configured CLI would produce a single non-empty lane and the smoke would report `SMOKE FAIL` even though `govern.sh` orchestrated correctly — the failure would be an environment gap, not a governance defect. Conversely, the assertion can't distinguish "two models genuinely audited" from "two models emitted an auth-error stub that happens to be non-empty."

For a hand-run, never-in-CI smoke this is a tolerable simplification, but the threshold encodes a hidden multi-CLI prerequisite that isn't stated as a precondition. Either document the "requires ≥2 authenticated audit CLIs" prerequisite at the top alongside the run instructions, or assert on a govern.sh-level success signal (e.g. the lift verb appended findings) rather than a raw lane count that proxies environment state.

## 2026-06-04 — audit-barrage lift (20260604T233543076Z-pluggable-lifecycle-providers)

### AUDIT-20260604-29 — Smoke leaves `RUNS_DIR` defined but unused after dropping all three glob/delta call sites

Finding-ID: AUDIT-20260604-29
Status:     fixed-f3dc5751 (RUNS_DIR now consumed by the restored freshness check)
Severity:   low
Surface:    scripts/smoke-governance-after-implement.sh:15 (`RUNS_DIR=…`) vs. the deleted lines 24-35

The commit removed every consumer of `$RUNS_DIR`: `before_runs` (old line 24), `after_runs` (old line 31), and the `find "$RUNS_DIR" … -name '*-pluggable-lifecycle-providers'` glob (old line 35). Per finding -26's own surface citation, `RUNS_DIR` is assigned at line 15. With all three readers deleted, that assignment is now dead code — a hardcoded path to govern.sh's internal output directory that nothing reads.

This is the exact coupling -26 set out to remove (the smoke hardcoding the verb's internal `audit-runs` tree), but the *variable* survived the surgery even though its *uses* were excised. Leaving it in re-introduces the smell: a future reader assumes `RUNS_DIR` is load-bearing and the smoke still "knows" govern.sh's internal layout. Delete the `RUNS_DIR=` line so the smoke depends only on govern.sh's stdout contract, matching the commit's stated intent.

### AUDIT-20260604-30 — `feature/` (or any empty trailing segment) silently produces an empty slug — the wrong-target failure the FATAL branch was added to prevent

Finding-ID: AUDIT-20260604-30
Status:     fixed-f3dc5751 (post-derivation `[ -n "$SLUG" ]` guard added; `feature/` → FATAL, verified by logic test)
Severity:   medium
Surface:    plugins/dw-lifecycle/spec-kit/deskwork-governance/scripts/bash/govern.sh:24-33 (the `case` block)

The new derivation's whole point (per the inline comment: "no silent wrong-target — constitution V") is to fail loudly when the slug can't be resolved. But the `case "${_branch}" in feature/*)` pattern matches a branch named exactly `feature/` — in shell `case`, `*` matches the empty string, so `feature/` matches `feature/*`. The body then computes `SLUG="${_branch#feature/}"`, which is the empty string. There is no `[ -n "$SLUG" ]` guard, so execution continues with `SLUG=""`, yielding `FEATURE_DOCS="docs/1.0/001-IN-PROGRESS/"` and `AUDIT_LOG="docs/1.0/001-IN-PROGRESS/audit-log.md"` — pointing the barrage at the *parent* directory, not a feature.

This is precisely the silent-wrong-target the explicit `*) … exit 2` arm exists to stop, but it leaks through the matched arm rather than the unmatched one. The same hole applies to any future convention where a feature could have a trailing-slash branch. Fix: after computing `SLUG`, assert non-empty and fall into the same FATAL path — e.g. `feature/?*) SLUG="${_branch#feature/}" ;;` (requiring at least one char after the slash) plus a post-assignment `[ -n "$SLUG" ] || { echo "…FATAL…"; exit 2; }`.

### AUDIT-20260604-31 — Capturing govern.sh's stdout suppresses live progress of a billable multi-second multi-model barrage

Finding-ID: AUDIT-20260604-31
Status:     acknowledged-2026-06-04 (govern.sh routes progress to stderr; the smoke captures only stdout, so live progress remains visible — premise partially inaccurate; tee-to-stderr is a noted minor refinement)
Severity:   low
Surface:    scripts/smoke-governance-after-implement.sh:28-30 (`out="$(… bash "$GOVERN")"`)

The prior smoke ran govern.sh with stdout flowing to the terminal, so a hand-running operator saw the barrage's progress as it fired claude/codex/gemini lanes (govern.sh:60 — real, billable, multi-second API calls). The rewrite wraps the whole invocation in `out="$(…)"`, which buffers *all* of govern.sh's stdout until the process exits. During the (potentially long) barrage the operator now sees nothing on stdout and cannot distinguish "running" from "hung."

For a never-in-CI, hand-run smoke whose explicit purpose is operator-driven verification of a heavyweight operation, losing live feedback is a real UX regression even though the assertion logic is improved. If govern.sh emits its progress on stderr this is moot — but the commit doesn't establish that, and the run-dir is on stdout per -26, so at least some operator-relevant output is now swallowed. Consider `tee`-ing to stderr (`out="$(… bash "$GOVERN" | tee /dev/stderr)"`) or having govern.sh route progress to stderr and reserve stdout solely for the run-dir, so capture and visibility coexist.

### AUDIT-20260604-32 — Smoke dropped the "a NEW run-dir was created" assertion; it now passes if govern.sh echoes a stale/pre-existing directory

Finding-ID: AUDIT-20260604-32
Status:     fixed-f3dc5751 (freshness restored: snapshot run-dirs before, assert the echoed dir is not in the before-set — without reintroducing the glob)
Severity:   medium
Surface:    scripts/smoke-governance-after-implement.sh:24-35 (deleted `before_runs`/`after_runs` delta) → 30-32 (new `[ -d "$latest" ]`)

The old smoke proved freshness: `after_runs -gt before_runs` asserted that running govern.sh *created* a new run-dir. The rewrite replaces that with `[ -n "$latest" ] && [ -d "$latest" ]` — it only checks that the path govern.sh printed *exists*. It no longer verifies the run is new. If a regression made govern.sh short-circuit and echo a previously-created run-dir without firing a fresh barrage, the directory would still exist and the smoke would report SMOKE PASS.

Finding -26 correctly criticized re-deriving the run-dir by globbing, and trusting govern.sh's stdout is the right call. But the novelty check was a *separate* contract from the path-derivation, and it was discarded along with the glob. The smoke's headline purpose is to prove the after-implement governance actually ran; "the printed path is a directory" is weaker than "govern.sh produced a directory that didn't exist before this invocation." Restore a freshness signal that doesn't reintroduce the glob — e.g. assert the run-dir's mtime is newer than the invocation start, or that it contains freshly-written lane files (the `lanes >= 2` check at :38-44 partially covers this but counts content, not recency).

### AUDIT-20260604-33 — `git branch --show-current` is git ≥2.22; on older git the FATAL message misattributes the cause

Finding-ID: AUDIT-20260604-33
Status:     acknowledged-2026-06-04 (git ≥2.22 is ubiquitous and the script fails loudly; `symbolic-ref --short HEAD` fallback for clearer old-git messaging is a noted low-priority refinement)
Severity:   low
Surface:    plugins/dw-lifecycle/spec-kit/deskwork-governance/scripts/bash/govern.sh:25 (`git branch --show-current 2>/dev/null || true`)

`git branch --show-current` was introduced in git 2.22 (2019). On an older git the subcommand errors; `2>/dev/null || true` swallows it and leaves `_branch` empty, so even on a legitimately-checked-out `feature/<slug>` branch the script hits the `*)` arm and dies with "cannot derive feature slug from branch '' (expected 'feature/<slug>')." The diagnostic blames the branch name when the real cause is the git version — a misleading error that would cost an adopter on an old toolchain real debugging time.

Severity is low because modern environments overwhelmingly satisfy 2.22+, and the script does fail loudly rather than guessing. But since the surrounding comment emphasizes loud, correct failure, the message should be accurate: either add a `command -v git` / version probe, or fall back to `git symbolic-ref --short HEAD` (available far earlier) before declaring the branch underivable, so the FATAL text only fires for an actually-undefined branch (detached HEAD), not for a tooling gap.
