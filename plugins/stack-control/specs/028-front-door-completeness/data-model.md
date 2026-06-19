# Phase 1 Data Model: Front-Door Completeness

**Feature**: `028-front-door-completeness` | **Date**: 2026-06-19 | **Plan**: [plan.md](./plan.md)

The entities below are the typed shapes the feature introduces or extends. Each is
marked **NEW** (introduced by this feature) or **EXTENSION** (an existing type in the
tree gains fields/states). Existing types are cited by their real module path. Type
sketches are TypeScript-strict (no `any`/`as`/`@ts-ignore`); they are *contracts*,
not implementation bodies.

The spine: the `CommandDescriptor` (Decision 1) is the single source; the
`FrontedOperation` registry (Decision 3) derives from it plus the existing
`CapabilityRegistry`; `check-front-door` quantifies over the registry; the
`MediationMarker`, backlog terminal state, and roadmap markers/edges are the state
the new verbs mutate.

---

## 1. CommandDescriptor — NEW (`src/cli-help/command-surface.ts`)

The single typed description of one front-door operation, derived from the commander
command tree. Generalizes the `roadmap`-only `SUBACTION_SPECS` + `roadmap-help.ts`
surface to all 46 verbs.

```ts
/** A flag on a verb or sub-action (derived from the commander option definition). */
export interface FlagDescriptor {
  readonly name: string;          // dashed long form, e.g. "depends-on"
  readonly arg: string | null;    // value placeholder, e.g. "<value>"; null for a boolean flag
  readonly required: boolean;     // whether the flag is mandatory for the operation
  readonly description: string;   // one-line help text
}

/** Whether an operation is state-bearing (gated by mediation) or a pure query. */
export type MediationClass = 'mutating' | 'read-only';

/** One sub-action of a multi-action verb (e.g. roadmap `add-edge`). */
export interface SubActionDescriptor {
  readonly name: string;                       // e.g. "add-edge"
  readonly description: string;                 // one-line summary (the SUMMARIES analogue)
  readonly positional: string | null;          // "<identifier>" when the sub-action takes one, else null
  readonly flags: readonly FlagDescriptor[];
  readonly mediationClass: MediationClass;      // declared, not inferred (Decision 4)
}

/** One top-level verb (e.g. `roadmap`, `backlog`, `check-front-door`). */
export interface CommandDescriptor {
  readonly verb: string;                        // e.g. "roadmap"
  readonly description: string;
  readonly subActions: readonly SubActionDescriptor[]; // [] for a single-action verb
  readonly flags: readonly FlagDescriptor[];           // verb-level flags (single-action verbs)
  readonly mediationClass: MediationClass;             // for a single-action verb; multi-action class is per-sub-action
  readonly deprecatedAliasOf: string | null;           // e.g. check-editor-symmetry → check-module-symmetry
}
```

**Relationships.** Built by walking the live commander `Command` tree (the same tree
`roadmap-command.ts` builds). `--help`, the verb reference, the descriptor artifact,
and the fronted-operations registry all read `CommandDescriptor[]`.

**Validation.** A descriptor whose `verb` is absent from the live command tree, or a
sub-action missing a `description`, fails loud (the `roadmap-help.ts` completeness
guard generalized — a registered sub-action without a summary throws today).

**Mediation class.** Declared at definition time. A multi-action verb classifies per
sub-action; `read-only` is asserted explicitly so a future write path cannot inherit
"read-only" silently (Decision 4).

---

## 2. FrontedOperation — NEW (`src/capability/fronted-operations.ts`)

A derived registry entry: one per fronted operation that must be discoverable and
(where mutating) mediated. The ground truth `check-front-door` quantifies over.

```ts
/** Where the registry entry was derived from. */
export type OperationSource = 'command-tree' | 'skill-declaration';

export interface FrontedOperation {
  /** verb, "verb/sub-action", OR a skill-declared capability id (e.g. "spec-execution"). */
  readonly operationId: string;
  /** The sanctioned /stack-control:* skill that fronts it (frontmatter `name`). Non-empty. */
  readonly requiredSkill: string;
  readonly mediationClass: MediationClass;       // copied from the descriptor / capability
  readonly hasHelp: boolean;                      // does `verb [sub] --help` exit 0 with usage?
  readonly source: OperationSource;
}

export interface FrontedOperationsRegistry {
  readonly id: string;                            // e.g. "stack-control-fronted-operations-v1"
  readonly operations: readonly FrontedOperation[];
}
```

