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

## 2026-06-07 — audit-barrage lift (20260607T225224616Z-document-primitives-after_plan)

### AUDIT-20260607-12 — Bare `unarchive` is a write in US1 but a dry-run under FR-009 — direct contradiction

Finding-ID: AUDIT-20260607-12
Status:     fixed-fe21384c
Severity:   high
Surface:    spec.md — FR-009 vs US1 Acceptance Scenario 3 + US1 Independent Test (d)

FR-009 states: "`archive`, `unarchive`, and `curate` default to **dry-run** (report planned changes, write nothing); writing requires an explicit `--apply`." But US1 Acceptance Scenario 3 reads: "**When** the operator runs `unarchive` for that item, **Then** the item returns to the live document at its declared-order position and the ledger entry is removed" — a bare `unarchive` (no `--apply`) producing writes. US1's Independent Test (d) repeats this: "`unarchive` returns the unit to its declared-order position." Compare the carefully-written archive scenarios: Scenario 1 uses `archive --apply` and Scenario 2 uses bare `archive` and explicitly says "nothing is written." The `unarchive` scenario was not given the same `--apply` discipline.

Blast radius is high because the two readings produce opposite behavior and both are anchored in mandatory sections. An agent that anchors on the acceptance scenario builds bare `unarchive` to mutate both files, violating the FR-009 dry-run-default invariant (and FR-010's zero-writes-without-`--apply` posture); an agent that anchors on FR-009 builds it dry-run and the US1 scenario test fails. A reasonable fix is to rewrite Scenario 3 and Independent Test (d) to invoke `unarchive --apply` for the write, mirroring Scenario 1.

### AUDIT-20260607-13 — Heading-scan for the uniqueness union cannot distinguish Unit-identifier headings from body headings without the parse it is forbidden to run

Finding-ID: AUDIT-20260607-13
Status:     fixed-fe21384c
Severity:   high
Surface:    spec.md — FR-005 (uniqueness union) + FR-006 (archived Units keep identifier as heading)

FR-005 obtains archived identifiers for the uniqueness union via "a **lightweight heading/ledger scan** of the archive file ... **not** by parsing the archive against the live grammar," resting on "archived Units keep their identifiers as headings (FR-006)." But an archived Unit's *opaque body* can itself contain markdown headings (a roadmap row's `## Notes`, an inbox entry's `### Sub-point`). A heading scan that does not parse against the grammar has no way to tell a Unit-identifier heading from a body heading — exactly the disambiguation FR-005 forbids itself from doing via grammar parse. The result is false identifiers in the union → spurious FR-005 uniqueness collisions that block legitimate new items or unarchive operations.

Compounding this, FR-005 names a *dual* source ("heading/ledger scan") without saying which is authoritative when they disagree — and they will disagree precisely in the manual-edit-staleness case FR-006 calls out (ledger says `X`, heading says `Y`). The ledger is keyed by identifier (FR-006) and is the clean source; the heading scan adds ambiguity without adding information. Blast radius is high: an unattended agent will implement a naive heading regex, and the first archived Unit with a heading in its body produces a false collision that fails-loud and blocks the operator. A reasonable fix: make the **ledger** the sole source of archived identifiers for the union (it is already keyed by identifier), and use the heading scan only as the coherence-check cross-reference (FR-006), not as a union input.

### AUDIT-20260607-14 — "Bodies are opaque" contradicts "headings are unit-structural" — no rule for where a Unit ends

Finding-ID: AUDIT-20260607-14
Status:     fixed-fe21384c
Severity:   high
Surface:    spec.md — FR-002 (document model; "each grammar decides which block kinds are unit-structural versus part of an opaque `body`")

FR-002 says the grammar treats "prose bodies as **opaque**" yet also that "each grammar decides which block kinds are **unit-structural** versus part of an opaque `body`," recognizing headings (ATX and Setext) among the block kinds. For a heading-keyed grammar (the inbox proof document — FR-013(a), where a Unit *is* a `## Title`), these two statements collide: if a Unit body is opaque (may contain arbitrary blocks, including a `##` heading), the engine cannot know whether a `##` token starts a new Unit or sits inside the previous Unit's body. The spec gives the grammar the *responsibility* to decide ("each grammar decides") but no *mechanism* — there is no stated constraint that bodies may not contain Unit-level headings, and "opaque" affirmatively suggests they can.

This is load-bearing because it determines the most basic operation — segmenting the block stream into Units — and the two proof grammars exercise it differently (the roadmap is table-row-keyed and largely immune; the inbox is heading-keyed and hits it immediately). Blast radius is high: the natural default ("split on every heading of the Unit level") silently mis-Units any inbox entry whose body contains a same-level heading, and nothing in the spec flags the misparse. A reasonable fix is to state the boundary rule explicitly — e.g., a heading-keyed grammar reserves its Unit-heading level and bodies may only contain strictly deeper levels — or to require Units to be delimited by a structural marker the body provably cannot contain.

### AUDIT-20260607-15 — Engine has no stated rule for recognizing *which* HTML comment is the grammar declaration

Finding-ID: AUDIT-20260607-15 (claude-04 + codex-03; cross-model)
Status:     fixed-fe21384c
Severity:   high
Surface:    spec.md — FR-001 ("an embedded grammar block (an HTML comment...)") + FR-002 (pre-parse excision of "the embedded grammar-declaration comment")

FR-001 declares the embedded grammar as "an HTML comment, invisible in rendered markdown," and FR-002's pre-parse step excises "the embedded grammar-declaration comment (FR-001), when present." Both presuppose the engine can identify the grammar-declaration comment, but neither states *how* it is recognized among a document's possibly-many HTML comments (editorial notes, other tooling markers, license headers). Without a recognition rule (a sentinel such as `<!-- stack-control:grammar … -->`, or "the first HTML-comment block," or a fenced marker), the excision step and the grammar resolver have no deterministic anchor.

The recognition contract presumably lives in `contracts/grammar-declaration.md` (Phase 1, not in this diff), but the spec is the artifact an agent reads first and it leaves the rule unstated. Blast radius is medium: an agent will invent a recognition heuristic; if it picks "first HTML comment" and a document opens with an unrelated comment, grammar resolution fails-loud (or worse, treats prose as grammar text). A reasonable fix is to name the recognition marker inline in FR-001 (or explicitly forward-reference the grammar-declaration contract as normative for the marker).

### AUDIT-20260607-16 — FR-011 anti-coupling gate's match strings are never enumerated

Finding-ID: AUDIT-20260607-16
Status:     fixed-fe21384c
Severity:   medium
Surface:    spec.md — FR-011 ("Match pattern (case-insensitive) — the predecessor plugin name, its CLI binary name, and its skill namespace") + plan.md (`scripts/check-no-predecessor-refs.sh`)

FR-011 makes the anti-coupling scan release-blocking ("non-zero exit fails the gate") and defines the match pattern as "the predecessor plugin name, its CLI binary name, and its skill namespace" — but never gives the literal strings. The reader must infer them (plugin name `dw-lifecycle`, skill namespace `dw-lifecycle`, CLI binary = ?). The CLI binary name in particular is not derivable from the spec, and the project's own thesis text uses the word "lifecycle" pervasively (`pluggable-lifecycle-providers`, `stack-control` succeeds `dw-lifecycle`), so an over-broad pattern would false-positive on legitimate stack-control prose.

Because this gate is release-blocking, getting the strings wrong has direct consequences: too-broad → the gate blocks legitimate commits; too-narrow → predecessor coupling slips through the gate that exists to catch it. Blast radius is medium because an agent building `check-no-predecessor-refs.sh` must hardcode exact strings and the spec gives it nothing authoritative to copy. A reasonable fix is to enumerate the exact literal match strings (and any word-boundary constraints) in FR-011, the same way FR-005's denylist was made a closed enumerated set.

### AUDIT-20260607-17 — `unarchive` is a P1 operator command but the plan ships no skill for it

Finding-ID: AUDIT-20260607-17
Status:     fixed-fe21384c
Severity:   medium
Surface:    plan.md — `skills/{archive,curate}/SKILL.md` (two skills) vs spec.md US1 Scenario 3 / Independent Test (d) / SC-007 (unarchive as operator workflow)

The plan repeatedly describes the deliverable as "three CLI verbs + **two** thin skills" and lists only `skills/archive/SKILL.md` and `skills/curate/SKILL.md`. But `unarchive` is the reversibility half of the headline P1 story: US1's Independent Test gates on "`unarchive` returns the unit," Scenario 3 is an `unarchive` workflow, and SC-007 verifies the archive→unarchive round-trip. The operator-facing surface for verbs in this project is the `/stack-control:*` skill (naming convention), yet the one verb that closes the P1 loop has only a raw `stackctl unarchive` entry point and no skill.

This may be deliberate (unarchive as an occasional recovery verb), but the asymmetry is unstated and conflicts with the P1 weight US1 places on reversibility. Blast radius is medium: an agent following the plan ships archive+curate skills and no unarchive skill, leaving the documented P1 recovery path discoverable only via the bare CLI — a UX gap the spec's own acceptance scenarios assume away. A reasonable fix is to either add `skills/unarchive/SKILL.md` to the plan or state explicitly why unarchive is verb-only.

### AUDIT-20260607-18 — FR-013 migration "records the rename" but names no surface to record it in

Finding-ID: AUDIT-20260607-18
Status:     fixed-fe21384c
Severity:   medium
Surface:    spec.md — FR-013 ("migration MAY normalize a nonconforming identifier ... recording the rename so identity provenance isn't lost")

FR-013 permits migration to normalize a nonconforming identifier (a leading number, `#<n>`) to satisfy FR-005 and requires "**recording the rename** so identity provenance isn't lost" — but specifies no location for that record. The provenance ledger (FR-006) is scoped to *archive moves* keyed by identifier and lives in the archive file; a migration rename is not an archive move and may happen to a still-active Unit that is never archived. The clarification that "the live document carries **zero** bookkeeping" (FR-006) actively forecloses recording the rename in the live document. So the spec mandates a record with no home.

Blast radius is medium because an unattended migration agent must put the rename record *somewhere* and the spec contradicts the obvious candidates: it can't go in the live doc (zero-bookkeeping rule) and doesn't fit the ledger's archive-move schema. The agent will either invent an undocumented location (drift) or silently drop the provenance the requirement exists to preserve. A reasonable fix: name the rename-record surface explicitly (a migration report artifact, or an extension to the ledger schema with a `renamed-from` field), or relax "records the rename" to "reports the rename at migration time."

### AUDIT-20260607-19 — Coherence-violation reporting has no owning command or output surface

Finding-ID: AUDIT-20260607-19
Status:     fixed-fe21384c
Severity:   medium
Surface:    spec.md — FR-006 (coherence check "surfaces the resulting ledger staleness") + Edge Cases (manual identifier edit) + SC-007

FR-006 says the coherence check "**surfaces** the resulting ledger staleness, but the engine does not refuse or auto-repair manual edits," and the Edge Cases section says "the coherence check surfaces the ledger staleness on the **next run**." But "next run" of *what* — `archive`, `curate`, or both? — is never pinned, and the *form* of the surfacing (a `curate` report line, an `archive` warning, a non-zero exit) is unspecified. SC-007 asserts "after every archive run the provenance ledger matches the archive file's contents," which reads as an invariant that *holds*, not as a *report* an operator sees when it's violated by a manual edit.

Blast radius is medium: an agent has to decide which command performs the coherence check and how it reports a violation, with no spec anchor — so two agents (or the spec's own SC-007 vs FR-006) could disagree on whether a stale ledger is a silent state, a warning, or a fail-loud. Given the project's fail-loud-no-fallback posture, the ambiguity between "surface as a notice" and "fail loud" is material. A reasonable fix is to state which verb(s) run the coherence check, the exact report shape, and whether a coherence violation is a notice or a loud failure.

### AUDIT-20260607-20 — Empty / zero-Unit governable document behavior is unspecified across all three verbs

Finding-ID: AUDIT-20260607-20
Status:     fixed-fe21384c
Severity:   low
Surface:    spec.md — FR-002/FR-006/FR-008 (no zero-Unit case); Edge Cases (absent)

The Edge Cases section enumerates no-grammar, dual-grammar, parse-failure, missing-archive, corrupt-archive, collision, and partial-write cases, but never the empty document: a governable document that declares a valid grammar and parses to **zero Units** (a freshly-created roadmap with a grammar comment and frontmatter but no rows yet, or a document all of whose Units were already archived). FR-006 (`archive` selects archivable Units), FR-008 (`curate` checks ordering of an empty sequence), and the SC-001 post-condition ("zero archivable Units") all have a trivial-but-unstated answer here.

Blast radius is low because the natural behavior (no-op success, well-formed by vacuous truth, well-ordered by vacuous truth) is what most agents would land on. But it is worth a one-line edge-case entry because "a document with no Units" is exactly the fresh-install state of the two proof documents before migration content lands, and an agent that treats "no Units" as a parse failure (FR-003) rather than a valid empty parse would fail-loud on an empty roadmap. A reasonable fix is to add an Edge Case stating an empty-but-grammar-conformant document is well-formed and all three verbs no-op cleanly.

---

That's nine findings. The two I'd weight most for an unattended build are **claude-01** (the bare-`unarchive` dry-run contradiction, because both readings are anchored in mandatory sections and produce opposite write behavior) and **claude-03** (Unit/body heading boundary, because it blocks the most basic parse operation for the heading-keyed proof document). **claude-02** is the subtlest — the heading-scan resolution that closed the prior AUDIT-04 introduced a new false-collision path that the "no live-grammar parse" constraint makes unsolvable as written.

### AUDIT-20260607-21 — Dry-run default conflicts with the US1 independent test

Finding-ID: AUDIT-20260607-21
Status:     fixed-fe21384c
Severity:   medium
Surface:    specs/005-document-primitives/spec.md:34, specs/005-document-primitives/spec.md:111

US1’s Independent Test says to run `archive` and confirm settled items now live in the sibling archive, but FR-009 says `archive`, `unarchive`, and `curate` default to dry-run and only write with `--apply`. The acceptance scenarios below US1 use `archive --apply` for mutation, so the intended behavior is recoverable, but the mandatory Independent Test still points at the non-mutating command.

Blast radius is medium: a reasonable implementer will probably resolve this from FR-009 and the acceptance scenarios, but an unattended test writer could encode the independent test literally and either expect default mutation or treat dry-run as failing the P1 workflow. Make the Independent Test use `archive --apply` and `unarchive --apply` for state-changing assertions, reserving bare commands for planned-change reporting.

### AUDIT-20260607-22 — Archive file format is not specified enough for unarchive to extract the unit safely

Finding-ID: AUDIT-20260607-22
Status:     fixed-fe21384c
Severity:   high
Surface:    specs/005-document-primitives/spec.md:104, specs/005-document-primitives/spec.md:108-109

FR-005 says archived identifiers come from a lightweight heading/ledger scan, and FR-006 says each archived Unit keeps its identifier as a heading, but FR-007 requires `unarchive` to return a named archived Unit with body and identity intact. The spec never defines the archive document structure, the heading level used for archived Unit boundaries, how nested headings inside an opaque body are distinguished from the next archived Unit, or whether the ledger records an archive span/delimiter for extraction.

Blast radius is high because multiple plausible implementations follow from the text: scan from the identifier heading until the next same-level heading, until any heading, or use ledger entries only. Those produce different behavior once a Unit body contains headings, tables, or copied markdown sections. A reasonable fix is to specify an archive file contract: exact Unit boundary marker or heading level, allowed nested heading handling, and what ledger fields are required to locate and remove the archived Unit.

### AUDIT-20260607-23 — Plan still calls for an untrusted-grammar failure path after accepting trusted grammar execution

Finding-ID: AUDIT-20260607-23
Status:     fixed-fe21384c
Severity:   medium
Surface:    specs/005-document-primitives/plan.md:15, specs/005-document-primitives/plan.md:37, specs/005-document-primitives/spec.md:152

The spec explicitly accepts Peggy grammars as trusted local config that run in-process, including semantic actions. The plan’s Technical Context matches that at line 15, but the Constitution Check still says “grammar-as-untrusted-input failure path tested RED” at line 37. That phrase points at the rejected security model from the prior audit rather than the current accepted trust model.

Blast radius is medium: the surrounding text strongly indicates trusted execution is intended, but this row can cause test churn or a misleading implementation requirement for sandboxing/rejection. Rewrite the test obligation to match the accepted contract, such as tests for grammar compile failures, parse failures, and actionable errors from malformed trusted config.

## 2026-06-07 — audit-barrage lift (20260607T230606974Z-document-primitives-after_plan)

### AUDIT-20260607-24 — Anti-coupling scan omits the new unarchive skill

Finding-ID: AUDIT-20260607-24
Status:     fixed-e3b641c4
Severity:   medium
Surface:    specs/005-document-primitives/spec.md:120-121; specs/005-document-primitives/plan.md:95-98

FR-011 says the shipped product mechanism must be machine-checked for zero predecessor-plugin references, but its concrete scan scope only includes `plugins/stack-control/skills/{archive,curate}/**`. The plan now requires a third thin skill at `plugins/stack-control/skills/unarchive/SKILL.md`, so the recovery half of the P1 workflow is part of the product mechanism but is not actually covered by the release-blocking scan.

Blast radius is medium: most implementers will probably notice the “three verb modules” wording, but an unattended implementation of the scan can follow the literal brace pattern and leave `unarchive` unguarded. Reasonable fix: update FR-011’s scan scope to include `plugins/stack-control/skills/{archive,unarchive,curate}/**` or a broader `plugins/stack-control/skills/**` scope with explicit exclusions if needed.

### AUDIT-20260607-25 — Row-keyed archive format lacks a table container contract

Finding-ID: AUDIT-20260607-25
Status:     fixed-e3b641c4
Severity:   high
Surface:    specs/005-document-primitives/spec.md:106, specs/005-document-primitives/spec.md:114-116; specs/005-document-primitives/plan.md:92-94

The spec says a non-heading-keyed grammar like the roadmap delimits Units by “the table row,” and FR-006 says archived Units are appended to a sibling archive file created with frontmatter. It never specifies how a row-keyed archive preserves the markdown table container: required header row, separator row, column schema, ledger placement relative to the table, or how a scanner distinguishes archived Unit rows from any ledger rows or other tables in the archive.

Blast radius is high because the roadmap proof document is one of the two required real instances. A natural implementation could append raw table rows after frontmatter/ledger, producing an archive that is not a valid markdown table and making unarchive extraction ambiguous. Reasonable fix: define the row-keyed archive envelope explicitly, including table header/schema, where the ledger lives, and which table is the Unit table.

### AUDIT-20260607-26 — Archive coherence has no defined behavior when the archive is already stale

Finding-ID: AUDIT-20260607-26
Status:     fixed-e3b641c4
Severity:   high
Surface:    specs/005-document-primitives/spec.md:90, specs/005-document-primitives/spec.md:95, specs/005-document-primitives/spec.md:115-117

The edge cases say a corrupt archive or hand-edited archived identifier is surfaced by the coherence check, and FR-006/FR-008 make that check a `curate` NOTICE rather than a fail-loud failure. But FR-006 also says “After any archive run, a coherence check holds,” meaning the ledger must match archive contents after `archive --apply`. If the archive is already incoherent before a new archive run, the spec does not say whether `archive --apply` refuses to write, writes and leaves the old mismatch in place, or repairs the archive despite saying manual edits are not auto-repaired.

Blast radius is high: this affects the next state-changing archive operation after any manual archive edit, exactly the kind of drift the spec acknowledges. Different unattended implementations can make opposite choices about mutating a known-stale archive. Reasonable fix: add a precondition for `archive --apply` and `unarchive --apply` when coherence is already broken, or explicitly allow append-only writes while reporting that prior mismatches remain outside the operation’s coherence guarantee.

## 2026-06-07 — audit-barrage lift (20260607T232301463Z-document-primitives-after_plan)

### AUDIT-20260607-27 — Document preamble (title heading + intro prose) and shallower-than-reserved headings have no defined home

Finding-ID: AUDIT-20260607-27 (claude-01 + claude-02 + claude-03 + claude-04 + claude-05 + codex-01 + codex-02; cross-model)
Status:     fixed-f5f35216
Severity:   high
Surface:    specs/005-document-primitives/spec.md FR-002 (document model + Unit boundary rule)

```

FR-002 defines chrome as exactly two things — the `doc-grammar:` comment and the frontmatter — and says "a block the grammar does not account for, after chrome excision, is a parse failure." The Unit boundary rule then covers only two heading positions for a heading-keyed grammar: a heading **at** the reserved level (starts a new Unit) and headings **strictly deeper** than reserved (opaque body). It says nothing about a heading **shallower** than the reserved level, nor about content that precedes the first Unit.

Real living documents open with a document title and intro prose. The two proof documents are exactly this shape: `ROADMAP.md` and `DESIGN-INBOX.md` will each begin with an `# Title` (h1) and one or more intro paragraphs before the first row/`### Title`. For an inbox whose reserved Unit level is `### ` (h3), that leading `# Title` is h1 — shallower than reserved, not chrome, and not inside any Unit's body (no Unit exists yet). Under the literal rule it is "a block the grammar does not account for" → **parse failure on the very documents the feature ships to prove generality**. An unattended implementer following FR-002 verbatim either (a) fails the proof documents, or (b) silently invents a preamble region the spec never authorized — opposite readings, both buildable. The spec needs an explicit "preamble / leading non-Unit region" concept (where the title + intro live) and an explicit rule for shallower-than-reserved headings.

### AUDIT-20260607-28 — Plan summary still omits the unarchive primitive

Finding-ID: AUDIT-20260607-28
Status:     fixed-f5f35216
Severity:   medium
Surface:    specs/005-document-primitives/plan.md:1; specs/005-document-primitives/plan.md:9; specs/005-document-primitives/plan.md:23; specs/005-document-primitives/plan.md:51

The plan title and Summary still describe shipping two primitives, `archive` and `curate`, even though the plan later requires three CLI verbs and three skills: `archive`, `unarchive`, and `curate`. This is a lingering scope drift after adding the P1 recovery half.

Blast radius is medium: the detailed project structure includes unarchive, so a careful implementer will probably build it, but planning summaries are commonly used to scope task generation and review checklists. Update the title/summary to say three primitives or explicitly describe unarchive as part of the shipped primitive set.
