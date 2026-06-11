# Feature Specification: Audit-Protocol Reliability — Silent-Failure Hardening

**Feature Branch**: `feature/stack-control` (one-long-lived-branch convention; spec dir resolved via the CLAUDE.md SPECKIT marker / `.specify/feature.json`, not the branch)

**Created**: 2026-06-11

**Status**: Draft

**Input**: Operator-cultivated backlog burn-down cluster (2026-06-11 session): eight verified defects in the audit/governance protocol and its supporting verbs, all sharing one theme — **the protocol fails silently or wrongly when unattended**. The thesis cannot tolerate this: industrialized execution depends on the audit fleet being trustworthy without operator babysitting, and every defect below was discovered precisely because an operator happened to be watching.

## Context — origin and bidirectional navigability

This feature graduated from the stack-control backlog via `backlog promote` (recorded 2026-06-11):

| Backlog item | Promotion | Provenance | Defect |
|---|---|---|---|
| **TASK-29** | `spec:` (lead) | gh-447 | Barrage reports "successful" on a zero-output model timeout |
| **TASK-30** | `tasks:` | gh-446 | Legacy dw-lifecycle barrage config silently ignored |
| **TASK-12** | `tasks:` | gh-440 | Lift merges distinct-mechanism findings under one ID |
| **TASK-2** | `tasks:` | AUDIT-20260609-19 | slush-findings dry-run/apply derive from two independent walks |
| **TASK-37** | `tasks:` | gh-431 | Govern payload includes its own audit-log → self-referential findings |
| **TASK-28** | `tasks:` | gh-448 | scope-widen hard-aborts on a missing clone baseline |
| **TASK-24** | `tasks:` | specs/013 research D5 | scope-* + doctor construct legacy-layout paths directly |
| **TASK-5** | `tasks:` | AUDIT-20260609-22 | One malformed task file crashes backlog list/exists/imports |

Every defect is **verified against current code or a recorded run** (run JSON, audit-log entries, or a written acceptance probe) — none is speculative.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — A degraded barrage fleet is loud, never silent (Priority: P1)

An operator (or unattended loop) fires `audit-barrage`. One model times out producing zero bytes. The run still completes (a partial fleet is a usable run), but the degradation is announced loudly: the human-facing summary and stderr name each timed-out / zero-output model and state the consequence — cross-model agreement, the protocol's HIGH-confidence signal, is unavailable this round. A protocol-driven caller can opt into strictness (a minimum-models requirement) so that a degraded fleet fails the run instead of quietly downgrading every finding's confidence tier.

**Why this priority**: Cross-model agreement is the core correctness mechanism (stochastic correctness per the thesis). In the observed run (20260610T184044970Z-design-control: claude `timedOut: true, stdoutBytes: 0`; codex emitted findings), the summary read *"barrage successful — 1 of 2 models emitted findings"* with exit 0 — a 50% fleet failure visible only by reading the run JSON. The round had to be re-fired manually once noticed.

**Independent Test**: Drive a barrage where one configured model produces zero output within its timeout (fixture/fake runner). Assert the summary and stderr name the degraded model and the consequence; assert exit code unchanged (0) by default; assert the strict-mode flag turns the same run into a loud failure.

**Acceptance Scenarios**:

1. **Given** a barrage run where a model times out with zero bytes of output, **When** the run completes, **Then** the human-facing summary and stderr name that model, state it produced no output, and state that cross-model agreement is unavailable for the round — and the run JSON continues to record the same facts.
2. **Given** the same degraded run, **When** no strictness option was requested, **Then** the exit code remains 0 (a partial fleet stays usable; the contract change is additive).
3. **Given** a caller that requested a minimum fleet (e.g. at least 2 emitting models), **When** fewer models emit output, **Then** the run fails loudly naming the shortfall (which models, expected vs actual count).
4. **Given** a fully healthy fleet, **When** the run completes, **Then** no degradation warning is emitted (no cry-wolf noise).

---

### User Story 2 — A legacy dw-lifecycle barrage config is detected, never silently ignored (Priority: P1)

