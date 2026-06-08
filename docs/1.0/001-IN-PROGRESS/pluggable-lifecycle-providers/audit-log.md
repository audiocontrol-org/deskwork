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
Status:     fixed-37642683 (CORRECTED: the earlier fix-1a2f258c said residual MEDIUMs are "carried open" — that was NOT faithful to the dw-lifecycle protocol. The protocol SLUSHES them: once the dampener engages, residual MEDIUM/LOW are flipped to acknowledged-slush-pile-<date> (not fixed, not open) by the now-ported slush-remaining mechanism (stackctl slush-findings), so the loop terminates; HIGHs are never slushed; burn-down re-opens. Spec FR-015 + FR-007/FR-010/SC-007 + the AUDIT-03 clarification updated. Operator caught the gap: the port had the dampener but not the slush action.)
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
Status:     fixed-5cfdb6a7 (the internal contradiction is removed: FR-008 + Audit-capability entity now define healthy purely as the as-built predicate — >=1 byte stdout + no spawn/timeout error, NO parseability claim — and explicitly note the residual (an exit-0 non-finding blob counts healthy; the lift extracts 0 findings) + that parse-validation is an available refinement. Spec now matches isModelRunHealthy; no overclaim.)
Severity:   high
Surface:    spec.md FR-008 ("A model family is **healthy** … when it ran to completion and emitted parseable output (**≥1 byte of stdout and no spawn/timeout error**)"); also Edge Cases ("A model family times out or errors mid-run"), Key Entities "Audit capability"

The `healthy` predicate is load-bearing for three separate behaviors: the zero-healthy outage that triggers fail-loud (FR-005), the coverage honesty count (FR-008), and the distinction between a clean zero-finding run and an outage (FR-009). FR-008 defines it as *"emitted parseable output"* and then immediately operationalizes that as *"≥1 byte of stdout and no spawn/timeout error."* Those are not the same bar, and the gap is exploitable in exactly the failure mode this feature exists to prevent. A model family that exits 0 but writes a refusal string, a usage/help banner, a stack trace, or a truncated non-JSON fragment to stdout satisfies "≥1 byte of stdout, no spawn/timeout error" and is therefore counted **healthy** — contributing to coverage and to the "≥1 healthy family" floor — while having produced **zero parseable findings**. That run is then indistinguishable from a genuine clean zero-finding run (FR-009), and if it is the *only* "healthy" family, it masks what is really a zero-healthy outage (FR-005), letting an ungoverned spec record as governed. That is the precise silent-skip the no-fallbacks principle (FR-005, US3) is meant to make mechanically impossible.

The fix is to make the operationalization match the prose: "healthy" must require output that *parses into the finding schema* (zero or more well-formed findings), not merely a non-empty stdout. Define the parse contract (what shape counts as parseable; what an explicit "no findings" emission looks like vs. an unparseable blob) and state that an exit-0-with-unparseable-stdout family is **unhealthy**, counted toward the outage, not toward coverage. As written, the byte-count definition contradicts its own "parseable output" clause.

### AUDIT-20260607-25 — FR-003's "shared repo-relative path token" clustering rule trivially yields false cross-model agreement when findings cite the same file

Finding-ID: AUDIT-20260607-25 (claude-02 + claude-03 + codex-01; cross-model)
Status:     fixed-5cfdb6a7 (FR-003 adds the single-artifact caveat honestly: the as-built path-token branch over-clusters when every finding cites the one spec.md, so for single-file specs the heading-substring branch is the reliable agreement signal; excluding the artifact path / requiring a finer locator is named as an available (not-yet-implemented) refinement — no overclaim of unimplemented behavior.)
Severity:   medium
Surface:    spec.md FR-003 ("two findings cluster when … they cite a **shared repo-relative path token**; clustering is transitive, and a cluster spanning ≥2 families is `cross-model-agreed`"); Key Entities "Finding"; SC-002

Cross-model agreement is the feature's headline HIGH-confidence signal (US2, SC-002). FR-003 says two findings cluster — and therefore become `cross-model-agreed` if they come from ≥2 families — when they "cite a shared repo-relative path token." For a *spec-governance* barrage the artifact under audit is almost always a single file: `specs/004-spec-governance/spec.md`. Every finding that anchors to that spec cites the same path token. Under the rule as written, **every finding from every family that mentions `spec.md` clusters together** into one giant transitive cluster spanning all families, and the whole pile is labeled `cross-model-agreed`. That destroys the signal: cross-model agreement should mean "two families independently flagged the *same root cause*," not "two families both pointed at the one file we're auditing." This is the opposite of the genetic-diversity intent in FR-002/US2.

A reasonable fix narrows the path-token rule so a bare top-level spec path does not count (require a finer locator — a line range, an FR-id, a section anchor — or exclude the artifact's own path from the token set), and/or requires the heading-substring branch to also hold before path-token agreement is asserted. Without this, SC-002's "distinguishable from `single-model` findings" will be vacuously true (almost nothing is single-model) and the operator's prioritization worklist collapses.

### AUDIT-20260607-26 — The non-converged terminal state has no defined forward path — the loop's only documented exit may be a dead end

Finding-ID: AUDIT-20260607-26
Status:     fixed-5cfdb6a7 (FR-014 defines the forward path from non-converged: no auto-graduate; (a) operator override at the ceiling — same mandatory-reason scoped discipline — graduates, or (b) fix + fresh attempt resets the per-attempt ceiling. Absent an override, non-converged does not graduate.)
Severity:   medium
Surface:    spec.md FR-014 ("if convergence is not reached after a configured iteration ceiling, the system MUST surface **non-convergence** … rather than loop forever"); FR-010 (override); SC-008; Edge Cases ("Governance never converges")

FR-014 and SC-008 define a recorded non-converged terminal state as the bound on the loop, and FR-010 defines an override (operator action, mandatory reason) as the way to clear findings and open the gate. What the spec never reconciles is the relationship between the two: once a checkpoint hits its ceiling and records `non-converged`, **what is the forward path to graduation?** Options the spec leaves open: (a) the operator records an override and the spec graduates despite non-convergence; (b) the non-converged state is permanent and the spec cannot graduate at all until the underlying findings are fixed and a *new* governance run is started (resetting the ceiling); (c) the ceiling is per-graduation-attempt and a fresh attempt is allowed. These have materially different consequences under the "unattended/all-night" directive that motivates FR-014 — if (b)/(c) with no override path, an all-night run that hits the ceiling simply stops with no machine-resolvable next step; if (a), an override can graduate a genuinely non-converging (i.e. still self-contradictory) spec, which is exactly the outcome the gate exists to prevent, so the override's evidentiary bar at the *ceiling* needs the same recorded-reason discipline FR-010 gives finding-level overrides.

The spec should state explicitly whether `override` applies to the non-converged terminal state and, if so, what is recorded; and whether/how a new attempt resets the per-checkpoint ceiling. Right now "escalate to the operator" is the entire contract, which is under-specified for an unattended loop.

### AUDIT-20260607-27 — No configuration surface is named for *enabling* the `after_plan` checkpoint

Finding-ID: AUDIT-20260607-27
Status:     fixed-5cfdb6a7 (FR-011 names the after_plan enablement surface: off by default — after_clarify only — enabled per project via the extension.yml hooks.after_plan + fed by GOVERN_PLAN_PATH at fire time. Parallels the --ceiling/--override surfaces named in round 2.)
Severity:   low
Surface:    spec.md FR-011 ("MUST be **configurable to also fire at `after_plan`**"); FR-014 (which does name `--ceiling`/`GOVERN_CEILING`); FR-010 (which names `--override`/`GOVERN_OVERRIDE`)

Round 2 closed AUDIT-21 by naming the ceiling's config surface (`--ceiling` / `GOVERN_CEILING`) and AUDIT-19 by naming the override surface (`--override` / `GOVERN_OVERRIDE`). The parallel gap for checkpoint selection was not closed: FR-011 says the `after_plan` checkpoint is "configurable" but names no surface — flag, env var, extension manifest field, or per-feature config — for turning it on, nor a default (the default is implicitly "after_clarify only," but that is never stated as the off-state for after_plan). This is the same unstated-config-surface shape the project's own guidance flags as a magic-config bug-factory, now isolated to the one checkpoint knob that the round-2 pass happened not to cover. State the enablement surface and its default explicitly, consistent with how `--ceiling` and `--override` are now specified.

### AUDIT-20260607-28 — SC-006 is filed under "Measurable Outcomes" but its predicate ("with high probability") is not measurable as worded

Finding-ID: AUDIT-20260607-28
Status:     fixed-5cfdb6a7 (SC-006 reframed to its checkable, DETERMINISTIC form: the gate does not graduate a seeded-contradiction spec until it is dispositioned (gate behavior is deterministic even though the barrage is stochastic). The probabilistic detection is noted but the guarantee is the gate-behavior one.)
Severity:   low
Surface:    spec.md SC-006 ("On a spec seeded with a known self-contradiction, the automatic barrage surfaces that contradiction **with high probability across the model battery** … not a per-run determinism guarantee")

The round-2 resolution of AUDIT-22 correctly removed the false determinism claim, but it relabeled SC-006 as "probabilistic" while leaving it in the **Measurable Outcomes** section with a predicate — "with high probability" — that has no operational threshold and no run count. As worded, no conformance test or audit can decide whether SC-006 passed or failed: "high probability" names no N, no acceptance ratio, and no observation procedure. That makes it the one success criterion in the list that cannot be checked, which undercuts the section's purpose. The original AUDIT-22 note even offered a checkable reformulation ("across N runs the seeded contradiction is surfaced in at least one," or "the convergence loop does not graduate the seeded spec until the contradiction is dispositioned"); the adopted wording took neither. Either give SC-006 a measurable form (an N-run threshold, or tie it to the gate's behavior on the seeded spec, which *is* deterministic) or move it out of "Measurable Outcomes" into an illustrative/non-binding scenario so the section stays honest about what it guarantees.