**Relationships / derivation (Decision 3).**
- `source: 'command-tree'` entries are built from `CommandDescriptor[]` — `operationId` is the verb or `verb/sub`, `mediationClass` from the descriptor, `requiredSkill` resolved by matching the verb to a `/stack-control:*` skill.
- `source: 'skill-declaration'` entries are built from `CAPABILITY_REGISTRY` (`src/capability/registry.ts`): each `Capability` contributes an entry per `interface` skill, `operationId` = the capability id (e.g. `spec-definition`, `spec-execution`), `mediationClass: 'mutating'` (capabilities front state-bearing backend drives), enumerating the in-session `/speckit-*` ops that are NOT verbs (FR-051).

**Validation.** The registry is *built, never stored* (FR-030). A `mutating` entry
with no mediation registration is a `check-front-door` failure (FR-031c); a
`read-only` entry is conformant without one (FR-050).

---

## 3. MediationMarker — EXTENSION (`src/capability/marker.ts`)

The session-keyed marker already exists (`FrontDoorMarker` with `ActiveEntry` stack,
staleness, lock). This feature adds recovery + list primitives; the *shape* is
unchanged (TASK-218's session-bound contents already landed — `readMarker` already
asserts the file-internal `sessionId` matches the requested session).

Existing shape (confirmed in source — do not redefine):

```ts
export interface ActiveEntry {
  readonly capability: string;
  readonly token: string;
  readonly writtenAt: string;   // ISO 8601 (staleness source)
}
export interface FrontDoorMarker {
  readonly sessionId: string;   // bound to the requested session (mismatch → throw)
  readonly active: readonly ActiveEntry[];
}
```

**NEW primitives (added alongside `enterFrontDoor`/`exitFrontDoor`):**

```ts
/** A tolerant read for `mediate-list`: reports corruption instead of throwing,
 *  so a wedged session is observable before it is cleared. */
export interface MarkerListResult {
  readonly sessionId: string;
  readonly entries: readonly (ActiveEntry & { readonly fresh: boolean })[];
  readonly corrupt: boolean;          // true when the file exists but is unparseable
}
export function listMarker(installRoot: string, session: string, opts?: MarkerOptions): MarkerListResult | null;

/** Recovery: delete the session's marker file atomically WITHOUT parsing it,
 *  so a corrupt file (which `readMarker` rejects) is still recoverable. No-op when absent. */
export function clearMarker(installRoot: string, session: string): void;
```

**State transitions.** `enter` pushes an `ActiveEntry`; `exit` removes the one
matching token; staleness prunes entries older than `STALE_AGE_MS` (12h) on
read/write; `clearMarker` removes the whole session file (recovery). `listMarker`
reads without mutating.

**Validation.** `assertSafeSession` guards every primitive (a `/` or `..` session id
is refused at the marker boundary). `listMarker`'s corrupt branch reports rather than
throws; `clearMarker` deletes by path (no parse), so corruption never blocks recovery.

---

## 4. BacklogItem terminal disposition — EXTENSION (`src/backlog/backend.ts`, `src/subcommands/backlog.ts`)

