---
doc-grammar: design-inbox
---

# stack-control — design inbox

A governed, low-friction parking lot for out-of-sequence design ideas. Each
entry is a `### <title>` Unit with a `**Status:**` of `captured` (active),
`promoted` (graduated to a roadmap row / issue / spec), or `dropped`
(discarded). Governed by the built-in `design-inbox` grammar; keep it lean
with `/stack-control:curate` (promoted/dropped entries archive out).

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
- **Status:** **promoted** (was: resolved) → spec **FR-032** (queue-based staged-concurrency named as the *settled, non-optional* architecture + four behavioral NFRs) + **FR-032a** (state-of-the-art research proviso: the *concrete* mechanism is chosen via a survey in `/speckit-plan`'s `research.md`), 2026-06-06. Operator: *"I want SEDA in the spec, with a proviso that we do some research into the state of the art… there is no option but to use some kind of queuing mechanism."*

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
- **Status:** **promoted** (was: implemented) (2026-06-06) — the fix step is now a fresh-context per-finding sub-agent dispatch, encoded in BOTH governance skill bodies: `spec-kit/spec-governance/commands/speckit.spec-governance.govern-spec.md` (spec-phase: minimal prose edit) and `spec-kit/deskwork-governance/commands/speckit.deskwork-governance.govern.md` (implementation-phase: TDD-first minimal code fix). Open Qs resolved: the dispatch lives in the **skill-body loop driver** (not `govern-spec.sh`, which stays a single barrage+gate pass — bash can't dispatch sub-agents); per-finding edits **serialize one-at-a-time** for write-safety on the single artifact; the discipline applies to **both** governance loops (operator decision 2026-06-06). **Refined 2026-06-06** (operator caught the cost): the per-finding dispatch must give each sub-agent the **whole artifact** + scope to **resolve the finding consistently everywhere it ripples** (not "only this span") — single-span scoping caused AUDIT-41 (FR-007 corrected, SC-004/scenario/edge-case left contradicting it). Also: **verify a finding's premise against the code before specifying machinery** (the cross-run-reconciliation cascade AUDIT-31→39→40 was fiction the code never had). Both encoded in the skill bodies.

### Clone detector doesn't cover shell scripts — bash duplication is invisible to scope-discovery

- **Surfaced:** 2026-06-06, when the operator asked why the audit protocol wasn't single-sourced. The convergence gate + slush loop existed only in `govern-spec.sh`; `govern.sh` (impl phase) duplicated the slug/guards/render→barrage→lift scaffolding (its own comment says "mirror govern.sh lines 25-42") and omitted slush+gate entirely.
- **Context:** `.jscpd.json` is `"languages": ["typescript"], "pattern": "**/*.ts"`. The clone detector that should have caught the `govern.sh` ↔ `govern-spec.sh` duplication **only scans TypeScript** — bash orchestration duplication is structurally invisible to it. This is exactly the class of pathology scope-discovery exists to catch, and the mechanism had a coverage blind spot.
- **Idea:** Extend clone/scope-discovery coverage to shell scripts (jscpd supports it). Interacts with `design/migrate-scope-discovery`'s per-codebase clone scoping (don't conflate plugins). Secondary point: moving orchestration OUT of bash and INTO TS (this consolidation) also pulls it back under jscpd's coverage — a structural fix, not just a config change.
- **Provisional home:** `design/migrate-scope-discovery` (clone-detection scoping + language coverage).
- **Status:** **promoted** (was: partially fixed) (2026-06-07); remainder promoted → `stack-control-roadmap.md` `design/migrate-scope-discovery` row (2026-06-07).** Config now covers `ts/tsx/sh/bash` and excludes `.specify/**` (installer-generated/upstream); bash clones → 0 after the govern consolidation. Per-codebase scoping demonstrated: `npx jscpd plugins/stack-control` drops whole-repo 327 clones → 3 (intra-plugin, real), excluding the 310 cross-plugin vendored audit-barrage copies. Remaining (now explicit roadmap scope item 1, + the `govern --mode implement` clone step as item 2): vendor the full clone-detector (baselines, dispositions, NEW-gating) into stack-control + make per-codebase scoping the default (not a manual path arg).

### Install-drift: nothing checks the .specify install copy against its source

- **Surfaced:** 2026-06-07, during the govern consolidation. The live `after_implement` hook runs `.specify/extensions/deskwork-governance/` — a COPY the Spec Kit installer made (recording a `manifest_hash` in `.specify/extensions/.registry`). The copy had gone STALE (frozen pre-`multi/migrate-audit-barrage`): it still shelled `dw-lifecycle` and lacked the fix-dispatch discipline, while the plugin source had moved on. Nothing detected the drift; it hid for ~2 days until the (newly shell-aware) clone detector caught it.
- **Context:** the installer stores `manifest_hash` per extension but no surface ever re-computes the source hash and compares. Edits to `plugins/stack-control/spec-kit/<ext>/` silently don't take effect until a manual `specify extension add <path> --dev --force`. This is the exact "mechanism exists but never fires" shape as the clone-coverage gap.
- **Idea:** a `session-start` advisory check that, for each locally-sourced installed extension, compares the installed copy to the plugin source (diff, or re-derive the manifest hash) and warns "stale install — re-run `specify extension add …`". Cheap, catches the class automatically. Open Q: reuse the installer's hash algorithm vs a simple `diff -r` of the tracked copy vs source.
- **Provisional home:** `multi/migrate-session-skills` (session-start advisory checks) or `design/migrate-scope-discovery`.
- **Status:** **promoted → `stack-control-roadmap.md` `design/migrate-scope-discovery` row (2026-06-07), as explicit scope item 3.** Home decision (migrate-scope-discovery vs. migrate-session-skills) left open in the roadmap row — re-home if it lands more naturally with the session-skills migration.

### Spec-authoring skill — consolidate "how to write a spec" guidance (DEFINE-phase tooling)

- **Surfaced:** 2026-06-07, while driving the 004 convergence loop. Operator: *"we clearly need a spec authoring skill where we can consolidate guidance about how to write a spec."*
- **Context:** Findings AUDIT-44 / AUDIT-46 / AUDIT-47 were NOT deep design defects — they were the **same convergence rule restated in ~6 prose locations that drifted out of sync** (a DRY violation in spec prose). Each per-finding patch updated one site and spawned the next drift, so the loop wouldn't converge until the prose was DRY-collapsed to a single canonical FR-010 (commit `65e2936d`). The barrage was correctly finding real self-contradictions; the root cause was authoring discipline, not the auditor. This is the DEFINE end of the barbell — exactly where the thesis says to invest. A skill that encodes the authoring lessons would prevent the generator class up front instead of catching each instance after the fact.
- **Idea:** A `stack-control` DEFINE-phase **spec-authoring skill** consolidating how to write a spec, encoding (at least): (1) **DRY for prose** — state each requirement/rule/mechanic exactly ONCE (the canonical FR); every other section (other FRs, Success Criteria, Key Entities, clarifications) *references* it, never re-derives it. State-machine / protocol mechanics are the highest-risk duplication surface. (2) **Promises before mechanism** — lead with the plain-language guarantees the feature must keep; describe mechanism second, and prefer pointing at the code/`contracts/` as the authority on precise mechanics rather than restating a state machine in FRs. (3) **Verify-premise against code** when the spec describes already-built behavior (don't spec fiction the code doesn't have — the AUDIT-31→39→40 cross-run-reconciliation cascade). (4) **Capture-mode vs scope-mode** (composes the existing `.claude/rules/agent-discipline.md` discipline — specs capture everything; scoping is a later explicit pass). (5) structural conventions: FRs own their requirement; SCs state guarantees + reference FRs; Key Entities reference, don't re-derive. **Mechanical-interlock candidate (thesis):** the same DRY/single-source rules could become **audit criteria in the spec-governance barrage prompt** ("flag any rule defined in more than one location") — so the authoring skill *advises* and the governance barrage *enforces*, closing the loop. Relationship to Spec Kit: composes with / layers on top of `/speckit-specify` (a "write it well" layer over the scaffold), not a replacement.
- **Provisional home:** stack-control DEFINE-phase capability — sibling of `design/spec-governance` and `design/insight-capture`. Candidate roadmap feature (`design/spec-authoring`?). The barrage-enforcement sub-idea belongs with `design/spec-governance` / the audit-barrage prompt.
- **Field validation (2026-06-08, 005 dogfood):** the spec-governance loop proved this is the **prevention half** of a two-ended discipline (prevention = authoring; detection = the new spec-mode audit lens). The 005 loop only converged after repeatedly *un-authoring* implementation mechanism the spec shouldn't have held (the durability generator 29→39→40; the precondition generator 17→18→19) — each was an authoring error (writing HOW, not WHAT) that the barrage correctly turned into a finding generator. The skill's litmus = the lens's litmus (**WHAT the spec promises/decides vs HOW it's implemented**); they are the write-end and judge-end of one rule. See `plugins/stack-control/spec-kit/spec-governance/SPEC-AUDIT-FAILURE-MODES.md` § "Prevention beats detection." Add to the skill's encoded rules: **"if you are writing a precondition / protocol / algorithm / data-layout / edge-case *handling*, move it to `contracts/` + RED tests"** and **"state the guarantee, not the mechanism that achieves it"** (specs DO capture promises about edges/failures — just not the handling mechanism).
- **Status:** **PROMOTED** → `stack-control-roadmap.md` `design/spec-authoring` row (2026-06-08, operator decision), the prevention sibling to `design/spec-governance`'s detection. Field-validated by the 005 dogfood (load-bearing, not nice-to-have).

