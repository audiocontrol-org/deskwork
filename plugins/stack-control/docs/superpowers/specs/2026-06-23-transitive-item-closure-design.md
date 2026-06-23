# Design: Transitive item closure + the post-ship terminal stage

- **Roadmap item:** `multi:gap/transitive-item-closure` (part-of `multi:feature/lifecycle-industrialization`)
- **Date:** 2026-06-23
- **Design backend:** `superpowers:brainstorming`, driven through `/stack-control:design` (house rules `stack-control-design-v1`)
- **Status:** drafted; awaiting operator `design-approved:` marker

> Capture mode (house rule `capture-over-yagni`): this record captures everything
> known or knowably-implied — every edge case, cross-cut, and open question.
> Scoping is a separate, explicit, operator-driven pass after capture, and happens
> in `/stack-control:define` / `/speckit-tasks`, not here.

---

## problem-domain

Three distinct problems converged into one feature during the 2026-06-23 design
pickup. They share a single root: **the terminal end of a feature's lifecycle has
post-ship obligations that today rely on the agent remembering to do them by
hand** — exactly the failure mode the thesis ("industrialize execution; make the
failure state mechanically impossible") exists to kill.

### P1 — Closing what an item *contains* is a manual, multi-step chore

Closing everything contained in a roadmap item — its resolved backlog ids **and**
its `part-of` subtree's — should be one mechanical move. Today it isn't, because
three gaps stack:

1. **`close-related` reads only the recorded `closes:` ∪ `ref:` set and never
   infers from prose** (023 FR-003, deliberately auditable —
   `src/subcommands/roadmap.ts:281` `emitCloseRelated()`, reading `item.closes`
   ∪ `item.ref` at `:294`). An umbrella that lists its tasks as prose bullets (as
   `govern-030-hardening` did) yields "nothing to close."
2. **No verb POPULATES a node's `closes:` set.** `add-edge` refuses it (`closes:`
   is `references: prose` in `grammars/roadmap.peg:22`, not a unit-reference edge
   like `depends-on`/`part-of`, so `addEdge()` fails at
   `src/roadmap/edge-mutations.ts:98` via `requireUnitRefField`). `add`/`cluster`
   carry no `closes` flag. The only way to record resolved ids is hand-editing the
   markdown — roughly the same manual effort as closing the tasks one by one.
3. **`close-related` is NOT transitive.** It closes the node's own `closes:` but
   never walks its `part-of` children to close THEIR backlog ids or advance
   terminal children. (Minor: `advance --to shipped` does not auto-run
   `close-related`; it is a separate step — `src/roadmap/mutations.ts:199`
   `advance()` only rewrites the status line.)

Concrete cost: during the `govern-030-hardening` closeout, 16 backlog ids
(TASK-109, TASK-128, TASK-426..441, …) were closed by hand because the umbrella
recorded them in prose and no transitive closer exists.

### P2 — Post-install validation as an implement task deadlocks the audit (the offing friction)

The offing team hit a circular dependency:

- Cross-model **govern/audit only runs once every `tasks.md` task is complete.**
- One of the `tasks.md` tasks was a **post-install validation step** — which
  cannot pass until the plugin is **published/installed**.
- But you do not publish until the work has shipped (governed clean).

So: audit waits for all tasks → that task waits for publish → publish waits for
the audit. The order is backwards. Post-install validation is **inherently a
terminal-stage activity** — it happens *after* release, against the
formally-installed artifact — so modeling it as an implement-phase task is a
category error, not a scheduling accident.

This also intersects the standing project rule *"no issue closes until its fix is
verified in a formally-installed release"* (`.claude/rules/agent-discipline.md`
§ Issue closure): the verification the rule demands is precisely the post-install
validation that cannot live in `tasks.md`.

### P3 — Both post-ship steps depend on agent memory

Today, after a feature ships, the agent is expected to *remember* to (a) validate
the installed release and (b) close the contained items. The two most recent
journals (2026-06-22/23) describe doing both by hand. Per the thesis, an obligation
that depends on the agent remembering is a latent failure — it should be a
mechanical, un-skippable step in the lifecycle.

### P4 — Most adopters have no "install" step (genericity constraint)

stack-control governs **collections of markdown / generic projects** — a docs
collection, an internal plan, an engineering roadmap — most of which produce **no
installable/releasable artifact at all**. "Post-install validation" is therefore
specific to projects that ship such an artifact (stack-control governing *itself*
is one — that is where the offing deadlock lived). It follows that **post-install
validation cannot be baked into the entrance criteria of any stage** — a universal
criterion that assumes an install step is wrong for the generic adopter. Whatever
guards terminal closure must be install-agnostic.