### AUDIT-20260607-29 — The edge-case section still contradicts the no-auto-edit contract

Finding-ID: AUDIT-20260607-29
Status:     fixed-5cfdb6a7 (the unattended edge case reworded to match FR-014 no-auto-edit: unattended = the GATE evaluates/slushes/bounds without an operator; remediation is the authoring agent/operator act under the normal spec-editing contract. The contradictory fix-and-re-barrage-without-operator phrasing is gone.)
Severity:   medium
Surface:    specs/004-spec-governance/spec.md:109, specs/004-spec-governance/spec.md:130

FR-014 now says spec-governance “does NOT auto-edit the spec” and that the fix step is the author’s act. But the Edge Cases section still says the convergence loop must run unattended as “fix-and-re-barrage without operator presence.” That phrase preserves the original implication that remediation itself can happen without an operator/author actor.

This matters because the spec is the contract implementers will follow, and these two statements describe different automation boundaries. The edge case should use the same contract as FR-014: unattended gate evaluation and bounded non-convergence recording, with fixes performed by the authoring agent/operator under the normal spec-editing contract.

### AUDIT-20260607-30 — A persistent override environment variable can silently override later gates

Finding-ID: AUDIT-20260607-30
Status:     fixed-5cfdb6a7 (FR-010 scopes the override: the verdict records the spec (feature) + checkpoint it applied to; the --override flag is preferred for a real bypass; a persistent exported GOVERN_OVERRIDE applying to later runs is named a known hazard with one-shot-consumption as the available hardening — honest about as-built, not overclaimed.)
Severity:   medium
Surface:    specs/004-spec-governance/spec.md:126, specs/004-spec-governance/spec.md:130

FR-010 allows overrides via `GOVERN_OVERRIDE` or `--override "<reason>"`, and FR-014 applies that escape to the bounded convergence loop. The spec does not scope the environment-variable override to a specific spec, checkpoint, run, or invocation. In an unattended flow, a leftover `GOVERN_OVERRIDE` in the shell environment could satisfy “an override is recorded” for later checkpoints or specs without a fresh operator decision.

That weakens the gate’s integrity even though a reason string exists. A reasonable fix is to make env-based overrides one-shot and scoped in the recorded verdict, for example requiring spec/checkpoint/run identity or preferring an explicit CLI flag for actual gate bypasses.

## 2026-06-07 — audit-barrage lift (20260607T042455611Z-pluggable-lifecycle-providers-after_clarify)

### AUDIT-20260607-31 — Cross-run finding reconciliation (how a finding in run N is matched to one in run N+1) is never defined — yet "distinguish still-open from dispositioned" depends on it

Finding-ID: AUDIT-20260607-31
Status:     acknowledged-5791b346 (FALSE PREMISE — superseded by protocol-alignment 5791b346. The round-4 fix added a cross-run matcher; reading the code (check-barrage-dampener/spec-governance-gate/slush-remaining) showed the protocol is per-run by design and needs NO cross-run matcher: disposition is the per-entry Status on an append-only log; the gate/slush evaluate the most-recent run. SC-004 is satisfied by the literal Status line. FR-007 corrected to state this; the matcher fiction was removed.)
Severity:   high
Surface:    spec.md FR-004, FR-007, FR-010 ("counting open-finding severity"), SC-004; Key Entities "Finding"

FR-007/SC-004 require that "a re-run can distinguish still-open findings from already-dispositioned (incl. slushed) ones," and FR-010's entire gate is "counting **open** findings." Both presuppose a mechanism that takes a finding produced by barrage run N+1 and decides whether it is *the same finding* as one already recorded (and therefore inherits its `open`/`fixed`/`acknowledged`/`slush` disposition) or is genuinely new. That cross-run identity rule is never specified. The clustering rule in FR-003 (≥12-char heading substring OR shared path token, transitive) is explicitly scoped to **intra-run cross-model agreement** ("a cluster spanning ≥2 families") — it is a within-one-barrage operation, not a run-to-run matcher.

Without a defined reconciliation rule, the central contracts are unimplementable as written: an implementer cannot compute "open findings" (FR-010), cannot preserve dispositions across revisions (SC-004), and cannot tell whether the "two consecutive 0-HIGH" runs are quiet because the spec improved or because the (non-deterministic) barrage simply phrased the same HIGH differently and the system failed to match it. Two reasonable implementers will build incompatible matchers and get different gate verdicts on the same spec. A fix: state the cross-run matching rule explicitly (e.g. reuse the FR-003 clustering predicate as the cross-run identity predicate, or assign a stable finding key from {checkpoint, cited locator, normalized heading}), and define what happens to a recorded `open` finding that does **not** re-surface in a later run (auto-resolved? still open?).

### AUDIT-20260607-32 — "Dampener" is load-bearing across FR-010 and FR-015 but its engage/disengage condition is never defined

Finding-ID: AUDIT-20260607-32
Status:     fixed-cb29ab7f (fresh-context sub-agent dispatch; "dampener engaged" defined in FR-010 — most-recent-2 runs each 0 open HIGH/BLOCKING; HIGH breaks the window)
Severity:   medium
Surface:    spec.md FR-010 ("When the dampener is engaged …", "a HIGH resets the dampener"), FR-015 ("When the dampener is engaged (FR-010)", "MUST refuse while the dampener is not engaged"), Key Entities "Audit protocol"

The word "dampener" carries the entire slush/termination contract: slushing MUST refuse while the dampener is *not* engaged (FR-015), residual MEDIUM/LOW are slushed *when* it is engaged (FR-010/FR-015), and "a HIGH resets the dampener" (FR-010). But the spec never defines the predicate that *engages* the dampener. The only hint is a parenthetical operator-quote in FR-015 ("once two consecutive audits had 0 HIGH"), which is illustrative prose, not a definition, and it isn't tied back to FR-010's "two consecutive iterations each produce 0 open HIGH" with the same per-checkpoint scoping language.

This is the same defect-shape the round-2 pass closed for "healthy family" (AUDIT-17) and "same root cause" (AUDIT-18): a term ported from the dw-lifecycle protocol whose definition was not ported alongside it. Because slushing is what lets the loop terminate (FR-015), an implementer who guesses the engage condition wrong either bins MEDIUMs too early (real defects buried) or never terminates. Define "dampener engaged" explicitly — presumably: the most recent N (=2) recorded runs for this checkpoint each had 0 open HIGH/BLOCKING — and state exactly what "a HIGH resets the dampener" means in terms of the recorded-run window.

### AUDIT-20260607-33 — The boundary between an "inter-iteration edit" (does not reset the count) and a "fresh governance attempt" (resets the ceiling) has no mechanical marker

