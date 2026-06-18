# Feature Specification: Roadmap edge-mutation and cluster (discoverability-first)

**Feature Branch**: `feature/stack-control` (one long-lived program branch; spec dir `specs/027-roadmap-edge-mutation-and-cluster`)

**Created**: 2026-06-18

**Status**: Draft

**Input**: Roadmap node `impl:gap/roadmap-edge-mutation-and-cluster`; originating backlog `TASK-242`; folds in `TASK-137`. Approved design record: `docs/superpowers/specs/2026-06-18-roadmap-edge-mutation-and-cluster-design.md`.

## Context

An adopting agent (the `offing` project, session `d98fc4fe`, 2026-06-18) was asked to *"group the cluster… change-runbook → env-promotion → behavior-validation."* It could neither discover how to mutate the roadmap (ran `roadmap --help` → error; probed a bogus status "to surface the vocabulary"; tested verbs to infer behavior; read the doc grammar by hand) nor perform the clustering through any verb — so it **hand-edited the governed `ROADMAP.md`**, contradicting that file's own *"do not hand-edit"* header. This feature makes roadmap mutation both **possible** and **obvious**, with `roadmap` as the first adopter of a stackctl-wide self-documenting convention. Scope was set with the operator (design forks 1–5): discoverability-first; stackctl-wide help convention with roadmap as proof; help derived from a shared parser (non-drift by construction); honest interim header; prove on roadmap and capture the rest.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A fresh agent discovers how to drive the roadmap without probing (Priority: P1)

An agent new to a stack-control installation needs to mutate the roadmap. It runs `stackctl roadmap --help` (and `stackctl roadmap <subaction> --help`) and learns the complete subaction list, each subaction's flags, and the status vocabulary — without triggering an error, reading source, or hand-reading the governed document's grammar.

**Why this priority**: This is the core friction the feature exists to remove (agents burning cycles probing every session). It is the discoverability-first headline and the proof case for the stackctl-wide convention. It delivers value even if nothing else ships.

**Independent Test**: On a fresh installation, invoke `roadmap --help`, `roadmap` (no subaction), and `roadmap cluster --help`; confirm each prints the full, accurate surface (subactions, flags, vocabulary) to stdout and exits 0 — with zero error-triggering or source-reading needed to learn the surface.

**Acceptance Scenarios**:

1. **Given** a fresh installation, **When** an agent runs `stackctl roadmap --help`, **Then** it prints every subaction with a one-line summary and exits 0 (not "unknown flag").
2. **Given** a fresh installation, **When** an agent runs `stackctl roadmap` with no subaction, **Then** the usage line enumerates the COMPLETE subaction set (not a truncated subset).
3. **Given** any roadmap subaction, **When** an agent runs `stackctl roadmap <subaction> --help`, **Then** it prints that subaction's flags and any enumerated value vocabulary (e.g. the status set) and exits 0.
4. **Given** the help output for a subaction, **When** an agent uses exactly the flags the help advertises, **Then** the subaction accepts them — help and actual parsing never disagree.

---

### User Story 2 - An operator clusters existing roadmap items in one move (Priority: P2)

An operator (or agent acting for one) groups several existing roadmap items under a parent and optionally chains their dependencies, in a single governed command, without hand-editing `ROADMAP.md`.

**Why this priority**: This is the literal operation the offing operator asked for in words. It is independently valuable and independently testable, but the discoverability fix (US1) is the broader, higher-leverage win, so this is P2.

**Independent Test**: On a fixture graph with three existing nodes, run `stackctl roadmap cluster <parent> --children a,b,c --chain --apply`; confirm a parent node exists, each child carries `part-of: <parent>`, the depends-on chain `a→b→c` is wired, and `roadmap order` revalidates clean — with no manual file edit.

**Acceptance Scenarios**:

1. **Given** a non-existent parent id and three existing children, **When** `roadmap cluster <parent> --children a,b,c --apply` runs, **Then** the parent is created (status `planned`) and each child gains `part-of: <parent>`.
2. **Given** an existing parent id, **When** the same command runs, **Then** the children are grouped under the existing parent (create-or-reuse), not duplicated.
3. **Given** `--chain`, **When** the command runs, **Then** `depends-on` edges are wired in the given child order (`a→b→c`).
4. **Given** no `--apply` (dry-run default), **When** the command runs, **Then** it reports the intended mutation and writes nothing to disk.
5. **Given** any mutation that would produce a cycle, dangling edge, self-edge, or duplicate, **When** the command runs, **Then** it refuses and leaves `ROADMAP.md` byte-for-byte unchanged.
6. **Given** a child that already carries a conflicting `depends-on`, **When** `--chain` would re-point it, **Then** the command REFUSES with a clear error (it does not silently overwrite).

