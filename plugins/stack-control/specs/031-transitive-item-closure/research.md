# Phase 0 Research: Transitive item closure + the post-ship terminal stage

All decisions trace to the approved design record, the spec FRs, and the
`/speckit-clarify` Session 2026-06-23 answers. Each is **Decision / Rationale /
Alternatives**. Grounded against the live code (file:line) where it pins an
approach.

## R1 — Reuse `close-related` + `backend.close()`; add a `--cascade` traversal on top

**Decision**: The cascade is a traversal layer ON TOP of the existing single-node
closure. `close-related` (`src/subcommands/roadmap.ts:281` `emitCloseRelated`)
already: verifies terminal status, reads the node's `closes` ∪ `ref` set, loads the
backlog backend, and dry-runs/applies `backend.close(id, reason)`
(`src/backlog/backend.ts:364`). The transitive closer (`transitive-close.ts`)
computes the **set of nodes** to process (the `part-of` subtree) and the per-node
closure reuses the exact same `backend.close()` call.

**Rationale**: Closure is already idempotent and fail-loud at the single-node level
(`backend.close` re-sets `Done` + appends a reason; an unknown id throws). Reusing it
keeps one closure mechanism (no second path to drift), satisfies FR-004/FR-008's
idempotence, and confines the new logic to *traversal + plan assembly*.

**Alternatives**: A standalone closer duplicating the backend call — rejected (two
closure paths drift; violates the shared-mechanism intent already tested in
`close-related-shared-mechanism.test.ts`).

## R2 — `childrenOf(model, parentId)` mirrors `blocks()`; cascade is a visited-Set DFS

**Decision**: Add `childrenOf(model, parentId)` to `src/roadmap/graph.ts` —
`model.items.filter((i) => i.partOf.includes(parentId))` — mirroring the existing
reverse-edge helper `blocks()` (`graph.ts:74`, which filters on `dependsOn`).
`transitive-close.ts` walks from the root with a `visited: Set<string>` guard,
recursing into `childrenOf` of each visited node. Multi-parent / diamond graphs are
safe because a node is added to `visited` before its ids are collected (FR-002).

**Rationale**: `partOf` is already parsed as a multi-parent array
(`roadmap-model.ts:24,153`); the reverse-edge filter pattern is established. A
visited-Set is the standard cycle/diamond guard and gives termination.

**Alternatives**: `topoOrder()` (`document-model/edges.ts:92`) — rejected, it is for
`depends-on` blocking order, not non-blocking `part-of` grouping.

## R3 — Walk semantics: skip-and-report non-terminal; uniform terminal handling

**Decision** (from clarify): While walking, classify each node by status:
- **Terminal** (`shipped`/`cancelled`/`retired`/`closed`) → collect its `closes:` ids
  for closure. **Uniform**: `cancelled`/`retired` members' ids are closed too, with a
  reason string reflecting their terminal status (e.g. `closed via cascade from
  <root> (member cancelled)`), then the walk continues into their children (FR-007).
- **Non-terminal** (`planned`/`in-flight`) → **skip and report**: do NOT close its
  ids, surface it in the `CascadePlan` as a skipped child, and continue (FR-007a).
  A non-terminal child does not block the root's closure or its advance to `closed`.

**Rationale**: Directly encodes the operator's clarify answers. Keeps closure
non-blocking on in-flight siblings while still recording resolved/abandoned work
uniformly across terminal members. The closure-reason string keeps the audit trail
honest about *why* an id closed.

**Alternatives**: refuse-on-non-terminal and skip-cancelled — both rejected in
clarify.

## R4 — `closes:` population: a dedicated prose-set mutation, NOT `add-edge`

**Decision**: Add `closes-mutation.ts` exposing add/remove of ids in a node's
`closes:` set, surfaced as `roadmap resolves <node> --add … --remove …`. `closes` is
declared `references: prose` in `grammars/roadmap.peg:22`, so the unit-edge path
(`edge-mutations.ts:89` `addEdge` → `requireUnitRefField` at `:98`) correctly refuses
it. The mutation parses the existing comma-list (`roadmap-model.ts:141`), applies a
set union/difference, and rewrites the `- closes: a, b, c` body line (dry-run/apply).

**Rationale**: Respects the deliberate prose-vs-unit-edge distinction (do not loosen
`add-edge` to accept prose fields — that would blur the auditable edge model). A
focused mutation keeps the comma-list canonical (trimmed, deduped, stable order).

**Alternatives**: extend `add-edge` to accept prose fields — rejected (collapses the
edge/prose distinction the grammar makes intentionally). Hand-edit — the status quo
this feature removes.

## R5 — Parent-node ref stored as a task notes linkage line (reuses the promotion-linkage precedent) — resolves OQ-3