### Current lifecycle shape (the substrate this design changes)

`templates/WORKFLOW.md` defines the phase vocabulary
`captured → planned → designing → specifying → implementing → governing → shipped`.
`shipped` is the terminal phase (no exit criteria, no `next`). Phase-derivation
(`src/workflow/phase-derivation.ts:83` `derivePhase()`) special-cases roadmap
status `shipped` → the doc's last phase (`:87-95`). The `graduate` transition's
effects (`WORKFLOW.md` ~`:145`) already run `roadmap-advance to=shipped`. The
compass (`src/workflow/compass.ts:62` `computeVerdict()`) governs legitimate phase
transitions and refuses terminal side-states.

---

## solution-space

### Chosen approach — a single new terminal phase `closed`; transitive closure is the terminal step, guarded by operator confirmation

Add **one** phase after `shipped`:

```
implementing → governing → shipped → closed
   shipped = code merged + released (where a release exists)
   closed  = contained subtree closed, after the operator confirmed
```

- **Entering `closed` is guarded by OPERATOR CONFIRMATION** — closure never fires
  automatically. The agent proposes the full transitive closure as a **dry-run**;
  the operator confirms; then `--apply` runs and the status advances to `closed`.
  This maps directly onto the existing `close-related` dry-run/`--apply` discipline
  and onto the project rule *"the agent posts evidence; the operator decides."*
- **There is NO validation criterion and NO "install" concept in any stage's
  criteria** (per P4). The operator confirmation *is* the guard. What the operator
  checks before confirming — e.g. "validate the installed plugin" for
  stack-control's own releases, or nothing for a docs collection — is the
  operator's call and project-specific; it is not prescribed or enforced by the
  workflow. *"Asking the operator is good enough for validation. It's just a guard
  against automatic closure."*
- **`closed` entrance effect (operator-initiated):** the advance-to-`closed` runs
  the transitive cascade (`close-related --cascade --apply`). Because the operator
  initiates the advance, closure is confirmed-then-applied, never auto-applied.
- New roadmap terminal **status** `closed`, joining `shipped`/`cancelled`/`retired`
  in the terminal set.
- **"Don't forget" is satisfied mechanically without auto-closing:** the workflow
  surfaces `shipped` as **non-terminal** — `closed` is the real end — so the
  compass/status/session-start naturally report "this shipped item is not closed
  yet" as the pending next move. The obligation is surfaced by the lifecycle, the
  *act* is operator-confirmed.
- **The offing (P2) deadlock dissolves by construction:** there is no validation
  *task* and no validation *criterion* to deadlock on. Govern (the `governing`
  phase) never waits on anything publish-dependent; closure is simply an
  operator-confirmed terminal step that happens after release.

**Transitive closure mechanics:**

- `close-related --cascade` walks the `part-of` subtree from the node, closes each
  node's recorded `closes:` ids, advances/handles terminal children, and dedups
  with a visited-`Set` (multi-parent safe — a node reachable via two parents is
  visited once). Dry-run by default; `--apply` to mutate. Reuses a new
  `childrenOf(model, parentId)` helper mirroring the existing reverse-edge pattern
  `blocks()` (`src/roadmap/graph.ts:74`).
- The same closure runs as the `closed` entrance effect (auto), and remains
  available as the explicit verb for ad-hoc use.

**`closes:` population (operator pick: explicit verb + auto back-link):**

- New verb `roadmap resolves <node> --add TASK-… [--remove TASK-…]` records /
  back-links resolved backlog ids onto a node (the population path `add-edge`
  refuses).
- `backlog done` / `backlog promote` **auto-back-link** the closing task into its
  parent node's `closes:` when the task carries a parent-node ref. This requires
  giving backlog tasks an optional **parent-node ref** (new, small field). With
  both in place, closure becomes near-zero-touch.

### Rejected alternatives

1. **Lifecycle: two phases `validating → closed`.** Make validation its own
   observable phase. *Rejected* — validation is a check, not a long-lived state;
   two new phases + two new statuses + extra phase-derivation/compass churn buys
   observability we don't need. A criterion captures it at the right grain.
2. **Lifecycle: keep `shipped` terminal, bundle validation + closure as transition
   effects** of an operator-invoked `validate-and-close` transition. *Rejected* —
   it is a move you *invoke*, not a gate you must *cross*, so it is skippable and
   less visible; it reintroduces the "rely on the agent remembering" failure (P3)
   the feature exists to remove.