---

### User Story 3 - The governed header tells the agent the truth about hand-editing (Priority: P3)

An agent reading `ROADMAP.md` sees a header that names the mutation verbs that exist AND explicitly blesses the safe fallback for a change without a verb yet, so it is never trapped between "do not hand-edit" and "no verb exists."

**Why this priority**: Closes the honesty gap that produced the offing governance violation, but is the smallest slice and depends on the verbs/discoverability above being in place to be fully truthful.

**Independent Test**: Read the rendered `ROADMAP.md` header; confirm it lists the available mutation verbs and states the hand-edit-then-`roadmap order` fallback for not-yet-verb-covered edits; follow the fallback on a sample edit and confirm `roadmap order` validates it.

**Acceptance Scenarios**:

1. **Given** the governed `ROADMAP.md`, **When** an agent reads the header, **Then** it finds the existing mutation verbs named and a worked clustering example.
2. **Given** a mutation with no verb yet, **When** an agent follows the header's guidance, **Then** it is told to hand-edit then run `stackctl roadmap order` to revalidate (rather than a bare "do not hand-edit").

---

### Edge Cases

- `cluster` with a `--children` entry that does not exist → refuse with a clear error naming the missing id; no write.
- `--children` empty or omitted → refuse with usage (a cluster needs children).
- Parent id equals one of the children → refuse (self-grouping is meaningless).
- A child already `part-of` a different parent → captured for clarification (refuse vs allow multi-parent); see Assumptions.
- `--chain` ordering that would introduce a cycle → refuse; file unchanged.
- `roadmap <unknown-subaction>` and `roadmap <sub> --unknown-flag` → error names the offending token AND points at `--help`; exit code distinguishes usage error from operational failure.
- A verb that has not yet adopted the shared parser → still dispatches and behaves exactly as before (incremental adoption must not regress un-migrated verbs).
- Help requested for a machine-adapter verb (not operator-facing) → out of scope for this feature's help surface (those verbs are marked internal in the deferred consolidation item).

## Requirements *(mandatory)*

### Functional Requirements

**Shared help/parser foundation (proven on roadmap)**

