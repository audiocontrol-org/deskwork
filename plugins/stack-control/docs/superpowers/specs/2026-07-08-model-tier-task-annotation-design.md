# Design record — model-tier-task-annotation

- roadmap item: `impl:feature/model-tier-task-annotation`
- date: 2026-07-08
- design backend: superpowers:brainstorming (driven in-session via `/stack-control:design`)
- design pointer: `docs/superpowers/specs/2026-07-08-model-tier-task-annotation-design.md`

> House rules injected (stack-control-design-v1): capture-over-YAGNI, ≥2 solution-space
> alternatives, required sections, operator-approval marker, handoff to `/stack-control:define`,
> installation-anchored record.

## Problem domain

`/stack-control:execute` performs **model-sized dispatch**: it sends each `tasks.md` task to a
right-sized subagent chosen by the task's `[tier:<label>]` annotation. The consuming machinery
already exists and is deliberately strict:

- `stackctl resolve-tiers --spec <dir>` (`src/subcommands/resolve-tiers.ts`) parses each task line
  `- [ ] T001 [P] [US1] [tier:fast] …` via `parseTieredTasks` (`src/execute/tasks-tier-parser.ts`),
  resolves the label through the installation's `tier_map` (`src/config/config-loader.ts` →
  `resolveTier`, `src/execute/tier-resolution.ts`), and emits an `id → model` map.
- The tier **labels are operator-defined per installation** (`tier_map` keys — `fast`/`balanced`/
  `powerful` in the dogfood config, but a project may use any labels), and each maps to an accepted
  model (`ACCEPTED_MODELS = {haiku, sonnet, opus, fable}`, `src/execute/accepted-models.ts`).
- **A task with no tier fails loud and dispatches nothing** — `no-tier` error, `process.exit(1)`,
  no partial resolution, no silent default (Principle V; feature 033 FR-004, and a configurable
  default tier was *explicitly deferred* there). The execute skill hard-stops on non-zero
  (`skills/execute/SKILL.md:63-72`).

**The gap is on the producing side.** `/speckit-tasks` — the vendored backend that generates
`tasks.md` — is tier-blind:

- The vendored `.claude/skills/speckit-tasks/SKILL.md` "Generate tasks.md … Fill with:" step
  (`:78-89`) never mentions tiers (grep: zero hits).
- The plugin template `plugins/stack-control/.specify/templates/tasks-template.md` *documents*
  `[tier:]` only as **optional** (`:16-27`) and its own sample task lines (`:60-165`) carry **no**
  `[tier:]` tag.

Consequence: every generated `tasks.md` is born untagged → every task trips `no-tier` at execute
time → the orchestrator **scrambles to backfill tiers by hand** at execute time. That backfill is
the friction this feature removes: surface the tier requirement *during the tasks phase* so
`tasks.md` is born tier-complete.

### Forces / constraints captured (capture-over-YAGNI)

- **Vocabulary is installation-specific.** The requirement injected into generation MUST reference
  the *enclosing installation's actual `tier_map` labels*, not a hardcoded `fast/balanced/powerful`.
  A generator that emits labels absent from the project's `tier_map` produces tasks that fail
  `unknown-tier` at execute — trading one failure for another.
- **The deterministic floor already exists and must be preserved.** `resolve-tiers` is the
  compile-time-style completeness gate. Per `.claude/rules/audit-barrage-is-stochastic-defense-in-depth.md`,
  the generator proposing tiers is the *stochastic* layer; `resolve-tiers` is the *deterministic
  floor*. This feature makes born-complete the common case; it does NOT replace or weaken the gate.
- **No silent default.** Whatever we build must not reintroduce the silent-default gap 033 closed.
  Born-complete is achieved by *proposing a real tier per task*, never by defaulting unresolved
  tasks at dispatch time.
- **Vendored-backend coupling.** `/speckit-tasks` (SKILL.md + `setup-tasks.sh`) is a rehomed/vendored
  backend. The house pattern is to *inject opinion at the seam* (as `/stack-control:design` injects
  house-rules into brainstorming, and `/stack-control:execute` wraps `/speckit-implement`) rather
  than fork/edit vendored files — capability, not vendor (Principle III).
- **Operator override survives.** The generator's proposal is a starting point; the operator can
  edit tiers during the `define` tasks review before execute. Assignment authority is not seized
  from the operator.
