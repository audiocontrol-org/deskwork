# Audit Log — document-primitives

Durable record of audit findings + their dispositions for the `design/document-primitives` feature (`specs/005-document-primitives/`). Status values: `open` → `fixed-<sha>` → `verified-<date>`, or `acknowledged-<date>` with substantive reason.

Cross-model agreement (both `claude` and `codex` flag the same root cause independently) is the HIGH-confidence signal, marked **[cross-model]**.

---

## 2026-06-07 — audit-barrage lift (20260607T222930484Z-document-primitives-after_plan)

### AUDIT-20260607-01 — FR-004 order-key constraint is unsatisfiable for both proof grammars — the only natural ordering field is the identifier itself

Finding-ID: AUDIT-20260607-01
Status:     fixed-cf732454
Severity:   high
Surface:    spec.md FR-004, FR-005 (`<phase>/<slug>` production), FR-013 (proof grammars)

FR-004 mandates: *"The order key MUST be expressible over status and human-readable fields and MUST NOT reference the Unit identifier."* This is structurally impossible for **both** proof documents in FR-013, which is the dogfood that proves generality (SC-005):

- **Roadmap** (FR-005 recommended production `<phase>/<slug>`): the natural, intended ordering is by *phase* (`design/` → `plan/` → `impl/` → `multi/`). But `phase` is a *component of the identifier*. Ordering by phase references the identifier. If `phase` is not also carried as a separate, non-identifier field, FR-004 forbids the roadmap's only sensible order.
- **Inbox** (FR-005 production = title): the identifier *is* the title. Any title-based ordering (alphabetical, or "as authored") references the identifier. The inbox declares no other distinguishing field in FR-013 (statuses are `captured`/`promoted`/`dropped` — a 3-value field that cannot totally-order a list of captured items).

An agent building the roadmap grammar will hit a contradiction: the recommended identifier shape embeds the field it most wants to order by, while FR-004 prohibits ordering by the identifier. The spec needs to either (a) require that any field used in the order key exist as a *separate* parsed field distinct from the identifier (so roadmap carries `phase` independently of `<phase>/<slug>`), or (b) relax FR-004 to "must not order by a *positional/ordinal* attribute" rather than "must not reference the identifier." As written, the two proof grammars cannot satisfy FR-004 and FR-013 simultaneously, blocking SC-005.

### AUDIT-20260607-02 — Anti-coupling scan (FR-011) over the proof documents collides with lossless migration (FR-013) of a roadmap that is *about* succeeding dw-lifecycle

Finding-ID: AUDIT-20260607-02
Status:     fixed-cf732454
Severity:   high
Surface:    spec.md FR-011 (scan scope incl. "the two proof documents"), FR-013 (lossless migration); plan.md `ROADMAP.md`/`DESIGN-INBOX.md`

FR-011's machine-checked, **release-blocking** scan includes `plugins/stack-control/ROADMAP.md` and `DESIGN-INBOX.md` (the two proof documents) in scope and matches the predecessor plugin name case-insensitively. FR-013 requires migrating existing content **losslessly** ("every existing entry/row appears in the new governed document, no content dropped") into those same files.

The existing roadmap content (`stack-control-roadmap.md`) and the succession rule it tracks are *fundamentally about succeeding dw-lifecycle* — the program's entire framing is "absorb-then-retire the predecessor." A lossless migration of that roadmap into `plugins/stack-control/ROADMAP.md` will carry `dw-lifecycle` references straight into a scanned surface, and the gate will fail with non-zero exit. The two requirements are in direct conflict: you cannot both preserve the roadmap's content verbatim *and* have zero predecessor references in the migrated file.

The plan compounds the ambiguity — it labels `ROADMAP.md` as a *"NEW plugin-local roadmap"* (suggesting fresh, not migrated) while FR-013 calls for migrated content. The spec must resolve: either the proof documents are *excluded* from the FR-011 scan (like `specs/**` and design docs already are, "legitimately name the predecessor as lineage"), or the migration is explicitly *not* lossless for predecessor-naming rows, or the proof roadmap is authored fresh with neutral content and FR-013's "lossless" applies only to the inbox. An agent building this will either fail the release gate or silently drop content to pass it.

### AUDIT-20260607-03 — Curate `--apply` is ambiguous about whether it actually archives, or only reports archivable units

Finding-ID: AUDIT-20260607-03 (claude-03 + codex-02; cross-model)
Status:     fixed-cf732454
Severity:   high
Surface:    spec.md FR-008, US2 AS1/AS2, SC-002

FR-008 says curate "ensures … **properly archived** (composes FR-006 — archivable Units belong in the archive)." But the only behavior the spec pins to `curate --apply` is reordering: FR-008 says "on `--apply`, reorders mechanically"; US2 AS1 covers reorder on `--apply`; SC-002 verifies only "parses … and Units are in the declared order." The archival half is described only in *report* terms — US2 AS2: *"When the operator runs `curate`, Then the report flags it as belonging in the archive."*

