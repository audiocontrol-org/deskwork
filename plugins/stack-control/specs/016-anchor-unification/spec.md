# Feature Specification: Anchor Unification

**Feature Branch**: `016-anchor-unification`

**Created**: 2026-06-11

**Status**: Draft

**Input**: User description: "Anchor unification: every stack-control verb resolves ALL stack-control-owned state through ONE anchor — the enclosing installation (nearest ancestor with `.stack-control/config.yaml`, of cwd or of an explicitly named dir) — never raw cwd, never a partially-applied `--repo-root`."

## Context & Provenance

Graduated from the backlog: **TASK-56** (seed; gh-460) carrying **TASK-22, TASK-40, TASK-49, TASK-50, TASK-51, TASK-52, TASK-53, TASK-55** (promotion linkage recorded on each item). These are the residual anchoring defects found by governance and dogfooding *after* `specs/installation-isolation` converged: the installation-anchor invariant (constitution 1.3.0, Additional Constraints; installation-isolation FR-010) is declared, but several verbs still resolve part of their state from raw cwd or a free `--repo-root`, several configuration surfaces don't inherit across nested installations, and the enforcement harness itself has a safety hole. This feature completes the contract the constitution already promises.

Audit-finding provenance: AUDIT-20260611-13 (`specs/014-audit-protocol-reliability/audit-log.md`), AUDIT-20260612-02/-03/-04/-05/-06 (`specs/installation-isolation/audit-log.md`), gh-460, gh-461 (closed as migrated; full reproductions preserved on the backlog items).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - One govern run, one anchor (Priority: P1)

An operator (or the unattended `after_implement` governance hook, which Spec Kit drives from the repo root) runs `stackctl govern` against a feature that lives in a **nested installation** (e.g. `plugins/design-control` with its own `.stack-control/config.yaml`). Every resolution inside that single govern run — feature root, run-dir, audit-log, backlog store for payload exclusion, and slush routing — anchors at the **same** enclosing installation. Today the run uses two anchors at once: feature resolution anchors at the repo root (FATALs without `--repo-root`), and even with `--repo-root` the backlog/slush step still resolves from cwd, so it simultaneously believes "the installation is `plugins/design-control`" (feature, run-dir, audit-log) and "no installation found" (backlog exclusion, slush) — the slush lane silently degrades (non-fatal exit 1) and barrage residuals never route to the installation's backlog.

The cross-repo variant (AUDIT-20260611-13): the backlog-store payload exclusion derives from the cwd's enclosing installation while the payload assembler rel-ifies that path against the govern target; when the two disagree, the exclusion silently goes inert and the target repo's committed backlog prose rides into the audited diff with zero stderr signal — reopening the self-reference channel (AUDIT-20260611-08) that installation-isolation closed.

**Why this priority**: This is the seed defect (TASK-56) and the worst silent failure: the disposition protocol loses its parking lane in unattended convergence loops, and the audited payload self-references — both with no signal. It also breaks the default invocation of the governance hook for every nested-installation feature.

**Independent Test**: In a fixture repo containing a nested installation with its own feature, run govern from the repo root (no flags) and from an unrelated cwd with the target named explicitly; assert all five resolutions name the nested installation, slush residuals land in the nested installation's backlog store, and the audited payload excludes that store.

**Acceptance Scenarios**:

1. **Given** a repo-root installation and a nested installation with its own feature, **When** govern runs from the repo root naming that feature, **Then** feature root, run-dir, audit-log, backlog-store exclusion, and slush routing all resolve to the nested installation, and the run completes without any per-step "no installation found" degradation.
2. **Given** a govern run whose anchor is explicitly named, **When** the operator's cwd is inside a *different* installation (or a different repo), **Then** the backlog-store exclusion resolves against the *named* anchor's store — never the cwd's — and the named repo's committed backlog prose is excluded from the audited payload.
3. **Given** any govern run, **When** a sub-step (slush, backlog exclusion) cannot resolve the anchor every other step resolved, **Then** the run fails loudly naming the divergence — never a non-fatal skip that drops the lane silently.
4. **Given** the govern → exclude-paths → payload-assembler seam, **When** the test suite runs, **Then** at least one test exercises the seam against an in-repo committed store (not only `STACKCTL_BACKLOG_DIR` pointing at an out-of-fixture tmpdir).

---