- **Downstream consumers.** `impl:feature/execution-engine` (the future parallel engine) consumes
  the same `[tier:]` annotation — no conflict; born-complete tasks benefit it identically.
- **Where "the tasks phase" lives.** In stack-control the tasks phase is driven through the
  `/stack-control:define` front door (which runs the speckit authoring chain incl. tasks); it is
  the natural injection seam.

## Solution space

The core question: **how does every generated task come to carry a resolvable `[tier:]`, keyed off
the installation's real tier vocabulary, without weakening the deterministic completeness floor?**

### Alternative A (rejected) — Post-generation mechanical gate only

Leave generation tier-blind; add a verb that either refuses when tiers are missing, or auto-assigns
a default and writes it back.

- **Rejected because:** auto-assign reintroduces exactly the silent-default 033 deliberately
  refused (Principle V). Refuse-only just relocates the manual backfill scramble earlier in the
  lifecycle without eliminating it — the operator still hand-annotates. It also duplicates the
  completeness check `resolve-tiers` already performs. Does not achieve "born tier-complete."

### Alternative B (rejected) — Edit the vendored template + SKILL.md directly

Make `[tier:]` required in `tasks-template.md`'s Format line, exemplify it in the sample task lines,
and add a per-task tier step to the vendored `speckit-tasks` SKILL.md "Fill with:" list.

- **Rejected as primary because:** it edits vendored/rehomed backend files (fork-drift risk, against
  the capability-not-vendor seam pattern), and a static template naturally hardcodes a tier
  vocabulary (`fast/balanced/powerful`) that will mismatch a project whose `tier_map` uses other
  labels. Kept as an *optional secondary* (see Decisions): exemplifying `[tier:]` in the template
  docs helps any direct/native `speckit-tasks` use, but it is not the load-bearing mechanism.

### Alternative C (rejected) — Dedicated interactive `annotate-tiers` pass/skill

Keep generation tier-blind; add a distinct post-`tasks` step that walks each task, proposes a tier,
operator confirms, writes back.

- **Rejected because:** it adds a whole new lifecycle step and turns "born-complete" into "a
  separate confirmation pass" — better than an ad-hoc execute-time scramble, but still not
  born-complete, and heavier friction than injecting the requirement into generation. The operator's
  judgment gate is preserved more cheaply by Alternative D's "operator edits during define review."

### Alternative D (CHOSEN) — Inject the tier requirement at the `define` seam; generator proposes, existing gate guarantees

`/stack-control:define`'s tasks step **injects** the tier-annotation requirement into the vendored
`speckit-tasks` backend in-session — mirroring how `/stack-control:design` injects house-rules into
brainstorming. The injected instruction:

1. reads the **enclosing installation's actual `tier_map` labels** (via a `stackctl` read surface —
   e.g. a `tier-vocab`/config read verb) so the generator only proposes labels that will resolve;
2. instructs the generator to emit a `[tier:<label>]` on **every** task, choosing per a stated
   heuristic (mechanical / RED / doc-only → cheapest tier; standard implementation → mid tier;
   cross-cutting / architectural / ambiguous / high-blast-radius → most-capable tier);
3. leaves `tasks.md` **born tier-complete** as the common case.

The **existing `resolve-tiers` gate remains the deterministic completeness floor**: any task that
still lacks a resolvable tier fails loud at execute (dispatch nothing), unchanged. The operator may
edit any proposed tier during the `define` tasks review before execute.

- **Chosen because:** it removes the backfill friction at its source (born-complete), respects the
  installation-specific vocabulary constraint, preserves the no-silent-default invariant and the
  deterministic floor, matches the established opinion-injection-at-the-seam house pattern (no
  vendored-file fork), and keeps operator override. Clean stochastic-proposal / deterministic-floor
  layer split.
- **Operator decisions (2026-07-08):** surfacing = *inject at the define seam*; assignment =
  *generator proposes, existing gate guarantees*.

## Decisions

1. **Surface the tier requirement by injection at the `/stack-control:define` tasks seam** — not by
   editing vendored `speckit-tasks` files (Alternative D over B). Mirrors the design-frontend /
   execute-frontend opinion-injection pattern; capability, not vendor.