### Archive skill to keep live documents lean (port dw-lifecycle's workplan-archive capability)

- **Surfaced:** 2026-06-07, idea-capture pass.
- **Context:** dw-lifecycle already has `/dw-lifecycle:archive-phases` / `:unarchive-phases` — they move completed phase sections from a feature's `workplan.md` into `workplan-archive.md` and maintain a ledger comment so the auto-positioner doesn't collide with archived fix-task IDs. The principle generalizes: living documents (specs, roadmaps, workplans) accrete completed/settled material and get heavy; a lean live doc + an append-only archive keeps the live surface crisp. Aligns with the thesis (DEFINE-phase tooling; durable written artifacts that survive context boundaries without bloating the working surface).
- **Idea:** A `stack-control` archive skill that keeps live documents lean by relocating completed/settled sections into a companion archive while preserving an auditable pointer back — generalizing dw-lifecycle's workplan-archive mechanism beyond workplans (to specs, roadmaps, and any living design doc). Candidate to absorb-then-retire the dw-lifecycle `archive-phases`/`unarchive-phases` pair under the succession plan.
- **Provisional home:** stack-control hygiene / document-lifecycle capability. Candidate roadmap feature. Relates to the roadmap-protocol cluster below (a live roadmap needs an archive for shipped rows).
- **Status:** **captured** (awaiting triage).