3. **Closure data-flow inversion: tasks carry a `node:` ref; the closer queries
   tasks-by-node** and `closes:` disappears. *Rejected* — contradicts 023 FR-003's
   deliberate *auditable recorded-set* contract (close-related never infers; an id
   not in `closes:`/`ref:` is not touched). The forward task→node ref is still
   adopted as the *auto-back-link* source, but it populates `closes:` rather than
   replacing it, preserving the auditable set.
4. **Validation as a phase ENTRANCE CRITERION** (the original Approach-C framing:
   `closed` requires a recorded "post-install validation passed" marker).
   *Rejected* — it bakes an *install* assumption into a stage's criteria, which is
   wrong for the many adopters with no install/release step (P4). A criterion that
   is universal must not assume an artifact exists.
5. **Generic config-gated verification criterion** — a per-installation
   `terminal-validation:` config the `closed` criterion reads (required-when-declared,
   not-applicable-when-absent). *Rejected* — more machinery than the problem needs;
   the operator's standard is simply *"asking the operator is good enough … it's
   just a guard against automatic closure."* An operator-confirmation guard
   achieves install-agnostic safety with zero new config surface. (Re-open only if
   a real adopter needs an *unattended* terminal close with an automated gate.)
6. **A fixed automated smoke framework and/or per-feature smoke harness** for
   validation. *Rejected (operator "good enough")* — operator-confirmed validation
   has worked every time; an automated framework is unwarranted complexity now.
   Captured as a possible future enhancement, not v1 scope.
7. **`closes:` population: explicit-verb-only, or auto-back-link-only.** *Rejected*
   in favor of both — verb-only keeps a manual record step per node; auto-only
   cannot record an id not closed through `done`/`promote`. Both together cover
   each other's gap.

---

## decisions

- **D1.** Add a single new terminal phase `closed` after `shipped`, and a matching
  new terminal roadmap **status** `closed` (terminal set becomes
  `shipped`/`closed`/`cancelled`/`retired`).
- **D2.** Entering `closed` is **operator-confirmed** (the guard against automatic
  closure) — there is NO validation entrance criterion and NO install assumption in
  any stage's criteria. The operator-initiated advance-to-`closed` runs the
  transitive cascade (`close-related --cascade --apply`) as its effect; the agent
  first presents the dry-run, the operator confirms, then it applies.
- **D3.** Rework phase-derivation: map roadmap status → phase **by name**, retiring
  the `status === shipped → last phase` special-case (`phase-derivation.ts:87-95`)
  so `shipped` and `closed` derive to their own phases.
- **D4.** `close-related --cascade` walks the `part-of` subtree, closes each node's
  recorded `closes:` ids, handles terminal children, dedups via visited-`Set`,
  dry-run default + `--apply`. New `childrenOf(model, parentId)` helper.
- **D5.** `closes:` population = `roadmap resolves <node> --add/--remove TASK-…`
  **plus** auto-back-link on `backlog done`/`promote` via a new optional
  task→parent-node ref. Stays inside the `closes:` recorded-set model (auditable).
