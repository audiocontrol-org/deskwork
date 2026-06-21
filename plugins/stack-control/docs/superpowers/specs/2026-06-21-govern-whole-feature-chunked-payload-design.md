---
roadmap-item: multi:feature/govern-whole-feature-chunked-payload
phase: designing
date: 2026-06-21
backend: superpowers:brainstorming (driven via /stack-control:design)
house-rules: stack-control-design-v1
---

# Design — Chunked whole-feature end-govern (govern-at-end as the default, made to scale)

> Capture artifact (house rule `capture-over-yagni`): this records everything known
> or knowably-implied. Scoping is a separate, explicit, operator-driven pass AFTER
> capture — nothing here is pre-cut for "v1".

## Problem domain

`stackctl govern` audits a feature's work with a cross-model audit-barrage, then
graduates it once findings converge. Today the **default** is **per-phase**
governance: each `tasks.md` phase is audited at its boundary, over **uncommitted**
working-tree changes, and a per-phase checkpoint records that the phase governed.
Whole-feature governance exists only as a buggy **opt-in escape** (the
exclusion-based composition path).

The per-phase default produces a family of compounding frictions, all confirmed live
in the offing 0.52.2 dogfood (`offing-ff761162`, 2026-06-21):

- **The staleness treadmill (O(n²)).** Per-phase checkpoints over uncommitted work
  don't engage hunk-fingerprint freshness (`hunkblocks-uncommitted-empty`: `git diff
  HEAD HEAD` is empty), so any later phase that touches a sibling file in a shared
  governed directory re-stales **all** prior phases. The only re-current tool is a
  semantically-wrong `--override` (`cheap-checkpoint-refresh`).
- **No escape from a normal-sized phase.** An 11-task code phase rendered 68360
  prompt bytes vs the ~65536 fleet envelope — ~4% over — and govern **FATALed** with
  `boundary-too-large` before auditing anything. The sanctioned recovery (re-shape
  `tasks.md` to satisfy the auditor's byte limit) forces spec restructuring to fit a
  model envelope (`boundary-too-large-normal-phase`).
- **File-size discipline fights govern-scope discipline.** Splitting a file to honor
  the 300–500-line cap creates an untracked sibling that the per-phase payload scope
  excludes — so a cap-driven split goes **ungoverned** (`split-file-audit-exclusion`).
- **The in-loop lift balloon.** A 2-task doc phase rang **9 cross-model rounds**;
  each round's distinct artifact produced a distinct finding-signature, so the lift
  step migrated 42 backlog tasks for findings it **fixed in-loop** — a ~71% stale
  ratio that forced a hand-written bulk-close script (`lift-auto-close-in-loop-fixes`).

The operator's diagnosis (2026-06-21): these are **artifacts of governing
uncommitted work mid-feature**. Govern-at-end over **committed** work dissolves the
treadmill, the cheap-refresh need, and the untracked-split exclusion; reconcile-once
shrinks the lift balloon. The single friction that **survives** the move to
govern-at-end is `boundary-too-large` — a whole-feature payload is *larger* than a
phase, so it's *more* likely to blow the envelope. That is why per-phase existed, and
it is the load-bearing problem this feature must solve: **make a whole-feature audit
fit under the fleet envelope without ever FATALing, while keeping cross-file
correctness.**

Constraints and forces:
- **Fleet envelope is per-lane and dynamic** — `Math.min(...negotiatedLanes.maxPromptBytes)`
  from `fleet-knowledge.yaml` (`protocol.ts:388`), checked **post-render**
  (`phase-boundary-sizing.ts:49`). Not a hardcoded constant.
- **Cross-file bugs are the hardest to keep.** The moment two coupled files land in
  different sub-payloads, a caller/callee contract mismatch becomes invisible to every
  auditor. Scale is bought with cross-file blindness unless the partition is
  coupling-aware and a seam pass backstops it.
- **The thesis demands industrialized execution** — parallel, worktree-isolated,
  unattended (`stack-control-thesis.md`). The fix step, not just the audit step, is in
  scope for parallelization.
- **Zero backwards compatibility (operator directive, 2026-06-21).** A back-compat
  surface is a honey pot: a future agent treats a deprecation stub as load-bearing and
  the dead path calcifies. The per-phase apparatus is **deleted**, not deprecated.
- **Adopter language-neutrality.** govern already over-couples to TypeScript (the
  clone-step is TS-only, `govern-clone-step` TASK-295/296). The coupling signal here
  must degrade gracefully for Bash/PHP/Python/WordPress adopters.
- **Today's whole-feature path is broken** (TASK-120/121/122/123/125/128): the strict
  checkpoint gate makes composition's re-audit branch dead code; the AuditUnit's
  `diffScope.files` is empty while real scope hides in `compositionExcludePaths`;
  commit subjects aren't scoped; `GOVERN_CHECKPOINT` is ignored. This feature
  **replaces** that path rather than extending it.

## Solution space

The design is the composition of five forks. Each fork's alternatives are enumerated
below (chosen ✅ / rejected ❌ with the reason), plus the cross-cutting components and
the rejected whole-shape alternatives.

**Fork A — partition axis (how the committed diff splits into envelope-sized chunks):**

- ✅ **Dependency-aware clusters.** Group coupled files (directory-adjacency + diff
  cross-references universally; TS import-graph as a precision layer) into clusters,
  then bin-pack clusters into chunks ≤ envelope. Preserves the highest-value cross-file
  coverage (coupled code audited together) and keeps the touched-set small under the
  re-audit loop. Chosen.
- ❌ **Phase-aligned (tasks.md phases as chunks).** Rejected: a single phase already
  blows the envelope (`boundary-too-large-normal-phase`) — it inherits the exact
  problem this feature exists to kill — and per-phase semantics are being deleted.
- ❌ **Flat file/hunk bin-pack.** Rejected: guarantees fit but shatters cohesion —
  coupled files scatter across bins, so cross-file findings are systematically missed.

**Fork B — convergence / re-audit rule (how the run terminates):**

- ✅ **Bounded re-audit of touched chunks.** Audit all chunks → collect all findings →
  fix all → re-audit ONLY the chunks whose files a fix touched (a monotonically
  shrinking set) → dampener graduates when that set is clean. Terminates by
  construction; the coupling-grouped axis keeps the touched set small. Chosen.
- ❌ **Iterate the full chunked set to fixpoint.** Rejected: re-audits untouched chunks
  every round (expensive at scale) and a coupled-file fix can ping-pong two chunks —
  the treadmill at chunk scale.
- ❌ **Single pass, no re-audit.** Rejected: ships fix-introduced defects that no
  auditor ever saw.

**Fork C — fix execution model:**

- ✅ **Parallel worktree-isolated per chunk.** Dispatch a fix-subagent per chunk
  concurrently, each in its own git worktree; merge back; a conflicting pair serializes;
  fix commits land on the feature branch. Matches the industrialization thesis; the
  coupling-grouped axis minimizes cross-chunk file overlap so merges mostly stay clean.
  Chosen.
- ❌ **Sequential fix in the main tree.** Rejected: conflict-free but only half-realizes
  "industrialize execution" (audit parallel, fix serial).
- ❌ **Parallel with disjoint-file guarantee (same tree).** Rejected: concurrency
  without worktrees, but stalls when many findings cluster on one hot file and adds
  disjoint-set bookkeeping for less isolation than worktrees give.

**Fork D — workflow integration / per-phase coexistence:**

- ✅ **Replace per-phase entirely (clean break).** `execute` implements + commits all
  phases, then fires ONE chunked end-govern; the `--phase` path, the checkpoint
  machinery, `GOVERN_CHECKPOINT`, the per-phase doctor/schema, and the either-gate's
  checkpoint arm are **deleted**. Graduation is single-criterion (whole-feature
  convergence record). Chosen — zero back-compat, no honey pot.
- ❌ **Default at completion; per-phase opt-in.** Rejected: leaves the per-phase path
  first-class forever — the deprecation honey pot the operator explicitly forbids.
- ❌ **Operator selects mode per feature.** Rejected: a per-feature protocol choice is
  friction, and it keeps both paths (and both gate arms) live forever.

**Fork E — oversized cluster (a single coupled cluster > envelope; must never FATAL):**

- ✅ **Sub-split + interface-level seam pass.** Bin-pack the oversized cluster's files
  into sub-chunks (accepting reduced within-cluster coverage), record a `split-cluster`
  marker, and recover the dropped cross-sub-chunk coverage via the cross-cutting
  manifest + a final seam pass over interface signatures. Always fits; degradation is
  logged, never silent. Chosen.
- ❌ **Reduced-detail mode for the whole cluster.** Rejected as the primary: keeps
  cross-file visibility but loses line-level detail for exactly the biggest clusters,
  where line-level bugs are most likely. (Retained as a possible future fidelity knob —
  see open questions.)
- ❌ **Force-fit by trimming non-audit bytes.** Rejected as a primary: only helps when
  the bloat IS non-audit bytes; a genuinely large hand-written cluster still won't fit,
  so it needs a real backstop anyway. (Retained as a cheap pre-pass — see decisions.)

**Cross-cutting components (carried by the chosen shape):**

- **`chunk-manifest`** — every chunk carries the plan/spec/contracts + a manifest of the
  OTHER chunks' file lists, so an auditor can flag "this depends on X, not in my view."
- **`seam-pass`** — a final interface-level audit (signatures + changed-function headers
  of cross-chunk and split-cluster boundaries) that fits the envelope and catches contract
  mismatches the partition split apart; gated to **substantive** breaks to avoid
  signature-shaped false positives.
- **`touched-set`** — diffs the fix commits to derive which chunks need re-audit.
- **`fix-fanout`** — worktree-isolated parallel fix dispatch + merge/serialize.
- **`cluster-payload`** — coupling graph → clusters → envelope bin-pack → chunks, deterministic.

**Rejected whole-shape alternatives:**

- ❌ **Extend the existing exclusion-based composition path.** Rejected: it is broken at
  the type/scope level (TASK-120/121/122/123/125/128) and exclusion-based scoping is the
  wrong primitive for chunking (inclusion is). Replace, don't patch.
- ❌ **Raise the fleet envelope / pin bigger-context models.** Rejected: a moving target
  that doesn't generalize across adopters' fleets and still FATALs on a large enough
  feature — it defers the problem rather than solving it.
- ❌ **Deterministic payload-trim alone (no chunking).** Rejected: trimming non-audit
  bytes helps but cannot make an arbitrarily large hand-written feature fit; chunking is
  the load-bearing mechanism, trim is at most a pre-pass.

## Decisions

1. **One model, clean break (Fork D).** Chunked whole-feature end-govern is the only
   govern path. Delete: the `--phase` invocation path, per-phase checkpoint writer,
   `phase-checkpoints/*.json` artifact + its doctor/schema rule, `GOVERN_CHECKPOINT` /
   `--checkpoint` (TASK-125), the per-phase arms of the compass/workflow transitions
   (TASK-152, TASK-155), and `allPhaseCheckpointsCurrent` + all its callers. The
   `graduate-impl` either-gate (`gate-eval.ts:179`) collapses to the single
   whole-feature `record-converged impl` criterion. No grandfather, no migration,
   no backfill — TASK-153 becomes WONTFIX.
2. **Pipeline (one end-govern run):** CLUSTER → AUDIT (parallel chunks × parallel lanes,
   under a concurrency cap) → FIX (worktree-isolated parallel per chunk; merge;
   serialize conflicts) → bounded RE-AUDIT of touched chunks (repeat) → SEAM pass →
   reconcile ONCE into a single whole-feature convergence record → graduate.
3. **Partition = dependency-aware clusters (Fork A)** with a **universal coupling
   baseline** = directory-adjacency + diff cross-references (language-agnostic, never
   hard-blocks a non-TS adopter), and the **TS import-graph as a precision layer** where
   available.
4. **Determinism.** Same committed diff → same chunk set (stable chunk ids). The
   convergence record references stable ids so re-runs are reproducible.
5. **Oversized cluster never FATALs (Fork E).** Optional cheap **non-audit-byte trim
   pre-pass** (lockfiles, generated/vendored, whitespace-only hunks, fixtures); if still
   over, **sub-split + `split-cluster` marker + seam-pass recovery**.
6. **Bounded re-audit (Fork B).** Re-audit only fix-touched chunks; the set shrinks each
   round; the dampener graduates the clean set.
7. **Industrialized fix (Fork C).** Parallel worktree-isolated fix-subagents per chunk;
   merge back; conflicting pair serializes; unresolvable merge surfaces to the operator.
8. **Reconcile once absorbs lift-auto-close (open question #3 resolved).** The single end
   reconciliation closes findings fixed within the bounded re-audit loop BEFORE lifting —
   delivering `govern-lift-auto-close-in-loop-fixes` for the end-govern case; flag that
   node absorbed-here.
9. **New artifacts get a doctor/schema surface.** Chunk set, `split-cluster` markers,
   touched-set rounds, seam result, and the whole-feature convergence record are
   deterministic and validated (the TASK-77/113 "new artifacts need a doctor rule"
   discipline).
10. **Targeted refactor in scope.** `payload-implement.ts` (801 lines, over the 300–500
    cap — TASK-48/151) is decomposed as part of building `cluster-payload`; this work
    replaces the broken composition path, subsuming TASK-120/121/122/123/125/128.
11. **Feature boundary.** End-govern diffs from the feature's base `governedSha`
    (reuses 029 US5's anchor) to HEAD over committed work.
12. **Unattended failure semantics.** Fix-subagent failure → isolate that chunk, continue
    others, surface at reconcile; lane outage → existing degraded-round; unresolvable
    merge → serialize, else surface for operator. (Touches the autonomous-loop /
    halt-and-resume family; the end-govern-specific modes are owned here.)

## Open questions

These are recorded with a recommendation; the operator settles them at spec-time (or
confirms the recommendation). None blocks the design.

1. **Coupling-baseline precision for non-TS adopters (resolved → recommendation
   adopted).** Directory-adjacency + diff cross-references is the universal baseline;
   the TS import-graph is layered on where available. Residual: how coarse is the
   directory-only signal in practice on a large flat directory? May want a
   per-adopter coupling-resolver seam (kin to the customize seam for scanner packs).
2. **In-flight migration is WONTFIX (resolved by the clean break).** Recorded here so a
   future reader doesn't reopen it: there is deliberately no grandfather. Blast radius
   is zero today (029 shipped, no active spec).
3. **lift-auto-close absorption (resolved → recommendation adopted).** This feature's
   reconcile owns in-loop-fix closure for end-govern. Residual: whether the deferred
   node `govern-lift-auto-close-in-loop-fixes` is closed-as-absorbed or kept for any
   non-end-govern remnant (there is none after the clean break — likely close).
4. **Concurrency caps — exact defaults.** Audit concurrency bounded by fleet-negotiation;
   fix-worktree concurrency bounded by a configurable cap (disk/CPU). The default cap
   value and whether it's adopter-configurable are spec-time tuning.
5. **Seam-pass false-positive control.** Interface-only audits can cry "mismatch" on
   compatible signatures. The prompt must gate to substantive contract breaks (kin to the
   orthogonal `doc-aware-audit-lens` node). The exact rubric is spec-time.
6. **Determinism of the coupling graph under churn.** Diff cross-references can shift the
   cluster shape between runs if the diff base moves; pin the cluster computation to the
   feature `governedSha`..HEAD endpoint so a re-run over the same endpoints is identical.

## Provenance

- **Roadmap node:** `multi:feature/govern-whole-feature-chunked-payload`
  (`part-of: multi:feature/govern-operability`; `ref: offing-ff761162`). Added in the
  2026-06-21 govern-at-end reshape (commit `719fa2d8`) as the load-bearing enabler the
  other govern-operability gaps defer behind.
- **Motivating dogfood:** offing 0.52.2, transcript `offing-ff761162` (2026-06-21) —
  the 9-round doc phase (lift balloon) and the Phase-2 `boundary-too-large` FATAL on an
  11-task code phase (~4% over envelope).
- **Operator directions (2026-06-21 session):** (a) govern-at-end as the default; (b)
  replace per-phase entirely; (c) **zero backwards compatibility — clean break** ("back
  compat is a honey pot for agents who treat deprecation as keep-forever").
- **Current-state code map (this session, Explore agent):** payload construction
  (`govern.ts:827–892`, `payload-implement.ts:254–399`); boundary
  (`phase-boundary-sizing.ts:49`, `protocol.ts:388–404`); fleet fan-out
  (`fleet-negotiation.ts:18`, `protocol.ts:409–424`); reconcile/lift
  (`audit-barrage-lift.ts:42`, `convergence-record.ts:35`,
  `check-barrage-dampener.ts:115`); either-gate (`gate-eval.ts:179–200`).
- **Subsumed/affected debt:** replaces the broken composition path (TASK-120/121/122/123/125/128);
  deletes the per-phase apparatus that carries `govern-hunkblocks-uncommitted-empty`,
  `govern-cheap-checkpoint-refresh`, `govern-split-file-audit-exclusion` (close those
  nodes); folds in `govern-boundary-too-large-normal-phase` (already `part-of` this);
  absorbs `govern-lift-auto-close-in-loop-fixes`; leaves `govern-doc-aware-audit-lens`
  live (orthogonal); decomposes `payload-implement.ts` (TASK-48/151); WONTFIX TASK-153
  (no migration).
- **Design backend:** `superpowers:brainstorming`, driven in-session via
  `/stack-control:design` under house rules `stack-control-design-v1`.
