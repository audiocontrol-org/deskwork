# Audit Log — document-primitives

Durable record of audit findings + their dispositions for the `design/document-primitives` feature (`specs/005-document-primitives/`). Status values: `open` → `fixed-<sha>` → `verified-<date>`, or `acknowledged-<date>` with substantive reason.

Cross-model agreement (both `claude` and `codex` flag the same root cause independently) is the HIGH-confidence signal, marked **[cross-model]**.

---

## 2026-06-08 — GRADUATION II: spec-lens convergence pass + final override

After the first graduation (below), the operator ran a **convergence pass under the new spec-mode audit lens** (`feat(audit-barrage): mode-aware audit lens`) to field-test the lens and clear the genuine findings it surfaced. **~50 findings remediated across 15 iterations.** Under the lens, findings shifted entirely off implementation-mechanism onto **promise/decision/contradiction altitude**, and the HIGH count went **8 → 1 → 1 → 1 → 2 → 2 → 1** — a low oscillating tail, never zero (FM-4: specs have no crisp convergence floor; see `SPEC-AUDIT-FAILURE-MODES.md`). Two further mechanism generators were collapsed structurally (the durability "detectable" over-claim; the committed-tree precondition 17→18→19). Final residual: **AUDIT-20260608-22** (block region model vs a row-keyed grammar's sub-block table rows) — a genuine but low-blast promise-altitude completeness gap, dispositioned `acknowledged-deferred-impl-20260608` and scoped into `tasks.md` Phase 8 (T050; pinned RED-first when `roadmap.peg` + the block-stream engine are authored). Graduated via recorded `GOVERN_OVERRIDE` (`state: overridden`). **Key outcome: the lens validated (mechanism litigation gone); prevention promoted — `design/spec-authoring` is now a roadmap feature, the real fix.**

## 2026-06-08 — GRADUATION via GOVERN_OVERRIDE (operator decision)

The spec-governance convergence loop ran **8 barrage iterations** (claude + codex, `after_plan`). HIGH trajectory: **7 → 5 → 2 → 1 → 5 → 5 → 1 → 4**. **39 findings remediated** (`fixed-<sha>`) via fresh-context per-finding sub-agent dispatch; the iter-5/6 plateau was broken by a structural root-fix (replacing the two-file-atomicity *mechanism* with a *promise* — see `SPEC-AUDIT-FAILURE-MODES.md`).

The gate is `non-converged` at the ceiling (8) with **7 residual open findings** (AUDIT-20260608-02..08: 4 HIGH, 3 MED). Per `.claude/rules/spec-audit-diminishing-returns.md` (playbook B), the operator chose to **graduate via recorded `GOVERN_OVERRIDE`** rather than keep patching: the residual are diffuse implementation-mechanism-altitude edges with **no common generator and no new design forks**, pinned by `/speckit-plan` contracts + RED tests at implement time. Gate verdict: `state: overridden, openHigh: 4, openMedium: 3, override.recorded: true`.

The 7 are dispositioned `acknowledged-deferred-impl-20260608` and **scoped into `tasks.md`** (Phase 8 — Deferred audit findings) so implementation addresses them; **AUDIT-20260608-06 is a genuine bug** (zero-live-Unit `unarchive`), to be fixed RED-first during implementation.

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

## 2026-06-07 — audit-barrage lift (20260607T232709802Z-document-primitives-after_plan)

### AUDIT-20260607-29 — Two-file "atomic all-or-nothing" guarantee is not mechanically achievable as specified — crash window leaves the exact partial state SC-003 forbids

Finding-ID: AUDIT-20260607-29
Status:     fixed-ce82d9e5
Severity:   high
Surface:    spec.md FR-006 (archive — `--apply` atomic across both files), FR-010 ("zero writes is absolute and spans both files"), SC-003

FR-006 requires `--apply` to be "atomic (all-or-nothing) across both files — the live document and the sibling archive file: either both update … or neither does, with no partial state across the two files (e.g. staged writes + atomic rename; mechanism left to implementation)." FR-010 reinforces this as absolute, and SC-003 makes "mid-`--apply` write failure produces … no partial document mutation" a measurable success criterion. The suggested mechanism — "staged writes + atomic rename" — gives **per-file** atomicity, but there is no single POSIX operation that atomically renames two files. The natural implementation is two sequential `rename()` calls; a crash/interrupt (operator Ctrl-C, OOM, power loss) **between** them leaves file A swapped and file B not — precisely the cross-file partial state the spec declares impossible.

Blast radius is high: an unattended implementer reads "atomic rename" and ships two sequential renames, believing the contract is met, while the failure window silently violates SC-003. Worse, the failure leaves the ledger and archive contents inconsistent — the same drift the coherence NOTICE is meant to catch — but FR-006 says coherence is "guaranteed for the Units that operation moves," which a half-applied op did not actually achieve. A reasonable fix: specify crash/recovery semantics (a write-ahead journal or a single combined staging area replayed on next run, or define that one file is the commit point and the other is reconstructible), rather than asserting an unconditional two-file atomicity the suggested mechanism can't deliver.

### AUDIT-20260607-30 — Inbox title-as-identifier collides head-on with the non-ordinal denylist — a legitimate human title starting with a number is rejected on the low-friction-capture proof document

Finding-ID: AUDIT-20260607-30 (claude-02 + claude-04 + claude-05 + claude-06 + codex-03; cross-model)
Status:     fixed-ce82d9e5
Severity:   high
Surface:    spec.md FR-005 (non-ordinal denylist + per-grammar production), FR-013(a) (title-keyed inbox)

FR-005 makes the identifier "a single visible name," and FR-013(a) declares the design-inbox **title-keyed** — the entry's title *is* its identifier. The same FR-005 denylist rejects "a bare-integer segment" and "leading `<n>` numbering." These two rules conflict on exactly the document the feature ships to prove generality: a real inbox idea captured as *"3 ways to industrialize execution"* or *"5 hard problems in scope discovery"* produces the identifier `3 ways…` / `5 hard problems…`, whose leading number trips the ordinal denylist → **fail-loud rejection** of a legitimately-titled capture.

Blast radius is high because the inbox's entire purpose (per the project's own `design-inbox.md` rule) is instant low-friction capture; a denylist that refuses any title beginning with a digit makes the proof document hostile to ordinary use, and an agent building from the spec verbatim would emit a confusing fail-loud error for a title that has nothing ordinal about it. The denylist was designed against `F3`/`phase-2` slug-style IDs, but it was never reconciled with the title-keyed production FR-013(a) introduces. A reasonable fix: scope the leading-number / bare-integer patterns to slug-style productions only, or define the rejection as "looks like a *positional sequence* index" (the actual harm in FR-004) rather than "contains a leading digit," so prose titles aren't false-positived.

### AUDIT-20260607-31 — Shallower-than-reserved headings appearing *after* the first Unit are classified as "preamble" but their interleaved position and behavior under `curate` reorder is undefined

Finding-ID: AUDIT-20260607-31
Status:     fixed-ce82d9e5
Severity:   high
Surface:    spec.md FR-002 (Document preamble + Unit boundary rule)

The AUDIT-27 fix defines preamble as "**All content before the first Unit marker, AND any content at heading levels shallower than the reserved Unit level**," and calls preamble/Unit/Unit-body "the three exhaustive regions." But the second clause has no positional bound: for a heading-keyed inbox reserving `###`, a `## Captured` / `## Promoted` section divider sitting **between** two `###` units is shallower-than-reserved → "preamble" by the literal rule, yet it appears mid-document, interleaved with Units. The spec frames preamble as leading front matter ("title heading, intro prose … before the first Unit"), so an implementer's mental model (preamble = a contiguous leading region) contradicts the rule's literal text (preamble = any-position shallower heading).

This is high blast-radius because it directly governs `curate --apply` reordering on a proof document. When `curate` reorders Units, does an interleaved `## divider` move, stay, or anchor a Unit group? The spec is silent. Two implementers will make opposite choices: one treats the divider as a fixed anchor that partitions Units into ordered groups; another sweeps all Units past it into one declared order, scrambling a deliberately-grouped inbox. The Unit-boundary rule also needs to state explicitly that a shallower heading *terminates the current Unit's body* (the body rule only says bodies contain "strictly deeper" headings — it never says a shallower heading ends the span). Fix: bound preamble to the leading region only and define a distinct rule (or an explicit prohibition) for shallower headings that appear after Units begin.

### AUDIT-20260607-32 — Multiple `doc-grammar:` comments are excised but the spec never says which one is the grammar declaration

Finding-ID: AUDIT-20260607-32
Status:     fixed-ce82d9e5
Severity:   low
Surface:    spec.md FR-001, FR-002 (chrome excision — "the HTML comment(s) beginning with the `doc-grammar:` sentinel")

FR-002's chrome-excision step refers to "the embedded grammar-declaration comment — the HTML comment(**s**) beginning with the `doc-grammar:` sentinel," explicitly plural, and excises all of them. FR-001's precedence rules cover only embedded-block-vs-frontmatter-reference; they say nothing about **two embedded `doc-grammar:` comments** in the same document. If a document (or a sloppy migration) ends up with two such comments declaring different grammars, the spec gives no resolution: both are excised as chrome, but which one's grammar governs parsing is undefined.

Blast radius is low because it requires an unusual authoring mistake, and the document is operator-authored trusted config. But "the engine recognizes/excises exactly those" combined with the plural wording invites an implementer to silently use the first, the last, or to concatenate — three different behaviors with no spec basis. A one-sentence fix (e.g. "more than one `doc-grammar:` comment is a fail-loud configuration error" or "the first wins") removes the ambiguity cheaply.

---

I walked the spec's parse pipeline (FR-001/002/003), identity invariants (FR-004/005), the archive/unarchive/curate contracts (FR-006/007/008), atomicity (FR-010), and the two proof documents (FR-013), cross-checking each FR against the others and against the success criteria. The clean areas: the ledger-as-sole-union-source decision (FR-005/006) is now internally consistent, the seam-only reconciliation scope (FR-008) is unambiguous, and the anti-coupling closed-token match (FR-011) is well-bounded. The seven findings above are where an unattended build would most plausibly diverge — the two-file atomicity guarantee and the title-vs-denylist collision being the ones I'd fix before task generation.

### AUDIT-20260607-33 — `unarchive` is described as append-only even though it must remove from the archive

Finding-ID: AUDIT-20260607-33
Status:     fixed-ce82d9e5
Severity:   high
Surface:    specs/005-document-primitives/spec.md:121-122

FR-006 says ``archive --apply` / `unarchive --apply` write **append-only**`, but FR-007 defines `unarchive` as lifting the Unit from the archive file and removing its ledger entry. Those are not append-only operations: the archived Unit must be deleted from the archive container and the ledger must be mutated, or the same identifier remains in the archive ledger and continues to poison the document ∪ archive uniqueness union.

Blast radius is high because an unattended implementer can reasonably follow the explicit “append-only” sentence and implement unarchive as “copy back to live + append/update nothing destructive,” leaving duplicate state behind. A reasonable fix is to scope append-only to `archive --apply` only, and define `unarchive --apply` as an atomic removal from archive contents plus ledger, paired with insertion into the live document.

### AUDIT-20260607-34 — Shallower headings after a Unit are both preamble and impossible body

Finding-ID: AUDIT-20260607-34
Status:     fixed-ce82d9e5
Severity:   high
Surface:    specs/005-document-primitives/spec.md:107-109

The preamble rule says “any content at heading levels shallower than the reserved Unit level” is document preamble, while the heading-keyed Unit rule says a Unit spans from its reserved-level heading to the next reserved-level heading or end of document, and that Unit bodies may contain only strictly deeper heading levels. For an h3-keyed inbox, an h2 appearing after the first `### Unit` is therefore simultaneously inside the previous Unit span until the next h3, forbidden as Unit body, and classified as preamble even though it is no longer before the first Unit.

Blast radius is high because real markdown authors commonly insert h2 grouping or notes between h3 entries. The spec does not say whether this should end the previous Unit, be preserved as inter-Unit preamble, fail loud, or be archived with the previous Unit. A reasonable fix is to define “preamble” as leading-only unless the grammar explicitly supports inter-Unit non-Unit regions, and state the exact behavior for shallower-than-reserved headings encountered after the first Unit.

### AUDIT-20260607-35 — Missing-ledger `unarchive` behavior is not specified as a fail-loud case

Finding-ID: AUDIT-20260607-35
Status:     fixed-ce82d9e5
Severity:   medium
Surface:    specs/005-document-primitives/spec.md:93, specs/005-document-primitives/spec.md:98, specs/005-document-primitives/spec.md:122, specs/005-document-primitives/spec.md:125