So it is genuinely unclear whether `curate --apply` *moves* archivable units (invoking `archive --apply`) or merely *reports* them while only fixing order. The two readings produce materially different tools: one leaves settled items in the live document after `--apply` (violating the "lean live document" goal), the other mutates two files. An unattended agent will pick one arbitrarily. The spec should state explicitly whether `curate --apply` performs the archival, and if it does, define the ordering of the two mutations (reorder-then-archive vs archive-then-reorder) and whether they share FR-006's atomic all-or-nothing guarantee across the curate operation as a whole.

### AUDIT-20260607-04 — Uniqueness "within document ∪ its archive" (FR-005) leaves archive parsing/availability unspecified

Finding-ID: AUDIT-20260607-04
Status:     fixed-cf732454
Severity:   high
Surface:    spec.md FR-005 (uniqueness), FR-003 (well-formedness includes FR-005), FR-006 (archive file)

FR-005 requires identifier uniqueness "**within the document ∪ its archive**," and FR-003 folds the identifier invariants into well-formedness — so *validating a single live document* requires reading the sibling archive file and extracting its identifiers. The spec never says how. Open questions an agent cannot answer from the artifact:

1. **How are archived identifiers extracted?** FR-006 says archived units keep "their identifiers as headings." Is the archive file parsed by the *same grammar*? It contains a provenance ledger section plus appended units — that composite likely does **not** parse against the live document's grammar, yet FR-002 says "a block the grammar does not account for is a parse failure." So parsing the archive with the live grammar would fail-loud, but FR-005 still needs its identifiers.
2. **Archive missing** (first-ever archive, per the edge case "Archive file missing on first archive"): is the union just the live document? Presumably yes, but unstated.
3. **Archive ungovernable/corrupt:** does live-document validation now fail because its archive won't parse? That couples live-doc well-formedness to archive integrity in a way FR-003 doesn't acknowledge.

Without a defined archive-identifier extraction path, an agent will either skip the union check (allowing the unarchive collision FR-005 exists to prevent) or apply the live grammar to the archive and fail spuriously. Specify how identifiers are read from the archive and what happens when it's absent or unparsable.

### AUDIT-20260607-05 — Cross-file atomicity (FR-006/FR-010 "zero writes is absolute") asserted but mechanism unconstrained; archive mutates two files

Finding-ID: AUDIT-20260607-05
Status:     fixed-cf732454
Severity:   medium
Surface:    spec.md FR-006 ("`--apply` is atomic all-or-nothing"), FR-010 ("zero writes is absolute"), SC-003 (mid-`--apply` write failure)

FR-006 archive touches **two files** — it cuts spans from the live document *and* appends to the sibling archive (with ledger). FR-010 declares atomicity "absolute": "no partial document mutation is left behind." SC-003 explicitly tests "mid-`--apply` write failure" producing zero writes. But POSIX filesystems give no native multi-file atomic write. A naïve implementation (write live doc, then write archive) leaves an inconsistent on-disk state if the process dies between the two writes — the live doc lost its units but the archive never received them, or vice versa.

The spec asserts the property without constraining the mechanism (e.g., write both to temp files, fsync, then rename-into-place with a recovery/rollback story; or a journal). An unattended agent reading "atomic all-or-nothing" may believe a single `writeFile` per file satisfies it and ship a tool that corrupts data on an interrupt — exactly the SC-003 scenario the spec claims to cover. Add an explicit note that atomicity spans both files and name the required staging/rename discipline, or scope true crash-atomicity out (it currently is not in the Out-of-Scope list, while concurrent invocation is).

### AUDIT-20260607-06 — Unarchive reinsertion position is unspecified; "restores prior content" assumes no intervening edits and a known insertion point

Finding-ID: AUDIT-20260607-06
Status:     fixed-cf732454
Severity:   medium
Surface:    spec.md FR-007, US1 AS3, SC-007

FR-007/US1 AS3 say unarchive "returns the item to the live document" and "restoring the prior content"; SC-007 requires an archive→unarchive round-trip to restore the original content. But archive *cut by span* and the live document has since had those lines removed (and possibly been reordered/edited). The spec never says **where** in the live document the unarchived unit is reinserted: at its original line span (which no longer exists once removed), at the end, or at its declared-order position (requiring curate's order key). 

"Restores the prior content" is only true if (a) nothing else changed between archive and unarchive and (b) the engine remembers the original position. Neither is stated. If reinsertion is append-to-end, the round-trip yields a *reordered* document, not the original bytes — SC-007 then fails for any document whose terminal items weren't last. Specify the reinsertion rule (most defensibly: insert at declared-order position, and scope SC-007's "restores prior content" to mean "set-equal and well-ordered," not byte-identical).

### AUDIT-20260607-07 — Lossless migration (FR-013) collides with strict fail-loud grammar validation (FR-003/FR-005) for pre-existing nonconforming content

Finding-ID: AUDIT-20260607-07
Status:     fixed-cf732454
Severity:   medium
Surface:    spec.md FR-013 (lossless), FR-003 (parse-or-fail), FR-005 (identifier invariants)