`BacklogItem` (id/title/status/type/labels/refs) and the backend's `close(id)` (sets
status to the terminal `Done`) already exist. This feature adds the *front-door
sub-actions* and an `archive` state. The terminal model is **one disposition
(`done`) + `--reason`, with `archive` separate** (Clarification 2026-06-19,
design Decision #3).

```ts
/** The lifecycle state of a captured item (derived from its backlog.md status/labels). */
export type BacklogItemState = 'open' | 'done' | 'archived';
```

| State | Set by | Meaning |
|---|---|---|
| `open` | `backlog capture` | live, not yet terminal |
| `done` | `backlog done <id> --reason <r>` | terminal disposition recorded through the interface (status → `Done`; `--reason` carries fixed-vs-wontfix nuance, mirrors `inbox drop`) |
| `archived` | `backlog archive <id>` | moved out of the live store while **preserved** (never deleted — "databases preserve") |

**State transitions.**
- `open → done` via `backlog done <id> --reason <r>` (re-points to the existing `backend.close`, so `roadmap close-related` and `backlog done` share ONE closure mechanism — FR-018).
- `done → archived` via `backlog archive <id>` (preserve-not-delete invariant).
- `open → open (unpromoted)` via `backlog unpromote <id>` — removes the promotion linkage `backlog promote` recorded (the inverse of `promote`).

**Validation / invariants.**
- **Preserve-not-delete (FR-011):** `archive` MUST move the item out of the live store while retaining the record; it MUST NOT delete. Asserted by a test that the archived record is still readable after archive.
- **Edge-aware archival (FR-017):** archiving/curating a terminal item that is still a `depends-on`/`part-of` target MUST NOT dangle the edge (cross-references the roadmap graph — §6).
- **Capture filename safety (FR-013):** `backlog capture` derives the on-disk filename via slugify + truncate within OS limits (no `ENAMETOOLONG`), and dedupes by `--ref` (`backend.exists(ref)`) rather than silently creating a duplicate.

---

## 5. RoadmapNode markers — EXTENSION (`src/roadmap/roadmap-model.ts`)

`WorkItem` already projects `designApproved` and `analyzeClean` as **read-only**
booleans (from the `design-approved:`/`analyze-clean:` edge fields). This feature
adds the **writing verb** (FR-016) so recording an approval is no longer a forbidden
hand-edit.

Existing shape (confirmed — do not redefine): `WorkItem.designApproved: boolean`,
`WorkItem.analyzeClean: boolean`, derived via `markerTrue(...)` from
`edgeTargets(unit, 'design-approved' | 'analyze-clean')`.

**NEW mutation (in `src/roadmap/mutations.ts`, surfaced by a roadmap sub-action):**

```ts
/** Write (or clear) a node's marker edge field, re-validating the graph (zero-write on failure). */
export type RoadmapMarker = 'design-approved' | 'analyze-clean';
export function setMarker(
  docPath: string,
  identifier: string,
  marker: RoadmapMarker,
  value: boolean,                 // true → record the marker; false/clear → negate
  opts: LoadOptions,
  apply: boolean,                 // dry-run unless true
): MutationResult;
```

**State transition.** `markerAbsent → markerRecorded` via the approve-design verb
(`--apply`). Symmetric for `analyze-clean`. The marker is a recorded fact (presence =
true), consistent with the existing `markerTrue` read semantics.

**Validation.** Like every roadmap mutation, `setMarker` computes a candidate
document, re-validates the whole graph (uniqueness/referential-integrity/acyclicity),
and only then writes — a failure leaves the document byte-for-byte unchanged
(the `mutations.ts` zero-write invariant).

---

## 6. RoadmapNode typed edges + edge mutation — EXTENSION (`src/roadmap/roadmap-model.ts`, `src/roadmap/mutations.ts`)

`WorkItem` already carries the typed edges: `dependsOn: readonly string[]`,
`partOf: readonly string[]` (multi-parent), `deferredUntil: string | null`. The
existing `add`/`advance`/`decompose`/`reclassify`/`defer`/`cluster` mutations cover
node creation and grouping. This feature adds the **edge-mutation and node-removal**
sub-actions (FR-014) plus the `--unorphan` reconcile assist (FR-015).

**NEW mutations (in `src/roadmap/mutations.ts`):**

```ts
export function addEdge(docPath: string, from: string, field: EdgeField, to: string, opts: LoadOptions, apply: boolean): MutationResult;
export function removeEdge(docPath: string, from: string, field: EdgeField, to: string, opts: LoadOptions, apply: boolean): MutationResult;
export function moveEdge(docPath: string, child: string, field: EdgeField, fromParent: string, toParent: string, opts: LoadOptions, apply: boolean): MutationResult; // reparent
export function renameNode(docPath: string, from: string, to: string, opts: LoadOptions, apply: boolean): MutationResult; // repoints dependents
export function removeNode(docPath: string, identifier: string, opts: LoadOptions, apply: boolean): MutationResult;       // edge-aware
```

where `EdgeField` is the existing typed edge vocabulary:

```ts
export type EdgeField = 'depends-on' | 'part-of' | 'deferred-until';
```

**State transitions.** Each is dry-run-by-default; `--apply` writes after a full
graph re-validation (the `mutations.ts` candidate-then-validate-then-write
discipline). `moveEdge` (reparent) = `removeEdge(fromParent) + addEdge(toParent)` in
one validated move. `removeNode` is **edge-aware**: removing a node that is still a
`depends-on`/`part-of` target either re-points/clears the dangling edges or refuses
loud (never leaves a dangling reference — the same referential-integrity guard
`loadDocument` already enforces at load).

**Validation / invariants (FR-014, FR-017).**
- Every edge mutation re-validates: **no cycle**, **no dangling ref**, **no duplicate id** — fail loud, zero-write on violation.
- `roadmap order` stays clean after a `move-edge` (US2 acceptance scenario 3): the reparent revalidates the topological order.
- **Edge-aware archival (FR-017):** archiving a terminal node that is a `depends-on`/`part-of` target does not dangle the edge — `curate`/archive consult the graph before removing.

**`reconcile --unorphan` (FR-015).** The existing `roadmap reconcile` is report-only
(`src/roadmap/reconcile.ts` reports `orphans`). The `--unorphan <spec>` assist
resolves a reported orphan spec dir into a node via the edge/node mutations above
(creating the node + `spec:` edge) without hand-editing ROADMAP.md — dry-run by
default, `--apply` to write, graph re-validated.