The spec defines an unarchive collision as fail-loud, and the empty-document edge case says `unarchive <id>` follows the “normal not-found path,” but FR-007 does not define what happens when the named id has no ledger entry. FR-010’s enumerated failure modes also omit unarchive-not-found.

Blast radius is medium because the intended behavior is likely fail-loud with zero writes, but “normal not-found path” could also be read as a dry-run-style no-op report. That divergence matters for automation: a missing recovery target should not silently succeed. A reasonable fix is to add “unarchive target absent from ledger/archive” to FR-007 and FR-010 with the exact status: fail loud, actionable message naming the missing identifier, zero writes.

## 2026-06-07 — audit-barrage lift (20260607T235334558Z-document-primitives-after_plan)

### AUDIT-20260607-36 — Order key has no tie-break rule — `curate` reorder and `unarchive` reinsertion are ambiguous for equal-keyed Units

Finding-ID: AUDIT-20260607-36 (claude-01 + claude-04 + codex-03 + codex-04; cross-model)
Status:     fixed-687079a7
Severity:   high
Surface:    spec.md FR-004 (status & order — canonical), FR-007 (unarchive), FR-008 (curate), SC-007

FR-004 defines well-ordered as "its Unit sequence matches the declared order key" with the order key "expressible over status and human-readable fields" — explicitly a *category/attribute* key (the roadmap orders by `phase`). But many Units legitimately share the same key value: a roadmap has multiple `planned` rows, multiple Units in the same `phase`. The spec never states how Units with **equal order-key values** are arranged. This makes two operations underdetermined:

1. **`curate --apply` reorder** (FR-008): "reorders to the declared order key." With ties, multiple arrangements satisfy "matches the declared order key." An agent that doesn't use a stable sort will reorder tied Units differently on each run — `curate` becomes non-idempotent and thrashes version-controlled documents on every invocation, which is the opposite of "ensure it stays correct."
2. **`unarchive` reinsertion** (FR-007): "reinserted at its declared-order position (per the grammar's order key)." A Unit being restored shares its order-key value with N live Units; the spec gives no rule for *where among the tied group* it lands. SC-007's "content-equivalent, well-ordered" claim is unfalsifiable when any position within the tied run is equally "well-ordered."

Blast radius is high because ties are the common case, not the exception, and an unattended implementer has no anchor to resolve them — they will pick an arbitrary secondary sort (or none), and the operator only discovers the non-determinism when `curate` produces a spurious diff. A one-clause fix: require every grammar's order key to define a **total order** (a deterministic tie-break over a human-readable field, e.g. identifier), and state that `unarchive` places a restored Unit at the unique position that total order dictates.

### AUDIT-20260607-37 — "Must pass `curate`" conflates well-formed with fully-curated — migration target is ambiguous and self-contradicting

Finding-ID: AUDIT-20260607-37
Status:     fixed-687079a7
Severity:   high
Surface:    spec.md FR-013 (two proof documents), FR-008 (curate)

FR-013 states the migration target: "The migrated document MUST end up **well-formed** (it must pass `curate`)." But the parenthetical equates two different bars. FR-008 defines `curate` as ensuring **three** properties — well-formed (FR-003), well-ordered (FR-004), and **properly archived** (composes `archive --apply`, moving terminal-status Units out). "Well-formed" is only the first. "Pass `curate`" can be read two ways that diverge sharply:

- **Reading A** — "parses without fail-loud" (well-formed only). The migrated roadmap may retain `shipped`/`cancelled`/`retired` rows in the live document.
- **Reading B** — "`curate --apply` produces no changes" (the document is also well-ordered AND has zero archivable Units left). This forces migration to archive every terminal row.

These collide with the feature's own purpose. The proof documents exist to *demonstrate* `archive` (US1/SC-001), which requires terminal-status Units to be present in the live document after migration. Reading B would strip exactly the content the headline demo needs; Reading A leaves them. An unattended migration task will pick one and either over-archive (breaking the demo) or under-archive (and a later reviewer "fixes" it the other way).

Blast radius is high because the two readings produce materially different migrated documents and nothing in the artifact disambiguates. Fix: state the migration target precisely — e.g. "migrated document is **well-formed and well-ordered** (parses, Units in declared order); it MAY retain terminal-status Units, which the archive demo then moves." Drop the imprecise "(it must pass curate)" gloss or scope it to the well-formed + well-ordered subset.

### AUDIT-20260607-38 — Preamble rule + zero-Unit vacuous-truth combine to silently accept malformed documents that produce no Unit marker

Finding-ID: AUDIT-20260607-38
Status:     fixed-687079a7
Severity:   high
Surface:    spec.md FR-002 (document model — two regions), FR-003 (well-formed), Edge Cases ("Empty / zero-Unit document")

FR-002 defines the preamble as "everything **before the first Unit marker**," and the zero-Unit edge case blesses a document that "parses to **zero Units** … well-formed by vacuous truth … NOT a parse failure." FR-003's only fail-loud parse trigger inside the body is "a shallower-than-reserved (or peer-but-non-conforming) heading appearing **after** the first Unit." Compose these three rules and a gap opens: **a document that never produces a single recognized Unit marker is classified entirely as preamble and declared well-formed**, regardless of what it contains.

Consider the row-keyed roadmap whose grammar expects a markdown table. An author corrupts the table (a broken separator row, a stray blank line splitting it) so markdown-it emits paragraphs, not a table — zero rows → zero Units → "all preamble" → well-formed by vacuous truth. The author's broken roadmap silently becomes an "empty roadmap"; `archive` selects nothing, `curate` reports vacuously clean. No fail-loud, no offending span, despite the document being genuinely malformed. The same applies to a heading-keyed inbox whose Units are all authored one level too shallow (no reserved-level marker ever appears) — the whole file reads as preamble.

Blast radius is high because it directly contradicts the feature's load-bearing fail-loud goal (FR-010, Principle V) and an unattended consumer would build exactly the permissive behavior the edge case describes. The intended "fresh document with no rows yet" case is legitimate, but it is indistinguishable, under the current rules, from "document the author tried to fill but malformed." Fix: distinguish the two — e.g. allow a grammar to declare whether zero Units is valid only when the *body region is empty* (no non-preamble, non-Unit content after the preamble), so content that exists but matches no Unit marker fails loud rather than being absorbed into the preamble.

### AUDIT-20260607-39 — `curate --apply` writes the live document twice (reorder then archive-cut); the recoverable-crash model is reasoned only for archive's two files

Finding-ID: AUDIT-20260607-39 (claude-05 + codex-01; cross-model)
Status:     fixed-687079a7
Severity:   high
Surface:    spec.md FR-008 (curate, "reorders first, then archives"), FR-006 (recoverable model), FR-010, SC-003

FR-008 specifies that `curate --apply` "**reorders first, then archives**," composing `archive --apply`. FR-006's carefully-reasoned recoverable-atomicity model is framed around **two files** (live document + sibling archive) and "no single operation atomically commits two files." But the `curate` composition touches the live document **twice in sequence**: write #1 rewrites the live document in reordered form; then `archive --apply` performs write #2 (cut the terminal Units from the live document) plus write #3 (append to the archive + ledger). FR-008 asserts "reorder and archive succeed together or nothing is written," but the spec's mechanism — staged-write-plus-atomic-rename *per file* — only guarantees per-file atomicity, not a transaction spanning a reorder-write followed by a separate archive-cut-write on the same file.

A hard crash *between* the reorder rename and the archive-cut rename leaves the live document reordered-but-not-archived. The recoverable model says the `curate` coherence NOTICE detects residual mismatch — but the coherence check (FR-006) compares the **ledger against the archive file**; it does not detect "live document was reordered but its terminal Units were never archived." That intermediate state is silently a valid (well-formed, reordered) document with un-archived terminal Units — re-running `curate` finishes the job, but nothing *flags* the interrupted state the way the two-file archive inconsistency is flagged.

Blast radius is medium: the end state is self-healing on re-run and governed documents are version-controlled, so data isn't lost — but FR-008's "succeed together or nothing is written" claim is stronger than the mechanism delivers, and SC-003's recoverability story doesn't cover this three-write sequence. Fix: either restate FR-008's atomicity claim to match the recoverable model honestly for the multi-write curate path (reorder and archive are separately-committed; an interrupted curate leaves a well-formed but under-archived document that a re-run completes), or specify that curate stages all live-document mutations into a single atomic rename so the live document is written exactly once.

### AUDIT-20260607-40 — Normal-path cross-file rollback is still mechanically impossible as written

Finding-ID: AUDIT-20260607-40
Status:     fixed-687079a7
Severity:   high
Surface:    specs/005-document-primitives/spec.md:100, specs/005-document-primitives/spec.md:126, specs/005-document-primitives/spec.md:130

The spec says that on the normal same-process path, “a failure before the second rename commits nothing” and leaves zero writes across both files. Atomic rename is per-file; once the first rename has happened, any same-process error before the second rename has already committed one file. The current wording only acknowledges hard interrupts between commits, but the same window exists for ordinary thrown errors, permission failures, disk-full on the second write/rename, or validation discovered too late.

Blast radius is high because this is a contract an implementer cannot satisfy without an explicit transaction protocol such as backups, journal files, or writing all temp files before any rename and only allowing non-failing operations after the first commit point. As written, a builder may implement sequential atomic renames and believe FR-010 is satisfied while still leaving live/archive skew on normal errors. The fix is to either weaken the normal-path guarantee to detectable/recoverable after the first file commit, or specify an actual rollback/journal mechanism.

### AUDIT-20260607-41 — Prohibited scheduling language remains in the reconciliation sections

Finding-ID: AUDIT-20260607-41
Status:     fixed-687079a7
Severity:   low
Surface:    specs/005-document-primitives/spec.md:94, specs/005-document-primitives/spec.md:128, specs/005-document-primitives/spec.md:148, specs/005-document-primitives/spec.md:178; specs/005-document-primitives/plan.md:29

The audit wrapper explicitly rejects deferral-style commitments, but the diff still contains several scheduling references around reconciliation and document-change protocols. The intended scope is clear: reconciliation execution is excluded from this feature, and `curate` only reports the recognized seam. The wording should state that boundary without implying a scheduled continuation.

Blast radius is low for implementation behavior because FR-008 is otherwise clear, but it is a process trap: downstream task generation may preserve the wording as placeholder commitments or the wrapper may reject the artifact. A reasonable fix is to replace those sentences with static scope language such as “execution is excluded from this feature” and remove schedule-implying phrasing.

## 2026-06-08 — audit-barrage lift (20260608T000347204Z-document-primitives-after_plan)

### AUDIT-20260608-01 — FR-004 declares an order *key* but never an ordering *relation* over categorical field values

Finding-ID: AUDIT-20260608-01 (claude-01 + claude-02 + claude-03 + claude-04 + claude-05 + codex-01 + codex-02 + codex-03 + codex-04; cross-model)
Status:     fixed-0c68291d
Severity:   high
Surface:    specs/005-document-primitives/spec.md — FR-004 ("status & order — canonical"); FR-013 roadmap ("ordering by `phase`")

FR-004 says "A document is **well-ordered** if and only if its Unit sequence matches the declared order key" and that the key "MUST be expressible over status and human-readable fields." AUDIT-36 added a tie-break for *equal* order-key values (by identifier), but the spec never defines how *unequal* values of a categorical field compare. The roadmap proof document (FR-013) orders by `phase`, whose values are `design`, `plan`, `impl`, `multi` — a sequence whose intended order (`design < plan < impl < multi`) is **not** the alphabetical order (`design < impl < multi < plan`) an implementer reaches for by default. The same gap applies to ordering by `status` (`planned`, `in-flight`, `shipped`…): there is no natural string order. FR-004's "expressible over … fields" describes *which* field sorts, never the *relation* over that field's value domain.

Blast radius is high because `curate --apply` **mutates the live document into the declared order** (FR-008/SC-002). An unattended agent building from this spec will implement the only ordering the spec gives it — lexicographic comparison of the field value — and `curate --apply` will then *reorder a correct roadmap into a semantically-wrong order* and call it "well-ordered." Nothing in the artifact corrects this. Fix: require each grammar to declare an explicit ordering relation over its order-key domain (e.g. an ordered enumeration of phase values / status values), and define `well-ordered` against that declared relation, with the FR-005 identifier tie-break applying only within equal-rank values.

## 2026-06-08 — audit-barrage lift (20260608T001744175Z-document-primitives-after_plan)

### AUDIT-20260608-02 — Order-key value domain and the declared ordering relation's domain are declared independently — a Unit can have a valid, parseable order-key value with no rank in the relation