FR-013 requires migration to be lossless ("every existing entry/row appears … no content dropped") into a *governed* document, while FR-003 makes any block the grammar doesn't account for a fail-loud parse error and FR-005 rejects any identifier that trips the ordinal denylist (bare integer, `F<n>`, `phase-<n>`, `step-<n>`, `#<n>`, leading `<n>`). Real existing inbox/roadmap content may contain entries whose titles include a leading number, a `#<n>` reference, or freeform prose blocks the new grammar doesn't model.

If any pre-existing entry violates an invariant or fails to parse, you cannot achieve both "lossless" and "well-formed governed document" — the migration must either rewrite the offending identifiers (lossy by FR-013's strict reading) or the governed document won't validate (FR-003). The spec doesn't acknowledge this tension or say which side gives. An agent will either silently mangle identifiers to pass validation or produce a document that fails its own `curate`. State the migration contract for nonconforming source content (e.g., "migration may normalize identifiers to satisfy FR-005, recording the rename in the ledger; loss is defined over *content bodies*, not identifier spelling").

### AUDIT-20260607-08 — Embedded grammar block and document frontmatter appear in the block stream but their handling is unspecified (FR-002 "unaccounted block = parse failure")

Finding-ID: AUDIT-20260607-08
Status:     fixed-cf732454
Severity:   medium
Surface:    spec.md FR-001 (embedded grammar = HTML comment), FR-002 (HTML blocks recognized; unaccounted block = parse failure); plan.md block-stream pipeline

FR-001 puts the grammar declaration *inside the document* as an HTML comment, and FR-002 says the engine recognizes HTML blocks and that "a block the grammar does not account for is a parse failure." This creates a self-reference problem: the embedded grammar block is itself a block in the stream the grammar must parse. Either the engine strips the grammar declaration (and any document frontmatter) *before* handing the block stream to the grammar, or every grammar must explicitly declare its own declaration block as opaque/structural — otherwise the document fails to parse against its own grammar by FR-002.

The spec/plan never states this pre-processing step. Document frontmatter (the roadmap/inbox carry YAML frontmatter today) has the same issue — markdown-it does not treat frontmatter as a block by default, and the plan's "normalized one-token-per-line" pipeline doesn't mention it. An agent that doesn't strip the grammar comment + frontmatter will get a parse failure on every governable document; one that strips them inconsistently will mis-map spans (the plan's risk #1). Add an explicit pre-parse normalization step naming what is excised from the block stream (grammar declaration comment, frontmatter) before the grammar runs.

### AUDIT-20260607-09 — Curate’s reconciliation test still expects drift that the spec says cannot be computed

Finding-ID: AUDIT-20260607-09
Status:     fixed-cf732454
Severity:   high
Surface:    specs/005-document-primitives/spec.md:47-55

US2’s Independent Test says to run `curate` and “confirm it reports ... any reconciliation drift” at line 47, but the acceptance scenarios immediately below say a declared reconciliation hook only reports “declared, not yet executed” and no-hook cases stay silent at lines 54-55. FR-008 repeats the non-execution contract at line 105.

Blast radius is high because an unattended implementer could reasonably build drift computation to satisfy the Independent Test, even though the clarified scope excludes it. A reasonable fix is to rewrite the Independent Test so it expects only hook recognition/notice, not drift reporting.

### AUDIT-20260607-10 — Round-trip restoration requires provenance the ledger does not specify

Finding-ID: AUDIT-20260607-10
Status:     fixed-cf732454
Severity:   high
Surface:    specs/005-document-primitives/spec.md:103-104

FR-006 says the ledger records “what moved and when, keyed by identifier” at line 103, and FR-007 requires archive→unarchive to restore the document’s prior content at line 104. Keying only by identifier and timestamp is not enough to reconstruct the original insertion point, surrounding structure, or exact span placement after multiple archived units have been cut.

Blast radius is high because an implementation that follows the ledger description literally can append or sort on unarchive, yet still fail SC-007’s exact round-trip expectation at line 137. The spec should require the ledger to store enough restoration metadata, or relax “prior content” to a declared reinsertion rule.

### AUDIT-20260607-11 — Runtime Peggy grammars make project overrides executable code

Finding-ID: AUDIT-20260607-11
Status:     fixed-cf732454
Severity:   high
Surface:    specs/005-document-primitives/plan.md:15-17

The plan chooses `peggy.generate(grammarText)` at runtime for grammars that can come from embedded document text or project override files, and line 37 even describes grammar input as untrusted. Peggy grammars can include semantic actions, so compiling and running arbitrary `.peg` text is not merely parsing declarative data unless the design constrains the grammar subset or isolates execution.

Blast radius is high because an adopter running `archive` or `curate` in a repository could execute code from that repository’s grammar override. A reasonable fix is to specify a safe grammar profile with no semantic actions, precompiled built-ins plus validation for overrides, or another isolation strategy before implementation.