### User Story 2 - Nested installations inherit fleet configuration (Priority: P2)

An operator sets up a nested installation and runs its first governed feature. The cross-model audit-barrage resolves its fleet configuration (model battery, timeouts, disabled models) through a documented inheritance chain — nearest enclosing installation's override → outer/repo-root installation's override → plugin default — instead of silently falling back to the plugin default. Today the repo root's `audit-barrage-config.yaml` (claude at 900s, gemini disabled on 94.1% failure evidence) is invisible to the nested installation: the first governed run burns a full round to FATAL on the 300s default timeout, and the hand-seeded workaround copy drifts independently of the root evidence.

**Why this priority**: The failure costs a full barrage round (the slowest configured timeout, then a FATAL) on every new nested installation, and the workaround creates config drift — fleet-tuning evidence is repo-global but maintained per-installation by hand.

**Independent Test**: Fixture with an outer installation carrying a barrage-config override and a nested installation without one; resolve the barrage config from within the nested installation and assert the outer override's values apply; add an override to the nested installation and assert it wins.

**Acceptance Scenarios**:

1. **Given** an outer installation with a barrage-config override and a nested installation without one, **When** a governed run fires from the nested installation, **Then** the outer override's fleet settings apply (no plugin-default fallback), and the resolution chain used is reported.
2. **Given** a nested installation with its own override, **When** a governed run fires there, **Then** the nested override wins over the outer one (nearest-first).
3. **Given** no override at any level, **When** a governed run fires, **Then** the plugin default applies — same behavior as today, no new requirement to create configs.

---

### User Story 3 - Backlog verbs complete the anchor contract (Priority: P2)

An agent mid-task captures found work, imports GitHub issues or slush findings, or promotes an item — from any cwd inside (or outside, with an explicit anchor) an installation — and every one of those state-writing verbs anchors **all** of its reads and writes at the same installation:

- `backlog import-slush` resolves its feature **audit log** through the installation (today: store via installation, audit-log via raw cwd — from a subdirectory the store writes correctly but the audit-log lookup fails; TASK-53/AUDIT-20260612-06).
- `backlog capture` / `import-github` accept the **explicit anchor** the constitution names (`--at <dir>`) — today the constitution's "explicitly named via `--at <dir>`" contract is unimplementable for them, codified as a test-level carve-out ("backlog has no --at by contract"; TASK-51/AUDIT-20260612-04).
- `backlog promote`'s pending-create advisory resolves the target path against the **installation root**, not cwd — today a promote run from an installation subdirectory yields a false "does not yet exist" advisory for a target that exists (TASK-22).

**Why this priority**: These are the last state-writing paths outside the "cwd never decides placement" model. Individually small; together they're the difference between an invariant and an aspiration.

**Independent Test**: Run each verb from the installation root, from a subdirectory, and with an explicit anchor from outside; assert byte-identical placement and advisory output across all three.

**Acceptance Scenarios**:

1. **Given** an installation with a feature audit log carrying parked findings, **When** `import-slush` runs from an installation subdirectory, **Then** the audit log is found and the migrated items land in the same store as an installation-root invocation.
2. **Given** an operator outside any installation, **When** they run `backlog capture`/`import-github` naming an installation explicitly, **Then** the capture lands in the named installation's store; **and** the same explicit-anchor flag is accepted uniformly by every state-writing backlog verb.
3. **Given** a promote whose target exists relative to the installation root, **When** promote runs from a subdirectory, **Then** no false pending-create advisory is emitted.

---

### User Story 4 - Spec-pointer resolution never picks the wrong file (Priority: P3)

An operator (or govern) resolves the active spec through the SPECKIT marker. When the marker points *into* the installation (`plugins/stack-control/specs/<feat>/plan.md` — the natural pointer shape for a monorepo-root context file after the Spec Kit relocation), resolution joins the **full** matched path against the correct base. Today the unanchored mid-string match drops the `plugins/stack-control/` prefix and joins `specs/…` against the toplevel base: in the common case govern fails with a confusing ENOENT naming a path nobody wrote; in the bad case (a stale pre-relocation copy left by an adopter who copied instead of moved), `govern --mode spec` **silently audits the stale spec revision** in a flow designed for unattended convergence (TASK-50/AUDIT-20260612-03).

**Why this priority**: Silent wrong-document auditing in an unattended loop; gated on a transitional layout this program itself just passed through and that migrating adopters will hit.

