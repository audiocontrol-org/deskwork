# Feature Specification: Backlog slush-pile surface

**Feature Branch**: `feature/stack-control` (spec dir `008-backlog-surface`)

**Created**: 2026-06-09

**Status**: Draft

**Input**: User description: "A backlog surface for stack-control — a structured, agent-easy slush pile for bugs/gaps agents find mid-work, deliberately separate from the curated ROADMAP.md. Full design settled in docs/superpowers/specs/2026-06-09-backlog-surface-design.md."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Capture found work in one move (Priority: P1) 🎯 MVP

While working a task, an agent (or the operator) trips over a bug, gap, or follow-up that is real but out of the current scope. They record it into the backlog in a single command — naming what it is and, optionally, where it was found — and immediately return to their prior task. They do not stop to triage, prioritize, or decide whether it belongs on the roadmap; capture and scoping are separate acts.

**Why this priority**: This is the reason the feature exists. Today there is no low-friction, structured place to dump found work — GitHub issues are unstructured and floodable, the audit-log is governance-scoped, and dumping into `ROADMAP.md` destroys the curation that makes the roadmap useful. One-move capture without losing the working thread is the core value; everything else is additional intake into the same pile.

**Independent Test**: Capture a bug/gap with a type and an optional reference; confirm a corresponding backlog item exists, that `ROADMAP.md` is unchanged, and that any previously captured items are byte-for-byte unchanged.

**Acceptance Scenarios**:

1. **Given** an existing backlog, **When** an agent captures a found bug with a type and a source reference, **Then** a new backlog item is recorded with that type and reference, and the agent's working context is not otherwise disturbed.
2. **Given** a backlog already holding several captured items, **When** a new item is captured, **Then** all previously captured items remain unchanged (multiple found-work threads coexist).
3. **Given** a capture request, **When** it succeeds, **Then** no triage, prioritization, or roadmap-promotion has occurred — the item is simply recorded for a later, separate triage pass.
4. **Given** a capture request, **When** it runs, **Then** `ROADMAP.md` is not modified.

---

### User Story 2 - See the pile without polluting the roadmap (Priority: P2)

The operator (or an agent) wants to review what has accumulated in the slush pile — to triage it in a deliberate later pass — and to do so without the pile bleeding into the carefully curated roadmap. They list the captured items as a tier distinct from `ROADMAP.md`; deeper inspection and triage use the backing store's native capabilities.

**Why this priority**: Capture is only useful if the pile can be read back and worked. Keeping the pile visibly separate from the roadmap is what protects the roadmap's curation — the whole motivation for a separate slush tier.

**Independent Test**: After capturing several items, list the backlog and confirm every captured item is reported, that the listing is read-only (writes nothing), and that the curated roadmap is not among or altered by the listing.

**Acceptance Scenarios**:

1. **Given** a backlog with captured items, **When** the operator lists the backlog, **Then** each captured item is reported with enough identity to act on it, and nothing is written.
2. **Given** the backlog and the curated roadmap coexist, **When** the operator reviews the pile, **Then** the slush items are presented as a tier separate from the roadmap.

---

### User Story 3 - Seed the pile from existing open GitHub issues (Priority: P2)

The operator wants the existing open GitHub issues represented in the backlog so the slush pile starts from the real current state of found-but-unscheduled work — without disturbing GitHub itself. They run a one-time import that creates one backlog item per open issue, each backlinked to its source issue, and can preview the import before applying it. Re-running the import does not create duplicates.

**Why this priority**: A backlog that starts empty ignores the tracked-but-uncurated work already in GitHub. Seeding it once makes the pile immediately useful. GitHub stays canonical during the trial; its eventual fate is decided later by whether the backlog proves out.

**Independent Test**: Run the import against the current open issues with preview, confirm the reported set matches the open issues; apply it and confirm one backlinked item per issue; re-run and confirm zero duplicates created; confirm GitHub issues are unchanged.

**Acceptance Scenarios**:

1. **Given** open GitHub issues, **When** the import is previewed, **Then** it reports what would be imported and writes nothing.
2. **Given** open GitHub issues, **When** the import is applied, **Then** one backlog item is created per open issue, each carrying a backlink reference to its source issue and the issue's labels.
3. **Given** an import has already run, **When** it is run again, **Then** issues already represented are skipped and no duplicate items are created.
4. **Given** the import runs, **When** it completes, **Then** the GitHub issues themselves are not modified (no close, no label change, no comment).

---

### User Story 4 - Route audit-barrage residuals into the same pile (Priority: P3)

When the cross-model audit-barrage convergence loop parks (dampens) a residual finding that is real but not being fixed this round, that finding flows into the backlog as an item rather than living indefinitely as a parked status in the audit-log. Existing already-parked findings can be backfilled into the backlog in one operation. The audit-log returns to being a clean convergence ledger; the backlog becomes the single burn-down queue for found work.

**Why this priority**: The dampener-parked residuals *are* real bugs/gaps — the same kind of found work US1 captures — so they belong in the same pile, not in a second slush concept inside the audit-log. Unifying them resolves the `slush-findings` naming collision and gives one place to burn down. It is P3 because it depends on the pile existing (US1) and touches the in-use governance loop, so it is sequenced after the foundation is solid.

**Independent Test**: Drive the convergence loop to a state where a MEDIUM/LOW finding is parked; confirm it appears in the backlog with severity reflected as priority and a traceable link to its audit-log origin; confirm no HIGH finding is ever parked; backfill existing parked entries and confirm they appear in the backlog and their audit-log entries record a migrated disposition.

**Acceptance Scenarios**:

1. **Given** the convergence loop parks a MEDIUM or LOW finding, **When** the parking happens, **Then** a backlog item is created carrying the finding's provenance (originating feature and barrage finding id) and a reference back to its audit-log entry.
2. **Given** the convergence loop is HIGH-quiet, **When** parking occurs, **Then** no HIGH-severity finding is ever parked (HIGHs are never slushed).
3. **Given** a parked finding is routed to the backlog, **When** its audit-log entry is updated, **Then** the entry records a migrated-to-backlog disposition instead of an indefinitely-held parked status.
4. **Given** existing already-parked entries in the audit-log, **When** the one-time backfill runs, **Then** each is represented as a backlog item and the audit-log remains the clean open/fixed convergence ledger.

---

### Edge Cases

- **Empty/blank capture** — a capture with no description (or no type) is refused with a descriptive error; nothing is written.
- **Duplicate GitHub import** — an issue already represented in the backlog is skipped, not duplicated, on a re-run.
- **GitHub issue body contains `#` or markdown control characters** — import handles arbitrary issue text without corrupting the item or tripping shell/permission gates.
- **Backing store binary missing** — any operation that needs the backing task store fails loudly, naming the missing dependency and how to install it (never a silent no-op).
- **GitHub CLI missing or unauthenticated** — the import fails loudly with remediation rather than importing a partial or empty set.
- **Underlying operation returns non-zero** — the failure and its underlying error surface and propagate; the operation does not report success.
- **Capture while many threads are open** — capturing one item never reorders, rewrites, or disturbs other captured items.
- **Backfill run more than once** — re-running the slush backfill does not duplicate already-migrated findings.

## Requirements *(mandatory)*

### Functional Requirements

**Capture (US1)**

- **FR-001**: The system MUST let an agent or operator capture a found bug or gap into the backlog in a single command invocation, without requiring them to leave or lose their current working thread.
- **FR-002**: Each captured item MUST record a type (at minimum distinguishing *bug* from *gap*; the import paths additionally set provenance-class types `imported-issue` / `migrated-finding`, see Key Entities) and MAY record an optional reference (e.g. a URL or locator) to the context in which it was found.
- **FR-003**: Capture MUST NOT require or perform triage, prioritization, or roadmap promotion — classifying and scoping a captured item is a separate, later, operator-driven act (capture ≠ scope).
- **FR-004**: Capturing into the backlog MUST NOT modify `ROADMAP.md` or any other curated artifact.
- **FR-005**: The backlog's contents MUST be durable, human-readable written artifacts versioned in the working tree (per the thesis: memory loss is countered by durable *written* artifacts; the store must be prose-auditable, not an opaque binary).
- **FR-006**: Capturing a new item MUST leave every previously captured item unchanged, so multiple found-work threads coexist without one capture disturbing another.

