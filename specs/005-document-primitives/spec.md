# Feature Specification: Generalized document-handling primitives — archive & curate (`design/document-primitives`)

**Feature Branch**: `feature/stack-control` (authored alongside specs 001–004 on the shared branch; no dedicated branch — operator decision 2026-06-07)

**Created**: 2026-06-07

**Status**: Draft

**Input**: User description: "Reform roadmap discipline, starting with generalized document-handling primitives — `archive` and `curate` — built as part of the stack-control plugin (not project-specific tooling) and dogfooded in the project. `archive` moves non-live items out of a document into an archive, based on the *mechanism* of the dw-lifecycle workplan-archive tooling but generalized. `curate` ensures a live document is up-to-date, well-formed, well-ordered, and properly archived. Documents are self-describing via a declared grammar; in-document identifiers must be human-readable and must NOT bake in ordinal components."

## User Scenarios & Testing *(mandatory)*

The "users" are operators and agents working on living documents (roadmaps, design inboxes, specs) inside a project that has adopted the stack-control plugin.

### User Story 1 - Keep a live document lean by archiving settled items (Priority: P1)

An operator has a living document whose settled items (shipped roadmap rows, promoted/dropped inbox entries) have accumulated and are crowding the live surface. They run a single command that moves every settled item out of the live document into a sibling archive, leaving the live document containing only active items — and they can reverse it.

**Why this priority**: This is the headline value and the smallest shippable slice. A lean live document is the immediate, visible payoff; archiving is the mechanism the operator reached for first ("an archive skill to keep live documents lean").

**Independent Test**: Take a governable document with a mix of active and settled items, run `archive`, and confirm (a) every settled item now lives in the sibling archive, (b) the live document retains exactly the active items, (c) the move is recorded in a provenance ledger, and (d) `unarchive` returns the document to its original content.

**Acceptance Scenarios**:

1. **Given** a governable document with three active items and two settled (terminal-status) items, **When** the operator runs `archive --apply`, **Then** the two settled items are removed from the live document and appended to the sibling archive file, and the ledger records both moves keyed by their identifiers.
2. **Given** the same document, **When** the operator runs `archive` without `--apply`, **Then** the planned moves are reported and nothing is written (dry-run is the default).
3. **Given** an archived item, **When** the operator runs `unarchive` for that item, **Then** the item returns to the live document and the ledger entry is removed, restoring the prior content.
4. **Given** an archive run, **When** it completes, **Then** the provenance ledger matches the archive file's actual contents (coherence holds).

---

### User Story 2 - Curate a live document so it stays correct (Priority: P2)

An operator wants assurance that a living document is structurally sound: it conforms to its declared shape, its items are in the intended order, settled items have been archived, and — when the document opts in — it is reconciled against an external source of truth. They run one command that reports every deviation and, on request, fixes the mechanical ones.

**Why this priority**: Curation is the broader "ensure it's right" capability that composes archiving. It is higher-effort than archive alone and depends on the same engine, so it follows the MVP.

**Independent Test**: Take a governable document that is out of order, has an un-archived settled item, and declares a reconciliation source; run `curate`; confirm it reports the disorder, the missing archival, and any reconciliation drift; run `curate --apply` and confirm order and archival are corrected.

**Acceptance Scenarios**:

1. **Given** a governable document whose items are out of the declared order, **When** the operator runs `curate --apply`, **Then** the items are reordered to the declared order key and no item identity changes.
2. **Given** a document containing a settled item that has not been archived, **When** the operator runs `curate`, **Then** the report flags it as belonging in the archive (curate composes the archive primitive).
3. **Given** a document that does not parse against its grammar, **When** the operator runs `curate`, **Then** curate fails loud and names the offending location; it does not attempt a partial fix.
4. **Given** a document whose grammar declares a reconciliation source, **When** the operator runs `curate`, **Then** curate runs the source and reports any drift between expected and present items.
5. **Given** a document whose grammar declares no reconciliation source, **When** the operator runs `curate`, **Then** the up-to-date check is skipped (not failed) and the other checks still run.

