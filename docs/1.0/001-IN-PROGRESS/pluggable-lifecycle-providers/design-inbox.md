# Design Inbox — stack-control program

> **Interim — sunsets at `design/insight-capture`.** This file + its convention are the stopgap until stack-control ships native low-friction insight capture (roadmap `design/insight-capture`). Governed by [`.claude/rules/design-inbox.md`](../../../../.claude/rules/design-inbox.md). When `design/insight-capture` lands, this is retired and capture moves to the plugin's mechanism.

A low-friction parking lot for **out-of-sequence design ideas** that surface mid-thread. Capture is instant and append-only; it never blocks the current thread. **Capture ≠ scope** — entries are triaged in a *separate, deliberate pass* (promote to a spec / roadmap feature / GitHub issue, or discard with a reason). This file exists because design and scoping are not a serial process: ideas arrive while other work is fresh, and we must not lose hard-won insights by deferring their capture until "later."

Distinct from:
- **`stack-control-roadmap.md`** — curated, scoped, sequenced program plan. The inbox feeds it; it is not the inbox.
- **GitHub issues** — heavier, outward-facing, tracked work. Triage may promote an inbox entry into one.
- **`tooling-feedback.md`** — scope-discovery friction log (different signal).

Entry format (keep it minimal — appending must stay a one-move act):
`### <title>` + **Surfaced**, **Context**, **Idea**, **Provisional home**, **Status** (`captured` → `triaged` / `promoted` / `dropped`).

---

### Audit-barrage as a spec-definition governance step

- **Surfaced:** 2026-06-06, mid-triage of `impl/execution-engine`'s spec barrage.
- **Context:** Ran audit-barrage manually over `specs/002/spec.md` — 51 findings incl. 3 real contradictions. Spec authoring should not depend on a human remembering to run the barrage.
- **Idea:** A Spec Kit governance hook (`after_specify` / `after_clarify` / `after_plan`) that fires the cross-model barrage over the *spec*, mirroring the existing `after_implement` `deskwork-governance` extension. And/or fold a barrage pass into the front-door `define` / `extend` skills. Extends stack-control's "govern produced code" to "govern the spec itself" — squarely on the north star.
- **Provisional home:** stack-control front-door / governance enhancement (NOT `impl/execution-engine`). Own small feature, or an extension of the governance slice.
- **Status:** **promoted** → `stack-control-roadmap.md` `design/spec-governance` ("Govern the spec, not just the implementation"), 2026-06-06.

### SEDA (staged queues) as the execution-engine architecture

