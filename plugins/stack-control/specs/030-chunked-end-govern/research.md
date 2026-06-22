# Phase 0 Research: Chunked whole-feature end-govern

The architecture is settled by the approved design record (`docs/superpowers/specs/2026-06-21-govern-whole-feature-chunked-payload-design.md`). This document resolves the *technical unknowns* of implementing that architecture faithfully. Each decision cites the design record (DR-decision-N / DR-fork-X), the spec (FR-NNN / clarification), or the current-state code it changes.

---

## R1 — Coupling-graph construction (universal baseline vs TS precision layer) — OQ-1

**Decision.** Build the coupling graph over the `governedSha`..HEAD changed-file set with two layered signals:

1. **Universal baseline (always on, language-agnostic):**
   - **Directory-adjacency** — files in the same directory (and, weaker, sibling directories) are candidate-coupled.
   - **Diff cross-references** — when file A's diff text mentions a basename/symbol/path that resolves to changed file B, add an A→B edge. Pure textual; works for Bash/PHP/Python/WordPress with no language tooling.
2. **TS import-graph precision layer (capability-gated, additive):** when the changed set is TypeScript and the import graph is resolvable, add import edges (strongest signal). Presence is a *declared capability* (Principle III) — absent ⇒ baseline only, never a hard block (DR §"Adopter language-neutrality"; FR-003; Edge case "Non-TS adopter").

**Rationale.** DR Decision 3 + Fork A pick "dependency-aware clusters" with "directory-adjacency + diff cross-references as the universal coupling baseline, TS import-graph as a precision layer." Coupling-grouped chunks preserve the highest-value cross-file coverage and keep the touched set small under re-audit (Fork B synergy).

**Alternatives considered.**
- *Flat file/hunk bin-pack (no coupling)* — rejected (DR Fork A ❌): guarantees fit but scatters coupled files, systematically missing cross-file findings.
- *Phase-aligned chunks* — rejected (DR Fork A ❌): a single phase already blows the envelope; per-phase semantics are being deleted.

**Residual (OQ-1, carried — NEEDS CLARIFICATION at precision level only).** On a large flat directory the directory-only signal is coarse. The *direction* is settled (ship the baseline); the open call is whether a per-adopter coupling-resolver seam (kin to the customize seam for scanner packs) ships now or as a follow-on. Captured, not cut.

---

## R2 — Envelope bin-packing + oversized-cluster sub-split + non-audit trim pre-pass

**Decision.** Pack clusters into chunks each ≤ the active envelope (`Math.min(...negotiatedLanes.maxPromptBytes)`, `protocol.ts:388`), using a deterministic first-fit-decreasing over clusters ordered by stable id, with rendered-payload byte size (not raw diff bytes) as the bin metric — so the pack is checked in the same currency the boundary was (`phase-boundary-sizing.ts` measures rendered prompt bytes). For a single cluster that alone exceeds the envelope:
1. **Cheap non-audit-byte trim pre-pass** — drop lockfiles, generated/vendored output, whitespace-only hunks, fixtures from the payload bytes (recorded, not silent).
2. **If still oversized — sub-split** the cluster's files at FILE granularity into envelope-sized sub-chunks; **record a `split-cluster` marker** with the coverage caveat; recover dropped cross-sub-chunk coverage via the chunk-manifest + the seam pass (R7). A *single FILE* whose own diff exceeds the envelope is out of scope as a graceful path — it is a priori broken (a code file violates the line cap; a non-code file that large is not audit-useful), so govern **fails loud** naming it rather than hunk-splitting it. No `split-file` concept exists (operator decision 2026-06-21).

**Rationale.** DR Decision 5 + Fork E pick. The bin-packer *avoids* the boundary condition rather than asserting against it — this is what removes the `boundary-too-large` FATAL terminal (FR-002; the `protocol.ts:393–404` throw is deleted, R10). Trim is a *pre-pass only*, not a standalone fix (DR rejected "deterministic payload-trim alone" — it cannot make an arbitrarily large hand-written cluster fit).

