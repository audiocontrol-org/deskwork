---
slug: pluggable-lifecycle-providers
targetVersion: "1.0"
date: 2026-06-04
---

# Pluggable Lifecycle Providers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `dw-lifecycle`'s authoring layer pluggable via a provider port (native | spec-kit | kiro | future), backed by a normalized `lifecycle-manifest.yaml` that the differentiated back half (audit barrage, finding state machine, scope/clone/debt governance) reads regardless of which provider authored the plan.

**Architecture:** Ports-and-adapters with the manifest as the port. Providers implement `detect() / capabilities() / author() / normalize()`. `normalize()` is per-provider, one-way (provider artifact → manifest projection). `reconcile()` is deskwork core operating only on `(current, candidate)` manifests. `workplan.md` demotes from authored-plan + execution-ledger (today's dual role) to ledger-only, rendered from the manifest. The back half branches on `capabilities()`, never on provider identity.

**Tech Stack:** TypeScript (`tsx`) under `plugins/dw-lifecycle/src/`; YAML manifest + JSON-Schema validator; existing override seam `.dw-lifecycle/providers/<name>/`; provider drivers shell out to upstream CLIs (Spec Kit's `specify`, Kiro's IDE state) where applicable.

**Source documents:**
- Feature definition: `docs/1.0/001-IN-PROGRESS/pluggable-lifecycle-providers/feature-definition.md`
- Design spec (canonical for technical detail): `docs/1.0/001-IN-PROGRESS/pluggable-lifecycle-providers/design.md` (302 lines — architecture, manifest schema, normalize/reconcile contracts, capability model)

---

## Phase 1 — Stabilize PRD via deskwork review

Phase 1 is the operator's explicit framing of the front half of every feature on this project — the PRD lives under `/deskwork:ingest` + `/deskwork:review-start` and iterates via studio margin notes until the workflow state becomes `applied`. Until that gate clears, Phase 2 work does not begin (strict CLAUDE.md per-feature gate).

For this feature specifically, design.md is the technical canon; the PRD's job is to capture (a) the operator's chosen ordering of design.md's 7 implementation phases, (b) the dispositions of design.md's 4 open questions (OQ-1 through OQ-4), and (c) any scope-cut decisions the operator wants recorded out-of-scope (the feature-definition explicitly notes scoping is a separate operator-driven pass in setup/issues).

### Task 1: Author the PRD body from feature-definition + design

**Files:**
- Modify: `docs/1.0/001-IN-PROGRESS/pluggable-lifecycle-providers/prd.md` (seeded by `/dw-lifecycle:setup`)

The PRD that `setup` seeds will contain feature-definition's prose flattened into template sections. Task 1 restores structure and adds the PRD-specific content: phase-ordering table, OQ-1..4 disposition prompts, and the design.md reference.

- [ ] **Step 1: Read the seeded PRD** to see what setup produced.

Run via Read tool: `docs/1.0/001-IN-PROGRESS/pluggable-lifecycle-providers/prd.md`.

- [ ] **Step 2: Author the PRD body** to include the following sections (in this order):
  1. Problem Statement (verbatim from feature-definition.md § Problem).
  2. Solution (verbatim from feature-definition.md § Goal + Approach, lightly rephrased to flow as one section).
  3. Reference to design.md as the canonical technical artifact ("See `design.md` for architecture, manifest schema, `normalize()` / `reconcile()` contracts, and the capability model").
  4. Phase-ordering table (the 7 phases from design.md § 8 listed as rows; columns: phase number, name, behavior-neutrality status, depends-on, operator-confirmable ordering).
  5. Open questions table (OQ-1 through OQ-4 from design.md § 8 as rows; columns: OQ id, summary, design's leaning, operator disposition).
  6. Acceptance Criteria (verbatim from feature-definition.md § Acceptance Criteria — 7 bullets).
  7. Out of Scope (verbatim from feature-definition.md § Scope > Out).

Use the Edit/Write tool with the PRD path.

- [ ] **Step 3: Commit** the authored PRD.

```bash
git add docs/1.0/001-IN-PROGRESS/pluggable-lifecycle-providers/prd.md
git commit -m "docs(pluggable-lifecycle-providers): author PRD body from feature-definition + design"
```

### Task 2: Ingest + review-start (if setup didn't)

- [ ] **Step 1: Verify the PRD has a `deskwork.id` UUID in frontmatter.**

Run: `head -10 docs/1.0/001-IN-PROGRESS/pluggable-lifecycle-providers/prd.md`

If `deskwork.id` is present, setup already ingested. Skip to Task 3.

- [ ] **Step 2: Invoke `/deskwork:ingest`** on the PRD path if step 1 showed no ID.

- [ ] **Step 3: Invoke `/deskwork:review-start`** (or `/deskwork:induct`, per the deskwork CLI verb the installed version exposes) on the PRD.

- [ ] **Step 4: Report studio review URL to operator.**

### Task 3: Iterate margin notes until PRD applied

This task loops; the operator drives.

- [ ] **Step 1: Wait for operator to leave margin notes** in the studio review surface; operator says "iterate" when ready.

- [ ] **Step 2: Invoke `/deskwork:iterate`** to read margin notes and address them.

Per the "Empty revisions beat missed changes" rule (still in `agent-discipline.md` until decompose-agent-discipline ships): run iterate when asked even if no disk delta seems pending.

- [ ] **Step 3: For each margin note**, edit the PRD's phase-ordering table, OQ disposition table, Acceptance Criteria, or Out-of-Scope list to reflect operator input. Mark addressed comments via the iterate skill's mechanism.

- [ ] **Step 4: Snapshot the new revision** (iterate handles).

- [ ] **Step 5: Commit** the revision.

```bash
git add docs/1.0/001-IN-PROGRESS/pluggable-lifecycle-providers/
git commit -m "docs(pluggable-lifecycle-providers): iterate PRD revision N — <summary>"
```

- [ ] **Step 6: Report new revision to operator;** wait for next margin notes OR Approve. Loop to Step 1 until workflow state is `applied`.

### Task 4: Extend the workplan with Phase 2+ task breakdown

Once PRD is `applied`, the per-phase TDD-shaped task breakdown can be enumerated against the stabilized phase ordering and OQ dispositions.

- [ ] **Step 1: Verify deskwork workflow state is `applied`** for the PRD.

- [ ] **Step 2: Invoke `/dw-lifecycle:extend pluggable-lifecycle-providers`** to add Phase 2 through Phase 8 sub-phases (one per implementation phase from design.md § 8) with per-task TDD steps derived from design.md's contracts (schema validation, normalize() projection rules, reconcile() merge rules, capability gating).

- [ ] **Step 3: Commit** the extended workplan.

```bash
git add docs/1.0/001-IN-PROGRESS/pluggable-lifecycle-providers/workplan.md
git commit -m "docs(pluggable-lifecycle-providers): extend workplan with Phase 2+ design-phase tasks"
```

### Task 5: File GitHub issues for Phase 2+

- [ ] **Step 1: Invoke `/dw-lifecycle:issues`** to file the parent feature issue + per-implementation-phase issues from the extended workplan.

- [ ] **Step 2: Verify** workplan was back-filled with issue links.

---

## Phase 2 — Extract the lifecycle manifest (load-bearing, behavior-neutral)

Maps to **design.md § 8 phase 1.** The load-bearing refactor: introduce `lifecycle-manifest.yaml` + JSON-Schema validator, make the back half read it, have `native` emit it alongside today's markdown. **Zero behavior change visible to the operator** — this is the seam that everything subsequent slots into.

**Files (to be enumerated in detail by `/dw-lifecycle:extend` after Phase 1 applied):**
- Create: `plugins/dw-lifecycle/src/manifest/lifecycle-manifest.schema.json`
- Create: `plugins/dw-lifecycle/src/manifest/types.ts`
- Create: `plugins/dw-lifecycle/src/manifest/loader.ts` (read + validate)
- Create: `plugins/dw-lifecycle/src/manifest/writer.ts` (write + propose-then-apply skeleton, used in Phase 4)
- Modify: every back-half skill that today reads `workplan.md` task lines — point at the manifest instead. Listed in design.md § 2 "Division of labor": `implement`, `audit-barrage`, `promote-findings`, `re-audit-fixed-findings`, `scope-inventory`, `ship`, `complete`, `session-*`.
- Modify: `plugins/dw-lifecycle/src/skills/setup` (or wherever `native` authoring lives today) to emit the manifest alongside the markdown workplan.

**Acceptance criteria for Phase 2 (subset of feature acceptance criteria):**
- Manifest schema validates against representative fixtures (golden tasks + edge cases enumerated in `/dw-lifecycle:extend`).
- Every back-half skill that today touches `workplan.md` tasks now reads the manifest with byte-identical user-visible output to pre-Phase-2 behavior (the "Phase 1–2 neutrality guarantee" from feature-definition AC #2).
- Snapshot tests cover end-to-end define→implement→audit-barrage cycle on a fixture feature.

**Detailed TDD-shaped task breakdown deferred to `/dw-lifecycle:extend` (Task 4 of Phase 1).** Pre-PRD-approval, hand-rolling per-task TDD steps risks pre-deciding scope before operator confirmation. Per the "Capture mode vs scope mode" rule we're targeting for decomposition: capture is now; scoping is operator-driven and happens in the iterate loop.

---

## Phase 3 — Provider port + `native` adapter

Maps to **design.md § 8 phase 2.** Define the `Provider` interface (`detect()`, `capabilities()`, `author()`, `normalize()`); implement `native` as the reference adapter; route `define`/`setup` authoring through the port. One provider, identical behavior to Phase 2 — the seam exists but isn't yet exercised by a second adapter.

**Files (skeleton):**
- Create: `plugins/dw-lifecycle/src/providers/Provider.ts` (port interface)
- Create: `plugins/dw-lifecycle/src/providers/native/index.ts` (reference adapter)
- Modify: `plugins/dw-lifecycle/src/skills/{define,setup}` to dispatch through the provider port.

**Acceptance criteria (subset):**
- `Provider` interface matches the contract documented in design.md § 7 (port).
- `native.normalize()` produces a manifest identical to what Phase 2's `native` emitter produces directly (no behavior delta).
- `define`/`setup` use the port; bypassing the port is gated by a unit test.

**Detailed task breakdown deferred to `/dw-lifecycle:extend`.**

---

## Phase 4 — `reconcile()` core + re-sync command

Maps to **design.md § 8 phase 3.** Implement reconcile as deskwork core (provider-agnostic), operating on `(current, candidate)` manifests, matching by `provider_task_id`, with the merge rules from design.md § 5.2. Add `propose-then-apply` reconcile report (design.md § 5.3) + a `re-sync` command operator runs after upstream provider edits.

**Files (skeleton):**
- Create: `plugins/dw-lifecycle/src/manifest/reconcile.ts` (core merge engine)
- Create: `plugins/dw-lifecycle/src/manifest/reconcile-report.ts` (rendered diff: added / removed / drifted / orphaned / origin-deskwork-untouched)
- Create: `plugins/dw-lifecycle/src/skills/resync/SKILL.md` + helper script

**Acceptance criteria (subset):**
- Reconcile preserves `status` / `sha` / `governance` on tasks unchanged across re-sync (feature-definition AC #4).
- `origin: deskwork` tasks (no `provider_task_id`) are carried through untouched — protection guarantee.
- Drifted tasks are flagged (per OQ-3 disposition from Phase 1).
- Propose-then-apply renders a reconcile report; operator approves before writing.

**Detailed task breakdown deferred to `/dw-lifecycle:extend`.**

---

## Phase 5 — `spec-kit` adapter

Maps to **design.md § 8 phase 4.** Build the `spec-kit` adapter (shells out to `specify`); add `--provider` flag for per-feature override; add `install`-time detection/selection (does this project already use spec-kit? offer to default it).

**Files (skeleton):**
- Create: `plugins/dw-lifecycle/src/providers/spec-kit/index.ts`
- Modify: `plugins/dw-lifecycle/src/skills/{define,setup}` to honor `--provider`
- Modify: `plugins/dw-lifecycle/src/skills/install/SKILL.md` to detect spec-kit presence

**Acceptance criteria (subset):**
- Feature-definition AC #3: `provider: spec-kit` with `specify`'s `tasks.md` → schema-valid manifest → `implement` walks it → `audit-barrage` fires unchanged.
- `--provider` precedence: per-feature flag > project default > install-time selection.

**Detailed task breakdown deferred to `/dw-lifecycle:extend`.**

---

## Phase 6 — `kiro` importer

Maps to **design.md § 8 phase 5.** Build the `kiro` importer (one-shot import from Kiro's IDE/branch state, not a live driver — per feature-definition Out scope). Wire `capabilities().structured_criteria: ears` so EARS notation upgrades the `ship` verification gate.

**Files (skeleton):**
- Create: `plugins/dw-lifecycle/src/providers/kiro/index.ts`
- Modify: `plugins/dw-lifecycle/src/skills/ship/SKILL.md` to honor `capabilities().structured_criteria`

**Acceptance criteria (subset):**
- Importer produces a schema-valid manifest from a representative Kiro export.
- `ship` verification path branches on capability, not provider name (feature-definition AC #1 — grep gate).
- OQ-2 disposition from Phase 1 dictates trigger ergonomics (`--import-from` vs watched path).

**Detailed task breakdown deferred to `/dw-lifecycle:extend`.**

---

## Phase 7 — Tracker capability + `gh`-skill gating

Maps to **design.md § 8 phase 6.** Add `tracker: { none | github-parent-only | github-per-phase }` capability (default `none`). Demote per-phase issues to opt-in. Gate the four `gh`-touching skills (`issues`, `pickup`, `complete`, `debt-report`) on tracker capability.

**Files (skeleton):**
- Modify: `plugins/dw-lifecycle/src/manifest/types.ts` (add tracker capability)
- Modify: `plugins/dw-lifecycle/src/skills/{issues,pickup,complete,debt-report}/SKILL.md` to capability-gate
- Modify: `.dw-lifecycle/config.json` default for fresh installs

**Acceptance criteria (subset):**
- Feature-definition AC #5: `tracker: none` makes `issues` a no-op; `pickup`/`complete`/`debt-report` route to manifest+journal state with zero `gh` calls.
- Existing features with `github-per-phase` continue to function (backward-compat).

**Detailed task breakdown deferred to `/dw-lifecycle:extend`.**

---

## Phase 8 — Customization polish

Maps to **design.md § 8 phase 7.** Project-local adapter override seam under `.dw-lifecycle/providers/<name>/`, mirroring the existing `.dw-lifecycle/templates/`, `.dw-lifecycle/doctor/` override pattern.

**Files (skeleton):**
- Modify: provider resolver to walk project-local override paths first
- Create: doctor rule for provider-version mismatch (`provenance` vs `.dw-lifecycle/config.json`) — feature-definition AC #6.

**Acceptance criteria (subset):**
- Feature-definition AC #7: stub future provider implementing only `normalize()` yields a runnable lifecycle (deskwork fills substrate, tracking, governance via capabilities).
- Doctor reports provider-version mismatch.

**Detailed task breakdown deferred to `/dw-lifecycle:extend`.**

---

## Final verification

After Phase 8 completes, before `/dw-lifecycle:complete`:

- [ ] **Step 1: Behavior-neutrality regression test.** Run the full lifecycle end-to-end against a fixture feature with `provider: native`; compare every emitted artifact byte-for-byte against a pre-feature baseline.

- [ ] **Step 2: Provider-identity grep gate.** Search the back-half code paths (`implement`, `audit-barrage`, `promote-findings`, `re-audit-fixed-findings`, `scope-inventory`, `ship`, `complete`, `session-*`) for branches on provider name. Feature-definition AC #1 demands zero matches.

```bash
grep -rn "provider.*===.*\|providerName\b" plugins/dw-lifecycle/src/skills/{implement,audit-barrage,promote-findings,re-audit-fixed-findings,scope-inventory,ship,complete} plugins/dw-lifecycle/src/skills/session-* 2>/dev/null
```

Expected: zero matches.

- [ ] **Step 3: spec-kit round-trip test.** With `provider: spec-kit`, drive a fixture feature through `specify` → manifest projection → `implement` → `audit-barrage`. Compare findings emitted against a `native` baseline.

- [ ] **Step 4: Reconcile preservation test.** Author a fixture feature; attach a finding to a manifest task; re-sync after upstream task edits; assert (a) unchanged tasks preserve `status`/`sha`/`governance`, (b) `origin: deskwork` tasks untouched, (c) drifted tasks flagged per OQ-3 disposition.

- [ ] **Step 5: Tracker-none no-op test.** With `tracker: none`, run `issues` and assert zero `gh` calls (mock-and-detect).

- [ ] **Step 6: Doctor rule test.** Hand-edit `provenance.provider_version` to mismatch `.dw-lifecycle/config.json`; run doctor; assert mismatch reported.

- [ ] **Step 7: Capability-driven future-provider test.** Stub a provider implementing only `normalize()`; run the full lifecycle; assert deskwork fills substrate, tracking, governance.

- [ ] **Step 8: Audit-log entry** under `docs/1.0/001-IN-PROGRESS/pluggable-lifecycle-providers/audit-log.md` summarizing per-phase outcomes + OQ resolutions.

- [ ] **Step 9: Commit final-verification artifacts.**

```bash
git add docs/1.0/001-IN-PROGRESS/pluggable-lifecycle-providers/audit-log.md
git commit -m "docs(pluggable-lifecycle-providers): final verification + audit-log entry"
```

After this commit lands, the feature is ready for `/dw-lifecycle:review` → `/dw-lifecycle:ship` → `/dw-lifecycle:complete`.

---

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Phase 2 manifest extraction breaks back-half behavior in subtle ways (the "load-bearing" risk) | Phase 2 ships behind a strict byte-identical-emission regression test against pre-feature baseline; CI gates on it. |
| Phase 5 spec-kit adapter blocks on upstream `specify` CLI behavior changes | `provenance.provider_version` is pinned per-feature (design.md § 5.4); a version bump is a recorded event, not a silent drift. |
| Phase 6 Kiro importer's EARS gate is over-strict and rejects valid features | OQ-4 disposition controls capability re-snapshot vs freeze; conservative default = freeze at first projection (operator can re-run import to upgrade). |
| Phase 7 tracker-capability default change (`none` instead of `github-per-phase`) regresses existing in-flight features | Migration path: existing features pin their pre-Phase-7 capability in their manifest; new features default to `none`. |
| OQ-1 (`scope-inventory` and synthetic phase) blocks Phase 2 manifest design | OQ-1 must be resolved in Phase 1 PRD review before Phase 2 starts; the workplan-extend step (Task 4 of Phase 1) makes Phase 2's task breakdown dependent on OQ-1 disposition. |
| Subscribing back-half skills to the manifest in a single mega-commit (Phase 2) blows up review surface | `/dw-lifecycle:extend` will break Phase 2 into per-skill commits, one back-half consumer per commit, each preserving behavior-neutrality. |
| Reconcile's merge rules under-flag drift (OQ-3) and ship a regression | Start with normalized-text equality (design's default); add property-based fuzz tests; revisit threshold after first real spec-kit re-sync. |