**Review the pile (US2)**

- **FR-007**: The system MUST provide a read-only way to list the captured backlog items so the pile can be reviewed; listing MUST NOT write to the store.
- **FR-008**: The backlog MUST be presentable as a tier distinct from the curated roadmap, so reviewing the slush pile never conflates it with `ROADMAP.md`.

**GitHub seed import (US3)**

- **FR-009**: The system MUST support a one-time import that creates one backlog item per currently-open GitHub issue.
- **FR-010**: The GitHub import MUST NOT mutate GitHub — issues remain open and canonical; the import is a one-way snapshot for the trial.
- **FR-011**: Each imported item MUST record a backlink reference identifying its source GitHub issue.
- **FR-012**: The GitHub import MUST be idempotent — re-running it MUST NOT create duplicate items for issues already represented.
- **FR-013**: The GitHub import MUST support a preview (dry-run) that reports what would be imported and writes nothing.
- **FR-014**: The GitHub import MUST carry each issue's labels onto the corresponding backlog item.
- **FR-015**: The GitHub import MUST handle arbitrary issue body text (including `#` and markdown control characters) without corrupting the item or failing on shell/permission boundaries.

**Audit-barrage residual migration (US4)**

- **FR-016**: Findings that the audit-barrage convergence loop parks (dampens) MUST be routed into the backlog as items carrying their provenance — originating feature and barrage finding id — and a reference back to their audit-log entry.
- **FR-017**: The decision of *when* to park a finding MUST remain in the governance convergence loop; only the *destination* of a parked finding changes. The parking policy is not coupled out of governance.
- **FR-018**: HIGH-severity findings MUST NEVER be parked/slushed; this existing invariant is preserved unchanged.
- **FR-019**: A parked finding's severity MUST map to the resulting backlog item's priority.
- **FR-020**: The audit-log entry for a routed finding MUST record a migrated-to-backlog disposition rather than retaining an indefinitely-held parked status; the audit-log remains the clean convergence ledger (open / fixed).
- **FR-021**: The system MUST support a one-time backfill that imports existing already-parked audit-log entries into the backlog, idempotently.
- **FR-022**: "Burning down" the slush pile MUST be expressed as working the backlog (the backlog is the burn-down queue); a separate burn-down mode is removed.

**Failure behavior (cross-cutting — Constitution Principle V)**

- **FR-023**: When a required external dependency is absent (the backing task store, or the GitHub access used by the import), the system MUST fail with a descriptive error naming what is missing and how to remedy it — never silently skip, fall back, or return an empty success.
- **FR-024**: A non-zero result from any underlying operation MUST surface the underlying error and propagate failure — never silently swallowed.

**Scope boundary**

- **FR-025**: The backlog MUST be additive: the existing insight-capture inbox, `ROADMAP.md`, and the non-slush portion of the audit-log remain untouched by this feature. (Replacing any of them with the backlog is explicitly a later, separate decision.)

### Key Entities *(include if feature involves data)*