### Plugin-local roadmap with a live queue of in-flight and planned features

- **Surfaced:** 2026-06-07, idea-capture pass.
- **Context:** The program roadmap today is `docs/1.0/001-IN-PROGRESS/pluggable-lifecycle-providers/stack-control-roadmap.md` — a doc buried in the feature tree, not a first-class plugin surface. A plugin-local roadmap would make the in-flight/planned queue a native, discoverable artifact of the plugin itself.
- **Idea:** A plugin-local roadmap surface carrying a **live queue** of in-flight and planned features (status, sequence, codename per the `<phase>/<slug>` convention). The roadmap as a maintained queue, not a prose doc that drifts.
- **Provisional home:** stack-control DEFINE/program-management capability. Candidate roadmap feature. Tightly coupled with the roadmap-protocol + roadmap-skill entries below and the idea-bucket↔roadmap relationship entry.
- **Status:** **captured** (awaiting triage).

### Roadmap protocol — keep the roadmap live, crisp, and up-to-date

- **Surfaced:** 2026-06-07, idea-capture pass.
- **Context:** A roadmap only earns trust if it stays current; an out-of-date roadmap is worse than none (false precision). Needs a defined discipline for when/how rows are added, advanced, archived, and reconciled against actual feature state — the same "mechanism that actually fires" concern as the clone-coverage and install-drift entries above.
- **Idea:** A **roadmap protocol** defining how the roadmap is kept live, crisp, and up-to-date: row lifecycle (planned → in-flight → shipped/archived), what triggers an update (feature setup/ship/complete), and reconciliation against on-disk feature state. Pairs with an archive mechanism (shipped rows leave the live queue) and a skill that canonizes the protocol (below).
- **Provisional home:** stack-control program-management capability. Candidate roadmap feature. Cluster: roadmap-queue + roadmap-skill + idea-bucket↔roadmap relationship.
- **Status:** **captured** (awaiting triage).

### Relationship between the idea bucket (design-inbox) and the roadmap

- **Surfaced:** 2026-06-07, idea-capture pass.
- **Context:** This very file's header already asserts a distinction — the inbox is the *pre-triage parking lot*; the roadmap is the *curated, scoped, sequenced* plan; triage promotes inbox → roadmap. But the relationship is currently only prose convention (and the inbox itself sunsets at `design/insight-capture`, when capture becomes a native `stackctl` surface). The interaction between the future native capture surface and the future plugin-local roadmap queue is undefined.
- **Idea:** Figure out and codify the relationship between the idea bucket (capture surface; today the design-inbox, future the native `design/insight-capture` mechanism) and the roadmap (curated queue): the promotion path, what state each owns, how a captured idea graduates into a roadmap row, and whether they're two surfaces or two views of one store. Decision input for both `design/insight-capture` and the roadmap-queue feature.
- **Provisional home:** spans `design/insight-capture` + the roadmap-queue/protocol cluster. Candidate roadmap feature or a design decision that constrains both.
- **Status:** **captured** (awaiting triage).

### Roadmap skill to canonize the roadmap protocol

- **Surfaced:** 2026-06-07, idea-capture pass.
- **Context:** Per the thesis, a protocol that lives only as prose is "a rule the agent doesn't follow"; disciplines stick when they're context-scoped skills / CLI verbs (cf. `.claude/rules/enforcement-lives-in-skills.md`). The roadmap protocol above needs a mechanical home to fire reliably.
- **Idea:** A `stack-control` **roadmap skill** that canonizes the roadmap protocol — the surface through which rows are added/advanced/archived and the roadmap is reconciled, so the protocol is enforced by invocation rather than relying on memory. Composes with the archive skill (shipped rows → archive) and the plugin-local roadmap queue.
- **Provisional home:** stack-control program-management capability. Candidate roadmap feature. Cluster: roadmap-queue + roadmap-protocol + archive-skill.
- **Status:** **captured** (awaiting triage).
