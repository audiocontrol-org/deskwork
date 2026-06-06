# Design Inbox — stack-control program

> **Interim — sunsets at Feature 8.** This file + its convention are the stopgap until stack-control ships native low-friction insight capture (roadmap Feature 8). Governed by [`.claude/rules/design-inbox.md`](../../../../.claude/rules/design-inbox.md). When Feature 8 lands, this is retired and capture moves to the plugin's mechanism.

A low-friction parking lot for **out-of-sequence design ideas** that surface mid-thread. Capture is instant and append-only; it never blocks the current thread. **Capture ≠ scope** — entries are triaged in a *separate, deliberate pass* (promote to a spec / roadmap feature / GitHub issue, or discard with a reason). This file exists because design and scoping are not a serial process: ideas arrive while other work is fresh, and we must not lose hard-won insights by deferring their capture until "later."

Distinct from:
- **`stack-control-roadmap.md`** — curated, scoped, sequenced program plan. The inbox feeds it; it is not the inbox.
- **GitHub issues** — heavier, outward-facing, tracked work. Triage may promote an inbox entry into one.
- **`tooling-feedback.md`** — scope-discovery friction log (different signal).

Entry format (keep it minimal — appending must stay a one-move act):
`### <title>` + **Surfaced**, **Context**, **Idea**, **Provisional home**, **Status** (`captured` → `triaged` / `promoted` / `dropped`).

---

### Audit-barrage as a spec-definition governance step

- **Surfaced:** 2026-06-06, mid-triage of Feature 2's spec barrage.
- **Context:** Ran audit-barrage manually over `specs/002/spec.md` — 51 findings incl. 3 real contradictions. Spec authoring should not depend on a human remembering to run the barrage.
- **Idea:** A Spec Kit governance hook (`after_specify` / `after_clarify` / `after_plan`) that fires the cross-model barrage over the *spec*, mirroring the existing `after_implement` `deskwork-governance` extension. And/or fold a barrage pass into the front-door `define` / `extend` skills. Extends stack-control's "govern produced code" to "govern the spec itself" — squarely on the north star.
- **Provisional home:** stack-control front-door / governance enhancement (NOT Feature 2). Own small feature, or an extension of the governance slice.
- **Status:** **promoted** → `stack-control-roadmap.md` Feature 9 ("Govern the spec, not just the implementation"), 2026-06-06.

### SEDA (staged queues) as the execution-engine architecture

- **Surfaced:** 2026-06-06, mid-triage of Feature 2's spec barrage.
- **Context:** Staged event-driven architecture maps ~1:1 onto the engine and is apt *because* of the unattended/all-night requirement (SEDA exists for well-conditioned behavior under overload). Resolves several barrage findings at once: single termination invariant (queues drained + no worker busy), concurrency bound via per-stage pools + backpressure, natural merge serialization (1-worker reconcile stage), backend-loss re-enqueue, resource-exhaustion admission control, conflict-resolution-as-a-re-enqueued-event.
- **Idea:** Model execution as SEDA stages: `parse → schedule → execute (N workers) → reconcile (1 worker) → audit`. Spec carries the *behavioral* NFRs (backpressure, bounded concurrency, single termination invariant, stage observability); the concrete stage design lives in `research.md`/`plan.md`.
- **Provisional home:** Feature 2 plan/research (ACTIVE thread). Possible generalization: SEDA as a reusable stack-control execution substrate.
- **Status:** in active discussion — spec-vs-plan placement pending.

### Low-friction out-of-sequence capture as a first-class capability

- **Surfaced:** 2026-06-06. Operator: "we need a standard way to capture and scope out-of-sequence ideas… design should be as low friction as possible… treating design and scoping as a serial process is goofy."
- **Context:** Multiple design ideas surfaced mid-thread this session; the serial "finish, then file" habit loses fresh insight. This file is the v0 convention.
- **Idea:** Candidate next steps — (a) codify the inbox convention as a `.claude/rules/` rule so it's durable; (b) make it a native stack-control capability (a `stackctl` capture verb / a control-plane "idea inbox" surface) so the control plane itself supports parallel design threads; (c) wire graduation into deskwork's Ideas stage for entries that become real documents.
- **Provisional home:** stack-control program (process + future capability). This inbox is the first instance.
- **Status:** **promoted** → `stack-control-roadmap.md` Feature 8 ("Low-friction insight capture") + the vision in § What stack-control is, 2026-06-06. Still open: codify the inbox *convention* as a `.claude/rules/` rule (pending operator nod).
