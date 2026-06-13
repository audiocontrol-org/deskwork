# Data Model: Anchor Unification (016)

The feature is resolution-behavior, not new storage; the entities are in-memory contracts plus one new on-disk artifact (the seeded config copy).

## Domain

The unit of isolation and anchoring.

| Field | Type | Notes |
|---|---|---|
| `root` | absolute path | Directory containing `.stack-control/`; the domain is `root` + all descendants |
| `configPath` | absolute path | `<root>/.stack-control/config.yaml` (the marker; "installation" in existing code) |
| `config` | InstallationConfig | Parsed + validated by the existing loader |

**Invariants**:
- **No overlap (FR-013)**: for any two domains A ≠ B, neither root is an ancestor of the other. Violation is invalid state — refused at creation, detected loudly at resolution.
- A domain owns outright: its backlog store, audit logs (`specs/<feat>/audit-log.md`), run dirs (`.stack-control/audit-runs/`), config overrides, context file (CLAUDE.md marker).

**Lifecycle**: created only by `stackctl setup` (which now also seeds the barrage config); never implicitly.

## Anchor

The single resolved domain of one invocation.

| Field | Type | Notes |
|---|---|---|
| `domainRoot` | absolute path | The resolved domain's root |
| `source` | `'at-flag' \| 'cwd-walkup'` | How it was named; `at-flag` wins when present |

**Resolution algorithm** (`resolveAnchor`, R2):
1. `start = --at value (resolved absolute) ?? cwd`
2. Walk up from `start` to filesystem root collecting EVERY directory whose `.stack-control/config.yaml` exists.
3. 0 markers → throw `{ code: 'not-found' }` (wording class applies).
4. ≥2 markers → throw `{ code: 'overlap', roots: [...] }` (loud, names all roots; never nearest-first).
5. 1 marker → load + validate config (malformed → its own loud error, NOT the not-found class).

**State transitions**: none — an anchor is resolved once per invocation and is immutable; sub-steps receive it as a value (FR-001/FR-002).

## ConfigSource

Result of a configuration lookup inside a domain.

| Field | Type | Notes |
|---|---|---|
| `kind` | `'domain-override' \| 'plugin-default'` | The only two levels (R4) |
| `path` | absolute path | The file actually read |

Reported in run output (FR-004). Malformed override → loud failure, never fall-through to default.

## ResolverErrorClass

| Class | Trigger | Rendering |
|---|---|---|
| `not-found` | No domain encloses the anchor start | `<verb>: FATAL — <msg>` + `stackctl setup` remediation (frozen contract) |
| `overlap` | ≥2 nested markers on the walk | Loud error naming every root (new; no `FATAL — stackctl setup` class — setup is not the remediation) |
| other (`malformed-config`, escape/collision, …) | Pass-through | `<verb>: <msg>` verbatim, NO class (FR-009) |

One decision point: `classifyResolverError` (R8). All eight emission sites consume it.

## ExclusionSet (govern payload)

| Field | Type | Notes |
|---|---|---|
| `storePaths` | absolute path[] | The active backlog store (env override OR anchor's store) AND the anchor's committed store path when both exist (R7) |

**Invariant (FR-003)**: every member either rel-ifies inside the payload frame and is applied, or the run fails loud — a resolved-but-inert exclusion is an error, never a silent no-op.

## Fixture self-guard (test infrastructure)

| Check | When | Behavior |
|---|---|---|
| `resolveAnchor({ startDir: tmpdir() })` throws `not-found` | Fixture initialization (markerless + nested) | Pass → proceed; any domain resolved → fail loud with explanation BEFORE any verb runs (FR-010) |

## Relationships

```text
Invocation 1──1 Anchor 1──1 Domain
Domain 1──1 ConfigSource (per lookup; kind ∈ {domain-override, plugin-default})
Domain 1──1 backlog store, 1──N audit logs, 1──N run dirs
govern run 1──1 Anchor ──→ feature root, run-dir, audit-log, ExclusionSet, slush routing  (all derived)
```
