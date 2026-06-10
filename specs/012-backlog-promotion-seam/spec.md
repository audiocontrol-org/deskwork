# Feature Specification: Backlog → Feature-Rigor Promotion Seam

**Feature Branch**: `feature/stack-control` (program single-branch; spec dir `012-backlog-promotion-seam`)

**Created**: 2026-06-10

**Status**: Draft

**Input**: User description: "Backlog → feature-rigor promotion seam for stack-control. The lightweight backlog and the spec-driven feature rigor never reference each other; there is no documented or mechanized seam to promote a backlog item into the feature rigor. The inbox already has a `promote` verb (record-don't-create); the backlog never got one. Capture the full design space and the two-tier cross-reference documentation."

## Context (problem being solved)

stack-control carries two work-tracking tiers that today never reference each other:

1. **The backlog** (`stackctl backlog`) — agent-found findings and work-items, one `backlog.md` task file each under the installation's backlog store, optionally carrying a `gh-<n>` backlink ref. Subactions today: `capture`, `list`, `import-github`, `import-slush`. There is no `promote`.
2. **The feature-rigor tier** — Spec Kit specs authored and run via `/stack-control:define` and `/stack-control:execute` (specify → clarify → plan → checklist → tasks → analyze → implement → govern), tracked in the governed roadmap DAG (`stackctl roadmap`).

The **inbox** tier already established the pattern: `stackctl inbox promote --to <spec-dir|roadmap-id|issue-ref>` records a graduation target as a `Promoted-to:` body bullet and sets the entry's status to `promoted` — explicitly *record, do not create* (creating the target is a separate operator step via the existing creators). The backlog never got an equivalent, so the only path from a backlog item into the feature rigor is manual, and it leaves the item's thread dangling: nothing links the backlog item to the resulting spec, roadmap node, or feature task, and nothing in the feature tier points back at its originating backlog item.

This feature closes that seam and documents the two-tier relationship so the tiers reference each other.

## Clarifications

### Session 2026-06-10

- Q: Which graduation targets should backlog promote support? → A: Three targets, chosen per the nature of the backlog item — a new Spec Kit feature spec, a task inside an existing feature's `tasks.md`, and a roadmap node. (A GitHub-issue round-trip target is out of scope — see Non-Goals.)
- Q: Should promote create the target, or only record the linkage? → A: Record-only, mirroring the inbox `promote` precedent (creation is a separate operator step).
- Q: What promotion granularity? → A: Both — a single item → a new feature / roadmap node, AND batching N related items into one existing feature's `tasks.md`.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Promote a backlog item into the feature rigor with a recorded linkage (Priority: P1)

An operator triaging the backlog decides a work-item deserves the full spec-driven treatment. They run a single promote command naming the backlog item and the graduation target. The verb records the linkage on the backlog item (a backlink to the target + a `promoted` marker) and reports what was recorded — without silently creating the target. The operator then creates the actual target with the existing creator (`/stack-control:define`, `roadmap add`, etc.) as a separate, deliberate step.

**Why this priority**: This is the seam itself — the minimum that turns "manually re-key a backlog item into a spec, losing the thread" into "one recorded, navigable promotion." It mirrors the proven inbox precedent and is independently valuable even before the bidirectional or batch refinements.

**Independent Test**: With a backlog item present, run promote against a target ref; assert the item now carries a backlink bullet to that target and a `promoted` marker, the verb is read-only with respect to the target (it creates nothing), and a dry-run reports the intended change without writing.

**Acceptance Scenarios**:

1. **Given** an open backlog item, **When** the operator promotes it to a target ref, **Then** the item records a backlink bullet naming the target and gains a `promoted` marker, and the verb creates no target artifact.
2. **Given** the same item, **When** the operator runs promote in dry-run, **Then** the intended change is reported and nothing is written to disk.
3. **Given** a backlog item that does not exist, **When** promote is run against it, **Then** the verb fails loud (non-zero exit, descriptive message) and writes nothing.

---

### User Story 2 - Promote a backlog item as a task inside an existing feature's tasks.md (Priority: P2)

An operator working an in-flight feature recognizes a backlog item belongs in that feature's scope. They promote the backlog item into the feature's `tasks.md` so it becomes a tracked task of that feature, with the task referencing the originating backlog item. This is the "per-feature tasks.md promotion seam" the originating issue named.