A project migrating from dw-lifecycle carries operator-tuned barrage settings (timeouts, model roster, disablement rationale) at the legacy path `.dw-lifecycle/scope-discovery/audit-barrage-config.yaml`. When stack-control's barrage runs and reads only its own override path, the presence of the unread legacy file is announced loudly — naming both paths and the migration step — instead of the project silently running on defaults.

**Why this priority**: Observed wasting a full model run: the TF-003 timeout fix (300s → 600s) lived in the legacy config copy; the first stackctl-driven barrage ran at the stale 300s default and timed out with zero output. The failure was diagnosable only by reading config-loader source. Silent divergence between two nearly-identical config files compounds with US1's silent-timeout defect — the two together produced an invisible wasted round.

**Independent Test**: Place a legacy config at the dw-lifecycle path in a fixture project with no stack-control override. Run the barrage config load. Assert a loud warning naming the ignored legacy file, the read path, and the migration remediation. Assert the warning does NOT fire when no legacy file exists, and does NOT fire when the stack-control override is present alongside an identical legacy leftover [see Assumptions].

**Acceptance Scenarios**:

1. **Given** a legacy `.dw-lifecycle/**/audit-barrage-config.yaml` and no `.stack-control/audit-barrage-config.yaml`, **When** the barrage loads its config, **Then** a loud warning names the legacy file as present-and-ignored and states the migration step.
2. **Given** no legacy file, **When** config loads, **Then** no warning (no noise on clean installs).
3. **Given** both files present, **When** config loads, **Then** the stack-control file is used and the legacy file's presence is still surfaced (it may carry drifted settings).

---

### User Story 3 — Lift merges only same-root-cause findings; distinct mechanisms stay independently closeable (Priority: P1)

When `audit-barrage-lift` folds per-model findings into the audit-log, findings that agree on **surface** (same file/region) but differ on **mechanism** (different root causes) land as separate, independently-closeable audit-log entries. Cross-model agreement is recorded where it exists, but it is never the merge key that collapses distinct defects into one entry documenting only one of them.

**Why this priority**: Observed twice systematically (runs 20260605T181608913Z and 20260606T060403205Z on design-control): 9 structured findings collapsed to 4 entries; five distinct mechanisms merged under one ID whose body described only one. A fixer reading the merged body fixes one of five real defects and marks the entry `fixed`, silently dropping four. The workaround was reading raw per-model outputs and hand-splitting entries.

**Independent Test**: Feed lift a run-dir fixture with multiple models flagging the same file but describing distinct mechanisms. Assert one audit-log entry per distinct mechanism, each carrying its own body; assert genuinely same-root-cause cross-model findings still merge with the cross-model annotation.

**Acceptance Scenarios**:

1. **Given** two models flagging the same surface with distinct mechanisms, **When** lift runs, **Then** each mechanism gets its own audit-log entry with its own ID and body.
2. **Given** two models describing the same root cause at the same surface, **When** lift runs, **Then** they merge into one entry annotated as cross-model (the HIGH-confidence signal is preserved where it is real).
3. **Given** the historical fixture reproducing the observed 5-into-1 collapse, **When** lift runs, **Then** no entry's body documents fewer mechanisms than the findings folded into it.

---

### User Story 4 — slush-findings dry-run and apply can never disagree (Priority: P1)

When the dampener decides which findings migrate to the backlog, `slush-findings` migrates **exactly the set the dampener decided**. The dry-run count and the applied migration derive from one source of truth, so "would migrate N" is always followed by exactly N migrations — never fewer with exit 0.

**Why this priority**: The apply path currently recomputes the migration set from a second, independent audit-log walk with its own keying (canonicalized IDs + literal `Status: open` match). A keying divergence makes dry-run print "would migrate N" while apply migrates fewer, leaving findings `open` silently — breaking the 0-open-MEDIUM graduation invariant the govern orchestration depends on, with exit 0 and a success message (AUDIT-20260609-19, cross-model: claude-02 + codex-02).

**Independent Test**: Construct an audit-log fixture where the dampener's flip set and a literal re-parse would diverge (e.g. a finding ID whose canonical form differs, or a status line with trailing annotation). Assert apply migrates the dampener-decided set exactly and the audit-log shows no finding left `open` that the dry-run counted.