2. **The generator proposes one `[tier:]` per task; the existing `resolve-tiers` gate guarantees
   completeness.** Born-complete common case + deterministic floor unchanged. No new silent default.
3. **The injected requirement is keyed off the enclosing installation's actual `tier_map`
   vocabulary**, surfaced through a `stackctl` read surface — never a hardcoded label set.
4. **A stated per-task tier heuristic** ships with the injected requirement (mechanical/RED/doc →
   cheapest; standard impl → mid; cross-cutting/architectural/ambiguous → most-capable) as guidance,
   tunable, not a hard rule.
5. **Operator override is preserved** — proposed tiers are editable during the `define` tasks review
   before execute.
6. **Optional secondary (scope TBD by operator):** exemplify `[tier:]` in
   `tasks-template.md`'s sample task lines and Format section so *direct/native* `speckit-tasks` use
   also sees the tag modeled. Not the load-bearing mechanism; captured, not committed.

## Open questions

- **`tier_map` read surface:** does a suitable read verb already exist (config-loader surface), or
  does this feature add a small `stackctl tier-vocab`/`--json` verb for the injection to consume?
  (Implementation-altitude; resolve in `/speckit-plan`.)
- **Empty/absent `tier_map`:** what should the injected requirement say when the installation has no
  `tier_map` configured yet? (Likely: instruct to declare one / surface the `no-map` path the
  resolver already names — capture, don't pre-decide.)
- **Heuristic label binding:** the heuristic names *semantic* buckets (cheapest/mid/most-capable);
  how does it bind to a project whose `tier_map` has more or fewer than three labels, or
  non-ordinal labels? (Propose: map buckets to the ordered accepted-model rank the labels resolve
  to; open for plan.)
- **Should the deferred configurable *default tier* (033 future scope) be revisited here?** Leaning
  no — born-complete + fail-loud is the stance — but flag for the operator.
- **Is this feature-sized or point-sized?** The implementation may be small (an injection block + a
  read surface + tests). Whether it warrants the full spec-driven chain or a lighter path is an
  operator scope call at `/stack-control:define` time. Captured, not pre-decided.
- **Injection mechanism single-sourcing:** should the injected tier requirement live in a
  `renderTierRequirement()`-style single source (à la `renderHouseRules()`) so the `define` seam and
  any secondary template exemplification derive from one block? (Design-altitude for plan.)

## Provenance

- **Originating roadmap item:** `impl:feature/model-tier-task-annotation` (added commit `0eec3635`,
  2026-07-08). Commit rationale: *"Speckit task authoring doesn't know stack-control execute
  requires model tier annotations on each task. Orchestrator scrambles to backfill them at execute
  time. Remove that friction by surfacing the requirement during the speckit tasks phase."*
- **Consuming mechanism (feature 033, shipped):** `impl:feature/model-sized-dispatch`
  (`specs/033-model-sized-dispatch/`), design record
  `docs/superpowers/specs/2026-06-28-model-sized-dispatch-design.md`. Key code:
  `src/execute/tasks-tier-parser.ts`, `src/execute/tier-resolution.ts`,
  `src/execute/accepted-models.ts`, `src/subcommands/resolve-tiers.ts`,
  `src/config/config-loader.ts`, `skills/execute/SKILL.md`.
- **Producing surface (the gap):** vendored `.claude/skills/speckit-tasks/SKILL.md:78-89`;
  plugin template `plugins/stack-control/.specify/templates/tasks-template.md:16-27,60-165`.
- **House pattern referenced:** `/stack-control:design` house-rules injection
  (`src/workflow/house-rules.ts`, `renderHouseRules()`); `/stack-control:define` as the tasks-phase
  front door.
- **Governing rules:** `.claude/rules/audit-barrage-is-stochastic-defense-in-depth.md` (stochastic
  proposal vs deterministic floor); Principle III (capability, not vendor); Principle V
  (fail-loud, no silent default).
- **Design session:** `/stack-control:design impl:feature/model-tier-task-annotation`, 2026-07-08,
  backend superpowers:brainstorming; operator forks answered via AskUserQuestion (surfacing =
  inject-at-define-seam; assignment = generator-proposes-gate-guarantees).
- **Exploration:** in-session Explore agent mapping the produce/consume mechanism (findings folded
  into Problem domain above).
