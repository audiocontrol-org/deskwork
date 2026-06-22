# Quickstart: Chunked whole-feature end-govern — validation scenarios

Runnable scenarios that prove the feature. Each maps to a Success Criterion (SC-001..SC-010) and the user stories (US1..US9). Commands are illustrative of the observable surface; assertions reference [contracts/](./contracts/) and [data-model.md](./data-model.md) rather than duplicating them. No implementation/test bodies here — these are *what an operator runs and observes*.

## Prerequisites

- A built `stackctl` (source engine `./bin/stackctl` during development — see `.claude/rules/source-engine-for-stack-control-dev.md`).
- A negotiable multi-lane fleet (`fleet-knowledge.yaml`) so `Math.min(...maxPromptBytes)` resolves to a finite envelope.
- A stack-control installation (`stackctl setup`) with a resolved feature base `governedSha` anchor (029 US5).
- Fixture feature trees on disk (per `.claude/rules/testing.md` — never mock the filesystem).

---

## Scenario 1 — Over-envelope feature governs without `boundary-too-large` (US1 / SC-001)

**Setup.** A fixture feature whose committed diff `governedSha`..HEAD exceeds the smallest negotiated lane envelope.

**Run.**
```
stackctl govern --mode implement --at <fixture-installation>
```

**Expect.**
- Terminal outcome is a **graduation decision** (`converged` or `override-eligible`) per [contracts/govern-cli.md](./contracts/govern-cli.md) — **NOT `boundary-too-large`** (0 occurrences — SC-001).
- The chunk-set artifact records N chunks, each `renderedBytes ≤ envelope` ([cluster-payload.md](./contracts/cluster-payload.md) invariant).
- Every governed file appears in exactly one chunk (⋃ chunks = `governedSha`..HEAD changed set).

---

## Scenario 2 — Oversized single cluster sub-splits, never FATALs (US1 Scenario 2 / SC-001)

**Setup.** A fixture with one tightly-coupled cluster larger than the envelope even after the trim pre-pass.

**Run.** Same `govern` invocation.

**Expect.**
- A `SplitClusterMarker` is written ([data-model.md](./data-model.md)) with `subChunkIds.length ≥ 2`, a `trimApplied` record, and a non-empty `coverageCaveat` (degradation recorded, never silent — Principle V).
- The run still reaches a graduation decision — no `boundary-too-large`.

---

## Scenario 3 — Determinism (US1 Scenario 3 / FR-004)

**Run.** Govern the same fixture twice at the same `governedSha`..HEAD endpoints.

**Expect.** The chunk set and chunk ids are **byte-identical** across runs ([cluster-payload.md](./contracts/cluster-payload.md) determinism contract).

---

## Scenario 4 — Clean break: per-phase surfaces are gone (US2 / SC-002)

**Run / grep.**
```
stackctl govern --mode implement --phase 2 --at <fixture>      # expect: unknown-flag usage error
GOVERN_CHECKPOINT=x stackctl govern --mode implement --at <fixture>   # expect: implement-mode FATAL (no silent accept)
grep -rn "allPhaseCheckpointsCurrent" src/ | grep -v __tests__   # expect: zero hits (deleted; clean-break-absence.test.ts asserts it stays gone)
```

**Expect.**
- In **implement mode**, `--phase` and `GOVERN_CHECKPOINT` / `--checkpoint` are clean usage errors, not legacy-accepted (FR-017, [govern-cli.md](./contracts/govern-cli.md)).
- The live per-phase checkpoint criterion (`allPhaseCheckpointsCurrent`) is gone — the grep returns **zero** hits (SC-002 = 0 remaining live per-phase criterion). NOTE: `--checkpoint` / `GOVERN_CHECKPOINT` / `phase-checkpoints` themselves are **not** zero in `src/` and must not be — SPEC mode retains the `--checkpoint` label (FR-029), implement mode rejects them with a loud FATAL, and `phase-checkpoints` survives only as a payload-exclusion path string. Grepping those tokens for zero hits is the drift TASK-433 corrected.
- No `phase-checkpoints/*.json` is **written** by any govern run (US2 Scenario 3).
- The graduate gate passes on the whole-feature record alone ([graduate-gate.md](./contracts/graduate-gate.md), US2 Scenario 2).

---

## Scenario 5 — Cross-file correctness across a chunk boundary (US3 / SC-003)

**Setup.** A fixture with a contract mismatch (e.g. a renamed exported symbol still called from another file) where the partitioner places the two files in **different** chunks. Plus a control fixture with a **source-compatible** signature change (new optional param) across a boundary.

**Run.** Same `govern` invocation (the seam pass runs after the bounded re-audit converges).

**Expect.**
- The mismatch is **surfaced** — by a chunk auditor using its manifest ([cluster-payload.md](./contracts/cluster-payload.md) manifest) or by the seam pass `SeamResult` ([data-model.md](./data-model.md)) — in 100% of seeded cases (SC-003).
- The compatible change raises **0** seam-pass false positives (`consumedAcross=false` is suppressed — FR-014, SC-003).

---

## Scenario 6 — Bounded re-audit shrinks the touched set (US4 / SC-004)

**Setup.** A fixture where a round-1 fix touches only chunk A's files; B/C/D are untouched.

**Run.** Same `govern` invocation (autonomous fix + re-audit).

**Expect.**
- Round 2 re-audits **A only**; B/C/D are carried ([fix-fanout.md](./contracts/fix-fanout.md) → TouchedSet in [data-model.md](./data-model.md)).
- The `TouchedSet.chunkIds` set **monotonically shrinks** across rounds and is strictly smaller than the full chunk set whenever a chunk is untouched (SC-004).
- The run reaches a graduation decision in a **bounded** number of rounds; a pathological coupling-cycle fixture hits the round cap and surfaces `round-cap-surfaced` rather than looping (FR-013).

