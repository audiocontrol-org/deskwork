# Feature Specification: Migrate scope-discovery into stack-control (`design/migrate-scope-discovery`)

**Feature Branch**: `feature/stack-control` (authored in-branch with 001–009; operator decision 2026-06-09 — specs accumulate on the pinned worktree branch, no per-spec branch)

**Created**: 2026-06-09

**Status**: Draft

**Input**: User description: "Migrate the scope-discovery mechanism from `dw-lifecycle` into `stack-control` (program codename `design/migrate-scope-discovery`), keeping `dw-lifecycle` working throughout, with per-codebase clone-detection scoping as the new requirement."

## Context & Problem

`stack-control` is the successor to `dw-lifecycle` via absorb-then-retire (`.claude/rules/stack-control-succession.md`). **Scope-discovery** — the duplication-detection + upfront-discovery discipline canonized into `dw-lifecycle` (original design: `docs/superpowers/specs/2026-05-24-scope-discovery-design.md`) — is one of the named keepers. Today its full implementation lives at `plugins/dw-lifecycle/src/scope-discovery/`: a jscpd-backed clone detector with dispositioned baselines, the `scope-inventory` / `scope-widen` discovery flow with four universal discovery agents + a synthesis pass, config-activated agents (regime-holdout / editor-symmetry / adopter-manifest), the sub-agent dispatch wrapper, Step 0 refactor-preconditions, the registries (`anti-patterns.yaml`, `adopter-manifests.yaml`, `migration-map.yaml`), JSON schemas, ~18 `check-*` / `scope-*` CLI verbs + skills, install/customize machinery, and doctor rules.

`stack-control` already holds the **audit-barrage** cross-model audit + the **promote-findings / dampener / slush** machinery (migrated by the sibling `multi/migrate-audit-barrage` work — present under `plugins/stack-control/src/scope-discovery/`). This feature migrates **everything else in scope-discovery that is not yet in stack-control**, natively (built against `stackctl` CLI verbs, `/stack-control:*` skills, and the `.stack-control/` config contract that 009/project-doc-setup just established), without destabilizing `dw-lifecycle`.

The migration is not a verbatim copy. It carries one **new load-bearing requirement** that motivates doing it as its own feature rather than a mechanical port: **per-codebase clone-detection scoping.** Operator principle (2026-06-06): *"duplication detection shouldn't run across codebases."* The legacy detector's `.jscpd.json` uses a whole-repo `pattern: "**/*.ts"` and `clone-detector.ts` scans from `process.cwd()` with no per-codebase `path`, so a `check-clones` run conflates `plugins/dw-lifecycle` + `plugins/stack-control` as one tree — which would false-flag the audit-barrage already vendored into stack-control as duplicates of its dw-lifecycle origin. Per-codebase scoping must become the **default**, not a manual path argument. Until this lands, the repo runs an interim stopgap (`.dw-lifecycle/scope-discovery/clone-snapshot.sh`, advisory snapshot only — no baselines, dispositions, or NEW-gating); this feature replaces that stopgap with the full vendored detector.

**Who this serves:** the operator/agent driving `stack-control` on a project (runs `stackctl` verbs to find duplication, do upfront scope discovery, and gate sub-agent dispatches), and adopters installing `stack-control` (get the discipline through the public install path, not a dev shortcut). The thesis framing applies: scope-discovery is the up-front-leverage half of the barbell — environmental design that makes "agent didn't enumerate siblings before writing code" mechanically catchable rather than a directive that goes unfollowed.

## Clarifications

### Session 2026-06-09