**Independent Test**: Fixture with a toplevel context file whose marker carries an installation-prefixed spec path, plus (variant) a stale toplevel `specs/<feat>/spec.md`; assert resolution lands on the installation's spec file in both, and that a match that does not resolve to an existing file is rejected with a clear error.

**Acceptance Scenarios**:

1. **Given** a marker pointing at `<installation>/specs/<feat>/plan.md`, **When** the spec is resolved, **Then** the installation's `spec.md` is selected — even when a stale `specs/<feat>/spec.md` exists at the toplevel.
2. **Given** a marker whose matched path does not resolve to an existing file under any consulted base, **Then** resolution fails loudly naming the marker text and the bases tried — never a downstream ENOENT on a constructed path.

---

### User Story 5 - One fail-loud wording class, applied by condition not by verb (Priority: P3)

An operator or tooling layer reading stderr can rely on one rule: the `FATAL — ` wording class means "no enclosing installation — run `stackctl setup`". Today two verbs gate the prefix on the not-found condition while five others (scope-widen, scope-inventory, slush-findings, audit-barrage, audit-barrage-lift) wrap **every** resolver error in it — so a corrupt `config.yaml` renders as `backlog: <message>` from one verb and `scope-widen: FATAL — <message>` from another, and any skill body or script pattern-matching the class mis-classifies config corruption as not-set-up (TASK-52/AUDIT-20260612-05).

**Why this priority**: Cosmetic-to-mild today, but it poisons the machine-readable meaning of the wording class the isolation tests pin, and it's the same divergent-sibling shape a prior finding closed for git derivations.

**Independent Test**: Drive each of the seven verbs with (a) no enclosing installation and (b) a corrupt installation config; assert the `FATAL — ` class appears for exactly (a) across all seven, and that (b) renders the underlying parse error without the class, uniformly.

**Acceptance Scenarios**:

1. **Given** any of the seven resolver-using verbs run with no enclosing installation, **Then** stderr carries the same `FATAL — ` wording class and `stackctl setup` remediation.
2. **Given** the same verbs run against a malformed installation config, **Then** the parse error surfaces verbatim **without** the not-found wording class, identically across verbs, and the prefix decision lives in one shared place (a future eighth verb inherits it by construction).

---

### User Story 6 - The enforcement harness cannot write real operator state (Priority: P3)

A developer (or CI) runs the isolation test suite on any host. The suite's marker-less and nested fixtures **verify** — not merely assume in a comment — that no real installation exists above the OS tmpdir before exercising refusal rows. Today the walk-up is unbounded: on a host with a real `.stack-control/config.yaml` above the tmpdir, every "refusal" row resolves that real installation and **writes real state into it** (a backlog task file, seeded scope-discovery state) before the assertion fails — the exact "state lands somewhere the operator didn't watch" shape this invariant exists to prevent, produced by its own enforcement suite (TASK-49/AUDIT-20260612-02).

**Why this priority**: Unlikely host configuration, but the failure mode mutates non-fixture operator state — worse than a flake — and the suite is named in the constitution as the invariant's permanent enforcement.

**Independent Test**: Simulate an installation above the fixture root and assert the harness refuses to run (loud, explanatory) with zero writes outside the fixture tree.

**Acceptance Scenarios**:

1. **Given** a host where an installation encloses the OS tmpdir, **When** the isolation fixtures initialize, **Then** they fail loudly with an explanatory message **before** any verb under test executes, and nothing is written outside the fixture tree.
2. **Given** a normal host, **Then** the suite behaves exactly as today (no behavioral change to the rows themselves).

### Edge Cases

