# Feature Specification: Anchor Unification

**Feature Branch**: `016-anchor-unification`

**Created**: 2026-06-11

**Status**: Draft

**Input**: User description: "Anchor unification: every stack-control verb resolves ALL stack-control-owned state through ONE anchor — the enclosing installation (nearest ancestor with `.stack-control/config.yaml`, of cwd or of an explicitly named dir) — never raw cwd, never a partially-applied `--repo-root`."

## Context & Provenance

Graduated from the backlog: **TASK-56** (seed; gh-460) carrying **TASK-22, TASK-40, TASK-49, TASK-50, TASK-51, TASK-52, TASK-53, TASK-55** (promotion linkage recorded on each item). These are the residual anchoring defects found by governance and dogfooding *after* `specs/installation-isolation` converged: the installation-anchor invariant (constitution 1.3.0, Additional Constraints; installation-isolation FR-010) is declared, but several verbs still resolve part of their state from raw cwd or a free `--repo-root`, several configuration surfaces don't inherit across nested installations, and the enforcement harness itself has a safety hole. This feature completes the contract the constitution already promises.

Audit-finding provenance: AUDIT-20260611-13 (`specs/014-audit-protocol-reliability/audit-log.md`), AUDIT-20260612-02/-03/-04/-05/-06 (`specs/installation-isolation/audit-log.md`), gh-460, gh-461 (closed as migrated; full reproductions preserved on the backlog items).

## Clarifications

### Session 2026-06-12

- Q: TASK-51 fork — add `--at` to all state-writing backlog verbs, or qualify the constitution to keep the carve-out? → A: Add `--at` uniformly; the constitution stays uniform and the "backlog has no --at by contract" test carve-out is deleted.
- Q: TASK-55 fork — how does a fresh installation get the repo's fleet-tuning evidence (walk-up inheritance chain / git-toplevel shared config / setup-time seeding)? → A: Operator decree: **complete isolation — no repo-global or cross-domain configuration behavior of any kind, and none should ever have been built.** A **domain** is the directory containing the `.stack-control/` configuration directory plus all of its descendants. Domains MUST NOT overlap. Every invocation operates on exactly one domain. Configuration resolves domain override → plugin-shipped default, nothing else. Fresh domains get their barrage config seeded **intentionally at `stackctl setup` time** — an owned copy the operator tunes per domain; divergence between domains is by design, not drift. This decree governs the whole feature: any behavior that consults files outside the domain (including the transitional toplevel context-file layer in spec-pointer resolution) is in scope to retire.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - One govern run, one anchor (Priority: P1)

An operator (or the unattended `after_implement` governance hook) runs `stackctl govern` against a feature that lives in a **domain rooted below the repo root** (e.g. `plugins/design-control` with its own `.stack-control/config.yaml`). Every resolution inside that single govern run — feature root, run-dir, audit-log, backlog store for payload exclusion, and slush routing — anchors at the **same** domain. Today the run uses two anchors at once: feature resolution anchors at the repo root (FATALs without `--repo-root`), and even with `--repo-root` the backlog/slush step still resolves from cwd, so it simultaneously believes "the installation is `plugins/design-control`" (feature, run-dir, audit-log) and "no installation found" (backlog exclusion, slush) — the slush lane silently degrades (non-fatal exit 1) and barrage residuals never route to the domain's backlog.

The cross-repo variant (AUDIT-20260611-13): the backlog-store payload exclusion derives from the cwd's enclosing installation while the payload assembler rel-ifies that path against the govern target; when the two disagree, the exclusion silently goes inert and the target repo's committed backlog prose rides into the audited diff with zero stderr signal — reopening the self-reference channel (AUDIT-20260611-08) that installation-isolation closed.

**Why this priority**: This is the seed defect (TASK-56) and the worst silent failure: the disposition protocol loses its parking lane in unattended convergence loops, and the audited payload self-references — both with no signal. It also breaks the default invocation of the governance hook for every nested-installation feature.

**Independent Test**: In a fixture repo containing a nested installation with its own feature, run govern from the repo root (no flags) and from an unrelated cwd with the target named explicitly; assert all five resolutions name the nested installation, slush residuals land in the nested installation's backlog store, and the audited payload excludes that store.

