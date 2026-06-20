# Front-Door Completeness — comprehensive remediation plan

**Status:** capture (pre-spec). Operator mandate 2026-06-19: one umbrella feature,
the WHOLE front door, comprehensive — no tiers, no "v1 subset," no deferral. Build
the governed guardrail too. This document is the anti-scope-cut capture: it
enumerates every operation so the downstream spec cannot silently drop any of it.

> Operator, verbatim: *"What got us here is myopic false YAGNI bullshit that,
> coupled with the pathologically short memory of coding agents obsessed with
> cutting as much scope as possible, has left us with an unusable system. THE WHOLE
> FRONTEND MUST WORK OR NONE OF IT IS FUNCTIONAL."*

---

## Why now (the forcing function)

Spec 026 (capability-interface-mediation, shipped) put **teeth** in the front door:
a plugin-shipped PreToolUse hook + the per-phase graduate gate mean an agent can no
longer reach *around* the `/stack-control:*` skills to the raw backend. That is
correct and load-bearing. But it converts every front-door **gap** from mild
friction into a hard wall: an adopter agent can now only do what the front door
**sanctions**, and only what it can **discover**. The front door as built is
incomplete (missing operations), undiscoverable (37/46 verbs have no `--help`), and
the teeth over-refuse with no recovery path. Net effect for an adopter: unusable.

## The invariant (north star)

> **Every backend operation reachable before 026 MUST have all three of:**
> 1. a **sanctioned front-door path** — a `/stack-control:*` skill AND a `stackctl`
>    verb/sub-action;
> 2. **self-documenting discoverability** — `verb --help` and `verb <sub> --help`
>    return usage (flags + sub-actions + descriptions, exit 0); the skill appears in
>    the `/` picker; its SKILL.md accurately documents the full surface;
> 3. **governed correctness** — mediation where the operation is mutation-bearing;
>    a safe, discoverable recovery path everywhere the teeth can wedge a session.
>
> **And this invariant is mechanically enforced** so a future backend verb cannot
> re-open the gap.

The 027 roadmap work already proved the pattern on ONE verb family (`roadmap` is now
fully self-documenting via the shared parser, with `advance`/`cluster`/`decompose`
etc.). This feature applies that proven pattern across the entire surface and fills
the operation holes the pattern alone does not close.

---

## Current state (ground truth, 2026-06-19)

Full inventory: `plugins/stack-control/.runtime-cache/frontdoor-audit-surface.md`
(skills + verbs + lifecycle matrix), `...-backlog.md` (reported-gap census),
`...-roadmap.md` (planned-coverage map).

- **34** `/stack-control:*` skills; **46** `stackctl` verbs.
- `--help` parity: **2** verbs full (`govern`, `roadmap`), **7** partial
  (usage-error reveals sub-actions: `backlog`, `inbox`, `workflow`, `front-door`,
  `session-start`, `session-end`, `capability`), **37** none.
- Two scary-looking backlog reports are **already STALE** (fixed by 027): `roadmap
  advance` exists with `--help` (TASK-148); the `roadmap` family is self-documenting.
  Do not re-plan those.

---

## Scope — four workstreams (all mandatory; phases of one feature)

### Phase 1 — Complete the operation set (every backend op has a sanctioned verb + skill)

Operations that DO NOT EXIST through the front door today and must be added. Each new
verb ships with: CLI verb + sub-action, a skill (new skill OR sub-action of an
existing skill), `--help`, accurate SKILL.md, mediation registration where
mutation-bearing, and tests.

