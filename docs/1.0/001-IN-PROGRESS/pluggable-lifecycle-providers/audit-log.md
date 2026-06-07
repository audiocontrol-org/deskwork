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

## 2026-06-05 — audit-barrage lift (20260605T182226949Z-pluggable-lifecycle-providers)

### AUDIT-20260605-01 — Audit diff omits `execute-check.ts` and two governance test files that the included code depends on

Finding-ID: AUDIT-20260605-01 (claude-01 + claude-04 + codex-01 + codex-02; cross-model)
Status:     fixed-ad694abb (govern.sh now folds untracked-but-not-ignored files into the audited diff via `git diff --no-index`, no index mutation; untracked-capture mechanism verified. The audited code was already correct — 16 tests green — so this closes the harness coverage gap, not a code defect. The real after_implement flow commits before governing, so the gap only bit the manual smoke.)
Severity:   blocking
Surface:    `plugins/stack-control/src/cli.ts:12,18` (import + registration of a file absent from the diff); missing surfaces `plugins/stack-control/src/subcommands/execute-check.ts`, `src/__tests__/execute-check.test.ts`, `src/__tests__/governance-seam.test.ts`, `src/__tests__/governance-neutrality.test.ts`

The `cli.ts` shown in the diff does `import { runExecuteCheck } from './subcommands/execute-check.js'` and registers `'execute-check': runExecuteCheck` in `SUBCOMMANDS`, but `execute-check.ts` is **not in the diff handed to this audit** — it was untracked at session start (`?? …/execute-check.ts`) and the diff generator (`git diff HEAD~1`, which excludes untracked files) dropped it along with `execute-check.test.ts`, `governance-seam.test.ts`, and `governance-neutrality.test.ts`. An auditor reading only the supplied diff sees a dangling import to a module that does not exist and would reasonably conclude the dispatcher cannot load (it would `throw` at module resolution, breaking even `stackctl version`). I verified against the working tree: the file does exist on disk, all 16 tests pass, and the suite is green — so the *code* is fine. The finding is about the **governance harness this feature is building**: its diff-gathering step silently excludes new/untracked files, so the cross-model barrage cannot review the `execute-check` verb logic, the cross-plugin seam test, or the neutrality test at all — exactly the surfaces most worth auditing this commit. There was also a real staging hazard: at session start `cli.ts` was modified (`M`) while `execute-check.ts` was untracked (`??`); committing `cli.ts` without `git add`-ing `execute-check.ts` would have produced a checkout that fails to run. That window is now closed (both are staged `A`/`M`), but the harness gap that would let it ship un-audited remains. A reasonable fix: have `govern.sh` gather the diff with `git diff HEAD --` plus untracked-but-relevant files (`git status --porcelain` / `git add -N` before diffing), so staged-and-untracked work is in the audited surface.

---

### AUDIT-20260605-02 — `govern.sh` slug-derivation precedes the dw-lifecycle PATH check, coupling the seam test to the current git branch

Finding-ID: AUDIT-20260605-02
Status:     fixed-ad694abb (governance-seam.test.ts now pins GOVERN_FEATURE_SLUG in the spawn env, so slug derivation short-circuits the branch and the seam assertion reaches the dw-lifecycle PATH check on any branch / detached HEAD; verified the pinned-slug path FATALs on dw-lifecycle absent.)
Severity:   medium
Surface:    `plugins/stack-control/src/__tests__/governance-seam.test.ts:38-43` against `…/govern.sh:24-33` (slug derivation) → `:47-48` (dw-lifecycle check)

The seam test asserts `r.status` is non-zero **and** that output matches `/dw-lifecycle\b.*not on PATH/i`. But in `govern.sh` the feature-slug derivation (lines 24-33, the `case "${_branch}" in feature/*)` block) runs *before* the `command -v dw-lifecycle` check (line 47). The test passes today only because the worktree's branch is `feature/pluggable-lifecycle-providers`, so derivation succeeds and execution reaches the PATH check. Run the same test from a detached HEAD (the normal state of a CI `actions/checkout` at a tag/SHA) or any non-`feature/<slug>` branch, and `git branch --show-current` returns empty → the `*)` FATAL arm fires `exit 2` at slug derivation, *before* the dw-lifecycle check is ever reached. The status assertion (`not 0`) still passes, but the content assertion (`/dw-lifecycle.*not on PATH/`) fails — the test would report a false RED that has nothing to do with the seam it claims to guard. The test passes `{ ...process.env, PATH: STRIPPED_PATH }` but does not pin `GOVERN_FEATURE_SLUG`. Fix: set `GOVERN_FEATURE_SLUG` in the test's env (the override the SKILL.md docs now advertise) so the seam assertion is decoupled from the ambient branch and tests the dependency-absent path it names.

---

### AUDIT-20260605-03 — Tests hardcode the repo-root-hoisted `tsx` path while `bin/stackctl` robustly walks up — fragile + cryptic on a nested install

