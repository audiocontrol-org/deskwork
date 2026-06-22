# Feature Specification: Chunked whole-feature end-govern

**Feature Branch**: `feature/stack-control` (long-lived program branch; spec dir `030-chunked-end-govern`)

**Created**: 2026-06-21

**Status**: Draft

**Roadmap node**: `multi:feature/govern-whole-feature-chunked-payload` (`part-of multi:feature/govern-operability`)

**Design record**: `docs/superpowers/specs/2026-06-21-govern-whole-feature-chunked-payload-design.md` (operator-approved)

**Input**: Author from the approved design record — make govern-at-end the default and only govern path, replacing per-phase governance entirely with a clean break (zero backwards compatibility); chunk the whole committed feature diff into envelope-sized sub-payloads so it scales without ever FATALing on boundary-too-large, while preserving cross-file correctness.

---

## Overview

`stackctl govern` audits a feature's work with a cross-model audit-barrage, then graduates it once findings converge. Today the **default** is **per-phase** governance over **uncommitted** working-tree changes, which produces a family of compounding frictions (the staleness treadmill, `boundary-too-large` on a normal phase, the file-split exclusion, the in-loop lift balloon). Govern-at-end over **committed** work dissolves most of them; the one that survives — `boundary-too-large` — is *worse* for a whole-feature payload (it's larger than a phase). This feature delivers the mechanism that makes govern-at-end scale: it **chunks** the whole-feature audit into envelope-sized sub-payloads, partitions by code coupling so cross-file bugs stay visible, audits and fixes chunks in parallel, re-audits only what fixes touch, and reconciles once into a single whole-feature convergence record. It replaces the per-phase path **entirely** — a clean break with zero backwards compatibility.

The actors are the **operator** (runs `govern` / `execute` and owns graduation) and the **driving agent** (executes the pipeline unattended). "User value" here is operator/agent outcome: a feature of any size governs to a graduation decision without manual payload-shaping, and the per-phase friction class is gone.

## Clarifications

### Session 2026-06-21

- Q: When the chunked audit finds issues, does govern apply+commit fixes itself or propose them? → A: **Autonomous apply + commit** — fix-fanout applies fixes in worktrees, commits to the feature branch, and re-audits unattended; only fix-subagent failures and unresolvable merges surface to the operator.
- Q: How is the feature-base anchor for the `governedSha`..HEAD diff determined? → A: **Reuse the 029 US5 `governedSha` anchor** resolved at feature start; an explicit `--diff-base` overrides.
- Q: What backstops termination if a coupling cycle keeps the touched set from shrinking? → A: **Hard max-round cap as a backstop** — the shrinking touched-set + dampener is the norm; on hitting the cap, STOP and surface for operator override (never loop forever).
- Q: What does the seam pass count as a substantive contract break (vs a compatible change it must not flag)? → A: **Cross-boundary breakage only** — removed/renamed exported symbol, changed arity, or changed required shape consumed across a chunk boundary; ignore compatible additions and internal-only changes.

### Session 2026-06-21 (dogfood gap discovery)

Dogfooding the whole-feature end-govern on this very branch (the 245-file feature diff) proved the **core mechanism was authored but never wired**: the implement-mode CLI ships a `runProtocol`-per-chunk stand-in, while `end-govern-pipeline.ts` (cluster → audit → fix → re-audit → seam → reconcile-once → one `WholeFeatureConvergenceRecord`) sits unreferenced. Consequently FR-008 (parallel audit), FR-009 (worktree fix-fanout), FR-012 (coupling-correct touched-set re-audit), FR-015 (reconcile once), and FR-016 (close-before-lift) are **not delivered at the CLI** — they exist only inside the unwired object. This session captures the wiring + the surfaced defects as the missing scope (US9 + FR-024…FR-031, SC-008…SC-010); none is a deferred follow-up.