**Acceptance Scenarios**:

1. **Given** a feature living in a domain, **When** govern runs from anywhere inside that domain — including the domain root, where the Spec Kit `after_implement` hook fires — **Then** feature root, run-dir, audit-log, backlog-store exclusion, and slush routing all resolve to that one domain, with no per-step "no installation found" degradation.
2. **Given** a govern run whose domain is explicitly named via `--at`, **When** the operator's cwd is inside a *different* domain (or a different repo, or no domain at all), **Then** every resolution — including the backlog-store exclusion — derives from the *named* domain, never the cwd's, and the named domain's committed backlog prose is excluded from the audited payload.
3. **Given** a govern run from a cwd outside any domain with no explicit `--at`, **Then** the run refuses loudly with the `stackctl setup` remediation — it never falls back to the repo root, the git toplevel, or any other derived location.
4. **Given** any govern run, **When** a sub-step (slush, backlog exclusion) cannot resolve the domain every other step resolved, **Then** the run fails loudly naming the divergence — never a non-fatal skip that drops the lane silently.
5. **Given** the govern → exclude-paths → payload-assembler seam, **When** the test suite runs, **Then** at least one test exercises the seam against an in-repo committed store (not only `STACKCTL_BACKLOG_DIR` pointing at an out-of-fixture tmpdir).

---

### User Story 2 - Each domain owns its configuration completely (Priority: P2)

An operator sets up a new domain and runs its first governed feature. The domain's audit-barrage fleet configuration is **its own**: resolution consults the domain's override, then the plugin-shipped default — nothing else. There is **no repo-global, git-toplevel, inherited, or otherwise cross-domain configuration behavior of any kind** (operator decree, Clarifications 2026-06-12; this supersedes the inheritance-chain fix the originating issue suggested). The first-run pain TASK-55 documents — a full barrage round burned to FATAL because the fresh domain silently fell back to plugin-default fleet settings the operator didn't know were in effect — is addressed at **creation time**: `stackctl setup` seeds the domain's barrage config as an intentionally-owned copy the operator tunes for that domain, and every governed run reports which source (domain override or plugin default) its fleet config resolved from. Divergence between domains is by design; "drift" is not a defect under isolation.

**Why this priority**: The silent plugin-default fallback cost a full barrage round; the fix (intentional seeding + reported source) removes the surprise without violating isolation.

**Independent Test**: Create a fresh domain via setup; assert the seeded config exists and the first governed run reports the domain override as its source. Remove the override; assert the run reports the plugin default. Place a config file in an enclosing directory or sibling domain; assert it is never read.

**Acceptance Scenarios**:

1. **Given** a fresh domain created by `stackctl setup`, **When** its first governed run fires, **Then** the fleet config resolves from the domain's seeded override and the resolved source is reported — no round is lost to discovering missing config.
2. **Given** a domain with no override, **When** a governed run fires, **Then** the plugin default applies and is reported as the source — never any file outside the domain.
3. **Given** a configuration file outside the domain (repo root, git toplevel, an enclosing directory, a sibling domain), **When** any verb in the domain resolves configuration, **Then** that file is never read — isolation is verifiable by the absence of cross-domain file access.

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

An operator (or govern) resolves the active spec through the SPECKIT marker. Under the isolation decree, resolution consults **domain-internal context only**: the domain's own context file is the only marker source, and the only base a match is joined against is the domain. The transitional layer that consulted a context file *outside* the domain (the monorepo-toplevel CLAUDE.md, added by installation-isolation for migration) is **retired** — it is cross-domain consultation, and it is exactly what made TASK-50's wrong-base join reachable: the unanchored mid-string match drops the `plugins/stack-control/` prefix from a toplevel pointer and joins `specs/…` against the toplevel base. In the common case govern fails with a confusing ENOENT naming a path nobody wrote; in the bad case (a stale pre-relocation copy left by an adopter who copied instead of moved), `govern --mode spec` **silently audits the stale spec revision** in a flow designed for unattended convergence (TASK-50/AUDIT-20260612-03). Independent of the base question, a matched path is validated to resolve to an existing file before being accepted.