| # | Missing operation | What to add | Closes |
|---|---|---|---|
| 1 | Close/complete a captured backlog item | `backlog done\|close\|archive <id> [--reason]` — direct terminal transition through the capability interface (today: impossible; closure only as a side-effect of roadmap graduation) | TASK-297 |
| 2 | Undo a backlog promote | `backlog unpromote\|re-home <id>` — inverse of `backlog promote` | TASK-23 |
| 3 | Dedupe backlog capture by `--ref` | capture refuses/links a duplicate gh-ref instead of silently creating a second item | TASK-38 |
| 4 | Roadmap edge mutation | `roadmap add-edge`, `remove-edge`, `move-edge`(reparent), `rename`, `remove-node` — today edges are hand-edited (forbidden under 026) | TASK-137, TASK-242 (absorbs planned `impl:gap/roadmap-edge-mutation-verbs`) |
| 5 | Resolve an orphan spec dir | `roadmap reconcile --unorphan <spec>` assist (today reconcile reports but cannot fix; requires forbidden hand-edit) | TASK-133 |
| 6 | One-move backlog→roadmap promotion | propose-create-and-link in a single sanctioned move (today: hand-run `roadmap add` + `backlog promote`) | TASK-135 (absorbs planned `multi:feature/backlog-promotion-mechanization` op surface) |
| 7 | Post-release resolution cycle | verify a newly-installed release and close the backlog items it resolved, through sanctioned verbs | TASK-134 (absorbs `multi:feature/release-resolution-cycle` op surface) |
| 8 | Edge-aware roadmap archival | `curate`/archive must not dangle `depends-on`/`part-of` edges of archived terminal items | TASK-21 (FR-005) |

### Phase 2 — Discoverability parity (self-documenting, accurate, in the picker)

| # | Gap | Fix | Closes |
|---|---|---|---|
| 1 | 37/46 verbs have no `--help`; flags only discoverable by reading source | Migrate **every** verb onto the shared self-documenting parser (the proven 027 pattern): `verb --help` + `verb <sub> --help` for all, exit 0, with flags/sub-actions/descriptions | TASK-26 (absorbs planned `multi:gap/cli-verb-surface-consolidation`) |
| 2 | SKILL.md lag vs. CLI surface | Accuracy sweep: every skill documents its full verb surface | TASK-291 (roadmap cluster/group), TASK-204/217 (backlog empty-session guard + token reuse), TASK-205/213 (execute/extend residue + garble) |
| 3 | Wrong/misleading discovery output | session-start must not nominate a fully-implemented spec as active with a bogus next step; must not quote a source-repo-only path that 404s in host installs | TASK-130, TASK-147 |
| 4 | No single discoverable verb reference | Auto-generated `stackctl help` / verb reference derived from the parser (never drifts) | (new; subsumes audit "VERBS.md" rec) |
| 5 | Adopter docs gaps | Document the Codex adopter install path; route tooling-feedback to GitHub issues, not an invisible local file | TASK-69, TASK-294 |
| 6 | Capability-id ↔ test coverage | SKILL.md capability ids must be fully covered so a mismatch can't silently kill skill invocation | TASK-211 |

### Phase 3 — Teeth recovery & legitimate-op handling (026 cuts that go too deep)

| # | Gap | Fix | Closes |
|---|---|---|---|
| 1 | No-installation context refuses the **adopter's own backend** with an unsatisfiable redirect | Distinguish "adopter's own tool, no stack-control here" from "fronted-backend bypass"; only refuse the latter | TASK-201 |
| 2 | A corrupt marker file **permanently wedges a session** — no recovery verb | Add `stackctl front-door reset` / `mediate-recover --session <id>` (list + clear markers); a session must never be unrecoverable through sanctioned verbs | TASK-209 |
| 3 | Marker state undiscoverable | `mediate-list --session <id>`; recovery documented + in `--help` | (audit gaps d/g) |
| 4 | Mediation linchpins silently refuse | Bind marker contents to the requested session; reconcile cwd/session-id linchpins so a sanctioned drive isn't silently refused | TASK-215, TASK-218, TASK-203, TASK-164 |
| 5 | Deprecated `speckit-guard` disagrees with the 026 interceptor | Read the file marker (not the legacy env var); audit/justify the widened refusal set | TASK-165, TASK-194 |
| 6 | Fail-open with no signal; staleness prune can refuse a live drive; cold-start cost | `bin/intercept` must signal when mediation was skipped; staleness bound must not prune an active drive; address per-Bash-call cold start | TASK-197, TASK-193/220, TASK-191 |
| 7 | Marker example cannot authorize the raw call it wraps | Backlog (and any) marker examples must actually authorize the wrapped backend call | TASK-221 |

### Phase 4 — The governed guardrail (stop regression — operator: build the check)

