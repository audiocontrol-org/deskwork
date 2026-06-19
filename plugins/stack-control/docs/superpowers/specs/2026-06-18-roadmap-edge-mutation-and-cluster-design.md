# Design — roadmap edge-mutation and cluster (discoverability-first)

- **Roadmap item:** `impl:gap/roadmap-edge-mutation-and-cluster`
- **Backing evidence:** backlog TASK-242 (offing dogfood); folds in TASK-137 (reparent)
- **Phase:** designing → (handoff) design-to-spec
- **Date:** 2026-06-18
- **Design backend:** superpowers:brainstorming, driven via /stack-control:design with the stack-control design house rules injected (capture-over-YAGNI; ≥2 solution-space alternatives; required sections; operator approval; handoff to /stack-control:define)

This record captures the full design surface. Per the capture-over-YAGNI house rule, everything known or knowably-implied is recorded here; the explicit NOW-vs-DEFERRED split in **Scope** is the operator-driven scoping pass, not a YAGNI cut — the deferred items are captured roadmap work, not dropped.

## Problem domain

Adopting agents can neither easily **discover** how to mutate the stack-control roadmap nor **perform** the most natural mutation — clustering existing items under a parent and chaining their dependencies.

Live evidence, the `offing` project, Claude Code session `d98fc4fe-cbc8-41e2-941c-50c9c6505954` (2026-06-18). After seeding its roadmap the operator asked, verbatim: *"group the cluster you noticed. the change-runbook is probably what everything depends on. then env-promotion, then behavior-validation."* The agent then:

- ran `stackctl roadmap --help` and `roadmap add --help` → both errored (`unknown flag --help`); there is no help surface at the point of use;
- added a node with a deliberately **bogus status "to surface the vocabulary"** — the only way to learn the valid status set is to trip the error;
- tested `add` on an existing id and a no-op `reclassify` "to see behavior";
- **read the governed doc's grammar by hand** (the `- depends-on:` / `- part-of:` metadata-line format) because nothing tells an agent how edges are written;
- discovered there is **no verb** to add / remove / move an edge on an existing node (`add` refuses an existing id under the FR-005 uniqueness invariant), so it **hand-edited ROADMAP.md** with four edits to attach `part-of` edges and re-point a `depends-on` — directly contradicting the doc's own header *"manage the graph with stackctl roadmap — do not hand-edit"* — then leaned on `roadmap order`'s read-side validation as the only safety net.

Two compounding root causes:

1. **The mutation surface is incomplete.** It can CREATE nodes (`add`) and `advance / decompose / reclassify / defer`, but cannot mutate EDGES on existing nodes, and has no clustering convenience. The governed-doc contract *"do not hand-edit"* is only credible if every mutation an operator can ask for in words has a CLI path.
2. **The surface is undocumented at the point of use.** `stackctl roadmap` with no subaction prints only `usage: roadmap <next|blocked|add>`, though the real set is `next / blocked / blocks / order / graph / add / advance / decompose / reclassify / defer / reconcile / close-related` — discoverable only by triggering an unknown-subaction error. No `--help` works per-verb. This is not unique to roadmap: `backlog capture --help` fails identically; the whole `stackctl` surface (50 flat top-level verbs) lacks a discoverability convention.

Prior instance of the same capability gap (pre-offing): re-parenting `design:gap/roadmap-order-gating` and `design:gap/roadmap-advance-on-spec-finalize` (commit `85a46c6f`) was a manual markdown edit — captured as TASK-137, now folded here.

## Solution space

Each fork below was put to the operator; the chosen alternative is marked **[CHOSEN]**, the rejected ones carry their rejection reason. These bullets are the enumerated alternatives (the design considered ≥2 per fork before settling).

### Fork 1 — mutation model / how seriously to take "never hand-edit"

- **[CHOSEN] Discoverability-first.** Treat the primary problem as agents not knowing how to drive the existing surface. Ship self-documenting help + a worked-example doc header + the one cluster convenience now; **capture** (defer) the full edge-verb set. Fastest path to killing the friction; the deferred verbs are recorded, not dropped.
- **Rejected — Full verb coverage now.** Every mutation (add/remove/move edges, cluster, rename, remove node) gets a verb immediately; "do not hand-edit" becomes enforceable. Most thesis-aligned end-state, but the largest surface to land in one feature; rejected as the *first* slice — it becomes the deferred target instead.
- **Rejected — Verbs + blessed safe hand-edit as the permanent model.** Accept hand-editing as a normal first-class path forever. Rejected as the *end-state* (it normalizes the offroad), but its interim form is adopted in Fork 4 only until verbs land.