**Why this priority**: Silent wrong-document auditing in an unattended loop, plus a standing cross-domain consultation channel the decree prohibits.

**Independent Test**: Fixture with a domain context file carrying the marker, plus a stale `specs/<feat>/spec.md` copy outside the domain; assert resolution lands on the domain's spec file, that the outside copy is never read, and that a match that does not resolve to an existing file is rejected with a clear error.

**Acceptance Scenarios**:

1. **Given** the domain's context file carries the active-spec marker, **When** the spec is resolved, **Then** the domain's `spec.md` is selected — and a stale copy outside the domain is never consulted, even when the domain's context file is absent (absence is a loud failure, not a fallback upward).
2. **Given** a marker whose matched path does not resolve to an existing file under the domain base, **Then** resolution fails loudly naming the marker text and the base tried — never a downstream ENOENT on a constructed path.

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

- One govern invocation where cwd and the explicitly named `--at` directory sit in *two* different domains — the named domain wins for **every** sub-step (named > cwd walk-up; never mixed).
- `STACKCTL_BACKLOG_DIR` set while the named domain carries a committed store — the explicit env override must still win, but the payload exclusion must then exclude the *override* store and must not silently leave the committed store in the payload. (An explicit operator override is the only sanctioned pierce of domain isolation.)
- An attempt to `stackctl setup` a new domain inside an existing domain — refused at creation: the no-overlap invariant's first line of defense.
- A domain marker discovered *above* an already-resolved domain during walk-up (overlapping domains on disk, however they got there) — invalid state; detected and refused loudly naming both roots, never silently resolved nearest-first.
- An explicit anchor (`--at <dir>`) naming a directory with **no** enclosing domain — uniform loud refusal with `stackctl setup` remediation (already the contract; must hold for the newly-flagged verbs too).
- A domain whose own config is malformed (corrupt YAML) — loud failure at that domain; never a silent skip to the plugin default.
- Mid-transition layout: relocated specs with a stale pre-relocation copy outside the domain — resolution consults only the domain; the stale copy is never selected, and a missing domain context file is a loud failure, not a fallback upward.
- A marker matching multiple `specs/…` substrings in one line, or a path containing `specs/` mid-segment — the match must anchor correctly rather than truncate.
- The same underlying error (e.g. unreadable config) hit by a read-only verb vs. a state-writing verb — wording stays consistent with the read/write split the constitution draws.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001 (single domain per invocation)**: Every stackctl invocation MUST resolve exactly one **domain** — from the explicitly named directory (`--at <dir>`) when given, else by walk-up from cwd — and every read and write of stack-control-owned state inside that invocation (feature root, run-dir, audit-log, backlog store, slush routing, payload exclusion, advisories, configuration, scope-discovery registries) MUST derive from that single domain. Two sub-steps of one invocation disagreeing about the domain is a defect class this feature retires.
- **FR-002 (govern unification)**: `stackctl govern` MUST resolve feature root, run directory, audit log, backlog-store payload exclusion, and slush routing against the same anchor; when any sub-step cannot resolve what the others resolved, govern MUST fail loudly naming the divergence — never a non-fatal per-step skip.
- **FR-003 (cross-repo exclusion correctness)**: The backlog-store payload exclusion MUST resolve against the govern target's anchor — never the cwd's enclosing installation — and a resolved-but-inert exclusion (path filtered out of the payload frame) MUST be impossible by construction or loud when detected. The govern → exclude-paths → assembler seam MUST be exercised by at least one test against an in-repo committed store.
- **FR-004 (domain-complete configuration)**: All stack-control configuration — including the audit-barrage fleet config — MUST resolve as: the domain's own override, else the plugin-shipped default; **no file outside the domain is ever consulted** (no repo-root, git-toplevel, enclosing-directory, or sibling-domain source). The resolved source MUST be reported in the run's output. `stackctl setup` MUST seed the new domain's barrage config as an intentionally-owned copy: a verbatim copy of the plugin template's lane content, headed by a provenance comment naming the template source, the seeding date, and the invitation to tune per-domain. A malformed domain config fails loudly rather than falling back to the default.
- **FR-005 (import-slush audit-log anchoring)**: `backlog import-slush` MUST resolve the feature audit log through the same anchor as its store side; a subdirectory invocation MUST behave identically to an installation-root invocation.
- **FR-006 (uniform explicit anchor)**: The backlog dispatcher MUST accept the same explicit-anchor flag (`--at <dir>`) the constitution names, applying to **every** backlog verb — state-writing (capture, import-github, import-slush, promote) normatively, and read-only (list) with identical semantics for uniformity — where the anchor is the named directory's enclosing domain; no enclosing domain → uniform loud refusal; `--at` naming a nonexistent directory → usage-level loud refusal. (This closes the "backlog has no --at by contract" carve-out rather than amending the constitution to keep it.)
- **FR-007 (advisory anchoring)**: `backlog promote`'s pending-create advisory MUST resolve the target path against the installation root; a target that exists relative to the installation MUST never be reported as missing because of the invoker's cwd.
- **FR-008 (spec-pointer validation, domain-internal)**: Active-spec resolution MUST consult only context files **inside the domain** — the transitional consultation of context files outside the domain is retired. Resolution MUST anchor its match to the full pointed path, MUST validate that the candidate resolves to an existing file before accepting it, and MUST fail loudly listing the marker text and the domain base consulted when no candidate validates. A stale duplicate outside the domain MUST never be selected, and absence of the domain's context file is a loud failure, not a fallback upward.
- **FR-009 (one wording-class rule)**: The `FATAL — ` + `stackctl setup` wording class MUST be emitted exactly when the resolver reports no-enclosing-installation, across **all** resolver-consuming verbs, via one shared decision point; all other resolver errors (parse, escape, collision) MUST surface verbatim without the class, uniformly. New verbs inherit the rule by construction.
- **FR-010 (harness self-safety)**: The isolation test fixtures MUST verify at initialization that no real installation encloses the fixture root (e.g. assert the walk-up from the OS tmpdir resolves to nothing) and MUST refuse loudly — before any verb under test runs — when one does. The suite MUST be incapable of writing outside its fixture tree on any host configuration.
- **FR-011 (probe extension)**: The isolation probe remains the invariant's permanent enforcement surface and MUST be extended to cover the unified contract: same-anchor-for-all-sub-steps (FR-001/002), explicit-anchor uniformity (FR-006), and the wording-class rule (FR-009), so regressions in any of them surface as probe failures, not dogfood incidents.
- **FR-012 (no silent degradation)**: No path covered by this feature may downgrade to a skip, a default, or an empty result without a loud, attributable message naming what was skipped and why. (Constitution Principle V; the slush lane's non-fatal exit-1 and the inert exclusion are the canonical violations being retired.)
- **FR-013 (domain definition & no-overlap invariant)**: A **domain** is the directory containing the `.stack-control/` configuration directory plus all of its descendants. Domains MUST NOT overlap. Enforcement at both boundaries: `stackctl setup` MUST refuse to create a domain inside an existing domain, and resolution that discovers a second domain marker enclosing the resolved one MUST fail loudly naming both roots — overlapping domains are invalid state, never silently resolved nearest-first. Complete isolation between domains is the design's governing rule, scoped to **stack-control-owned state**: no verb operating in one domain reads or writes stack-control-owned state (config, stores, audit logs, run dirs, context-file markers) belonging to another domain, an enclosing directory, the repo root, or the git toplevel. Reads of the **code under audit** (the repository's source files and diffs that govern/barrage exist to examine) are not domain state and are unaffected. Exit semantics: a creation refused on overlap is a usage-level refusal (zero writes); overlap detected at resolution, a govern sub-step divergence, and an inert exclusion are runtime fail-loud errors under the verb's existing runtime-error exit convention.

