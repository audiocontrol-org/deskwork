# Front-Door Completeness — design record

**Roadmap item:** `multi:feature/front-door-completeness`
**Date:** 2026-06-19
**Phase:** designing (design backend: superpowers:brainstorming, driven in-session via /stack-control:design)
**Capture source:** `docs/front-door-completeness/plan.md` (repo root) + the three audit
artifacts in `plugins/stack-control/.runtime-cache/frontdoor-audit-{surface,backlog,roadmap}.md`.

> House rule re-injected at the scope-check step (FR-025a): **capture everything;
> scoping is a separate later pass.** Operator mandate 2026-06-19: the WHOLE front
> door, no tiers, no deferral, plus the governed guardrail.

---

## Problem domain

Spec 026 (capability-interface-mediation, shipped) put teeth in the front door: a
plugin-shipped PreToolUse hook + the per-phase graduate gate mean an agent can no
longer reach *around* the `/stack-control:*` skills to the raw backend. Correct and
load-bearing — but it converts every front-door **gap** from friction into a hard
wall. An adopter agent can now only do what the front door **sanctions**, and only
what it can **discover**.

The front door as built (ground truth 2026-06-19): **34 skills, 46 verbs, but only 2
verbs (`govern`, `roadmap`) are self-documenting; 37 emit no `--help` at all.** Three
classes of wall:

1. **Missing operations** — backlog cannot be closed (`done/close/archive`) or
   un-promoted through the interface; roadmap edges can't be mutated
   (reparent/add/remove/rename/remove-node); orphan spec dirs can't be reconciled —
   all of which now require a *forbidden* hand-edit.
2. **Undiscoverable surface** — 37/46 verbs have no `--help`; flags are discoverable
   only by reading source; several SKILL.md docs lag the real verb surface; some
   discovery output is actively wrong (session-start nominates a finished spec with a
   bogus next step; quotes a source-only path that 404s in host installs).
3. **Teeth that over-refuse with no escape** — a no-installation context refuses the
   adopter's *own* backend with an unsatisfiable redirect; a corrupt marker file
   permanently wedges a session with no recovery verb.

And nothing mechanically prevents the *next* backend verb from re-opening the gap.