---

### User Story 3 - Identities stay meaningful as items move (Priority: P3)

An operator reorders and archives items freely over a document's life. They need every item's identifier to remain stable and never to imply a position — so cross-references survive a reshuffle and no identifier becomes misleading once items move out of sequence.

**Why this priority**: This is a correctness guardrail the operator called out explicitly. It is cross-cutting (part of well-formedness) rather than a standalone workflow, so it is verified last — but it is non-negotiable, not optional.

**Independent Test**: Author a document with an ordinal-looking identifier and confirm the engine rejects it loud; author valid identifiers, reorder and archive/unarchive items, and confirm every identifier is byte-for-byte unchanged throughout.

**Acceptance Scenarios**:

1. **Given** a document whose grammar would admit an item identified as `F3` (or a bare number, or `phase-2`), **When** the engine validates it, **Then** validation fails loud naming the ordinal-looking identifier as the cause.
2. **Given** a valid document, **When** items are reordered or archived and unarchived, **Then** every item's identifier is unchanged (identity is decoupled from position).
3. **Given** a document and its archive, **When** a new item reuses an identifier already present in either, **Then** validation fails loud on the duplicate.

---

### Edge Cases

- **No grammar declared**: a document with neither an embedded grammar block nor a resolvable frontmatter reference is not governable → fail loud, no writes (FR-001, FR-010).
- **Both embedded and referenced grammar present**: the embedded grammar wins; the reference is ignored (FR-001 precedence).
- **Parse failure**: the block stream does not parse against the declared grammar → fail loud with the offending span; archive/curate do nothing (FR-003).
- **Reconciliation source declared but fails to run** (non-zero exit / missing tool): treated as a loud error in the up-to-date check, not a silent skip (FR-008, FR-010).
- **Archive file missing on first archive**: created with frontmatter (FR-006).
- **Unarchive identity collision**: an item whose identifier already exists in the live document cannot be unarchived → fail loud (FR-007).
- **A live item cross-references a now-archived item**: the reference still resolves by identifier because identity is stable and the archived item keeps its identifier as its heading (FR-005, FR-006).
- **An item with no recognized status**: the grammar's status vocabulary does not match → parse/validation failure, fail loud (FR-003, FR-004).

## Requirements *(mandatory)*

