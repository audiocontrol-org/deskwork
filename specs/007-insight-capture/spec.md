# Feature Specification: Low-friction insight capture

**Feature Branch**: `feature/stack-control` (one long-lived program branch; spec dir `specs/007-insight-capture`)

**Created**: 2026-06-08

**Status**: Draft

**Input**: User description: "Low-friction insight capture (design/insight-capture) — make out-of-sequence design-idea capture a first-class stack-control capability: capture an insight in ONE move, mid-thread, without losing the current thread; capture ≠ scope; hold multiple threads at once; native capture verb + inbox surface that appends to the governed inbox with add-time re-validation; triage/graduation paths; retires the interim design-inbox convention."

## Clarifications

### Session 2026-06-08

- Q: v1 capability boundary — capture only, or capture + triage/graduation? → A: **Capture + triage/graduation** — the full loop (safe capture + promote/drop) ships in v1.
- Q: Inbox↔roadmap relationship — two surfaces, two views of one store, or separate-with-promotion? → A: **Two separate governed surfaces with a defined promotion path** — promoting an entry routes through the existing `roadmap add` capability and records the linkage; they are NOT unified into one store in this feature.
- Q: Graduation mechanism — automate target creation, or record linkage + reuse existing creators? → A: **Record linkage + reuse creators** — `promote` records status + target reference and reuses the existing creators (`roadmap add`, issue creation, spec authoring); it does not re-implement target creation.
- Q: deskwork Ideas-stage integration depth in v1? → A: **None in v1** — promote-to-document records a target reference only; automated hand-off to deskwork's Ideas stage is a fast-follow.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Safe one-move capture (Priority: P1)

An operator or agent, deep in one thread of work, has an out-of-sequence design idea. They record it into the design inbox with a **single action**, supplying just the idea's content, and immediately return to what they were doing. The idea is durably stored as a new `captured` entry. The capture is **validated as it lands**: if the result would make the inbox malformed (duplicate identifier, structural violation), the capture is refused and the inbox is left exactly as it was — there is never a half-written or dangling entry that only fails later.

**Why this priority**: This is the feature's reason to exist — design and scoping are not serial, so capturing an insight must never require finishing the current thread. It is also the safety fix for today's gap, where capture is a raw hand-edit that can corrupt the inbox undetected until the next load. One-move-and-safe capture alone is a viable MVP: it replaces the hand-edit convention with a reliable mechanism.

**Independent Test**: Invoke the capture action with an idea; confirm a new `captured` entry appears in the inbox and the document still validates. Then attempt a capture that would violate the inbox's structure (e.g. a duplicate identifier); confirm it is rejected with a descriptive error and the inbox is byte-for-byte unchanged.

**Acceptance Scenarios**:

1. **Given** a valid, governable inbox, **When** the operator captures an idea in one action with a title and body, **Then** a new entry with status `captured` is appended and the inbox still validates.
2. **Given** a valid inbox, **When** a capture would produce an invalid document (duplicate identifier or structural violation), **Then** the capture is refused with a descriptive error and the inbox is unchanged (zero partial write).
3. **Given** the operator is mid-thread, **When** they capture an idea, **Then** capture completes in a single step and requires no scoping, triage, or sequencing decision.
4. **Given** the inbox does not exist or is not governable, **When** a capture is attempted, **Then** the system fails loud with a descriptive error rather than silently creating or repairing state.

---

### User Story 2 - Triage and graduation (Priority: P2)

In a separate, deliberate pass (not at capture time), an operator reviews captured entries and dispositions each one: **promote** it — recording that it graduated into a spec, a roadmap item, or a GitHub issue — or **drop** it with a recorded reason. Terminal (promoted/dropped) entries can then be cleared out of the live inbox so it stays lean, without losing the historical record.

**Why this priority**: Capture is only half the loop; the inbox earns trust only if entries reliably move on. Triage is explicitly a separate pass from capture (so capture stays instant), which is why this is P2, not folded into P1.

**Independent Test**: Take a `captured` entry; promote it (record its graduation target) and confirm its status becomes `promoted`; take another and drop it with a reason and confirm its status becomes `dropped`; then keep the inbox lean and confirm terminal entries leave the live document while remaining recoverable from history.