- Q: Does the implement-mode CLI drive `end-govern-pipeline`, or the reused per-chunk `runProtocol` loop? → A: **The pipeline is the single path** — the CLI MUST drive `runEndGovern`; the per-chunk `runProtocol` loop is deleted (clean break, FR-020 discipline).
- Q: Which convergence record does the graduate gate read after wiring? → A: **One record** — the pipeline's `WholeFeatureConvergenceRecord` IS what the gate reads; the divergent implement-mode `GovernConvergenceRecord` read path is removed (FR-015 made real, no second schema).
- Q: Does chunk sizing measure the raw diff or the rendered payload? → A: **Rendered payload** — sizing MUST account for the context preamble/trailer, per-file framing, and FR-021 folded out-of-window deps, so no chunk renders over-envelope (raw-byte measure was the dogfood's over-envelope-single-barrage bug).
- Q: When the non-audit trim drops a file's bytes, is the file still covered? → A: **Yes, always covered** — the trim reduces measured/rendered bytes, never coverage; the render honors the same trim so coverage doesn't re-bloat the payload; an all-non-audit cluster yields no dangling `SplitClusterMarker`.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Whole-feature audit never FATALs on size (Priority: P1)

Govern a completed feature whose committed diff (from the feature base `governedSha` to HEAD) is larger than the fleet envelope. The run partitions the diff into envelope-sized chunks, audits each, and proceeds to a graduation decision — it **never** terminates with `boundary-too-large`. An oversized single coupling cluster is sub-split (after a cheap non-audit-byte trim pre-pass) and still audited; degradation is recorded, never silent.

**Why this priority**: This is the core value and the reason per-phase existed. Without it, a real-sized feature cannot be governed at end at all. It is the MVP — everything else refines correctness, speed, or hygiene on top of a run that completes.

**Independent Test**: Run end-govern on a fixture feature whose diff exceeds the smallest negotiated lane envelope. Assert: terminal outcome is a graduation decision (converged or override-eligible), NOT `boundary-too-large`; every governed file appears in exactly one chunk; an oversized cluster produces a recorded `split-cluster` marker.

**Acceptance Scenarios**:

1. **Given** a committed feature diff larger than the fleet envelope, **When** end-govern runs, **Then** it partitions into N envelope-sized chunks and audits all of them without a `boundary-too-large` FATAL.
2. **Given** a single coupling cluster larger than the envelope, **When** chunking runs, **Then** the cheap trim pre-pass is applied, and if still oversized the cluster is sub-split into envelope-sized sub-chunks with a `split-cluster` marker recorded.
3. **Given** the same committed diff governed twice at the same `governedSha`..HEAD endpoints, **When** chunking runs each time, **Then** the chunk set and chunk ids are identical (deterministic).

---

### User Story 2 - Clean break: per-phase govern is gone, one graduate gate (Priority: P1)

The per-phase govern path and its entire apparatus are removed. There is exactly one govern path (chunked end-govern) and exactly one graduation criterion (a converged whole-feature convergence record). No `--phase` flag, no per-phase checkpoints, no `GOVERN_CHECKPOINT`, no either-of gate, no grandfather, no migration.

**Why this priority**: The feature's thesis is the clean break — leaving any per-phase surface alive is the deprecation honey pot the operator explicitly forbids (`.claude/rules/agent-discipline.md` § Zero backwards compatibility). It is foundational: the single-path model is what makes the rest coherent.

**Independent Test**: Assert the `--phase` flag and `GOVERN_CHECKPOINT` no longer exist (invoking them is a clean usage error, not a silent accept); no `phase-checkpoints/*.json` is written by any path; the graduate gate evaluates solely on the whole-feature record; `allPhaseCheckpointsCurrent` and the per-phase doctor rule are absent from the codebase.

**Acceptance Scenarios**:

1. **Given** the shipped CLI, **When** a caller passes `--phase` or sets `GOVERN_CHECKPOINT`, **Then** it is rejected as an unknown flag/var (clean break — no legacy accept).
2. **Given** a feature governed at end with a converged whole-feature record, **When** the graduate gate evaluates, **Then** it passes on that record alone (no per-phase checkpoint consulted).
3. **Given** the codebase after this feature, **When** searched, **Then** the per-phase checkpoint writer, `phase-checkpoints` artifact + its doctor/schema rule, the per-phase compass/workflow transition arms, and `allPhaseCheckpointsCurrent` + all callers are deleted.
4. **Given** a hypothetical in-flight feature that had per-phase checkpoints, **When** this feature ships, **Then** there is deliberately no migration/grandfather path (WONTFIX) — it governs at end like any other.

---

### User Story 3 - Cross-file correctness preserved across chunk boundaries (Priority: P2)

Chunking partitions by code coupling so coupled files are audited together, and every chunk carries a manifest of the other chunks' file lists so an auditor can flag a dependency it cannot see. A final interface-level **seam pass** audits cross-chunk and split-cluster boundaries (signatures + changed-function headers), gated to substantive contract breaks, catching mismatches the partition split apart.

**Why this priority**: Chunking buys scale at the risk of cross-file blindness — a caller/callee contract mismatch split across chunks would otherwise be invisible to every auditor. This story is what keeps end-govern as trustworthy as a single-payload audit.

**Independent Test**: Construct a fixture with a contract mismatch spanning two files that the partitioner places in different chunks. Assert the mismatch is surfaced — either by a chunk auditor using the manifest or by the seam pass — and that a compatible (non-breaking) signature change does NOT raise a seam-pass false positive.

**Acceptance Scenarios**:

1. **Given** two coupled files (import / same-dir / diff cross-reference), **When** chunking runs, **Then** they are placed in the same chunk where envelope permits.
2. **Given** a chunk, **When** its audit payload is rendered, **Then** it includes the plan/spec/contracts and a manifest of the other chunks' file lists.
3. **Given** a contract mismatch spanning a chunk boundary, **When** the seam pass runs, **Then** it surfaces the mismatch as a finding.
4. **Given** a signature change that is source-compatible, **When** the seam pass runs, **Then** it does not raise a finding (substantive-break gating).

---

### User Story 4 - Bounded convergence: re-audit only what fixes touch (Priority: P2)

After the chunked audit produces findings and they are fixed, only the chunks whose files a fix touched are re-audited. The re-audit set shrinks each round and the run graduates when the dampener clears the touched set. The loop terminates by construction — no whole-set re-audit, no chunk-scale ping-pong treadmill.

**Why this priority**: Termination is the correctness-of-the-loop guarantee. Without bounded re-audit, the in-loop fix step recreates the O(n²) staleness the whole feature exists to kill.

**Independent Test**: Run a fixture where a fix in chunk A touches only A's files. Assert round 2 re-audits A only (B/C/D carried), the touched set monotonically shrinks across rounds, and the run reaches a graduation decision in a bounded number of rounds.

**Acceptance Scenarios**:

1. **Given** findings fixed in round 1 that touched files in chunks {A,B}, **When** round 2 begins, **Then** only {A,B} are re-audited and untouched chunks are carried.
2. **Given** successive rounds, **When** the touched set becomes empty or the dampener clears it, **Then** the run graduates.
3. **Given** a fix in chunk A that touches a file coupled into chunk B, **When** the touched set is computed, **Then** B is included in the next re-audit (coupling-correct), and the set still converges.

---

### User Story 5 - Industrialized parallel fix (Priority: P2)

Findings are grouped by chunk and fixed by worktree-isolated fix-subagents running in parallel under a concurrency cap; results merge back to the feature branch. A conflicting pair serializes; an unresolvable merge surfaces to the operator. A fix-subagent failure isolates that chunk and the run continues, surfacing the failure at reconcile. A lane outage degrades that round per existing behavior.

**Why this priority**: The thesis demands industrialized execution (parallel, worktree-isolated, unattended). This story realizes the "parallelize fix" half; the coupling-grouped partition keeps cross-chunk file overlap (and thus merge conflicts) low.

**Independent Test**: Run a fixture with findings in N disjoint chunks. Assert N fix-subagents run concurrently in isolated worktrees and merge cleanly; inject a shared-file pair and assert it serializes; inject a fix-subagent failure and assert the run isolates that chunk, continues the others, and surfaces the failure at reconcile.

**Acceptance Scenarios**:

1. **Given** findings across N chunks with disjoint files, **When** the fix step runs, **Then** N fix-subagents run in parallel (capped) in isolated worktrees and merge back without conflict.
2. **Given** two chunks whose fixes touch a shared file, **When** merging, **Then** the conflicting pair is serialized rather than merged blindly.
3. **Given** an unresolvable merge, **When** it occurs, **Then** the run surfaces it to the operator rather than fabricating a resolution.
4. **Given** a fix-subagent that fails, **When** it fails, **Then** its chunk is isolated, other chunks continue, and the failure is reported at reconcile.

---

### User Story 6 - Reconcile once; in-loop-fixed findings don't balloon the backlog (Priority: P2)

The run reconciles exactly once at the end into a single whole-feature convergence record. Findings that were fixed within the bounded re-audit loop are closed **before** the lift step, so they are not migrated to the backlog as open tasks. This delivers `govern-lift-auto-close-in-loop-fixes` for the end-govern case.

**Why this priority**: The lift balloon (a ~71% stale ratio in the offing dogfood) is a top operator friction; reconcile-once is its natural fix. Without this, end-govern still floods the backlog with already-fixed findings.

**Independent Test**: Run a fixture where finding F is raised in round 1 and fixed in round 2 (absent from the clean final round). Assert F is NOT present as an open backlog task at graduation, and a finding still open at graduation IS lifted.

**Acceptance Scenarios**:

1. **Given** a finding fixed within the re-audit loop, **When** the run reconciles, **Then** the finding is closed and NOT lifted to the backlog as open.
2. **Given** a finding still present in the final clean/dampened round, **When** the run reconciles, **Then** it is lifted (still-open work is recorded).
3. **Given** a graduating run, **When** reconciliation completes, **Then** exactly one whole-feature convergence record is written for the feature.

---

### User Story 7 - New artifacts have a doctor/schema surface (Priority: P3)

Every new on-disk artifact this feature introduces — the chunk set, `split-cluster` markers, touched-set rounds, the seam result, and the whole-feature convergence record — is schema-validated and covered by a doctor rule, so a malformed or stale artifact is caught rather than silently trusted.

**Why this priority**: The project discipline (new artifacts need a doctor/schema surface) prevents the class of silent-corruption bugs that untracked artifacts cause. P3 because it hardens rather than enables the core run.

**Independent Test**: Corrupt each new artifact in a fixture (malformed JSON, missing required field, stale fingerprint) and assert `doctor` flags it with an actionable message.

**Acceptance Scenarios**:

1. **Given** a malformed whole-feature convergence record, **When** `doctor` runs, **Then** it reports the defect with an actionable message.
2. **Given** a `split-cluster` marker referencing a chunk that no longer exists, **When** `doctor` runs, **Then** it flags the dangling reference.

---

### User Story 8 - Targeted refactor: decompose the payload module, replace the broken composition path (Priority: P3)

Building the chunking mechanism decomposes `payload-implement.ts` (over the 300–500-line cap) into focused modules and **replaces** the broken exclusion-based whole-feature composition path with the inclusion-based chunked path, so the composition bugs (empty `diffScope.files`, unscoped commit subjects, ignored checkpoint env, dead re-audit branch) no longer exist.

**Why this priority**: The feature heavily touches this code; leaving the over-cap file and the broken composition path in place would be debt shipped alongside the fix. P3 because it is internal hygiene riding along the core work, not a separately demoed slice.

**Independent Test**: Assert no new or modified source file exceeds the 500-line cap; assert the prior composition-bug repros no longer reproduce (empty scope, unscoped subjects, ignored env, dead branch are gone).

**Acceptance Scenarios**:

1. **Given** the feature's source, **When** line counts are measured, **Then** every touched file is within the 300–500-line cap (Constitution Principle VI).
2. **Given** the prior exclusion-based composition path, **When** the feature ships, **Then** it is removed and replaced by the inclusion-based chunked path.

---

### User Story 9 - The CLI drives the end-govern pipeline (the wired core) (Priority: P1)

The implement-mode `govern` CLI **drives `end-govern-pipeline.runEndGovern`** as its single execution path — cluster → (audit → fix → re-audit)\* bounded → seam → reconcile-once → one whole-feature convergence record — instead of looping the reused per-chunk `runProtocol`. This is what makes FR-008/009/012/015/016 real at the CLI rather than dead code in an unreferenced module, and it dissolves the dogfood-surfaced defects (per-chunk lift sections, raw-byte sizing, coverage holes, divergent record schema) at their root rather than patching the reused path.

**Why this priority**: P1 — this IS the feature. Without it the headline mechanism (parallel chunked audit + autonomous fix + reconcile-once) ships as an unwired object and the CLI silently audits a single over-envelope payload. Discovered only by dogfooding because the unit tests exercised the pipeline in isolation, never the CLI→pipeline seam.

**Independent Test**: Drive the implement-mode CLI over a >envelope multi-chunk fixture; assert it invokes the pipeline (one `WholeFeatureConvergenceRecord` written, exactly one lift section / one dampener "run"), that the graduate gate reads that record, that no chunk's *rendered* payload exceeds the envelope, and that the per-chunk `runProtocol` loop is gone from `govern.ts`.

**Acceptance Scenarios**:

1. **Given** a feature diff that partitions into N>1 chunks, **When** implement-mode govern runs, **Then** the CLI drives `runEndGovern` once and writes exactly one whole-feature convergence record and one lift section (not N).
2. **Given** that record, **When** the graduate gate evaluates `implRecordConverged`, **Then** it reads the pipeline's `WholeFeatureConvergenceRecord` (one schema, one path; the divergent `GovernConvergenceRecord` read path for implement mode is gone).
3. **Given** a chunk whose raw diff is ≤ envelope but whose *rendered* payload (preamble + framing + folded deps) would exceed it, **When** the partition sizes it, **Then** sizing uses rendered bytes and the chunk does not render over-envelope.
4. **Given** an oversized cluster containing non-audit (trimmed) files, **When** it is chunked, **Then** every changed file remains covered (union of chunk files == changed set), the render honors the same trim, and no dangling `SplitClusterMarker` is produced.
5. **Given** `govern.ts` after wiring, **When** its source is inspected, **Then** the per-chunk `runProtocol` invocation loop and the implement-mode `GovernConvergenceRecord` read path are deleted (clean break).

---

### Edge Cases

- **Empty / below-envelope feature diff**: a small feature whose whole diff fits one chunk governs as a single chunk (chunking is a no-op partition of size 1) — no special-case FATAL, no empty-payload error.
- **Single file larger than the envelope** (after the non-audit trim pre-pass): out of scope as a graceful path — a *code* file whose own diff exceeds the envelope is a priori broken (it violates the 300–500-line cap, Constitution VI), and a *non-code* file that large is not useful in the stack-control audit context. This is NOT the never-FATAL feature-size case (which chunking handles); govern **fails loud** naming the offending file as a defect to fix, rather than hunk-splitting around an a-priori-broken input. There is no `split-file` concept (operator decision 2026-06-21: "there should never be a single file that exceeds the envelope"). Cluster sub-split (FR-006) operates at FILE granularity on a *multi-file* coupling cluster, which is the only legitimate oversized case.
- **A fix introduces a brand-new file** not in any existing chunk: the touched-set computation assigns it to a chunk (by coupling) for re-audit rather than dropping it (the `split-file-audit-exclusion` class must not recur).
- **Non-TS adopter** (Bash/PHP/Python/WordPress): the universal coupling baseline (directory + diff cross-reference) partitions without an import graph; the feature never hard-blocks on missing language tooling.
- **All chunks clean on the first pass** (zero findings): the run reconciles once and graduates with no fix/re-audit rounds.
- **Lane outage mid-run**: the affected chunk's round is degraded per existing fleet-degradation behavior; the run does not fabricate a clean result.
- **Coupling cluster that is a single tightly-coupled blob larger than the envelope even after trim**: sub-split deterministically; the seam pass recovers cross-sub-chunk coverage; coverage degradation is recorded.
- **Re-run determinism under a moved diff base**: chunking is pinned to the resolved `governedSha`..HEAD endpoints so a re-run over identical endpoints yields an identical chunk set.
- **Worktree exhaustion** (more chunks-to-fix than the concurrency cap): excess fix-subagents queue and run as worktree slots free; no unbounded fan-out.

## Requirements *(mandatory)*

### Functional Requirements

**Pipeline & partitioning**

- **FR-001**: Govern MUST audit the whole committed feature diff resolved from the feature base `governedSha` to HEAD as a single end-of-feature run (no per-phase invocation). The base anchor MUST reuse the existing 029 US5 `governedSha` anchor resolved at feature start; an explicit `--diff-base <ref>` MUST override it.
- **FR-002**: Govern MUST partition the diff into chunks each within the active fleet envelope (the minimum `maxPromptBytes` across negotiated lanes), and MUST NOT terminate with `boundary-too-large` for a feature of any size.
- **FR-003**: Partitioning MUST group files by code coupling, using a universal baseline of directory-adjacency + diff cross-references (language-agnostic), with the TypeScript import graph as an additional precision signal where available.
- **FR-004**: Partitioning MUST be deterministic — the same committed diff over the same `governedSha`..HEAD endpoints MUST yield the same chunk set with stable chunk ids.
- **FR-005**: Each chunk's audit payload MUST include the plan/spec/contracts context and a manifest of the other chunks' file lists.
- **FR-006**: When a single coupling cluster exceeds the envelope, govern MUST first apply a cheap non-audit-byte trim pre-pass (lockfiles, generated/vendored output, whitespace-only hunks, fixtures) and, if still oversized, sub-split the cluster into envelope-sized sub-chunks and record a `split-cluster` marker; it MUST NOT FATAL.
- **FR-007**: A new file created by a fix MUST be assigned to a chunk (by coupling) for re-audit rather than excluded from scope (the file-split-exclusion class MUST NOT recur).

**Audit, fix, convergence**

- **FR-008**: Govern MUST audit chunks in parallel (chunks × lanes) under a concurrency cap bounded by fleet negotiation.
- **FR-009**: Govern MUST fix findings grouped by chunk via worktree-isolated fix-subagents running in parallel under a configurable concurrency cap, then merge results to the feature branch. Fixing is **autonomous**: govern applies AND commits the fixes unattended (no propose-only / operator-applies step); only fix-subagent failures (FR-011) and unresolvable merges (FR-010) surface to the operator.
- **FR-010**: When two chunks' fixes touch a shared file, govern MUST serialize the conflicting pair rather than merge blindly; an unresolvable merge MUST be surfaced to the operator (Constitution Principle V — fail loud, no fabricated resolution).
- **FR-011**: A fix-subagent failure MUST isolate its chunk, allow other chunks to continue, and be surfaced at reconcile.
- **FR-012**: After fixes, govern MUST re-audit only the chunks whose files a fix touched (the touched set), and the touched set MUST be coupling-correct (a fix to a file coupled into another chunk includes that chunk).
- **FR-013**: The re-audit loop MUST terminate — the touched set MUST shrink toward empty and graduation occurs when the dampener clears the touched set. As a backstop against a coupling cycle that prevents the set from shrinking, govern MUST enforce a hard maximum-round cap; on hitting the cap it MUST STOP and surface the stall for operator override (it MUST NOT loop forever and MUST NOT silently auto-graduate unresolved churn).
- **FR-014**: Govern MUST run a final interface-level seam pass over cross-chunk and split-cluster boundaries (signatures + changed-function headers) gated to substantive contract breaks; the seam payload MUST fit the envelope. A **substantive contract break** is observable cross-boundary breakage — a removed/renamed exported symbol, a changed arity, or a changed required shape consumed across a chunk boundary; the seam pass MUST NOT flag compatible additions or internal-only changes (SC-003 false-positive target).
- **FR-015**: Govern MUST reconcile exactly once into a single whole-feature convergence record per feature.
- **FR-016**: Findings fixed within the bounded re-audit loop MUST be closed before the lift step and MUST NOT be lifted to the backlog as open tasks; findings still open at graduation MUST be lifted.

**Clean break (zero backwards compatibility)**

- **FR-017**: The per-phase govern invocation path MUST be removed: the `--phase` flag, the per-phase checkpoint writer, the `phase-checkpoints/*.json` artifact and its doctor/schema rule, and `GOVERN_CHECKPOINT`/`--checkpoint` MUST be deleted.
- **FR-018**: The graduate gate MUST evaluate solely on a converged whole-feature convergence record; the either-of gate, `allPhaseCheckpointsCurrent`, and all its callers MUST be removed.
- **FR-019**: The per-phase arms of the compass/workflow transitions MUST be removed so the lifecycle reflects the single end-govern path.
- **FR-020**: There MUST be no grandfather, migration, or backfill for in-flight per-phase features (WONTFIX); a clean-break removal MUST NOT leave a legacy accept path for any deleted flag/var/artifact.

**Hygiene & artifacts**

- **FR-021**: Each new artifact (chunk set, `split-cluster` markers, touched-set rounds, seam result, whole-feature convergence record) MUST be schema-validated and covered by a doctor rule.
- **FR-022**: `payload-implement.ts` and any other touched file MUST be brought within the 300–500-line cap (Constitution Principle VI) as part of building the chunking modules.
- **FR-023**: The broken exclusion-based whole-feature composition path MUST be replaced by the inclusion-based chunked path (no empty `diffScope.files`, no unscoped commit subjects, no ignored checkpoint env, no dead re-audit branch).

#### Wired pipeline + dogfood-surfaced defects (US9)

- **FR-024**: The implement-mode `govern` CLI MUST drive `end-govern-pipeline.runEndGovern` as its single execution path. The reused per-chunk `runProtocol` invocation loop MUST be deleted (clean break, no fallback arm) so FR-008 (parallel audit), FR-009 (worktree fix-fanout), FR-012 (touched-set re-audit), FR-015 (reconcile once), and FR-016 (close-before-lift) are delivered by the CLI, not merely present in an unreferenced module.
- **FR-025**: The graduate gate MUST read the SAME convergence record the pipeline writes — the `WholeFeatureConvergenceRecord` IS the record `isModeConverged`/`implRecordConverged` evaluates. The divergent implement-mode `GovernConvergenceRecord` read path MUST be removed (one schema, one path; FR-015 made real).
- **FR-026**: A chunked govern invocation MUST reconcile once into exactly ONE lift section and count as exactly ONE dampener "run" — never one lift/run per chunk. The N-quiet / consecutive-clean streak MUST count govern invocations, not chunks.
- **FR-027**: Chunk sizing MUST measure the RENDERED payload bytes — the context preamble/trailer, per-file framing, and the FR-021-folded out-of-window dependencies — not the raw per-file diff bytes. No chunk's rendered payload may exceed the active fleet envelope (the raw-byte measure permitted an over-envelope single barrage — the dogfood's headline defect).
- **FR-028**: The coverage invariant (the union of all chunk files equals the `governedSha`..HEAD changed-file set) MUST hold THROUGH the non-audit trim: a trimmed file's bytes are excluded from measurement/render but the file remains covered in exactly one chunk, and the render MUST honor the same trim so re-adding the file for coverage does not re-bloat the payload. An all-non-audit oversized cluster MUST NOT produce a dangling `SplitClusterMarker` (a marker MUST reference ≥2 real sub-chunks, or no marker is written).
- **FR-029**: `GOVERN_CHECKPOINT` / `--checkpoint` rejection MUST be implement-mode-scoped — spec mode retains its checkpoint-label selection; only implement mode rejects them (the clean break removed per-phase checkpoints from implement mode only).
- **FR-030**: The committed-diff scope's untracked-file fold MUST render a standard git diff (`git diff --no-index`), not a synthetic per-line `+`-prefixed format, matching the render arm so the audit lane sees consistent diff syntax.
- **FR-031**: The seam-pass signature comparison MUST count parameter arity correctly when a parameter is itself function-typed (its own parentheses MUST NOT terminate the signature scan), so higher-order signatures are not mis-rated.