**Acceptance Scenarios**:

1. **Given** any dampener decision of N flips, **When** apply runs, **Then** exactly N findings are migrated and their audit-log statuses updated.
2. **Given** a finding the dampener flipped whose ID/status line would not match an independent re-parse, **When** apply runs, **Then** that finding still migrates (single source of truth) — or, if migration is genuinely impossible, the verb fails loudly naming the finding (never exit 0 with a silent shortfall).
3. **Given** a dry-run reporting "would migrate N", **When** apply follows on the unchanged audit-log, **Then** the applied count is N.

---

### User Story 5 — The governance barrage audits the implementation, not its own findings ledger (Priority: P1)

`govern --mode implement` builds a barrage payload that excludes the feature's own audit-log (and governance bookkeeping surface), and folds untracked files only when they belong to the feature under audit. Multi-round governance loops can reach a clean zero-finding floor because no round re-reads the previous round's prose as if it were repository code.

**Why this priority**: The self-reference is a **non-convergent finding generator**: AUDIT-20260608-28 → -42 → -48 re-fired the same hallucinated path across rounds 1, 2, and 7 of the 005 governance loop — every occurrence was audit-log prose (verified absent from git and disk three ways), and each round's dispositions strengthened the self-reference. Separately, the indiscriminate untracked-fold pulled a parked feature's blank `/speckit-plan` template into every 005 payload (recurring out-of-scope findings, AUDIT-29). Without this fix a thorough governance loop cannot converge (gh-431).

**Independent Test**: Build a payload for a feature whose root contains an audit-log with quotable prose, with an unrelated feature's untracked scaffold present in the repo. Assert the payload contains neither the audit-log content nor the unrelated scaffold; assert the feature's own implementation diff is intact.

**Acceptance Scenarios**:

1. **Given** a feature with an audit-log under its root, **When** the implement-mode payload is built, **Then** the audit-log (and the governance bookkeeping surface) is not part of the audited diff/untracked fold. (The separately-threaded `audit_log_excerpt` context block — which is labeled as prior-findings context, not audited code — is unaffected.)
2. **Given** an unrelated feature's untracked scaffold elsewhere in the repo, **When** the payload is built, **Then** that scaffold is not folded in.
3. **Given** untracked files belonging to the feature under audit, **When** the payload is built, **Then** they ARE folded in (the fold is scoped, not removed).

---

### User Story 6 — scope-widen works on a fresh installation without a clone baseline (Priority: P2)

