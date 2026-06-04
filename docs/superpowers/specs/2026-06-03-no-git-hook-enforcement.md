# No git-hook enforcement — architectural decision record

**Status:** Accepted 2026-06-03 (operator-approved in conversation; file-level demolition already shipped in `81bba0f2`; CLI subcommand retirement + skill-body relocation captured as Phase 24 of the `scope-discovery` feature).

**Context:** This ADR captures the principle, the retirement list, the relocation map, and the breaking-change implications of moving every piece of `dw-lifecycle` enforcement out of `.husky/` and into skill bodies + CLI verbs.

## The principle

**Enforcement lives in surfaces an adopter installs and runs — skills (`/dw-lifecycle:session-start`, `/dw-lifecycle:implement`, `/dw-lifecycle:session-end`, `/dw-lifecycle:review`, `/dw-lifecycle:complete`) and CLI verbs. Git hooks are NOT in the contract.**

A discipline that can only fire from a hand-rolled `.husky/<hook>` script does not exist for an adopter who follows the public install path. Wiring discipline into git hooks distorts our perception of what's working: we experience the gates through our own hand-rolled `.husky/` files; an adopter who installs the plugin and follows the README experiences nothing.

This is a generalization of the existing `agent-discipline.md` rule:

> Use the deskwork plugin only through the publicly-advertised distribution channel — no privileged shortcuts. If the public path is broken, the only valid response is to fix it.

The same logic applies to enforcement specifically. An enforcement primitive that only fires when wired into `.husky/` is, from an adopter's perspective, broken. The fix is to relocate the discipline into skill bodies + CLI verbs — surfaces an adopter has after `claude plugin install`.

## Why now

Three open GitHub issues filed 2026-06-03 by an agent driving `feature/deskwork-plugin` named the failure mode:

- [#401](https://github.com/audiocontrol-org/deskwork/issues/401) — the audit-driven implement loop spiraled a 1-commit sub-task into 5 commits + 3 barrage rounds (39c-2b).
- [#402](https://github.com/audiocontrol-org/deskwork/issues/402) — bookkeeping ratchet (hook-coverage gate) + general bookkeeping proliferation in the implement loop.
- [#403](https://github.com/audiocontrol-org/deskwork/issues/403) — friction synthesis: implement-loop gates enforce local correctness but amplify scope errors; ~3:1 bookkeeping ratio observed.

Yesterday's v0.35.0 release required three `--no-verify` pushes (commits `f823d960`, `fb87fd43`, `50731723`) for bookkeeping commits the gates refused. That's the operator bypassing the gates of a plugin we ship to others — proof that the discipline as wired is unsustainable at the source.

The audit-finding gates (`check-implement-hook-ran`, `check-implement-hook-coverage`) are **not installable by adopters** — they exist only in this repo's hand-rolled `.husky/`. Adopters get zero audit-barrage discipline by default; we have zero dogfood signal for whether the discipline works through the public install path.

The structural pre-commit chain (`check-clones`, `check-anti-patterns`, `check-adopters`, `check-disposition-survivor`, `check-editor-symmetry`) IS plugin-installable via `install-scope-discovery-hooks`, but the install requires an adopter to know about husky and run the install verb separately. Same architectural problem, smaller volume.

Phase 24 fixes both: zero git-hook reliance, full discipline composed into skill bodies + CLI verbs that adopters get by installing the plugin.

## What gets retired

The following machinery is retired by this decision (file-level demolition already in `81bba0f2`; CLI subcommand source retirement lands in subsequent Phase 24 commits):

| Layer | Retired surface | Phase that built it |
|---|---|---|
| Hook files | `.husky/commit-msg` (deleted), `.husky/pre-commit` audit-gate block (stubbed), `.husky/pre-push` audit-gate block (stubbed) | Phases 17/21/22/23 |
| CLI verbs | `check-implement-hook-ran` (commit-msg gate) | Phase 17 |
| CLI verbs | `check-implement-hook-coverage` (pre-push gate) | Phase 17 |
| CLI flag | `--upstream-base-ref` on `check-implement-hook-coverage` | Phase 21 |
| Storage | Per-SHA `hook-run-log.jsonl` write logic + `enumerateCommitsInRange` helper | Phase 23 |
| Storage | `last-hook-run.json` marker logic + boot-case guards | Phase 22 |
| Install machinery | `install-scope-discovery-hooks` verb + skill + helper | Phase 8 |
| Install machinery | `uninstall-scope-discovery-hooks` verb + skill + helper | Phase 8 |
| Storage | `hooks-installed.json` machinery + reader logic | Phase 8 |
| Working-tree files | `.dw-lifecycle/scope-discovery/hook-run-log.jsonl`, `last-hook-run.json` | Phase 23/22 |

Phases retroactively annotated as **retired**: 15, 17 (partially), 21, 22, 23. Their original deliverables are vestigial under the new contract — they shipped the discipline into hook plumbing, but the discipline itself remains alive in skill bodies under the new architecture.

## Where the discipline relocates

The discipline is preserved; only the firing location moves. The relocation map:

| Discipline | Old location | New location |
|---|---|---|
| Structural chain snapshot (`check-clones`, `check-anti-patterns`, `check-adopters`, `check-editor-symmetry`) | `.husky/pre-commit` | `/dw-lifecycle:session-start` (advisory snapshot at session boot) |
| End-of-task structural chain (refuse-to-advance on NEW clone groups, anti-pattern hits, holdouts) | `.husky/pre-commit` | `/dw-lifecycle:implement` (gate at task boundary, enforcing) |
| Audit-barrage end-of-task chain (`audit-barrage` → `audit-barrage-lift --apply` → `promote-findings --auto` → `check-open-findings`) | `.husky/commit-msg` (`check-implement-hook-ran`) + `.husky/pre-push` (`check-implement-hook-coverage`) | `/dw-lifecycle:implement` end-of-task step (single-verb `implement-hook` retained as the composed entry point; the firing location moves, not the chain) |
| `check-fix-task-tdd` (TDD shape on fix-task commits) | `.husky/commit-msg` | `/dw-lifecycle:implement` (in-skill advisory at fix-task promotion + closure) |
| `apply-audit-flips` (close already-fixed AUDIT entries) | Standalone manual verb | `/dw-lifecycle:implement` after-task step (folded into the chain) |
| `check-disposition-survivor` | `.husky/pre-commit` | `/dw-lifecycle:session-end` (refuse session-end on regressed dispositions) |
| No-bare-TBDs discipline | `/dw-lifecycle:complete` pre-merge gate (already present) | Also `/dw-lifecycle:session-end` (refuse session-end on bare TBDs) |
| `check-refactor-preconditions` (Step 0 fragment) | `.husky/commit-msg` indirect via agent-prompt mirror | `/dw-lifecycle:review` (Step 0 invoked on review trigger) |
| PR-readiness structural chain | `.husky/pre-push` | `/dw-lifecycle:review` (run as PR-readiness gate) |
| `check-editor-symmetry` fleet snapshot | `.husky/pre-commit` | `/dw-lifecycle:review` (fleet snapshot at PR review) |

The structural chain at session-start is **advisory**: it surfaces counts as a snapshot so the agent sees the numbers without needing a separate command, but does not refuse to start the session. The same chain at end-of-implement-task **enforces**: refuse to advance on NEW clone groups, anti-pattern hits, or holdouts — the pathology that motivated `Just for now is bullshit` is the audit-finding chain (high volume, bookkeeping-heavy), not the structural chain (low volume, real defects).

The audit-barrage chain at end-of-task preserves the **workplan-aware open-findings gate** semantic from Phase 15: open findings do not block task pickup when they're scoped as the next-N work; they DO block when unscoped or non-next. The firing location moves from `.husky/commit-msg` into the skill body; the gate-vs-cure mechanic is unchanged.

## What stays

This decision retires **enforcement wiring**. The underlying primitives — the CLI verbs that DO the checking — stay where they are:

- `check-clones`, `check-anti-patterns`, `check-adopters`, `check-disposition-survivor`, `check-editor-symmetry`, `check-refactor-preconditions`, `check-deprecations` — all preserved as CLI verbs; the skill bodies invoke them. An adopter who wants a project-specific hook can wire any of them manually; we just don't ship the install machinery.
- `audit-barrage`, `audit-barrage-render`, `audit-barrage-lift`, `check-barrage-tip`, `check-barrage-dampener`, `slush-remaining`, `promote-findings`, `check-open-findings`, `apply-audit-flips`, `close-shipped-audit-findings`, `implement-hook` — the audit-finding lifecycle library. The `implement-hook` verb stays as the composed entry point that skill bodies invoke; only the firing location (skill vs hook) changes.
- The Phase 15 workplan-aware gate semantic. Open findings ARE the next work; the gate-vs-cure model is the right shape.
- The Phase 13 anti-deferral discipline + TDD-on-fix-tasks discipline. The closure triad (`apply-audit-flips`, `close-shipped-audit-findings`, `re-audit-fixed-findings`) is preserved.
- The dampener disposition (`slush-remaining` for MED/LOW/INFO under N-quiet or single-run rules; `promote-findings --auto` otherwise). Phase 16's "dampener controls disposition" framing is the right shape; only the gate-wiring changes.

The principle is **enforcement moves; primitives stay**. An adopter who wants the discipline gets it from skill bodies. An adopter who wants a project-specific hook wires it themselves with the same CLI verbs we ship.

## The new contract

After Phase 24 lands:

- **Adopters install the plugin and get the discipline through skill bodies.** No separate `install-*-hooks` invocation. No husky setup required. The `/dw-lifecycle:` skills compose the chain at the right lifecycle waypoint.
- **`/dw-lifecycle:session-start` surfaces a structural snapshot.** Counts of clone groups, anti-pattern hits, adopter holdouts, editor-symmetry deltas — visible at session boot, advisory only.
- **`/dw-lifecycle:implement` enforces at the task boundary.** Structural chain + audit-barrage chain + workplan-aware gate + fix-task TDD check — all fire after every task-completion commit. The discipline is enforced by the skill's instruction to the agent, not by a hook the agent could `--no-verify` past.
- **`/dw-lifecycle:session-end` enforces closing discipline.** `check-disposition-survivor`, no-bare-TBDs, no-open-findings-without-disposition — refuse session-end on any.
- **`/dw-lifecycle:review` is the primary enforcement surface for PRs.** Step 0 refactor preconditions + structural chain + fleet symmetry — run as PR-readiness. This **reverses the Phase 20 Task 2 retirement decision** — `/dw-lifecycle:review` is NOT retired; it's elevated to the primary enforcement surface.
- **No `.husky/<hook>` file in this repo contains any `dw-lifecycle` enforcement.** The stubs in `81bba0f2` are the final state (modulo full deletion if husky itself is retired).

## Breaking-change implications

This is a breaking change for adopters who installed `install-scope-discovery-hooks` in v0.35.0 or earlier. Their git hooks reference verbs (`check-implement-hook-ran`, `check-implement-hook-coverage`) that no longer exist. Phase 24 Task 9 ships migration tooling:

- **Lean: a one-shot `dw-lifecycle uninstall-everything-hook-related` verb** that removes managed blocks from `.husky/`, deletes `hooks-installed.json`, and surfaces a report. Per the operator-decision-list in the workplan, this is the preferred shape; the migration is mechanical and one-shot.
- **Release notes** capture the breaking change, cite the relocation map, cite this ADR.
- **`MIGRATING.md`** (or plugin README upgrade section) documents the path for adopters.

Adopters who did NOT install hooks are not affected by the breaking change — they simply pick up the new skill-body discipline on the version bump.

## Risk and reversal

The risk of this decision: the discipline-in-skill-body shape might still produce fresh bookkeeping load (e.g., `check-fix-task-tdd` as an in-skill advisory might still nag at fix-task closures). Phase 24 Task 10 dogfoods the new shape against this branch's own remaining tasks; if the bookkeeping load does not drop materially (target: <2:1 touches per finding, down from ~3:1), the decision is reopened.

The decision is **not reversed** by retaining git-hook enforcement — that defeats the principle. Reversal looks like: further consolidation of the audit-finding lifecycle into a smaller surface (per [#403](https://github.com/audiocontrol-org/deskwork/issues/403)'s collapse-finding-lifecycle proposal) or accepting that audit-finding bookkeeping is intrinsic to the genre and tuning the dampener/severity filter accordingly. Both are skill-body adjustments, not hook-wiring.

## Cross-references

- Operational rule: `.claude/rules/enforcement-lives-in-skills.md` — the *what to do next session* form of this principle.
- Parent issue: [#404](https://github.com/audiocontrol-org/deskwork/issues/404) — Phase 24 in scope-discovery.
- Triggers: [#401](https://github.com/audiocontrol-org/deskwork/issues/401), [#402](https://github.com/audiocontrol-org/deskwork/issues/402), [#403](https://github.com/audiocontrol-org/deskwork/issues/403).
- Related: `agent-discipline.md` § "Use the deskwork plugin only through the publicly-advertised distribution channel" (the broader principle this ADR specializes).
- File-level demolition shipped in commit `81bba0f2` (2026-06-03; operator-authorized ahead of relocation per the bookkeeping pathology).