| # | Deliverable | Detail |
|---|---|---|
| 1 | A **fronted-operations registry** | Ground-truth manifest: every backend operation that MUST be fronted, with its required skill, verb, and mediation class. New backend verbs must register or the check fails. |
| 2 | `stackctl check-front-door` | Asserts the invariant for every registered op: (a) a sanctioned skill exists, (b) the verb + each sub-action emit working `--help` (exit 0), (c) mutation-bearing ops are mediation-registered. Non-zero exit on any gap. |
| 3 | Doctor rule + skill | `/stack-control:scope-doctor` (or a dedicated rule) surfaces front-door gaps; a `/stack-control:check-front-door` skill wraps the verb. |
| 4 | Lifecycle wiring (per `enforcement-lives-in-skills`) | Advisory snapshot in `session-start`; gate in `implement`/`review`; never a git hook. |
| 5 | The teeth are actually loaded | Verify `hooks/hooks.json` is registered/auto-discovered and a smoke proves the interceptor loads (today unproven → teeth may be inert) | TASK-195, TASK-207, TASK-210, TASK-219, TASK-222 |

---

## Acceptance — the whole-thing test (no partial pass)

1. **Discoverability:** for **every** one of the 46 verbs (and every future verb),
   `verb --help` and each `verb <sub> --help` return usage with flags + descriptions,
   exit 0. `stackctl check-front-door` passes.
2. **Operations:** the lifecycle matrix has a sanctioned, discoverable skill + verb
   for every step. Backlog supports capture → list → promote → **unpromote** →
   **done/close/archive**, all mediated + documented. Roadmap supports full edge
   mutation + advance + reconcile/**unorphan**, edge-aware archival.
3. **Teeth recovery:** a wedged/corrupt marker is recoverable through a sanctioned
   verb; a no-installation context never refuses an adopter's own backend.
4. **Regression guard:** deleting a skill, breaking a `--help`, or adding an
   unfronted backend verb makes `check-front-door` fail (proven by a RED test).
5. **Teeth loaded:** a smoke proves the PreToolUse interceptor is registered and
   fires.

---

## Roadmap reconciliation (proposed — needs operator bless on the edge mutations)

These currently-independent planned items become **part-of** the umbrella (their
operation surface is subsumed; they stop being separately shippable):

- `impl:gap/roadmap-edge-mutation-verbs` → Phase 1 #4
- `multi:gap/cli-verb-surface-consolidation` → Phase 2 #1
- `multi:feature/backlog-promotion-mechanization` → Phase 1 #6 (op surface)
- `multi:feature/release-resolution-cycle` → Phase 1 #7 (op surface)

New umbrella roadmap node (proposed codename): `multi:feature/front-door-completeness`.

Already-resolved (do NOT re-scope): TASK-148 (advance exists), roadmap-family
discoverability (027 shipped).

---

## Open DESIGN questions (resolve in the design phase — these are design forks, not scope cuts)

1. **Backlog terminal-state model.** Does a backlog item get `done`/`closed`/
   `archived` as distinct states, or one terminal state with a reason? How does it
   interact with the existing `roadmap close-related` side-effect path (keep both?
   make `close-related` call the new direct verb?)?
2. **Skill granularity.** New operations as sub-actions of existing skills
   (`/stack-control:backlog done`) vs. new skills. Lean: sub-actions, to keep the
   picker UNIX-style and the skill-count bounded.
3. **Self-documenting parser rollout.** Big-bang migration of all 46 verbs vs.
   family-by-family behind the `check-front-door` gate. (Either way the gate is the
   completion proof; the question is sequencing within the feature, not whether.)
4. **Fronted-operations registry format + source of truth** (hand-authored manifest
   vs. derived from skill/verb metadata vs. both with a cross-check).
5. **Recovery verb naming/placement** (`front-door reset` vs. `mediate-recover`) and
   whether it lives under the existing `front-door`/`mediate-check` verb family.
6. **No-installation discrimination rule** — how the interceptor tells an adopter's
   own backend from a fronted-backend bypass without a stack-control installation to
   anchor on (TASK-201 is the hard design problem of this feature).