The first `scope-widen` of a freshly-set-up installation — exactly when no clone baseline exists yet — proceeds. Either the missing scope-discovery state is auto-seeded on first use (announced, matching the backlog store's auto-scaffold pattern), or the clone-derived arm degrades to an announced skip ("clone baseline absent; clone-derived widening unavailable this run") while the complaint-driven arms complete.

**Why this priority**: Observed on design-control: a purely complaint-driven widen (+3 themes, +0 clone-derived changes) hard-aborted on clone-reader ENOENT; recovery needed two extra setup verbs before the registration could run. P2 because the failure is loud and recoverable — but it blocks the working convention "genuine defeat → fixture + scope-widen" at exactly the moment a new adopter first reaches for it (gh-448).

**Independent Test**: Run scope-widen with explicit `--manifest`/`--prd-path` in a fixture installation with no `clones.yaml`. Assert exit 0, the complaint-driven delta applied, and a loud announcement of either the seed or the skip — never a hard abort.

**Acceptance Scenarios**:

1. **Given** an installation with no clone baseline, **When** a complaint-driven widen runs, **Then** the widen completes its non-clone arms and announces the clone arm's disposition (seeded or skipped).
2. **Given** an installation WITH a baseline, **When** the same widen runs, **Then** behavior is unchanged from today.
3. **Given** a widen whose requested work is genuinely clone-dependent, **When** no baseline exists, **Then** the verb says so loudly with the remediation — it does not silently produce empty clone results.

---

### User Story 7 — scope-discovery and doctor are layout-aware (specs/NNN-slug), completing 013 (Priority: P2)

Every scope-discovery and doctor surface that locates a feature's files (scope-manifest.yaml, prd.md, widen-run evidence) resolves the feature root through the layout-aware resolution that 013 established for the governance path — so `scope-inventory`, `scope-widen`, `scope-export`, and the provenance doctor rule work on `specs/NNN-slug` features exactly as they do on legacy `docs/<v>/001-IN-PROGRESS/<slug>` features.

**Why this priority**: specs/013 research D5 verified the residual: `scope-inventory-cli.ts`, `scope-widen-cli.ts`, `scope-inventory.ts`, `scope-widen.ts`, `scope-export.ts`, and `doctor-rules/provenance-orphaned-entries.ts` construct `docs/1.0/001-IN-PROGRESS/<slug>/` paths directly. 013 explicitly scoped them out as not-on-the-governance-blocker-path; this story is the documented follow-on (TASK-24). The gh-442 follow-up comment adds a verified instance: scope-widen derives its widen-run EVIDENCE path from the docs layout even when `--manifest`/`--prd-path` are explicit, recreating the old docs tree on a spec-layout feature (evidence had to be relocated by hand on design-control).

**Independent Test**: The acceptance probe is already written: `grep -rn '001-IN-PROGRESS' plugins/stack-control/src --include='*.ts'` excluding `feature-root.ts` and `__tests__` must return empty. Behaviorally: run scope-export and a complaint-driven scope-widen against a `specs/NNN-slug` fixture; assert resolution succeeds and widen-run evidence lands under the spec-layout feature root.

**Acceptance Scenarios**:

1. **Given** a feature under `specs/NNN-slug/` with a scope manifest, **When** scope-inventory / scope-widen / scope-export / the provenance doctor rule resolve its files, **Then** they resolve under the spec layout with no manual path flags.
2. **Given** a legacy-layout feature, **When** the same verbs run, **Then** behavior is unchanged (no regression; same contract as 013 US1).
3. **Given** a spec-layout feature and an explicit `--manifest`/`--prd-path` widen, **When** the widen writes its run evidence, **Then** the evidence lands under the resolved feature root — it does not recreate a `docs/` tree.
4. **Given** the full source tree, **When** the SC-005-style grep probe runs, **Then** no scope-discovery/doctor consumer constructs the legacy path outside the shared resolver.

---

### User Story 8 — One malformed task file degrades gracefully, not into a backlog outage (Priority: P3)

A single backlog task file with malformed YAML frontmatter (hand-edit, partial write, merge-conflict marker) no longer crashes `backlog list` / `exists` / both imports with an uncaught parse error. The verb fails within its documented contract — a descriptive error naming the offending file with remediation (exit 2), or an announced per-file skip — never an exit-1 stack trace.

**Why this priority**: P3 because backlog.md owns the write format (well-formed is the norm) and the current failure is loud. But one corrupt file currently degrades into a total outage of list and both imports' idempotency checks, with an unhelpful stack trace instead of the fail-loud-with-remediation contract the verb promises (AUDIT-20260609-22).

**Independent Test**: Drop a task file with broken frontmatter into a fixture store. Assert list/exists/import behavior matches the documented contract: descriptive failure naming the file (exit 2) or announced skip — and never an unhandled throw.

**Acceptance Scenarios**:

1. **Given** a store with one malformed task file among healthy ones, **When** `backlog list` runs, **Then** the outcome is the documented contract (named-file error with remediation, or announced skip with the healthy items listed) — not a stack trace.
2. **Given** the same store, **When** `import-github`/`import-slush` run their idempotency checks, **Then** the same contract holds (no silent duplicate creation, no crash).

---

### Edge Cases

- **US1**: a model that times out AFTER emitting partial output (nonzero bytes) — degraded or not? The run JSON already distinguishes; the warning must not misclassify partial output as healthy. A fleet of one configured model can never produce cross-model agreement — strict mode must account for the configured-fleet floor, not just the emitted count.
- **US2**: multiple legacy config copies (e.g. nested installations); a legacy file that is byte-identical to the active one (still surfaced — drift can arrive later).
- **US3**: N models, M mechanisms at one surface with partial overlap (A+B describe mechanism X, B+C describe Y); a model output that itself bundles two mechanisms in one finding block.
- **US4**: a flip whose finding was hand-edited between dry-run and apply (single-source-of-truth carries indices — staleness must fail loud, not misapply).
- **US5**: a feature whose audit-log lives at a nonstandard location (resolved root is authoritative); the spec-mode payload (the exclusion is implement-mode's diff/fold — spec mode has no diff).
- **US6**: a widen that is PARTLY clone-dependent (complaint arms proceed; clone arm's disposition announced per-arm).
- **US7**: a slug resolvable under both layouts (specs-first precedence per 013); evidence directories already created under the wrong tree by prior runs (out of scope to migrate — new runs land correctly).
- **US8**: ALL task files malformed (graceful contract still holds; empty-result + error must be distinguishable); the malformed file is the one an import's idempotency check would have matched (fail loud — a skip could cause a duplicate).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001** (US1): The barrage MUST surface, in the human-facing summary and stderr, every configured model that produced zero output (timeout or otherwise), naming the model and stating that cross-model agreement is unavailable when fewer than two models emitted findings.
- **FR-002** (US1): The default exit code for a partially-degraded fleet MUST remain 0 (frozen adopter contract; the change is additive).
- **FR-003** (US1): The barrage MUST offer an opt-in strictness mechanism (minimum emitting models) under which a degraded fleet fails loudly, naming expected vs actual.
- **FR-004** (US2): Barrage config loading MUST detect a legacy dw-lifecycle config override and announce it loudly — naming the ignored path, the read path, and the migration step — whenever the legacy file exists.
- **FR-005** (US3): Lift MUST create one audit-log entry per distinct root-cause mechanism; surface-level agreement alone MUST NOT merge findings. Cross-model annotation is recorded only for same-root-cause merges.
- **FR-006** (US4): The set of findings slush-findings migrates on apply MUST be derived from the same single source of truth as the dry-run report (the dampener decision), such that dry-run N and applied N cannot diverge; any finding that cannot be migrated MUST fail the verb loudly by name.
- **FR-007** (US5): The implement-mode govern payload MUST exclude the feature's own audit-log and governance-bookkeeping surface from the audited diff and untracked fold.
- **FR-008** (US5): The untracked fold MUST include only files belonging to the feature under audit.
- **FR-009** (US6): scope-widen MUST NOT hard-abort on a missing clone baseline when the requested widening has non-clone arms; the clone arm's disposition (auto-seed or skip) MUST be announced. Genuinely clone-dependent requests with no baseline MUST fail loudly with remediation.
- **FR-010** (US7): All scope-discovery and doctor feature-file resolution (manifest, prd, widen-run evidence) MUST route through the layout-aware feature-root resolution; no consumer outside the shared resolver (and its tests) may construct the legacy `001-IN-PROGRESS` path.
- **FR-011** (US7): Legacy-layout resolution behavior MUST remain unchanged for all converted consumers (no regression; ported contract tests).
- **FR-012** (US8): A malformed task file MUST NOT produce an unhandled exception from backlog list/exists/imports; the failure mode MUST be the verb's documented descriptive-error contract (naming the offending file) or an announced skip.
- **FR-013** (cross-cutting): Every fix in this feature MUST follow the no-silent-fallbacks rule: degradation is announced, errors are loud, and no code path substitutes a default for missing operator intent without saying so.
- **FR-014** (cross-cutting): Existing exit-code contracts are frozen adopter contracts; changes MUST be additive (new flags, new warnings on stderr) — no existing exit code changes meaning.

### Key Entities

- **BarrageRun record**: the per-run JSON already recording `timedOut` / `stdoutBytes` per model — the ground truth US1's reporting must agree with.
- **Audit-log entry**: one finding with ID, Status, Severity, Surface, body; the unit of independent closeability (US3, US4).
- **Dampener decision (flips)**: the set of findings governance decided to migrate — US4's single source of truth.
- **Barrage payload**: the diff + untracked fold + context blocks govern assembles for the model fleet (US5).
- **Feature root**: the layout-resolved directory (specs/NNN-slug or legacy docs path) under which manifests, evidence, and audit-logs live (US7; established by 013).
- **Backlog task file**: one markdown file with YAML frontmatter in the store; the unit of US8's per-file fault isolation.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Re-running the recorded degraded round (one model `timedOut: true, stdoutBytes: 0`) produces a summary that names the degraded model and the lost agreement signal — the failure that previously required reading run JSON is visible in the default output. Zero silent fleet degradations are reproducible from the eight originating reports.
- **SC-002**: A project with only a legacy dw-lifecycle barrage config sees the warning on its first stackctl barrage run — the recorded wasted-round scenario (stale 300s timeout running unnoticed) cannot recur silently.
- **SC-003**: Replaying the two recorded merge-collapse runs through lift produces one independently-closeable entry per distinct mechanism (9 structured findings never collapse to 4 entries with single-mechanism bodies).
- **SC-004**: For every dampener decision in the slush test corpus (including constructed divergence fixtures), dry-run count equals applied count, and no finding the dampener flipped remains `open` after apply with exit 0.
- **SC-005**: A multi-round implement-mode governance loop over a feature with a populated audit-log generates zero findings whose evidence exists only in audit-log prose (the AUDIT-28/42/48 generator class is extinct), and zero findings about other features' untracked scaffolds.
- **SC-006**: On a fresh installation with no clone baseline, a complaint-driven scope-widen completes in one invocation (today: two extra setup verbs required first).
- **SC-007**: The layout probe — `grep -rn '001-IN-PROGRESS' plugins/stack-control/src --include='*.ts'` excluding the shared resolver and tests — returns empty, and scope-export + scope-widen evidence both work against a `specs/NNN-slug` fixture.
- **SC-008**: A backlog store with one corrupted task file still lists healthy items or fails with a named-file remediation message (per the chosen contract) — never an unhandled stack trace; both imports' idempotency checks share the same behavior.
- **SC-009**: The full stack-control suite stays green, and every behavioral change lands RED-first (a test seen failing for the expected reason precedes each fix — 013 precedent, Constitution Principle I).

## Assumptions

- **Partial-fleet exit semantics**: a degraded-but-nonempty fleet keeps exit 0 by default (TASK-29's own suggested fix); strictness is opt-in. If the operator prefers degraded-by-default-fails, that is a one-line scope decision at plan time.
- **US2 both-files-present behavior**: the active stack-control config wins and the legacy file's presence is still surfaced (drift risk), rather than suppressing the notice on byte-identical copies — surfacing is cheap and the identical case is transient.
- **US3 merge key**: "same root cause" is judged by the lift's clustering input (mechanism described in the finding), not by file/surface proximity. The exact clustering contract is a plan-time decision; the spec's promise is the user-visible one — distinct mechanisms remain independently closeable, and no entry's body under-documents what was folded into it.
- **US5 scope**: the exclusion applies to the audited payload (diff + untracked fold). The deliberately-threaded `audit_log_excerpt` context block (013/TASK-25) is prior-findings context, labeled as such, and stays.
- **US6 disposition choice** (auto-seed vs announced-skip): both satisfy the story; the pick is a plan-time decision. The spec requires only: no hard abort for non-clone work, and the disposition is announced.
- **US7 evidence migration**: previously mis-placed widen-run evidence under recreated `docs/` trees is not retroactively migrated; new runs land correctly. (A migration helper would be new scope — capture separately if wanted.)
- **US8 contract choice** (named-file BacklogError exit 2 vs announced per-file skip): plan-time decision; the spec requires the outcome be within the verb's documented contract and never an unhandled throw. The idempotency-relevant path must fail loud rather than skip (a skipped file could cause duplicate creation).
- **Exit-code freeze**: all eight fixes treat existing exit codes as frozen adopter contracts (project rule); additive surface only.
- This feature is **fix-cluster shaped**: eight independently-testable, independently-shippable stories. Story order within the cluster is a plan/tasks-time sequencing decision; the P1 set (US1–US5) is the protocol-trust core.
