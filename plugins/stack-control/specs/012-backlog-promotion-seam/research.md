# Research: Backlog → Feature-Rigor Promotion Seam

Phase 0 decisions. Each resolves a plan-phase open question grounded in the existing code.

## D1 — Shared promote primitive vs separate per-tier verb (FR-011)

**Decision**: **Separate per-tier promote.** The backlog promote is its own implementation against the backlog.md task-file model; it shares the *contract* with the inbox promote (record-don't-create, a machine-greppable backlink bullet, a `promoted` status marker, a terminal-state guard, dry-run-by-default) but **not** the implementation.

**Rationale**: The inbox `promote` (`src/inbox/mutations.ts`) operates on a **governed document** — it rewrites a grammar-specific `- **Status:** **<s>**` bullet in the heading-keyed DESIGN-INBOX document and re-validates the whole document through the document-primitives engine (`loadDocument`). The backlog is a **different substrate**: one `backlog.md` task file per item (frontmatter + body), mutated through the `backlog.md` CLI via `spawnSync` (`src/backlog/backend.ts`), with no document-primitives grammar. A shared primitive would have to abstract over two incompatible storage models — exactly the speculative abstraction Constitution Principle II forbids. Sharing the *contract* (not the code) keeps both tiers consistent for the operator while each stays simple.

**Alternatives considered**: (a) Extract a `promote` core both call — rejected: forces a storage abstraction over governed-doc vs backlog.md-CLI, more code, more coupling. (b) Make the backlog a governed document too — rejected: out of scope, large migration, the backlog.md CLI is the deliberate backlog substrate.

## D2 — Linkage representation (FR-003, FR-007)

**Decision**: Record the graduation target on the backlog item as a body bullet `- **Promoted-to:** <target-ref>` (mirroring the inbox's canonical `Promoted-to:` bullet) plus a `promoted` marker (see D3). The `<target-ref>` is a typed reference string: `spec:specs/NNN-slug`, `tasks:specs/NNN-slug` (a task added to that feature's tasks.md), or `roadmap:<phase>:<kind>/<slug>`.

**Bidirectional (FR-007)**: record-only means promote writes the **backlog-side** link now. The **target-side** back-reference is written when the target is created (the separate operator step): a new spec records the origin in its Context (as this very spec does — "originating issue / backlog item"); a roadmap node carries the backlog ref in its node body; a tasks.md task line references the backlog `TASK-<n>`. The plan does NOT have promote reach into the target (record-only) — it documents the convention so the human/agent creating the target completes the back-reference. SC-003 (bidirectional navigability) is satisfied by convention + the documented seam, not by promote mutating the target.

**Rationale**: Reuses the inbox's proven, greppable bullet form; the typed ref keeps the three target kinds unambiguous; record-only keeps promote decoupled from the creation subsystems (D1, FR-004).

## D3 — `promoted` status marker on a backlog.md item (FR-003, FR-006)

**Decision**: backlog.md's native statuses are `To Do` / `In Progress` / `Done` (configured in the store's `config.yml`). Rather than overload a native status, mark promotion with a **label** `promoted` (alongside the existing `agent-found` project label and `type:<bug|gap>` label), set via the backlog backend, and the `Promoted-to:` body bullet (D2) as the canonical linkage. The terminal guard (FR-006) checks for the `promoted` label.

**Rationale**: Native statuses model work progress (not-started → done); promotion is an orthogonal graduation event, so a label is the honest representation and avoids forcing a false "Done". Labels are how the backlog already carries provenance (`agent-found`, `type:*`, `gh-<n>`) — consistent. Re-promotion (FR-006) is guarded by detecting the existing `promoted` label/bullet → refuse with a clear message, zero write.

**Alternatives considered**: a new native status `Promoted` in config.yml — rejected: changes the store schema for all items, conflates progress with graduation, and re-promotion/idempotency is harder to reason about than a label check.

## D4 — Target validation under record-only (FR-002, edge: missing target)

**Decision**: promote parses + shape-validates the `<target-ref>` (correct kind prefix + well-formed path/id) but does **not** require the target to exist on disk (record-don't-create, mirroring inbox which does not validate the target). If the target path does not yet exist, promote records the link and **reports** it (advisory line), so the operator knows the create step is still pending. A malformed ref (unknown kind, empty) is a usage error → exit 2, zero write.

**Rationale**: Matches the inbox precedent and the record-only contract; surfaces the pending-create without blocking; keeps fail-loud for genuinely malformed input.

## D5 — Batch granularity (FR-005)

**Decision**: Single-item is the base; batch is N item-ids promoted to **one** existing-feature `tasks.md` target in a single invocation (all-or-nothing: if any item is missing/terminal, the whole batch is refused before any write). Batch is only meaningful for the `tasks:` target (grouping related items into a feature); `spec:` / `roadmap:` are single-item (one item seeds one feature/node).

**Rationale**: Matches the operator's "single + batch" clarify answer and the natural shapes (a feature gathers many tasks; a new feature/node is seeded by one item). All-or-nothing preserves the no-partial-write guarantee (SC-002).

## D6 — How an existing backlog item is mutated (resolves analyze finding A1)

**Decision**: Add an `edit()` method to `BacklogBackend` (currently only `create` / `list` / `exists`) that shells the **verified** `backlog.md` CLI `task edit` command:
- `--add-label promoted` — sets the marker (D3), **additively** (no clobber of existing `agent-found` / `type:*` / `gh-<n>` labels — satisfies FR-013).
- `--append-notes "Promoted-to: <target-ref>"` — records the linkage (D2), **additively** (appends; preserves the existing body).

Verified against `backlog.md@1.46.0`: `backlog task edit [taskId]` exposes `--add-label`, `--remove-label`, `-d/--description`, `--append-notes`, `--comment`. The two additive flags (`--add-label`, `--append-notes`) give a clean record-only mutation with **no read-modify-write** (which would risk clobbering concurrent edits).

**Why this matters**: the original plan said "backend reused as-is (write labels)" — but the backend had no mutation path at all. This decision names the real mechanism so implementation does not discover the gap mid-stream. The idempotency guard (D3/FR-006) reads the item's frontmatter labels **directly from the task file** (as `exists()` already does — `list --plain` exposes neither labels nor refs), detecting an existing `promoted` label before any `edit()`.

**Alternatives considered**: (a) `-d/--description` rewrite — rejected: replaces the body, requires read-modify-write, risks clobbering. (b) direct frontmatter/body file rewrite bypassing the CLI — rejected: the backlog.md CLI owns the task-file format (backend.ts:3); bypassing it is the kind of format-coupling the backend exists to avoid.
