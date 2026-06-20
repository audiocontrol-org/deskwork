# Phase 0 Research: Front-Door Completeness

**Feature**: `028-front-door-completeness` | **Date**: 2026-06-19 | **Plan**: [plan.md](./plan.md)

This document records the key technical decisions that resolve the spec's open
questions and the plan's Technical Context into concrete, buildable mechanisms.
Each decision is grounded in the real source confirmed by reading the tree (paths
cited are verbatim). The load-bearing architectural decision — the commander
command tree is the single source of truth — was settled in the approved design
record (`docs/superpowers/specs/2026-06-19-front-door-completeness-design.md`,
Decision #1) and is encoded, not re-litigated, here.

The current state confirmed by source reading:

- `src/cli.ts` dispatches all 46 verbs through a flat `SUBCOMMANDS: Record<string, Subcommand>` map; only `roadmap` is mounted on commander (`src/subcommands/roadmap-command.ts`). The dispatcher's own `--help` prints a bare `Verbs: …` join — there is no per-verb usage.
- `src/cli-help/roadmap-help.ts` is the proven self-documenting surface: it renders `roadmap --help`, `roadmap <sub> --help`, and the no-subaction usage line from `SUBACTION_SPECS` (the same grammar the parser enforces) plus a `SUMMARIES` table with a completeness guard.
- `src/cli-help/command-adapter.ts` is the typed seam (`rawOpts`, `stringOption`, `booleanOption`, `optionalStringOption`) that narrows commander's `any`-typed options into typed flags with zero `as`/`any`.
- The 026 mediation core is real and read-only: `src/capability/registry.ts` (the `CapabilityRegistry` with `spec-definition`/`spec-execution`/`backlog` capabilities), `src/capability/mediate.ts` (`decideMediation`), `src/capability/marker.ts` (session-keyed marker stack with staleness + lock), `src/capability/intercept.ts` (`interceptDecision`), `src/subcommands/mediate-check.ts`, `src/subcommands/front-door.ts` (`enter`/`exit`).
- `src/subcommands/mediate-check.ts` already resolves the enclosing installation via `findInstallation(at)` and returns an empty active set when none is found — the installation-scoping primitive for FR-020 partly exists but the refusal still fires (an empty active set → `decideMediation` refuses a fronted backend even with no installation).

---

## Decision 1 — Generalize `command-adapter.ts` + `roadmap-help.ts` into a single command-surface descriptor

**Decision.** Introduce `src/cli-help/command-surface.ts` as the single typed
descriptor of the entire command surface: one `CommandDescriptor` per verb, each
carrying its sub-actions, flags (name/arg/required/description), and a
mediation-class tag. The existing `roadmap-help.ts` rendering and the
`command-adapter.ts` typed readers are the *proven pattern*; this generalizes them
so that `--help`, the auto-generated verb reference, the generated descriptor
artifact, the fronted-operations registry, and `check-front-door` all read the
same descriptor. Verbs migrate family-by-family onto commander mounts (mirroring
`roadmap-command.ts`); each mount derives its `--help` from the descriptor, never
from a hand-written usage string.

The descriptor is *derived from the commander command definitions* — the
commander `Command` tree IS the source, and `command-surface.ts` walks it (the
same way `roadmap-command.ts` builds a `Command` from `SUBACTION_SPECS` and
`roadmap-help.ts` renders from that grammar). For a multi-action verb like
`roadmap`/`backlog`/`workflow`/`inbox`, each sub-action is a child `Command`; for
a single-action verb the descriptor has one node with no sub-actions.

**Rationale.** The root cause named in the spec is N parallel hand-maintained
surfaces drifting apart. A second authored description of the surface (even a
help string) re-introduces the drift. Deriving every consumer from one commander
tree makes drift structurally impossible: `--help` and `check-front-door` read
the same node, so they cannot disagree (design Decision #2). The pattern is
already field-proven on `roadmap` (027) — generalization is lower risk than a
rebuild and honors the governed-markdown-foundation ADR ("adopt a parser library;
help derives from one command definition").

**Alternatives considered.**
- *Keep the flat `SUBCOMMANDS` map and hand-write a `--help` per verb* — rejected: 46 hand-written help strings are 46 new drift sites, the exact failure this feature kills.
- *A separate `help-registry.ts` table keyed by verb name* — rejected: a second source of truth that drifts from the actual parser (= design Alternative B).
- *Migrate all 46 verbs in one big-bang commit* — rejected for sequencing (design Decision #7): family-by-family behind the `check-front-door` ratchet so partial progress cannot regress; the final state is still all 46 on the surface.

---

## Decision 2 — Generated descriptor artifact: oclif-manifest-style JSON, generated from the tree, round-trip tested

**Decision.** The generated descriptor artifact (FR-052) is an **oclif-manifest-style
JSON document** — a flat `{ commands: { "<verb>": { description, mediationClass,
subActions: { "<sub>": { description, flags: { "<flag>": { arg, required,
description } } } }, flags: {…} } } }` shape — NOT an OpenAPI document. It is
emitted by `src/cli-help/verb-reference.ts` (`emitDescriptorArtifact()`) by walking
the same commander tree the `--help` renderer walks. A round-trip test asserts the
artifact contains exactly the verbs/sub-actions/flags the live command tree exposes
(no extra, no missing).

**Rationale.** A CLI is `argv → exit code + stdout`; OpenAPI is HTTP
request/response-shaped — an impedance mismatch as a *source* (design Alternative
C). The oclif `manifest` shape is the commodity CLI-native analogue: a command →
flags tree, which is exactly the descriptor's shape, so the mapping is lossless and
the round-trip test is a structural equality check rather than a translation. The
artifact is a *downstream output* (FR-041 — never authored), so its only contract is
"round-trips the tree"; external consumers (docs site, MCP exposure, cross-vendor
parity) read it without it ever becoming a second source.

**Alternatives considered.**
- *OpenAPI 3.x as the emitted artifact* — rejected as the v1 shape: the request/response envelope adds nothing for a CLI and obscures the verb→flags structure the round-trip test needs to compare. An OpenAPI projection can be added later as a second downstream emitter off the same descriptor if an HTTP/MCP consumer needs it; it is not the source and not v1.
- *JSON-schema-per-command files* — rejected for v1: more files, same information; a single manifest is simpler to round-trip and ship as one CLI artifact (`stackctl <reference-verb> --json` or a build emitter).

---

## Decision 3 — Fronted-operations registry derived from the command tree + the capability registry

**Decision.** `src/capability/fronted-operations.ts` builds the
`FrontedOperationsRegistry` by composing two existing sources, never a hand-authored
manifest:
1. **The command surface** (Decision 1) — every `stackctl` verb/sub-action becomes a registry entry with `source: 'command-tree'`, its mediation-class read from the descriptor.
2. **The capability registry** (`src/capability/registry.ts` `CAPABILITY_REGISTRY`) — each `Capability.interface` skill + its `backendIdentities` declares the in-session `/speckit-*` fronted ops that are NOT `stackctl` verbs (e.g. `spec-definition` fronts `/stack-control:define`|`extend` over `speckit-specify…speckit-analyze`; `spec-execution` fronts `/stack-control:execute` over `speckit-implement`). These become entries with `source: 'skill-declaration'`.

The registry is the ground truth `check-front-door` quantifies over. It is built,
not stored. FR-051's "skill-declared capability ids" are exactly the
`CapabilityRegistry` capability entries — that registry IS the per-skill capability
declaration 026 already uses; there is no separate hand-authored supplement.

**Rationale.** FR-030 mandates derivation; the design rejected a maintained YAML
registry (Alternative B) because it drifts. The command tree covers `stackctl`
verbs but cannot see in-session `/speckit-*` steps (they are not verbs). The 026
capability registry already enumerates those backend ops behind each skill — reusing
it (rather than inventing a second declaration site) keeps a single source per skill
(FR-051) and means adding a fronted backend is a registry entry, not new registry-
derivation code.

**Alternatives considered.**
- *A `fronted-operations.yaml` manifest* — rejected (design Alternative B): second source of truth, the drift this feature exists to kill.
- *A new `capabilities:` frontmatter block in each SKILL.md* — rejected for v1: the `CapabilityRegistry` already carries the skill↔capability↔backend mapping; a second declaration in frontmatter would have to be kept consistent with the registry (drift). If per-skill frontmatter is wanted later it becomes a generated artifact OF the registry, not an authored second source.

---

## Decision 4 — Mediation-class (read-only vs mutation) declared on the descriptor

**Decision.** Each `CommandDescriptor` node (verb and sub-action) carries an
explicit `mediationClass: 'mutating' | 'read-only'` field, declared at the point the
command is defined (the same place its flags are declared). The fronted-operations
registry copies this onto each entry. `check-front-door`'s FR-031c assertion
("mutation-bearing ops are mediation-registered") reads this class and applies the
mediation-registration check ONLY to `mutating` entries; a `read-only` entry is
conformant without a mediation registration (FR-050). The interceptor's refusal
(`decideMediation`) is correspondingly gated so it never refuses a read-only
fronted op.

The classification is *declarative and local*, not inferred. A sub-action that
already gates writes behind `--apply` (every roadmap/backlog mutation) is
`mutating`; a pure query (`roadmap next/blocked/blocks/order/graph`, `backlog list`,
`session-start`) is `read-only`. The descriptor's `apply` grammar bit is evidence
but NOT the classifier — `read-only` is asserted explicitly so a future write path
without `--apply` cannot silently inherit "read-only".

**Rationale.** FR-050 resolves the spec's open question #1: mediation gates only
state-bearing ops, so a read-only query is never marker-bracketed and never refused.
Making the class a declared field (not derived from `apply`) keeps the assertion
mechanical and fail-loud: a new mutating verb that forgets its class is caught by
`check-front-door` (an unclassified mutating op is unregistered → RED), rather than
silently defaulting to "read-only" and escaping mediation.

**Alternatives considered.**
- *Infer read-only from the absence of `--apply`* — rejected: couples the mediation class to an unrelated grammar bit; a mutating verb without an `--apply` dry-run (e.g. a recovery verb) would be misclassified read-only and escape the registry check.
- *A hard-coded list of read-only verb names in `check-front-door`* — rejected: a second source that drifts from the command definitions.

---

## Decision 5 — Installation-scoped mediation (FR-020) via anchor resolution

**Decision.** Mediation fires only when an installation anchor encloses the cwd. The
interceptor and `mediate-check` resolve the enclosing installation with the existing
`findInstallation(at)` (`src/config/installation.ts`, already called in
`mediate-check.ts`); when it returns `null` (no enclosing installation) the decision
is **permit** — the interceptor MUST NOT refuse an adopter's own backend in a
non-installation context. The refusal path is reached only when (a) `findInstallation`
resolves a root AND (b) the call matches a registered fronted capability AND (c) no
active marker authorizes it. This makes a refusal *imply* an installation exists, so
the `stackctl setup` redirect is always satisfiable (never the dead-end FR-020/
TASK-201 reported).

Concretely: `mediate-check.ts`'s `defaultResolveActive` already returns `new Set()`
when `findInstallation` is `null`, but `decideMediation` then refuses a fronted
backend on an empty set. The fix moves the no-installation check ahead of the
decision: a `null` installation short-circuits to permit BEFORE `decideMediation`
runs, rather than relying on an empty active set (which means "installation exists,
nothing bracketed" — a refusal, the opposite verdict).

**Rationale.** The front door only exists where an installation anchors a capability
registry (design Decision #5). With nothing to front, there is nothing to mediate;
refusing is the over-refusal the spec names. Anchoring on `findInstallation` (the
same resolver every other installation-scoped verb uses) keeps the discrimination
rule single-sourced and correct from any cwd.

**Alternatives considered.**
- *Refuse-by-default and rely on the redirect* — rejected: the redirect (`run stackctl setup`) is unsatisfiable when there is no installation and the adopter does not want one — an unescapable wall (the FR-020 bug).
- *Check for a `.stack-control/` marker dir directly* — rejected: `findInstallation` already encodes the half-installation/escape/collision rules; re-deriving the anchor test would drift from it.

---

## Decision 6 — Recovery verbs: `front-door reset` / `mediate-recover` / `mediate-list`, session-scoped, list-and-clear

**Decision.** Extend the existing `front-door` family (`src/subcommands/front-door.ts`)
and marker module (`src/capability/marker.ts`) with three sanctioned, session-scoped
recovery sub-actions:
- `front-door mediate-list --session <id>` — read the marker for a session and print each active entry (capability, token, writtenAt, fresh/stale). Read-only.
- `front-door mediate-recover --session <id>` (alias `front-door reset --session <id>`) — clear the marker file for a session (list-then-remove), unblocking a wedged/corrupt/stale marker in one command. Mutating.

These add a `listMarker(installRoot, session)` and `clearMarker(installRoot, session)`
primitive to `marker.ts` (sitting alongside `enterFrontDoor`/`exitFrontDoor`,
sharing `withMarkerLock` and `markerPath`). `clearMarker` removes the session's
marker file atomically (a corrupt file that fails `readMarker`'s JSON/shape
validation is still removable — recovery must not require a readable marker, so
`clearMarker` deletes by path without parsing). Both honor `assertSafeSession`.

**Rationale.** FR-021/022 require a one-command recovery with no YAML hand-edit, and
a session must never be unrecoverable through the interface (design Decision #6). The
corrupt-marker case is the hard one: `readMarker` deliberately throws on malformed
JSON (Principle V), so `mediate-recover` cannot route through it — it deletes the
file directly. `mediate-list` uses a *tolerant* read that reports "corrupt
(unparseable)" rather than throwing, so the operator can see the wedged state before
clearing it.

**Alternatives considered.**
- *A global `front-door reset` that clears all sessions* — rejected: a nested/parallel drive in another session would lose its marker; recovery is session-scoped to preserve the 026 nesting-isolation invariant.
- *Make `mediate-recover` go through `exitFrontDoor`* — rejected: `exit` clears one token and reads the marker first (throws on corruption); recovery must clear a corrupt file the read path rejects, so it deletes by path.

---

## Decision 7 — Session-binding + cwd/session-id linchpin reconciliation (FR-023)

**Decision.** The marker already binds its file-internal `sessionId` to the requested
session (`marker.ts` `readMarker` throws on a `sessionId` mismatch — confirmed in
source, TASK-218 already landed that). The remaining reconciliation (FR-023 / TASK-164,
203) is the **cwd linchpin**: `front-door enter` anchors the marker at
`findInstallation(cwd).root`, and a later sanctioned drive (`mediate-check` /
interceptor) must resolve the SAME installation root from a possibly-drifted cwd. The
decision: both `enter` and the mediation check resolve the installation root via
`findInstallation` from their respective cwds, and because the marker is keyed by
(installation-root, session-id) — not by raw cwd — a cwd that drifts *within the same
installation* resolves the same marker. A drive whose cwd has left the installation
correctly resolves no installation → permit (Decision 5), never a silent refusal.

`enter` and `exit` are separate tool calls, so the token cannot survive in a shell
var (already guarded in `front-door.ts`); the agent passes the literal token `enter`
printed. No new state is needed — the reconciliation is "key on the resolved
installation root, not cwd," which the marker module already does.

**Rationale.** The "silently refused right after a successful enter" failure
(FR-023, US3 scenario 4) is a cwd/anchor mismatch: if `enter` anchored at root A and
the drive resolved root B, the marker is invisible. Keying both on
`findInstallation(...).root` makes them agree as long as the cwd stays inside the
installation, which is the only case where a sanctioned drive should be permitted.
Cross-references: TASK-164 (linchpin), TASK-203 (cwd drift), TASK-218 (session-bound
contents, already shipped — `readMarker` mismatch guard).

**Alternatives considered.**
- *Bind the marker to the raw cwd string* — rejected: any cd within the installation would orphan the marker; that IS the FR-023 bug.
- *Pass the installation root explicitly on every call* — rejected: the agent does not know it; `findInstallation` is the single resolver and is already wired.

---

## Decision 8 — Interceptor cold-start, fail-open, staleness (FR-025)

**Decision.** Three sub-decisions, all extending existing mechanisms:
- **Fail-open is signalled, not silent (FR-025).** When the interceptor cannot reach `stackctl` (crash / spawn failure), `bin/intercept` permits (best-effort, per 026 FR-014) but writes a visible skip notice to stderr (a `hookSpecificOutput` with a `permissionDecisionReason` noting the skip, or a stderr line) rather than permitting silently. The load-bearing guarantee remains the per-phase graduate gate, so a fail-open is degraded-but-safe, but it must be *observable*.
- **Staleness must not prune an actively-bracketed drive (FR-025).** `marker.ts`'s `STALE_AGE_MS` (12h) prunes leaked entries. The decision keeps the 12h bound (already documented as the leak/long-drive tradeoff in source) but adds the test that an `enter`-bracketed drive within the bound is never pruned mid-drive — the existing `isFresh` check already preserves this; the work is the regression test, not a mechanism change.
- **Cold-start cost (FR-025 / TASK-191).** The interceptor fires on EVERY Bash/Skill tool use. The existing cheap pre-filter (`interceptDecision` matches identity FIRST, with no marker I/O, and permits a non-backend without reading disk — confirmed in `intercept.ts`) is the bound; this feature keeps it and adds a measurement assertion that a non-backend call resolves with zero marker reads. No per-invocation `stackctl` spawn for the common (non-backend) case.

**Rationale.** FR-025 names three distinct hazards; each maps to a real line in the
026 source. The pre-filter and `isFresh` already exist — the decisions are to keep
them, make fail-open observable, and pin them with tests (Principle I). Cross-refs:
TASK-191 (cold-start), TASK-197 (staleness), TASK-193 (fail-open signal).

**Alternatives considered.**
- *Lower `STALE_AGE_MS` to self-heal leaks faster* — rejected: a long interactive drive within the lower bound would be pruned mid-drive and the sanctioned call refused (the documented tradeoff). 12h stays.
- *Cache the registry/marker in the interceptor process* — N/A: the interceptor is a fresh process per hook invocation; the pre-filter (no I/O for non-backends) is the real cold-start mitigation.

---

## Decision 9 — `check-front-door` firing surfaces honor "no test infrastructure in CI"

**Decision.** `check-front-door` (the verb) and its doctor rule fire from three
surfaces, none of them a CI job and none of them a git hook (per
`enforcement-lives-in-skills`):
1. **Local pre-PR smoke** — a `scripts/smoke-front-door.sh` (run by hand pre-PR/pre-tag) that invokes `stackctl check-front-door` and the interceptor-loaded smoke (Decision 10).
2. **`session-start` advisory** — `session-start` runs `check-front-door` and reports the count of gaps as a non-blocking snapshot (it never refuses).
3. **`implement` / `review` skill-body gate** — the gate that refuses to proceed when `check-front-door` is RED, wired into the skill bodies (the same place 026's graduate gate lives).

**Rationale.** FR-034 mandates these exact surfaces and forbids a git hook; the
project rule "No test infrastructure in CI" (CI here is brutally slow) forbids a CI
job. This mirrors the existing scope-discovery enforcement shape: advisory at
session-start, gate at implement/review, local smoke pre-PR.

**Alternatives considered.**
- *A `.husky/pre-push` hook running `check-front-door`* — rejected hard (`enforcement-lives-in-skills`): the discipline must travel with `claude plugin install`, not a hook the adopter wires.
- *A GitHub Actions job* — rejected (project rule): CI is too slow; gates are local + skill-body.

---

## Decision 10 — Interceptor-loaded smoke (FR-035): prove `hooks/hooks.json` is registered and fires

**Decision.** A smoke (`scripts/smoke-interceptor-loaded.sh`, run locally, asserted
by a vitest integration test under `src/__tests__/`) proves two things:
1. **Registration** — `hooks/hooks.json` exists, declares a `PreToolUse` matcher for both `Bash` and `Skill`, dispatching to `${CLAUDE_PLUGIN_ROOT}/bin/intercept`; and the plugin manifest (`.claude-plugin/plugin.json`) references/ships the hooks file so Claude Code auto-discovers it on install. (Source confirmed: `hooks/hooks.json` already has both matchers.)
2. **Firing** — feed `bin/intercept` a synthetic PreToolUse payload for a fronted backend with no marker and assert it emits the `deny` `hookSpecificOutput` (the `denyOutput` shape in `intercept.ts`); feed it a non-backend payload and assert it permits. This proves the adapter is wired to the decision core end-to-end, not merely present.

**Rationale.** FR-035 / US4 scenario 5: the teeth must be provably loaded and
firing, never silently inert. Registration alone (the file exists) does not prove the
adapter dispatches; the firing assertion drives `bin/intercept` with a real payload
and checks the deny/permit output. This is the operator-perceivable assertion (a
denied call) rather than a class-name presence check.

**Alternatives considered.**
- *Assert only that `hooks/hooks.json` exists and is valid JSON* — rejected: a present-but-misrouted hook (wrong matcher, wrong command path) passes that check while the teeth are inert; the firing assertion catches it.
- *Drive a full Claude Code session to observe a real deny* — rejected: non-deterministic and not a local smoke; feeding `bin/intercept` the documented PreToolUse payload shape is deterministic and proves the same wiring.

---

## Cross-cutting constraints honored

- **Strict typing.** The descriptor, registry, and recovery primitives are typed; no `any`/`as`/`@ts-ignore`. The one untyped boundary (commander's `OptionValues`) stays sealed in `command-adapter.ts` (`rawOpts` → typed readers), the proven 027 pattern.
- **`@/` imports / relative ESM.** New modules follow the in-tree relative-ESM import style the existing `src/` uses (`.js` extensions on relative imports, confirmed across the tree).
- **File-size cap.** `command-surface.ts`, `verb-reference.ts`, `fronted-operations.ts`, and `check-front-door.ts` each stay under 300–500 lines; the family migrations extend existing per-verb modules rather than centralizing into one large file.
- **No fallbacks / fail-loud.** A missing skill/verb/help → `check-front-door` exits non-zero naming the gap; a malformed registry → `validateRegistry` violations; recovery's tolerant read reports corruption rather than masking it.
- **Test-First.** Every new verb, `check-front-door` (with the three FR-033 RED cases), the descriptor round-trip (FR-052), and the interceptor-loaded smoke (FR-035) ship RED-first.