### Key Entities

- **Chunk**: an envelope-sized audit unit — a set of coupled files (or sub-split files) with a stable id, carrying the cross-cutting manifest.
- **Cluster**: a coupling-derived group of files (from directory + diff cross-references + optional import graph) that bin-packs into chunks.
- **Chunk manifest**: the per-chunk context block listing the file lists of the other chunks (what this chunk cannot see).
- **Split-cluster marker**: a recorded note that a cluster exceeded the envelope and was sub-split, with the coverage caveat.
- **Touched set**: the set of chunks a round's fixes changed, computed from fix commits, driving bounded re-audit.
- **Seam result**: the outcome of the interface-level cross-chunk/split-cluster pass.
- **Whole-feature convergence record**: the single per-feature record that the graduate gate evaluates.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A feature whose committed diff exceeds the fleet envelope governs to a graduation decision with zero `boundary-too-large` FATALs (0 occurrences across the test matrix).
- **SC-002**: After this feature, there is exactly **one** govern path and exactly **one** graduation criterion; the count of per-phase surfaces (flags, artifacts, gate arms, doctor rules) remaining in the codebase is **0**.
- **SC-003**: A cross-file contract mismatch split across a chunk boundary is detected in 100% of the seeded-fixture cases; source-compatible signature changes raise 0 seam-pass false positives in the fixture set.
- **SC-004**: The bounded re-audit loop terminates on every fixture (no non-terminating run), and the re-audit set is strictly smaller than the full chunk set whenever at least one chunk is untouched.
- **SC-005**: Findings fixed within the re-audit loop appear as open backlog tasks at graduation in **0%** of cases (the lift balloon for in-loop fixes is eliminated for end-govern).
- **SC-006**: Every new on-disk artifact is rejected by `doctor` when malformed (100% of seeded-corruption cases flagged).
- **SC-007**: No source file touched by the feature exceeds the 500-line cap.
- **SC-008**: After wiring, the implement-mode CLI drives the pipeline — `govern.ts` contains **0** per-chunk `runProtocol` invocations and **0** implement-mode `GovernConvergenceRecord` reads; a multi-chunk invocation writes exactly **1** `WholeFeatureConvergenceRecord` and exactly **1** lift section, and the graduate gate reads that record.
- **SC-009**: Across the test matrix, **0** chunks render a payload exceeding the active fleet envelope (sizing measured on rendered bytes, not raw diff).
- **SC-010**: On every fixture — including non-audit-trim and oversized-cluster cases — the union of all chunk files equals the changed-file set (no file dropped) and **0** dangling `SplitClusterMarker`s are produced.