**Acceptance Scenarios**:

1. **Given** a `captured` entry, **When** the operator promotes it to a named target (spec / roadmap item / issue), **Then** its status becomes `promoted` and the target is recorded.
2. **Given** a `captured` entry, **When** the operator drops it with a reason, **Then** its status becomes `dropped` and the reason is recorded.
3. **Given** entries in terminal states, **When** the operator keeps the inbox lean, **Then** those entries leave the live inbox but remain preserved in history (nothing is destroyed).

---

### User Story 3 - One capture mechanism (retire the interim convention) (Priority: P3)

Once native capture exists, the interim design-inbox convention — the prose rule that tells agents to hand-append, and the retired docs-tree pointer — is removed, so there is exactly **one** capture mechanism and **one** inbox source of truth. Anyone (human or agent) reaching for "how do I capture an idea?" finds the native capability, not a hand-edit instruction.

**Why this priority**: Eliminates the two-sources-of-truth / two-mechanisms risk the interim convention carries. It depends on US1 existing (you can't retire the stopgap until the native path works), so it is P3.

**Independent Test**: After the capability ships, confirm the interim rule and pointer no longer instruct hand-editing, and the only documented capture path is the native one; confirm no second capture mechanism remains.

**Acceptance Scenarios**:

1. **Given** the native capture capability is shipped, **When** an operator looks for how to capture an idea, **Then** the only advertised mechanism is the native capability (the interim hand-append convention is retired).
2. **Given** the interim convention is retired, **When** the inbox is inspected, **Then** there is a single inbox source of truth and no parallel capture path.

---

### Edge Cases

- **Duplicate identifier**: capturing an idea whose title/identifier already exists is refused with a descriptive error; the inbox is unchanged.
- **Concurrent captures**: each capture MUST be an atomic, fully-validated single-file write, so the inbox is never left corrupt or partially written. Cross-process locking is out of v1 scope: under genuine concurrency the writes serialize at the filesystem and the last writer wins (the same guarantee the existing `roadmap add` mutation provides) — an accepted v1 limitation, with a file-lock / compare-and-swap as a documented fast-follow if real contention appears.
- **Inbox missing / not governable**: capture and triage fail loud (descriptive error), never auto-create, repair, or silently no-op.
- **Empty / whitespace-only idea**: refused with a descriptive error (no empty entry recorded).
- **Promote/drop of a non-existent or already-terminal entry**: refused with a descriptive error; no silent state change.
- **Capture during an in-progress triage / lean-keeping operation**: the inbox must remain consistent (no lost or duplicated entries).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST let an operator or agent capture a new design-idea entry into the inbox in a single action, without navigating away from or blocking the current work.
- **FR-002**: Capture MUST require only a minimal set of inputs (at least a title and the idea body); remaining structure is defaulted so capture stays one-move.
- **FR-003**: On capture, the system MUST validate the resulting inbox against its structural rules and, if the result would be invalid (duplicate identifier, structural violation, etc.), MUST refuse the capture leaving the inbox unchanged and surface a descriptive error — no partial or dangling write.
- **FR-004**: A newly captured entry MUST default to the `captured` (active, pre-triage) state.
- **FR-005**: Capture MUST NOT require the operator to scope, sequence, or triage the idea (capture ≠ scope).
- **FR-006**: The system MUST support multiple `captured` entries existing simultaneously; capturing one MUST NOT disturb the others (multiple design threads held at once).
- **FR-007**: An operator MUST be able, in a separate pass, to **promote** a captured entry — recording that it graduated to a spec, a roadmap item, or a GitHub issue (status → `promoted`) — or **drop** it with a recorded reason (status → `dropped`).
- **FR-008**: Terminal (`promoted`/`dropped`) entries MUST be removable from the live inbox while preserved in history (lean-keeping), with no loss of the record.
- **FR-009**: The system MUST present the current inbox contents (entries and their states) for review.
- **FR-010**: All capture and triage operations MUST fail loud with a descriptive error when preconditions are unmet (inbox missing or not governable, target entry absent, etc.); they MUST NOT silently no-op, fabricate, or write partial state.
- **FR-011**: Shipping this capability MUST retire the interim design-inbox convention (the prose rule and the docs-tree pointer) so exactly one capture mechanism and one inbox source of truth remain.
- **FR-012**: The inbox and the roadmap MUST remain **two separate governed surfaces** (distinct documents). Promotion of an inbox entry to a roadmap item MUST follow a **defined promotion path** that routes through the existing roadmap "add" capability and records the resulting linkage on the entry. This feature MUST NOT unify the inbox and roadmap into one underlying store.
- **FR-013**: v1 MUST deliver **both** capture **and** triage/graduation: the safe one-move capture (US1) and the promote/drop operations (US2) are in scope for v1 (the full loop), reusing the existing lean-keeping (curate/archive) operations rather than reinventing them.
- **FR-014**: Promotion MUST be a **record-and-reuse** operation: `promote` sets the entry's status to `promoted` and records the target reference (spec / roadmap item / GitHub issue). It MUST NOT re-implement target creation — the target artifact is created via the existing capabilities (roadmap "add", issue creation, spec authoring), invoked separately. This keeps capture/triage decoupled from the target-creation subsystems.

### Key Entities *(include if feature involves data)*

- **Inbox entry**: a single captured idea — a title/identifier plus a body (the idea, its surfacing context, and a provisional home), and a status of `captured`, `promoted`, or `dropped`. Optionally records a graduation target (for `promoted`) or a reason (for `dropped`).
- **Inbox**: the governed collection of entries that is the single source of truth for pre-triage ideas.
- **Graduation target**: the destination an entry is promoted into — a spec, a roadmap item, or a GitHub issue — referenced from the promoted entry.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An operator can capture an out-of-sequence idea in a **single action**, with no hand-editing of files and no interruption of the current task.
- **SC-002**: **100%** of captures that would produce an invalid inbox are refused at capture time with the inbox left unchanged — a malformed or dangling entry can never land (the failure mode of the hand-edit convention is eliminated).
- **SC-003**: A captured idea is durably recorded and retrievable both in the same session and later.
- **SC-004**: After shipping, there is **exactly one** capture mechanism and **one** inbox source of truth; no second capture path (hand-edit convention, parallel file) remains.
- **SC-005**: An operator can promote or drop any captured entry in a separate pass, and the live inbox can be kept lean (terminal entries cleared) with **zero** loss of history.
- **SC-006**: A fresh operator or agent, given only the shipped capability and its documentation, can capture and later triage an idea without being told to edit any file by hand.

## Assumptions

- The capability is built on, and consistent with, the existing governed inbox and the document-primitives engine; the existing lean-keeping operations (curate/archive) are reused rather than reinvented.
- **CLI is the v1 interaction surface.** A richer graphical capture/inbox surface belongs to `multi/control-plane-frontend`, not this feature (informed default; revisit only if clarification overrides).
- **deskwork Ideas-stage integration is out of v1 scope** (confirmed in Clarifications 2026-06-08): promote-to-document records a target reference only; automated hand-off to the Ideas stage is a fast-follow.
- The program runs on one long-lived branch with numbered spec dirs; the active spec dir is resolved via the `CLAUDE.md` Spec Kit marker, not the branch name.
- This feature `depends-on` the shipped stack-control front door (`multi/feature/front-door`) and is authored and run through it.
- Constitution constraints apply at implementation time (TDD-first; no fallbacks/mock data outside tests; strict typing; file-size cap; enforcement in skill bodies + CLI verbs, never git hooks; branch on capability, not vendor). These are recorded here for traceability; the concrete mechanism is the plan's concern, not this spec's.

## Open Questions

All four open questions were resolved in **Clarifications → Session 2026-06-08**:

1. **Inbox ↔ roadmap relationship** (FR-012) → two separate surfaces + a defined promotion path (no unification).
2. **v1 scope boundary** (FR-013) → capture + triage/graduation (the full loop).
3. **Graduation mechanism** (FR-014) → record linkage + reuse existing creators.
4. **deskwork Ideas-stage integration depth** → none in v1 (target reference only).
