# Feature Specification: Governance Code Scope

**Feature Branch**: `feature/governance-code-scope`

**Created**: 2026-07-04

**Status**: Draft

**Roadmap item**: `impl:feature/governance-code-scope`

**Design record**: `docs/superpowers/specs/2026-07-04-governance-code-scope-design.md` (operator-approved)

**Input**: Restrict stack-control implement-time (execute) governance audit-barrage payload to code only, excluding documentation, because the barrage rings on documentation trivia and large documentation payloads blow out the context window of smaller fleet models; by implement time, documentation feedback is not wanted — docs are reviewed by the operator.

## Governing Classification Rule *(load-bearing)*

**Code is anything that defines the runtime environment. Documentation is meta-information *about* the code that does not affect the runtime environment.**

Consequences specific to stack-control:

- A `SKILL.md` skill body **is code** — it defines agent runtime behavior (enforcement lives in skill bodies).
- `WORKFLOW.md` (governed lifecycle gates) and context-injected rule files (`.claude/rules/**/*.md`, `CLAUDE.md`, `AGENTS.md`) are **code** — they shape agent runtime behavior.
- PRDs, `spec.md`, `plan.md`, journals, `DEVELOPMENT-NOTES.md`, design records, and READMEs are **documentation**.

The feature is therefore "exclude documentation," not "exclude markdown." File extension is only the cheap first cut; the runtime-vs-meta boundary is encoded by an operator-tunable include/exclude policy.

## Clarifications

### Session 2026-07-04

- Q: When code-only scoping excludes documentation from the payload, what should the govern run surface about the exclusion? → A: A concise summary — the count of excluded documentation files plus that code-only scoping is active; on an empty code scope, the "nothing to govern — no code in scope" reason. Not the full path list (too noisy on doc-heavy diffs); not silent (the operator must be able to notice scoping fired and catch a mis-scoped `include`).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Implement-time governance audits only code (Priority: P1)

An operator runs `/stack-control:execute` (or `stackctl govern --mode implement`) at the end of implementing a feature whose diff contains both code and documentation (PRDs, specs, journals, READMEs). The cross-model audit-barrage receives **only the code** in the payload. Auditors never see documentation, so they cannot ring on wording/phrasing corners of forward-looking prose, and the documentation bytes never inflate the payload beyond a small model's context window.

**Why this priority**: This is the feature. It directly removes the two harms (documentation-trivia ringing that defeats convergence, and context-window blowout on doc-heavy payloads) that make per-feature governance costly today. Everything else is configuration and edge-handling around it.

**Independent Test**: With the default policy active, run implement-mode governance over a feature diff that mixes `.ts` files and `.md` documentation; confirm the assembled audit payload contains the code files and their diffs but none of the documentation files, and that the barrage prompt no longer instructs auditors to review documentation.

**Acceptance Scenarios**:

1. **Given** a committed feature diff with `src/foo.ts` and `docs/PRD.md`, **When** implement-mode governance assembles its payload with the default code-only policy, **Then** the payload includes `src/foo.ts` (with its diff) and excludes `docs/PRD.md`.
2. **Given** the same diff, **When** the audit lens is selected for a code-only run, **Then** the lens does not instruct auditors to check documentation drift.
3. **Given** a feature diff that also changes `plugins/x/skills/y/SKILL.md`, **When** the payload is assembled with the default policy, **Then** `SKILL.md` remains in the payload (it is code by the governing rule), while `docs/PRD.md` is excluded.
4. **Given** the mid-audit fix loop re-scopes the diff after a fix creates new files, **When** re-scoping runs, **Then** the same code-only filter is applied to the re-scoped set (documentation added by a fix is also excluded, code is retained).

---

### User Story 2 - Operator tunes the code/documentation boundary (Priority: P2)

An operator wants to adjust which files count as code versus documentation for a given installation — for example, to rescue a markdown test fixture that should be audited as code, or to exclude an additional non-markdown documentation format. They edit a `govern` block in `.stack-control/config.yaml` with `include`/`exclude` glob lists, or disable code-only scoping entirely to restore auditing of the whole diff.

**Why this priority**: The runtime-vs-meta boundary is a judgment the operator owns; a fixed hardcoded rule cannot express it for every installation. The toggle is also the escape hatch for a genuinely documentation-heavy feature someone wants audited.

**Independent Test**: Set `govern.code_scope.include` to add a glob, and confirm a file matching it survives the default `.md` exclusion; set `govern.code_only: false` and confirm the whole diff (documentation included) is audited exactly as before the feature.

**Acceptance Scenarios**:

1. **Given** no `govern` block in config, **When** implement-mode governance runs, **Then** the default policy applies (code-only ON; `**/*.md`,`**/*.markdown` excluded; the full FR-006 default include re-included: `**/SKILL.md`,`**/WORKFLOW.md`,`**/.claude/rules/**/*.md`,`**/CLAUDE.md`,`CLAUDE.md`,`**/AGENTS.md`,`AGENTS.md`).
2. **Given** `govern.code_only: false`, **When** governance runs, **Then** the code-only filter is an identity no-op and the payload is exactly today's whole-diff payload.
3. **Given** a file that matches both an `exclude` glob and an `include` glob, **When** the filter runs, **Then** the file is **kept** (include wins).
4. **Given** an operator supplies a custom `exclude` or `include` list, **When** the policy resolves, **Then** the supplied list **replaces** the corresponding default (not merged), so the effective lists are fully readable from the config file.
5. **Given** a documentation file at the repository root (e.g. `README.md`) and a runtime file at the root (e.g. `CLAUDE.md`), **When** the default policy runs, **Then** the root `README.md` is excluded and the root `CLAUDE.md` is kept — the glob matches at the repository root as well as in nested directories.

---

### User Story 3 - A documentation-only change graduates cleanly (Priority: P3)

An operator runs implement-mode governance on a feature whose entire diff is documentation (no runtime-defining files changed). Under code-only scoping the code payload is empty. Instead of a fatal error, governance reports a clean "nothing to govern — no code in scope" success, and the item is allowed to graduate. Documentation is the operator's review responsibility, so an empty code payload is a legitimate, non-error state.

**Why this priority**: This is an edge case that must not break, but it is rarer than the primary flow because runtime-defining markdown (skill bodies, workflow, rules) is retained as code — a genuinely documentation-only implement change is uncommon. It is P3 because getting it wrong blocks a legitimate change, but it is not the value driver.

**Independent Test**: Run implement-mode governance over a diff containing only `docs/*.md`/`spec.md` changes with the default policy; confirm the run exits with a success indicating nothing was in code scope, rather than the empty-scope fatal error, and that graduation is permitted.

**Acceptance Scenarios**:

1. **Given** a feature diff containing only documentation files, **When** code-only filtering removes the entire scope, **Then** governance reports a "nothing to govern — no code in scope" success (not a fatal error).
2. **Given** the "nothing to govern" success, **When** the operator proceeds to graduate the item, **Then** graduation is permitted (the empty-code-scope success satisfies the govern precondition).

---

### Edge Cases

- **Markdown that is product (skill bodies, workflow, rules).** Retained in the payload via the default `include` list — governed as code. Confirmed by US1 scenario 3.
- **Root-level files.** Glob matching applies at the repository root, not only nested paths (US2 scenario 5) — hence explicit root entries (`CLAUDE.md`, `AGENTS.md`) alongside `**/CLAUDE.md`, `**/AGENTS.md` in the default include.
- **Mid-fix re-scope.** The filter is applied wherever the diff scope is produced, so the fix-loop re-scope inherits it (US1 scenario 4) — documentation introduced by a fix does not leak into a later audit round.
- **Documentation-only diff → empty code scope.** A success, not a fatal (US3).
- **`code_only: false`.** Full identity no-op; today's behavior returned exactly (US2 scenario 2).
- **Markdown test fixtures.** A `.md` file used as test data drops under the default `exclude`; the operator rescues it via an `include` glob (US2). Noted as a documented example, not an automatic behavior.
- **Spec-mode governance.** Untouched — this feature scopes only the implement path. Spec-mode (currently parked/opt-in) still folds spec/plan artifacts when explicitly run.
- **Clone sub-step.** Already code-only by construction (source-language detection); unaffected.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Implement-mode governance MUST filter its diff payload to code before chunking/auditing, excluding documentation according to the resolved code-scope policy.
- **FR-002**: The system MUST apply the code-scope filter at the single scope seam through which every implement-mode file passes, so that both the initial scope and the mid-fix re-scope are filtered identically and no path can bypass it.
- **FR-003**: The filter MUST preserve each surviving file's per-file diff unchanged (dropping a file must not alter the diffs of retained files).
- **FR-004**: A file MUST be dropped from the payload if and only if it matches an `exclude` glob AND matches no `include` glob (**include wins**); every other file is retained.
- **FR-005**: The system MUST expose a `govern` configuration block on the installation config (read from `.stack-control/config.yaml`) with: a `code_only` boolean toggle; a `code_scope.exclude` glob list; and a `code_scope.include` glob list.
- **FR-006**: When the `govern` block is absent, the system MUST apply the default policy: `code_only` ON; `exclude = [**/*.md, **/*.markdown]`; `include = [**/SKILL.md, **/WORKFLOW.md, **/.claude/rules/**/*.md, **/CLAUDE.md, CLAUDE.md, **/AGENTS.md, AGENTS.md]`.
- **FR-007**: When `code_only` is `false`, the code-scope filter MUST be an identity no-op — the payload MUST equal the pre-feature whole-diff payload exactly.
- **FR-008**: When an operator supplies an `exclude` or `include` list, that list MUST replace the corresponding default (not merge with it), so the effective policy is fully determined by the config file's literal contents.
- **FR-009**: Glob matching MUST match files at the repository root as well as in nested directories.
- **FR-010**: When code-only scoping is active, the implement-mode audit lens MUST omit the documentation-drift instruction (auditors MUST NOT be asked to review documentation that is no longer in the payload).
- **FR-011**: When code-only filtering removes the entire scope (a documentation-only diff), governance MUST report a "nothing to govern — no code in scope" success rather than a fatal empty-scope error, and this success MUST satisfy the graduation precondition.
- **FR-012**: The feature MUST affect only implement-mode governance. Spec-mode governance MUST be unchanged, and the code-only filter MUST NOT be applied to the spec-mode payload.
- **FR-013**: The code-scope filter MUST be a deterministic, pure transform over the file set (decidable, order-independent) so that it is verifiable on the compiler/test floor rather than relying on the stochastic audit layer.
- **FR-014**: When code-only scoping is active and excludes one or more files, the govern run MUST surface a concise summary — the count of excluded documentation files and that code-only scoping is active. It MUST NOT emit the full excluded-path list. When code-only filtering empties the scope, the summary MUST state the "nothing to govern — no code in scope" reason (the FR-011 success). When no files are excluded, no exclusion summary is required.