## Assumptions

- The feature base `governedSha` anchor from the existing payload-scoping work (029 US5) is reused to define the feature boundary; end-govern operates over committed work between that anchor and HEAD.
- The existing fleet-negotiation, audit-barrage fire/render, dampener, and convergence-record machinery are reused; this feature changes how the payload is assembled and how the loop is bounded, not the cross-model barrage mechanism itself.
- The program runs on one long-lived branch with numbered spec dirs (the `speckit.git.feature` per-spec branch hook is not used here, per the define skill's TF-09 note); the active spec dir is resolved via the `CLAUDE.md` SPECKIT marker.
- "Worktree-isolated parallel fix" uses git worktrees off the feature branch; the host can dispatch fix-subagents (Claude Code / Codex portability targets).

## Open Questions

Captured explicitly (house rule: open questions are marked, never silently cut). Each has a recommended default the spec proceeds on; `/speckit-clarify` may settle them.

- **OQ-1 — Non-TS coupling precision**: SETTLED (implementation, T065) — **ship the universal baseline** (directory-adjacency + diff cross-reference, with the TS import graph as an additive precision layer, `coupling-graph.ts`). The per-adopter coupling-resolver seam is a **follow-on**, not built now; if the directory-only signal proves too coarse on a large flat non-TS tree, expose the seam then. Captured, not cut.
- **OQ-2 — Concurrency-cap defaults**: SETTLED (implementation, T066) — the worktree-fix concurrency cap is an explicit `concurrency` parameter of `dispatchFixSubagents` (caller-supplied, queueing excess); the recommended default is **4** (disk/CPU-bound), and audit concurrency stays bounded by fleet negotiation. Adopter-configurable via the dispatch caller.
- **OQ-3 — Seam-pass false-positive rubric**: RESOLVED (Session 2026-06-21, → FR-014) — substantive break = cross-boundary breakage (removed/renamed export, changed arity, changed required shape consumed across a boundary); compatible/internal-only changes are not flagged. Fixture-level refinement of the detector remains a planning detail.
- **OQ-4 — Coupling-graph determinism under churn**: RESOLVED (Session 2026-06-21, → FR-001) — chunking is pinned to the 029 `governedSha`..HEAD endpoints (explicit `--diff-base` overrides); a legitimately moved base is a different audit scope by design, not a determinism violation.