Finding-ID: AUDIT-20260608-02
Status:     acknowledged-deferred-impl-20260608
Severity:   high
Surface:    spec.md FR-004 ("Declared ordering relation"), FR-005 ("Per-grammar production"), FR-013(b) (roadmap `phase` order); data-model `GrammarSpec.orderKey`

The recent fix (AUDIT-20260608-01) added a **declared ordering relation** — an ordered enumeration of the order-key field's value domain — and defines `well-ordered` against it. But nothing in the spec requires that a Unit's *actual* order-key value be a **member** of that enumeration. The ordering relation (e.g. roadmap `phase` = `[design, plan, impl, multi]`) is declared on `GrammarSpec.orderKey`, while the order-key value itself arrives through the grammar's **identifier production** (`<phase>/<slug>`) or status parse — two **independently declared** surfaces. FR-005 explicitly says each grammar "declares its concrete identifier production" and the engine "does NOT mandate slug-shape." So a roadmap grammar can legitimately accept `ops/some-slug` (identifier valid, parses fine, non-ordinal, unique) whose `phase` value `ops` is **absent** from the declared `[design, plan, impl, multi]` relation. The spec defines no rank for an out-of-domain value.

Blast radius is high because `curate --apply` **mutates the live document into declared order** (FR-008/SC-002). An unattended agent reaching a Unit whose order-key value isn't in the relation has no defined behavior: it will throw, drop the Unit, or sort it arbitrarily (e.g. to the end), and `curate --apply` will silently produce a "well-ordered" document that isn't — or crash mid-reorder. Nothing in the artifact closes this. Fix: make membership in the declared ordering relation a **well-formedness (FR-003) requirement** — a Unit whose order-key field value is not in the declared enumeration is a fail-loud parse/validation failure naming the offending value — OR require the grammar to guarantee its identifier/status production is a subset of the ordering relation's domain and state that coupling explicitly.

### AUDIT-20260608-03 — `unarchive` reinsertion "at declared-order position" is undefined when the live document is not already well-ordered — and contradicts the SC-007 / US1 "leaving the document well-ordered" claim

Finding-ID: AUDIT-20260608-03
Status:     acknowledged-deferred-impl-20260608
Severity:   high
Surface:    spec.md FR-007 ("reinserted at its declared-order position"), US1 Independent Test + Acceptance Scenario 3, SC-007 ("content-equivalent, well-ordered")

FR-007 says `unarchive` "returns it to the live document — reinserted at its **declared-order position** (per the grammar's order key, FR-004)" and FR-002 is explicit that `curate` — not `unarchive` — is the verb that reorders Units. But US1's Independent Test and Acceptance Scenario 3, and SC-007, all assert the round-trip leaves "the document **content-equivalent and well-ordered**." These two claims are only jointly satisfiable when the live document was **already well-ordered** before the unarchive. If the operator has not run `curate` (the live document has Units out of declared order), inserting a single Unit "at its declared-order position" is ill-defined: there is no single correct index relative to mis-ordered neighbors, and inserting one Unit cannot make a globally out-of-order document well-ordered without reordering the rest.

Blast radius is high because the two natural readings diverge and the artifact doesn't disambiguate. An agent could build (a) "unarchive inserts only, and the round-trip is well-ordered only if the doc was already well-ordered" — in which case SC-007/US1's unconditional "well-ordered" assertion is a false test that will fail on a realistic out-of-order document; or (b) "unarchive must produce a well-ordered document," which forces unarchive to reorder all Units, directly contradicting FR-002/FR-008's statement that `curate` owns reordering. Fix: state the precondition explicitly — `unarchive` computes the insertion index *as if* the document were well-ordered and guarantees a well-ordered result **only when the live document was already well-ordered**; otherwise it inserts at the computed index and the result's global order is the operator's responsibility (run `curate`). Then weaken SC-007/US1's "well-ordered" assertion to that precondition.

### AUDIT-20260608-04 — Row-keyed archive table is brittle under column-schema evolution: append-only + single-table + "reproduces the column schema" have no story for a schema change

Finding-ID: AUDIT-20260608-04
Status:     acknowledged-deferred-impl-20260608
Severity:   medium
Surface:    spec.md FR-006 ("Row-keyed grammar: archived rows live in a single markdown table that reproduces the live document's header row + separator row + column schema"; "append-only ... never rewrites prior archived Units")

FR-006 specifies that a row-keyed grammar's archive is **one** markdown table reproducing the live document's header + separator + column schema, that `archive --apply` is **append-only**, and that it "never rewrites prior archived Units." These three constraints have no defined behavior when the live document's column schema changes over the document's life (an operator adds, removes, or reorders a roadmap column — a routine living-document edit). A subsequent `archive --apply` must append a row whose column count/order no longer matches the existing archive table's header, but append-only forbids rewriting the prior header or prior rows. The result is either a malformed table (rows with mismatched column counts) or an unspecified second table — neither is addressed.

Blast radius is medium: it doesn't break the first archive or the golden path, but it compounds — the failure surfaces only after a schema edit, by which time the archive may already hold many rows, and the corruption is silent until the archive table is read or unarchived. An implementer building strictly to "single table, append-only, reproduce schema" will produce a column-mismatched table. Fix: either state column-schema stability as an assumption/constraint with a fail-loud check when the live header diverges from the archive table header, or specify how the archive accommodates schema evolution (e.g. a new table segment keyed to the new schema, with the ledger remaining the identifier-keyed locator).

### AUDIT-20260608-05 — Ledger-only uniqueness union cannot detect a live↔archive identifier collision created by a manual archive-marker edit — uniqueness can be silently evaded

Finding-ID: AUDIT-20260608-05
Status:     acknowledged-deferred-impl-20260608
Severity:   medium
Surface:    spec.md FR-005 ("Archived identifiers for the union come **solely from the provenance ledger**"), FR-006 manual-edit handling, manual-edit Edge Case, SC-007

FR-005 makes the **ledger the sole source** of archived identifiers for the document ∪ archive uniqueness union, and FR-006/the manual-edit Edge Case accept that an operator hand-editing an archived Unit's **identifier marker** leaves the ledger stale (surfaced later as a `curate` NOTICE, not blocking). The interaction of these two accepted positions produces a concrete uniqueness hole not covered by the "staleness is just a NOTICE" framing: suppose the operator hand-edits an archived Unit's marker from `design/foo` to `design/bar`. The ledger still says `design/foo`. The operator then creates a **live** Unit `design/bar`. The FR-005 uniqueness check consults the ledger (`design/foo`), finds no collision, and **accepts** — but the archive file now physically contains a Unit marker `design/bar` identical to a live Unit. A later `unarchive` or cross-reference resolves `design/bar` ambiguously across two physical Units with the same identifier.

Blast radius is medium: it requires a manual edit (operator responsibility, explicitly accepted), but the consequence is a genuine duplicate-identifier state that the spec elsewhere promises is impossible (FR-005 "Unique within the document ∪ its archive"), and the only safety net (the `curate` coherence NOTICE) flags ledger-vs-marker drift, not the live↔archive-marker duplication. This is worth surfacing distinctly from the already-accepted "staleness is a NOTICE" decision because it is a uniqueness-*invariant* evasion, not mere bookkeeping drift. Fix: either state explicitly that FR-005's "unique within document ∪ archive" is guaranteed only against the ledger (and a manual marker edit can defeat it — narrowing the invariant honestly), or have the `curate` coherence check additionally cross-reference live identifiers against the *physical archive markers* (not just ledger entries) and report any live↔archive marker duplication.

### AUDIT-20260608-06 — Zero-live-Unit documents incorrectly make `unarchive` impossible

Finding-ID: AUDIT-20260608-06
Status:     acknowledged-deferred-impl-20260608
Severity:   high
Surface:    specs/005-document-primitives/spec.md:106, specs/005-document-primitives/spec.md:130

The zero-Unit edge case conflates “the live document has zero Units” with “the archive ledger is empty or absent.” Line 106 explicitly includes “a document whose Units have all been archived” as a valid zero-Unit live document, but then says `unarchive <id>` fails loud because “a zero-Unit document has an empty (or absent) ledger.” That is false for the all-archived case: the live document has zero Units precisely because the archive should contain Units and ledger entries.

Blast radius is high because it breaks the P1 reversibility contract when the live document becomes fully lean. A builder following line 106 could reject `unarchive` from a fully archived document, even though FR-007 says unarchive locates the Unit via the archive ledger. Fix by separating “zero live Units” from “empty/absent archive ledger”: `archive`/`curate` no-op on zero live Units, while `unarchive --id` should succeed if the sibling archive ledger contains the requested id and fail loud only when the ledger/archive lookup fails.

### AUDIT-20260608-07 — Interrupted `curate` detection is attributed to the wrong check

Finding-ID: AUDIT-20260608-07
Status:     acknowledged-deferred-impl-20260608
Severity:   high
Surface:    specs/005-document-primitives/spec.md:103, specs/005-document-primitives/spec.md:131, specs/005-document-primitives/spec.md:159, specs/005-document-primitives/spec.md:173

The durability wording says inconsistencies from an interrupted `--apply` are detectable because “the `curate` coherence check” surfaces them. That is not true for every `curate --apply` interruption path described on line 131: curate reorders first, then archives. If it stops after the live-document reorder but before archive movement, there is no ledger/archive mismatch for the coherence check to report; the detectable condition is instead the ordinary “properly archived” check finding terminal Units still live.

Blast radius is high because SC-003 line 159 specifies the simulated interruption evidence as a ledger/archive mismatch NOTICE. An implementer can satisfy that test while missing the reorder-before-archive interruption state, or can overclaim coherence coverage for a state coherence cannot observe. Fix by stating that interrupted states are detected by `curate`’s full health report: ledger/archive mismatches by the coherence check, and live terminal Units by the properly-archived check.

### AUDIT-20260608-08 — Unarchive locate failures are excluded from the canonical zero-write list

Finding-ID: AUDIT-20260608-08
Status:     acknowledged-deferred-impl-20260608
Severity:   medium
Surface:    specs/005-document-primitives/spec.md:130, specs/005-document-primitives/spec.md:133

FR-007 says `unarchive` fails loud on locate failure: absent/empty ledger or no ledger entry for `--id`. But FR-010’s canonical “validation failure” zero-write list names ungovernable documents, ambiguous grammar declarations, parse failures, identifier violations, and unarchive collisions, while omitting unarchive locate failures.

Blast radius is medium because the intended behavior is strongly implied by FR-007, so a careful implementer will probably fail before writing. The canonical fail-loud section is still the place an unattended builder will use for cross-file zero-write guarantees, and this omission leaves missing-id `unarchive --apply` outside the absolute zero-write contract. Fix by adding unarchive locate failure to FR-010’s zero-write failure list.

## 2026-06-08 — audit-barrage lift (20260608T005825513Z-document-primitives-after_plan)

### AUDIT-20260608-09 — Empty/zero-Unit edge case promises a fail-loud path the two-region model makes unreachable

Finding-ID: AUDIT-20260608-09
Status:     fixed-a201a089
Severity:   high
Surface:    spec.md Edge Case "Empty / zero-Unit document"; FR-002 (two-region model); FR-003

The empty-document edge case asserts a fail-loud path for an unexpectedly-empty parse: *"Vacuous well-formedness requires a successful parse … this is distinct from a parse failure (FR-003) — e.g. intended entries that the grammar did not recognize as Units and that therefore did not fall cleanly into the preamble — which still fails loud."* The two-region model in FR-002 makes that path unreachable. FR-002 defines the **preamble** as *"everything before the first Unit marker,"* preserved verbatim and never fails loud; a block is only a parse failure (FR-003) when it is *"after chrome excision **and outside the document preamble**."* "Outside the preamble" means "after the first Unit marker." In a zero-Unit document there **is no first Unit marker**, so every block is, by definition, before it — i.e. entirely preamble. There is therefore no block that "did not fall cleanly into the preamble," and no fail-loud path can fire. A zero-Unit document **always** parses vacuously well-formed.

The blast radius is high because an unattended builder reading this edge case will try to implement a fail-loud branch distinguishing "intended-but-unrecognized entries" from "legitimate preamble prose" in the all-preamble case — but at the block level those two are identical (both are blocks before any Unit marker), and FR-003 forbids the only tool that could separate them: *"Well-formedness is a parse success/failure, **not a heuristic**."* The builder is left to either ship an impossible/contradictory check or invent a forbidden heuristic. The AUDIT-38 resolution already supplied the correct, achievable signal — the engine **reports the parsed Unit count** so a zero-Unit result is never silent — but the edge-case prose still also claims a fail-loud path beside it. Fix: drop the *"which still fails loud"* clause for the all-preamble (zero-marker) case and state plainly that a zero-Unit document is always vacuously well-formed, with the non-silent parsed-count report as the **only** safety signal; reserve fail-loud for documents that *do* have ≥1 Unit marker followed by a non-conforming block (the path FR-002 actually supports).

