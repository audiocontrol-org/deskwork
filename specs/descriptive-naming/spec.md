# Feature Specification: Descriptive Naming — slugs, not fake ordinals, for specs and backlog items

**Feature Branch**: `feature/stack-control` (one-long-lived-branch convention; spec dir `specs/descriptive-naming`)

**Created**: 2026-06-10

**Status**: Draft

**Input**: Operator directive (2026-06-10, verbatim): *"There is absolutely no reason to use fake ordinal numbers instead of descriptive slugs in either one [backlog items or specs]. The numbers are misleading since they imply a false order and they hide information about what the task or feature is actually about. It's obscurantism masquerading as precision. This isn't a relational database that needs efficient primary and foreign key calculation. This is human-facing interaction with a text processing robot."*

## Context

Two artifact families in this program carry machine-style ordinal identities that obscure rather than inform:

- **Spec directories** are numbered `specs/NNN-slug` (`014-audit-protocol-reliability`). The numbers imply a sequence that does not exist (specs are not executed in order, several are in flight at once, and the roadmap — not the number — owns sequencing), and every surface that displays them spends its first characters on noise. The numbering comes from Spec Kit's default scaffold, not from any need of ours: the layout-aware feature-root resolver already matches exact slug names, Spec Kit's own `feature.json#feature_directory` accepts any path, and `specs/installation-isolation` (authored this session) is the first unnumbered spec — proving the chain end-to-end.
- **Backlog items** are identified as `TASK-n` (`TASK-45`), an opaque counter assigned by the adopted backlog tool. In every human-facing surface — list output, promotion records, audit-log dispositions (`migrated-to-backlog TASK-40`), journal entries, session-start orientation — the number says nothing about the work; the reader must dereference it.

The program already has the correct in-house precedent: **roadmap node ids are fully descriptive** (`impl:feature/execution-engine`, `design:gap/roadmap-order-gating`) — phase and kind and slug, no counter. The operator's directive extends that posture to the remaining two families.

Known constraints from the adopted tools (capture, not scope):

- Spec Kit's authoring scaffold auto-generates `NNN-` prefixes (`branch_numbering: sequential|timestamp` in `init-options.json`), but honors an explicitly provided feature directory; the literal `specs/` parent name is fixed upstream.
- The backlog tool (backlog.md) owns id assignment (`TASK-n`) as its primary key; its id scheme is not believed to be configurable to slugs. The directive targets the *human-facing interaction* — what stack-control surfaces print, record, and accept — which stack-control owns even where the underlying tool keeps a counter internally.
- Existing artifacts carry the old names: specs `001`–`014` on disk and in countless recorded references (audit-logs, plans, journals, promotion records, commit messages); backlog dispositions in audit-logs reference `TASK-n`. Recorded history is immutable-by-convention in this program (append-only ledgers).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - New specs are created with descriptive slugs (Priority: P1)

An operator (or the authoring chain) creates a new feature spec. The spec directory is the feature's slug — nothing else. No ordinal prefix is generated, suggested, or required anywhere in the authoring chain (specify → clarify → plan → tasks → analyze), the runnability checks, governance, or the promotion grammar.

**Why this priority**: This is the directive applied at the source — stopping new ordinal debt is the highest-leverage, lowest-risk slice, and it is already proven viable (`specs/installation-isolation`).

**Independent Test**: Author a spec under `specs/<slug>` with no number and drive it through the full chain to runnable; every tool in the chain (artifact checks, feature-root resolution, governance, promotion targets) operates on it without complaint or renaming.

**Acceptance Scenarios**:

1. **Given** a new feature intent, **When** the spec is created, **Then** its directory is `specs/<descriptive-slug>` and every downstream step (plan, tasks, runnability check, governance) resolves it.
2. **Given** a backlog item promoted to a new spec, **When** the promotion target is recorded, **Then** the target grammar accepts the unnumbered `specs/<slug>` form.
3. **Given** the authoring scaffold's default numbering, **When** a spec is authored through this program's front door, **Then** no `NNN-` prefix appears — the scaffold's numbering is bypassed or disabled, not hand-corrected after the fact.

---

### User Story 2 - Backlog interaction is slug-first (Priority: P1)

Every human-facing backlog surface — capture confirmation, list output, promotion records, slush dispositions written into audit-logs, session-start orientation — leads with a stable descriptive slug for the item. Wherever an identifier is accepted as input (promote, edit, notes), the descriptive slug is accepted; an internal counter, if the adopted tool requires one, becomes an implementation detail the operator never needs to read or type.

**Why this priority**: Co-equal half of the directive — the backlog is the program's daily working surface, and `TASK-45` conveys nothing.

**Independent Test**: Capture an item, list the pile, promote the item, and read the recorded disposition — every surface displays and accepts the slug; nothing requires the operator to know a counter.

**Acceptance Scenarios**:

1. **Given** a new capture, **When** it is recorded, **Then** the confirmation and the stored item lead with a descriptive slug derived from the title (collision-disambiguated deterministically).
2. **Given** an audit-log slush disposition, **When** a finding migrates to the backlog, **Then** the recorded disposition names the slug (a reader of the audit-log learns what the parked work is without dereferencing).
3. **Given** a promote/edit/notes invocation, **When** the operator supplies the slug, **Then** the verb resolves it (ambiguity fails loud listing candidates).

---