- **Surfaced:** 2026-06-06, mid-triage of `impl/execution-engine`'s spec barrage.
- **Context:** Staged event-driven architecture maps ~1:1 onto the engine and is apt *because* of the unattended/all-night requirement (SEDA exists for well-conditioned behavior under overload). Resolves several barrage findings at once: single termination invariant (queues drained + no worker busy), concurrency bound via per-stage pools + backpressure, natural merge serialization (1-worker reconcile stage), backend-loss re-enqueue, resource-exhaustion admission control, conflict-resolution-as-a-re-enqueued-event.
- **Idea:** Model execution as SEDA stages: `parse → schedule → execute (N workers) → reconcile (1 worker) → audit`. Spec carries the *behavioral* NFRs (backpressure, bounded concurrency, single termination invariant, stage observability); the concrete stage design lives in `research.md`/`plan.md`.
- **Provisional home:** `impl/execution-engine` plan/research (ACTIVE thread). Possible generalization: SEDA as a reusable stack-control execution substrate.
- **Status:** **resolved** → spec **FR-032** (queue-based staged-concurrency named as the *settled, non-optional* architecture + four behavioral NFRs) + **FR-032a** (state-of-the-art research proviso: the *concrete* mechanism is chosen via a survey in `/speckit-plan`'s `research.md`), 2026-06-06. Operator: *"I want SEDA in the spec, with a proviso that we do some research into the state of the art… there is no option but to use some kind of queuing mechanism."*

### Low-friction out-of-sequence capture as a first-class capability

- **Surfaced:** 2026-06-06. Operator: "we need a standard way to capture and scope out-of-sequence ideas… design should be as low friction as possible… treating design and scoping as a serial process is goofy."
- **Context:** Multiple design ideas surfaced mid-thread this session; the serial "finish, then file" habit loses fresh insight. This file is the v0 convention.
- **Idea:** Candidate next steps — (a) codify the inbox convention as a `.claude/rules/` rule so it's durable; (b) make it a native stack-control capability (a `stackctl` capture verb / a control-plane "idea inbox" surface) so the control plane itself supports parallel design threads; (c) wire graduation into deskwork's Ideas stage for entries that become real documents.
- **Provisional home:** stack-control program (process + future capability). This inbox is the first instance.
- **Status:** **promoted** → `stack-control-roadmap.md` `design/insight-capture` ("Low-friction insight capture") + the vision in § What stack-control is, 2026-06-06. Sub-item DONE: the inbox *convention* is codified as the self-sunsetting [`.claude/rules/design-inbox.md`](../../../../.claude/rules/design-inbox.md) (retires at `design/insight-capture`).

### Execute audit-fixes in an isolated, minimal context (fresh-context fix dispatch)

- **Surfaced:** 2026-06-07, mid `design/spec-governance` convergence-loop dogfood (governing the 004 spec against itself).
- **Context:** Across re-barrage rounds the gate kept surfacing a fresh HIGH each round, landing **on the new fix text itself** (AUDIT-24 was a contradiction introduced by a round-2 edit; round-3 MEDs critiqued round-3 wording). Iter-1 (tight fixes) hit 0 HIGH; rounds 2–3 (expansive fixes authored in a long, accumulated session context) regressed. **Operator's diagnosis (the correction):** the problem is NOT what the auditors look at (they correctly find real flaws) — it is the **fix author's degrading attention under context fatigue**. An agent's first mis-diagnosis was to compensate by constraining the auditors (delta-audit, severity rubric, cross-run reconciliation); that targets the symptom, not the cause.
- **Idea:** Build the convergence loop's **fix step** to run in a **fresh, isolated, minimal context** rather than the long-running orchestrating session. Concretely: between barrages, dispatch each open finding to a **clean per-finding sub-agent** given only the finding + the cited spec span, asked for the **minimal** edit; the orchestrator applies it and re-barrages. Fresh attention per fix, narrow scope, no accumulated baggage — and it structurally prevents over-elaboration (a sub-agent with one finding and one paragraph cannot add caveat-essays). Environmental-design move (thesis: industrialize execution; don't rely on one fatiguing context staying sharp). Aligns with [#408](https://github.com/audiocontrol-org/deskwork/issues/408) (fresh-context / session-clear between long-loop iterations vs grinding one context down). Open design Qs for the implementing session: where the dispatch lives (govern-spec.sh loop driver vs the skill body vs a `stackctl` verb); how the orchestrator selects/serializes per-finding edits to the one spec file; whether the same fresh-context discipline should apply to the *implementation*-phase governance loop too.
- **Provisional home:** audit-barrage protocol / convergence-loop enhancement (`multi/migrate-audit-barrage` now owns the protocol in-house; could be its own protocol-enhancement feature). Relates to #408.
- **Status:** **implemented** (2026-06-06) — the fix step is now a fresh-context per-finding sub-agent dispatch, encoded in BOTH governance skill bodies: `spec-kit/spec-governance/commands/speckit.spec-governance.govern-spec.md` (spec-phase: minimal prose edit) and `spec-kit/deskwork-governance/commands/speckit.deskwork-governance.govern.md` (implementation-phase: TDD-first minimal code fix). Open Qs resolved: the dispatch lives in the **skill-body loop driver** (not `govern-spec.sh`, which stays a single barrage+gate pass — bash can't dispatch sub-agents); per-finding edits **serialize one-at-a-time** for write-safety on the single artifact; the discipline applies to **both** governance loops (operator decision 2026-06-06). **Refined 2026-06-06** (operator caught the cost): the per-finding dispatch must give each sub-agent the **whole artifact** + scope to **resolve the finding consistently everywhere it ripples** (not "only this span") — single-span scoping caused AUDIT-41 (FR-007 corrected, SC-004/scenario/edge-case left contradicting it). Also: **verify a finding's premise against the code before specifying machinery** (the cross-run-reconciliation cascade AUDIT-31→39→40 was fiction the code never had). Both encoded in the skill bodies.

### Clone detector doesn't cover shell scripts — bash duplication is invisible to scope-discovery

- **Surfaced:** 2026-06-06, when the operator asked why the audit protocol wasn't single-sourced. The convergence gate + slush loop existed only in `govern-spec.sh`; `govern.sh` (impl phase) duplicated the slug/guards/render→barrage→lift scaffolding (its own comment says "mirror govern.sh lines 25-42") and omitted slush+gate entirely.
- **Context:** `.jscpd.json` is `"languages": ["typescript"], "pattern": "**/*.ts"`. The clone detector that should have caught the `govern.sh` ↔ `govern-spec.sh` duplication **only scans TypeScript** — bash orchestration duplication is structurally invisible to it. This is exactly the class of pathology scope-discovery exists to catch, and the mechanism had a coverage blind spot.
- **Idea:** Extend clone/scope-discovery coverage to shell scripts (jscpd supports it). Interacts with `design/migrate-scope-discovery`'s per-codebase clone scoping (don't conflate plugins). Secondary point: moving orchestration OUT of bash and INTO TS (this consolidation) also pulls it back under jscpd's coverage — a structural fix, not just a config change.
- **Provisional home:** `design/migrate-scope-discovery` (clone-detection scoping + language coverage).
- **Status:** `captured`.