### Fork 2 — discoverability scope

- **[CHOSEN] stackctl-wide convention, roadmap as first adopter.** Build one help/usage convention for all `stackctl` verbs; roadmap is the first adopter and proof case. Fixes the class of bug, not the instance. Needs a shared help primitive.
- **Rejected — Roadmap-local only.** Scope self-documentation to roadmap alone. Smaller and faster, but leaves the identical `--help` gap on every other verb (`backlog`, etc.); rejected because the operator wants the class fixed.

### Fork 3 — anti-drift: how help is defined so it cannot lie

- **[CHOSEN] Derive help from a shared parser combinator.** Introduce a shared arg-parser; verbs migrate onto it; `--help`, usage, per-subaction help, and the status vocabulary are generated from the parser tree. Non-drift by construction. Biggest lift; adopted incrementally (roadmap first).
- **Rejected — Single-source HelpSpec drives both render and validation.** A declarative descriptor feeding both. Non-drift, but a parallel descriptor the verb must keep in step with its logic.
- **Rejected — Render-only HelpSpec + conformance test.** Cheapest wide rollout, but drift is caught by a test rather than prevented by construction; weaker guarantee than the parser-derived approach.

### Fork 4 — governed-header stance given the deferral

- **[CHOSEN] Honest interim + revalidate.** The header documents the verbs that exist AND explicitly blesses *"for an edit without a verb yet (e.g. moving a part-of/depends-on edge): edit this file, then run `stackctl roadmap order` to revalidate."* Never lies to the agent; the loader's read-side validation is the safety net; the stance tightens automatically as deferred verbs land.
- **Rejected — Keep strict "do not hand-edit."** Cleanest invariant, but until the edge-verbs ship it re-creates the offing trap (tells the agent not to hand-edit while providing no verb).
- **Rejected — Full surface marked now/deferred.** Informative but verbose; the now/deferred bookkeeping in the governed header would itself rot as verbs land.

### Fork 5 — verb-surface consolidation relationship

- **[CHOSEN] Prove the pattern on roadmap, capture the rest.** This feature builds the shared parser + makes roadmap fully self-documenting + the cluster verb + honest header. The noun-consolidation of the other ~49 verbs (≈12–15 nouns) becomes its own captured roadmap item (the rollout), sequenced later. Keeps this feature shippable.
- **Rejected — Consolidation IS the feature.** Reframe to "tame the whole stackctl surface" in one feature. Largest blast radius + a backwards-compat alias burden; rejected as one slice.
- **Rejected — Separate concerns entirely (roadmap-local).** Would walk back the Fork-2 stackctl-wide choice; rejected.

## Decisions