**Decision**: The optional task→parent-node ref is stored as a structured linkage
line in the backlog task's implementation notes (e.g. `Node: <roadmap-id>`),
read via the backend's `rawNotes` and written via `appendNotes` /`setNotes`
(`backend.ts:54,58,88`). `backlog promote` sets it as part of recording the
promotion linkage (it already writes a linkage line, with an unpromote strip at
`backend.ts` 028 path); `backlog capture` MAY accept an optional `--node` to set it;
`backlog done` reads it and, when present, calls the `closes-mutation` add to
back-link the closing id into that node's `closes:`.

**Rationale**: A notes linkage line is the established mechanism (promotion already
uses one, with a documented strip path), so the parent-node ref needs no new task
schema and is auditable in the task file. Absence of the line ⇒ no back-link
(FR-011, a no-op, never an error).

**Alternatives**: a first-class structured field on the task — rejected (backlog.md
tasks expose notes, not arbitrary fields; `list --plain` hides notes, D6, but the
backend already reads the task-file body for notes). A roadmap-side reverse index —
rejected (duplicates state; the notes line is the single source).

## R6 — Terminal stage: add `closed` to the grammar + WORKFLOW.md; derive status→phase BY NAME

**Decision**:
- `grammars/roadmap.peg:6-7`: add `closed` to `statusVocabulary` AND
  `terminalStatuses` → `[shipped, cancelled, retired, closed]`.
- `templates/WORKFLOW.md`: add `phase:closed` after `phase:shipped` (terminal: no
  `next`), and a `shipped → closed` transition whose effect is the operator-confirmed
  cascade (carried by `advance --to closed`).
- `src/workflow/phase-derivation.ts`: **retire** the `status === 'shipped' → last
  phase` special-case (`phase-derivation.ts:87-95`) and replace it with a
  status→phase **by-name** map, so `shipped` derives to `phase:shipped` and `closed`
  to `phase:closed`. `shipped` is therefore no longer treated as terminal; the
  lifecycle surfaces `closed` as the pending next move (FR-013).
- `src/workflow/compass.ts`: `shipped → closed` is a legitimate next move; entering
  `closed` from any non-`shipped` phase is refused (FR-015).

**Rationale**: The by-name mapping is the clean-break replacement (per the
zero-back-compat rule — the old special-case is deleted, not kept as a fallback). The
terminal-status set is grammar-derived (`close-related` reads
`model.doc.grammar.terminalStatuses` at `roadmap.ts:285-291`), so adding `closed`
there makes `close-related`/`advance` accept it uniformly.

**Alternatives**: a second phase `validating` before `closed` — rejected in design
(operator-confirm guard, not a validation phase). Keep `shipped` terminal + bundle as
transition effects — rejected in design (skippable).

## R7 — Operator-confirm surface: `advance --to closed` (settled); driving skill — OQ-4

**Decision** (from clarify, FR-016): `advance --to closed` IS the confirm surface —
dry-run presents the full `CascadePlan`; an explicit `--apply` runs the cascade and
sets status `closed`. It never auto-fires. `src/roadmap/mutations.ts:199` `advance`
gains a `closed`-specific arm that invokes `transitive-close` (dry-run/apply).

**OQ-4 (carried)**: the operator-facing *skill* that drives `advance --to closed`
(and, for self-hosting, prompts "validate the installed plugin" first). Recommended:
a small `/stack-control:close` skill (skill body + the verb, per
`enforcement-lives-in-skills.md`) surfaced from session-end / the release tail; the
exact home is decided at `tasks`. Not load-bearing for the engine work.

**Rationale**: One verb, one operator-confirmed action; the lifecycle advance and the
closure are the same move. Reuses the dry-run/`--apply` discipline.

**Alternatives**: dedicated `close-related --cascade` + separate manual advance —
rejected in clarify (two moves). Auto-fire on graduate — rejected (no automatic
closure).

## R8 — Deadlock dissolution is structural, nothing to build — confirms FR-018

**Decision**: There is no post-install validation task or criterion anywhere in the
workflow; the only post-ship validation is the operator-confirm guard at close time.
So no code "prevents" the deadlock — it is impossible by construction. The plan adds
NO validation criterion to any phase (FR-017) and NO `tasks.md`-resident validation
step.

**Rationale**: The design's whole point — install-agnostic, operator-confirm-only —
means the deadlock cannot be expressed. Building an anti-reintroduction guard (the
dropped OQ1) is out of scope unless the operator asks; the absence is the fix.

**Tensions surfaced**: none. The design record and spec agree; clarify resolved the
three forks without contradicting the design. The only carried residuals (OQ-3
storage detail, OQ-4 skill home) are precision/wiring, not direction.