Finding-ID: AUDIT-20260607-33
Status:     fixed-5791b346 (round-4 fix added a fictional GOVERN_NEW_ATTEMPT/--new-attempt flag (not in code); superseded by protocol-alignment 5791b346. The concern (ceiling trivially defeatable) is resolved by the REAL mechanism: the ceiling counts the checkpoint's recorded runs; continuing past it requires an explicit recorded --ceiling/GOVERN_CEILING raise (bounded + auditable, not a silent re-run). FR-014 corrected.)
Severity:   medium
Surface:    spec.md FR-010 ("an inter-iteration edit does NOT reset the count"), FR-014 forward-path (b) ("starts a **fresh governance attempt**, which resets the per-checkpoint ceiling … the ceiling is per-graduation-attempt, not lifetime")

FR-010 says editing the spec between barrages does **not** reset the consecutive-run count ("regardless of whether the spec text changed between them"). FR-014 says the operator can fix findings and start a "fresh governance attempt" that **resets** the per-checkpoint ceiling. Both scenarios are, mechanically, "the operator edited the spec and re-ran the barrage at the same checkpoint." The spec gives no observable marker that distinguishes the two, yet the distinction controls whether the ceiling (and, by implication, possibly the consecutive count) resets.

This is exploitable/ambiguous in the unattended flow the feature targets: if "fresh attempt" is just "the operator re-ran after the ceiling was hit," then the ceiling is trivially defeatable (every re-run is a fresh attempt → unbounded, contradicting FR-014's "never loop forever"); if it requires an explicit operator gesture, that gesture is unnamed (no flag/verb/state transition is specified, unlike `--ceiling`/`--override` which were named in round 2). Additionally, FR-014 does not say whether a fresh attempt also resets the FR-010 consecutive-0-HIGH window — if stale 0-HIGH runs from the prior (non-converged) attempt carry over, a fresh attempt could graduate immediately off pre-fix runs. Name the explicit boundary (a recorded "new attempt" transition) and state its effect on both the ceiling counter and the consecutive-quiet window.

### AUDIT-20260607-34 — Whether after_clarify dispositions (slushed/acknowledged) are honored when after_plan re-audits the spec is unspecified

Finding-ID: AUDIT-20260607-34
Status:     fixed-5791b346 (round-4 fix added cross-checkpoint disposition inheritance (not in code); superseded by protocol-alignment 5791b346. The concern (honored or re-opened at after_plan?) is answered by the REAL mechanism: independent per-checkpoint loops, gate scoped per-checkpoint; NO inheritance — a spec issue re-surfacing at after_plan is new open work in after_plan's own loop. FR-011 corrected.)
Severity:   medium
Surface:    spec.md FR-011 ("passing the after_clarify gate is durable and MUST NOT be re-opened by findings surfaced at after_plan"), FR-013 (after_plan artifact set = "spec + plan"), FR-007 (single durable store, "survives across spec revisions")

FR-013 makes the after_plan checkpoint audit the **spec plus the plan** (additive), so the after_plan barrage re-examines the same spec.md that after_clarify already governed. FR-011 protects the after_clarify *gate verdict* from being re-opened, but says nothing about the *findings*: when after_plan re-surfaces a spec-level issue that was slushed (`acknowledged-slush-pile-<date>`) or acknowledged at after_clarify, is that disposition honored (the finding stays disposed) or does it re-appear as `open` under after_plan's independent loop? FR-007 describes "across spec revisions" persistence but not across **checkpoints**, and FR-011/FR-014's "independent per-checkpoint loops" language pulls the other way (separate loops imply separate open-sets).

The two readings produce materially different behavior: under "checkpoint-scoped dispositions," every spec-level MEDIUM slushed at after_clarify re-blocks (or re-noises) the after_plan loop, defeating the durability intent; under "global dispositions," a finding the operator slushed before the plan existed silently stays slushed even though the plan may have changed its relevance. State whether dispositions are checkpoint-scoped or store-global, and if global, how a finding's checkpoint provenance is tracked so the gate counts the right open-set per checkpoint.

### AUDIT-20260607-35 — For single-file specs, the heading-substring branch is asserted as "the reliable agreement signal" without addressing its under-clustering (false-negative) failure mode

Finding-ID: AUDIT-20260607-35
Status:     fixed-cb29ab7f (fresh-context sub-agent dispatch; FR-003 — heading-substring under-clustering acknowledged; single-model HIGH must not be deprioritized)
Severity:   low
Surface:    spec.md FR-003 ("For single-file specs, therefore, the **heading-substring** branch is the reliable agreement signal …")

Round 3 (5cfdb6a7) correctly documented that the path-token branch **over-clusters** on single-file specs (every finding cites the same `spec.md`) and concluded that heading-substring is therefore the reliable signal for the primary use case. But the heading-substring branch has the complementary failure mode that goes unmentioned: model-authored headings are free text, so two families flagging the same contradiction with differently-worded headings (no ≥12-char case-insensitive shared substring) will **not** cluster — a false negative that silently downgrades a real cross-model agreement to two `single-model` findings. Since the single-file case is "the usual spec-governance case," this means the headline US2/SC-002 signal (cross-model agreement = HIGH confidence) is unreliable in *both* directions for the main use case: path-token over-clusters, heading-substring under-clusters.

The spec asserts heading-substring is "reliable" without basis and offers refinements (line range, FR-id, section anchor) only for the path-token side. A more honest framing would acknowledge the under-clustering risk and note that on single-file specs cross-model agreement is best-effort, so a `single-model` HIGH must never be treated as lower-priority on the assumption that "real issues would have clustered." (Note this is a refinement of the disposition recorded for the round-3 single-file edit, surfacing the unaddressed direction — not a re-litigation of the over-clustering fix itself.)

### AUDIT-20260607-36 — SC-006 still overclaims deterministic protection against undetected contradictions

Finding-ID: AUDIT-20260607-36
Status:     fixed-cb29ab7f (fresh-context sub-agent dispatch; SC-006 scoped to detected contradictions — deterministic gate-on-detected; detection demoted to non-guaranteed cross-model evidence)
Severity:   medium
Surface:    specs/004-spec-governance/spec.md:151

SC-006 says the deterministic guarantee is that “a seeded-contradiction spec cannot silently graduate,” while also admitting the underlying detection is probabilistic. The gate can only block on recorded/open findings; if the stochastic barrage does not surface the seeded contradiction in the recorded run(s), the gate has no contradiction finding to require dispositioning, and the spec can graduate as a clean run under FR-010/FR-009.

This matters because SC-006 is now framed as a measurable guarantee, but its guarantee still depends on an unguaranteed detection event. A reasonable fix is to scope the success criterion to detected seeded contradictions: e.g. “once the contradiction is surfaced as an open HIGH/BLOCKING finding, the gate does not graduate until it is fixed or overridden,” and keep separate any probabilistic detection claim as non-deterministic evidence rather than the gate guarantee.

### AUDIT-20260607-37 — Assumptions still describe an unattended “fix-and-re-barrage” loop

Finding-ID: AUDIT-20260607-37
Status:     fixed-cb29ab7f (fresh-context sub-agent dispatch; Assumptions — unattended applies to the gate, not the fix; gate never auto-edits)
Severity:   medium
Surface:    specs/004-spec-governance/spec.md:159

FR-014 and the Edge Cases section now correctly say spec-governance does not auto-edit the spec, and that remediation is the authoring agent/operator’s act. But the Assumptions section still says “The loop itself can run unattended (fix-and-re-barrage),” which reintroduces the same automation-boundary ambiguity: it reads as though the loop may both fix and re-run without the author/operator actor.

This is not just wording polish because Assumptions are part of the design contract implementers will reconcile with FR-014. Replace this with the clarified boundary: the gate can run and record bounded non-convergence unattended; fixes are authored by the agent/operator under the normal spec-editing contract before a fresh run.

### AUDIT-20260607-38 — Deferred refinements are embedded in normative requirements

Finding-ID: AUDIT-20260607-38
Status:     fixed-cb29ab7f (fresh-context sub-agent dispatch; FR-003 + FR-008 — "(not yet implemented)" deferral escape-hatches removed; present-tense contract only)
Severity:   low
Surface:    specs/004-spec-governance/spec.md:119, specs/004-spec-governance/spec.md:124

The spec includes explicit deferred-work language inside functional requirements: “Available refinement (not yet implemented)” in FR-003 and “known available refinement” in FR-008. The audit prompt’s hard constraints reject deferral phrasing because it tends to become an untracked implementation gap, and here both deferred items are tied to contract-critical behavior: over-clustering agreement signals and counting non-parseable output as healthy coverage.

A reasonable fix is to either make these current requirements or move them into a tracked out-of-scope/non-goal section with a clear present-tense contract. The FRs themselves should state only what the implementation must do now, without embedding “not yet implemented” escape hatches in the normative path.

## 2026-06-07 — audit-barrage lift (20260607T051122270Z-pluggable-lifecycle-providers-after_clarify)

### AUDIT-20260607-39 — Disposition inheritance can silently slush a re-surfaced HIGH, defeating the never-slush-HIGH invariant

Finding-ID: AUDIT-20260607-39 (claude-01 + claude-02 + claude-03 + claude-04 + claude-05 + claude-06 + claude-07 + codex-01 + codex-02 + codex-03; cross-model)
Status:     acknowledged-5791b346 (MOOT — superseded by protocol-alignment 5791b346. This patched the disposition-inheritance mechanism added by AUDIT-31's fix; that mechanism does not exist in the code and was removed as fiction (FR-007 corrected). With no inheritance path there is nothing to make severity-aware — a re-surfaced HIGH is simply a new open entry in the most-recent run, which the gate counts.)
Severity:   high
Surface:    specs/004-spec-governance/spec.md FR-007 ("A later-run finding that matches a recorded finding inherits that finding's disposition") vs FR-010/FR-015 ("HIGH-severity findings are NEVER slushed")

FR-007 makes disposition inheritance unconditional on severity: *"A later-run finding that matches a recorded finding inherits that finding's disposition (`open` / `fixed-<sha>` / `acknowledged-<reason>` / `acknowledged-slush-pile-<date>`)."* The matching predicate (FR-003 clustering) is severity-blind. Now consider: at run N a MEDIUM finding M1 is slushed (`acknowledged-slush-pile-<date>`). At run N+1 the same root cause re-surfaces, but a model rates it HIGH (severity ratings are per-run, per-model, and the barrage is stochastic). Under FR-007 the run-N+1 finding matches M1 and **inherits the slush disposition** — yielding a HIGH-severity finding sitting in `acknowledged-slush-pile`.

This directly contradicts two load-bearing invariants. FR-015: *"MUST NEVER slush HIGH/BLOCKING findings."* FR-010: a HIGH resets the dampener because *"a recorded run that surfaces an **open** HIGH/BLOCKING finding breaks the consecutive-0-HIGH window."* But the inherited-slush HIGH is never `open` — inheritance set it to slush — so it never "surfaces as open," the dampener never resets, the gate stays satisfied, and a genuine HIGH graduates silently. That is precisely the "seeded contradiction graduates undetected" failure mode the feature exists to prevent, reintroduced through the reconciliation path. A reasonable fix: make inheritance severity-aware — a later-run finding that matches a slushed/acknowledged record but carries HIGH/BLOCKING severity MUST re-open as `open` HIGH work (severity escalation overrides inherited non-open dispositions), and the cross-run/cross-checkpoint matcher must re-check severity before inheriting any non-`open` disposition.

## 2026-06-07 — audit-barrage lift (20260607T051639194Z-pluggable-lifecycle-providers-after_clarify)

### AUDIT-20260607-40 — Cross-run path-token over-clustering silently slushes genuinely-new MEDIUM findings, defeating the single-iteration 0-MEDIUM gate

Finding-ID: AUDIT-20260607-40 (claude-01 + claude-02 + claude-03 + claude-04 + claude-05 + claude-06 + claude-07 + codex-01 + codex-02 + codex-03; cross-model)
Status:     acknowledged-5791b346 (MOOT — superseded by protocol-alignment 5791b346. This attacked the cross-run path-token matcher added by AUDIT-31's fix; that matcher does not exist in the code and was removed. The real slush (slush-remaining.ts) operates only on the most-recent run's own findings and is severity-guarded — it cannot auto-slush a genuinely-new MEDIUM by matching it against an older slushed entry. FR-007/FR-015 corrected.)
Severity:   high
Surface:    specs/004-spec-governance/spec.md — FR-007 (cross-run reconciliation) in conjunction with FR-003 (path-token over-cluster caveat) and FR-010 (single-iteration "0 open MEDIUM" branch)

FR-007 reuses "the **same clustering predicate as FR-003**" for cross-run reconciliation — a shared repo-relative path token OR a ≥12-char heading substring, transitive. FR-003 already documents that on single-file specs (the usual spec-governance case) the path-token branch **over-clusters** because every finding cites the same `spec.md`. AUDIT-39's fix made inheritance **severity-aware**, but that fix protects **only HIGH/BLOCKING** re-surfacers. For MEDIUM findings the over-cluster failure is unmitigated and runs the wrong direction: a *genuinely new* MEDIUM raised in run N+1 path-token-matches an *arbitrary* earlier MEDIUM that was slushed (`acknowledged-slush-pile-<date>`), and — because it is not HIGH — **inherits the slush disposition on first appearance**. It is therefore never counted as `open`.

This directly defeats FR-010's first gate branch ("a single barrage iteration produces 0 open HIGH and **0 open MEDIUM**"): a spec can graduate on iteration 1 while real new MEDIUM defects exist, because the path-token matcher auto-slushed them against unrelated prior slush entries that merely "also pointed at spec.md." The severity-aware carve-out in FR-007 explicitly says inheritance of a non-`open` disposition "applies **only** when the re-surfaced finding's severity is **NOT** HIGH/BLOCKING" — i.e. the spec deliberately leaves MEDIUM open to inherited slush, and on a single-file spec the path-token branch makes that inheritance near-indiscriminate.

A reasonable fix: for single-file checkpoints, FR-007 cross-run matching MUST disable the path-token branch (make heading-substring the **sole** matcher, mirroring what FR-003 already declares "load-bearing" for the agreement signal), and/or require that an inherited non-`open` disposition for a MEDIUM be confirmed by heading-substring overlap, not path-token alone. As written, FR-003's "known limitation" is acknowledged for the *agreement label* but its far more dangerous consequence on *cross-run disposition inheritance* (new MEDIUM → silent slush) is unaddressed in the normative path.

## 2026-06-07 — audit-barrage lift (20260607T053536092Z-pluggable-lifecycle-providers-after_clarify)

### AUDIT-20260607-41 — Protocol-alignment rewrite of FR-007 left SC-004 / US2-AS3 / the re-revise edge case promising cross-run distinguishing the new model cannot deliver

Finding-ID: AUDIT-20260607-41 (claude-01 + claude-02 + claude-03 + claude-04 + claude-05 + claude-06 + codex-01 + codex-02; cross-model)
Status:     fixed-6fb9b11d (SC-004, US2 Acceptance Scenario 3, and the "spec re-revised after triage" edge case rewritten to the per-run model — prior dispositions preserved in their own append-only sections; each re-barrage evaluated on its own most-recent run; a still-present defect re-appears as a new open entry; no cross-run correlation. Consistent with corrected FR-007. NOTE: this contradiction was caused by under-scoping the 5791b346 alignment (sub-agents fenced to single FRs); follow-up = full-spec consistency sweep.)
Severity:   high
Surface:    specs/004-spec-governance/spec.md — FR-007 vs SC-004, User Story 2 Acceptance Scenario 3, and the "Spec re-revised after triage" edge-case bullet

5791b346 rewrote FR-007 to state: *"There is NO automatic cross-run finding-matching and NO disposition inheritance: a re-barrage produces a new lift section, and a persisting defect re-surfaces as a NEW `open` entry to be triaged again."* FR-007 then reinterprets SC-004 as satisfied by *"the literal `Status:` line on each entry, not a similarity heuristic."* But three other surfaces were not updated to match, and they assert a behavior the no-matching model structurally cannot produce:

- **US2 Acceptance Scenario 3**: *"Given a previously-dispositioned finding, When the barrage re-runs on a later revision, Then **the result distinguishes still-open findings from already-dispositioned ones**."*
- **SC-004**: *"a re-run **correctly distinguishes still-open findings from already-dispositioned ones**."*
- **Edge Cases / "Spec re-revised after triage"**: *"the new run **re-surfaces still-open findings** and any new ones."*

Under no-matching, a re-barrage re-lifts *every* finding as a brand-new `open` entry. A persisting defect therefore exists simultaneously as (a) a dispositioned entry in run N's section AND (b) a fresh `open` entry in run N+1's section — it is at once "already-dispositioned" and "still-open." SC-004 and US2-AS3 assume those two sets are disjoint and that the *re-run itself* partitions them; the corrected model makes them overlapping and gives the re-run no way to know which new `open` entries are persisting-vs-genuinely-new. Likewise "re-surfaces *still-open* findings" is impossible: the run cannot selectively re-surface still-open ones because it has no link back to prior dispositions. This is precisely the kind of author-introduced internal contradiction the feature exists to catch, now sitting inside its own spec. Fix: rewrite SC-004, US2-AS3, and the re-revise edge-case bullet to the no-matching reality — e.g. "dispositions of prior runs are preserved in their own lift sections; a re-run produces a fresh all-`open` section and does NOT attempt to correlate entries across runs" — and drop the "distinguishes still-open from already-dispositioned" framing entirely, since it describes the deleted mechanism.

## 2026-06-07 — audit-barrage lift (20260607T054607983Z-pluggable-lifecycle-providers-after_clarify)

### AUDIT-20260607-42 — FR-008 health predicate excludes non-zero exit codes — a crashed-after-output family is counted "healthy," which can mask a zero-coverage outage as a governed clean run

Finding-ID: AUDIT-20260607-42 (claude-01 + claude-02 + claude-03 + claude-04 + claude-05 + claude-06 + claude-07 + codex-01 + codex-02; cross-model)
Status:     fixed-ce223ce5 (operator-approved option 1: split the conflated predicate. `isModelRunHealthy` stays LIFTABILITY (bytes>0 + no spawnError) and still governs what the lift extracts; new `isModelRunCovering` = liftability AND exitCode===0 now governs the FR-008 coverage count, the FR-005 zero-coverage OUTAGE, the clean-run claim, the summary line, and the tip.sha gate. A crash-after-banner family is liftable but not covering, so it can no longer make a run governed-clean; its bytes are still lifted in a mixed run. exitCode===0 also excludes timeout(-1)/spawn(-2), closing the FR-008 prose-vs-code gap. Spec 004 reconciled whole-artifact; RED-first barrage-coverage-predicate.test.ts (12); 91/91 + tsc clean.)
Severity:   high
Surface:    specs/004-spec-governance/spec.md — FR-008 ("healthy ... emitted ≥1 byte of stdout and incurred no spawn/timeout error") in conjunction with FR-005/US3/SC-003 (fail-loud, zero silent skips)

FR-008 fixes the health predicate as **byte-presence + no spawn/timeout error** and explicitly disclaims any parseability requirement: *"an exit-0 family that emits a non-finding blob is counted healthy, and the lift simply extracts 0 findings from it, treated as a clean contribution."* The enumerated failure modes are only **spawn** and **timeout** — a **non-zero exit code is not in the predicate**. A CLI model family that prints a startup banner or a partial response and then dies with `exit 1` (rate-limit, auth expiry, mid-stream network drop — all common for these tools) satisfies "≥1 byte of stdout and no spawn/timeout error" and is therefore counted **healthy**, contributing **0 findings** as a "clean contribution."

This punches a hole in the feature's core safety guarantee. FR-005/US3/SC-003 promise the flow **fails loud** when there is no real coverage, with "zero silent skips." But the zero-healthy outage (FR-005, Edge Cases "ALL available families fail at runtime") is defined in terms of the FR-008 health count. If the only configured family crashes after emitting one byte, the run records **1 healthy family / 0 findings** — indistinguishable in the record from FR-009's legitimate "≥1 family ran and found nothing" clean run. The spec it is governing graduates as **governed-clean** when in fact nothing audited it. That is precisely the false-assurance failure mode US3 exists to prevent, reintroduced through the predicate's own definition.

A reasonable fix: extend the unhealthy set to include **non-zero process exit** (not just spawn/timeout), so a family that exits abnormally is excluded from the healthy count regardless of whether it emitted bytes; or, at minimum, require the spec to state explicitly how a non-zero-exit-with-output family is classified and why counting it healthy does not undermine FR-005. As written the predicate is under-specified in exactly the direction that converts an outage into a silent pass.

---

## 2026-06-07 — audit-barrage lift (20260607T101208624Z-pluggable-lifecycle-providers-after_clarify)

### AUDIT-20260607-43 — Graduation "with open MEDIUM remaining" (FR-010) directly contradicts "residual MEDIUMs are slushed at convergence" (SC-007 / FR-015)

Finding-ID: AUDIT-20260607-43 (claude-01 + claude-02 + claude-03 + claude-04 + claude-05 + claude-06 + claude-07 + codex-01 + codex-02; cross-model)
Status:     fixed-aa77929e (REAL contradiction — verify-premise confirmed against code: slush (`slush-findings.ts`/`slush-remaining.ts`, dampener-gated) runs automatically in `protocol.ts` BEFORE the gate every pass (render→barrage→lift→slush→gate), and the gate counts only OPEN findings — so residual MEDIUMs are slushed out of the open set before graduation is evaluated. The dampener engages on the SAME two-consecutive-0-HIGH predicate as branch (b). Spec-only fix: deleted FR-010's "MAY graduate while open MEDIUM remain" framing; aligned FR-010/FR-015/SC-007/AUDIT-03/Audit-protocol-entity to the automatic-slush-before-gate reality — no reachable graduation carries open MEDIUM. No code change.)
Severity:   high
Surface:    specs/004-spec-governance/spec.md — FR-010 vs SC-007 vs FR-015 (the two-consecutive branch + dampener)

FR-010 states the two branches are "intentionally asymmetric … the two-consecutive branch does not require 0 MEDIUM, so a spec **MAY graduate via two-consecutive-quiet while open MEDIUM findings remain**." But FR-010 *also* defines the dampener as engaged precisely "when the most recent **two recorded barrage runs** … **each** produced **0 open HIGH** … — i.e. the two-consecutive-quiet window is satisfied," and says that when engaged "those residual MEDIUM/LOW findings **are slushed** … so the loop terminates." SC-007 restates the slush as the graduation reality: "residual MEDIUMs at two-consecutive convergence **are slushed to `acknowledged-slush-pile-<date>`** … never silently dropped."

These cannot both be true. The dampener-engaged condition and the branch-(b) graduation condition are *the same predicate* (two consecutive 0-HIGH runs). So at the exact moment branch (b) becomes satisfiable, the dampener is engaged and FR-015/SC-007 say the residual MEDIUMs are slushed — which makes them `acknowledged-slush-pile`, i.e. **not open**. There is therefore no reachable state in which a spec "graduates via two-consecutive-quiet **while open MEDIUM findings remain**," because the same condition that opens branch (b) is the condition that slushes the MEDIUMs out of the open set. Either FR-010's "open MEDIUM findings remain" framing is wrong (they're always slushed first), or slushing is *not* automatic-on-engage and FR-015/SC-007 over-state it. The spec never resolves whether slush is an automatic flip the moment the dampener engages or an explicit gated operation that may not yet have been invoked — and that unspecified mechanism is exactly what decides which of the two contradictory sentences is correct. Fix: state plainly whether slushing is automatic when the dampener engages (then delete "while open MEDIUM findings remain" from FR-010) or an explicit operator/agent action (then SC-007 must say "MAY be slushed," and FR-010 must describe the graduated-with-open-MEDIUM state as real and recorded).

## 2026-06-07 — audit-barrage lift (20260607T182804201Z-pluggable-lifecycle-providers-after_clarify)

### AUDIT-20260607-44 — Burn-down is structurally non-functional: the auto-slush-before-gate + persistently-engaged dampener re-slushes residual MEDIUMs every pass, so a re-opened slush finding can never reach the gate

Finding-ID: AUDIT-20260607-44 (claude-01 + claude-02 + claude-03 + codex-01 + codex-02; cross-model)
Status:     fixed-d4cad0e9 (spec-only: burn-down reframed as out-of-loop manual remediation; FR-015/FR-010/FR-007/SC-007/AUDIT-03/Key-Entities aligned; verified against slush-findings.ts/govern/protocol.ts/spec-governance-gate.ts — code already implements out-of-loop burn-down, no code change. First finding surfaced under the blast-radius rubric; cross-model HIGH, genuine, not phantom.)
Severity:   high
Surface:    specs/004-spec-governance/spec.md — FR-015 (burn-down) in conjunction with FR-010 (dampener engaged on two-consecutive-0-HIGH; slush runs render→barrage→lift→**slush**→gate) and FR-007 (gate/slush evaluate **the most-recent run's** open findings)

FR-015 promises burn-down works: *"The slush MUST be reversible: a burn-down operation re-opens slush-pile findings so a later pass can fix them … and revisit the pile when we choose."* But trace the governed loop the spec actually defines and burn-down has no teeth:

1. A spec reaches the stable state (two consecutive 0-HIGH runs) — the dampener is **engaged** (FR-010). 2. The operator runs a burn-down: old `acknowledged-slush-pile-<date>` MEDIUMs flip back to `open`. 3. To "fix them in a later pass" the operator re-barrages. 4. The new run is, by FR-007, all-`open`; the residual MEDIUMs re-surface in the **most-recent** run. 5. But HIGHs are still clear (that's why they were slushed), so the new run + the prior run still satisfy two-consecutive-0-HIGH — **the dampener is still engaged** — and the slush step runs **automatically, before the gate, on every protocol pass** (FR-010/FR-015). 6. The just-re-surfaced MEDIUMs are **immediately re-slushed** before the gate evaluates. Meanwhile the re-opened *old* slush entries live in an older lift section, and the gate counts only **the most-recent run's** open findings (FR-007), so they are never gate-counted either.

The net effect: once a spec is in the stable-0-HIGH regime, **no re-opened MEDIUM can ever block graduation** — the loop auto-slushes it on the very next pass, and the old re-opened copy is out of gate scope. The FR-015 burn-down capability is therefore a no-op inside the governed loop; an agent building FR-015 verbatim would ship a feature that re-opens findings to `open` and then watches the next governed pass silently bury them again, with no test catching it (nothing asserts a burned-down finding actually survives to the gate). A reasonable fix: define burn-down as a mode that **suppresses the auto-slush step** (or forces branch-(a) 0-MEDIUM gating) for the passes following a burn-down, so the re-opened MEDIUMs actually block until fixed; OR state explicitly that burn-down operates **outside** the governed convergence loop as a separate remediation pass. As written, the two mechanisms (auto-slush-on-engage and reversible-burn-down) directly cancel each other and the spec never resolves the conflict.

## 2026-06-07 — audit-barrage lift (20260607T184028833Z-pluggable-lifecycle-providers-after_clarify)

### AUDIT-20260607-45 — Prior-run open findings are invisible to the gate, so SC-006 ("won't graduate until a surfaced finding is dispositioned") and SC-007 ("no open MEDIUM at graduation") both fail for any finding surfaced in an earlier run than the gating one

Finding-ID: AUDIT-20260607-45 (claude-01 + claude-02 + claude-03 + codex-01 + codex-02 + codex-03; cross-model)
Status:     fixed-5f649ceb (gate strengthened: blocking open-set is the checkpoint-wide literal-Status union of un-dispositioned HIGH/BLOCKING across all recorded runs; two-consecutive-0-HIGH verdict stays per-run; SC-006 honored literally, SC-007 open-MEDIUM scoped to the gating run. code+spec+RED test gate-crossrun-open-high.test.ts; 97/97. Second genuine cross-model HIGH under the blast-radius rubric — not phantom.)
Severity:   high
Surface:    specs/004-spec-governance/spec.md — SC-006 in conjunction with FR-007 (gate evaluates "the most-recent run's open findings"; "NO automatic cross-run finding-matching and NO disposition inheritance") and FR-010 branch (b) (two-consecutive 0-HIGH)

SC-006 states the headline safety guarantee deterministically: *"Once a seeded self-contradiction is surfaced as an open HIGH+/BLOCKING finding, the convergence gate does NOT graduate the spec until that finding is dispositioned (fixed, acknowledged, or recorded-override)."* But FR-007 fixes the gate's open-set as **only the most-recent run's** findings, with **no cross-run matching and no inheritance** — a finding surfaced in run N persists as `open` in run N's lift section forever, and the gate never looks back at it. Trace the two mechanisms together: run 3 surfaces a real HIGH (open). The barrage is stochastic (AUDIT-04: *"a stability heuristic, not a determinism proof"*); runs 4 and 5 happen to **not** re-flag it. The gate at run 5 evaluates the most-recent run (run 5 = 0 open HIGH) and, via branch (b), sees runs 4+5 as two-consecutive-0-HIGH → **graduates**. The run-3 HIGH is still `open`, never dispositioned. SC-006 is violated, and nothing in the artifact carries the run-3 finding forward to block the gate.

The same root cause breaks SC-007 on the MEDIUM axis, in a way AUDIT-43's auto-slush-before-gate fix did **not** close: FR-015 slushes only *"the residual MEDIUM/LOW findings of the **most-recent** barrage."* So run 1's open MEDIUMs (surfaced when the dampener was not yet engaged, hence never slushed) remain `open` in run 1's lift section after the spec graduates via run 2/3. SC-007 claims *"no spec graduates carrying **open** MEDIUM findings either"* — literally false for prior-run residue. An agent writing the SC-007 verification ("scan the audit-log, assert zero open MEDIUM") will get a false failure on a legitimately-graduated spec; an agent writing the gate per FR-007/FR-010 (most-recent-run-only, which is exactly what those FRs specify) will build a gate that violates SC-006 by default.

Blast radius: this is the feature's reason to exist — the motivating *"author introduced 3 contradictions"* case. The natural, FR-compliant build (memoryless-of-findings gate over the most-recent run) is the one that ships the SC-006 hole, and in **unattended** mode (FR-014, no fixer present, the spec re-barraged unchanged) the stochastic-miss path is not an edge case — it is the expected path to graduating a spec that still carries an open high-confidence defect. A reasonable fix: state that the gate's blocking open-set is **the union of un-dispositioned HIGH/BLOCKING findings across all of this checkpoint's recorded runs** (only the *consecutive-0-HIGH verdict* is per-run), so a surfaced-then-flickered-out HIGH still blocks until explicitly dispositioned; and scope SC-007's claim to "no open MEDIUM **in the gating run**," not the whole log.

---

## 2026-06-07 — audit-barrage lift (20260607T190229243Z-pluggable-lifecycle-providers-after_clarify)

### AUDIT-20260607-46 — "The dampener is engaged" is defined two incompatible ways — the explicit definition makes branch (a) single-run graduation unreachable

Finding-ID: AUDIT-20260607-46 (claude-01 + claude-02 + claude-03 + claude-04 + claude-05 + codex-01 + codex-02 + codex-03; cross-model)
Status:     fixed-381d1267 (spec-only: "dampener engaged" disambiguated to (branch a OR branch b) uniformly — gate part-1 AND FR-015 slush trigger — matching dampened in check-barrage-dampener.ts:206; two-consecutive-0-HIGH reframed as branch (b) sub-predicate; branch (a) single-run graduation restored; FR-010/FR-015/FR-007/SC-007/Key-Entities swept; AUDIT-45 cross-run-union intact. Self-inflicted by the AUDIT-45 fix; verify-premise corrected the fix direction. Third genuine cross-model HIGH under the blast-radius rubric — not phantom.)
Severity:   high
Surface:    specs/004-spec-governance/spec.md — FR-010 (gate "BOTH" condition vs. the "The dampener is engaged for a checkpoint when..." sentence)

FR-010 uses the phrase "the dampener is engaged" as one of the gate's two graduation conditions and defines it inclusively: *"The gate graduates only when BOTH hold: the dampener is engaged AND the cross-run union of open HIGH/BLOCKING findings is empty. The dampener (part 1) is satisfied when **either** a single barrage iteration produces 0 open HIGH and 0 open MEDIUM findings, **or** two consecutive iterations each produce 0 open HIGH findings."* So here "the dampener is engaged" ≡ (branch a **OR** branch b). A few sentences later FR-010 redefines the *same phrase* exclusively: *"The **dampener** is **engaged** for a checkpoint when the most recent **two recorded barrage runs** for that checkpoint **each** produced 0 open HIGH ... — i.e. the two-consecutive-quiet window is satisfied."* This second definition is branch (b)'s predicate **only** — it drops branch (a).

The two definitions disagree, and the disagreement is graduation-affecting, not cosmetic. An agent that keys the gate off the explicit "the dampener is engaged when [two-consecutive-quiet]" sentence (the natural one to grab, since it's the one phrased as a definition) builds a gate of the form `two_consecutive_0_HIGH AND union_empty` — under which **branch (a) can never fire**: a single, first, perfectly-clean barrage run (0 HIGH, 0 MEDIUM, union empty) does NOT satisfy a two-run window, so the spec does not graduate and a redundant second barrage is forced on every clean spec. That directly contradicts FR-010's own enumerated branch (a) (*"branch (a) requires a single run with both 0 open HIGH and 0 open MEDIUM"*) and SC-007's two-branch criterion. The root cause is that the spec overloads "dampener" for two different predicates: the **gate's part-1 verdict** (a OR b) and the **slush-gating trigger** (two-consecutive only, FR-015). A reasonable fix: reserve "dampener engaged" for the slush trigger (two-consecutive), and in the gate condition say "the **part-1 convergence verdict** (branch a or b) is satisfied" — never "the dampener is engaged" — so the gate's condition and the slush trigger are named distinctly and branch (a) survives.

## 2026-06-07 — audit-barrage lift (20260607T191358937Z-pluggable-lifecycle-providers-after_clarify)

### AUDIT-20260607-47 — FR-010's absolute "no reachable graduation state carries open MEDIUM" contradicts SC-007's gating-run scoping — the AUDIT-45 fix scoped SC-007 but left the absolute claim standing in three other places

Finding-ID: AUDIT-20260607-47 (claude-01 + claude-02 + claude-03 + codex-01 + codex-02 + codex-03; cross-model)
Status:     fixed-65e2936d (slush now bins ALL remaining MED/LOW at convergence (protocol --scope all, confined to checkpoint; code+RED test) so "no open MEDIUM at graduation" is literally true; spec convergence rule DRY-collapsed to a single canonical FR-010 statement, all other sites reference it; SC-007 restored to clean absolute. Resolves the FR-010/entity/AUDIT-03 vs SC-007 contradiction at its ROOT — prose duplication (the generator of findings 44/46/47). Fourth genuine cross-model HIGH under the blast-radius rubric — not phantom.)
Severity:   high
Surface:    specs/004-spec-governance/spec.md:131 (FR-010) and :144 (Audit-protocol entity) and :34 (AUDIT-03 clarification), in conflict with :157 (SC-007); mechanism at :126 (FR-007) / :136 (FR-015)

FR-010 (line 131) makes an **absolute** claim: *"There is therefore **no reachable graduation state that carries open MEDIUM findings**: … branch (b) graduates only after the two-consecutive-0-HIGH window has caused the slush step to clear **the residual MEDIUMs** out of the open set."* The Audit-protocol entity (line 144, *"graduation never carries open MEDIUM findings"*) and the AUDIT-03 clarification (line 34) repeat the same absolute. But SC-007 (line 157) — rewritten by the AUDIT-45 fix — **scopes the same guarantee to the gating run** and explicitly admits the exception: *"The MEDIUM guarantee is scoped to **the gating run** … earlier runs' MEDIUMs that were never re-flagged are **out-of-scope residue, not a graduation blocker**."* These cannot both be true.

The absolute claim is the false one, and it's mechanically reachable. The slush step touches only **one** run — FR-007 (line 126): *"The slush step (FR-015) flips the **most-recent run's** residual MEDIUM/LOW findings"*; FR-015 (line 136): *"the residual … findings of the **most-recent barrage**."* But branch (b)'s window spans **two** runs, and the slush only fires *when the dampener engages*. Concrete trace: run 1 produces 0 HIGH + 2 open MEDIUMs — the dampener is not yet engaged (branch (a) needs 0 MEDIUM, branch (b) needs a prior 0-HIGH run; neither holds), so per FR-015 the slush **refuses** and run 1's 2 MEDIUMs stay `open`. Run 2 produces 0 HIGH → runs {1,2} are two-consecutive-0-HIGH → dampener engages → slush fires on the **most-recent** run (run 2) only. Run 1's 2 MEDIUMs are never slushed. The cross-run union (HIGH/BLOCKING only) is empty, so the gate graduates — **carrying run 1's open MEDIUMs**, exactly what FR-010 says is unreachable. (This is the same MEDIUM-residue path AUDIT-45 flagged; the fix scoped SC-007 but did not sweep FR-010/the entity/the clarification, so the contradiction now lives between them rather than being resolved — this is a new instance, not a re-litigation of AUDIT-45's disposition.)

Blast radius is graduation-affecting. An agent building the gate from FR-010's absolute wording will naturally mirror the cross-run HIGH union with a **cross-run MEDIUM scan** ("assert zero open MEDIUM across all lift sections before graduating") — which then blocks graduation on stale prior-run MEDIUM residue and defeats the slush pile's entire reason to exist (terminate cleanly once HIGHs are stable). An agent building from SC-007 gets it right. The readings diverge on the central convergence logic and the artifact asserts both. A reasonable fix: pick one and sweep all four sites. Either (a) reword lines 34/131/144 to SC-007's scoped form (*"no graduation carries open MEDIUM **in the gating run**"*), or (b) if the absolute guarantee is actually wanted, change FR-015/FR-007 so the slush operates over **the full two-consecutive-0-HIGH window** (slush every run in the window's residual MEDIUMs, not just the most-recent), which would make the absolute claim true. As written, the spec promises (a)'s scope in SC-007 and (b)'s guarantee in FR-010.

---

## 2026-06-07 — audit-barrage lift (20260607T194327553Z-pluggable-lifecycle-providers-after_clarify)

### AUDIT-20260607-48 — Override scope is declared but only env-var-warned, not enforced — an exported `GOVERN_OVERRIDE` silently graduates every spec/checkpoint in unattended mode, hollowing SC-006/SC-007

Finding-ID: AUDIT-20260607-48 (claude-01 + claude-02 + claude-03 + codex-01 + codex-02 + codex-03; cross-model)
Status:     open
Severity:   high
Surface:    specs/004-spec-governance/spec.md — FR-010 (the override paragraph: "An override is **scoped** to the spec (feature) + checkpoint … while a persistent exported `GOVERN_OVERRIDE` would apply to subsequent runs and is a **known hazard**"), in tension with the Session-2026-06-07 AUDIT-19 clarification ("supplied via `GOVERN_OVERRIDE` (env) / `--override`"), SC-006, and SC-007.

FR-010 makes two claims about overrides that cannot both be operative. First it asserts the override is **scoped**: *"An override is scoped to the spec (feature) + checkpoint it applied to (auditable per spec/checkpoint)."* Then it admits the env-var channel is **un**scoped: *"a persistent exported `GOVERN_OVERRIDE` would apply to subsequent runs and is a known hazard operators must avoid."* The AUDIT-19 clarification makes `GOVERN_OVERRIDE` (env) a first-class override channel equal to `--override`. So the spec ships a safety bypass whose scope is described as enforced ("scoped to the spec + checkpoint") but whose dominant mechanism (an ambient env var) is explicitly acknowledged to leak across runs — with nothing in any FR requiring the gate to *reject or ignore* a `GOVERN_OVERRIDE` that doesn't carry a matching spec+checkpoint scope token. "Scoped" here turns out to describe only the **audit record**, not **enforcement**; the spec resolves the gap with a warning, not an invariant.

The blast radius is exactly the feature's reason to exist, and it bites hardest in the unattended/all-night mode FR-014 targets. An agent building the gate has two equally-supported readings: (a) consume an override only when it matches the current spec+checkpoint (enforce scope), or (b) check `if GOVERN_OVERRIDE set → graduate` at gate time (the literal env-var reading). Under reading (b), an operator who exports `GOVERN_OVERRIDE="bypass stubborn spec X"` once leaves it set; every *subsequent* spec at every checkpoint in the batch then graduates with `override.recorded` despite open HIGH/BLOCKING findings — SC-006's *"does NOT graduate until that finding is dispositioned … or recorded-override"* is technically satisfied by a spurious override, and SC-007 is defeated identically. A "warning operators must avoid" is inert in unattended mode because no operator is present to heed it — the feature's headline context is precisely where the only mitigation doesn't apply. A reasonable fix: require the gate to consume an override **only** when its recorded scope matches the current spec (feature) + checkpoint, and to ignore/reject a `GOVERN_OVERRIDE` lacking a matching scope token — converting the "known hazard" into an enforced invariant, so the env channel can't silently bypass a spec it wasn't authorized for. As written, the spec promises scoped behavior in one sentence and ships an unscoped global trigger in the next.

---

## 2026-06-08 — manual finding (surfaced during the 005 implement-governance dogfood)

### AUDIT-20260608-01 — the convergence gate graduates at the FIRST 0-HIGH run (not FR-010 branch a/b), and FR-014's loop bound is realized as an advisory verdict, not a code-enforced interlock

Finding-ID: AUDIT-20260608-01
Status:     open — Facet A FIXED (eed196b3 + spec 98d8c7b0/42277eb1 + skills 0689aa9e); Facet B DEFERRED (operator 2026-06-08: do B only if A does not fix the problem)
Severity:   high
Surface:    plugins/stack-control/src/subcommands/spec-governance-gate.ts (the convergence decision block); plugins/stack-control/src/scope-discovery/promote-findings/check-barrage-dampener.ts:99-137,196-206 (`countHighPlusInSection` counts `Status: open` only; `singleRunCleanEngages`); plugins/stack-control/src/govern/protocol.ts (the `render → barrage → lift → slush → gate` chain); plugins/stack-control/spec-kit/deskwork-governance/commands/speckit.deskwork-governance.govern.md step 4 (the loop lives in skill-body prose); specs/004-spec-governance/spec.md FR-010 (canonical convergence rule), FR-014 (bounded loop), FR-015 (slush). Surfaced manually while driving the `design/document-primitives` (005) implement-phase governance loop; affects BOTH spec-mode and implement-mode governance (one gate, two phases — FR-006).

Two compounding defects make the "non-discretionary" convergence rule (FR-010) neither correctly computed nor mechanically enforced.

**Facet A — the gate graduates at the first 0-HIGH run, collapsing FR-010 branch (a) and branch (b).**
FR-010 graduates a checkpoint only on **branch (a)** — a *genuinely* clean run (0 HIGH **and** 0 MEDIUM "by its own condition", i.e. the run surfaced no MEDs) — **or branch (b)** — *2 consecutive 0-HIGH runs*, where the FR-015 slush legitimately bins that window's MEDs. The operator directive in `check-barrage-dampener.ts:196-204` intended the single-run rule to fire only on "a single **genuinely** clean run … without waiting for the N-streak." But the protocol chain is `render → barrage → lift → **slush** → gate` (protocol.ts), so the FR-015 slush flips every run's open MED/LOW to `acknowledged-slush-pile` **before** the dampener counts — and the dampener counts only `Status: open` entries (`countHighPlusInSection`, line 123: `isOpen = status === 'open' || status === undefined`). Therefore `mostRecent.mediumCount` is **always 0 post-slush**, and `singleRunCleanEngages = highPlusCount === 0 && mediumCount === 0` **degenerates to `highPlusCount === 0`** — it engages on the **first run with 0 open HIGH**, regardless of how many MEDs that run actually surfaced. Graduation (`dampener.dampened && openHigh === 0`) then fires, and the verdict is mislabeled `rule: "single-run-clean"`.

Field evidence (005 implement-governance, 2026-06-08; per-round RAW found-severity): R1 = 2 HIGH / 1 MED (blocked) → R2 = **0 HIGH / 4 MED** → all 4 slushed before the gate → `converged, rule:"single-run-clean", openMedium:0`. Per FR-010, R2 must NOT graduate (branch a needed a genuine 0-MED run — it had 4; branch b needed 2 consecutive 0-HIGH — R1 had HIGHs). The correct FR-010 terminal was **branch (b) at R5** (R4 + R5 both 0-HIGH). Instead the gate reported graduation-eligible every round from R2 on, while silently auto-slushing 1 / 4 / 2 / 1 / 4 / 3 / 3 / 3 MED findings (R2…R9). Net: branch (b)'s 2-consecutive-0-HIGH stability guard — the whole point of branch (b) against a stochastic single-run fluke — never gates anything, and `single-run-clean` is a misnomer for "a run whose MEDs were just slushed." Fix (any one restores FR-010's intent + the R5 terminal): compute `singleRunCleanEngages` on the run's **RAW** found-severity (pre-slush) so branch (a) fires only on a genuinely-clean run; OR evaluate branch (a) before the slush and let slush support branch (b) only; OR drop the single-run rule and require branch (b)'s 2-consecutive-0-HIGH.

**Facet B — FR-014's "the gate bounds the loop" is advisory, not an interlock.**
The gate returns `mayGraduate` (a *permission*; exit 0 on `converged`/`overridden`), but nothing **consumes** it as a hard stop. The multi-round loop is not in code — it lives in the govern skill body as prose ("re-run the governance pass … and repeat until the barrage is clean"), so the agent is simultaneously the **fixer** and the **loop controller**. On `blocked` the loop self-enforces continuation (open findings remain); on `converged` **nothing prevents the agent from running another round**. So a deterministic rule becomes discretionary in practice. Field evidence: with the gate reporting `converged` from R2, the loop still ran to **R9** — the stop was advice the agent was trusted to honor, not a mechanism that refused continuation. This contradicts the program thesis (*make failure states mechanically impossible; do not rely on the agent following a rule in a document*). Fix: move the convergence loop into a **code driver** that calls `barrage → lift → slush → gate`, and on a stop verdict **terminates the loop and returns control** — the agent only performs fix-dispatch *inside* a not-yet-converged loop and never holds the "re-run?" decision. (With Facet A fixed, that driver stops mechanically at the FR-010 terminal — R5 in the field case — and, because the rule is 2-consecutive-0-HIGH, still absorbs stochastic late HIGHs like the R3 AUDIT-34 sentinel-bypass before stopping.)

The two compound: a mis-computed stop signal (A) that is also non-binding (B).

Disposition: **Facet A FIXED 2026-06-08; Facet B DEFERRED (operator).**

**Facet A — fixed (#432), with the design evolved beyond the three options above under three operator directives:**
1. *Raw-surfaced counting.* The dampener window now counts what each run **raw-surfaced** (`Severity:` regardless of `Status:`), so a HIGH-bearing run fixed between runs is not a 0-HIGH run and a slushed-MED run is not single-run-clean — restoring branch (a) genuineness and the branch (b) two-consecutive stability guard (the field R5 terminal). (`check-barrage-dampener.ts`, `spec-governance-gate.ts`; commit `eed196b3`.)
2. *Open issues have no bearing.* The cross-run open-finding union (AUDIT-20260607-45) is **removed** from the gate — the recent-run convergence signal is the whole policy. Rationale: (a) findings are fixed between runs, so a prior `open` entry is stale; (b) an unfixed finding is re-flagged stochastically by the barrage and returns to the recent window. This narrows SC-006 / SC-007 (spec amended).
3. *Single boolean, policy in one place.* The gate prints **only** `true`/`false` on stdout; the exit code encodes execution status, not policy — no `state`/`rule` for a consumer to re-derive. `protocol.ts`/`govern.ts` obey the boolean.
Spec amended: `specs/004` FR-007/010/014/015 + SC-006/007/008 + data-model/quickstart + dated Clarifications entry (`98d8c7b0`, `42277eb1`). Govern skills + README updated to the boolean interface (`0689aa9e`). 251 plugin tests pass; tsc clean; RED-first tests pin the field R2 early-graduation, raw counting, the single-boolean contract, and "open issues have no bearing".

**Facet B (the loop-driver interlock) — DEFERRED** by operator decision (2026-06-08): "we'll do Facet B if Facet A doesn't fix the problem." The convergence loop still lives in the govern skill-body prose (now keyed on the gate's boolean: stop once OPEN). If Facet A proves insufficient, mechanize the loop into a code driver that consumes the gate boolean and refuses another round. Carries forward under `multi/migrate-audit-barrage`.

NOTE: the FR-015 MED auto-slush is itself spec'd/intended; it remains (keeps the graduated record free of open MEDIUM for SC-007) but is no longer load-bearing for the gate decision (raw counting). Cross-ref: the 005 implement-governance GRADUATION III (`docs/1.0/001-IN-PROGRESS/document-primitives/audit-log.md`) where this was surfaced; GitHub issue: audiocontrol-org/deskwork#432 (sibling of #431).

---

## 2026-06-08 — audit-barrage lift (20260608T195501360Z-stack-control-after_clarify)

### AUDIT-20260608-02 — `roadmap next` / readyList omits status, so in-flight items are indistinguishable from pickable work

Finding-ID: AUDIT-20260608-02
Status:     open
Severity:   medium
Surface:    plugins/stack-control/src/roadmap/graph.ts:54-60, plugins/stack-control/src/roadmap/views.ts:9-15

`isReady` returns true for *any* non-terminal item whose `depends-on` targets are all `shipped` and which has no `deferred-until` (`graph.ts:54-58`). `in-flight` is non-terminal, so in-flight items appear in the ready frontier. `readyList` (`views.ts:9-15`) then prints only `  - ${item.identifier}` with **no status**. On the live migrated `ROADMAP.md`, `design:feature/document-primitives` and `design:feature/spec-governance` are both `in-flight` with their deps shipped — so `roadmap next` lists them as "ready" with nothing distinguishing them from `planned` work.

The feature's stated purpose (SKILL.md: "a fresh agent can determine what to work on next … from the document alone") is exactly undercut here: a fresh agent runs `roadmap next`, sees an identifier, and cannot tell it is already under active development. The blast radius is duplicate work on an in-flight feature — the failure mode the roadmap exists to prevent. Note the asymmetry: `blockedReport` (`views.ts:25-30`) *does* surface dependency statuses, so the omission in the ready path is inconsistent within the same file. A reasonable fix: render status in the ready-list line (`  - ${id} (${status})`), or have `next` distinguish "ready & planned" (pickable) from "ready & in-flight" (already active).

### AUDIT-20260608-03 — `decompose` silently drops the original item's scope prose, `deferred-until`, `spec`, and `ref`

Finding-ID: AUDIT-20260608-03
Status:     open
Severity:   medium
Surface:    plugins/stack-control/src/roadmap/mutations.ts:200-247

`decompose` builds each part with `buildSection({ identifier, dependsOn, partOf })` (`mutations.ts:222-228`) — only the inherited `depends-on` and the first `part-of` are carried onto the parts. The original Unit's **scope prose body, `deferred-until`, `spec`, and `ref` are all discarded** when the original section is replaced by `partSections` (`mutations.ts:232-235`). The graph re-validates and writes, so this is silent — no warning, no error.

Two of these losses are materially harmful. Dropping `deferred-until` means decomposing a deferred item **un-defers all the parts**: an item the operator explicitly blocked becomes immediately ready, with no signal. Dropping the scope prose means the human-readable description of *what the work is* vanishes — the parts arrive as bare identifiers. Spec FR-009 only promises that parts inherit "dependencies + grouping," so the deps/grouping behavior is spec-conformant; but the silent loss of the deferral condition and the descriptive body is a semantic regression a consumer would not expect from a "split this item" operation. A fix should at minimum carry `deferred-until` onto every part (or refuse to decompose a deferred item) and preserve/seed the scope text.

### AUDIT-20260608-04 — CLI value-flag scanner accepts a `--`-prefixed token as a flag value, unlike `--doc`

Finding-ID: AUDIT-20260608-04
Status:     open
Severity:   low
Surface:    plugins/stack-control/src/subcommands/roadmap.ts:64-78

`--doc` guards against a missing/option-shaped value: `if (v === undefined || v.startsWith('--')) failUsage(...)` (`roadmap.ts:69-71`). The generic value branch does **not** apply the same guard: `const v = args[++i]; if (v === undefined || BOOLEAN_FLAGS.has(token)) failUsage(...); values.set(token.slice(2), v)` (`roadmap.ts:73-77`). So `roadmap advance x --to --apply` silently sets `to = "--apply"` and consumes `--apply` as the status value, rather than failing usage — the mutation then fails deeper (out-of-vocabulary status) with a more confusing error, and `--apply` is swallowed so a write the operator intended is dropped. Separately, the `BOOLEAN_FLAGS.has(token)` arm is dead code: `--apply`/`--clear` are fully handled in earlier branches, so `token` here is never a boolean flag. Mirror the `--doc` guard (`v.startsWith('--')`) in the generic branch for consistent fail-loud behavior.

### AUDIT-20260608-05 — Kahn's topological sort is duplicated between `edges.ts` and `graph.ts`

Finding-ID: AUDIT-20260608-05
Status:     open
Severity:   low
Surface:    plugins/stack-control/src/document-model/edges.ts:73-118, plugins/stack-control/src/roadmap/graph.ts:108-138

`assertAcyclicAndOrder` (`edges.ts:73-118`) and `order` (`graph.ts:108-138`) implement the same in-degree/frontier Kahn's algorithm twice, differing only in tiebreak (identifier-sort vs. `compareItems` phase relation). The engine already runs `assertAcyclicAndOrder` at load (`document.ts:85-87`) and *discards* its returned order, then `graph.order()` recomputes the topological pass from scratch. This is duplicated logic of exactly the kind the project's DRY guidelines target, and the two copies can drift (e.g., a future fix to cycle handling applied to one and not the other). A single parameterized topo-sort taking a tiebreak comparator would collapse both, and `order()` could reuse the load-time computation rather than redoing it.

### AUDIT-20260608-06 — `reassemble`-based mutations have no test asserting formatting stability across repeated mutations

Finding-ID: AUDIT-20260608-06
Status:     open
Severity:   low
Surface:    plugins/stack-control/src/roadmap/mutations.ts:79-90, plugins/stack-control/tests/roadmap/mutations-decompose.test.ts, plugins/stack-control/tests/roadmap/mutations-reclassify.test.ts

`reassemble` reconstructs the document as `pre` + `unitBodies.join('\n\n')` + `post` (`mutations.ts:84-89`), re-deriving inter-unit spacing as exactly one blank line regardless of the source's original spacing, and relying on each Unit's span to capture its body precisely. The decompose/reclassify tests verify *content* correctness via `loadRoadmap(...).byId` but never assert the written bytes' formatting, and the zero-write tests only check `readFileSync === before` on the *failure* path. There is no test that applies a mutation to a document and then applies a second mutation (or re-parses and re-serializes) to confirm whitespace does not accumulate or shift — i.e., that `reassemble` round-trips stably. Given the live `ROADMAP.md` is the document these mutations run against, a slow formatting drift (extra blank lines per `decompose`/`reclassify`) would go unnoticed by the suite. A regression test that mutates twice and asserts the inter-unit spacing is unchanged would pin this contract; it also surfaces whether blank lines between units are inside or outside the Unit spans, which the current tests leave unverified.

### AUDIT-20260608-07 — Terminal archival can invalidate the roadmap graph

Finding-ID: AUDIT-20260608-07
Status:     open
Severity:   high
Surface:    plugins/stack-control/src/document-model/archive-engine.ts:35-38,176-183; plugins/stack-control/ROADMAP.md:25-33,81-88,101-106; plugins/stack-control/tests/roadmap/curate-archive-regression.test.ts:1-3,47-57

`archive` still selects every terminal-status unit (`shipped`/`cancelled`/`retired`) and writes the live document after cutting those spans, with no edge-aware filtering and no `loadDocumentFromSource(newLive, ...)` validation before the live rewrite. That is incompatible with the new roadmap loader, which requires every `depends-on` / `part-of` target to remain present in the live document.

The migrated canonical roadmap already has this shape: `multi:feature/front-door` is `shipped`, while many live items still `depends-on: multi:feature/front-door`. Running `curate --apply` or `archive --apply` on that document would archive `front-door`, leave dangling references, and make subsequent `roadmap next` / `blocked` loads fail. The regression test explicitly covers only “a terminal-status item with no inbound edges,” so it misses the real canonical case. A reasonable fix is to make roadmap archival edge-aware before writing: skip terminal units that are still unit-edge targets, or validate the post-archive live source and fail zero-write if it would dangle references.

### AUDIT-20260608-08 — Reconcile proposes shipped without the required governance-graduation signal

Finding-ID: AUDIT-20260608-08
Status:     open
Severity:   medium
Surface:    plugins/stack-control/src/roadmap/reconcile.ts:32-40,90-96; specs/006-roadmap-protocol/spec.md:158-160; specs/006-roadmap-protocol/tasks.md:97-101

The spec and completed task T045 say `shipped` determination requires artifact progression including a governance-graduation record. The implementation’s only shipped signal is `tasks.md` exists, contains at least one checkbox, and has no unchecked boxes; it then proposes `advance <id> to shipped`.

This is advisory/report-only, so it will not mutate silently, but a downstream operator or agent following the proposal can mark work shipped before the spec’s own completion gate exists. The blast radius is status drift in the authoritative roadmap, not direct code corruption. A reasonable fix is to include the governance-graduation artifact in `tasksComplete`/status derivation, or downgrade tasks-only completion to an in-flight/completed-tasks signal that does not propose `shipped`.

### AUDIT-20260608-09 — Placeholder Spec Kit plan appears in the audited patch

Finding-ID: AUDIT-20260608-09
Status:     open
Severity:   medium
Surface:    specs/002-parallel-execution-engine/plan.md:1-113

The audit input includes a newly added `specs/002-parallel-execution-engine/plan.md` that is still the raw template: `[FEATURE]`, `[DATE]`, “NEEDS CLARIFICATION,” “ACTION REQUIRED,” and unused option blocks are all present. This is an operator-discipline trap because `specs/002` is a real roadmap correspondence path, and unattended agents may treat the placeholder plan as project state.

If this file is accidental, remove it from the patch. If it is intended, fill it with the real execution-engine plan and delete the unused template branches before it becomes part of the repo state.