- One govern invocation where cwd, the explicitly named anchor, and the feature each sit in *three* different installations — which anchor wins must be a single documented rule applied by every sub-step (named anchor > cwd walk-up; never mixed).
- `STACKCTL_BACKLOG_DIR` set while the named anchor's repo carries a committed store — the explicit env override must still win, but the payload exclusion must then exclude the *override* store and must not silently leave the committed store in the payload.
- Nested installation whose outer "installation" is malformed (corrupt YAML) — inheritance chain resolution must fail loudly at the malformed level, not silently skip to the plugin default.
- An explicit anchor (`--at <dir>`) naming a directory with **no** enclosing installation — uniform loud refusal with `stackctl setup` remediation (already the contract; must hold for the newly-flagged verbs too).
- Mid-transition layout: relocated specs, toplevel context-file pointer updated to the full nested path, installation context file absent — exactly the state the prior migration passed through; spec resolution must work there.
- A marker matching multiple `specs/…` substrings in one line, or a path containing `specs/` mid-segment — the match must anchor correctly rather than truncate.
- Deep nesting (installation inside an installation inside the repo root): config inheritance is nearest-first along the *full* chain, not just two levels.
- The same underlying error (e.g. unreadable config) hit by a read-only verb vs. a state-writing verb — wording stays consistent with the read/write split the constitution draws.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001 (single anchor per invocation)**: Every stackctl invocation MUST resolve exactly one installation anchor — from the explicitly named directory when given, else by walk-up from cwd — and every read and write of stack-control-owned state inside that invocation (feature root, run-dir, audit-log, backlog store, slush routing, payload exclusion, advisories) MUST derive from that single anchor. Two sub-steps of one invocation disagreeing about the anchor is a defect class this feature retires.
- **FR-002 (govern unification)**: `stackctl govern` MUST resolve feature root, run directory, audit log, backlog-store payload exclusion, and slush routing against the same anchor; when any sub-step cannot resolve what the others resolved, govern MUST fail loudly naming the divergence — never a non-fatal per-step skip.
- **FR-003 (cross-repo exclusion correctness)**: The backlog-store payload exclusion MUST resolve against the govern target's anchor — never the cwd's enclosing installation — and a resolved-but-inert exclusion (path filtered out of the payload frame) MUST be impossible by construction or loud when detected. The govern → exclude-paths → assembler seam MUST be exercised by at least one test against an in-repo committed store.
- **FR-004 (configuration inheritance)**: Audit-barrage fleet configuration MUST resolve through a nearest-first inheritance chain across enclosing installations — nearest installation's override, then each outer installation's override in order, then the plugin default — and the resolved source MUST be reported in the run's output. A malformed level fails loudly rather than being skipped.
- **FR-005 (import-slush audit-log anchoring)**: `backlog import-slush` MUST resolve the feature audit log through the same anchor as its store side; a subdirectory invocation MUST behave identically to an installation-root invocation.
- **FR-006 (uniform explicit anchor)**: Every state-writing backlog verb (capture, import-github, import-slush, promote) MUST accept the same explicit-anchor flag (`--at <dir>`) the constitution names, with identical semantics: the anchor is the named directory's enclosing installation; no enclosing installation → uniform loud refusal. (This closes the "backlog has no --at by contract" carve-out rather than amending the constitution to keep it.)
- **FR-007 (advisory anchoring)**: `backlog promote`'s pending-create advisory MUST resolve the target path against the installation root; a target that exists relative to the installation MUST never be reported as missing because of the invoker's cwd.
- **FR-008 (spec-pointer validation)**: Active-spec resolution from a context-file marker MUST anchor its match to the full pointed path, MUST validate that the candidate resolves to an existing file before accepting it, and MUST fail loudly listing the marker text and bases consulted when no candidate validates. A stale duplicate at a wrong base MUST never be silently selected over the pointed-at file.
- **FR-009 (one wording-class rule)**: The `FATAL — ` + `stackctl setup` wording class MUST be emitted exactly when the resolver reports no-enclosing-installation, across **all** resolver-consuming verbs, via one shared decision point; all other resolver errors (parse, escape, collision) MUST surface verbatim without the class, uniformly. New verbs inherit the rule by construction.
- **FR-010 (harness self-safety)**: The isolation test fixtures MUST verify at initialization that no real installation encloses the fixture root (e.g. assert the walk-up from the OS tmpdir resolves to nothing) and MUST refuse loudly — before any verb under test runs — when one does. The suite MUST be incapable of writing outside its fixture tree on any host configuration.
- **FR-011 (probe extension)**: The isolation probe remains the invariant's permanent enforcement surface and MUST be extended to cover the unified contract: same-anchor-for-all-sub-steps (FR-001/002), explicit-anchor uniformity (FR-006), and the wording-class rule (FR-009), so regressions in any of them surface as probe failures, not dogfood incidents.
- **FR-012 (no silent degradation)**: No path covered by this feature may downgrade to a skip, a default, or an empty result without a loud, attributable message naming what was skipped and why. (Constitution Principle V; the slush lane's non-fatal exit-1 and the inert exclusion are the canonical violations being retired.)

### Key Entities

- **Installation**: the unit of anchoring — a directory tree rooted at the nearest ancestor carrying `.stack-control/config.yaml`; owns a backlog store, audit logs, run dirs, and optional configuration overrides. Installations nest; "nearest-first" orders the chain from the anchor upward.
- **Anchor**: the single resolved installation an invocation operates against — from an explicit `--at <dir>` when given, else the cwd walk-up. One per invocation (FR-001).
- **Configuration inheritance chain**: the ordered list of installations from the anchor outward, terminated by the plugin default; consulted nearest-first for overrides (FR-004).
- **Backlog store**: the per-installation found-work pile; both a write target (capture/import) and a payload-exclusion subject (govern).
- **Spec pointer (SPECKIT marker)**: the context-file marker designating the active spec; resolution is validated-existing-file, full-path-anchored (FR-008).
- **Wording class**: the machine-recognizable `FATAL — `/`stackctl setup` stderr contract meaning exactly "no enclosing installation" (FR-009).
- **Isolation probe / fixtures**: the permanent enforcement suite for the invariant; self-guarding per FR-010, extended per FR-011.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A governed run against a nested installation's feature, invoked from the repo root with no anchor flags, completes with all five resolution surfaces (feature, run-dir, audit-log, store exclusion, slush) reporting the same installation — and barrage residuals appear in that installation's backlog. (Today: FATAL without a flag; silent slush loss with it.)
- **SC-002**: Zero paths from any repo's committed backlog store appear in any audited payload, across cwd-driven, flag-driven, and env-overridden invocations — verified by tests exercising the real seam against an in-repo store.
- **SC-003**: The first governed run in a freshly created nested installation under an outer installation with a tuned fleet config completes without a floor-shortfall round attributable to default timeouts — no hand-seeded config copy required.
- **SC-004**: For every state-writing backlog verb, invocations from the installation root, from any subdirectory, and from outside with an explicit anchor produce identical state placement and identical advisory output (byte-equivalent modulo timestamps/ids).
- **SC-005**: Across all seven resolver-consuming verbs, the not-found wording class appears for 100% of no-installation runs and 0% of other resolver-error runs.
- **SC-006**: The isolation suite, run on a host simulating a real installation above the fixture root, performs zero writes outside the fixture tree and reports the refusal cause in its first failure message.
- **SC-007**: Spec resolution selects the pointed-at file in 100% of transitional-layout fixtures (including stale-duplicate variants), and 0% of failures surface as downstream ENOENT on constructed paths.
- **SC-008**: One feature-level convergence: the cross-model governance loop over this feature's diff reaches the gate's OPEN state, and no finding in the class "two sub-steps disagree about the anchor" is raised against the post-fix surface.

## Assumptions

- **TASK-51 fork resolved toward `--at`**: the constitution's uniform "explicitly named via `--at <dir>`" contract is kept and the backlog verbs gain the flag (the plumbing — `resolveInstallationBacklog(startDir)` — already exists), rather than amending the constitution to carve out backlog verbs. Rationale: the constitution names itself the inheritance document for new verbs; carve-outs erode exactly the uniformity this feature exists to restore.
- **TASK-55 fork resolved toward the inheritance chain**: configuration resolution gains the nearest-first chain rather than documenting per-installation seeding as a setup step. Rationale: fleet-tuning evidence is repo-global; seeded copies are the drift mechanism the defect report documents (the seeded copy's header already narrated the wrong feature's history). Setup-time seeding remains available but is not the fix.
- `STACKCTL_BACKLOG_DIR` remains an explicit, sanctioned override for one-off targets; this feature defines its interaction with payload exclusion (the override store is what gets excluded) rather than retiring it.
- Read-side verbs may keep a read-only repo-root parameter where one survives by design (constitution: audit-barrage-render's flag is the protocol's carrier for the render anchor); this feature does not retire read-side flags, it retires *mixed anchoring within one invocation* and free placement parameters on state-writing paths.
- The seven resolver-consuming verbs named in TASK-52 are the current complete set; the shared wording-class helper is the mechanism that keeps the set complete as verbs are added.
- No behavior change for single-installation repos invoked from the installation root — the dominant dogfood path — beyond the new loud-failure modes replacing silent ones.