**Alternatives considered.**
- *Reduced-detail mode for the whole oversized cluster* — rejected as primary (DR Fork E ❌): loses line-level detail for exactly the biggest clusters. Retained as a possible future fidelity knob (DR open question).
- *Force-fit by trimming non-audit bytes alone* — rejected as primary (DR Fork E ❌): only helps when the bloat IS non-audit bytes. Retained as the cheap pre-pass above.

---

## R3 — Deterministic stable chunk-id pinned to `governedSha`..HEAD

**Decision.** Chunk id = a stable hash of the chunk's sorted file path set, computed over the partition produced from the fixed `governedSha`..HEAD endpoints. The coupling graph, clustering, and bin-pack are all deterministic functions of (changed-file set, envelope), so the same endpoints + same envelope ⇒ identical chunk set and ids. The convergence record references stable ids (DR Decision 4).

**Rationale.** FR-004 + SC determinism (US1 Scenario 3); DR Decision 4 + open question 6 ("pin the cluster computation to `governedSha`..HEAD so a re-run over the same endpoints is identical"). Pinning to the endpoints — not "latest" — is what makes re-runs reproducible; a moved base is a *different audit scope by design* (OQ-4 RESOLVED → FR-001), not a determinism violation.

**Alternatives considered.** *Positional/ordinal chunk ids* — rejected: not stable under a one-file change that shifts ordering; breaks the convergence record's cross-run reference.

---

## R4 — Worktree-isolated parallel fix dispatch via the capability port + merge/serialize

