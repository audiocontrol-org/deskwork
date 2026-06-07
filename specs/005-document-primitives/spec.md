# Feature Specification: Generalized document-handling primitives — archive & curate (`design/document-primitives`)

**Feature Branch**: `feature/stack-control` (authored alongside specs 001–004 on the shared branch; no dedicated branch — operator decision 2026-06-07)

**Created**: 2026-06-07

**Status**: Draft

**Input**: User description: "Reform roadmap discipline, starting with generalized document-handling primitives — `archive` and `curate` — built as part of the stack-control plugin (not project-specific tooling) and dogfooded in the project. `archive` moves non-live items out of a document into an archive, based on the *mechanism* of the dw-lifecycle workplan-archive tooling but generalized. `curate` ensures a live document is up-to-date, well-formed, well-ordered, and properly archived. Documents are self-describing via a declared grammar; in-document identifiers must be human-readable and must NOT bake in ordinal components."

## Clarifications

### Session 2026-06-07

- Q: Identifier strictness — is a slug-style identifier mandatory, or is identity property-based per-grammar? → A: **Per-grammar identifier production** (C). The engine universally enforces the *properties* (unique / non-ordinal / human-readable); each grammar declares its concrete identifier production — a strict slug (roadmap → `<phase>/<slug>`) or a title (inbox) — with `<phase>/<slug>` recommended, not required. FR-005 reworded accordingly.
- Q: Reconciliation hook — build execution now, or declare the seam only? → A: **Seam-only** (A). The grammar may *declare* a reconciliation hook and `curate` recognizes/validates it, but reconciliation **execution is out of scope** for this feature (no shell-out, no result-mapping built). Curate's up-to-date check is a no-op-with-notice until a later feature implements execution. FR-008/FR-010, the related edge case, US2, and SC-003 updated.
- Q: Where does the provenance ledger live — live document, archive file, or both? → A: **In the archive file** (A). The live document carries **zero** bookkeeping (preserving the lean-live-document goal); the archive holds both the archived units and the ledger. Coherence (SC-007) = ledger vs same-file contents. This is a deliberate departure from the predecessor's live-document ledger placement. FR-006 + Key Entities updated.
- Q (audit resolutions, 2026-06-07): AUDIT-20260607-01 (order key vs identifier) + AUDIT-20260607-04 (uniqueness union vs archive parsing)? → A: **AUDIT-01** — the order-key prohibition is **relaxed**: it MUST NOT be a positional/sequence ordinal (reordering can never break identity); ordering by a category/attribute that also appears in a structured identifier (e.g. roadmap by `phase`) is allowed (FR-004). **AUDIT-04** — for the document ∪ archive uniqueness union, archived identifiers come from a **lightweight heading/ledger scan** of the archive (not a live-grammar parse); an absent archive ⇒ union is the live document; a corrupt archive is surfaced via the coherence check (FR-006), not a live-parse failure (FR-005).
- Q (audit resolutions, 2026-06-07): AUDIT-20260607-03 (`curate --apply`: archive or report only?), -05 (cross-file atomicity), -06/-10 (unarchive reinsertion position & round-trip semantics), -09 (US2 "reconciliation drift")? → A: **AUDIT-03** — `curate --apply` **performs the archival**, composing `archive --apply` (FR-006); it **reorders first, then archives**, atomic across the whole curate op (FR-008). **AUDIT-05** — archive's atomicity spans **both files** (live document + sibling archive); either both update or neither does (FR-006/FR-010). **AUDIT-06/-10** — unarchive reinserts at the Unit's **declared-order position** (FR-004); "restores prior content" means **content-equivalent and well-ordered**, not byte-identical; the ledger stores **no** position (FR-007). **AUDIT-09** — `curate`'s reconciliation check reports the hook as **recognized-but-not-executed**, never drift (seam-only scope, FR-008).
- Q (audit resolutions, 2026-06-07): AUDIT-20260607-08 (embedded grammar comment + frontmatter are themselves blocks → would fail the document's own grammar?) + AUDIT-20260607-11 (runtime peggy grammars execute repository code)? → A: **AUDIT-08** — add a **pre-parse normalization step** (FR-002) that excises engine-level document chrome — the embedded grammar-declaration comment and the frontmatter — before the grammar runs; that chrome is not a Unit and never causes a parse failure. **AUDIT-11** — **accept** grammar runtime execution as a trusted-local-config surface (operator decision): grammars are operator-authored project config, run in-process, same trust model as `.deskwork/*.ts` overrides; documented as an Assumption + recorded in plan.md; not restricted to an action-free subset, sandboxing out of scope.
- Q (audit resolutions, 2026-06-07): AUDIT-20260607-02 (anti-coupling scan vs migrated succession roadmap) + AUDIT-20260607-07 (lossless migration vs fail-loud validation of nonconforming identifiers)? → A: **AUDIT-02** — the FR-011 anti-coupling scan covers the **product mechanism only** (engine/verbs/skills/grammars) and **excludes the two proof documents** (`ROADMAP.md`, `DESIGN-INBOX.md`) as governed content that legitimately names the predecessor as lineage; the roadmap keeps its succession content (FR-011, SC-006). **AUDIT-07** — the migration contract defines "lossless" over **content bodies** (no entry/row or body dropped); migration MAY normalize a nonconforming identifier to satisfy FR-005, recording the rename; the migrated document must be well-formed (pass `curate`) (FR-013).
- Q (engine-rigor checklist resolutions, 2026-06-07): block-kind set, denylist closure, uniqueness case-sensitivity, manual-edit handling, anti-coupling scan precision, `--apply` atomicity, proof-grammar status vocab, migration criterion, concurrency? → A: **Block kinds** enumerated (FR-002). **Denylist** is a closed v1 set; "refinable" = future additions only (FR-005). **Uniqueness** is case-sensitive exact match (FR-005). **Manual identifier edits** are the operator's responsibility — the coherence check (FR-006) surfaces resulting ledger staleness; the engine does not actively refuse edits (Out of Scope). **Anti-coupling scan** scope/pattern/exclusions specified (FR-011). **`--apply` is atomic** all-or-nothing (FR-006/FR-010). **Full proof-grammar status vocabularies** enumerated + **migration no-content-loss** criterion (FR-013). **Concurrent invocation** out of scope.

## User Scenarios & Testing *(mandatory)*

The "users" are operators and agents working on living documents (roadmaps, design inboxes, specs) inside a project that has adopted the stack-control plugin.

### User Story 1 - Keep a live document lean by archiving settled items (Priority: P1)

An operator has a living document whose settled items (shipped roadmap rows, promoted/dropped inbox entries) have accumulated and are crowding the live surface. They run a single command that moves every settled item out of the live document into a sibling archive, leaving the live document containing only active items — and they can reverse it.

**Why this priority**: This is the headline value and the smallest shippable slice. A lean live document is the immediate, visible payoff; archiving is the mechanism the operator reached for first ("an archive skill to keep live documents lean").

**Independent Test**: Take a governable document with a mix of active and settled items, run `archive`, and confirm (a) every settled item now lives in the sibling archive, (b) the live document retains exactly the active items, (c) the move is recorded in a provenance ledger, and (d) `unarchive` returns the unit to its declared-order position, leaving the document content-equivalent and well-ordered.

**Acceptance Scenarios**:

1. **Given** a governable document with three active items and two settled (terminal-status) items, **When** the operator runs `archive --apply`, **Then** the two settled items are removed from the live document and appended to the sibling archive file, and the ledger records both moves keyed by their identifiers.
2. **Given** the same document, **When** the operator runs `archive` without `--apply`, **Then** the planned moves are reported and nothing is written (dry-run is the default).
3. **Given** an archived item, **When** the operator runs `unarchive` for that item, **Then** the item returns to the live document at its declared-order position and the ledger entry is removed, leaving the document content-equivalent and well-ordered.
4. **Given** an archive run, **When** it completes, **Then** the provenance ledger matches the archive file's actual contents (coherence holds).

---

### User Story 2 - Curate a live document so it stays correct (Priority: P2)

An operator wants assurance that a living document is structurally sound: it conforms to its declared shape, its items are in the intended order, settled items have been archived, and — when the document opts in — it is reconciled against an external source of truth. They run one command that reports every deviation and, on request, fixes the mechanical ones.

**Why this priority**: Curation is the broader "ensure it's right" capability that composes archiving. It is higher-effort than archive alone and depends on the same engine, so it follows the MVP.

**Independent Test**: Take a governable document that is out of order, has an un-archived settled item, and declares a reconciliation source; run `curate`; confirm it reports the disorder, the missing archival, and the reconciliation hook as *recognized but not executed*; run `curate --apply` and confirm the items are reordered AND the settled item is archived.

**Acceptance Scenarios**:

1. **Given** a governable document whose items are out of the declared order, **When** the operator runs `curate --apply`, **Then** the items are reordered to the declared order key (and any settled items are then archived), and no item identity changes.
2. **Given** a document containing a settled item that has not been archived, **When** the operator runs `curate`, **Then** the report flags it as belonging in the archive; **When** the operator runs `curate --apply`, **Then** the settled item is moved to the archive (curate composes `archive --apply`).
3. **Given** a document that does not parse against its grammar, **When** the operator runs `curate`, **Then** curate fails loud and names the offending location; it does not attempt a partial fix.
4. **Given** a document whose grammar declares a reconciliation hook, **When** the operator runs `curate`, **Then** curate reports the hook as "declared, not yet executed" (execution is deferred to a later feature) and the other checks still run.
5. **Given** a document whose grammar declares no reconciliation hook, **When** the operator runs `curate`, **Then** the up-to-date check is silent and the other checks still run.

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
- **Reconciliation hook declared**: `curate` validates its presence and reports "declared, not yet executed" — execution is deferred to a later feature (FR-008). It is neither run nor treated as drift in this feature.
- **Archive file missing on first archive**: created with frontmatter (FR-006); for the FR-005 uniqueness union, the union is just the live document.
- **Corrupt/unparsable archive file**: does not block live-document validation — archived identifiers come from a heading/ledger scan, not a live-grammar parse (FR-005); the corruption is surfaced via the coherence check (FR-006), not a live-parse failure.
- **Unarchive identity collision**: an item whose identifier already exists in the live document cannot be unarchived → fail loud (FR-007).
- **A live item cross-references a now-archived item**: the reference still resolves by identifier because identity is stable and the archived item keeps its identifier as its heading (FR-005, FR-006).
- **An item with no recognized status**: the grammar's status vocabulary does not match → parse/validation failure, fail loud (FR-003, FR-004).
- **A write fails partway through `--apply`**: the operation is atomic across both the live document and the archive file — neither is left partially written (FR-006, FR-010).
- **An operator hand-edits an archived Unit's identifier**: the coherence check surfaces the ledger staleness on the next run; the engine does not auto-repair or refuse the edit (FR-006; out of scope to actively guard).

## Requirements *(mandatory)*

> Authoring note (applying this session's DRY-for-prose lesson): each rule is stated **once** as its canonical FR; later requirements and the Success Criteria **reference** the canonical FR rather than restating it.

### Functional Requirements

- **FR-001 (governable document — canonical)**: A document is **governable** only if it declares a resolvable block-level grammar. Resolution order, fail-loud with **no fallback**: (1) an **embedded** grammar block (an HTML comment, invisible in rendered markdown); else (2) a **frontmatter reference** to a shared grammar by id, resolved against the project grammar-override location then the plugin's built-in defaults; else (3) **fail loud** ("document declares no grammar; not governable"). When both an embedded block and a reference are present, the embedded block takes precedence. Resolved grammars are **trusted local config** run in-process (Assumptions — grammar trust model).
- **FR-002 (document model — canonical)**: The engine parses a governable document along one shared, type-agnostic pipeline: raw markdown → a **block stream** (via a standard markdown block parser) → a **pre-parse normalization step** that **excises engine-level document chrome** from the block stream — specifically (a) the embedded grammar-declaration comment (FR-001), when present, and (b) the document frontmatter — so that chrome is never handed to the grammar → the document's **declared grammar**, operating over the remaining block stream and treating prose bodies as **opaque** → a typed tree of **Units**, each carrying `identifier`, `status`, `orderKey`, `span` (source line range), and an opaque `body`. The excised chrome is **not a Unit** and can never cause a parse failure; the grammar author never accounts for it. The engine recognizes the standard markdown block kinds — headings (ATX and Setext), paragraphs, lists (incl. nested items), tables, fenced/indented code, blockquotes, thematic breaks, and HTML blocks; each grammar decides which block kinds are **unit-structural** versus part of an opaque `body`. A block the grammar does not account for — after chrome excision — is a parse failure (FR-003), not a silent skip.
- **FR-003 (well-formed — canonical)**: A document is **well-formed** if and only if its block stream **parses** against its declared grammar. Well-formedness is a parse success/failure, not a heuristic. A parse failure **fails loud** and names the offending span; no partial operation proceeds.
- **FR-004 (status & order — canonical)**: A grammar declares its **status vocabulary**, which statuses are **terminal** (archivable), and an **order key**. A Unit is **archivable** if and only if its status is in the terminal set. A document is **well-ordered** if and only if its Unit sequence matches the declared order key. The order key MUST be expressible over status and human-readable fields and MUST NOT be a **positional/sequence ordinal** (so reordering can never break identity). Ordering by a category/attribute that happens to also appear in a structured identifier (e.g. roadmap ordering by `phase`, part of `<phase>/<slug>`) is allowed.
- **FR-005 (identifier invariants — canonical)**: A Unit's **identity is decoupled from its position**. The engine enforces these as universal invariants for every governable document, as part of FR-003 well-formedness, fail-loud on violation:
  - **Unique** within the document ∪ its archive (so unarchive — FR-007 — cannot collide). Uniqueness is a **case-sensitive exact match**. Archived identifiers for the union are obtained by a **lightweight heading/ledger scan** of the archive file (archived Units keep their identifiers as headings — FR-006 — and the ledger is keyed by identifier), **not** by parsing the archive against the live grammar. When the archive file is absent (first archive), the union is just the live document; a corrupt/unparsable archive does not block live-document validation — it is surfaced via the coherence check (FR-006), not by failing the live parse.
  - **Human-readable**: a single visible name *is* the identifier; there is **no parallel opaque token** (no UUID alongside it). The name's concrete shape is the grammar's choice (see "Per-grammar production" below) — a strict slug (`<phase>/<slug>`) or a readable title — never a cryptic token.
  - **Non-ordinal**: the engine **rejects** any identifier that looks sequential. The **v1 denylist is a closed set**: a bare-integer segment, or a sequence-implying token matching `F<n>`, `phase-<n>`, `step-<n>`, `#<n>`, or leading `<n>` numbering. "Refinable" means future versions may *add* patterns — the v1 contract is exactly this set, not an open-ended judgment.
  - **Per-grammar production (property-based, not a fixed shape)**: the engine universally enforces the *properties* (unique / non-ordinal / human-readable); each grammar declares its concrete identifier production — a strict slug (roadmap → `<phase>/<slug>`, the recommended shape) or a readable title (inbox). The engine does NOT mandate slug-shape; "slug" is a recommendation, the properties are the contract.
- **FR-006 (archive — canonical)**: The `archive` primitive parses a governable document (FR-002), selects the archivable Units (FR-004), **cuts** them by `span`, **appends** them to a sibling archive file (created with frontmatter if absent), and updates a **provenance ledger** (recording what moved and when, keyed by **identifier** — never by an ordinal range). Archived identifiers are scannable without parsing the archive against the live grammar — each archived Unit keeps its identifier as a heading and the ledger is keyed by identifier — which is what the FR-005 uniqueness union reads. The ledger lives **in the archive file**, not the live document — the live document carries **zero** archive bookkeeping (preserving the lean-live-document goal). `--apply` is **atomic (all-or-nothing) across both files** — the live document and the sibling archive file: either both update (every selected Unit removed from the live document, appended to the archive, ledger updated) or neither does, with no partial state across the two files (e.g. staged writes + atomic rename; mechanism left to implementation) (FR-010). After any archive run, a **coherence check** holds: the ledger matches the archive file's actual contents. Manually editing a Unit's identifier after archiving is the **operator's responsibility**; the coherence check **surfaces** the resulting ledger staleness, but the engine does not refuse or auto-repair manual edits.
- **FR-007 (unarchive)**: The `unarchive` primitive is the symmetric reversal of FR-006: it returns a named archived Unit to the live document — reinserted at its **declared-order position** (per the grammar's order key, FR-004) — and removes its ledger entry. It **fails loud** (FR-010) on an identity collision against the live document (FR-005 uniqueness). An archive→unarchive round-trip is **content-equivalent and well-ordered** (the Unit returns with body and identity intact, placed in declared order) — **not byte-identical** (intervening cuts or edits make byte-restoration neither possible nor required). The ledger does not record position; reinsertion order is derived from the grammar.
- **FR-008 (curate — canonical)**: The `curate` primitive is a **composable primitive whose invocation context is intentionally undecided**. It ensures three properties: **well-formed** (FR-003); **well-ordered** (FR-004 — and on `--apply`, reorders mechanically without changing any identity per FR-005); **properly archived** (composes `archive --apply`, FR-006 — on `--apply`, archivable Units are moved to the archive, not merely reported). On `--apply` curate **reorders first, then archives**, and the whole curate operation is **atomic (all-or-nothing)** across both steps (FR-010): reorder and archive succeed together or nothing is written. A fourth property, **up-to-date**, is a **declared seam only** in this feature: a grammar MAY declare a reconciliation hook and `curate` recognizes/validates its presence, but **reconciliation execution is out of scope here** — the up-to-date check is a no-op-with-notice (reports "declared, not yet executed" when present; silent when absent). A later feature implements execution against the seam.
- **FR-009 (dry-run default)**: `archive`, `unarchive`, and `curate` default to **dry-run** (report planned changes, write nothing); writing requires an explicit `--apply`.
- **FR-010 (fail-loud / no fallbacks — canonical)**: Every failure mode fails loud with an actionable message and performs **zero writes**: an ungovernable document (FR-001), a parse failure (FR-003), an identifier-invariant violation (FR-005), and an unarchive collision (FR-007). **"Zero writes" is absolute** and spans **both files** (the live document and the sibling archive file): no empty/partial archive file is created and no partial document mutation is left behind — operations are atomic across both files (FR-006). An "actionable message" names the specific absent/offending element (the unresolved grammar, the offending span, the violating identifier). No silent skips (other than the explicitly-deferred up-to-date check in FR-008) and no mock/placeholder data.
- **FR-011 (anti-coupling invariant)**: The **shipped product mechanism** contains **zero references to the predecessor lifecycle plugin** — no import, no shell-out, no "ported-from"/"mirrors" prose. The archive mechanism is reimplemented fresh and described entirely on its own terms. This invariant is **machine-checked** and release-blocking (non-zero exit fails the gate):
  - **Scan scope** — the product mechanism only (engine code, command verbs, skill bodies, grammars): `plugins/stack-control/src/document-model/**`, the three verb modules, `plugins/stack-control/skills/{archive,curate}/**`, `plugins/stack-control/grammars/**`, and the feature's test fixtures.
  - **Match pattern** (case-insensitive) — the predecessor plugin name, its CLI binary name, and its skill namespace.
  - **Exclusions** — `specs/**`, design docs, provenance notes, **and the two proof documents (`ROADMAP.md`, `DESIGN-INBOX.md`)** are NOT scanned; they are governed *content* that legitimately names the predecessor as lineage (the plugin-local roadmap is migrated succession content — its program framing is "absorb-then-retire" the predecessor), exactly as `specs/**` and design docs do (Assumptions).
- **FR-012 (grammar distribution)**: Shared grammars ship as **built-in defaults** within the plugin and are **project-overridable** at a project grammar location, using the project's established override-resolution pattern. The per-document resolution order in FR-001 selects among embedded → project override → built-in default. A project override is **trusted local config** run in-process — the same trust model as `.deskwork/*.ts` overrides (Assumptions — grammar trust model).
- **FR-013 (two proof documents)**: The feature establishes **two structurally different** governable documents as its real instances and dogfood, each with a **fully enumerated status vocabulary**:
  - (a) a **title-keyed design inbox** — statuses `captured` (active), `promoted` (terminal), `dropped` (terminal).
  - (b) a **`<phase>/<slug>`-keyed roadmap** — statuses `planned`, `in-flight` (active), `shipped`, `cancelled`, `retired` (terminal).
  Both are governed by the **same engine**, differing only in their grammars (SC-005). Establishing these documents means giving each structure, a grammar, and migrated content. **Migration contract**: "**lossless**" is defined over **content bodies** — every existing entry/row appears in the new governed document and no body content is dropped. It is **not** defined over identifier spelling: migration MAY **normalize** a nonconforming identifier (e.g. a leading number, `#<n>`) to satisfy FR-005, **recording the rename** so identity provenance isn't lost. The migrated document MUST end up **well-formed** (it must pass `curate`). It does **not** include the protocols that govern when their contents change (see Out of Scope).

### Key Entities

- **Governable Document**: a markdown document that declares a resolvable grammar (FR-001); the unit of operation for archive and curate.
- **Grammar**: the declared, block-level description of a document's structure — its Unit production, status vocabulary, terminal set, order key, identifier production, and optional reconciliation hook. Lives embedded in the document or as a shared, overridable file (FR-001, FR-012).
- **Unit**: a parsed item of a document — `identifier`, `status`, `orderKey`, `span`, opaque `body` (FR-002). The thing that is ordered, archived, and referenced.
- **Archive File**: the sibling document that receives archived Units, preserving their identifiers as headings (FR-006).
- **Provenance Ledger**: the record (held **in the archive file**, not the live document) of what was archived and when, keyed by identifier; kept coherent with the archive file's contents (FR-006).
- **Reconciliation Hook**: an optional grammar-declared seam for an external source of truth. In this feature `curate` only *recognizes/validates* its presence; *executing* it (running the source, computing drift) is deferred to a later feature (FR-008).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An operator can move every settled item out of a live document into its archive in a single command; afterward the live document contains **zero** archivable Units (verifies FR-006 / US1).
- **SC-002**: After `curate --apply`, the document **parses** against its grammar, its Units are in the **declared order**, and any archivable Units have been **moved to the archive** (`--apply` reorders then archives — FR-008) (verifies FR-003 + FR-004 + FR-006 / US2).
- **SC-003**: Each defined failure mode (ungovernable document, parse failure, invariant-violating identifier, unarchive collision, mid-`--apply` write failure) produces a loud error and **zero writes** — no empty/partial archive file, no partial document mutation (verifies FR-010 + FR-006 atomicity).
- **SC-004**: An ordinal-looking identifier is **rejected**, and every identifier is **unchanged** across any reorder and any archive→unarchive round-trip (verifies FR-005 / US3).
- **SC-005**: The two proof documents — a title-keyed inbox and a `<phase>/<slug>` roadmap — are governed by the **same engine** with **only their grammars differing** (verifies FR-013 generality).
- **SC-006**: A scan of the shipped product **mechanism** (engine code, command verbs, skill bodies, grammars — NOT governed content like the two proof documents) returns **zero** predecessor-plugin references (verifies FR-011).
- **SC-007**: An archive→unarchive round-trip restores a **content-equivalent, well-ordered** state (the Unit returns with body and identity intact, in declared-order position — not byte-identical), and after every archive run the provenance ledger matches the archive file's contents (verifies FR-006 coherence + FR-007 reversibility).

## Assumptions

- **Users are operators and agents**; this is developer tooling that ships in the stack-control plugin (command verbs + thin skills), not project-specific scaffolding. It is dogfooded against the project's own documents.
- **Markdown is the document format**, and a standard markdown block parser produces the block stream the grammar runs over (FR-002).
- **The concrete grammar/parser technology is deferred** to the planning phase's research step; this spec commits only to "a formal grammar compiled to a real parser, run over the markdown block stream."
- **The predecessor lifecycle plugin's workplan-archive is the conceptual origin** of the archive mechanism but is neither imported nor referenced by the product (FR-011). This is the only place that lineage is named.
- **The two proof documents are established by this feature** (structure + grammar + migrated content); migration is lossless over **content bodies** (identifiers may be normalized to satisfy FR-005, with the rename recorded; the result must pass `curate`) per FR-013. The *protocols* that govern when their contents change are separate, later features (Out of Scope).
- **Strict typing and a per-file size ceiling** apply per the project constitution (Principle VI); tests are written test-first against real fixture document trees on disk (Principle I, II).
- **Grammar files are trusted local config.** A grammar (embedded or a `.stack-control/grammars/*.peg` override) is operator-authored project configuration compiled and run **in-process** when `archive`/`curate` run; because it can carry semantic actions, running it executes code from the repository. This is the **same trust model as the project's `.deskwork/*.ts` template/doctor overrides** — accepted for this local, single-operator tooling context. The engine does **not** restrict grammars to an action-free subset; sandboxing grammar execution is out of scope (referenced from FR-001/FR-012).

## Out of Scope

Named here so the boundary is explicit; each is a candidate later feature.

- The **roadmap-discipline protocol** — when rows advance between statuses, and reconciliation against on-disk feature state. (Plugs into curate's FR-008 reconciliation hook.)
- **Reconciliation hook *execution*** — running a declared reconciliation source and computing drift. This feature declares and validates the seam (FR-008) but does not execute it.
- **Roadmap-canonizing skills** beyond the generic `archive`/`curate` primitives.
- The **concrete parser-generator choice** (deferred to the planning research step, per Assumptions).
- **Retiring or migrating** the predecessor plugin's workplan-archive. Generality is *proven* (FR-013) without touching the predecessor.
- **`curate`'s invocation wiring** (session-start, a future roadmap skill, etc.) — the primitive is deliberately unopinionated about when it runs (FR-008).
- **Active detection/refusal of manual identifier edits** — the coherence check surfaces resulting staleness (FR-006), but guarding against an operator hand-editing an identifier is not built.
- **Concurrent invocation** of two primitives on the same document — out of scope for this local, single-operator tooling; not guarded against.