**Why this priority**: This is the second, distinct promotion shape (item → task within an existing feature) versus item → a brand-new feature. It is the half of the seam that makes the two tiers reference each other at task granularity, but it depends on US1's recorded-linkage mechanism existing first.

**Independent Test**: With an existing feature spec dir that has a `tasks.md`, promote a backlog item into it; assert the backlog item records the feature/task linkage and (per the bidirectional decision) the feature's `tasks.md` references the backlog item.

**Acceptance Scenarios**:

1. **Given** an existing feature with a `tasks.md` and an open backlog item, **When** the operator promotes the item into that feature, **Then** the backlog item records the linkage and is marked `promoted`.
2. **Given** a target feature whose `tasks.md` does not yet exist, **When** promote is run against it, **Then** the verb behaves per the record-vs-create decision (records the intended linkage and reports the missing target, or fails loud) — never a silent partial write.

---

### User Story 3 - The two-tier relationship is documented and cross-referenced (Priority: P2)

A new contributor (human or agent) reading the backlog docs can discover how a backlog item graduates into the feature rigor, and reading the feature/roadmap docs can discover that work may originate in the backlog. The documentation states the seam, the promotion targets, and the record-don't-create contract, so the two tiers explicitly reference each other.

**Why this priority**: The originating issue is as much about the *undocumented* seam as the missing mechanism — "the two tiers never reference each other." Documentation is independently valuable (it removes the discovery gap) and is testable as a doc-presence / cross-reference check.

**Independent Test**: Assert the backlog-tier docs reference the promotion seam and its targets, and the feature/roadmap-tier docs reference the backlog as an upstream origin, with both pointing at the same canonical description.

**Acceptance Scenarios**:

1. **Given** the shipped docs, **When** a reader consults the backlog documentation, **Then** it describes promotion into the feature rigor and links to the feature-tier docs.
2. **Given** the shipped docs, **When** a reader consults the feature/roadmap documentation, **Then** it references the backlog as a promotion origin.

---

### Edge Cases

- **Re-promotion**: promoting an already-`promoted` backlog item — refuse, skip idempotently, or update the linkage (mirror the inbox terminal-state guard).
- **Imported-issue items**: promoting a backlog item that originated from a GitHub issue (carries a `gh-<n>` ref and `imported-issue` type) — the existing ref and the new promotion linkage must coexist without collision.
- **Missing/legacy target**: promoting to a target ref that does not exist on disk — record-don't-create means this is allowed, but the verb should report it (the inbox does not validate the target).
- **Long titles**: a promoted item whose linkage or any derived artifact name must not reproduce the over-long-filename failure (filesystem 255-byte limit) seen historically.
- **Terminal backlog states**: promoting an item already at a `Done` / terminal state.
- **Empty / malformed backlog store**: promote run against a store with a malformed task file (must fail loud per the existing backlog error contract, not partially apply).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST provide a backlog-tier promotion action that graduates a named backlog item toward the feature-rigor tier, mirroring the inbox `promote` precedent.
- **FR-002**: The system MUST support promotion to three graduation targets, selected per the nature of the backlog item: (a) a new Spec Kit feature spec, (b) a task inside an existing feature's `tasks.md`, and (c) a roadmap DAG node. A GitHub-issue round-trip target is out of scope for this feature (see Non-Goals).
- **FR-003**: On promotion, the system MUST record the graduation target on the backlog item as a machine-greppable backlink and mark the item `promoted` (a status / label distinct from the existing type and `gh-<n>` ref labels).
- **FR-004**: The promotion action MUST be **record-only**, mirroring the inbox `promote` precedent: it writes the backlink + `promoted` marker on the backlog item and does NOT create the target — creating the target is a separate, deliberate operator step via the existing creator. It MUST NOT reimplement the target creators and MUST NOT silently partially apply.
- **FR-005**: The system MUST support **both** granularities: a single backlog item → a new feature spec or roadmap node, AND batching N related backlog items into one existing feature's `tasks.md`.
- **FR-006**: The system MUST be idempotent / guarded on re-promotion of an already-`promoted` item (refuse or no-op with a clear signal — not a duplicate / conflicting linkage), mirroring the inbox terminal-state guard.
- **FR-007**: The bidirectional linkage MUST be defined: the backlog item records its target, and the target (spec / roadmap node / tasks.md entry) SHOULD record the originating backlog ref so the link is navigable both ways. (Default assumption below; confirm in clarify.)
- **FR-008**: The action MUST be dry-run by default and write only under an explicit apply flag, consistent with the inbox / backlog / roadmap mutation verbs.
- **FR-009**: The action MUST fail loud (non-zero exit, descriptive message, zero write) on: a non-existent backlog item, a malformed backlog store, or a missing required argument — no fallback, no mock, no silent skip.
- **FR-010**: The capability MUST be exposed as a `stackctl` verb (the vendor-neutral core); any `/stack-control:*` skill MUST be a thin adapter that quotes the verb and adds no behavior the verb lacks.
- **FR-011**: The implementation relationship between the inbox `promote` and the backlog promotion MUST be decided (share one underlying promote primitive for DRY, or stay separate per-tier verbs). Captured here so it is not lost; this is largely a plan-phase concern and the operator may defer it to planning.
- **FR-012**: The documentation MUST describe the two-tier relationship: the backlog-tier docs reference the promotion seam and its targets; the feature / roadmap-tier docs reference the backlog as an origin. Both reference one canonical description (no drift).
- **FR-013**: The promotion action MUST preserve any pre-existing item metadata (type label, `gh-<n>` ref, body) — promotion augments, it does not overwrite.