- **FR-001**: The system MUST provide a shared argument-parsing primitive from which a verb's `--help` text, complete top-level usage line, per-subaction help, and enumerated value vocabularies (e.g. the status set) are all DERIVED from a single declaration, such that help cannot describe a flag the verb does not accept, nor omit a flag it does accept (non-drift by construction).
- **FR-002**: `roadmap` MUST be migrated onto the shared primitive as the first adopter, fully self-documenting: `roadmap --help`, `roadmap -h`, `roadmap` (no subaction), and `roadmap <subaction> --help` each print the relevant surface to stdout and exit 0.
- **FR-003**: The no-subaction `roadmap` usage line MUST enumerate the COMPLETE subaction set (replacing today's truncated `<next|blocked|add>`).
- **FR-004**: Per-subaction help MUST list that subaction's flags and any enumerated vocabulary (notably the roadmap status set), so the vocabulary is discoverable without triggering an error.
- **FR-005**: The non-drift property MUST be mechanically guaranteed (e.g. a conformance/golden check that fails if rendered help and accepted flags diverge), not merely asserted in prose.
- **FR-006**: Migration MUST be incremental and non-regressing — verbs that have not yet adopted the shared primitive continue to dispatch and behave unchanged.

**Cluster convenience**

- **FR-007**: The system MUST provide a `roadmap cluster <parent-id> --children <id,...> [--chain] [--apply]` subaction (with `group` as an alias) that operates on EXISTING child nodes.
- **FR-008**: `cluster` MUST create-or-reuse the parent: create it (status `planned`) if absent, group under it if present; never duplicate it.
- **FR-009**: `cluster` MUST attach `part-of: <parent>` to each named existing child.
- **FR-010**: With `--chain`, `cluster` MUST wire `depends-on` edges among the children in the given argument order.
- **FR-011**: `cluster` MUST be dry-run by default and write only with `--apply`; a dry-run reports the intended mutation and writes nothing.
- **FR-012**: `cluster` MUST revalidate the whole graph and REFUSE any mutation that introduces a cycle, dangling edge, self-edge, or duplicate.
- **FR-013**: `cluster` MUST be atomic: on any failure (validation refusal or otherwise) `ROADMAP.md` is left byte-for-byte unchanged (no partial multi-edge write).
- **FR-014**: With `--chain`, when a named child already carries a conflicting `depends-on`, `cluster` MUST refuse with a clear error rather than silently overwriting it. (Resolves design open question (a).)
- **FR-015**: `cluster` MUST refuse with a clear, actionable error (and zero write) when a named child does not exist, when `--children` is empty/omitted, or when the parent id equals a child id.

**Honest governed header**

- **FR-016**: The `ROADMAP.md` header MUST be replaced with an honest-interim form that names the available mutation verbs, includes a worked clustering example, AND explicitly blesses the fallback "for an edit without a verb yet, hand-edit then run `stackctl roadmap order` to revalidate" — replacing the bare "manage with stackctl roadmap — do not hand-edit."

**Captured-deferred work (recorded, not built here)**

- **FR-017**: This feature MUST record the deferred work as TWO sibling roadmap items (resolves design open question (b)): a **capability** item (the edge-mutation verb set: `add-edge` / `remove-edge` / `move-edge`=reparent, `rename`, `remove-node`; absorbs TASK-137) and a **surface-hygiene** item (the verb-surface consolidation rollout: ~50 flat verbs → ~12–15 nouns, machine-adapter verbs marked internal, backwards-compat aliases, remaining verbs adopt the parser). Neither is implemented in this feature.
- **FR-018**: The captured siblings MUST be navigable from this feature (cross-referenced) so the deferral is tracked, not dropped.

### Key Entities

- **Roadmap node**: a heading-keyed work item (`<phase>:<kind>/<slug>`) with status and typed edges (`depends-on`, `part-of`, `deferred-until`) — the unit `cluster` mutates.
- **Typed edge**: a `part-of` (non-blocking grouping) or `depends-on` (hard, acyclic) relation between nodes — what `cluster` creates.
- **Verb help descriptor**: the single per-verb declaration of subactions/flags/vocabulary that the shared primitive both parses against and renders help from.
- **Cluster request**: parent id + ordered children + chain flag + apply flag — the operator-perceivable shape of the grouping operation.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A fresh agent can learn every roadmap subaction, its flags, and the status vocabulary entirely from `--help`/usage output — **zero** error-triggering probes and **zero** source/grammar reads required.
- **SC-002**: Grouping N existing items under a parent (with optional dependency chaining) is achievable in **one** command with **no** hand-edit of `ROADMAP.md`.
- **SC-003**: Rendered help and actually-accepted flags agree in **100%** of cases, enforced mechanically (a divergence fails the check).
- **SC-004**: A refused `cluster` operation leaves `ROADMAP.md` **byte-for-byte identical** to its pre-command state (no partial writes), in 100% of refusal paths.
- **SC-005**: An agent reading the `ROADMAP.md` header is never left without a sanctioned path: every mutation it can express in words maps to either a named verb or the blessed hand-edit-then-revalidate fallback.

## Assumptions

- **Scope boundary — roadmap-only proof**: This feature migrates ONLY `roadmap` onto the shared parser (the other ~49 verbs adopt it later, under the captured surface-hygiene sibling). Whether to opportunistically migrate 1–2 additional simple verbs to demonstrate the primitive generalizes is left to `/speckit-clarify` / `/speckit-plan`; the default here is roadmap-only (matches design fork 5, "prove on roadmap, capture rest").
- **Atomicity mechanism**: FR-013's atomicity is a requirement, not a mechanism. Whether `cluster` reuses the existing roadmap mutation/write path (`src/roadmap/mutations.ts`) or introduces a small transactional buffer→validate→commit helper is a planning-phase (`/speckit-plan`) decision, not a spec concern.
- **Multi-parent children**: `part-of` already supports a node belonging to multiple parents (per the roadmap protocol). The default is that `cluster` ADDS a `part-of` edge to a child that already has one elsewhere (multi-parent allowed), refusing only on exact-duplicate edges; to be confirmed in clarify.
- **One-branch program**: Authoring runs on the single long-lived `feature/stack-control` branch with numbered spec dirs; the Spec Kit `before_specify` git-feature (branch creation) hook is intentionally not used here (consistent with specs 024–026 and the `/stack-control:define` resolve-via-marker note).
- **Existing validation reused**: The loader's read-side graph validation (`roadmap order`) is the safety net `cluster` revalidates through; this feature does not re-implement graph validation.
- **Governance**: Implementation is governed per-phase via the `after_implement` deskwork-governance hook (cross-model audit-barrage), per the standing workflow protocol.