### Key Entities

- **Domain** (canonical term): the unit of isolation and anchoring — the directory containing the `.stack-control/` configuration directory plus all of its descendants (formerly referred to as the "installation" tree; *installation* remains the product's term for the config marker that roots a domain). Domains never overlap (FR-013); each owns its backlog store, audit logs, run dirs, and configuration outright.
- **Anchor**: the single resolved domain an invocation operates against — from an explicit `--at <dir>` when given, else the cwd walk-up. One per invocation (FR-001).
- **Configuration source**: exactly two levels — the domain's own override, else the plugin-shipped default; the resolved source is reported per run (FR-004). No chain, no inheritance, no cross-domain consultation.
- **Backlog store**: the per-installation found-work pile; both a write target (capture/import) and a payload-exclusion subject (govern).
- **Spec pointer (SPECKIT marker)**: the context-file marker designating the active spec; resolution is validated-existing-file, full-path-anchored (FR-008).
- **Wording class**: the machine-recognizable `FATAL — `/`stackctl setup` stderr contract meaning exactly "no enclosing installation" (FR-009).
- **Isolation probe / fixtures**: the permanent enforcement suite for the invariant; self-guarding per FR-010, extended per FR-011.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A governed run against a feature in a domain rooted below the repo root, invoked from inside that domain with no anchor flags (the governance-hook shape), completes with all five resolution surfaces (feature, run-dir, audit-log, store exclusion, slush) reporting the same domain — and barrage residuals appear in that domain's backlog. (Today: FATAL or mixed anchoring; silent slush loss.)
- **SC-002**: Zero paths from any repo's committed backlog store appear in any audited payload, across cwd-driven, flag-driven, and env-overridden invocations — verified by tests exercising the real seam against an in-repo store.
- **SC-003**: The first governed run in a freshly created domain resolves its fleet config from the domain's setup-seeded override and reports the source; zero rounds lost to discovering missing config, and zero configuration file reads outside the domain across the entire run.
- **SC-004**: For every state-writing backlog verb, invocations from the installation root, from any subdirectory, and from outside with an explicit anchor produce identical state placement and identical advisory output — byte-equivalent after normalizing exactly two generated-field classes: item/task identifiers and timestamps.
- **SC-005**: Across all seven resolver-consuming verbs, the not-found wording class appears for 100% of no-installation runs and 0% of other resolver-error runs.
- **SC-006**: The isolation suite, run on a host simulating a real installation above the fixture root, performs zero writes outside the fixture tree and reports the refusal cause in its first failure message.
- **SC-007**: Spec resolution selects the pointed-at file in 100% of transitional-layout fixtures (including stale-duplicate variants), and 0% of failures surface as downstream ENOENT on constructed paths.
- **SC-008**: One feature-level convergence: the cross-model governance loop over this feature's diff reaches the gate's OPEN state, and no finding in the class "two sub-steps disagree about the domain" is raised against the post-fix surface.
- **SC-009**: 100% of attempts to create a domain inside an existing domain are refused with the no-overlap diagnostic, and 100% of resolutions that encounter overlapping domain markers fail loudly naming both roots — zero nearest-first silent resolutions of overlapping state.

## Assumptions

- **TASK-51 ratified toward `--at`** (Clarifications 2026-06-12): the constitution's uniform "explicitly named via `--at <dir>`" contract is kept and the backlog verbs gain the flag; the test carve-out is deleted.
- **TASK-55 resolved by operator decree — complete isolation** (Clarifications 2026-06-12): no inheritance chain, no git-toplevel shared config, no repo-global behavior. Per-domain `stackctl setup` seeding + reported config source is the fix. The originating issue's "fallback chain" suggestion is explicitly rejected.
- **Anchor-flag consequence**: state-writing verbs (govern included) take `--at <dir>` as their explicit anchor naming a domain; the free `--repo-root` placement parameter on state-writing paths is retired per the constitution (read-side render keeps its read-only flag as the protocol's carrier — it reads code, it places no state).
- `STACKCTL_BACKLOG_DIR` remains an explicit, sanctioned override for one-off targets — an explicit operator action is the only sanctioned pierce of domain isolation; this feature defines its interaction with payload exclusion (the override store is what gets excluded) rather than retiring it.
- The seven resolver-consuming verbs named in TASK-52 are the current complete set; the shared wording-class helper is the mechanism that keeps the set complete as verbs are added.
- No behavior change for single-domain repos invoked from inside the domain — the dominant dogfood path — beyond the new loud-failure modes replacing silent ones and the retirement of the toplevel context-file consultation layer.