### Key Entities *(include if feature involves data)*

- **Backlog item**: a `backlog.md` task file under the installation's backlog store; carries id (`TASK-<n>`), title, status, type label, optional `gh-<n>` ref, body. Promotion adds a graduation backlink + a `promoted` marker.
- **Graduation target**: the feature-tier artifact a backlog item promotes to — a Spec Kit spec dir, a roadmap node id, an entry in a feature's `tasks.md`, or a GitHub issue ref. Identified by a reference string; not necessarily created by the promotion action.
- **Promotion linkage**: the recorded relationship between a backlog item and its graduation target — a backlink bullet on the item, and (per FR-007) a back-reference on the target.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An operator can promote a backlog item into the feature rigor in a single command, and afterward the item shows a navigable backlink to its target (no manual re-keying, no lost thread).
- **SC-002**: 100% of promotions either fully apply or fully no-op — there is no partial-write outcome on any error path (verified by the fail-loud edge-case tests).
- **SC-003**: Given a promoted backlog item, a reader can reach its feature-tier target, and from the target reach the originating backlog item, without external knowledge (bidirectional navigability, per the FR-007 decision).
- **SC-004**: A new contributor reading either tier's documentation can correctly describe how work moves from backlog to feature rigor (the discovery gap named by the originating issue is closed).
- **SC-005**: Re-running a promotion on an already-promoted item never produces a second, conflicting linkage.

## Assumptions

- **Inbox precedent reused**: unless clarified otherwise, the backlog promotion mirrors the inbox `promote` contract — record-don't-create, a machine-greppable backlink bullet, a terminal / `promoted` status, dry-run-by-default. (FR-004 leans record-only; confirm in clarify.)
- **Bidirectional default**: FR-007 assumes the target also records the backlog ref where the target is a stack-control-owned artifact (roadmap node, tasks.md entry); for externally-owned targets (a GitHub issue) the back-reference is best-effort. Confirm in clarify.
- **No new tier**: this feature wires the existing backlog and existing feature-rigor tier together; it does not introduce a third tracking store.
- **Reuse, don't reimplement**: target creators (`/speckit-specify` via define, `roadmap add`, `gh issue create`) are invoked or referenced, never reimplemented (record-and-reuse precedent).
- **Single long-lived branch**: authored on `feature/stack-control` with a numbered spec dir, per the program convention (the spec dir, not a per-feature branch, is the unit).

## Non-Goals

- Reimplementing Spec Kit authoring (`/speckit-specify` and the downstream chain) or the roadmap engine — this feature wires the backlog into them.
- Automating the *decision* to promote (triage judgment stays the operator's); the feature mechanizes the *recording* of a promotion the operator has decided to make.
- A studio / GUI surface for promotion (CLI-first; any GUI is a separate concern).
- A GitHub-issue round-trip promotion target — deferred. (The #444 / TASK-16 tooling-friction routing policy may later define routing a backlog item back out to a GitHub issue; it is out of scope for this seam.)