---

## Scenario 7 — Industrialized parallel fix (US5)

**Setup.** A fixture with findings in N disjoint chunks; plus an injected shared-file pair; plus an injected fix-subagent failure.

**Run.** Same `govern` invocation.

**Expect.**
- N fix-subagents run concurrently (capped) in isolated worktrees and merge cleanly ([fix-fanout.md](./contracts/fix-fanout.md), US5 Scenario 1).
- The shared-file pair **serializes** (not blind-merged); an unresolvable case **surfaces** to the operator (US5 Scenarios 2–3, Principle V).
- The injected failure **isolates** its chunk, others continue, and the failure is reported at reconcile (US5 Scenario 4).

---

## Scenario 8 — Reconcile once; in-loop-fixed don't balloon the backlog (US6 / SC-005)

**Setup.** A fixture where finding F is raised in round 1 and fixed in round 2 (absent from the clean final round); a separate finding G stays open at graduation.

**Run.** Same `govern` invocation.

**Expect.**
- Exactly **one** `WholeFeatureConvergenceRecord` is written for the feature (FR-015, [data-model.md](./data-model.md)).
- F is in `closedInLoopFindings` and is **NOT** present as an open backlog task at graduation (SC-005 = 0%).
- G is in `liftedFindings` (still-open work is recorded — US6 Scenario 2).

---

## Scenario 9 — New artifacts have a doctor/schema surface (US7 / SC-006)

**Setup.** Corrupt each new artifact in a fixture: malformed whole-feature record JSON; a `SplitClusterMarker` referencing a non-existent chunk; a stale touched-set fingerprint.

**Run.**
```
stackctl doctor --at <fixture>
```

**Expect.** `doctor` flags each with an actionable message (100% of seeded-corruption cases — SC-006; US7 Scenarios 1–2).

---

## Scenario 10 — Targeted refactor: no over-cap file, broken composition path gone (US8 / SC-007)

**Run / measure.**
```
# line counts of every file the feature touched
grep -rn "compositionExcludePaths\|carriedFilesForComposition" src/   # expect: zero hits (composition path removed)
```

**Expect.**
- No source file touched by the feature exceeds **500 lines** (SC-007; `payload-implement.ts` decomposed — FR-022).
- The exclusion-based composition path is removed and replaced by the inclusion-based chunked path; the prior composition-bug repros (empty `diffScope.files`, unscoped commit subjects, ignored checkpoint env, dead re-audit branch) no longer reproduce (FR-023, US8 Scenario 2).

---

## Scenario 11 — The CLI drives the end-govern pipeline (the wired core) (US9 / SC-008)

**Setup.** A fixture feature whose committed diff partitions into N>1 chunks.

**Run.**
```
stackctl govern --mode implement --at <fixture-installation>
grep -n "runProtocol" src/subcommands/govern.ts        # expect: zero per-chunk implement-mode invocations
```

**Expect.**
- `govern.ts` contains **0** per-chunk `runProtocol` invocations and **0** implement-mode `GovernConvergenceRecord` reads (SC-008; US9 Scenario 5 — clean break).
- The run writes exactly **1** `WholeFeatureConvergenceRecord` and exactly **1** lift section (not N) — the CLI drove `runEndGovern` once (US9 Scenarios 1–2).
- The graduate gate evaluates `implRecordConverged` by reading that one `WholeFeatureConvergenceRecord` (one schema, one path — [graduate-gate.md](./contracts/graduate-gate.md)).

---

## Scenario 12 — Rendered-byte sizing: no chunk renders over-envelope (US9 Scenario 3 / SC-009)

**Setup.** A chunk whose *raw* diff is ≤ envelope but whose *rendered* payload (preamble + per-file framing + the manifest of the other chunks' file lists) would exceed it.

**Expect.**
- Across the test matrix, **0** chunks render a payload exceeding the active fleet envelope — sizing is measured on **rendered** bytes, not raw diff (SC-009).
- A chunk whose **irreducible** body (header + other-chunk manifest) cannot fit even after every audited diff is withheld to coverage-only causes govern to **fail loud** naming the chunk (AUDIT-20260622-11) — it never runs the barrage on an over-envelope payload.

---

## Scenario 13 — Union completeness: no file dropped, no dangling marker (US9 Scenario 4 / SC-010)

**Setup.** Fixtures including non-audit-trim and oversized-cluster cases.

**Expect.**
- On every fixture, the union of all chunk files equals the changed-file set — **no file dropped** (SC-010).
- **0** dangling `SplitClusterMarker`s are produced (a sub-split always yields ≥2 sub-chunks).

---

## Edge-case probes (from spec § Edge Cases)

- **Below-envelope feature** → governs as a single chunk (size-1 partition), no empty-payload error.
- **Lane outage mid-run** → the affected chunk's round is degraded; the run does NOT fabricate a clean result — a clean-but-degraded final round reconciles to `degraded-fleet-surfaced` (a non-converged terminal), never `converged` (AUDIT-20260622-10).
- **Single file > envelope** → govern **fails loud** naming the file as an a-priori-broken defect to fix; there is NO `split-file`/hunk-split path (spec § Edge Cases; operator decision 2026-06-21). This is distinct from the never-FATAL feature-size case (which chunking handles) and from multi-file oversized clusters (which FR-006 sub-splits at file granularity).
- **Fix creates a new file** → assigned to a chunk by coupling for re-audit (FR-007; the `split-file-audit-exclusion` class must not recur).
- **All chunks clean on first pass** → reconcile once, graduate, zero fix/re-audit rounds.
- **Lane outage mid-run** → that round degrades per existing fleet behavior; no fabricated clean result.
