# Contract: Fronted-Operations Registry

**Feature**: `028-front-door-completeness` | **Phase**: 1 | Satisfies FR-030/050/051; SC-006.

The derived ground truth of operations that must be fronted, discoverable, and
(where mutating) mediated. Built — never hand-authored as the source of truth
(FR-030). Module: `src/capability/fronted-operations.ts` (Decision 3).

---

## R1 — Derivation contract

**Signature.** `buildFrontedOperationsRegistry(deps): FrontedOperationsRegistry`,
composing two existing sources:
1. **The command surface** (`CommandDescriptor[]` from `src/cli-help/command-surface.ts`) → one entry per verb/sub-action, `source: 'command-tree'`.
2. **The capability registry** (`CAPABILITY_REGISTRY` in `src/capability/registry.ts`) → one entry per `Capability.interface` skill for each capability that fronts in-session `/speckit-*` ops, `source: 'skill-declaration'`.

**Invariant (FR-030).** The registry is built on every invocation from these
sources. There is NO `fronted-operations.yaml`. A test asserts that mutating the
command tree (adding a verb) changes the built registry without any manifest edit.

**Invariant (FR-051).** In-session `/speckit-*` ops (driven by `execute`/`define`,
not `stackctl` verbs) are enumerated from the capability registry's capability
entries (e.g. `spec-definition` → `/stack-control:define`|`extend`;
`spec-execution` → `/stack-control:execute`). This is the SAME declaration 026
mediation uses — there is no separate hand-authored supplement (single source per
skill).

---

## R2 — Entry schema

Each `FrontedOperation` (see data-model §2):

| Field | Source | Meaning |
|---|---|---|
| `operationId` | command-tree: `verb` or `verb/sub`; skill-declaration: capability id | the fronted operation's identity |
| `requiredSkill` | matched `/stack-control:*` skill (`name` frontmatter) | the sanctioned interface; non-empty |
| `mediationClass` | descriptor (command-tree) / capability (skill-declaration) | `mutating` \| `read-only` |
| `hasHelp` | does `verb [sub] --help` exit 0 with usage? | discoverability state |
| `source` | `command-tree` \| `skill-declaration` | derivation origin |

---

## R3 — Mediation-class contract (FR-050)

**Contract.** Each entry records its mediation class. A `read-only` query verb
(`roadmap next/blocked/blocks/order/graph`, `backlog list`, `session-start`) is
**mediation-exempt**: it is conformant WITHOUT a mediation registration. Only
`mutating` entries are subject to FR-031c's mediation-registered assertion.

The class is **declared on the descriptor** (Decision 4), not inferred from the
`--apply` grammar bit — a mutating op that lacks an explicit class is unregistered
and fails `check-front-door` (rather than silently defaulting to read-only and
escaping mediation).

**Satisfies.** FR-050 (resolves spec open question #1).

---

## R4 — Outputs

**Success.** `buildFrontedOperationsRegistry` returns a `FrontedOperationsRegistry`
with `id` + `operations[]`. Consumed by `check-front-door` (the four assertions) and
optionally surfaced read-only for discovery.

**Error.** A capability with an empty `interface` (no fronting skill) fails loud via
the existing `validateRegistry` (`src/capability/registry.ts`); a command-tree entry
with no matching `/stack-control:*` skill becomes a `check-front-door` gap (R/
contracts/check-front-door.md C2a), not a silent omission.

**Satisfies.** FR-030, FR-050, FR-051.