- Q: What defines "a codebase" that per-codebase clone detection scopes to? → A: The nearest-enclosing stack-control installation per the 009 model (walk up to nearest `.stack-control` config, exclude nested child installations' subtrees); an explicit path override is still allowed for the non-default case.
- Q: Should the migration ship as a clone-core-first slice or the full surface in one delivery? → A: **Full surface, one delivery.** All of US1–US8 are built and handed over together. Rationale (operator): partial feature implementation gets dropped on the floor by agents with poor memories — future agents are blind to intended-but-unbuilt capabilities and build around the incomplete as-built shape, causing chaos. The P1/P2/P3 priorities denote **internal build order within the single delivery** (prove the novel per-codebase boundary first, then layer), NOT separate ship increments. Anything genuinely out of this feature's build (see "Captured for future expansion") MUST be tracked as a first-class roadmap/backlog item, never left as intended-but-unbuilt spec prose.
- Q: Migrate the original hook-install machinery, or wire enforcement through skill bodies + CLI verbs? → A: **Drop the hook-install machinery entirely** (no `install-scope-discovery-hooks` / `install-agent-prompts` / `uninstall-*` analogs). The `check-*` CLI verbs migrate as the primitives; enforcement fires from `/stack-control:*` skill bodies + `stackctl` CLI verbs per `.claude/rules/enforcement-lives-in-skills.md`. An adopter who wants a git hook may hand-wire the CLI verbs themselves (documented, never shipped).
- Q: Default fidelity per migrated component — port-and-generalize or native rebuild? → A: **Port-and-generalize is the default for every component**; a native rebuild is chosen only where the port surfaces deskwork conventions baked into *code* (not config/registries, which stay project-owned), decided per-component during the port and recorded per FR-004. Honors integration-first (the proven instances already exist); no component is pre-designated for rebuild.
- Q: Migration semantics — vendor/copy or destructive move? → A: **Vendor/copy.** Copy the implementation into stack-control and generalize it; `dw-lifecycle`'s copy stays fully intact and working (its tests/baselines MUST NOT break — SC-010) until a separate feature retires `dw-lifecycle` wholesale. Required by the isolation invariant (`.claude/rules/stack-control-succession.md`).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Per-codebase clone detection through stackctl (Priority: P1)

An operator working inside one stack-control installation runs the clone detector and gets duplication findings scoped to **that installation's own source tree by default** — never conflating a sibling plugin/package/codebase in the same repository. This is the founding increment and the reason the feature exists: it replaces the advisory `clone-snapshot.sh` stopgap with a real detector that knows its own boundary.

**Why this priority**: It is the new requirement (per-codebase scoping) and the minimum increment that delivers standalone value — a `stackctl` clone check that is correct in a monorepo. Everything else in scope-discovery composes on top of a detector that knows its boundary; shipping it first proves the boundary model end-to-end.

**Independent Test**: Seed two sibling source trees in one repo with an identical code block duplicated across them. Run the clone check for installation A. It reports zero clones against installation B's tree, and reports an intra-A duplicate if one exists. No path argument is supplied — the boundary is resolved from the installation by default.

**Acceptance Scenarios**:

1. **Given** a repo with two stack-control codebases (A and B) sharing a copied block, **When** the operator runs the clone check from within A with no explicit path, **Then** findings include only A-internal duplication and exclude any A↔B cross-codebase match.
2. **Given** the audit-barrage vendored into stack-control from its dw-lifecycle origin, **When** the stack-control clone check runs, **Then** the vendored copy is NOT reported as a clone of the dw-lifecycle original (the two live in different codebases).
3. **Given** an operator who wants a non-default boundary, **When** they supply an explicit scope path, **Then** the detector honors it — but absence of the argument resolves the codebase boundary automatically, never the whole repo.

---

### User Story 2 - Disposition and maintain the clone baseline (Priority: P1)

An operator dispositions clone groups over time (refactor / keep-with-reason / ignore-with-justification), with `refactor` requiring the Step 0 preconditions (a named canonical side + recorded test-proof-of-detection) before it is accepted. A NEW clone introduced by a change is surfaced against the committed baseline; refreshing the baseline re-runs the detector and carries forward the operator's curated dispositions.

**Why this priority**: A detector without a disposition lifecycle is a noise generator — the baseline + NEW-gating + Step 0 gate are what make duplication findings actionable and what let an operator drain a backlog instead of being buried by it. This is the second half of "the full vendored detector, not just the advisory snapshot."

**Independent Test**: Seed a baseline with one un-dispositioned group. Disposition it `keep-with-reason`; re-run the check and confirm it no longer surfaces as NEW. Attempt to disposition a group `refactor` without a canonical side / test-proof and confirm it is refused. Refresh the baseline after a rename and confirm curated dispositions are preserved.

**Acceptance Scenarios**:

1. **Given** a committed clone baseline, **When** a change introduces a brand-new duplicated block, **Then** the gate-mode check surfaces it as NEW and exits non-zero, while pre-existing dispositioned groups do not re-trip the gate.
2. **Given** a `refactor` disposition request, **When** it omits the canonical-side decision or the regression-test proof-of-detection, **Then** the disposition is refused with a message naming the missing precondition.
3. **Given** a curated baseline, **When** the operator refreshes it after a pure file rename, **Then** existing dispositions are carried forward (not silently lost).

---

### User Story 3 - Upfront scope discovery and mid-implementation widening (Priority: P2)

Before implementing a system-wide feature, an operator runs upfront discovery that fans the universal discovery agents across the codebase and synthesizes a scope manifest of the surfaces the feature will touch. Mid-implementation, when the operator names a complaint ("this must also work on X"), a widening pass surfaces the sibling surfaces the original inventory missed.

**Why this priority**: This is the discipline that prevents the brute-force-discovery tail the protocol was built to kill (the S-330/S-550 motivating incident). It depends on the codebase-boundary model from US1 but is otherwise an independent, demonstrable slice.

**Independent Test**: Run upfront discovery against a fixture feature definition over a fixture codebase; confirm a validated scope manifest is produced enumerating the expected surfaces. Run a widening pass with a complaint string; confirm it surfaces an additional surface absent from the first manifest.

**Acceptance Scenarios**:

1. **Given** a feature definition and a codebase, **When** upfront discovery runs, **Then** a schema-valid scope manifest is produced listing discovered surfaces with provenance, and the run leaves an evidence trail.
2. **Given** an existing manifest and an operator complaint, **When** widening runs, **Then** newly surfaced siblings are reported and reconciled against the prior manifest.
3. **Given** "inventory ran green," **When** the synthesis reports novel-shape / discovered candidates, **Then** the result is NOT presented as all-clear (a green registry match is not "no novel anti-patterns").

---

### User Story 4 - Registry-driven anti-pattern, adopter, symmetry, and deprecation checks (Priority: P2)

An operator registers project-owned anti-patterns, adopter-manifests, and migration maps; the corresponding checks scan the codebase for legacy shapes, holdout files that should import a canonical primitive but don't, cross-module adoption asymmetry, and deprecated-but-still-referenced modules. The config-activated discovery agents no-op when their registries are empty, so a small project pays no cost.

**Why this priority**: These are the high-value "regime holdout" detectors, but they are configuration-gated — valuable where a project has the registries, free where it doesn't. They build on the same discovery/synthesis plumbing as US3.

**Independent Test**: With empty registries, confirm the config-activated agents no-op and the checks report nothing. With a seeded anti-pattern entry and a matching legacy file, confirm the scan surfaces the holdout; with a seeded adopter-manifest and a non-importing file, confirm the adopter check flags it.

**Acceptance Scenarios**:

1. **Given** an empty anti-patterns registry, **When** the anti-pattern check runs, **Then** it completes cleanly and the regime-holdout agent contributes nothing to the manifest.
2. **Given** a registered anti-pattern (glob / regex / ast-grep / ts-morph) and a file matching it, **When** the check runs in gate mode, **Then** the holdout is surfaced with severity and exits per the declared severity.
3. **Given** an adopter-manifest declaring an expected importer glob, **When** a matching file does not import the canonical primitive, **Then** the adopter check reports it as a tracked holdout.

---

### User Story 5 - Sub-agent dispatch discipline with tamper-evident gates (Priority: P2)

When the orchestrator dispatches a sub-agent, the dispatch wrapper enforces a `Searched / Included / Excluded` return grammar, requires enumeration of omitted matches when a search found more than was included, and rejects any exclusion reason carrying a forbidden-deferral phrase ("for now", "TODO", "fix later", "until F<n>"). Adversarial validator harnesses with a gutted-stub self-check prove the gates still have teeth (the harness fails if a gutted version of the gate's logic would pass).

**Why this priority**: The dispatch wrapper mechanizes the "Just for now is bullshit" rule and the sibling-enumeration discipline at the exact moment an agent is most likely to skip them. The gutted-stub self-check is what keeps the gate from rotting into a rubber stamp. Valuable and independently testable, but composes after the core detector + discovery exist.

**Independent Test**: Feed the wrapper a dispatch return missing the `Excluded:` enumeration when `Searched > Included` and confirm rejection. Feed it an exclusion reason containing "for now" and confirm rejection. Run the validator harness against a deliberately gutted gate stub and confirm the harness FAILS (catches the gutting).

**Acceptance Scenarios**:

1. **Given** a dispatch that searched many and included one without enumerating the omitted matches, **When** the wrapper validates the return, **Then** it is rejected naming the missing enumeration.
2. **Given** an exclusion reason containing a forbidden-deferral phrase, **When** the wrapper validates, **Then** it is rejected and the phrase is named.
3. **Given** the validator harness, **When** it is run against a stub that has had the gate's real logic removed, **Then** the harness fails (the gutted-stub self-check trips), proving the gate's assertions are load-bearing.

---

### User Story 6 - Install, configure, customize, and doctor scope-discovery in a stack-control project (Priority: P2)

An adopter bootstraps scope-discovery into their installation through the public stack-control surface; the config and registries land under the installation's `.stack-control/` tree (aligned with the 009 config contract). An operator can copy any plugin-default scanner/agent into the project to customize it (override seam), query a per-surface summary of pending vs dispositioned clones, export the current state for external consumption, and run doctor rules that validate the project's registries against the shipped schemas and surface drift.

**Why this priority**: This is the adopter-readiness wrapper — without it the discipline isn't reachable through the public install path (and per the project rules, a discipline only reachable via a dev shortcut "does not exist for an adopter who installs the plugin"). It depends on the underlying mechanisms existing.

**Independent Test**: From a clean fixture project, run install; confirm `.stack-control/scope-discovery/` is created with structurally-valid empty registries + schemas and recorded in the installation config. Copy a default scanner via customize; confirm the override is picked up. Run a doctor rule against a malformed registry; confirm it is flagged.

**Acceptance Scenarios**:

1. **Given** a project with stack-control installed and no scope-discovery config, **When** install runs, **Then** the config dir + empty-but-valid registries + schemas are created under the installation's `.stack-control/` tree and recorded in config (non-destructive, idempotent — consistent with 009 setup semantics).
2. **Given** a plugin-default scanner, **When** the operator runs customize for it, **Then** a project-local override is written and the runtime resolves the override in preference to the default.
3. **Given** a registry file that violates its schema, **When** doctor runs, **Then** the violation is reported naming the file and the rule, without mutating the file unless `--fix` is requested.

---

### User Story 7 - Governance implement-mode runs the per-codebase clone step (Priority: P3)

When governance runs in implement mode over just-completed work, it runs the per-codebase clone-detection step as part of the governance chain — closing the deferred wiring that currently exists only as a TODO comment in the stack-control governance code (`subcommands/govern.ts` + `govern/protocol.ts`).

**Why this priority**: It wires the migrated detector into the governance surface so duplication is caught at the implement boundary, not only on demand. Strictly depends on US1/US2 (the detector must exist and be per-codebase-scoped first).

**Independent Test**: Run governance in implement mode over a change that introduced a NEW intra-codebase clone; confirm the clone-detection step runs and the NEW clone is surfaced in the governance output. Confirm the TODO placeholder is gone.

**Acceptance Scenarios**:

1. **Given** implement-mode governance over a diff with a new intra-codebase duplicate, **When** governance runs, **Then** the clone-detection step executes and reports the NEW clone (scoped to the codebase, not the whole repo).
2. **Given** the wired step, **When** governance runs, **Then** no TODO/placeholder remains in the governance code path for clone detection.

---

### User Story 8 - Install-drift advisory at session start (Priority: P3)

At session start, an advisory check compares each locally-sourced `.specify` extension copy against its plugin source and warns when a local copy is stale relative to the shipped version (re-derived hash or content diff), so an operator running an out-of-date installed extension is told.

**Why this priority**: A guardrail against silently running stale installed tooling. Lowest priority and explicitly home-undecided (this could instead land in the `multi/session-skills` native session surface); captured here so it is not lost. Independent of the detector internals.

**Independent Test**: Point the check at a local extension copy whose content differs from the plugin source; confirm a stale-install warning naming the drifted extension. Point it at an in-sync copy; confirm no warning.

**Acceptance Scenarios**:

1. **Given** a locally-installed extension copy that differs from its plugin source, **When** the advisory runs, **Then** it warns and names the drifted extension (advisory only — does not block).
2. **Given** an in-sync copy, **When** the advisory runs, **Then** it is silent.

---

### Edge Cases

- **Nested installations.** When one installation's subtree contains another installation, the per-codebase clone boundary must exclude the nested child's subtree (consistent with 009 FR-021's nearest-enclosing-config rule). A duplicate that exists only across the parent/child boundary is not an intra-codebase clone of either.
- **Cross-codebase vendored copies.** The audit-barrage (and any future vendored primitive) duplicated from dw-lifecycle into stack-control must never be reported as a clone — it is in a different codebase by construction. This is the canonical false-positive the per-codebase scoping exists to prevent.
- **Empty / absent registries.** Anti-patterns, adopter-manifests, and migration-map absent or empty → config-activated agents no-op; checks complete cleanly; nothing is fabricated.
- **dw-lifecycle untouched.** Running the migrated stack-control verbs must not read from, write to, or otherwise disturb `dw-lifecycle`'s own scope-discovery code, config, or baselines. The two plugins' detectors are independent.
- **Malformed baseline / registry.** A present-but-malformed registry or baseline fails loud, naming the file and reason — never silently treated as empty (no false-clean), consistent with the no-fallbacks principle.
- **No language match.** A codebase with no files matching the detector's language set yields an empty-but-valid result, not an error (TypeScript-only language support is the v1 assumption; see Assumptions).
- **Gutted gate.** If a gate's real logic is removed, the adversarial validator harness's gutted-stub self-check must fail; a gate whose harness still passes against a gutted stub is itself a defect.
- **Concurrent installations in one repo.** A clone refresh or disposition in installation A must produce zero changes to installation B's baseline/registries.

## Requirements *(mandatory)*

### Functional Requirements

**Migration & isolation**

- **FR-001**: The scope-discovery surface not already present in stack-control MUST be made available natively in `stack-control` — invocable through `stackctl` CLI verbs and `/stack-control:*` skills — without depending on `dw-lifecycle` at runtime.
- **FR-002**: The migration MUST NOT modify, remove, or destabilize `dw-lifecycle`'s scope-discovery implementation, config, or baselines (isolation invariant). `dw-lifecycle` keeps a working copy until it is retired wholesale by a separate feature; this migration uses vendor/copy semantics, never a destructive move out of `dw-lifecycle`.
- **FR-003**: The already-migrated audit-barrage / promote-findings / dampener / slush machinery MUST NOT be re-migrated or duplicated; this feature composes with it where the discovery flow references findings.
- **FR-004**: Each migrated component MUST record whether it was ported with generalization (deskwork-coupling removed) or rebuilt native, so the migration's fidelity to the original is auditable (see Assumptions for the default).

**Per-codebase clone detection (the new requirement)**

- **FR-005**: The clone detector MUST scope detection to a single codebase by default, resolved from the invocation context, and MUST NOT scan across codebase boundaries unless an explicit override is supplied.
- **FR-006**: Per-codebase scoping MUST be the DEFAULT behavior — reachable with no path argument — not an opt-in flag the operator must remember.
- **FR-007**: The codebase boundary MUST be derived from the stack-control installation model established by 009 (the nearest enclosing installation, excluding any nested child installations' subtrees), so duplication detection aligns with the same boundary every other governed verb resolves against.
- **FR-008**: A code block duplicated across two distinct codebases (e.g. audit-barrage vendored from dw-lifecycle into stack-control) MUST NOT be reported as a clone by either codebase's detector.
- **FR-009**: The full clone detector MUST replace the interim advisory `clone-snapshot.sh` stopgap: it MUST support dispositioned baselines, NEW-detection against the committed baseline, baseline refresh, and per-group disposition — not merely an advisory snapshot.

**Clone disposition lifecycle**

- **FR-010**: An operator MUST be able to disposition a clone group as `refactor`, `keep-with-reason`, or `ignore-with-justification`, with a required reason.
- **FR-011**: A `refactor` disposition MUST be refused unless it records the Step 0a canonical-side decision (which side is canonical, and why) AND the Step 0b regression-test proof-of-detection (tests exist with recorded proof that they detect the defect), per the original Step 0 model.
- **FR-012**: A gate-mode clone check MUST surface clone groups that are NEW relative to the committed baseline and exit non-zero on a NEW finding, while dispositioned groups do not re-trip the gate.
- **FR-013**: Refreshing the baseline MUST re-run the detector and carry forward operator-curated dispositions (including across pure file renames), never silently dropping curated state.
- **FR-014**: Bulk disposition of multiple clone groups with a single (disposition, reason) MUST be supported.

**Upfront discovery & widening**

- **FR-015**: An upfront discovery run MUST fan the universal discovery agents across the codebase and synthesize a schema-valid scope manifest enumerating discovered surfaces with provenance, leaving a per-run evidence trail.
- **FR-016**: A widening run MUST take an operator complaint and surface sibling surfaces missed by the prior inventory, reconciled against the existing manifest.
- **FR-017**: A green inventory result MUST distinguish "no match against the registered catalog" from "no novel anti-patterns": novel-shape / discovered-candidate signals MUST be surfaced and MUST NOT be presented as all-clear.
- **FR-018**: The universal discovery agents (route enumeration, ast-grep pattern matrix, clone-baseline reader, PRD-themed pattern hunter) and the synthesis pass MUST be available, with the route enumerator's framework default overridable through the customize seam.

**Registry-driven checks (config-activated)**

- **FR-019**: Project-owned registries (anti-patterns, adopter-manifests, migration-map) MUST be supported with shipped JSON schemas; the config-activated agents (regime-holdout, module/editor-symmetry, adopter-manifest checker) MUST activate only when their registry has entries and MUST no-op otherwise.
- **FR-020**: The anti-pattern scan MUST support the registry's declared pattern types (glob, regex, ast-grep, ts-morph), dispatch per declared type, and honor each entry's severity (blocks vs warns) in gate mode.
- **FR-021**: The adopter check MUST flag files matching a primitive's expected-adopter glob that do not import the canonical primitive (holdouts), honoring declared exceptions and tracked-holdout entries.
- **FR-022**: The module-symmetry check MUST render a cross-module adoption matrix across parallel top-level modules (preserving the legacy `check-editor-symmetry` deprecation alias for one release cycle, per the existing plan).
- **FR-023**: The deprecation check MUST surface `@deprecated` modules together with the importers still holding them in place.

**Dispatch discipline**

- **FR-024**: The dispatch wrapper MUST enforce the `Searched / Included / Excluded` return grammar, MUST require enumeration of omitted matches when `Searched > Included`, and MUST reject exclusion reasons containing a forbidden-deferral phrase (with a project-overridable phrase list).
- **FR-025**: When a dispatched task carries a refactor marker, the wrapper MUST append the refactor-preconditions checklist prelude.
- **FR-026**: Adversarial validator harnesses MUST be provided for the gates, each including a gutted-stub self-check that FAILS if a gutted version of the gate's logic would pass; a verb MUST run the harness suite so an operator can verify their installed gates have teeth.

**Install / config / customize / doctor / export**

- **FR-027**: Scope-discovery MUST be bootstrappable through the public stack-control surface, creating the config dir + empty-but-valid registries + schemas under the installation's `.stack-control/` tree and recording their locations in the installation config — non-destructive and idempotent, consistent with 009 setup semantics.
- **FR-028**: The config and working-file locations for scope-discovery MUST resolve through the 009 installation config contract (project-local by default, no silent fallback to a plugin-bundled copy).
- **FR-029**: An operator MUST be able to copy any plugin-default scanner / discovery agent into the project as an override via the customize seam, and the runtime MUST resolve the project override in preference to the default.
- **FR-030**: A per-surface summary of pending vs dispositioned clone groups MUST be queryable, and the current scope-discovery state (clones + anti-patterns + holdouts + summary) MUST be exportable for external consumption.
- **FR-031**: Doctor rules MUST validate the project's registries/baseline against the shipped schemas, flag refactor-incomplete dispositions, and surface override/mirror drift — reporting by default and mutating only on an explicit fix request.

**Governance & session wiring (deferred sub-scopes, captured)**

- **FR-032**: Governance implement-mode MUST run the per-codebase clone-detection step as part of its chain, replacing the current TODO placeholder in the stack-control governance code path.
- **FR-033**: A session-start advisory MUST compare each locally-sourced `.specify` extension copy against its plugin source and warn (advisory, non-blocking) when a copy is stale. (Home undecided — this feature or `multi/session-skills`; see Open Questions.)

**Cross-cutting quality (constitution-derived)**

- **FR-034**: Every migrated module MUST be reachable through the `stackctl` CLI with no Claude-Code-specific surface required (CLI is the vendor-neutral core; skills are thin adapters) — consistent with 009 FR-025/FR-026.
- **FR-035**: A present-but-malformed baseline or registry MUST fail loud (naming the file and reason), never be silently treated as empty (no false-clean) — per the no-fallbacks principle.

### Key Entities

- **Codebase boundary**: the resolved single-codebase scope a clone run operates within — derived from the nearest enclosing stack-control installation, excluding nested child installations.
- **Clone group**: a set of duplicated code spans (file:line members) with a stable id, line count, an optional disposition, and (for `refactor`) the Step 0a/0b fields (canonical side + reason, tests + proof-of-detection).
- **Clone baseline**: the committed, dispositioned set of clone groups a codebase is measured against for NEW-detection.
- **Scope manifest**: the per-feature synthesis of the discovery agents' outputs — discovered surfaces, provenance, and the regime-holdout section when config-activated.
- **Registry**: a project-owned catalog — anti-patterns (typed patterns + severity), adopter-manifests (primitive → expected-importer glob + exceptions/holdouts), migration-map (in-flight migrations).
- **Dispatch return**: a sub-agent's structured `Searched / Included / Excluded` result the wrapper validates.
- **Scope-discovery config**: the per-installation configuration (under `.stack-control/`) recording registry/baseline locations and per-agent activation/tunables, resolved through the 009 config contract.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In a repo with two stack-control codebases sharing a copied block, a default clone check for one codebase reports zero cross-codebase matches against the other (0% cross-codebase false positives) and still reports intra-codebase duplication.
- **SC-002**: The audit-barrage vendored from dw-lifecycle into stack-control produces zero clone findings in the stack-control codebase's default check.
- **SC-003**: An operator reaches a working scope-discovery installation (config + empty-but-valid registries + schemas, all resolved project-local) through a single public install invocation and zero hand-authored files.
- **SC-004**: Re-running install on an existing scope-discovery installation makes zero modifications to existing registries/baseline (content-hash equality before and after), and a refresh/disposition in one installation produces zero changes to a sibling installation's files.
- **SC-005**: A `refactor` disposition missing its canonical-side decision or its test-proof-of-detection is refused 100% of the time, naming the missing precondition.
- **SC-006**: A NEW intra-codebase clone introduced by a change is surfaced by the gate-mode check and trips a non-zero exit, while no pre-dispositioned group re-trips it.
- **SC-007**: Running the validator harness against a deliberately gutted gate stub fails (the gutted-stub self-check trips) for every gate that ships a harness — a gutted gate cannot pass its own harness.
- **SC-008**: With empty registries, every config-activated check completes cleanly and contributes nothing to the manifest (zero cost for projects without registries); with a seeded entry + a matching file, the corresponding holdout is surfaced.
- **SC-009**: Every migrated capability runs to completion in a plain shell with no Claude Code session or plugin surface present (reachable through `stackctl` alone).
- **SC-010**: `dw-lifecycle`'s scope-discovery surfaces remain fully functional throughout and after the migration (its own tests pass; its baselines/config are untouched) — verified before the migration is considered done.
- **SC-011**: Governance implement-mode runs the per-codebase clone-detection step (no TODO placeholder remains) and surfaces a NEW intra-codebase clone introduced by the governed change.

## Assumptions

- **Vendor/copy, not destructive move.** Per the isolation invariant and the roadmap's "vendor the full clone-detector into `plugins/stack-control/`," the default is to copy the implementation into stack-control and generalize away deskwork/dw-lifecycle coupling, leaving dw-lifecycle's copy intact until it is retired wholesale. (Open Question OQ-1 confirms.)
- **Port-and-generalize is the default fidelity.** Each component is ported verbatim then generalized where it is coupled to deskwork conventions, EXCEPT where a component is project-coupled enough to warrant a native rebuild (the session-skills precedent). The per-component port-vs-rebuild decision is recorded (FR-004); the default is port-and-generalize. (Open Question OQ-2.)
- **Codebase boundary = 009 installation model.** "Per-codebase" is resolved as the nearest enclosing stack-control installation (009's installation-root model), excluding nested children — not an ad-hoc plugin-dir heuristic or a separate `roots` list. (Open Question OQ-3.)
- **TypeScript-only language support in this increment.** The detector + ast-grep/ts-morph scanners target `.ts/.tsx` (matching the original v1). Cross-language scanner plug-in points are captured as future expansion, not built here.
- **009 is landed and is the config substrate.** This feature builds on 009/project-doc-setup's `.stack-control/config.yaml` installation + resolution contract (project-doc-setup is complete on this branch).
- **No CI changes.** Per the project rule "No test infrastructure in CI," verification is local (vitest + plain-shell smokes); no browser/port-bind/binary-boot checks are added to CI.
- **Constitution gates apply.** TDD RED-before-GREEN (Principle I), no fallbacks/mock-data outside tests (V), strict typing — no `any`/`as`/`@ts-ignore` (VI), files ≤500 lines (VI), capability-not-vendor branching (III/IX), commit-and-push-often (VII).

## Dependencies

- **009 / project-doc-setup** — the installation + config + resolution contract the per-codebase boundary and scope-discovery config resolve through. (Complete on this branch.)
- **`multi/migrate-audit-barrage`** — the already-present audit-barrage / promote-findings machinery in `plugins/stack-control/src/scope-discovery/` that the discovery flow composes with (do not re-migrate).
- **Original design** — `docs/superpowers/specs/2026-05-24-scope-discovery-design.md` (the canonization design this migration carries forward) and the live implementation at `plugins/dw-lifecycle/src/scope-discovery/` (the port source).
- **Roadmap entry** — `docs/1.0/001-IN-PROGRESS/pluggable-lifecycle-providers/stack-control-roadmap.md` line 70 (the brief and the three deferred sub-scopes).
- **Succession + enforcement rules** — `.claude/rules/stack-control-succession.md` (isolation invariant) and `.claude/rules/enforcement-lives-in-skills.md` (enforcement fires from skill bodies + CLI verbs, never git hooks).
- **Subsumption to reconcile** — `design:gap/project-relative-doc-discovery` (009 T034 surfaced it as likely subsumed); confirm no overlap with this feature's config resolution before duplicating it.

## Migration boundary — explicitly out of scope for THIS feature

To prevent a future session from re-migrating already-done or differently-owned code (the "coral reef around the as-built shape" hazard), the boundary is stated here in the durable spec, not only in research:

- **Already migrated — do NOT re-migrate:** the audit-barrage cross-model audit, the promote-findings dampener/checkpoint-filter/extract/slush machinery, and the shared `util` helpers already present under `plugins/stack-control/src/scope-discovery/`.
- **Different ownership — NOT this feature (belongs to the audit-barrage/govern migration):** the audit-finding orchestration loop — controller, orchestrator-loop, mediation, escalation, recovery, the LLM auditor/judge, and the remainder of promote-findings (apply, audit-log editor/walker, auto-flip/auto-position, close-shipped, cross-reference, proposal-file, substantive-reason, tdd-enforcement, workplan editors) — plus the workplan-archive and tooling-feedback-import tooling.
- **Dropped entirely (per OQ-6):** the hook-install machinery, agent-prompt-mirror installers, the pilot-migration helper, and the hook-uninstall helper.

This boundary is a *requirement* of the migration, not merely a tactical note (CHK003): the feature is "the clone-detection + discovery + registry + dispatch-wrapper + install/doctor surface," and nothing in the three buckets above.

## Open Questions *(for /speckit-clarify)*

- **OQ-1 — Migration semantics confirmation.** ✅ RESOLVED (Session 2026-06-09): vendor/copy. `dw-lifecycle` keeps a fully-working copy (tests/baselines must not break — SC-010) until a separate feature retires it wholesale; never a destructive move.
- **OQ-2 — Founding-increment boundary.** ✅ RESOLVED (Session 2026-06-09): **full surface, one delivery** — US1–US8 all built and handed over together. Priorities are internal build order, not separate increments. (Operator: no partial feature delivery — it gets dropped on the floor and future agents coral-reef around the incomplete shape.)
- **OQ-3 — Codebase-boundary mechanism.** ✅ RESOLVED (Session 2026-06-09): "per-codebase" = nearest-enclosing 009 installation, excluding nested children; explicit path override retained for the non-default case. (See FR-005/FR-007.)
- **OQ-4 — Per-component port-vs-rebuild.** ✅ RESOLVED (Session 2026-06-09): port-and-generalize is the default for every component; native rebuild only where code (not config) bakes in deskwork conventions, decided during the port and recorded per FR-004. No component pre-designated for rebuild.
- **OQ-5 — Install-drift advisory home (FR-033 / US8).** Does the session-start install-drift advisory land in this feature or in `multi/session-skills`? Assumed: captured here, home decision deferred.
- **OQ-6 — Adopter-facing install machinery surface.** ✅ RESOLVED (Session 2026-06-09): drop the hook-install machinery entirely (no `install-scope-discovery-hooks` / `install-agent-prompts` / `uninstall-*`). Keep the `check-*` CLI verbs as primitives; enforcement fires from skill bodies + CLI verbs per `.claude/rules/enforcement-lives-in-skills.md`; adopter hook-wiring is documented, never shipped.

## Captured for future expansion *(inherited from the 2026-05-24 design — not built in this increment)*

These were captured-as-future in the original canonization design and are restated so they are not lost; they are explicitly NOT part of this migration's build. **Tracking requirement (operator, 2026-06-09):** because this migration ships its full intended surface in one delivery, the ONLY intended-but-unbuilt capabilities are the items below — and each MUST be promoted to a first-class roadmap/backlog entry (not left as spec prose) so a future agent is never blind to it and cannot build around its absence. Do this promotion as part of this feature's completion, not "later."

- v2 enhancement-class discovery agents: `dom-visual-walker` (Playwright), `a11y-audit` (axe-core), `vestigial-copy-audit`, `component-roster`.
- Cross-language scanner packs (`.go` / `.py` / `.rs` / `.kt` / `.java`) via the customize seam.
- A studio/control-plane surface for the clones backlog (sortable table + per-row disposition) — relates to `multi/control-plane-frontend`'s scope-discovery design surfaces.
- Cross-repo rollup view consuming the scope-export output.
- A plugin-extension-point intercept that auto-wraps every Agent dispatch (depends on upstream Claude Code support; the wrapper stays explicit-call until then).
