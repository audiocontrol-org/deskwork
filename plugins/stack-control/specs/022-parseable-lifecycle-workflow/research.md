# Research: Parseable lifecycle workflow engine

No `NEEDS CLARIFICATION` markers remained after `/speckit-clarify`. This records the load-bearing decisions (from the converged design record + the three clarifications) and the alternatives weighed.

## D1. Engine shape — new `workflow` family consuming the roadmap node-reader

- **Decision**: a new `workflow` verb family with its own grammar/transition/effect surface that *consumes* `src/roadmap/` (`roadmap-model.ts`, `graph.ts`, `views.ts`) for node reads.
- **Rationale**: `roadmap` has never fired effects; transitions + the effect manifest + `WORKFLOW.md` are genuinely new. Composition keeps `roadmap` focused on the DAG.
- **Alternatives**: bolt phase-awareness onto the roadmap reasoner — rejected (couples two concerns, bloats roadmap with effect execution).

## D2. Phase is derived, never stored

- **Decision**: current phase is a pure function over existing artifacts (backlog presence, node status, `design:`/`spec:` pointers, spec-govern + impl-govern convergence records, `tasks.md` completion, release tag). No stored phase field.
- **Rationale**: a stored phase is a second source of truth that drifts — the exact failure this feature kills. `session-start`/`reconcile` already derive informally; the engine makes it total + explicit.
- **Alternatives**: a persisted phase field — rejected (drift). Derive on the design *file's* existence — rejected (mis-derives during `designing` before the backend writes the file; D3 keys on the pointer instead).

## D3. Derive `designing` on the `design:` pointer, gate on the content

- **Decision**: `open-design` sets the node `design:` pointer immediately; derivation keys on the pointer; the `design-to-spec` exit gate checks the file content (sections).
- **Rationale**: keeps derivation monotonic from phase entry; mirrors the `spec:`-pointer precedent.
- **Alternatives**: a transient "designing, pre-record" sub-state — rejected (extra state for no gain).

## D4. Governed `WORKFLOW.md` via the document-model grammar engine — bundled default, per-install overridable

- **Decision**: `WORKFLOW.md` is parsed by `src/document-model/` (`grammar-resolver.ts`, `grammar-parse.ts`) — the third document-primitives use after `ROADMAP.md` / `DESIGN-INBOX.md`. It ships as a **plugin-bundled default** in `templates/`, resolved through the existing override stack (installation copy wins, else bundled).
- **Rationale**: the lifecycle is stack-control's universal opinion but must stay tailorable; the override resolver and grammar engine already exist (reuse, don't rebuild). *(Clarification 2026-06-16.)*
- **Alternatives**: per-installation authored only (no canonical lifecycle — rejected); bundled-only/no-override (no tailoring — rejected).

## D5. Mechanical gates; judgment = a recorded node-field marker

- **Decision**: every criterion is a true/false predicate over existing artifacts; a judgment criterion checks a recorded operator-approval **field on the roadmap node** (e.g. `design-approved:`), co-located with `design:`/`spec:`.
- **Rationale**: dissolves the mechanical-vs-judgment tension — the operator judges, the gate checks the recorded fact; one governed surface (the node). *(Clarification 2026-06-16.)*
- **Alternatives**: approval in artifact frontmatter (split surface) or a dedicated approvals sidecar (new store) — both rejected for the node field.

## D6. Atomic advance — commit-last is the transaction boundary

- **Decision**: `advance --apply` requires the advance-touched paths clean (fail loud on dirty), validates each effect, applies non-commit mutations, then fires `commit` LAST; on any pre-commit failure, `git restore` the touched paths.
- **Rationale**: the single trailing commit IS the commit point; git provides rollback for free — no bespoke transaction engine.
- **Alternatives**: a real staged transaction — deferred (unneeded while every effect is a file mutation captured by the trailing commit).

## D7. Fixed 7-verb effect vocabulary; a missing effect ⇒ add a verb

- **Decision**: effects are calls to governed verbs from a fixed palette (`roadmap advance`, `roadmap reconcile`, `journal append`, `doc set-status-field`, `workflow link-design`, `workflow link-spec`, `commit`). `advance` fires bookkeeping only; heavy/interactive work is the explicit skill `workflow next` names.
- **Rationale**: a fixed vocabulary leaves nothing to interpret, so nothing to relitigate; the add-a-verb rule is field-proven (TASK-137 `roadmap reparent`).
- **Alternatives**: prose effects — rejected (re-introduces interpretation/debate).

## D8. Mode-keyed govern-convergence record (TASK-19) — symmetric mechanism, spec gate parked

- **Decision**: one record *mechanism* keyed by mode can record both `govern --mode spec` and impl govern convergence, written inside the installation; the mechanism is retained for both modes. Extends `src/govern/`.
- **Gate enforcement (workflow-policy decision 2026-06-16):** spec audit-barrage is **parked from the default workflow** ("until the spec-audit protocol's kinks are worked out"). So `governing → shipped` is decided by the impl-govern record (required, mechanical), while `specifying → implementing` derives from `speckit-analyze`-clean **by default**; the spec-govern record/gate is **opt-in**, not default-required. The symmetric mechanism is kept so re-enabling the spec gate is a flag flip, not a re-design.
- **Rationale**: keeps the impl back-half mechanical (absorbs TASK-19) while not forcing an immature spec-audit protocol into the default path; the retained mechanism keeps the door open.
- **Alternatives**: make spec-govern a default-required gate now (rejected — the spec-audit protocol has unresolved kinks); strip spec-govern from the design entirely (rejected — the park is temporary, re-design cost is avoided by keeping the mechanism).

## D9. The design frontend bends the backend at the seam, in-session

- **Decision**: `/stack-control:design` runs the backend (default `superpowers:brainstorming`) IN-SESSION (the conversation is interactive — not a sub-agent, not shell-out); the frontend's single-source house-rules block is injected into the backend AND checked by the `design-to-spec` exit gate (three-layer opinion injection).
- **Rationale**: you cannot control a third-party backend's process, so the durable lever is its output contract + the gate; interactivity forbids sub-agent isolation.
- **Alternatives**: sub-agent or shell-out backend (breaks interactivity) — rejected; preamble-only opinion (forgotten mid-conversation) — rejected in favor of point-of-use re-injection + gate.

## D10. Mid-stream re-design reuses 021 checkpoint-staleness (thin — flagged)

- **Decision**: a `* → designing` re-entry opens a new design-record revision, marks affected downstream phase checkpoints stale (reuse `src/govern/checkpoint-state.ts`), and preserves the spec dir as a revision.
- **Rationale**: re-design changes in-scope intent, so dependent checkpoints must re-derive — the 021 staleness machinery already models this.
- **Open**: the precise staleness-invalidation scope and spec-dir revisioning are the thinnest area; `/speckit-tasks` will sequence a focused design/RED pass. Captured, not cut.