### AUDIT-20260608-10 — `unarchive` "declared-order position" reinsertion is ill-defined when the live document is not already well-ordered — a state FR-013 explicitly permits

Finding-ID: AUDIT-20260608-10
Status:     fixed-a201a089
Severity:   high
Surface:    spec.md FR-007; SC-007; FR-013 ("MAY be unordered"); FR-008

FR-007 says `unarchive` *"returns it to the live document — reinserted at its **declared-order position** (per the grammar's order key, FR-004)"* and only touches the named Unit (it "locates," "lifts," "returns," "removes its ledger entry" — it does not reorder the rest). SC-007 promises the round-trip *"restores a content-equivalent, **well-ordered** state."* Both promises silently assume the surrounding live document is already in declared order. FR-013 and the Assumptions block explicitly break that assumption: a migrated document *"need not be fully-curated … and MAY be unordered."* Because `archive` is its own verb (it does not reorder), the reachable sequence **migrate (unordered, well-formed) → `archive --apply` → `unarchive --apply`** lands a Unit-reinsertion into an *unordered* sequence.

"Declared-order position" has no single meaning in an unordered sequence: an agent could insert where the Unit's order-key *would* sit in a hypothetically-sorted document (producing a placement unrelated to the actual neighbors) or scan for the first actual neighbor that out-ranks it (a different, also-defensible result). The spec never disambiguates, so two builders produce two different behaviors. Worse, SC-007's *"well-ordered"* promise is **unachievable** by a single-Unit insertion when the rest is unordered — the only way to honor it is to reorder the whole document, which contradicts FR-007's single-Unit scope (and would surprise an operator who deliberately left the doc uncurated). Blast radius is high: this is a load-bearing P1 reversibility contract (US1) with two roughly-equal readings and an SC that one of them cannot satisfy. Fix: state the precondition explicitly — either (a) `unarchive` reinserts relative to the document's *current* order (defining "declared-order position" against actual neighbors, and narrowing SC-007's "well-ordered" to "well-ordered iff the live document was well-ordered before the round-trip"), or (b) `unarchive` reorders the full Unit sequence on reinsertion (and SC-007/FR-007 are reworded to say so). Pick one; today the spec implies both.

### AUDIT-20260608-11 — Migration is framed as both a manual one-time step and an automated "migration run," with no module, no scope decision, and no verifying SC

Finding-ID: AUDIT-20260608-11
Status:     fixed-a201a089
Severity:   medium
Surface:    spec.md FR-013; Assumptions ("migration is lossless…"); plan.md Project Structure; Out of Scope

FR-013 simultaneously frames migration two incompatible ways. It is *"a **one-time establishment step, not ongoing bookkeeping**"* (reads as manual authoring by the feature implementer), yet it *"**reports each rename at migration time** (in the migration run's output/report)"* and *"MAY normalize a nonconforming identifier … reporting each rename"* (reads as an automated tool with an output channel). plan.md's Project Structure lists no migration module (only `archive`/`unarchive`/`curate` engines + verbs), Out of Scope never addresses migration tooling, FR-011's anti-coupling scan scope omits it, and no Success Criterion verifies the rename-reporting promise.

The blast radius is medium: an unattended builder cannot tell whether to build a `migrate` capability (scope creep into an unspecified, untested module) or treat migration as hand-editing (in which case "the migration run's output/report" has no defined producer and the FR-013 promise *"reports each rename at migration time"* is silently dropped). Either way a stated promise goes unmet or unscoped work appears. Fix: decide and state whether migration is (a) manual authoring — then reword FR-013/Assumptions to drop "migration run/output" language and describe the rename record as something the implementer writes by hand into the establishment commit/PR, or (b) a shipped/one-shot tool — then add it to plan.md's structure, FR-011's scan scope, and add an SC that the rename report is produced.

### AUDIT-20260608-12 — US2 Acceptance Scenario 4 requires a reconciliation-hook-declaring grammar that neither proof document provides and the spec never commits to as a fixture

Finding-ID: AUDIT-20260608-12
Status:     fixed-a201a089
Severity:   medium
Surface:    spec.md US2 Independent Test + Acceptance Scenario 4; FR-008; FR-013

FR-008's only *new* user-visible behavior beyond archive/curate is the **reconciliation seam**: `curate` must *recognize/validate* a declared hook and report it as *"declared, not executed."* US2's Independent Test (*"declares a reconciliation source"*) and Acceptance Scenario 4 (*"a document whose grammar declares a reconciliation hook"*) are the only places that behavior is exercised. But FR-013 establishes exactly two proof documents — a title-keyed inbox and a `<phase>/<slug>` roadmap — and neither is specified to declare a reconciliation hook, and the spec commits to no other fixture that does. The seam-recognition promise thus has no committed artifact to verify it against.

Blast radius is medium: a careful builder will likely fabricate a hook-declaring fixture to satisfy AS4, so the readings barely diverge — but the spec leaves the one genuinely-novel FR-008 capability resting on an artifact it never decides to create, and a builder optimizing to the two named proof documents (SC-005's "two distinct guarantees") could ship the seam unverified. Fix: either have one proof grammar (the roadmap is the natural candidate — Out of Scope already names the future roadmap-discipline protocol that "plugs into curate's FR-008 reconciliation hook") declare the seam, or state explicitly that a third fixture grammar exists solely to exercise the hook-recognition path, and reference it from US2/FR-008.

### AUDIT-20260608-13 — FR-003 defines well-formedness as parse-only while FR-005 makes archive uniqueness part of well-formedness

Finding-ID: AUDIT-20260608-13
Status:     fixed-a201a089
Severity:   high
Surface:    specs/005-document-primitives/spec.md:118-121, specs/005-document-primitives/spec.md:142

FR-003 says a document is well-formed “if and only if” its block stream parses against its declared grammar. FR-005 then says identifier invariants are enforced “as part of FR-003 well-formedness,” including uniqueness across the live document and its archive ledger. Those cannot both be the canonical definition: a live document can parse perfectly while still duplicating an archived ledger identifier.

Blast radius is high because unattended builders may implement “well-formed” as parse-only, especially because FR-013 sets the migration bar as well-formed and separately says it must parse with valid identifiers. That can leave archive-union uniqueness outside gates that rely on well-formedness. A reasonable correction is to split “parses” from “valid governable document,” or revise FR-003 so well-formed explicitly includes parse success plus FR-005 identifier validation.

### AUDIT-20260608-14 — Unreadable archive ledger is not distinguished from a corrupt archive body

Finding-ID: AUDIT-20260608-14
Status:     fixed-a201a089
Severity:   high
Surface:    specs/005-document-primitives/spec.md:99, specs/005-document-primitives/spec.md:121, specs/005-document-primitives/spec.md:129-130

The spec says a corrupt or unparsable archive file does not block live-document validation because archived identifiers come from the ledger only, and corruption is surfaced by the coherence check. But the ledger itself lives inside that same archive file. If corruption makes the ledger absent or unreadable, the spec does not say whether live validation fails loud, treats the archive union as empty, or emits only a NOTICE.

Blast radius is high because the wrong default is dangerous: treating an unreadable ledger as empty allows live identifiers to reuse archived identifiers, undermining FR-005 and making later unarchive behavior ambiguous. A reasonable correction is to state the user-facing promise for ledger-read failure specifically, separate from corruption in archived Unit contents.

### AUDIT-20260608-15 — Row-keyed coherence is undermined by repeated “heading scan” wording

Finding-ID: AUDIT-20260608-15
Status:     fixed-a201a089
Severity:   medium
Surface:    specs/005-document-primitives/spec.md:121, specs/005-document-primitives/spec.md:128-129, specs/005-document-primitives/spec.md:150

FR-006 correctly says row-keyed archives store Units as rows in a single markdown table, but FR-005 and the Provenance Ledger entity still describe the coherence cross-reference as a heading scan. That wording is no longer grammar-neutral: one of the two proof documents is row-keyed, so its archive identifiers are not reserved-level headings.

Blast radius is medium because nearby text at line 129 also says “identifier markers,” so a careful reader can infer the intended generalized behavior. An unattended builder could still implement coherence only for heading-keyed archives and miss ledger-vs-row drift for the roadmap proof document. A reasonable correction is to replace “heading scan” with “archive identifier-marker scan” everywhere and name both marker forms.

### AUDIT-20260608-16 — Spec and plan contain prohibited handoff wording

Finding-ID: AUDIT-20260608-16
Status:     fixed-a201a089
Severity:   medium
Surface:    specs/005-document-primitives/spec.md:16, specs/005-document-primitives/spec.md:131, specs/005-document-primitives/spec.md:169, specs/005-document-primitives/spec.md:173, specs/005-document-primitives/spec.md:178-185; specs/005-document-primitives/plan.md:19

The audit prompt’s hard constraints say to surface prohibited handoff wording if it appears in the audited text. The spec and plan still contain multiple instances: reconciliation execution is assigned to another feature, parser choice and write protocol are pushed outside the spec, and the Out of Scope section labels several items as candidate later work.

Blast radius is medium because this is not a product behavior contradiction, but it is a governance defect for the audit wrapper and for unattended builders: these phrases can turn required decisions into open-ended handoffs. A reasonable correction is to phrase each boundary as a present-tense scope decision without roadmap language, or move mechanism-level details solely into plan/contracts where the feature process expects them.

## 2026-06-08 — audit-barrage lift (20260608T020149329Z-document-primitives-after_plan)

### AUDIT-20260608-17 — Durability promise "never silently loses content" is contradicted by its own version-control recovery precondition

Finding-ID: AUDIT-20260608-17 (claude-01 + claude-02 + claude-03 + claude-04 + codex-01 + codex-02 + codex-03; cross-model)
Status:     fixed-9c926cf6
Severity:   high
Surface:    specs/005-document-primitives/spec.md — FR-010, FR-006 (durability promise), SC-003(ii), Assumptions ("Governed documents are version-controlled")

FR-010 promises that an interrupted/failed `--apply` "NEVER silently loses or corrupts content" and grounds that promise on version control: "any inconsistency an interruption leaves is **recoverable** (revert to the last commit + re-run)." SC-003(ii) restates it: "a version-control revert restores the pre-operation state." The recovery procedure recovers only **committed** content — but the spec never requires a clean/committed working tree before `--apply`, and the Assumptions say only that documents are "version-controlled," not that they are committed before each operation.

Consider the natural sequence an unattended agent or operator will hit: edit the live document, then run `archive --apply` (which itself rewrites the live document) without committing first, and the write is interrupted. The prescribed recovery — "revert to the last commit" — discards both the crash artifacts **and** the operator's uncommitted pre-operation edits. Content that existed before the operation is silently lost *by the spec's own recovery mechanism*, directly violating "NEVER silently loses content." This is a flaw in the **promise**, not a request for a write mechanism: the promise is strictly stronger than what its stated recovery basis can deliver. Blast radius is high because the whole durability story (FR-006/FR-008/FR-010/SC-003) leans on this single recovery clause, and an agent building from it will treat git as the safety net while an operator with uncommitted work silently loses it. A reasonable fix: state the precondition explicitly — scope the durability promise to **committed** state, or require/assert a clean working tree before `--apply` — so "revert restores the pre-operation state" is true as written.

## 2026-06-08 — audit-barrage lift (20260608T020912167Z-document-primitives-after_plan)

### AUDIT-20260608-18 — `curate --apply`'s own reorder write violates the committed-tree precondition that the composed `archive --apply` enforces — curate can never reach its archive step on any document that needs reordering

Finding-ID: AUDIT-20260608-18 (claude-01 + claude-02 + codex-01 + codex-02 + codex-03; cross-model)
Status:     fixed-7d5e3642
Severity:   high
Surface:    specs/005-document-primitives/spec.md — FR-008 ("reorders first, then archives ... composing `archive --apply`"), FR-006 (committed-working-tree precondition: "before any `--apply` write ... MUST be committed (clean)"), FR-010 (uncommitted-target → "zero writes is absolute"), SC-002

The new committed-working-tree precondition and FR-008's composition decision collide on curate's success path. FR-006 states the gate as a *per-write* condition: "before **any** `--apply` write, the target live document **and** its sibling archive file MUST be **committed (clean)** ... if either has uncommitted changes, `--apply` **fails loud**." FR-008 then decides that `curate --apply` "**reorders first, then archives** (writing the live document for the reorder, **then composing `archive --apply`**)." Trace the literal sequence on a document that is clean at start and needs reordering: (1) curate checks the precondition — clean, passes; (2) curate writes the live document to reorder Units — the live document is now **dirty/uncommitted**; (3) curate composes `archive --apply`, which (per FR-006/FR-010, as a standalone gated verb) **re-checks the precondition, sees the dirty live document, and fails loud**. So `curate --apply` can never complete the archive step on any document that actually needs reordering — directly defeating SC-002 ("after `curate --apply` ... archivable Units have been moved to the archive") and US2 Acceptance Scenario 1.

Worse, the failure happens *after* curate's reorder write, so curate leaves a **partial mutation and then reports a validation failure** — violating FR-010's promise that the uncommitted-target validation failure produces "zero writes ... absolute ... no partial document mutation." The spec never says where the precondition gate fires: once at the outermost operation boundary (correct — curate's reorder+archive is one logical op, gated before the first write), or independently inside each composed `--apply` verb (broken). An unattended builder reading "curate composes `archive --apply`" and "`archive --apply` fails loud on an uncommitted target" will plausibly implement the gate inside the archive verb and ship a curate that breaks on every unordered document. A reasonable fix: state that the committed-working-tree precondition is an **operation-level gate evaluated once before the operation's first write**, and that composed inner `--apply` steps do not re-evaluate it — so curate's own reorder write does not trip the gate it shares with archive.

## 2026-06-08 — audit-barrage lift (20260608T021431178Z-document-primitives-after_plan)

### AUDIT-20260608-19 — Committed-working-tree precondition is unsatisfiable for the sibling archive on first archive — its two formulations diverge on the absent/untracked file, and a literal reading blocks US1's headline path

Finding-ID: AUDIT-20260608-19 (claude-01 + claude-02 + codex-01 + codex-02 + codex-03 + codex-04; cross-model)
Status:     fixed-674e1e3c
Severity:   high
Surface:    specs/005-document-primitives/spec.md — FR-006 (committed-working-tree precondition), FR-010 (uncommitted-target validation-failure case), Edge Cases ("Archive file missing on first archive"; "`--apply` requested against an uncommitted target"), SC-003(i)

FR-006 states the precondition two ways that diverge on the archive file's first-run state. The strong form: *"the target live document **and** its sibling archive file MUST be **committed (clean)** in version control."* The weak form, one clause later: *"if **either** has **uncommitted changes**, `--apply` **fails loud**."* On the **first archive**, the sibling archive file **does not exist** — the "Archive file missing on first archive: created with frontmatter" edge case and FR-006 itself (*"created with frontmatter if absent"*) explicitly require first-archive to succeed. But an absent file *cannot be "committed (clean)"*: under the strong form a literal `requireCommitted(archivePath)` throws (the file is not in HEAD), so `--apply` fails loud and the archive is never created — directly breaking US1 Acceptance Scenario 1 and SC-001 on any repo where the archive doesn't yet exist (i.e. every project's *first* archive). The weak form ("uncommitted *changes*") arguably passes an absent file but then leaves the **untracked-archive** case undefined: after a first `archive --apply` the operator has an untracked archive file; a second `archive --apply` before committing sees an untracked file — is that "uncommitted changes" (fail loud) or "clean" (proceed)? The spec never says.

Blast radius is high because an unattended builder reading "the sibling archive file MUST be committed (clean)" as the operative rule will gate the headline P1 verb on a file that does not exist yet, and the feature's smallest shippable slice (US1, "move settled items out in a single command") fails on first use with a confusing "commit `<archive>` before --apply" for a file the operator never created. The two formulations need to be reconciled into one rule that explicitly classifies the **absent** archive (permit — first archive creates it) and the **present-but-untracked** archive (decide and state which), distinct from the **modified-tracked** archive (fail loud). A reasonable fix: scope the precondition to *tracked content that differs from HEAD* and state that an absent or first-creation archive file satisfies it.

## 2026-06-08 — audit-barrage lift (20260608T022214546Z-document-primitives-after_plan)

### AUDIT-20260608-20 — No "postamble" region — trailing non-Unit prose after the Unit sequence is a fail-loud parse failure, which breaks conventional documents including the roadmap proof doc

Finding-ID: AUDIT-20260608-20 (claude-01 + claude-02 + claude-03 + codex-01 + codex-02 + codex-03 + codex-04; cross-model)
Status:     fixed-8f0fe62b
Severity:   high
Surface:    specs/005-document-primitives/spec.md — FR-002 (two-region model + "A block the grammar does not account for … is a parse failure"), FR-013(b) (roadmap proof doc), Key Entities (Governable Document)

FR-002 commits to a closed two-region model: *"a governable document has exactly two regions, in order: an optional preamble (everything before the first Unit marker) followed by the Unit sequence (from the first reserved-level Unit marker onward)."* "Onward" means the Unit sequence runs to EOF, and FR-002 also states *"A block the grammar does not account for — after chrome excision and outside the document preamble — is a parse failure (FR-003)."* The combination has **no region for content that follows the last Unit**. Trace it for the **row-keyed roadmap**: the Unit sequence is the contiguous markdown table (a row is the Unit, and a row has no multi-block body). Any block after the table — a conventional `## Out of Scope`, an appendix, footnotes, a "naming convention" prose section — is not chrome, not preamble (preamble ends at the first Unit), and not a row → **fail-loud parse failure**. The same is true for the heading-keyed inbox: a `##` section after the first `###` Unit is explicitly a fail-loud parse failure (the shallower-after-first-Unit rule). So **both** grammar shapes forbid trailing document-level prose, but the spec only ever frames this as the heading-keyed interleaving case and never decides it as a document-level policy.

This matters because the feature's own proof document is a roadmap, and real roadmaps in this very repo (`stack-control-roadmap.md`) carry trailing prose sections (a "vision §", a "naming convention §"). An unattended builder reading FR-002 literally will make trailing prose a parse failure, and the migrated `ROADMAP.md` will either fail to parse or force the author to hoist every non-Unit section *above* the table — an awkward, unstated constraint that contradicts ordinary markdown document structure. The spec should make an explicit decision: either define a third **postamble** region (content after the last Unit, preserved verbatim like the preamble), or state plainly that *all* non-Unit prose must precede the Unit sequence (so trailing sections are a parse failure by design and authors must restructure). Leaving it implicit means the default-built behavior breaks the documents the feature exists to govern.

## 2026-06-08 — audit-barrage lift (20260608T022334529Z-document-primitives-after_plan)

### AUDIT-20260608-21 — Detectability promise is impossible-as-stated: the `curate` coherence check (ledger vs archive only) structurally cannot detect a live-document-only interruption, yet the spec promises *any* interruption inconsistency is "detectable" via that check

Finding-ID: AUDIT-20260608-21 (claude-01 + claude-02 + claude-03 + codex-01 + codex-02 + codex-03; cross-model)
Status:     fixed-8f0fe62b
Severity:   high
Surface:    specs/005-document-primitives/spec.md — FR-006 (scoped durability promise), FR-010, SC-003(ii), partway-write Edge Case

The scoped durability promise makes a *two-part* claim everywhere it appears: an interruption is **recoverable** (revert to last commit) **AND detectable** — "the `curate` coherence check detects such inconsistency and surfaces it as a NOTICE" (FR-006), "the `curate` coherence check detects it and surfaces it as a NOTICE" (FR-010), and SC-003(ii) makes detectability a *measurable* criterion: "after a simulated interruption the `curate` coherence check reports the ledger/archive mismatch as a NOTICE." But FR-006 defines that coherence check as ledger-vs-archive only: it "cross-references each **ledger** identifier against the **structural markers present in the archive file**." It never inspects the live document.

Trace the interruption classes the deferred write protocol can produce. `archive --apply` cuts Units from the live document, appends them to the archive, and appends ledger entries. (1) If interrupted **after the live-document cut but before the archive/ledger writes**, the Units are gone from the live document and absent from both archive and ledger — ledger and archive remain perfectly coherent with each other, so the coherence check flags **nothing** while the live document has silently lost content. (2) `curate --apply` "reorders first, then archives"; an interruption **mid-reorder** corrupts the live document while the archive/ledger are untouched — again zero ledger/archive mismatch. (3) Because the coherence check is *ledger-driven* (it iterates ledger entries), an archive-written-but-ledger-not state leaves an orphan archive marker the check never visits. So the most dangerous outcome — live-document content loss — is precisely the **undetectable** one, and the spec promises the opposite. The recoverable half (revert) holds for all classes; the **detectable** half is over-strong. Worse, the spec defers the write ordering to implementation (plan.md), so no conforming mechanism can even be known to produce a detectable state — a deferred mechanism cannot underwrite a *universal* detectability promise.

Blast radius is high because SC-003(ii) is the artifact an unattended builder turns into a test: they will simulate one *favorable* interruption point (ledger/archive divergence), see the NOTICE, and ship a "detectable" guarantee the operator then trusts at the exact point it fails. A reasonable fix: drop "detectable via the coherence check" as a *universal* claim — scope detectability to ledger/archive divergence only, and state that live-document integrity relies on version-control recovery alone (the coherence check is not a content-loss detector).

## 2026-06-08 — audit-barrage lift (20260608T031332741Z-document-primitives-after_plan)

### AUDIT-20260608-22 — Block-level region model (preamble / Unit-sequence / postamble) has no home for a row-keyed grammar's table header & separator rows, where Units are sub-block

Finding-ID: AUDIT-20260608-22 (claude-01 + claude-02 + claude-03 + codex-01 + codex-02 + codex-03; cross-model)
Status:     acknowledged-deferred-impl-20260608
Severity:   high
Surface:    specs/005-document-primitives/spec.md — FR-002 (block-stream pipeline + three-region model + Unit-boundary rule), FR-006 (row-keyed archive structure), FR-013(b) (`<phase>/<slug>` roadmap proof doc), SC-005

FR-002 defines the entire region model over the **block stream**: *"a governable document has exactly three regions, in order: an optional preamble (everything before the first Unit marker), then the Unit sequence … then an optional postamble"* and *"A block the grammar does not account for … is a parse failure."* This model assumes Unit boundaries fall on **block boundaries** — natural for the heading-keyed inbox, where a Unit is a top-level `### Title` block. But the roadmap proof doc (FR-013(b)) is **row-keyed**, and a markdown table is a **single block**: the header row, separator row, and all data rows are one block in the block stream. The roadmap's Units are the **data rows — sub-block elements inside that one table block.** The region model never reconciles this: the "first Unit marker" for the roadmap is a row *inside* a block, so "everything before the first Unit marker" splits a single block (the table) down the middle — the table header + separator rows are before the first data-row Unit, but they are neither a separate block nor classified by any region rule. They are not chrome (FR-002 excises only the grammar comment + frontmatter), not Units (they don't match the Unit production), and not Unit bodies (bodies are *strictly-deeper headings*, a heading-keyed concept with no row analogue).

The blast radius is high because the roadmap is one of the two **mandatory** proof documents (FR-013) and SC-005 requires both to be *"governed by the same engine."* An unattended builder applying FR-002 literally has a genuinely plausible wrong path: treat each table row as a candidate Unit, find the header row does not match the Unit production, and emit *"a block the grammar does not account for → parse failure"* — failing a perfectly valid roadmap and breaking US2/SC-005 for proof instance #2. The competing correct path (silently treat table header+separator as preamble-equivalent) is never stated, so the builder is choosing between two readings with no disambiguator. A reasonable fix: FR-002 must state how the region model maps onto a row-keyed grammar — explicitly classify the table's header+separator rows (e.g. as part of the row-keyed grammar's structural chrome, excised like the grammar comment, or as a row-keyed "preamble" inside the table block) so the roadmap doesn't fail loud on its own column header.

## 2026-06-08 — audit-barrage lift (20260608T051821613Z-document-primitives-after_clarify)

### AUDIT-20260608-23 — `stackctl` does not install the runtime deps this feature now imports

Finding-ID: AUDIT-20260608-23
Status:     fixed-11077cc0
Severity:   high
Surface:    plugins/stack-control/bin/stackctl:3-9,64-70,118-143; plugins/stack-control/package.json:12-16; plugins/stack-control/src/document-model/block-stream.ts:10-11; plugins/stack-control/src/document-model/grammar-parse.ts:9; plugins/stack-control/src/document-model/grammar-resolver.ts:12

The feature adds runtime dependencies `markdown-it`, `peggy`, and `yaml` in `package.json`, and the document-primitives code imports them at runtime. But the adopter wrapper still says the only runtime dep is `tsx`, and `all_deps_installed()` only probes `tsx`. If a plugin install already has `tsx` and a version sentinel, or a partial local install has only `tsx`, the wrapper skips `npm install` and dispatches into code that immediately fails module resolution for `markdown-it`/`peggy`/`yaml`.

Blast radius is high because the new user-facing verbs are only reachable through this wrapper in adopter mode. A user can install the updated plugin and have every `archive`, `unarchive`, and `curate` invocation fail before the CLI starts, despite the package manifest being correct. The runtime-dependency probe and stale comment need to be updated to cover the actual declared runtime imports, or the sentinel must be invalidated when the dependency set changes.

### AUDIT-20260608-24 — Archived identifiers are not validated for the FR-005 invariant set

Finding-ID: AUDIT-20260608-24
Status:     fixed-11077cc0
Severity:   high
Surface:    plugins/stack-control/src/document-model/document.ts:48-53; plugins/stack-control/src/document-model/identifier-validator.ts:43-57; plugins/stack-control/src/document-model/unarchive-engine.ts:168-185

`loadDocument()` passes ledger identifiers into `validateIdentifiers()` only as the initial `seen` set. `validateIdentifiers()` checks readability, non-ordinal shape, and duplicate detection only for live Units as it iterates `units`; archived ledger identifiers are never checked for empty/opaque/ordinal values, and duplicate ledger entries collapse inside the `Set`. Then `unarchive` can locate an archived `F3`/UUID/etc. from the ledger, parse it, and write it back to the live document without re-running the full identifier validator on the lifted Unit.

Blast radius is high because FR-005 is presented as a document ∪ archive invariant, not just a live-document invariant. This means upgraded or hand-edited archives can carry invalid identities undetected, and `unarchive --apply` can reintroduce them into the live document even though the verb boundary claims to enforce identifier invariants end-to-end. A reasonable fix is to validate archived ledger identifiers with the same readable/non-ordinal/unique checks before returning from `loadDocument()`, and to reject duplicate ledger identifiers explicitly.

### AUDIT-20260608-25 — `curate --apply` can mutate the live document before an archive-side exit-2 failure

Finding-ID: AUDIT-20260608-25
Status:     fixed-11077cc0
Severity:   medium
Surface:    plugins/stack-control/src/document-model/curate-engine.ts:111-118; plugins/stack-control/src/document-model/archive-engine.ts:92-98; plugins/stack-control/README.md:62; plugins/stack-control/skills/curate/SKILL.md:41-44

`runCurate()` writes the reordered live document first, then calls `runArchive()`. But `runArchive()` can still throw a `DocumentModelError` before writing, for example the row-keyed column-schema mismatch check in `archive-engine.ts`. That error maps to the documented usage/config failure path, while the live document has already been changed by the reorder write.

Blast radius is medium: it takes a combined condition, such as a disordered roadmap plus an existing archive whose table schema no longer matches. But when it happens, the docs promise validation/config failures are fail-loud with zero writes, and `curate` has already rewritten the live document. A reasonable fix is to preflight the archive operation before writing the reorder, or compute both target outputs first and only write after every validation/config check has passed.

## 2026-06-08 — audit-barrage lift (20260608T052957249Z-document-primitives-after_clarify)

### AUDIT-20260608-26 — Row-keyed column indices are dual-sourced: declared in grammar metadata AND hardcoded in the PEG body — a project override that edits only the metadata silently breaks

Finding-ID: AUDIT-20260608-26 (claude-01 + claude-04 + codex-03; cross-model)
Status:     fixed-92a43781
Severity:   medium
Surface:    plugins/stack-control/grammars/roadmap.peg:3-5,30-31,41-44; plugins/stack-control/src/document-model/archive-file.ts:50,62-64; plugins/stack-control/src/document-model/unarchive-engine.ts:88-96; plugins/stack-control/src/document-model/types.ts:30-39

The row-keyed grammar declares `identifierColumn: 0` and `statusColumn: 3` in its YAML metadata header (`roadmap.peg:3-5`), and these are parsed into `GrammarSpec.unit` (`UnitMarker` row variant, types.ts:30-39). But the PEG body that actually parses the live document hardcodes the same indices as literals — `cell(id = r.text, 0)` and `cell(r.text, 3)` (roadmap.peg:30-31). The two must agree, yet they are two independent sources of truth in one file. Worse, the engine reads the *metadata* column for a DIFFERENT code path than the PEG: `archiveMarkerIds` and `unarchive`'s `locateInArchive` scan the archive table using `grammar.unit.identifierColumn` (archive-file.ts:50,62-64; unarchive-engine.ts:88-96), while the live-document parse derives the identifier from the PEG's hardcoded column 0.

For the shipped built-ins the indices coincide at 0/3, so nothing breaks today. The blast radius is for FR-012 project overrides — an explicitly first-class extension path (`.stack-control/grammars/<id>.peg`, resolver.ts:184-195). An override author editing the declarative metadata to, say, `identifierColumn: 1` would get a live-document parse that still identifies by column 0 (PEG), while archive-marker scanning and unarchive location use column 1 (metadata). The result is silent identity mismatch: `unarchive --id <x>` can't locate a row it just archived, and curate emits false coherence NOTICEs — with no error pointing at the cause. This is exactly the "configuration that should be data ending up as code" trap. A reasonable fix is to make the PEG read the columns from a parameter the engine injects (peggy supports passing options into `parser.parse(input, { startRule, ...})` / initializer globals), or to drop the metadata `statusColumn`/`identifierColumn` fields entirely and treat the PEG as the sole authority, documenting that override authors must edit the PEG body.

### AUDIT-20260608-27 — FR-011 anti-coupling gate scope omits the shipped entry point (bin/stackctl) and src/cli.ts — the gate's "zero predecessor references in the shipped mechanism" guarantee is narrower than the spec asserts

Finding-ID: AUDIT-20260608-27 (claude-02 + codex-02; cross-model)
Status:     acknowledged-2026-06-08
Disposition: FR-011's match scope is deliberately the 005 mechanism (document-model/verbs/skills/grammars/fixtures). The `dw-lifecycle` tokens in `src/cli.ts` + `bin/stackctl` are accurate 003 front-door lineage/provenance comments, out of the gate's declared scope by design; rewording would erase correct provenance the spec permits. Spec/gate scope tension noted; the scope clause is authoritative.
Severity:   medium
Surface:    scripts/check-no-predecessor-refs.sh:51-60; plugins/stack-control/bin/stackctl:6,14-16; plugins/stack-control/src/cli.ts:37-40

The gate's `SCOPE` array scans `src/document-model`, the three document verb files, the three skill dirs, `grammars`, and the fixtures dir (check-no-predecessor-refs.sh:51-60). It does NOT scan `bin/stackctl` or `src/cli.ts`. But `bin/stackctl` — the actual shipped entry point of the mechanism — contains a literal `dw-lifecycle` token: "Mirrors plugins/dw-lifecycle/bin/dw-lifecycle's resolution order" (bin/stackctl:6). FR-011/SC-006 state the *shipped product mechanism* contains zero predecessor references, and the spec's only carve-out is the two proof documents (ROADMAP.md / DESIGN-INBOX.md), not bin-wrapper comments.

The references in question are lineage comments and are functionally harmless, so this is low severity — but it is a genuine gap between what the gate enforces and what the spec claims. A green gate is being read as proof of FR-011 compliance (T039 marks SC-006 satisfied), while a `grep -rIE 'dw-lifecycle' plugins/stack-control/bin plugins/stack-control/src/cli.ts` returns a hit. Either the spec should explicitly exclude lineage comments in `bin/`/shared CLI plumbing (mirroring the proof-doc exclusion), or the gate scope should include `bin/stackctl` + `src/cli.ts` and the comments be reworded to drop the predecessor token. As written, the artifact and the gate disagree about coverage.

### AUDIT-20260608-28 — Accidental file committed at a bogus nested absolute-style path: `Users/orion/work/deskwork-work/stack-control/specs/002-parallel-execution-engine/plan.md`

Finding-ID: AUDIT-20260608-28
Status:     acknowledged-2026-06-08
Disposition: FALSE PREMISE (verified): no `Users/orion/...` re-rooted path exists in the repo (`find` over the tree returns nothing; no top-level `Users/` dir). The auditor hallucinated a re-rooted path from the untracked-file diff rendering of the pre-existing `specs/002-parallel-execution-engine/plan.md`.
Severity:   medium
Surface:    Users/orion/work/deskwork-work/stack-control/specs/002-parallel-execution-engine/plan.md (new file, entire); diff second hunk

The diff adds a new file whose repo-relative path is `Users/orion/work/deskwork-work/stack-control/specs/002-parallel-execution-engine/plan.md`. That is the *absolute* worktree path re-rooted under the repo, creating a spurious top-level `Users/` directory tree inside the repository. The content is an unfilled Spec Kit plan template (placeholders `[FEATURE]`, `[DATE]`, `[link]`, "Option 1/2/3 [REMOVE IF UNUSED]") for feature **002 (parallel-execution-engine)** — unrelated to the document-primitives (005) feature under audit.

This is almost certainly the byproduct of a botched command (a `>`/`mkdir -p` against `$PWD`-prefixed path, or a tool writing to an absolute path mis-joined onto the repo root). It is both a scope-leak (a 002 artifact riding in the 005 range) and a repo-hygiene defect (a junk `Users/...` directory). The intended file is the legitimately-tracked `specs/002-parallel-execution-engine/plan.md` shown as untracked in git status. Fix: delete the `Users/orion/...` path entirely; if a 002 plan stub is wanted, it belongs at `specs/002-parallel-execution-engine/plan.md` and not in this feature's commit range.

### AUDIT-20260608-29 — Placeholder Spec Kit plan file is included under an unrelated feature

Finding-ID: AUDIT-20260608-29
Status:     acknowledged-2026-06-08
Disposition: OUT OF 005 SCOPE: `specs/002-parallel-execution-engine/plan.md` is a pre-existing UNTRACKED blank /speckit-plan scaffold for the parked 002 feature (present at session start, never committed, not produced by 005). It entered the barrage payload only via govern's untracked-file fold. Not this feature's artifact to author/delete; left for the operator/002.
Severity:   medium
Surface:    specs/002-parallel-execution-engine/plan.md:1-113

The audited diff adds `specs/002-parallel-execution-engine/plan.md`, but the feature under audit is `document-primitives`. The file is an untouched Spec Kit template: `[FEATURE]`, `[DATE]`, `[Extract from feature spec...]`, `ACTION REQUIRED`, `NEEDS CLARIFICATION`, and `[REMOVE IF UNUSED]` placeholders remain throughout lines 1-113.

Blast radius is medium because this is not just stray prose: it creates or changes a feature artifact for `002-parallel-execution-engine` with placeholder guidance that future agents may treat as real planning state. A reasonable fix is to remove this file from the document-primitives change unless it was intentionally authored, and if intentional, replace every template placeholder with the actual 002 plan content before it lands.

## 2026-06-08 — audit-barrage lift (20260608T054029950Z-document-primitives-after_clarify)

### AUDIT-20260608-30 — Interrupted `--apply` archive leaves the document in a live↔ledger collision state that every verb fails loud on at load — the "recoverable" durability promise has no tooling-assisted recovery path

Finding-ID: AUDIT-20260608-30
Status:     acknowledged-2026-06-08
Disposition: MATCHES SPEC, not a defect. FR-010 promises recovery of an interrupted --apply via VERSION-CONTROL revert (commit before a mutating --apply); content is never lost (archive written first). A live↔ledger collision after an interrupted apply correctly fails loud at load (FR-005 uniqueness is a doc∪archive invariant). Tooling-assisted recovery (curate offering to drop the stale ledger+copy) is a future ENHANCEMENT beyond 005 scope, not a promise this feature makes. Filed mentally as a follow-up idea.
Severity:   medium
Surface:    plugins/stack-control/src/document-model/archive-engine.ts:140-152; plugins/stack-control/src/document-model/document.ts:48-52; plugins/stack-control/src/document-model/identifier-validator.ts:74-92

`runArchive` writes the archive file first (with the new ledger entry **and** the moved Unit content), then writes the live document (archive-engine.ts:148-151). The durability comment (archive-engine.ts:6-12) frames the interim crash state as "recoverable, never silently lost." It is true the content is not lost — but trace the *next* load: the archive now carries a ledger entry for `Shipped idea` while the live document still contains `### Shipped idea`. `loadDocument` seeds `validateIdentifiers` with the ledger ids (document.ts:48-52), and the still-live Unit then collides with the ledger id, throwing the FR-005 uniqueness violation (identifier-validator.ts:85-90). 

Because *every* verb (archive, unarchive, **and curate**) routes through `loadDocument`, all three fail loud on this state. The "fix it" tool — `curate` — cannot help: it throws at load before it can compose any reconciliation, and the live↔ledger collision is a hard fail-loud, not the soft `coherence-notice` path (curate-engine.ts:50-71 only covers ledger↔marker drift). The blast radius: the one scenario the write-ordering exists to handle gracefully (a crash between the two `writeFileSync` calls) leaves the document unloadable by the entire toolchain, recoverable only by manual file surgery. The narrow trigger window keeps this at medium, but the headline durability framing oversells the recovery story; a reasonable fix is for `curate` (or a dedicated recovery path) to detect a live-Unit-whose-id-is-also-in-the-ledger and offer to drop the stale ledger+archive copy, rather than fail loud with no assisted exit.

### AUDIT-20260608-31 — `curate` dry-run reports "would change (dry-run)" for documents whose only findings are informational (reconciliation seam / coherence NOTICE) — fires on the roadmap proof doc on every clean run

Finding-ID: AUDIT-20260608-31
Status:     fixed-ebcb45a8
Severity:   medium
Surface:    plugins/stack-control/src/subcommands/curate.ts:27-42; plugins/stack-control/src/document-model/curate-engine.ts:96-104

`runCurate` unconditionally pushes an `up-to-date-seam` finding whenever the grammar declares a reconciliation hook (curate-engine.ts:96-104), and the roadmap grammar (`roadmap.peg:13-15`) declares one. The CLI then branches purely on `report.findings.length` (curate.ts:28): a non-empty findings list that is *entirely* informational (the seam, or a `coherence-notice`) still prints `curate: would change (dry-run):` (curate.ts:37). For the `ROADMAP.md` proof document — well-formed, well-ordered, fully archived — `curate` will therefore **never** report the "clean — well-formed, well-ordered, properly archived" message the skill body tells the operator to stop on (`skills/curate/SKILL.md:24`). 

The seam finding's own message says "declared, **not yet executed**" — i.e. nothing changes — so labeling it "would change" is contradictory. The blast radius is an unattended agent (or operator) reading "would change (dry-run)" and concluding `curate --apply` is needed when the document is already correct, or conversely learning to ignore the header because it always fires. The CLI should classify findings into actionable (`disorder`, `unarchived-terminal`) vs. informational (`up-to-date-seam`, `coherence-notice`) and only emit "would change" when an actionable finding is present, surfacing the rest as notices. The existing `verb-curate.test.ts` only exercises disordered docs, so this messaging path is untested.

### AUDIT-20260608-32 — `case 'html_block'` in the block stream is unreachable with the default `new MarkdownIt()` (html:false); HTML blocks in document bodies normalize to paragraphs, and the block-stream test gives false confidence of HTML-block support

Finding-ID: AUDIT-20260608-32
Status:     fixed-ebcb45a8
Severity:   low
Surface:    plugins/stack-control/src/document-model/block-stream.ts:18,84-86; plugins/stack-control/tests/document-primitives/block-stream.test.ts:106-110

`block-stream.ts` constructs `const md = new MarkdownIt();` (block-stream.ts:18) with no options, so `options.html` is `false`. markdown-it's `html_block` rule returns early when `options.html` is false, meaning raw block HTML (`<div>…</div>`) is emitted as a **paragraph**, never an `html_block` token. The `case 'html_block':` arm (block-stream.ts:84-86) is therefore dead code in practice. 

The block-stream test's "HTML block maps to its full source line range" assertion (block-stream.test.ts:106-110) checks only `sourceOf(last)` (the line-range text), which is identical whether the lines render as `P` or `HTML` — so the test passes while the entry's `kind` is actually `P`, masking that the HTML path never executes. This is harmless today (no shipped grammar matches on `HTML` kind, and grammar comments are blanked by `blankChrome` before parsing), so the blast radius is low — but the dead arm plus the green-looking test create a false impression that HTML blocks are first-class in the stream. If a future grammar ever needs to distinguish HTML blocks, it will silently see paragraphs. Either enable `html: true` deliberately and assert on `kind` in the test, or drop the unreachable case and the misleading assertion.

### AUDIT-20260608-33 — `archive --apply` leaves accreting blank-line gaps that `curate` — the tidiness tool — never normalizes

Finding-ID: AUDIT-20260608-33
Status:     fixed-ebcb45a8
Severity:   low
Surface:    plugins/stack-control/src/document-model/archive-engine.ts:42-48; plugins/stack-control/src/document-model/curate-engine.ts:23-46

`liveWithout` removes exactly a Unit's span lines (head..last body line) but leaves the surrounding blank lines (archive-engine.ts:42-48). Archiving a heading-keyed Unit from the middle of a document therefore leaves both the blank line that preceded its heading and the blank line that followed its body, producing a double-blank gap; repeated archive/unarchive cycles accrete these. `curate`'s reorder path (curate-engine.ts:23-46) slices Units by span and re-joins with a fixed separator, but it only rewrites the live document when the *order* actually changes (`reorderedSource` returns `null` for an already-ordered doc, curate-engine.ts:26-29), so a well-ordered-but-blank-bloated document is never tidied.

The blast radius is purely cosmetic — the documents still parse and round-trip correctly (the canonical proof docs are row-keyed where rows are contiguous, so they don't exhibit it) — hence low. But `curate`'s stated purpose is "keep a live governed document lean and correct," and whitespace accretion from the primitive it composes (`archive`) is exactly the kind of drift an operator would expect `curate` to absorb. Worth either trimming the trailing/leading blank on cut, or having `curate` normalize consecutive blank runs between Units.

### AUDIT-20260608-34 — Runtime dependency sentinel still bypasses the expanded dependency probe

Finding-ID: AUDIT-20260608-34
Status:     fixed-ebcb45a8
Severity:   high
Surface:    plugins/stack-control/bin/stackctl:132-143

The fix for the new runtime deps expanded `RUNTIME_DEPS` to `markdown-it peggy yaml tsx`, but the version sentinel still short-circuits the probe entirely. If `node_modules/.deskwork-install-complete-0.37.0` exists from a prior install that only had `tsx`, lines 136-137 set `NEEDS_INSTALL=0` without calling `all_deps_installed()`, so the wrapper dispatches into code that imports `markdown-it`, `peggy`, and `yaml` and fails module resolution.

Blast radius is high because this is the adopter-mode entrypoint for every new verb. A reasonable fix is to treat the sentinel as a cache for “probe already passed for this dependency set,” not as a substitute for the probe, or key the sentinel by a dependency-set hash/package-lock hash instead of only the plugin version.

### AUDIT-20260608-35 — Invalid frontmatter YAML is swallowed and reclassified as “not governable”

Finding-ID: AUDIT-20260608-35
Status:     fixed-ebcb45a8
Severity:   medium
Surface:    plugins/stack-control/src/document-model/grammar-resolver.ts:155-168

`frontmatterRef()` catches YAML parse errors and returns `null`, so a document with a present but malformed frontmatter grammar declaration is reported as `document declares no grammar; not governable`. That is a silent fallback over a configuration parse failure, and it points the operator at the wrong repair: adding a grammar declaration, not fixing the broken YAML.

Blast radius is medium because valid docs are unaffected, but malformed governed docs fail with misleading diagnostics at the main verb boundary. A reasonable fix is to throw a `DocumentModelError` from the catch path when leading frontmatter exists but cannot be parsed, preserving the fail-loud contract with an actionable message.

## 2026-06-08 — audit-barrage lift (20260608T055058094Z-document-primitives-after_clarify)

### AUDIT-20260608-36 — Row-keyed `unarchive` can reinsert an archived row into a changed live table schema

Finding-ID: AUDIT-20260608-36
Status:     fixed-e44daeed
Severity:   medium
Surface:    plugins/stack-control/src/document-model/unarchive-engine.ts:92-100,168-185; plugins/stack-control/src/document-model/archive-engine.ts:114-120

`archive` explicitly guards row-keyed column-schema drift before appending to an existing archive: it compares the live table column count with the archive table column count and fails loud on mismatch. `unarchive` has no equivalent guard. It builds a mini document from the current live header plus the located archived row, parses it, then writes that row back to the live document without checking that the archived row has the same column count/schema as the current live table.

The blast radius is medium because this is a migration/manual-edit edge, but it can silently corrupt the live roadmap table: a 4-column archived row can be reinserted into a 5-column live table as long as the identifier/status columns still parse. A reasonable fix is to compare `tableCells(located.contentLines[0]).length` against the current live header cell count before writing, and fail loud with the same schema-mismatch class of error used by `archive`.

### AUDIT-20260608-37 — Declared identifier shapes are parsed but never enforced

Finding-ID: AUDIT-20260608-37
Status:     fixed-e44daeed
Severity:   medium
Surface:    plugins/stack-control/src/document-model/grammar-resolver.ts:88-95,142-151; plugins/stack-control/src/document-model/identifier-validator.ts:73-91; plugins/stack-control/grammars/roadmap.peg:12-13,38-42

The grammar metadata declares an identifier shape (`slug` or `title`), and the README says the grammar declares “its identifier shape.” But after `parseIdentifier()` stores `identifierProduction`, the validator only checks readability, ordinal denylist, opacity, and uniqueness. It never enforces the declared shape. For the built-in roadmap grammar, `identifier.kind: slug` plus comments describe `<phase>/<slug>`, but `roadmap.peg` accepts any text in the identifier column and derives `phase` with `id.split('/')[0]`.

The blast radius is medium: malformed roadmap IDs such as `impl` can pass the universal invariant checks and also pass ordering because `impl` is in the phase relation, even though they are not `<phase>/<slug>` codenames. That lets invalid governed rows archive/unarchive as legitimate Units. A reasonable fix is to validate `grammar.identifierProduction` in `validateIdentifiers` or during parse, with a concrete slug rule for row-keyed roadmap codenames.

### AUDIT-20260608-38 — Curate skill contains prohibited temporal deferred-work wording

Finding-ID: AUDIT-20260608-38
Status:     fixed-e44daeed
Severity:   low
Surface:    plugins/stack-control/skills/curate/SKILL.md:13

The curate skill’s up-to-date check explains that reconciliation execution belongs to “a separate, later capability.” The audit wrapper’s own constraints reject deferred-work phrasing as a bug-factory, and this is an operator-facing skill body that travels with the plugin install.

The blast radius is low because the behavior is otherwise clear: `curate` recognizes the seam and does not execute it. The risk is process hygiene rather than runtime correctness. A reasonable fix is to state the scope boundary without temporal wording, e.g. “reconciliation execution is outside this primitive.”

## 2026-06-08 — audit-barrage lift (20260608T060100517Z-document-primitives-after_clarify)

### AUDIT-20260608-39 — Order-key domain (FR-004) is validated at curate/unarchive but NOT at load/parse/archive — a roadmap row with an out-of-domain phase loads and archives silently

Finding-ID: AUDIT-20260608-39 (claude-01 + claude-03 + codex-01 + codex-02; cross-model)
Status:     fixed-63e4f239
Severity:   medium
Surface:    plugins/stack-control/src/document-model/grammar-parse.ts:118-140 (parseUnits — validates status vocabulary only); plugins/stack-control/src/document-model/document.ts:48-53 (loadDocument — no order-domain check); plugins/stack-control/src/document-model/archive-engine.ts:155-181 (runArchive); vs. curate-engine.ts:28 + unarchive-engine.ts:126 (the only `assertInDomain` call sites)

`parseUnits` fails loud when a Unit's `status` is outside the grammar's `statusVocabulary` (grammar-parse.ts:128-132, cited as FR-004), but it never validates that the Unit's `orderValue` is within the grammar's declared ordering relation. The only place the order-key domain is enforced is `assertInDomain`, called from `curate`'s `reorderedSource` (curate-engine.ts:28) and `unarchive`'s `insertIntoLive` (unarchive-engine.ts:126). `loadDocument` and `runArchive` do not call it. Concretely, a roadmap row like `| implementation/foo | … | … | planned |` passes the `CODENAME` shape check in `roadmap.peg` (two non-slash segments), derives `orderValue = 'implementation'`, has a valid status — and therefore loads cleanly and `archive --apply`s out without any error, because `implementation` is never compared against the declared relation `[design, plan, impl, multi]` on those paths.

The blast radius is medium: the same malformed document gives inconsistent signals across verbs. `archive` and a plain load accept it; `curate` and `unarchive` reject it as out-of-domain (T045 explicitly asserts curate fails loud here). An operator (or an unattended builder) who typos a phase can archive rows whose sort key is invalid, only discovering the FR-004 violation later when they happen to run `curate`. The "well-formed" gate the README and skill bodies promise is uniform ("every validation failure fails loud with zero writes") but the implementation's order-domain validation is not uniform — it's load-bearing for ordering verbs and absent for archive/load. A reasonable fix is to call `assertInDomain` for each Unit inside `loadDocument` (or `parseUnits`) so out-of-domain order values fail loud at the same boundary as status-vocabulary and identifier violations, making every verb reject the document consistently.

---

### AUDIT-20260608-40 — AUDIT-35 fix can mis-fire in the inverse direction: a non-governable doc whose leading `---…---` is a thematic break (not YAML frontmatter) now fails loud as "malformed frontmatter YAML"

Finding-ID: AUDIT-20260608-40
Status:     acknowledged-2026-06-08
Disposition: Inherent markdown frontmatter-vs-thematic-break ambiguity: a doc opening with `---` is frontmatter by convention, so failing loud on malformed YAML there is the correct default (the alternative is the AUDIT-35 silent-swallow bug just fixed). A doc intending a top-of-file thematic break should not lead with a bare `---` fence. No clean general disambiguation; over-fire on this rare edge is acceptable.
Severity:   low
Surface:    plugins/stack-control/src/document-model/grammar-resolver.ts:155-168 (frontmatterRef catch → throw); plugins/stack-control/src/document-model/chrome.ts:47-53 (detectFrontmatter treats any leading `---`…`---` as frontmatter)

`detectFrontmatter` classifies *any* document whose first non-blank line is `---` and that has a later `---` as having a frontmatter block (chrome.ts:47-53) — it cannot distinguish YAML frontmatter from a Markdown thematic break (`---`) that legitimately opens a document. The AUDIT-35 fix made `frontmatterRef` *throw* a `DocumentModelError` when that span fails YAML parsing (grammar-resolver.ts:160-167), on the premise that present-but-broken frontmatter should be surfaced rather than swallowed. The inverse hazard: a document that is genuinely not meant to be governed, but happens to begin with a `---` rule followed by prose that isn't valid YAML (e.g. a line with multiple colons), now fails loud with "fix the frontmatter YAML (this is a parse failure, not a missing grammar)" — pointing the operator at frontmatter they never wrote.

The blast radius is low because the verbs are invoked only on documents the operator intends to govern, so the realistic trigger window is narrow, and the existing tests pin the intended malformed-governed-doc behavior. But it's the symmetric misdirection of the very bug AUDIT-35 closed: AUDIT-35 traded "malformed governed doc reported as ungovernable" for "ungovernable doc with a leading thematic break reported as malformed frontmatter." A more precise fix would gate the throw on the frontmatter block actually looking like a YAML mapping (e.g. only throw when the parsed value is a non-null object that failed, or when a `doc-grammar`-like key is detectably present-but-broken), so a bare thematic-break opener still resolves to "not governable" rather than a YAML-repair error.

---

### AUDIT-20260608-41 — ROADMAP contains temporal deferred-work wording for the reconciliation seam

Finding-ID: AUDIT-20260608-41
Status:     fixed-63e4f239
Severity:   low
Surface:    plugins/stack-control/ROADMAP.md:12-14

The proof roadmap describes the reconciliation hook with temporal capability wording on line 13. Prior AUDIT-38 fixed the same class in the curate skill, but this operator-facing governed proof document still carries the pattern.

Blast radius is low: runtime behavior is clear, and `curate` still recognizes the seam without execution. The risk is process hygiene in a shipped governed document. Reword the sentence as a scope boundary, e.g. state that roadmap-discipline reconciliation plugs into this seam and that `curate` recognizes the seam without executing it.

## 2026-06-08 — audit-barrage lift (20260608T060906976Z-document-primitives-after_clarify)

### AUDIT-20260608-42 — Re-rooted absolute path `Users/orion/.../plan.md` is actually present in the payload — the very artifact AUDIT-28 dismissed as hallucinated

Finding-ID: AUDIT-20260608-42
Status:     acknowledged-2026-06-08
Disposition: FALSE PREMISE (verified): the `Users/orion/...` string occurs in the payload ONLY as quoted prose inside AUDIT-28 in the audit-log, which is itself part of the diff (5 grep hits, all in audit-log content). `find` confirms no such path on disk. Self-referential artifact of the audit-log being in the barrage payload — re-discovers the prior finding's quoted path. AUDIT-28's false-premise disposition stands. (The real untracked file is the relative-path blank 002 scaffold per AUDIT-29 — govern untracked-fold noise, out of 005 scope.)
Severity:   medium
Surface:    `Users/orion/work/deskwork-work/stack-control/specs/002-parallel-execution-engine/plan.md` (new file, entire — second diff hunk after the `---` separator); cross-ref docs/1.0/001-IN-PROGRESS/document-primitives/audit-log.md AUDIT-20260608-28

The audited diff adds a new file at the repo-relative path `Users/orion/work/deskwork-work/stack-control/specs/002-parallel-execution-engine/plan.md` — the *absolute worktree path re-rooted under the repo root*, creating a spurious top-level `Users/` directory tree inside the repository. The content is an unfilled Spec Kit plan template (`[FEATURE]`, `[DATE]`, `ACTION REQUIRED`, `NEEDS CLARIFICATION`, `[REMOVE IF UNUSED]`) for feature **002 (parallel-execution-engine)** — unrelated to the 005 document-primitives feature under audit. This is the byproduct of a botched write (a `$PWD`-prefixed path mis-joined onto the repo root). Note the legitimately-intended file already exists untracked at the correct `specs/002-parallel-execution-engine/plan.md` (git status: `?? specs/002-parallel-execution-engine/plan.md`), so this is a *second, junk copy*.

The blast radius is medium and compounding: the prior governance round recorded AUDIT-20260608-28 with disposition "FALSE PREMISE (verified): no `Users/orion/...` re-rooted path exists in the repo … The auditor hallucinated a re-rooted path." That dismissal is now contradicted by the diff's own contents — the re-rooted path *is* in the payload. If this gets `git add -A`'d it commits a permanent junk `Users/...` tree (a 003/002 scope-leak riding in the 005 range, and a repo-hygiene defect that violates the project's file-handling discipline). The fix is to delete the `Users/orion/...` path entirely (the real 002 stub already lives at `specs/002-parallel-execution-engine/plan.md`), and to correct the AUDIT-28 disposition since its "no such path exists" premise no longer holds.

### AUDIT-20260608-43 — `curate` prints "clean — well-formed, well-ordered, properly archived" even when a coherence-notice (real ledger↔archive drift) is the only finding

Finding-ID: AUDIT-20260608-43
Status:     fixed-c1c75589
Severity:   low
Surface:    plugins/stack-control/src/subcommands/curate.ts:69-76 (the `actionable.length === 0` branch); plugins/stack-control/skills/curate/SKILL.md:36 (the "clean → nothing to do; stop" instruction); plugins/stack-control/src/document-model/curate-engine.ts:48-69 (coherence-notice generation)

The AUDIT-31 fix correctly classifies `up-to-date-seam` and `coherence-notice` as informational so an informational-only dry-run prints "clean" rather than "would change." But the "clean" headline string is `clean — well-formed, well-ordered, properly archived`, and it fires unconditionally when no *actionable* finding is present — including when a `coherence-notice` is present. A coherence notice is not cosmetic: `coherenceFindings` emits "archive contains a Unit marker '<id>' with no ledger entry" (curate-engine.ts:60-65), which means an archived Unit exists that `unarchive` cannot locate (its ledger entry is gone) — i.e. a unit that is effectively unrecoverable. Printing "properly archived" as the headline directly contradicts that notice.

The blast radius is low because the notice text *is* still printed on the lines below the headline (curate.ts:71-73), so a careful operator sees it. The trap is for the skimming operator: SKILL.md:36 instructs "clean → nothing to do; stop," so an operator who reads only the "clean — properly archived" headline concludes the document is fine and stops, missing a genuine drift signal that may indicate lost archive data. A more precise fix would suppress or qualify the "properly archived" clause when `informational` contains any `coherence-notice` (e.g. "clean — well-formed and well-ordered; NOTE: N coherence issue(s) below"), so the headline never asserts a property the notices below it contradict.

### AUDIT-20260608-44 — What I checked that came back clean

Finding-ID: AUDIT-20260608-44
Status:     acknowledged-2026-06-08
Disposition: Informational — the auditor's "what I checked that came back clean" notes section, not a finding. No action.
Severity:   informational
Surface:    plugins/stack-control/src/document-model/* (engine), src/subcommands/* (verbs), grammars/*.peg, bin/stackctl

I specifically verified: (1) the block-stream span back-mapping (`toSpan`, `spanFor`) across setext/fence/table/list — the round-trip test pins exact line ranges and the indices are correct; (2) the AUDIT-33 blank-collapse in `liveWithout` — the `justCut` boundary logic drops exactly one seam blank and cannot touch blanks inside retained fenced code; (3) the symmetric column-schema guards in `buildArchive` (archive side) and `parseLifted` (unarchive side) — both compare live-header cells vs archived-row cells and fail loud with zero writes; (4) the AUDIT-39 load-time `assertInDomain` over every Unit, making `archive`/load reject out-of-domain order values consistently with curate/unarchive; (5) the `preflightArchive` ordering in `runCurate` — it surfaces archive-side validation before the reorder write, and the archive build is content-deterministic so the pre-reorder preflight stays valid post-reorder; (6) the bin/stackctl AUDIT-34 fix — the dependency probe is now authoritative and the sentinel is a non-overriding hint. Edge cases (zero-unit doc, archive→unarchive round-trip, locate failure, identity collision, fresh-install vs partial-install) are each pinned by a test. Had any of these had an off-by-one in the span map, a missing guard on the unarchive side, or a write landing ahead of a validation throw, I would have flagged it blocking/high; they don't.

### AUDIT-20260608-45 — Unterminated embedded grammar comments are silently reclassified as “not governable”

Finding-ID: AUDIT-20260608-45
Status:     fixed-c1c75589
Severity:   medium
Surface:    plugins/stack-control/src/document-model/chrome.ts:43-55; plugins/stack-control/src/document-model/grammar-resolver.ts:189-197

`findGrammarComments()` sees an opening `<!--`, scans for `-->`, and if no close is found it just `continue`s as “not chrome” at line 55. If that unterminated comment is a `doc-grammar:` declaration, `embeddedGrammar()` returns null, `frontmatterRef()` may also return null, and `resolveGrammar()` reports `document declares no grammar; not governable` at lines 195-197.

Blast radius is medium: a present but malformed embedded grammar declaration is a configuration parse failure, not absence of governance. This is the embedded-comment twin of the already-fixed malformed-frontmatter class, and it points the operator at the wrong repair. A reasonable fix is to detect an unterminated comment whose inner text begins with `doc-grammar:` and throw `DocumentModelError` naming the unterminated grammar declaration.

### AUDIT-20260608-46 — Row-keyed unarchive scans the archive table header as a candidate Unit row

Finding-ID: AUDIT-20260608-46
Status:     fixed-c1c75589
Severity:   medium
Surface:    plugins/stack-control/src/document-model/unarchive-engine.ts:73-82; plugins/stack-control/src/document-model/archive-file.ts:40-67

`archiveMarkerIds()` correctly excludes row-keyed chrome by ignoring rows until after the separator at lines 58-67. `locateInArchive()` does not use the same rule: it scans every pipe row, skips only separator rows, and returns the first row whose identifier column equals `--id` at lines 73-82. That means the header row is still considered a possible archived Unit.

Blast radius is medium because it needs a corrupted or hand-edited ledger entry, but row-keyed structural chrome is supposed to be uniformly excluded. With a custom row-keyed grammar whose identifier shape accepts title-like values, a ledger id equal to the header cell could cause `unarchive` to lift and reinsert the table header as content. The fix is to make `locateInArchive()` follow the same “past separator only” scan used by `archiveMarkerIds()`.

### AUDIT-20260608-47 — Naive table-cell splitting breaks row-keyed archive round-trips for escaped pipe cells

Finding-ID: AUDIT-20260608-47
Status:     fixed-c1c75589
Severity:   medium
Surface:    plugins/stack-control/src/document-model/archive-file.ts:8-11; plugins/stack-control/src/document-model/unarchive-engine.ts:105-109

Live parsing uses markdown-it table tokens, but archive-side helpers split raw markdown rows with `line.split('|')`. Markdown table cells can contain escaped pipes, e.g. `Scope with \| character`. Such a row can parse live and archive successfully, but `unarchive` later counts the archived row with `tableCells()` and sees an extra column, tripping the schema mismatch guard at lines 105-109.

Blast radius is medium: a valid row-keyed roadmap row can become impossible to unarchive after being archived, despite no schema migration. A reasonable fix is to parse archive table rows with the same markdown-aware path used for live rows, or implement a table splitter that respects escaped pipes.