- **D6.** "Validation" is **operator confirmation only** — install-agnostic, not a
  workflow criterion, no recorded validation marker, no config surface. What the
  operator inspects before confirming (validate the installed plugin, for
  stack-control's own releases; nothing, for a docs collection) is project-specific
  and outside the workflow's contract.
- **D7.** No validation step lives in `tasks.md` (there is none to place there) →
  govern never waits on a publish-dependent task. The P2 deadlock is dissolved by
  construction, not merely relocated.
- **D8.** Closure is **operator-confirmed, never automatic**, and is exposed as the
  explicit `close-related --cascade` verb (dry-run → `--apply`). "Don't forget" is
  satisfied by the lifecycle surfacing `shipped` as non-terminal (compass/status
  report the pending `closed`), not by auto-firing.

---

## open-questions

- **OQ1 — Operator-confirm surface.** Where/how is the operator-confirmation guard
  presented? Options: the `close-related --cascade` dry-run + an explicit `--apply`
  the operator authorizes (the default close-related discipline); a dedicated
  `/stack-control:close` skill that shows the dry-run and prompts; or the
  `advance --to closed` verb refusing to apply the cascade without an explicit
  confirm flag. Pick one so "confirm" is a concrete, auditable action — not an
  ambient expectation.
- **OQ2 — Partial subtree.** When the `part-of` subtree contains a child that is
  NOT terminal yet, does the cascade skip-and-report it (lean) or refuse the whole
  cascade? Dry-run must surface it either way.
- **OQ3 — Backlog task parent-node ref.** Field name/shape; does `promote`
  set it automatically (it already moves an item into the roadmap)? Does `capture`
  accept it? Read-side: where does the auto-back-link in `done` read it from?
- **OQ4 — `shipped` vs `closed` boundary + close wiring.** `advance --to shipped`
  stays the merge/release milestone; `closed` is the operator-confirmed close.
  Which skill surfaces the close (and, for self-hosting, prompts the operator to
  validate the installed plugin first) — a tail of `/stack-control:release`, a new
  `/stack-control:close`, or an existing hygiene skill? (Per
  `enforcement-lives-in-skills.md`, the firing surface must be a skill body + CLI
  verb, never a git hook.)
- **OQ6 — Compass.** `shipped → closed` must be a legitimate next move; the compass
  must refuse `closed` from a non-`shipped` phase. (No validation marker to gate on
  — the guard is the operator-confirm at apply time, OQ1.)
- **OQ7 — Cancelled/retired items.** `close-related` already permits terminal
  statuses including `cancelled`. Do `cancelled`/`retired` items get a closure pass
  (close their `closes:`) too, or is the post-ship tail `shipped`-only? How does
  `--cascade` treat a `cancelled` child encountered in the subtree?
- **OQ8 — Idempotence + safety.** A `closes:` id already `Done` is a no-op (close is
  idempotent — `backend.close()` re-sets status + appends a note); confirm a
  re-run of the cascade is safe and reports "already closed" rather than erroring.
- **OQ9 — Decomposition.** This spans lifecycle-model change + 3 verb surfaces +
  close wiring. Confirm it is one feature spec (cohesive: the post-ship terminal
  stage) vs. a small program; if one spec, the natural `tasks.md` phases are:
  (1) `closed` phase/status + derivation/compass; (2) `roadmap resolves` +
  auto-back-link + task parent-node ref; (3) `close-related --cascade` + transitive
  closer + `childrenOf`; (4) operator-confirm close wiring (the close skill +
  `advance --to closed` running the cascade on confirm). NB: no validation marker,
  no entrance-criterion glue — the guard is operator-confirm at apply time.

---

## provenance

- **Operator design session 2026-06-23** — pickup of `multi:gap/transitive-item-closure`.
  Operator directives, verbatim where load-bearing: *"make it part of the terminal
  state workflow stage so that we don't forget to do it"*; *"we need to make it part
  of the post-install validation—which also needs to be part of the terminal state
  workflow stage"*; on the offing friction: *"the audit wouldn't run until all tasks
  are complete and one [task] is a post-install validation step—so the audit can't
  run until the plugin is published, which is backwards"*; *"the solution to that
  problem is to have the post-install validation be part of the workflow, not an
  implementation task"*; *"what has worked every time so far is to ask the agent to
  validate the installed plugin. That's good enough"*; *"adopters may not have an
  'install' step. So we can't bake that into the entrance criteria for any stage"*;
  *"asking the operator is good enough for validation. It's just a guard against
  automatic closure."*
- **Roadmap node** `multi:gap/transitive-item-closure` (the three stacked closure
  gaps + the proposed verb shapes).
- **Offing 0.52.2 dogfood friction** (post-install validation as a `tasks.md` task
  → audit/publish deadlock), operator-relayed.
- **Journals** 2026-06-22 / 2026-06-23 — manual installed-cache validation walks;
  16 backlog ids hand-closed at the `govern-030-hardening` closeout.
- **Rules:** `.claude/rules/agent-discipline.md` § "Issue closure requires
  verification in a formally-installed release"; `.claude/rules/enforcement-lives-in-skills.md`
  (firing surface = skill body + CLI verb, never a git hook);
  `.claude/rules/stack-control-succession.md` (thesis: make the failure state
  mechanically impossible).
- **Code map** (Explore, 2026-06-23): `close-related` `src/subcommands/roadmap.ts:281`;
  `closes:` grammar `grammars/roadmap.peg:22`, model `src/roadmap/roadmap-model.ts:40,141`;
  `add-edge` refusal `src/roadmap/edge-mutations.ts:89,98`; `backlog done`/`close()`
  `src/subcommands/backlog.ts:151`, `src/backlog/backend.ts:364`; phase-derivation
  `src/workflow/phase-derivation.ts:83`; compass `src/workflow/compass.ts:62`;
  `advance` `src/roadmap/mutations.ts:199`; reverse-edge pattern `blocks()`
  `src/roadmap/graph.ts:74`; `part-of` parsing `src/roadmap/roadmap-model.ts:24,153`.