### Key Entities

- **GovernConfig**: the new installation-config block. Attributes: `codeOnly` (boolean, default true); `codeScope` (the include/exclude policy). Home for the first govern-tuning fields on the installation config.
- **CodeScopePolicy**: the resolved include/exclude glob lists plus the active/inactive flag, derived from `GovernConfig` (or defaults when absent). Consumed by the filter.
- **DiffScope**: the existing scoped-diff structure (changed file set + per-file diff text) that the filter narrows. The filter is a `DiffScope → DiffScope` transform, a sibling of the existing path-based exclusion filter.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: With the default policy, implement-mode governance over a mixed code+documentation diff produces an audit payload containing zero documentation files (excluding those re-included as product markdown) and all code files — verifiable by inspecting the assembled payload's file set.
- **SC-002**: For a doc-heavy feature diff, the assembled implement-mode payload's byte size is reduced by the full size of the excluded documentation relative to today's payload — verifiable by comparing payload bytes with `code_only` on versus off.
- **SC-003**: Runtime-defining markdown (skill bodies, workflow, rule files) remains present in the payload under the default policy in 100% of cases — verifiable by asserting those files survive the filter.
- **SC-004**: Setting `code_only: false` reproduces today's payload exactly (byte-identical file set and diffs) — verifiable by a before/after equality check.
- **SC-005**: A documentation-only feature diff completes governance with a success outcome and permits graduation in 100% of cases, with zero fatal empty-scope errors — verifiable by running governance on a docs-only diff.
- **SC-006**: A code-only governance run's audit prompt contains no instruction to review documentation — verifiable by inspecting the rendered lens.
- **SC-007**: When documentation is excluded, the govern run reports the count of excluded files and that code-only scoping is active (and, for an empty code scope, the "nothing to govern" reason), with no full excluded-path list — verifiable by inspecting the run output.

## Assumptions

- The concrete glob-matching engine (e.g. an existing dependency versus git-pathspec semantics) is an implementation-time choice; whichever is used must satisfy FR-009 (root and nested matching). The design commits to glob semantics, not a specific library.
- Operator-supplied lists replace defaults (FR-008). A future "defaults plus additions" merge ergonomics is out of scope for this feature and would be a separate, explicit opt-in.
- Markdown test fixtures (if any exist as audited test data) are excluded under the default policy and are rescued via an `include` glob by the operator; no automatic fixture detection is in scope.
- Documentation is reviewed by the operator directly; this feature builds no alternative documentation-governance venue. Spec-mode remains the (parked/opt-in) place doc-oriented governance could occur, but wiring that is out of scope here.
- This feature supersedes the implement-time half of the roadmap item `multi:gap/govern-doc-aware-audit-lens`; the disposition of that item (reframe or retire) is an operator-owned roadmap decision, not part of this feature's implementation.
- Implement-mode governance operates on the whole committed feature diff (the per-phase checkpoint path is already retired); this feature scopes that whole-feature payload.