**Root cause (why the operator's "myopic YAGNI" framing is correct):** the front door
grew as N parallel, independently-maintained surfaces — SKILL.md vs. the verb's real
flags vs. the source vs. (now) the mediation registry. Each was scoped narrowly and
the seams between them were never anyone's job. The walls are the drift between those
surfaces.

**Already resolved — explicitly NOT re-scoped:** `roadmap advance` exists with
`--help` (TASK-148 is stale); the entire `roadmap` family is self-documenting (027
shipped). These are the *proof* the chosen approach works.

## Solution space

The whole feature turns on ONE architectural question (surfaced by the operator's
"would OpenAPI help?" question): **what is the single source of truth for the command
surface, from which help + the registry + the conformance guardrail all derive?**
Get this right and the other gaps are mechanical; get it wrong (a second hand-
maintained surface) and we rebuild the exact drift that caused the walls.

### Alternative A — Command-tree as the single descriptor (CHOSEN)

The parser's command definitions (commander, already in use) ARE the descriptor — the
CLI-native analogue of an OpenAPI document. One definition per verb/sub-action carries
name, flags, types, required-ness, description. Everything derives from it:

- `--help` / `verb <sub> --help` for all 46 verbs (Phase 2) — generated, never drifts.
- An auto-generated verb reference (and, if wanted, a *generated* `oclif.manifest.json`
  / JSON-schema-per-command artifact for external consumers: docs site, cross-vendor
  parity, a future MCP exposure of `stackctl`).
- The **fronted-operations registry** (Phase 4) — derived by walking the tree, not
  hand-authored.
- `check-front-door` reads the *same* tree → the guardrail and the help can never
  disagree.

The one thing the command tree does NOT cover — and the heart of the guardrail — is
the **skill ↔ verb seam**: `check-front-door` separately scans the `/stack-control:*`
SKILL.md frontmatter and asserts parity in BOTH directions (every fronted verb has a
skill; every skill's documented verbs/flags exist in the tree). This is the cross-
surface assertion neither commander nor OpenAPI gives for free.

### Alternative B — Hand-authored YAML registry of fronted operations (REJECTED)

Mirror the scope-discovery pattern (`anti-patterns.yaml`, `adopter-manifests.yaml`):
a maintained manifest listing each fronted operation + its required skill/verb/flags,
which `check-front-door` validates against.
**Rejected:** it is a *second source of truth* that drifts from the actual commander
definitions — it reproduces the precise failure mode (surface drift) this feature
exists to kill. A registry is needed, but it must be *derived* (Alt A), not authored.

### Alternative C — OpenAPI / JSON-schema document as the source (REJECTED)

Adopt OpenAPI (or a hand-written JSON-schema-per-command) as the authoritative
descriptor and generate the CLI/help/checks from it.
**Rejected:** OpenAPI is HTTP/request-response-shaped; a CLI (argv → exit code +
stdout) is an impedance mismatch. As a *source* it must itself be hand-maintained
(→ drift, = Alt B) or generated from the command tree (→ = Alt A with an extra hop).
As a *generated downstream artifact* for external consumers it is welcome — but it is
an output of Alt A, not the source.

### Secondary forks (decided; see Decisions)

- Backlog terminal-state model (distinct states vs. one terminal + reason).
- Skill granularity for new operations (sub-actions of existing skills vs. new skills).
- No-installation discrimination rule for the interceptor (the hardest sub-problem).
- Parser-rollout sequencing (big-bang vs. family-by-family behind the gate).
- Relationship to the overlapping `lifecycle-industrialization` umbrella.

## Decisions

1. **Single source of truth = the commander command tree (Alt A).** Resolves plan
   open-fork #4. Help, the verb reference, the fronted-operations registry, and
   `check-front-door` all derive from it. Any OpenAPI/manifest artifact is generated
   downstream, never authored.
2. **`check-front-door` spans BOTH surfaces.** It asserts, for every registered
   operation: (a) a `/stack-control:*` skill exists; (b) the verb + each sub-action
   emit working `--help` (exit 0) derived from the tree; (c) mutation-bearing ops are
   mediation-registered; (d) skill↔verb parity in both directions. Non-zero exit on
   any gap, proven by a RED test (deleting a skill / breaking a `--help` / adding an
   unfronted verb fails the gate). Wired into session-start (advisory) +
   implement/review (gate) per `enforcement-lives-in-skills` — never a git hook.
3. **Backlog terminal-state model: one terminal disposition + reason, with `archive`
   as a separate lean-keeping move.** `backlog done <id> --reason` records terminal
   closure through the interface (mirrors `inbox drop`); `backlog archive` moves
   terminal items out of the live store (mirrors the document `archive`/`curate`
   pattern) — it does NOT delete (project rule: databases preserve). The existing
   `roadmap close-related` side-effect path is kept and re-pointed to call the new
   direct verb so there is one closure mechanism, not two. (Revisit in spec if the
   operator wants distinct `closed` vs `done` semantics.)
4. **New operations are sub-actions of existing skills, not new skills.** `backlog
   done/archive/unpromote`, `roadmap add-edge/remove-edge/move-edge/rename/remove-node`,
   `roadmap reconcile --unorphan`. Keeps the `/` picker UNIX-style and bounds skill
   count. New skills only for genuinely new surfaces (the guardrail:
   `/stack-control:check-front-door`; the recovery verb may live under the existing
   `front-door`/`mediate-*` family).
5. **No-installation discrimination (TASK-201): mediation only applies *inside* an
   installation.** The front door only exists where a stack-control installation
   anchors a capability registry. With no enclosing installation there is nothing to
   front — so the interceptor MUST NOT refuse: an adopter's own backend call in a
   non-installation context is theirs, not a bypass. Refusal fires only when (a) an
   installation encloses the cwd AND (b) the call targets a registered fronted
   capability AND (c) no sanctioned marker authorizes it. This makes the redirect
   always satisfiable (a refusal implies an installation exists, so `setup` is never
   the dead-end advice TASK-201 reported).
6. **Recovery is always possible through a sanctioned verb (TASK-209).** A
   `front-door reset` / `mediate-recover --session <id>` lists and clears markers; a
   corrupt marker is recoverable without hand-editing YAML. A session must never be
   unrecoverable through the interface.
7. **Parser rollout is family-by-family behind the gate, not big-bang.** Each verb
   family migrates onto the self-documenting tree and `check-front-door` ratchets:
   once a family is green it cannot regress. The gate (not a calendar) is the
   completion proof. (Sequencing within the feature; not a scope cut — all 46 land.)
8. **Overlap with `lifecycle-industrialization` is resolved by ownership, not
   exclusion.** `release-resolution-cycle` (TASK-134) and `backlog-promotion-
   mechanization` (TASK-135) are *ceremony mechanization* — their raw operations
   (`backlog promote`, `roadmap add`) already exist and are fronted, so
   front-door-completeness only asserts those raw ops are present + discoverable +
   `--help`'d; the *mechanized one-move convenience* is BUILT under
   lifecycle-industrialization. The genuinely-missing operations from that cluster —
   `reconcile --unorphan` (TASK-133), backlog close/unpromote, roadmap edge mutation —
   are owned and built HERE. Multi-membership (`part-of` both umbrellas) stays; the
   build-ownership split prevents double-implementation.

## Open questions

(carry into /stack-control:define)


1. **Mediation scope of read-only query verbs.** Should `roadmap next/blocked/graph`,
   `backlog list`, `session-start` be mediation-exempt (they mutate nothing) so the
   interceptor only ever gates mutation-bearing ops? Leaning yes — confirm against the
   026 contract during spec.
2. **Registry derivation for in-session `/speckit-*` operations.** The fronted backend
   ops include in-session Spec Kit steps driven by `execute`/`define`, which are NOT
   `stackctl` verbs in the command tree. How does `check-front-door` enumerate those
   (skill-declared capability ids vs. a small explicit supplement)? Needs a concrete
   mechanism in the spec.
3. **`check-front-door` failure granularity in CI vs. local.** Per project rule "no
   test infrastructure in CI" — the gate is a local pre-PR smoke + an
   implement/review skill-body gate, not a CI job. Confirm the exact firing surfaces.
4. **Distinct `closed` vs `done` backlog semantics** — decision #3 picks one terminal
   disposition; revisit if the operator wants a richer terminal vocabulary.
5. **Generated OpenAPI-analogue artifact: ship it or not in v1?** The command tree can
   emit a JSON-schema/manifest for external consumers; decide whether that artifact is
   in scope now or a follow-on (it is downstream of Alt A either way).

## Provenance

- Operator mandate (2026-06-19): one umbrella, whole front door, no scope cuts, build
  the guardrail. AskUserQuestion answers: packaging = "One umbrella feature";
  guardrail = "Yes — build the check"; first-push = comprehensive (scope-cut framing
  rejected).
- Operator design steer (2026-06-19): "would it help to use api descriptor tooling
  like openapi?" → resolved as Decision #1 (command-tree-as-descriptor; OpenAPI as a
  generated downstream artifact only).
- Audit basis: `frontdoor-audit-surface.md` (34 skills / 46 verbs / 2 self-documenting),
  `frontdoor-audit-backlog.md` (front-door-gap census, ~41 items), `frontdoor-audit-
  roadmap.md` (planned-coverage map). Captured plan: `docs/front-door-completeness/plan.md`.
- Settled foundations honored: `governed-markdown-foundation` ADR (adopt a parser
  library; help derives from one command definition — Decision #1 is its direct
  application); `enforcement-lives-in-skills` (Decision #2 firing surfaces); "databases
  preserve" (Decision #3 archive-not-delete).
- Backlog ids in scope (non-exhaustive): TASK-297, 23, 38, 137, 242, 133, 21 (Phase 1);
  TASK-26, 291, 204, 217, 205, 213, 130, 147, 69, 294, 211 (Phase 2); TASK-201, 209,
  221, 215, 218, 203, 164, 165, 194, 197, 193, 191 (Phase 3); TASK-195, 207, 210, 219,
  222 (Phase 4 — interceptor-loaded proof).