**Decision.** Fix-fanout groups findings by chunk and dispatches one fix-subagent **per chunk concurrently, each in its own git worktree off the feature branch**, through a **capability port** (Principle IX): the port exposes "dispatch a fix task"; concrete backends are *in-session sub-agent dispatch* (the Claude Code / Codex host's Agent surface) OR *batch CLI shell-out*. The engine runs to completion when only one backend kind is available and **never branches on vendor identity**. After fixes:
- Merge each fix worktree back to the feature branch.
- A **conflicting pair serializes** (apply one, rebase/re-run the other) rather than merging blindly.
- An **unresolvable merge surfaces to the operator** — no fabricated resolution (FR-010, Principle V).
- Fixing is **autonomous** — govern applies AND commits fixes unattended (Clarification 2026-06-21); only failures/unresolvable-merges surface.

**Rationale.** DR Decision 7 + Fork C pick "parallel worktree-isolated per chunk"; FR-009/FR-010; the thesis demands industrialized (parallel, worktree-isolated, unattended) execution. The coupling-grouped axis minimizes cross-chunk file overlap so merges mostly stay clean (Fork C rationale).

**Alternatives considered.**
- *Sequential fix in the main tree* — rejected (DR Fork C ❌): conflict-free but only half-industrializes (audit parallel, fix serial).
- *Parallel with disjoint-file guarantee, same tree* — rejected (DR Fork C ❌): stalls when many findings cluster on one hot file; more bookkeeping for less isolation than worktrees give.

---

## R5 — Touched-set computation + coupling-correctness + hard round-cap backstop

**Decision.** After a fix round, diff the fix commits to get the changed file set, then map those files back to chunks: a fixed file's own chunk **plus any chunk it is coupled into** (coupling-correct — FR-012, US4 Scenario 3). A fix that creates a **brand-new file** assigns it to a chunk by coupling for re-audit (FR-007 — the `split-file-audit-exclusion` class must not recur). Re-audit only the touched set. **Hard backstop:** a configurable maximum-round cap; on hitting it, **STOP and surface the stall for operator override** — never loop forever, never silently auto-graduate unresolved churn (FR-013, Clarification 2026-06-21).

**Rationale.** DR Decision 6 + Fork B pick "bounded re-audit of touched chunks." The shrinking touched-set + dampener is the *norm*; the round cap is the *backstop* against a coupling cycle (Clarification: "hard max-round cap as a backstop").

**Alternatives considered.**
- *Iterate the full chunked set to fixpoint* — rejected (DR Fork B ❌): re-audits untouched chunks every round (expensive at scale) and a coupled-file fix ping-pongs two chunks — the treadmill at chunk scale.
- *Single pass, no re-audit* — rejected (DR Fork B ❌): ships fix-introduced defects no auditor saw.

---

## R6 — Bounded re-audit termination argument

**Decision.** Termination rests on two independent guarantees: (a) **monotone shrink** — in the common case each round's touched set is a subset of the prior round's chunks (a fix that touches no new coupling stops re-expanding the set), and the dampener (`check-barrage-dampener.ts:115`, the `newHighPlusCount` consecutive-quiet streak) graduates a clean touched set; (b) **hard cap** — even under a pathological coupling cycle that prevents shrink, the round cap (R5) forces a STOP. The run therefore *always* terminates (SC-004), either by convergence or by surfacing a capped stall.

**Rationale.** FR-013; SC-004 ("terminates on every fixture; the re-audit set is strictly smaller than the full chunk set whenever at least one chunk is untouched"). The dampener is reused unchanged (Assumption in spec).

---

## R7 — Seam-pass substantive-break detector (cross-boundary breakage only)

**Decision.** A final **interface-level** pass over cross-chunk and split-cluster boundaries audits *signatures + changed-function headers only* (a small payload that fits the envelope by construction). It is gated to a **substantive contract break = observable cross-boundary breakage**: a removed/renamed exported symbol, a changed arity, or a changed required shape **consumed across a chunk boundary**. It MUST NOT flag compatible additions (new optional param, new export) or internal-only changes (FR-014, Clarification 2026-06-21; SC-003 false-positive target = 0). The manifest (R8) gives the auditor the other chunks' file lists so it can reason about "consumed across a boundary."

**Rationale.** DR cross-cutting component `seam-pass` + Fork E recovery; FR-014. The substantive-break gate kills the signature-shaped false-positive class (kin to the orthogonal `doc-aware-audit-lens` node, left live).

**Alternatives considered.** *Flag any signature delta at a boundary* — rejected: cries "mismatch" on compatible signatures (DR open question 5; the explicit anti-goal of SC-003).

---

## R8 — Chunk manifest (the cross-cutting context block)

**Decision.** Every chunk's audit payload carries the plan/spec/contracts context **plus a manifest of the OTHER chunks' file lists** — so an auditor can flag "this depends on X, which is not in my view" even before the seam pass runs (FR-005, US3 Scenario 2). The manifest is file-lists only (not the other chunks' diffs) to stay within the envelope.

**Rationale.** DR cross-cutting component `chunk-manifest`; FR-005. This is the first line of cross-file defense; the seam pass is the backstop.

---

## R9 — Reconcile-once + close-in-loop-fixed-before-lift (absorbs lift-auto-close)

**Decision.** The run reconciles **exactly once** at the end into a **single whole-feature convergence record per feature** (FR-015). Before the lift step, findings that were **fixed within the bounded re-audit loop** (raised in an earlier round, absent from the clean/dampened final round) are **closed** so they are NOT lifted to the backlog as open tasks (FR-016, US6). Findings still open at graduation ARE lifted. This delivers `govern-lift-auto-close-in-loop-fixes` for the end-govern case (DR Decision 8 — open question 3 resolved; flag that node absorbed-here).

**Rationale.** DR Decision 8; FR-015/FR-016; SC-005 (in-loop-fixed appear as open backlog tasks in 0% of cases). The lift balloon (~71% stale ratio in the offing dogfood) is the friction this kills. Reuses `partitionLiftableFindings` / `loop-hygiene.ts` (`audit-barrage-lift.ts:42`) — the change is *when* closure happens (before lift), not the barrage mechanism (spec Assumption).

---

## R10 — Clean-break deletion inventory + single graduate criterion

**Decision.** Delete (not deprecate — zero back-compat, DR Decision 1 + `.claude/rules/agent-discipline.md` § Zero backwards compatibility):

| Surface | Current location | Disposition |
|---|---|---|
| `--phase` invocation arm | `govern.ts:810–845` | DELETE; passing `--phase` is an unknown-flag error (FR-017, US2 Scenario 1) |
| Exclusion-based composition arm | `govern.ts:846–891` | DELETE; replaced by inclusion-based chunked path (FR-023) |
| Per-phase checkpoint writer + `phase-checkpoints/*.json` + its doctor/schema | (writer + artifact + rule) | DELETE (FR-017) |
| `GOVERN_CHECKPOINT` / `--checkpoint` | env + flag | DELETE; unknown var/flag (FR-017, TASK-125) |
| `allPhaseCheckpointsCurrent` + `all-phase-checkpoints-current` criterion + callers | `gate-eval.ts:162–177` | DELETE (FR-018) |
| Either-of `graduate-impl` arm | `gate-eval.ts:179–199` | COLLAPSE to single `ctx.implRecordConverged` (FR-018) |
| Per-phase compass/workflow transition arms | (TASK-152/155) | DELETE (FR-019) |
| `boundary-too-large` FATAL terminal | `protocol.ts:393–404` | DELETE; the bin-packer avoids the condition (FR-002, R2) |
| Migration / grandfather / backfill | — | WONTFIX (TASK-153); no legacy-accept path for any deleted flag/var/artifact (FR-020) |

**Single graduate criterion.** `graduate-impl` evaluates *solely* on a converged whole-feature convergence record (FR-018, US2 Scenario 2). Blast radius is zero today (029 shipped, no active per-phase feature in flight — DR open question 2 RESOLVED).

**Rationale.** DR Decision 1 + Fork D pick "replace per-phase entirely (clean break)." Leaving any per-phase surface alive is the deprecation honey pot the operator forbids; SC-002 asserts the remaining per-phase-surface count = 0.

---

## R11 — Concurrency-cap defaults — OQ-2 (NEEDS CLARIFICATION, tuning)

**Decision (recommendation, settle at clarify/tune time).** Audit concurrency (chunks × lanes) bounded by fleet negotiation (existing). Fix-worktree concurrency bounded by a **configurable cap, default ≈4** (disk/CPU bound); excess fix-subagents queue and run as worktree slots free — no unbounded fan-out (Edge case "worktree exhaustion"). Whether the cap is adopter-configurable: recommend yes.

**Rationale.** DR open question 4 + FR-008/FR-009 + OQ-2. Captured as tuning, not cut.

---

## R12 — Targeted refactor: decompose `payload-implement.ts`

**Decision.** `payload-implement.ts` (801 lines, over the 300–500 cap — `payload-implement.ts:254–399` is the committed-diff arm + untracked fold + dep widening) is decomposed while building `cluster-payload`: a `payload-diff-scope.ts` (committed-diff + untracked-fold scoping, the inclusion-based successor to the exclusion plumbing) and a `payload-chunk.ts` (render one chunk's payload). This **replaces** the broken composition path (empty `diffScope.files`, unscoped commit subjects, ignored checkpoint env, dead re-audit branch — TASK-120/121/122/123/125/128), subsuming that debt (FR-022/FR-023; DR Decision 10).

**Rationale.** DR Decision 10; FR-022/FR-023; SC-007 (no touched file > 500 lines); Principle VI.

---

## Tensions surfaced

No hard contradiction between the design record and the clarified spec was found — the spec faithfully encodes the design record's five forks and twelve decisions, and the four 2026-06-21 clarifications (autonomous fix, `governedSha` reuse, hard round-cap, cross-boundary-only seam break) tighten rather than contradict it. Two soft notes for the implementer:

1. **`phase-boundary-sizing.ts` is keyed on `phaseId`** (`BoundaryTooLargeError(phaseId, ...)`). After the clean break there are no phases — the boundary check, where retained for the *seam payload fits the envelope* assertion (FR-014), must be rekeyed to a chunk/seam id, not a phase id. This is a mechanical rename, not a design tension, but it touches a `phaseId`-typed interface that the deletion of per-phase must not leave dangling.
2. **The `boundary-too-large` terminal is *deleted as a FATAL* but the envelope check itself survives** (the bin-packer needs to know the envelope). The distinction: the engine still *measures* fit per chunk (to pack), it just never *refuses the whole run* on size. The implementer must not delete the envelope-measurement primitive along with the FATAL terminal.