1. **Build a shared arg-parser combinator primitive** (`noun → subactions → flags`, with typed flags and an enumerated value vocabulary). `--help` / `-h`, complete top-level usage, per-subaction help, and the status vocabulary are all **rendered from the parser tree** — parsing IS the help source, so an undocumented or phantom flag is impossible by construction.
2. **Migrate `roadmap` onto the parser as the first adopter / proof case.** `runRoadmapCli` stops hand-parsing and declares its tree; the dispatcher intercepts `--help`/`-h` before invoking the verb and renders from the tree. `stackctl roadmap` (no subaction) renders the complete subaction list (fixing today's truncated `<next|blocked|add>`).
3. **Add a `roadmap cluster` convenience verb** with this shape:
   - `stackctl roadmap cluster <parent-id> --children a,b,c [--chain] [--apply]`
   - `<parent-id>`: **create-or-reuse** — created (status `planned`) if absent, grouped-under if present.
   - `--children`: attach `part-of: <parent>` to each existing child.
   - `--chain`: additionally wire `depends-on` in the given order (`a → b → c`).
   - **Standalone implementation** (does not wait on the deferred edge primitives), **dry-run by default**, `--apply` to write, graph-revalidating (refuse cycle / dangling / self / dup), **zero-write-on-failure** (build the mutated document in a buffer, validate, then commit atomically — never a partial multi-edge write).
   - **Naming:** `cluster`, with `group` as an alias.
4. **Replace the ROADMAP.md header** with the honest-interim form (Fork 4 [CHOSEN]).
5. **Capture the deferred work** as roadmap sibling item(s): the full edge-mutation verb set (`add-edge` / `remove-edge` / `move-edge`=reparent, absorbing TASK-137; plus `rename` / `remove-node`) and the verb-surface consolidation rollout (the other ~49 verbs adopt the parser; flat families collapse to nouns; machine-adapter verbs marked internal; backwards-compat aliases for a deprecation window).

## Scope

**In this feature (NOW):** shared parser combinator primitive; `roadmap` migrated as first adopter (full self-documenting `--help` / usage / per-subaction help / vocab); `roadmap cluster` (+`group` alias) verb; honest-interim ROADMAP.md header; tests (below).

**Captured / deferred (recorded, NOT dropped):**
- Edge-mutation verb set: `add-edge` / `remove-edge` / `move-edge` (reparent — absorbs TASK-137), `rename`, `remove-node`.
- Verb-surface consolidation rollout: `scope/*` → `scope <action>` (~18→1), `audit-barrage` / `session` / `release` / `doc` / `spec` groupings; mark machine-adapter verbs (`intercept`, `mediate-check`, `execute-check`, `wrap-prompt`, `validate-return`, `front-door`, `audit-barrage-render`, `slush-findings`, `no-shortcuts-audit`) internal; backwards-compat aliases over a deprecation window; remaining verbs adopt the parser.

## Testing strategy

- **Parser combinator unit tests:** tree → rendered help string; flag parsing/validation; vocabulary enumeration; unknown-flag and unknown-subaction error shapes.
- **Conformance test (the non-drift teeth):** assert roadmap's rendered help enumerates exactly its real subactions and flags — i.e. that `--help` and parsing cannot disagree.
- **`cluster` integration tests** on a fixture graph: create-new parent; reuse-existing parent; `--chain` ordering produces `a→b→c` depends-on; dry-run writes nothing; `--apply` writes and revalidates; revalidation refusals (cycle / dangling / self / dup) leave the file byte-for-byte unchanged (zero-write-on-failure).
- **Golden test** on the rendered `stackctl roadmap --help` and the no-subaction usage line.

(Per project rules: local-only smokes, never CI-bound browser/boot tests; tests written alongside implementation.)

## Open questions

1. **Multi-edge atomicity mechanism.** Decision 3 specifies buffer-validate-commit; confirm whether the existing roadmap mutation layer (`src/roadmap/mutations.ts`) already offers an atomic write path `cluster` can reuse, or whether a small transactional helper is introduced.
2. **`--chain` conflict policy.** When a child already carries a conflicting `depends-on`, does `--chain` refuse (safer) or overwrite (more convenient)? Leaning refuse-with-clear-error; to be pinned in the spec.
3. **Deferred-capture granularity.** Are the deferred edge-verbs and the consolidation rollout **one** captured sibling roadmap item or **two**? (Two reads cleaner: a capability item and a surface-hygiene item.)
4. **Parser adoption surface in this feature.** Does the shared parser primitive ship with ONLY roadmap migrated (tightest proof), or also opportunistically migrate the 1–2 simplest sibling verbs to validate the convention generalizes before the rollout?

## Provenance

- **Trigger:** offing dogfood, session `d98fc4fe-cbc8-41e2-941c-50c9c6505954`, 2026-06-18; offing ROADMAP.md commit `6ba8603` (the hand-edited cluster).
- **Backing backlog item:** TASK-242 (`type:gap`, `agent-found`).
- **Folds in:** TASK-137 (reparent / move-edge), whose standalone roadmap node `impl:gap/roadmap-reparent-verb` was retired and re-pointed here.
- **Design forks** resolved interactively with the operator this session (Forks 1–5 above), under the stack-control design house rules (`stack-control-design-v1`).
- **Related surfaces:** `src/cli.ts` (flat `SUBCOMMANDS` dispatch, 50 verbs); `src/roadmap/` (`mutations.ts`, `roadmap-model.ts`, `views.ts`, `graph.ts`, `reconcile.ts`); `src/workflow/house-rules.ts` (the one-source/two-consumers non-drift precedent this design echoes).