- **Backlog item**: a single unit of found work in the slush pile. Attributes: a title/description, a type (bug / gap / imported-issue / migrated-finding), a priority (used by migrated findings), labels, an optional source reference (a GitHub issue backlink, or an audit-log/barrage provenance link), and a status. The unit of capture and the unit of later triage.
- **Backlog (the pile)**: the structured collection of backlog items, durable as human-readable artifacts in the working tree, deliberately separate from the curated roadmap.
- **Curated roadmap (`ROADMAP.md`)**: the existing small, carefully-curated DAG of work the project knows it wants to do. The backlog exists precisely so the roadmap stays uncluttered; this feature never writes to it.
- **Source GitHub issue**: an open issue snapshotted into the backlog (number, title, body, labels, url). Canonical and unmodified by this feature.
- **Parked audit finding**: a residual cross-model audit-barrage finding the convergence loop dampens (MEDIUM/LOW; never HIGH). Routed into the backlog with provenance; its audit-log entry records the migration.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An agent can capture a found bug/gap in a single command invocation and resume its prior task with no intermediate triage step required.
- **SC-002**: A capture leaves `ROADMAP.md` and every previously captured item byte-for-byte unchanged.
- **SC-003**: Every currently-open GitHub issue can be imported into the backlog in one operation, and a second run of the import creates zero additional items.
- **SC-004**: Every backlog item that originated from a GitHub issue can be traced back to its source issue, and no GitHub issue is altered by the import.
- **SC-005**: Every finding the convergence loop parks appears in the backlog with its severity reflected as priority and a traceable link to its audit-log origin; across the convergence loop, zero HIGH-severity findings are ever parked.
- **SC-006**: After the slush migration, the audit-log holds no indefinitely-parked slush statuses — each routed finding's entry records a migrated disposition, leaving a clean open/fixed ledger.
- **SC-007**: When a required dependency (backing store or GitHub access) is missing, the operation fails with a descriptive, actionable error rather than a silent skip or an empty result.

## Assumptions

- **Substrate is a settled decision (backlog.md).** The concrete backing task store is **backlog.md** — a markdown-native task manager on the project's TypeScript/npm stack that keeps each item as a git-diffable markdown file in the working tree. It owns the item file format and native triage/inspection operations (e.g. board / show / cleanup); this feature does not reimplement those. Rationale and the head-to-head against the rejected alternative (`beads`) live in the design ADR (`docs/superpowers/specs/2026-06-09-backlog-surface-design.md`), not in this spec.
- **Opinionated verb over one concrete backend; the backend-agnostic port is deferred** (Constitution Principle II — integration-first, no speculative building; and the program's settled provider-port discipline). The stack-control verb is the stable contract; a formal backend port/registry is extracted only if and when a real second backend appears.
- **Surface is skill + CLI, not MCP** (Constitution Principle VIII faithfulness + the `enforcement-lives-in-skills` discipline; fail-loud, worktree-portable, no daemon to maintain). MCP can be added later if multi-vendor capture matters.
- **GitHub access for the import uses the project's existing GitHub CLI tooling**; the import reads issue data and never writes back.
- **The governance convergence loop is in active use**; routing its parked residuals into the backlog changes only the destination of parked findings, not when parking happens.
- **The backlog is additive and reversible** — adopting it does not retire the inbox or roadmap; backlog contents are plain markdown, so a later migration to a different store is not a one-way door.

## Out of Scope (named deferrals — not silently cut)

These were explicitly considered and deferred by the operator this session. They are recorded so a later pass can pick them up deliberately:

- **MCP integration** — the backing store ships an MCP server; we deliberately use skill + CLI for the trial (reversible).
- **A formal backend-agnostic port / registry** — extract from a real second backend, per Principle II; not built speculatively now.
- **A backlog → `ROADMAP.md` promotion seam** — graduating a triaged backlog item onto the curated roadmap is a later capability.
- **The GitHub close/migrate disposition** — what ultimately happens to the imported GitHub issues (close, migrate, leave) is decided later by whether the backlog proves out.
- **Concurrency / merge-safe IDs** — robustness under heavy concurrent multi-agent flooding (the rejected alternative's strength) is revisited only if flooding becomes a real problem.
- **A dependency-graph overlay** reusing the roadmap reasoner over backlog items (via the existing store-agnostic `WorkItem` boundary) — speculative until the backlog proves out and is wanted in a roadmap-like role; v1 only keeps the door open by exposing items in a structured form.