### User Story 3 - Existing artifacts and recorded references stay navigable (Priority: P2)

The program's history — numbered spec dirs `001`–`014`, `TASK-n` references in audit-logs, journals, promotion records — remains navigable after the convention change. Tools resolve old identifiers wherever they appear in recorded history; nothing breaks by virtue of carrying an old name.

**Why this priority**: The ledgers are append-only by program convention; a naming change that orphaned recorded references would trade one kind of obscurity for another.

**Independent Test**: After the convention lands, resolve a numbered spec dir and a `TASK-n` reference from recorded history through the standard tools; both still resolve (with or without a deprecation note), and no recorded ledger line was rewritten to make that true.

**Acceptance Scenarios**:

1. **Given** the existing numbered spec dirs, **When** tools resolve them (feature root, governance, runnability), **Then** they keep working — numbered dirs remain valid *legacy* names even as new specs stop using numbers.
2. **Given** a `TASK-n` reference in a committed audit-log, **When** an operator follows it, **Then** the item is findable (the counter remains resolvable as an alias even after surfaces go slug-first).

---

### Edge Cases

- **Slug collisions**: two features or two backlog items with the same natural slug — disambiguation must be deterministic and descriptive (qualifier words), never a silent counter suffix that reintroduces ordinals by the back door.
- **Slug renames**: titles evolve; a recorded slug is an identifier, not a living title — the design must say whether slugs are frozen at creation (like the roadmap's node ids) or renameable with an alias trail.
- **The adopted backlog tool's internal counter**: if it cannot be removed, it must never surface as the primary identity in stack-control output — and round-tripping (slug in → tool's counter → slug out) must be lossless.
- **Sorting and listing**: ordinals gave accidental creation-order sorting; slug-first surfaces need an explicit order (creation date, status, priority) so removing numbers doesn't degrade scanability.
- **Prefix matching in existing tooling**: resolvers and grammars that pattern-match `NNN-` (the promotion target grammar's `specs/\d+-slug` rule, any branch-prefix lookups) must accept slug-only forms without weakening their fail-loud ambiguity handling.
- **The legacy-docs layout** (`docs/<v>/001-IN-PROGRESS/<slug>`): the `001-IN-PROGRESS` bucket is a *status* name from the retired convention, not a feature ordinal — out of this directive's blast radius; it is already slated for retirement with the docs layout itself.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: New feature specs MUST be identified by descriptive slugs alone (`specs/<slug>`); no surface in the authoring, checking, governance, or promotion chain may require, generate, or imply an ordinal prefix for new specs.
- **FR-002**: Every human-facing backlog surface MUST lead with a descriptive slug as the item's identity, and every identifier-accepting verb MUST accept the slug. Internal counters, where the adopted tool mandates them, are non-primary and never required for operator interaction.
- **FR-003**: Slug derivation MUST be deterministic, and collisions MUST be resolved descriptively (qualifier words, fail-loud ambiguity prompts) — never by appending a bare counter.
- **FR-004**: Recorded history MUST NOT be rewritten: existing numbered spec dirs and `TASK-n` references in append-only ledgers remain valid and resolvable (legacy aliases), while new records use slugs.
- **FR-005**: The promotion-target grammar and every resolver that currently pattern-matches numbered forms MUST accept slug-only forms with unchanged fail-loud semantics for ambiguity.
- **FR-006**: Listing surfaces MUST provide an explicit, documented ordering so the loss of accidental ordinal sorting does not degrade scanability.
- **FR-007**: The naming convention MUST be recorded as a governance-level principle (constitution or equivalent) so future artifact families (new stores, new ledgers) inherit slug-first naming by default.

### Key Entities

- **Slug**: the descriptive, human-meaningful identifier of a spec or backlog item; stable once recorded; the primary identity on every human-facing surface.
- **Legacy ordinal identifier**: `NNN-` spec prefixes and `TASK-n` counters in existing artifacts and ledgers; resolvable aliases, never generated for new artifacts.
- **Roadmap node id** (`phase:kind/slug`): the in-house precedent for descriptive identity; unchanged by this feature; cited as the model.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of specs created after this feature ships carry no ordinal prefix, and the full authoring-to-governed chain passes on an unnumbered spec without manual intervention.
- **SC-002**: An operator reading any new backlog surface (capture confirmation, list, promotion record, audit-log disposition) can state what the item is about from the identifier alone — zero dereference steps.
- **SC-003**: Every recorded historical reference (numbered spec dirs, `TASK-n` ledger lines) still resolves through the standard tools after the change; zero ledger rewrites.
- **SC-004**: Slug input is accepted by every identifier-accepting verb; ambiguous input fails loud listing candidates in 100% of collision cases.

## Assumptions

- The roadmap's `phase:kind/slug` node ids already satisfy the directive and are out of scope.
- Spec Kit's `specs/` parent directory name (fixed upstream) is acceptable; the directive targets the ordinal prefixes, not the parent dir name.
- The adopted backlog tool retains its internal id scheme; this feature governs stack-control's surfaces over it, not the tool's storage format (faithful tool adoption).
- Whether existing numbered spec dirs are *renamed* (migration) or only *grandfathered* (forward-only convention) is an operator scoping decision deliberately left open in this capture; FR-004 guarantees navigability under either choice.
- The `001-IN-PROGRESS` docs bucket is status-named, not ordinal-named, and is retired with the legacy docs layout separately.