Finding-ID: AUDIT-20260605-03
Status:     fixed-ad694abb (extracted src/__tests__/_run-helpers.ts whose resolveTsx() walks up from the plugin root exactly like bin/stackctl's find_tsx; cli/version/execute-check tests now use it, so tests and shim agree on tsx location whether hoisted or nested plugin-local.)
Severity:   low
Surface:    `plugins/stack-control/src/__tests__/cli.test.ts:8`, `src/__tests__/version.test.ts:9` (`resolve(here,'..','..','..','..','node_modules','.bin','tsx')`)

Both test files resolve `tsx` to a fixed four-levels-up path (`<repo-root>/node_modules/.bin/tsx`), assuming npm hoists `tsx` to the monorepo root. `bin/stackctl` deliberately does *not* make that assumption — its `find_tsx()` walks up from `PLUGIN_ROOT` precisely because `tsx` may resolve from an ancestor *or* from the plugin's own `node_modules`. The package-lock churn in this very diff shows `plugins/stack-control/node_modules/` getting populated (vitest, vite, esbuild platform binaries landed plugin-local, not hoisted), which demonstrates npm *does* nest deps for this workspace when versions diverge. If `tsx` ever nests the same way, the hardcoded test path points at a non-existent binary; `spawnSync` then returns `{ status: null, error: ENOENT }` and every assertion fails with an opaque "expected null to be 2" rather than a clear "tsx not found." Reuse the same walk-up resolution the shim already implements (or resolve `tsx` via `require.resolve`/`import.meta.resolve`) so the tests and the shim agree on dependency location.

---

### AUDIT-20260605-04 — No plugin-level `README.md` for `stack-control`, though the marketplace entry and project conventions point adopters at one

Finding-ID: AUDIT-20260605-04
Status:     acknowledged-2026-06-05 (already scoped: the plugin README is task T032 in the Polish phase of tasks.md — beyond the US1 MVP the operator scoped this session. Tracked, not silent drift.)
Severity:   low
Surface:    `plugins/stack-control/` (no `README.md`); `.claude-plugin/marketplace.json:44-54` (new entry)

The diff registers `stack-control` in the marketplace and creates `plugin.json`, `package.json`, `bin/`, `src/`, but adds no `plugins/stack-control/README.md`. The project's own conventions make the plugin README the canonical adopter surface — `.claude/CLAUDE.md`: *"follow each plugin's own README … that's the canonical adopter-facing install path"* — and the "Add a New Plugin" playbook lists README as step 3. The README that *was* moved into this plugin tree (`spec-kit/deskwork-governance/README.md`) documents the governance extension, not the plugin. This is a scaffold gap, not a bug, and may be planned for a later phase — but the marketplace entry is now live pointing at a plugin with no top-level README, so flagging it so the omission is a tracked decision rather than a silent drift.

---

### AUDIT-20260605-05 — `plugin.json` and `marketplace.json` descriptions have diverged

Finding-ID: AUDIT-20260605-05
Status:     acknowledged-2026-06-05 (informational, not a defect: plugin.json carries the fuller description and marketplace.json the shorter adopter-facing summary — distinct audiences, maintained separately by intent. Per `.claude/rules/documentation.md` the marketplace entry stays terse; no auto-derivation warranted.)
Severity:   informational
Surface:    `plugins/stack-control/.claude-plugin/plugin.json:4` vs `.claude-plugin/marketplace.json:53`

The two manifests describe the same plugin with non-identical strings — `plugin.json` ends *"Successor to dw-lifecycle (absorb-then-retire)."* while the marketplace entry ends *"Successor to dw-lifecycle."* (and the lead clauses differ in wording too). `bump-version.ts` keeps the *versions* in lockstep but does nothing for description text, so these will keep drifting independently. Not a defect — just a note that two copies of the same prose will diverge over time; if one is meant to be canonical, derive the other or accept that they're maintained separately.

## 2026-06-05 — audit-barrage lift (20260605T183438233Z-pluggable-lifecycle-providers)

### AUDIT-20260605-06 — Repo-wide untracked-file folding in `govern.sh` is unbounded and ships arbitrary untracked content to external model CLIs

Finding-ID: AUDIT-20260605-06
Status:     fixed-5833f356 (untracked-fold now bounded: --exclude-standard already drops gitignored paths incl. audit-runs; additionally skips binary/empty files and caps total folded bytes at 256KB, logging any drop to stderr — no silent truncation, no off-box binary content. Binary-skip verified. Residual: untracked text files in the dirty tree are still folded by design; the real after_implement flow commits first.)
Severity:   medium
Surface:    `plugins/stack-control/spec-kit/deskwork-governance/scripts/bash/govern.sh:56-66` (the untracked-folding loop added by AUDIT-20260605-01's fix)

The fix for AUDIT-20260605-01 folds untracked files into the audited diff via `git ls-files --others --exclude-standard`. That command is **repo-wide and unscoped** — it enumerates every untracked-not-ignored file anywhere in the working tree, not just the feature's surfaces. The tracked half of the context is commit-scoped (`git diff "${BASE}"`), but the untracked half is not bounded by `BASE`, by the feature slug, or by any path filter. Whatever a developer happens to have lying around untracked (scratch notes, an unrelated half-built module in another plugin, a prior governance run's output if `.dw-lifecycle/scope-discovery/audit-runs/` is not gitignored) is concatenated into `DIFF`.

This matters more than diff-noise because `DIFF` is the payload `audit-barrage` ships to multiple **external** LLM CLIs in parallel. So the consequence of the fix is that arbitrary untracked working-tree content gets transmitted off-box to third-party model providers on every govern run — content the operator never staged and may not realize is in scope. It also risks ballooning the diff (untracked binaries render as `git diff --no-index` "Binary files differ" or, worse, full content) and slows the loop (one `git diff --no-index` subprocess per untracked file). A tighter fix scopes the untracked enumeration to the feature/spec paths under audit (e.g. `git ls-files --others --exclude-standard -- "${pathspec}"`), or at minimum excludes the audit-runs output dir and skips binary files, so the audited surface matches the feature rather than the entire dirty tree.

### AUDIT-20260605-07 — `execute` skill step 1 has no fail-loud path when neither an argument nor the `CLAUDE.md` SPECKIT marker resolves a spec dir

Finding-ID: AUDIT-20260605-07
Status:     fixed-5833f356 (execute SKILL.md step 1 now has a STOP-don't-guess branch: if neither an argument nor the CLAUDE.md marker resolves a spec dir, the skill stops and reports rather than guessing — mirrors step 2's fail-loud STOP.)
Severity:   low
Surface:    `plugins/stack-control/skills/execute/SKILL.md:30` (Step 1, "Resolve the target spec dir")

Step 1 says: use the arg if given, else resolve from the `<!-- SPECKIT START -->…<!-- SPECKIT END -->` marker in `CLAUDE.md`, then "State which spec dir you resolved before proceeding." It specifies no behavior for the case where **neither** resolves — no argument passed and the marker is absent, empty, or points at a stale/nonexistent `specs/<feature>/plan.md`. Every other branch of this skill is explicitly fail-loud (Step 2 STOP + verbatim stderr, Step 4 "if the hook does not fire, that is a failure to surface — not something to work around," the Postcondition "never a faked or partial run"), so the silent gap at the very first step is inconsistent with the discipline the rest of the skill enforces.

The risk is that an agent with no resolvable spec dir proceeds to Step 2 with an empty or guessed path, which then either trips `execute-check`'s "not found" error (acceptable but with a confusing surface) or — if it guesses an unrelated extant dir containing a `tasks.md` — fabricates a runnable verdict against the wrong spec. A one-line addition closes it: "If neither an argument nor the marker resolves a spec dir, STOP and report that no spec dir could be resolved — do not guess." This mirrors the spec-not-runnable STOP already in Step 2.

---

Everything else I checked came back clean for specific reasons: `cli.ts` dispatch handles unknown/empty/`--help` verbs with correct exit codes and is `noUncheckedIndexedAccess`-safe (`process.argv[2]` and `SUBCOMMANDS[verb]` are both undefined-guarded); `execute-check.ts`'s `parseSpecFlag` correctly rejects a missing or `--`-prefixed value and `process.exit` narrows the type so there's no `any`/`as`; `version.ts` resolves `plugin.json` two levels up correctly and fails loud on a missing/empty version field; the `bin/stackctl` resolution order, workspace-dev detection, version-keyed sentinel, and `--omit=dev --workspaces=false` install are internally consistent with the shim's stated contract; the neutrality test's provider regex genuinely matches a planted control and `govern.sh`/the command body carry zero provider-identity strings; and `bump-version.ts` + `marketplace.json` correctly add the new plugin to the lockstep sweep.

### AUDIT-20260605-08 — `stackctl execute-check` accepts files as spec directories

Finding-ID: AUDIT-20260605-08
Status:     fixed-5833f356 (execute-check now statSync().isDirectory()-checks the spec path and fails with a directory-specific error before the tasks.md check; regression test added — --spec at a file exits non-zero with "not a directory".)
Severity:   low
Surface:    `plugins/stack-control/src/subcommands/execute-check.ts:29-41`

`execute-check` validates `existsSync(specDir)` but never verifies that the path is actually a directory. If `--spec` points at an existing file, the code proceeds to check `<file>/tasks.md` and reports `tasks.md missing; spec not runnable`, which misdiagnoses the operator error. The skill contract says `--spec <dir>` and the absent-spec case already has a distinct fatal path; this should use `statSync(specDir).isDirectory()` or equivalent and fail with a directory-specific error before checking `tasks.md`.

### AUDIT-20260605-09 — `execute-check` silently ignores unknown flags

Finding-ID: AUDIT-20260605-09
Status:     fixed-5833f356 (execute-check now parses args strictly — accepts only --spec <value>, rejects unknown flags and stray positionals with exit 2; regression tests added for both. Honors the dispatcher's "no flag silently ignored" contract.)
Severity:   low
Surface:    `plugins/stack-control/src/subcommands/execute-check.ts:15-20`, `plugins/stack-control/src/cli.ts:8`

The dispatcher comment says “no flag silently ignored”, with each subcommand validating its own flags. `execute-check` only searches for the first `--spec` and accepts everything else, so `stackctl execute-check --spec specs/foo --bogus` can still exit `0`. That weakens the front-door gate because typos in future or documented flags are treated as success. A reasonable fix is to parse `args` strictly: accept only `--spec <value>`, reject unknown flags or extra positionals with exit `2`, and cover that in `execute-check.test.ts`.

## 2026-06-05 — audit-barrage lift (20260605T234757995Z-pluggable-lifecycle-providers)

### AUDIT-20260605-10 — README spec-check row says "exit 0" but the verb fails loud (exit 1), contradicting the same diff's extend skill

Finding-ID: AUDIT-20260605-10
Status:     fixed-659bef47 (README spec-check row now qualifies exit semantics like the execute-check row: "exit 0 when it can report; exit !=0 (fail-loud) on a missing/unknown flag, an absent dir, or a non-directory" — matches the extend skill's dependency on the fail-loud path. Doc fix; no test per #392.)
Severity:   low
Surface:    `plugins/stack-control/README.md:52` (the `spec-check` verb row) vs. `plugins/stack-control/src/subcommands/spec-check.ts:48-55` and `plugins/stack-control/skills/extend/SKILL.md:24`

The README's `stackctl` verb table describes `spec-check` as: *"Report a spec's authoring state as a machine-readable line (`spec=yes plan=yes tasks=no`), **exit 0**. Read-only; never gates."* The unqualified "exit 0" is wrong: `spec-check.ts` exits `1` on an absent dir (`spec dir … not found`) and on a file-masquerading-as-dir (`… is not a directory`), and exits `2` on a missing/unknown flag. The `execute-check` row directly above it correctly writes *"otherwise exit ≠0 naming the missing artifact,"* so the asymmetry reads as if `spec-check` never fails — which is the opposite of its design comment (`spec-check.ts:11-12`: *"Fail-loud only on the inputs that make a report impossible"*).

This is an internal contradiction *within this diff*: `extend/SKILL.md:24` instructs the agent *"If the spec dir does not exist, `spec-check` fails loud with a descriptive error. STOP and surface it verbatim,"* which depends on the exact exit-1 behavior the README denies. An agent or adopter reading the README table could reasonably assume `spec-check` always exits 0 and skip handling the fail-loud path. Fix: qualify the row like the `execute-check` row — *"exit 0 when it can report; exit ≠0 (fail-loud) on a missing flag / absent dir / non-directory."*

### AUDIT-20260605-11 — define SKILL.md tells the agent to run `spec-check --spec <spec-dir>` (step 3) before step 4 resolves the spec dir

Finding-ID: AUDIT-20260605-11
Status:     fixed-659bef47 (define SKILL.md reordered: the spec dir is resolved-and-stated immediately after /speckit-specify creates it (now step 3, via the CLAUDE.md marker / TF-09), then referenced by the spec-check confirmation (now step 4) — matching extend's resolve-then-report ordering. Doc fix; no test per #392.)
Severity:   low
Surface:    `plugins/stack-control/skills/define/SKILL.md:28-40` (Steps 3 and 4)

The numbered procedure is ordered so the placeholder is used before it is defined. Step 3 ("Confirm artifact state as it advances") instructs the agent to run `stackctl spec-check --spec <spec-dir>` "after each authoring step," but `<spec-dir>` is not resolved until Step 4 ("Resolve the spec dir … State which spec dir you created"), which explains that on this program's long-lived branch the dir is resolved via the `<!-- SPECKIT START -->…<!-- SPECKIT END -->` marker in `CLAUDE.md` rather than the branch name (TF-09). The `extend` skill gets this right — its Step 1 resolves *and reports* the dir before any `spec-check` call.

An agent following `define` sequentially reaches the first `spec-check` invocation without having been told how to determine `<spec-dir>` on a branch Spec Kit's `check-prerequisites.sh` rejects, and may guess or stall. The fix is to reorder: make "resolve the spec dir (via the marker)" the step that immediately follows `/speckit-specify` creating it, and have the `spec-check` confirmation step reference the already-resolved dir — matching `extend/SKILL.md`'s ordering.

### AUDIT-20260605-12 — govern.sh untracked-fold uses `break` on budget-exceed, dropping later small feature files because an unrelated large file sorts first

Finding-ID: AUDIT-20260605-12 (claude-03 + codex-01; cross-model)
Status:     fixed-659bef47 (govern.sh untracked-fold now uses `continue` not `break`: an over-budget file is skipped without incrementing the budget so smaller later-sorting files are still folded; the per-file skip is logged (no silent cap). Secondary point acknowledged in-comment: the byte budget is a soft bound (the folded diff output exceeds raw file size), not a hard on-the-wire ceiling. RED-first regression smoke scripts/smoke-govern-untracked-fold.sh drives the real govern.sh (watched fail against `break`, green against `continue`); installed copy re-synced.)
Severity:   medium
Surface:    `.specify/extensions/deskwork-governance/scripts/bash/govern.sh:80-84` (and the mirrored install copy under `plugins/stack-control/spec-kit/deskwork-governance/`)

This is not a re-litigation of the AUDIT-06 cap (the 256KB budget + binary-skip + stderr logging are the accepted residual) — it flags one mechanism choice inside that cap. When `_folded_bytes + _sz` exceeds `UNTRACKED_FOLD_BUDGET`, the loop `break`s, abandoning *all remaining* untracked files. Because `git ls-files --others --exclude-standard` emits paths in sorted order, a single large untracked file early in the sort (e.g. a scratch log under `a-scratch.txt`) suppresses folding of the feature's actual new source/test files that sort later (`plugins/stack-control/...`, `specs/...`) — exactly the surfaces the fold exists to audit on a dirty manual run.

A `continue` (skip only the oversized file, keep packing smaller ones — `_folded_bytes` isn't incremented for the skipped file, so later small files still fit) would preserve coverage of the relevant files while still honoring the cap and logging the per-file skip. The drop is logged (no silent cap), and the real `after_implement` flow commits first so this only bites manual govern-on-dirty-tree runs, hence informational — but `continue` is the strictly-better shape for the stated goal of "audit the newly-added work." Separately, the budget accounts the raw file byte count (`wc -c`) while folding the larger `git diff --no-index` output (per-line `+` prefixes + headers), so the actual off-box payload runs modestly above the stated 256KB — worth a one-line acknowledgment if the cap is meant as a hard transmission ceiling.

## 2026-06-07 — audit-barrage lift (20260607T000706704Z-pluggable-lifecycle-providers)

### AUDIT-20260607-01 — "HIGH" / "MEDIUM" are overloaded across two orthogonal axes (confidence vs. severity), and the convergence gate is defined in the conflated terms

Finding-ID: AUDIT-20260607-01 (claude-01 + codex-01; cross-model)
Status:     fixed-1a2f258c (spec disambiguates confidence vs severity: the gate counts SEVERITY (blocking/high/medium) — matching the as-built checkBarrageDampener — and confidence is a separate annotation renamed cross-model-agreed | single-model. FR-003/FR-010/SC-002/SC-007 + Finding entity updated. No code change; the implementation already counts severity.)
Severity:   high
Surface:    FR-010, FR-003, the **Finding** key-entity, and the output-format severity scale

The spec uses "HIGH" to mean two different, independent things and then writes the load-bearing gate criterion in the ambiguous term. FR-003 and the **Finding** entity define HIGH as a **confidence** label: *"a confidence label (HIGH when cross-model agreement)."* The output-format section defines an orthogonal **severity** axis: `blocking | high | medium | low | informational`. FR-010 then states the convergence gate as *"0 HIGH and 0 MEDIUM findings"* / *"0 HIGH findings"* — but never says whether HIGH/MEDIUM here mean **confidence** or **severity**. These are not the same set: a finding can be HIGH-confidence (two models agree) but low-severity (a typo both flagged), or HIGH-severity but single-model (low confidence). "0 HIGH" is a different gate under each reading.

This matters because every downstream criterion inherits the ambiguity: SC-002 and SC-007 both say "HIGH-confidence," while the dw-lifecycle audit protocol being ported (FR-006) uses HIGH/MEDIUM **severity**. An implementer cannot build a machine-checkable gate (FR-010 claims it is "machine-checkable") without knowing which axis it counts. The fix is to pick one axis explicitly for the gate — almost certainly severity, to match the ported protocol — and rename the confidence label so the two never collide (e.g. confidence ∈ {cross-model-agreed, single-model}; severity ∈ {blocking…informational}; gate counts severity).

### AUDIT-20260607-02 — Single-model coverage makes the "0 HIGH" gate trivially pass if HIGH means cross-model agreement — directly weakening FR-008's "degraded but honest"

Finding-ID: AUDIT-20260607-02
Status:     fixed-1a2f258c (dissolved by AUDIT-01: because the gate counts SEVERITY not confidence, a single-model HIGH-severity finding still blocks — the single-model-auto-pass failure cannot occur. Edge case + FR-002 clarified.)
Severity:   high
Surface:    FR-010 vs. FR-003 / FR-008 / the "One model family available" edge case

This is the concrete failure that Finding-01's ambiguity produces. The "One model family available" edge case states: *"the barrage runs but cannot produce cross-model agreement … no finding can be labeled HIGH-confidence by agreement."* If FR-010's "0 HIGH" is read as HIGH-**confidence** (per FR-003), then in single-model mode **no finding can ever be HIGH by construction**, so "0 HIGH" is satisfied unconditionally on iteration one. A degraded, single-model run therefore **auto-passes the convergence gate immediately** — the spec graduates with whatever single-model findings exist, fully ungoverned by the gate.

That is precisely the silent-weakening FR-005/FR-008/US3 exist to prevent: FR-008 says reduced coverage *"must never be presented as full coverage,"* yet the gate would report "converged" for a run that structurally cannot meet the gate's intent. Either the gate must count **severity** (so single-model HIGH-severity findings still block), or the spec must state that the convergence gate cannot be satisfied under reduced coverage without a recorded override (FR-010's override path). As written, the two requirements contradict in the single-model case.

### AUDIT-20260607-03 — Two-consecutive-iteration path lets a spec graduate with open MEDIUM findings, and nothing requires those to be dispositioned

Finding-ID: AUDIT-20260607-03
Status:     fixed-1a2f258c (spec states the two-consecutive branch's 0-HIGH-only asymmetry is intentional — it is the ported protocol — and that open MEDIUMs at two-consecutive convergence are carried open per FR-007, never silently dropped or auto-accepted. FR-010/SC-007.)
Severity:   medium
Surface:    FR-010 (two convergence branches) and SC-007

FR-010's two branches are asymmetric: the single-iteration branch requires **0 HIGH and 0 MEDIUM**, but the two-consecutive branch requires only **0 HIGH** (MEDIUM unconstrained). SC-007 confirms the gate only guards HIGH: *"no spec graduates carrying open HIGH findings without a recorded override."* So a spec with persistent MEDIUM findings can graduate simply by running the barrage twice — patience bypasses the MEDIUM bar that the single-iteration path enforces. The spec never says what becomes of those still-open MEDIUM findings at graduation: are they auto-accepted, carried forward as open (FR-007), or do they require an explicit disposition?

This is a gameable gate and an unstated state-transition. If the asymmetry is intentional (it mirrors a real convergence protocol where a stable 0-HIGH signal across two passes is "good enough"), the spec should say explicitly that open MEDIUM findings at two-pass convergence are recorded as `acknowledged`/carried-open and never silently dropped — otherwise FR-007's "survives across revisions" and this graduation path conflict on what "open" means at the moment of graduation.

### AUDIT-20260607-04 — Cross-model non-determinism vs. "two consecutive iterations" — "consecutive" is undefined across spec mutations

Finding-ID: AUDIT-20260607-04
Status:     fixed-1a2f258c (spec defines an iteration as one recorded barrage run and "consecutive" as the last runs FOR THE SAME CHECKPOINT; an inter-iteration edit does not reset the count; two-consecutive-quiet is a stability heuristic, not a determinism proof; the FR-014 ceiling counts recorded runs. FR-010/FR-014.)
Severity:   medium
Surface:    FR-010 / FR-014 ("two consecutive iterations," "iteration") and the convergence-loop description

The barrage is explicitly non-deterministic — FR-002/FR-003 run *multiple model families in parallel for genetic diversity in failure modes*, and the whole point is that different models surface different findings. Yet FR-010 makes graduation depend on *"two consecutive iterations each produce 0 HIGH."* Two unresolved questions: (1) Are the two "consecutive" iterations over the **same** spec text or different text? The loop is "barrage → fix → re-barrage," which implies the spec changes between iterations — but then a fix that resolves the last HIGH produces a *new* spec, and a non-deterministic re-run could surface a *different* HIGH, so the count never stabilizes. (2) If they're over the same text (you stop editing and just re-run to confirm), a non-deterministic second pass can flip 0-HIGH back to 1-HIGH on identical input, making convergence luck-dependent.

The spec ports "the convergence criterion + finding state machine" from dw-lifecycle (FR-006) but does not port the precise definition of "iteration" and "consecutive" into the spec text, so an implementer has to invent it. Pin it down: does "consecutive" require the spec to be byte-identical between the two passes, and does an inter-iteration edit reset the consecutive counter? Without that, FR-014's bounded-termination guarantee is also undefined (you can't count toward a ceiling if you can't define an iteration boundary).

### AUDIT-20260607-05 — Dual checkpoints (after_clarify + after_plan): unspecified whether the gate/loop runs once or twice, and whether the iteration ceiling is per-checkpoint or global

Finding-ID: AUDIT-20260607-05 (claude-05 + claude-08 + codex-04; cross-model)
Status:     fixed-701fad25 (spec clarified @1a2f258c — independent per-checkpoint loops, FR-011/FR-013/FR-014 + Checkpoint entity — AND the code now enforces it: spec-governance-gate gains --checkpoint <name> (filters the audit-log to that checkpoint's runs before convergence + iteration counting; verdict carries checkpoint; no --checkpoint = global back-compat), and govern-spec.sh tags each barrage run-dir with its checkpoint and passes --checkpoint to the gate so a passed after_clarify gate is durable. RED-first gate-per-checkpoint.test.ts (3 cases) green; deterministic + live smokes pass.) landing this session, TDD-first. Will move to fixed-<sha> when the code lands; remains open until then.)
Severity:   medium
Surface:    FR-011, FR-013, FR-014, and the **Checkpoint** key-entity

FR-011 fires at `after_clarify` by default and is *"configurable to also fire `after_plan`."* FR-013 says the plan is covered only when `after_plan` is enabled. The **Checkpoint** entity allows *"one or more of after_specify / after_clarify / after_plan."* But the spec never resolves the interaction with the convergence loop (FR-010/FR-014): when both checkpoints are enabled, does the barrage-and-gate run as **two independent convergence loops** (one at after_clarify over the spec, a second at after_plan over the plan)? Is the FR-014 iteration ceiling **per-checkpoint or global** across both? Does a converged after_clarify gate get **re-opened** if after_plan surfaces new HIGH findings on the plan? Does the after_plan run re-audit the spec too, or only the plan (FR-013 says "also covers the plan," implying additive)?

These aren't hypothetical — an adopter who enables after_plan needs to know whether they're committing to potentially 2× the iteration budget and whether passing the first gate is durable. The spec should state the checkpoint composition model explicitly (independent loops with independent ceilings is the natural reading, but it's currently inferred, not specified).

### AUDIT-20260607-06 — SC-005's "one governance surface" may be precluded by the stack-control ↔ dw-lifecycle isolation rule

Finding-ID: AUDIT-20260607-06
Status:     fixed-d003312e (resolved by the multi/migrate-audit-barrage migration: governance is now a single in-stack-control store shared by both phases — no cross-plugin store, no dw-lifecycle coupling — so SC-005 one-surface is literally true. Spec SC-005/Assumptions/Dependencies updated 1a2f258c.)
Severity:   medium
Surface:    SC-005, FR-007, the "Findings home" assumption vs. FR-006 / the succession constraint

SC-005 promises *"Spec-phase findings and implementation-phase findings appear in the **same** format and triage workflow … one governance surface."* The Findings-home assumption operationalizes this as *"the existing audit-log-style durable store already used by the implementation-phase governance."* But implementation-phase governance currently lives in **dw-lifecycle** (FR-006: both barrage and protocol are *"composed in-house today (in dw-lifecycle)"*), while this feature is built in **stack-control** as a Spec Kit extension (FR-012). The project's settled succession rule requires the two plugins stay **decoupled** ("Keep dw-lifecycle working… do not make changes that couple them"). A literally-shared audit-log store across the two plugins is exactly the coupling that rule forbids.

So SC-005 as written ("the same … workflow," "one surface") is in tension with the isolation constraint: either the spec means a shared **format** (two stores, same schema, identical triage UX) — which it should say, because "one surface" overclaims — or it means a shared **store**, which the succession rule appears to preclude until `multi/migrate-audit-barrage` rehomes both into stack-control. Clarify whether SC-005 is a format-compatibility claim or a single-store claim; the former is achievable under isolation, the latter is not.

### AUDIT-20260607-07 — "All available families fail mid-run" (zero succeed) is not mapped to the same fail-loud guarantee as "none available at start"

Finding-ID: AUDIT-20260607-07
Status:     fixed-1a2f258c (spec adds the zero-healthy edge case: ALL configured families failing mid-run is an OUTAGE -> fail loud (FR-005), spec NOT recorded as governed, distinct from a clean zero-finding run. The safety property already holds at runtime — verified: deriveBarrageExitCode returns 1 on zero healthy, audit-barrage exits 1, and govern-spec.sh aborts under set -e before the lift, so an all-fail run is never scored converged. A clearer govern-spec.sh outage message lands with the AUDIT-05 code commit.)
Severity:   low
Surface:    The "model family times out or errors mid-run" edge case vs. US3 / FR-005

US3 and FR-005 guarantee fail-loud when *"no audit capability is available."* The mid-run edge case covers partial failure: *"does not abort the whole barrage if at least one family succeeded."* The complement — **every** family was available at start but **all** errored/timed out mid-run (zero successes) — is left implicit. Read literally, "does not abort if at least one succeeded" implies it *does* abort when zero succeed, but the spec never says that zero-success path inherits the FR-005 fail-loud contract (actionable message, spec NOT recorded as governed). It could instead be (mis)implemented as "recorded a run with zero coverage," which would satisfy FR-009's "a run is recorded even with zero findings" while silently producing an ungoverned spec — the exact false-assurance US3 forbids.

Add an explicit edge case: "all available families fail at runtime → treat identically to no-capability-available (fail loud, FR-005), not as a clean zero-finding run (FR-009)." The distinction between "zero findings because the spec is clean" and "zero findings because nothing ran" is the safety-critical one.

### AUDIT-20260607-08 — Degraded one-model mode contradicts the multiple-family requirement

Finding-ID: AUDIT-20260607-08
Status:     fixed-1a2f258c (FR-002 softened: the barrage MUST attempt all configured families in parallel; a run with >=1 healthy family is a valid, successful audit recorded with honest reduced coverage (FR-008); one healthy family is the floor. Matches the as-built barrage + the 2026-06-01 "1 healthy model IS a successful audit" directive. No code change.)
Severity:   medium
Surface:    specs/004-spec-governance/spec.md:72-80, specs/004-spec-governance/spec.md:90-97

FR-002 says the barrage MUST run multiple model families in parallel. But the edge cases explicitly allow one model family to run, and US3 allows “some but not all” model families to proceed with reduced coverage. The spec never defines the minimum quorum that separates “available audit capability” from “no usable barrage.”

This matters because one-family mode cannot satisfy the stated reason for the feature: cross-model agreement and genetic diversity. If one family is acceptable, FR-002 should be softened to “attempt configured model families and record coverage,” with a clear minimum of one. If multiple families are mandatory, the one-family edge case should fail loud as insufficient coverage.

### AUDIT-20260607-09 — Dependencies reopen the front-door-only path that FR-012 forbids

Finding-ID: AUDIT-20260607-09
Status:     fixed-1a2f258c (FR-012 + Dependencies narrowed: the Spec Kit hook mechanism is the MANDATORY delivery surface; the front-door define/extend skills are callers that benefit from the universal hook, never an alternative path. The implementation is the hook (extension.yml).)
Severity:   medium
Surface:    specs/004-spec-governance/spec.md:100-101, specs/004-spec-governance/spec.md:138-139

FR-012 is explicit that spec-governance MUST be delivered as a Spec Kit governance extension with hooks and MUST NOT be folded into the front-door skills only. The dependency section weakens that by saying the delivery surface is “the Spec Kit extension/hook mechanism and/or the front-door define/extend skills.”

That “and/or” creates an implementation escape hatch where front-door skills alone could be treated as satisfying the delivery dependency, even though raw `/speckit-*` commands would bypass governance. The dependency should be narrowed to the hook mechanism as mandatory, with front-door skills listed only as callers that benefit from the universal hook.

## 2026-06-07 — audit-barrage lift (20260607T001123519Z-pluggable-lifecycle-providers)

### AUDIT-20260607-10 — Cross-plugin deep import into `dw-lifecycle/src/` contradicts the README's "public verbs / isolation" claim and the succession rule

Finding-ID: AUDIT-20260607-10 (claude-01 + claude-02 + claude-06 + codex-01 + codex-02; cross-model)
Status:     fixed-d003312e (FULLY RESOLVED by the multi/migrate-audit-barrage migration, superseding the earlier doc-only fix-e8fa3139: the deep import into dw-lifecycle/src/ is GONE — the convergence criterion + feature-root resolver are vendored in-package and the gate imports them from stack-control's own scope-discovery/ tree. No import of, shell-out to, or requires on dw-lifecycle remains. The source-colocation invariant the finding warned about no longer exists. Operator directive: dw-lifecycle is not an allowed dependency.)
Severity:   high
Surface:    plugins/stack-control/src/subcommands/spec-governance-gate.ts:21-23 (the two `../../../dw-lifecycle/src/...` imports) vs. plugins/stack-control/spec-kit/spec-governance/README.md:60-66 (Isolation section)

The gate reaches directly into dw-lifecycle's internal source tree by relative path: `import { checkBarrageDampener } from '../../../dw-lifecycle/src/scope-discovery/promote-findings/check-barrage-dampener.js'` and `import { resolveFeatureRoot } from '../../../dw-lifecycle/src/scope-discovery/util/feature-root.js'`. These are *internal* modules (buried under `scope-discovery/promote-findings/` and `scope-discovery/util/`), not a published/public entry point. The README's Isolation section claims the gate "Composes dw-lifecycle's **public verbs** plus a read-only share of the `check-barrage-dampener` convergence logic — **no edits to dw-lifecycle internals**." Importing an un-exported internal file by deep relative path *is* coupling to internals — the README's "public verbs" framing is inaccurate, and `stack-control-succession.md` explicitly lists "Coupling `stack-control` to `dw-lifecycle` internals" as an anti-pattern to refuse. It also violates the project's `@/`-import guideline (CLAUDE.md) by crossing a plugin boundary with `../../../`.

The deeper risk is distribution: the extension manifest (`extension.yml:14-21`) only declares the dw-lifecycle **binary** as a required tool (`command -v dw-lifecycle` on PATH), but the gate's real runtime requirement is the dw-lifecycle **source tree** sitting at a fixed `plugins/dw-lifecycle/src/...` sibling path. Those are different guarantees: an adopter with the `dw-lifecycle` CLI installed but the two plugins not co-located under a shared `plugins/` root would pass `govern-spec.sh`'s `command -v` guard, run the lift (binary path) successfully, then have `stackctl spec-governance-gate` fail at module resolution. A reasonable fix is to make the shared criterion a genuinely exported surface (a package entry / a public `stackctl`-callable verb), declare the real dependency the manifest promises, and correct the README so it doesn't claim public-API isolation while importing internals — or explicitly document the source-colocation invariant as a hard requirement until `multi/migrate-audit-barrage` rehomes the code.

### AUDIT-20260607-11 — Stray unfilled Spec Kit plan template committed for an unrelated feature

Finding-ID: AUDIT-20260607-11
Status:     acknowledged-out-of-scope (NOT this feature's artifact: specs/002-parallel-execution-engine/plan.md was an untracked placeholder present at session start — `?? specs/002-parallel-execution-engine/plan.md` in the session-start git status — created by a prior session for feature 002 (impl/execution-engine), which is deferred behind the design block per stack-control-succession.md. It was deliberately EXCLUDED from every commit in this feature's range; the barrage flagged it only because govern.sh folds untracked files. Disposition is the operator's: fill it (if 002 planning resumes) or remove it. Not in scope for design/spec-governance and not committed by this work.)
Severity:   medium
Surface:    specs/002-parallel-execution-engine/plan.md (entire new file)

This new file is a raw, unfilled Spec Kit plan template — every field is still a placeholder: `# Implementation Plan: [FEATURE]`, `**Branch**: `[###-feature-name]` | **Date**: [DATE] | **Spec**: [link]`, `NEEDS CLARIFICATION` markers throughout the Technical Context, and `[REMOVE IF UNUSED] Option 1/2/3` scaffolding in the source-tree block. It carries no real content. It is also for feature **002** (parallel-execution-engine), which per `stack-control-succession.md` is "a later feature, not the founding one" — the audited range is entirely feature **004** commits.

Committing a placeholder-only template is exactly the operator-discipline trap the project guidelines call out (placeholder comments / unfilled scaffolding shipped as if it were work). At minimum it pollutes `specs/002-…` with a file that reads as "planning started" when nothing was planned, and the `[FEATURE]`/`[DATE]`/`NEEDS CLARIFICATION` strings will trip any later doctor/grep that scans for unfilled markers. If this was an accidental `git add` of a scaffolded template, it should be removed from this commit; if 002 planning is genuinely starting, the template should be filled (or left untracked) rather than committed empty.

### AUDIT-20260607-12 — New Vitest suites hard-depend on a globally-resolvable `dw-lifecycle` binary and will fail (not skip) when it is absent

Finding-ID: AUDIT-20260607-12
Status:     fixed-d003312e (SUPERSEDED by the multi/migrate-audit-barrage migration: the lift-composition tests no longer spawn the external dw-lifecycle binary — they compose stack-control's OWN audit-barrage-lift verb via the in-process stackctl dispatcher (runCli), the same pattern the gate suites use. There is no longer a hard dependency on a globally-resolvable dw-lifecycle bin; the original concern is dissolved.)
Severity:   medium
Surface:    plugins/stack-control/tests/spec-governance/cross-model-lift.test.ts (the `spawnSync('dw-lifecycle', …)` in `lift`), plugins/stack-control/tests/spec-governance/disposition-persistence.test.ts (same), and plugins/stack-control/vitest.config.ts:5 (the `tests/**/*.test.ts` include)

`vitest.config.ts` now collects `tests/**/*.test.ts` into the default run. Two of those suites invoke the dw-lifecycle CLI as an external process: `spawnSync('dw-lifecycle', ['audit-barrage-lift', …], { encoding: 'utf8' })`, then assert `expect(r.status).toBe(0)`. If `dw-lifecycle` is not on `PATH` — a fresh clone, a contributor who only built the `stack-control` workspace, or any environment where the dw-lifecycle bin isn't globally installed — `spawnSync` returns `status: null` (with `error: ENOENT`), so `expect(status).toBe(0)` fails rather than skips. `npm --workspace @stack-control test` would then go red for an environmental reason unrelated to the code under test.

This is a hidden environment coupling masquerading as a unit test: the suite's green/red depends on a binary it never declares as a prerequisite and never guards for. The gate-only suites (`gate.test.ts`, `gate-port-fidelity.test.ts`) avoid this by importing `checkBarrageDampener` directly and using the in-process `runCli`, which is the right pattern. The lift-composition tests should either resolve the dw-lifecycle entrypoint the same way production does (an explicit resolved path, not a bare PATH lookup) and skip-with-a-clear-message when it's genuinely unavailable, or assert against a faithful in-repo invocation rather than a global binary.

### AUDIT-20260607-13 — `extension.yml` hardcodes `version: "0.37.0"` — a lockstep-version rot vector unless wired into the atomic bump

Finding-ID: AUDIT-20260607-13
Status:     fixed-e8fa3139 (bump-version.ts now enumerates plugins/stack-control/spec-kit/spec-governance/extension.yml with a new `extension-yml` kind — a regex-anchored YAML field replace that touches ONLY the indented `extension.version` line, never schema_version / speckit_version (verified via a 0.99.0 dry-run, then reverted). A hook-wiring.test.ts assertion pins extension.version === stack-control plugin.json version, so any future bump that skips it is a red test, not silent rot. Note: the sibling deskwork-governance extension.yml has the same latent pattern (version 0.1.0, not wired) — pre-existing, out of this feature's scope; flagged for the operator.)
Severity:   low
Surface:    plugins/stack-control/spec-kit/spec-governance/extension.yml:6 vs. README.md:65 ("Versions are lockstep with the monorepo")

The new manifest pins `version: "0.37.0"` literally, and the README asserts versions are "lockstep with the monorepo." The repo's stated mechanism for that lockstep is `scripts/bump-version.ts` ("Atomic version bump across all manifests" per the layout doc). This new `extension.yml` is a brand-new manifest surface; if `bump-version.ts`'s manifest glob doesn't already include `plugins/stack-control/spec-kit/**/extension.yml`, the next release will bump every other manifest and leave this one frozen at `0.37.0` — silent version drift, the exact rot the `documentation.md` rule warns against (hardcoded versions that won't get bumped every release).

This isn't verifiable from the diff alone (the bump script isn't in range), so it's a low-severity flag rather than a confirmed defect: confirm `scripts/bump-version.ts` enumerates this file (add a test/assertion that the extension manifest's version equals the monorepo version), or drop the hardcoded version in favor of whatever the bump tooling injects. The same check applies to the `requires.speckit_version: ">=0.9.0"` floor, which is a different (external) version and is fine to pin.

### AUDIT-20260607-14 — An oversized spec can be silently excluded when a plan is present

Finding-ID: AUDIT-20260607-14
Status:     fixed-e8fa3139 (govern-spec.sh fold_artifact now returns distinct codes — 0 folded / 1 missing / 2 over-budget — and the SPEC fold is fatal (exit 2) when it cannot be included: the spec is the primary audit unit and is never silently dropped to a plan-only audit. GOVERN_PAYLOAD_BUDGET override added for testability; deterministic regression assertion in smoke-govern-spec-fail-loud.sh fires the script with a 5-byte budget and asserts exit 2 + actionable message.)
Severity:   medium
Surface:    plugins/stack-control/spec-kit/spec-governance/scripts/bash/govern-spec.sh:94-113

`fold_artifact` skips any artifact that would exceed the payload budget and returns success. The empty-payload guard only checks whether `DIFF` is non-empty after all folds. In `after_plan`, if the spec exceeds 256KB but the plan fits, the script audits only the plan and can still record/govern the run even though the required spec artifact was dropped.

The spec is the primary audit unit; skipping it should be fatal, not just a stderr note, especially when another artifact keeps the payload non-empty. Track whether the SPEC fold succeeded and exit 2 if it was absent or skipped.

### AUDIT-20260607-15 — A bad `GOVERN_PLAN_PATH` degrades after_plan to spec-only without failing

Finding-ID: AUDIT-20260607-15
Status:     fixed-e8fa3139 (govern-spec.sh now treats a set-but-unfoldable GOVERN_PLAN_PATH as fatal (exit 2): when after_plan requests the plan (FR-013), a missing/typo/over-budget plan path fails loud instead of silently degrading to a spec-only audit. Deterministic regression assertion in smoke-govern-spec-fail-loud.sh sets GOVERN_PLAN_PATH to a nonexistent file and asserts exit 2 + audit-log untouched.)
Severity:   medium
Surface:    plugins/stack-control/spec-kit/spec-governance/scripts/bash/govern-spec.sh:94-110

When `GOVERN_PLAN_PATH` is set, the command contract says the plan is folded alongside the spec. But `fold_artifact` returns 0 for any missing path, so a typo, stale plan path, or hook wiring bug produces a spec-only audit while the `after_plan` checkpoint appears to have run normally.

That weakens FR-013 because plan coverage becomes optional by accident. If `GOVERN_PLAN_PATH` is non-empty, the script should require that file to exist and be folded, with a fatal error when it cannot be included.

## 2026-06-07 — audit-barrage lift (20260607T033433112Z-pluggable-lifecycle-providers-after_clarify)

### AUDIT-20260607-16 — `after_specify` is a valid checkpoint in Key Entities but is wired by no FR — its artifact set is undefined

Finding-ID: AUDIT-20260607-16 (claude-01 + codex-02; cross-model)
Status:     fixed-8da8219c (after_specify is out of scope: only after_clarify + after_plan are wired checkpoints with defined artifact sets — FR-011 + Checkpoint entity narrowed.)
Severity:   medium
Surface:    spec.md FR-011 + FR-013 vs. Key Entities "Checkpoint (hook point)"

The **Checkpoint** entity states the barrage fires at "one or more of `after_specify` / `after_clarify` / `after_plan`," explicitly admitting `after_specify` as a selectable checkpoint. But FR-011 only wires two: `after_clarify` (mandatory default) and `after_plan` (configurable add-on), and describes `after_specify` purely as "intentionally NOT the default." FR-013 then defines artifact sets for only the spec (after_clarify) and the plan (after_plan) — `after_specify`'s artifact set is never specified. This is an internal contradiction: either `after_specify` is a supported-but-disabled checkpoint (in which case FR-011/FR-013 must define how it is enabled and what it audits) or it is not a checkpoint at all (in which case the Key Entities list should drop it). As written, an implementer reading the entity model would build a three-checkpoint surface while an implementer reading the FRs would build two. A reasonable fix: either delete `after_specify` from the Checkpoint entity, or add an FR clause that defines its enable path and artifact set (the spec-with-unresolved-placeholders), matching the FR-011 rationale for why it's off by default.

---

### AUDIT-20260607-17 — "Healthy family" is the load-bearing predicate for fail-loud vs. clean-run, yet it is never defined

Finding-ID: AUDIT-20260607-17
Status:     fixed-8da8219c (healthy family defined: ran to completion + emitted parseable output = >=1 byte stdout and no spawn/timeout error — matches as-built isModelRunHealthy. FR-008 + Audit-capability entity.)
Severity:   medium
Surface:    spec.md FR-002, FR-005, FR-008, Edge Cases ("ALL available families fail at runtime (zero healthy)")

The entire fail-loud-vs-valid-run distinction pivots on counting *healthy* families: "≥1 healthy family is a valid, successful audit" (FR-002); "zero healthy families is an outage — fail loud" (FR-005, AUDIT-07). The policy is settled, but the predicate it depends on — what makes a family "healthy" — is never defined anywhere in the spec. The hard cases are exactly the ambiguous ones: a family that returns HTTP 200 with an empty body; a family that returns malformed/unparseable output; a family that returns a refusal ("I can't review this"); a family that returns *after* a soft timeout. Each of these must resolve to either "healthy, contributed a clean zero-finding result" (FR-009 — run is governed) or "unhealthy, did not run" (FR-005 — fail loud, spec not governed). Those two outcomes are opposite, so the classification is not a detail — it decides whether an ungoverned spec graduates. The spec should define "healthy" as a checkable predicate (e.g., "returned a well-formed findings document — including an explicit zero-findings document — within the configured deadline; any other terminal state, including empty/malformed/timeout/refusal, is unhealthy"), so the FR-002/FR-005 boundary is mechanically decidable rather than left to the implementer.

---

### AUDIT-20260607-18 — "Same root cause" — the basis for the HIGH-confidence signal — has no defined matching rule

Finding-ID: AUDIT-20260607-18 (claude-03 + codex-01; cross-model)
Status:     fixed-8da8219c (same-root-cause matching defined: cluster on >=12-char heading substring overlap (case-insensitive, punctuation-stripped) OR shared repo-relative path token, transitive — matches as-built extract-barrage-findings. FR-003 + Finding entity.)
Severity:   medium
Surface:    spec.md FR-003, SC-002, Key Entities "Finding" (confidence label)

`cross-model-agreed` is the feature's headline signal — "the strongest signal that the finding is real" (US2) — and the gate-orthogonal confidence axis (FR-003). The label is assigned when "two or more model families flag the same root cause." But the spec never defines how two independently-authored findings from two model families are determined to be "the same root cause." This is a genuinely hard dedup/matching problem: the models emit free-text findings with their own headings, their own severity calls, and possibly different cited line ranges for the same underlying defect. Is agreement decided by overlapping `Surface:` line ranges? By semantic similarity of the body? By a human triage step? By the lift verb mechanically? Without a defined rule, two implementers (or two runs) will compute different cross-model-agreement sets from the same raw findings, making SC-002 ("when ≥2 families flag the same root cause, that finding is labeled `cross-model-agreed`") non-reproducible. A capture-complete spec should state the matching contract — even if the answer is "agreement is assigned during the triage/lift pass by the maintainer, not computed automatically," that disposition is itself a requirement that's currently missing.

---

### AUDIT-20260607-19 — The "override" referenced by FR-010/SC-007 has no defined surface, authorization, or recorded format

Finding-ID: AUDIT-20260607-19
Status:     fixed-8da8219c (override surface defined: operator action with a mandatory recorded reason via GOVERN_OVERRIDE / --override, recorded in the verdict — matches as-built. FR-010.)
Severity:   medium
Surface:    spec.md FR-010 ("an explicit override (if used) MUST be recorded"), SC-007, FR-014 (non-converged terminal state)

FR-010 and SC-007 both make the override load-bearing: a spec may graduate carrying open HIGH-severity findings **only** via "a recorded override," and a non-converged loop (FR-014) escalates to the operator — whose only path forward past a blocking finding is, presumably, this override. Yet no requirement defines the override at all: who is authorized to issue it (operator-only? any caller?), through what surface (a CLI verb? a sidecar field? a flag on the graduation command?), what must be recorded (reason? identity? finding IDs being overridden?), and whether an override is scoped to a single finding or blanket-clears the gate. This is the same shape as the project's own anti-pattern rule that a `--no-verify` bypass must be a deliberate, recorded, reshaped decision — but here the bypass mechanism that the gate's integrity depends on is entirely unspecified. Without it, "an override MUST be recorded" is unverifiable (SC-007 claims it's "verifiable in the run record," but there is no defined record shape to verify against). Add an FR defining the override's surface, authorization, required recorded fields, and scope.

---

### AUDIT-20260607-20 — The `acknowledged` disposition can silently clear a blocking finding from the gate, bypassing the "recorded override" requirement

Finding-ID: AUDIT-20260607-20
Status:     fixed-8da8219c (gate integrity: clearing an open HIGH-severity finding requires a recorded fix-<sha> OR an acknowledgment with a substantive recorded reason — same bar as an override, never silent; the finding state machine enforces the reason. FR-010.)
Severity:   medium
Surface:    spec.md FR-007 + Key Entities "Finding" (disposition: open / fixed / acknowledged) vs. FR-010 / SC-007 (gate counts "open" findings)

The gate counts **open** HIGH/MEDIUM findings (FR-010); findings carry a disposition of `open / fixed / acknowledged` (FR-007, Finding entity). Nothing in the spec states whether `acknowledged` removes a finding from the "open" count the gate evaluates. If it does — the natural reading, since `acknowledged ≠ open` — then dispositioning a blocking HIGH finding to `acknowledged` opens the gate, and SC-007's guarantee ("no spec graduates carrying open HIGH-severity findings without a recorded override") is satisfied *trivially* because the finding is no longer "open." That creates two distinct, unreconciled mechanisms for clearing a blocking finding: (a) the FR-010 "recorded override" path, and (b) dispositioning to `acknowledged`. Either they are the same thing (then the spec should say acknowledgment IS the override and inherit its recording requirements) or they differ (then the spec must say which findings may be acknowledged, whether acknowledging a HIGH finding requires the same recorded justification as an override, and why two paths exist). As written, `acknowledged` is an un-gated escape hatch around the override discipline — exactly the kind of quiet-bypass the no-fallbacks principle exists to prevent. This is adjacent to AUDIT-03 (which settled *carried-open MEDIUM* under the two-consecutive branch) but distinct: AUDIT-03 left MEDIUMs `open`; this is about a disposition transition that makes a HIGH finding stop counting.

---

### AUDIT-20260607-21 — The per-checkpoint iteration ceiling (FR-014) names no default and no configuration surface

Finding-ID: AUDIT-20260607-21
Status:     fixed-8da8219c (per-checkpoint ceiling: default 5, configurable via --ceiling / GOVERN_CEILING — matches as-built gate. FR-014.)
Severity:   low
Surface:    spec.md FR-014, Edge Cases ("Governance never converges")

FR-014 mandates a bounded loop terminating at "a configured iteration ceiling," per-checkpoint. But the spec never states the default ceiling value, nor where/how it is configured (extension manifest? CLI flag? per-feature config?). For a capture-complete spec this is an unstated assumption with real behavioral consequences: too low a ceiling under the "unattended/all-night" directive (FR-014's own justification) will escalate genuinely-improving specs as non-converged prematurely; too high wastes barrage budget. It need not pin a number, but it should name the configuration surface and state whether a default exists, so the implementation isn't free to hardcode an arbitrary magic number (the project's own guidance flags "hardcoded for now" magic numbers as a bug-factory). Pairs with the override gap (claude-04): the non-converged terminal state's only forward path is the override, so both halves of the escape need definition.

---

### AUDIT-20260607-22 — SC-006 is stated as a measurable outcome but is non-deterministically verifiable

Finding-ID: AUDIT-20260607-22
Status:     fixed-8da8219c (SC-006 reframed as probabilistic: a seeded contradiction is surfaced with high probability across the model battery, not a per-run determinism guarantee.)
Severity:   low
Surface:    spec.md SC-006 (and the spec's own framing of the barrage as "non-deterministic," AUDIT-04)

SC-006 — "On a spec seeded with a known self-contradiction, the automatic barrage surfaces that contradiction" — is the success criterion that ties the feature back to its motivating `specs/002` "author introduced 3 contradictions" failure. But the spec elsewhere explicitly characterizes the barrage as non-deterministic (AUDIT-04: "two-consecutive-quiet is a stability heuristic, not a determinism proof"). A single barrage run over a seeded contradiction may, on any given run, fail to surface it — model output is stochastic. As written, SC-006 is a probabilistic claim presented as a binary measurable outcome, so a conformance test for it is itself flaky and could go red for a reason unrelated to the code. Either qualify SC-006 to something deterministically checkable (e.g., "across N runs the seeded contradiction is surfaced in at least one," or "the convergence loop does not graduate the seeded spec until the contradiction is dispositioned"), or move it to a non-binding illustrative scenario. The current phrasing invites a test that asserts a non-deterministic event with `expect(...).toBe(true)`.

---

That's seven findings — all anchored to spec text, none re-litigating an already-dispositioned finding. The two I weighed hardest and chose to surface anyway because the prior dispositions don't actually cover them: **claude-02** ("healthy" predicate — AUDIT-07/-08 settled the *policy* but never defined the predicate the policy counts) and **claude-05** (`acknowledged`-vs-`open` — AUDIT-03 settled carried-open MEDIUMs but not the disposition transition that de-counts a HIGH). If your siblings converge on claude-03 (cross-model-agreement matching) or claude-04 (override surface), treat that agreement as the HIGH-confidence signal — both are core mechanisms the spec leans on without defining.

### AUDIT-20260607-23 — The unattended convergence loop implies automated spec fixing without specifying the actor or contract

Finding-ID: AUDIT-20260607-23
Status:     fixed-8da8219c (actor/contract: spec-governance governs (detects + gates), it does NOT auto-edit the spec; the fix step is the author/agent act; unattended means the GATE bounds the loop without an operator present, not machine spec-editing. FR-014.)
Severity:   medium
Surface:    specs/004-spec-governance/spec.md:95-97, specs/004-spec-governance/spec.md:107, specs/004-spec-governance/spec.md:113, specs/004-spec-governance/spec.md:145

The edge case says the loop “must run unattended (fix-and-re-barrage without operator presence),” and FR-010 describes “barrage → triage/fix the spec → re-barrage.” But FR-004 requires findings to be routed into triage where each gets an explicit durable disposition, and the spec never defines who or what performs unattended fixes, how dispositions are assigned, or what guardrails prevent automated edits from changing spec intent.

This is a design gap because the feature’s blocking gate depends on repeated remediation, not just repeated audit runs. A reasonable fix is to define the unattended actor and limits: for example, whether only an agent-driven flow can auto-edit, whether raw hooks merely stop and report, and whether automated dispositions require explicit metadata distinct from maintainer triage.

## 2026-06-07 — audit-barrage lift (20260607T040412671Z-pluggable-lifecycle-providers-after_clarify)

### AUDIT-20260607-24 — The `healthy` family predicate claims "parseable output" but operationalizes it as a raw byte count — the two are not equivalent

Finding-ID: AUDIT-20260607-24
Status:     open
Severity:   high
Surface:    spec.md FR-008 ("A model family is **healthy** … when it ran to completion and emitted parseable output (**≥1 byte of stdout and no spawn/timeout error**)"); also Edge Cases ("A model family times out or errors mid-run"), Key Entities "Audit capability"

The `healthy` predicate is load-bearing for three separate behaviors: the zero-healthy outage that triggers fail-loud (FR-005), the coverage honesty count (FR-008), and the distinction between a clean zero-finding run and an outage (FR-009). FR-008 defines it as *"emitted parseable output"* and then immediately operationalizes that as *"≥1 byte of stdout and no spawn/timeout error."* Those are not the same bar, and the gap is exploitable in exactly the failure mode this feature exists to prevent. A model family that exits 0 but writes a refusal string, a usage/help banner, a stack trace, or a truncated non-JSON fragment to stdout satisfies "≥1 byte of stdout, no spawn/timeout error" and is therefore counted **healthy** — contributing to coverage and to the "≥1 healthy family" floor — while having produced **zero parseable findings**. That run is then indistinguishable from a genuine clean zero-finding run (FR-009), and if it is the *only* "healthy" family, it masks what is really a zero-healthy outage (FR-005), letting an ungoverned spec record as governed. That is the precise silent-skip the no-fallbacks principle (FR-005, US3) is meant to make mechanically impossible.

The fix is to make the operationalization match the prose: "healthy" must require output that *parses into the finding schema* (zero or more well-formed findings), not merely a non-empty stdout. Define the parse contract (what shape counts as parseable; what an explicit "no findings" emission looks like vs. an unparseable blob) and state that an exit-0-with-unparseable-stdout family is **unhealthy**, counted toward the outage, not toward coverage. As written, the byte-count definition contradicts its own "parseable output" clause.

### AUDIT-20260607-25 — FR-003's "shared repo-relative path token" clustering rule trivially yields false cross-model agreement when findings cite the same file

Finding-ID: AUDIT-20260607-25 (claude-02 + claude-03 + codex-01; cross-model)
Status:     open
Severity:   medium
Surface:    spec.md FR-003 ("two findings cluster when … they cite a **shared repo-relative path token**; clustering is transitive, and a cluster spanning ≥2 families is `cross-model-agreed`"); Key Entities "Finding"; SC-002

Cross-model agreement is the feature's headline HIGH-confidence signal (US2, SC-002). FR-003 says two findings cluster — and therefore become `cross-model-agreed` if they come from ≥2 families — when they "cite a shared repo-relative path token." For a *spec-governance* barrage the artifact under audit is almost always a single file: `specs/004-spec-governance/spec.md`. Every finding that anchors to that spec cites the same path token. Under the rule as written, **every finding from every family that mentions `spec.md` clusters together** into one giant transitive cluster spanning all families, and the whole pile is labeled `cross-model-agreed`. That destroys the signal: cross-model agreement should mean "two families independently flagged the *same root cause*," not "two families both pointed at the one file we're auditing." This is the opposite of the genetic-diversity intent in FR-002/US2.

A reasonable fix narrows the path-token rule so a bare top-level spec path does not count (require a finer locator — a line range, an FR-id, a section anchor — or exclude the artifact's own path from the token set), and/or requires the heading-substring branch to also hold before path-token agreement is asserted. Without this, SC-002's "distinguishable from `single-model` findings" will be vacuously true (almost nothing is single-model) and the operator's prioritization worklist collapses.

### AUDIT-20260607-26 — The non-converged terminal state has no defined forward path — the loop's only documented exit may be a dead end

Finding-ID: AUDIT-20260607-26
Status:     open
Severity:   medium
Surface:    spec.md FR-014 ("if convergence is not reached after a configured iteration ceiling, the system MUST surface **non-convergence** … rather than loop forever"); FR-010 (override); SC-008; Edge Cases ("Governance never converges")

FR-014 and SC-008 define a recorded non-converged terminal state as the bound on the loop, and FR-010 defines an override (operator action, mandatory reason) as the way to clear findings and open the gate. What the spec never reconciles is the relationship between the two: once a checkpoint hits its ceiling and records `non-converged`, **what is the forward path to graduation?** Options the spec leaves open: (a) the operator records an override and the spec graduates despite non-convergence; (b) the non-converged state is permanent and the spec cannot graduate at all until the underlying findings are fixed and a *new* governance run is started (resetting the ceiling); (c) the ceiling is per-graduation-attempt and a fresh attempt is allowed. These have materially different consequences under the "unattended/all-night" directive that motivates FR-014 — if (b)/(c) with no override path, an all-night run that hits the ceiling simply stops with no machine-resolvable next step; if (a), an override can graduate a genuinely non-converging (i.e. still self-contradictory) spec, which is exactly the outcome the gate exists to prevent, so the override's evidentiary bar at the *ceiling* needs the same recorded-reason discipline FR-010 gives finding-level overrides.

The spec should state explicitly whether `override` applies to the non-converged terminal state and, if so, what is recorded; and whether/how a new attempt resets the per-checkpoint ceiling. Right now "escalate to the operator" is the entire contract, which is under-specified for an unattended loop.

### AUDIT-20260607-27 — No configuration surface is named for *enabling* the `after_plan` checkpoint

Finding-ID: AUDIT-20260607-27
Status:     open
Severity:   low
Surface:    spec.md FR-011 ("MUST be **configurable to also fire at `after_plan`**"); FR-014 (which does name `--ceiling`/`GOVERN_CEILING`); FR-010 (which names `--override`/`GOVERN_OVERRIDE`)

Round 2 closed AUDIT-21 by naming the ceiling's config surface (`--ceiling` / `GOVERN_CEILING`) and AUDIT-19 by naming the override surface (`--override` / `GOVERN_OVERRIDE`). The parallel gap for checkpoint selection was not closed: FR-011 says the `after_plan` checkpoint is "configurable" but names no surface — flag, env var, extension manifest field, or per-feature config — for turning it on, nor a default (the default is implicitly "after_clarify only," but that is never stated as the off-state for after_plan). This is the same unstated-config-surface shape the project's own guidance flags as a magic-config bug-factory, now isolated to the one checkpoint knob that the round-2 pass happened not to cover. State the enablement surface and its default explicitly, consistent with how `--ceiling` and `--override` are now specified.

### AUDIT-20260607-28 — SC-006 is filed under "Measurable Outcomes" but its predicate ("with high probability") is not measurable as worded

Finding-ID: AUDIT-20260607-28
Status:     open
Severity:   low
Surface:    spec.md SC-006 ("On a spec seeded with a known self-contradiction, the automatic barrage surfaces that contradiction **with high probability across the model battery** … not a per-run determinism guarantee")

The round-2 resolution of AUDIT-22 correctly removed the false determinism claim, but it relabeled SC-006 as "probabilistic" while leaving it in the **Measurable Outcomes** section with a predicate — "with high probability" — that has no operational threshold and no run count. As worded, no conformance test or audit can decide whether SC-006 passed or failed: "high probability" names no N, no acceptance ratio, and no observation procedure. That makes it the one success criterion in the list that cannot be checked, which undercuts the section's purpose. The original AUDIT-22 note even offered a checkable reformulation ("across N runs the seeded contradiction is surfaced in at least one," or "the convergence loop does not graduate the seeded spec until the contradiction is dispositioned"); the adopted wording took neither. Either give SC-006 a measurable form (an N-run threshold, or tie it to the gate's behavior on the seeded spec, which *is* deterministic) or move it out of "Measurable Outcomes" into an illustrative/non-binding scenario so the section stays honest about what it guarantees.

### AUDIT-20260607-29 — The edge-case section still contradicts the no-auto-edit contract

Finding-ID: AUDIT-20260607-29
Status:     open
Severity:   medium
Surface:    specs/004-spec-governance/spec.md:109, specs/004-spec-governance/spec.md:130

FR-014 now says spec-governance “does NOT auto-edit the spec” and that the fix step is the author’s act. But the Edge Cases section still says the convergence loop must run unattended as “fix-and-re-barrage without operator presence.” That phrase preserves the original implication that remediation itself can happen without an operator/author actor.

This matters because the spec is the contract implementers will follow, and these two statements describe different automation boundaries. The edge case should use the same contract as FR-014: unattended gate evaluation and bounded non-convergence recording, with fixes performed by the authoring agent/operator under the normal spec-editing contract.

### AUDIT-20260607-30 — A persistent override environment variable can silently override later gates

Finding-ID: AUDIT-20260607-30
Status:     open
Severity:   medium
Surface:    specs/004-spec-governance/spec.md:126, specs/004-spec-governance/spec.md:130

FR-010 allows overrides via `GOVERN_OVERRIDE` or `--override "<reason>"`, and FR-014 applies that escape to the bounded convergence loop. The spec does not scope the environment-variable override to a specific spec, checkpoint, run, or invocation. In an unattended flow, a leftover `GOVERN_OVERRIDE` in the shell environment could satisfy “an override is recorded” for later checkpoints or specs without a fresh operator decision.

That weakens the gate’s integrity even though a reason string exists. A reasonable fix is to make env-based overrides one-shot and scoped in the recorded verdict, for example requiring spec/checkpoint/run identity or preferring an explicit CLI flag for actual gate bypasses.