> Authoring note (applying this session's DRY-for-prose lesson): each rule is stated **once** as its canonical FR; later requirements and the Success Criteria **reference** the canonical FR rather than restating it.

### Functional Requirements

- **FR-001 (governable document — canonical)**: A document is **governable** only if it declares a resolvable block-level grammar. Resolution order, fail-loud with **no fallback**: (1) an **embedded** grammar block (an HTML comment, invisible in rendered markdown); else (2) a **frontmatter reference** to a shared grammar by id, resolved against the project grammar-override location then the plugin's built-in defaults; else (3) **fail loud** ("document declares no grammar; not governable"). When both an embedded block and a reference are present, the embedded block takes precedence.
- **FR-002 (document model — canonical)**: The engine parses a governable document along one shared, type-agnostic pipeline: raw markdown → a **block stream** (via a standard markdown block parser) → the document's **declared grammar**, operating over the block stream and treating prose bodies as **opaque** → a typed tree of **Units**, each carrying `identifier`, `status`, `orderKey`, `span` (source line range), and an opaque `body`.
- **FR-003 (well-formed — canonical)**: A document is **well-formed** if and only if its block stream **parses** against its declared grammar. Well-formedness is a parse success/failure, not a heuristic. A parse failure **fails loud** and names the offending span; no partial operation proceeds.
- **FR-004 (status & order — canonical)**: A grammar declares its **status vocabulary**, which statuses are **terminal** (archivable), and an **order key**. A Unit is **archivable** if and only if its status is in the terminal set. A document is **well-ordered** if and only if its Unit sequence matches the declared order key. The order key MUST be expressible over status and human-readable fields and MUST NOT reference the Unit identifier (this is what structurally prevents an identifier from implying position).
- **FR-005 (identifier invariants — canonical)**: A Unit's **identity is decoupled from its position**. The engine enforces these as universal invariants for every governable document, as part of FR-003 well-formedness, fail-loud on violation:
  - **Unique** within the document ∪ its archive (so unarchive — FR-007 — cannot collide).
  - **Human-readable**: a single visible slug-style name (lowercase words with `-` and `/` separators) *is* the identifier; there is **no parallel opaque token** (no UUID alongside it). The `<phase>/<slug>` codename is the recommended reference shape.
  - **Non-ordinal**: the engine **rejects** any identifier that looks sequential — a bare-integer segment, or a sequence-implying token such as `F<n>`, `phase-<n>`, `step-<n>`, `#<n>`, or leading `<n>` numbering — via a refinable denylist guard.
  - **Property-based, not a fixed shape**: the engine validates the *properties* (unique / human-readable / non-ordinal); each grammar declares its concrete identifier production with `<phase>/<slug>` as the recommended default.
- **FR-006 (archive — canonical)**: The `archive` primitive parses a governable document (FR-002), selects the archivable Units (FR-004), **cuts** them by `span`, **appends** them to a sibling archive file (created with frontmatter if absent), and updates a **provenance ledger** (recording what moved and when, keyed by **identifier** — never by an ordinal range). After any archive run, a **coherence check** holds: the ledger matches the archive file's actual contents.
- **FR-007 (unarchive)**: The `unarchive` primitive is the symmetric reversal of FR-006: it returns a named archived Unit to the live document and removes its ledger entry. It **fails loud** (FR-010) on an identity collision against the live document (FR-005 uniqueness). An archive→unarchive round-trip restores the document's prior content.
- **FR-008 (curate — canonical)**: The `curate` primitive is a **composable primitive whose invocation context is intentionally undecided**. It ensures four properties: **well-formed** (FR-003); **well-ordered** (FR-004 — and on `--apply`, reorders mechanically without changing any identity per FR-005); **properly archived** (composes FR-006 — archivable Units belong in the archive); **up-to-date** via an **optional declared reconciliation hook** in the grammar (a source whose results map to expected Units) — curate runs it and reports drift when declared, and **skips** it when absent (skipping is not failing).
- **FR-009 (dry-run default)**: `archive`, `unarchive`, and `curate` default to **dry-run** (report planned changes, write nothing); writing requires an explicit `--apply`.
- **FR-010 (fail-loud / no fallbacks — canonical)**: Every failure mode fails loud with an actionable message and performs **zero writes**: an ungovernable document (FR-001), a parse failure (FR-003), an identifier-invariant violation (FR-005), an unarchive collision (FR-007), and a declared-but-failing reconciliation source (FR-008). No silent skips (other than the explicitly-optional absent reconciliation hook in FR-008) and no mock/placeholder data.
- **FR-011 (anti-coupling invariant)**: The **shipped product** (engine code, command verbs, skill bodies, READMEs, grammars, fixtures) contains **zero references to the predecessor lifecycle plugin** — no import, no shell-out, no "ported-from"/"mirrors" prose. The archive mechanism is reimplemented fresh and described entirely on its own terms. This invariant is **machine-checked** (a scan of the new surface must return zero such references).
- **FR-012 (grammar distribution)**: Shared grammars ship as **built-in defaults** within the plugin and are **project-overridable** at a project grammar location, using the project's established override-resolution pattern. The per-document resolution order in FR-001 selects among embedded → project override → built-in default.
- **FR-013 (two proof documents)**: The feature establishes **two structurally different** governable documents as its real instances and dogfood: (a) a **title-keyed design inbox** (statuses include a terminal `promoted`/`dropped`) and (b) a **`<phase>/<slug>`-keyed roadmap** (statuses include a terminal `shipped`/`cancelled`/`retired`). Both are governed by the **same engine**, differing only in their grammars. Establishing these documents means giving each structure, a grammar, and migrated content; it does **not** include the protocols that govern when their contents change (see Out of Scope).

### Key Entities

- **Governable Document**: a markdown document that declares a resolvable grammar (FR-001); the unit of operation for archive and curate.
- **Grammar**: the declared, block-level description of a document's structure — its Unit production, status vocabulary, terminal set, order key, identifier production, and optional reconciliation hook. Lives embedded in the document or as a shared, overridable file (FR-001, FR-012).
- **Unit**: a parsed item of a document — `identifier`, `status`, `orderKey`, `span`, opaque `body` (FR-002). The thing that is ordered, archived, and referenced.
- **Archive File**: the sibling document that receives archived Units, preserving their identifiers as headings (FR-006).
- **Provenance Ledger**: the record (within the live document) of what was archived and when, keyed by identifier; kept coherent with the archive file (FR-006).
- **Reconciliation Hook**: an optional grammar-declared source of external truth that curate's up-to-date check consults (FR-008).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An operator can move every settled item out of a live document into its archive in a single command; afterward the live document contains **zero** archivable Units (verifies FR-006 / US1).
- **SC-002**: After `curate --apply`, the document **parses** against its grammar and its Units are in the **declared order** (verifies FR-003 + FR-004 / US2).
- **SC-003**: Each defined failure mode (ungovernable document, parse failure, invariant-violating identifier, unarchive collision, failing reconciliation source) produces a loud error and **zero writes** (verifies FR-010).
- **SC-004**: An ordinal-looking identifier is **rejected**, and every identifier is **unchanged** across any reorder and any archive→unarchive round-trip (verifies FR-005 / US3).
- **SC-005**: The two proof documents — a title-keyed inbox and a `<phase>/<slug>` roadmap — are governed by the **same engine** with **only their grammars differing** (verifies FR-013 generality).
- **SC-006**: A scan of the shipped product surface returns **zero** predecessor-plugin references (verifies FR-011).
- **SC-007**: An archive→unarchive round-trip restores the document's original content, and after every archive run the provenance ledger matches the archive file's contents (verifies FR-006 coherence + FR-007 reversibility).

## Assumptions

- **Users are operators and agents**; this is developer tooling that ships in the stack-control plugin (command verbs + thin skills), not project-specific scaffolding. It is dogfooded against the project's own documents.
- **Markdown is the document format**, and a standard markdown block parser produces the block stream the grammar runs over (FR-002).
- **The concrete grammar/parser technology is deferred** to the planning phase's research step; this spec commits only to "a formal grammar compiled to a real parser, run over the markdown block stream."
- **The predecessor lifecycle plugin's workplan-archive is the conceptual origin** of the archive mechanism but is neither imported nor referenced by the product (FR-011). This is the only place that lineage is named.
- **The two proof documents are established by this feature** (structure + grammar + migrated content); the *protocols* that govern when their contents change are separate, later features (Out of Scope).
- **Strict typing and a per-file size ceiling** apply per the project constitution (Principle VI); tests are written test-first against real fixture document trees on disk (Principle I, II).

## Out of Scope

Named here so the boundary is explicit; each is a candidate later feature.

- The **roadmap-discipline protocol** — when rows advance between statuses, and reconciliation against on-disk feature state. (Plugs into curate's FR-008 reconciliation hook.)
- **Roadmap-canonizing skills** beyond the generic `archive`/`curate` primitives.
- The **concrete parser-generator choice** (deferred to the planning research step, per Assumptions).
- **Retiring or migrating** the predecessor plugin's workplan-archive. Generality is *proven* (FR-013) without touching the predecessor.
- **`curate`'s invocation wiring** (session-start, a future roadmap skill, etc.) — the primitive is deliberately unopinionated about when it runs (FR-008).
