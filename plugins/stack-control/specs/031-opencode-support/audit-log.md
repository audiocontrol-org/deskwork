---
slug: 031-opencode-support
targetVersion: ""
---

# Audit log — 031-opencode-support

## 2026-06-22 — audit-barrage lift (20260622T222030468Z-031-opencode-support-after_clarify)

Code-sha: 16dc5475f47a46a91e477d873cd0866c549b8479
### AUDIT-20260622-01 — FR-017 contradicts FR-029 on `--checkpoint`/`GOVERN_CHECKPOINT` deletion scope

Finding-ID: AUDIT-20260622-01 (claude-01 + codex-01 + codex-02; cross-model)
Status:     open
Severity:   high
Per-lane:   claude=blocking, codex=high
Decision:   agreement (gate-counted high)
Surface:    spec.md — FR-017 vs. FR-029

FR-017 states unconditionally: "`GOVERN_CHECKPOINT`/`--checkpoint` MUST be deleted." FR-029 states: "`GOVERN_CHECKPOINT` / `--checkpoint` rejection MUST be implement-mode-scoped — spec mode retains its checkpoint-label selection; only implement mode rejects them." These are a direct contradiction: FR-017 says delete the flag/var from the codebase entirely; FR-029 says keep it alive in spec mode and only reject it in implement mode.

An agent building unattended will encounter FR-017 first (it is sequentially earlier in the clean-break block) and read it as the authoritative rule for the clean break. It will delete `--checkpoint` from all modes. FR-029 then becomes a dead letter. The spec never reconciles these two requirements or signals that FR-029 is the carve-out that governs FR-017's scope. Because FR-029 was added later (US9/dogfood block) but is indexed as a peer functional requirement, neither has textual precedence over the other.

A reasonable fix: amend FR-017 to scope its deletion to implement mode ("implement-mode `--checkpoint` and `GOVERN_CHECKPOINT` MUST be deleted"), and add a positive statement that spec mode's `--checkpoint` label-selection is retained, so that FR-029 becomes clarification rather than contradiction.

---

### AUDIT-20260622-02 — FR-013 is internally self-contradictory: the touched set "MUST shrink toward empty" while a hard cap exists precisely because it may not shrink

Finding-ID: AUDIT-20260622-02
Status:     open
Severity:   high
Per-lane:   claude=high
Decision:   single-model (gate-counted high)
Surface:    spec.md — FR-013

FR-013 states: "the touched set MUST shrink toward empty and graduation occurs when the dampener clears the touched set. As a backstop against a coupling cycle that prevents the set from shrinking, govern MUST enforce a hard maximum-round cap." The backstop exists because a coupling cycle can prevent the set from shrinking — but the same sentence earlier says the set MUST shrink toward empty. A normative MUST claim and a named failure mode that violates that claim cannot both be true.

The blast radius is high: an agent reading "touched set MUST shrink toward empty" may implement a loop that assumes monotonic shrinkage and omits or weakens the cap logic, reasoning the cap is only a defensive fallback against "broken" inputs. Alternatively it may implement the cap but not correctly handle the case where the set hasn't shrunk (treating cap termination as an error state rather than a legitimate stop). SC-004 compounds the confusion: it says "the re-audit set is strictly smaller than the full chunk set whenever at least one chunk is untouched" — a weaker claim than "shrinks toward empty" — making the two spec artefacts inconsistent with each other too.

A reasonable fix: replace "the touched set MUST shrink toward empty" with "the touched set SHOULD converge toward empty over successive rounds; the hard max-round cap is the termination guarantee when it does not." The hard cap and the dampener should be explicitly described as two independent termination conditions, not one with a fallback.

---

### AUDIT-20260622-03 — FR-027 enumerates rendered-payload components but omits the chunk manifest (FR-005), making SC-009 potentially unachievable

Finding-ID: AUDIT-20260622-03
Status:     open
Severity:   high
Per-lane:   claude=high
Decision:   single-model (gate-counted high)
Surface:    spec.md — FR-005, FR-027, SC-009

FR-027 says chunk sizing MUST measure "the context preamble/trailer, per-file framing, and the FR-021-folded out-of-window dependencies." FR-005 requires each chunk's audit payload to include "the plan/spec/contracts context and a manifest of the other chunks' file lists." The manifest of all other chunks' file lists is not enumerated in FR-027's sizing formula. As the number of chunks N grows, the manifest for each chunk lists N-1 other chunks' files — for a large feature partitioned into many small chunks, the manifest grows substantially.

If manifest bytes are not counted during partition sizing but are present in the rendered payload, a chunk sized just under the envelope will render over-envelope once the manifest is appended. SC-009 says "0 chunks render a payload exceeding the active fleet envelope." SC-009 will be violated on large features (the exact scenario the feature exists to solve) unless manifest size is measured.

The phrasing "context preamble/trailer" in FR-027 could be read as encompassing the manifest, but it is not stated — "preamble" naturally refers to the plan/spec/contracts context named in FR-005's first clause, not the per-chunk manifest that is its second clause. An agent building the sizer has two equally plausible readings: include manifest in sizing, or don't. The wrong choice silently violates SC-009 only at scale.

A reasonable fix: add "the cross-chunk manifest (FR-005)" to FR-027's enumeration of components that MUST be included in rendered-payload measurement.

---

### AUDIT-20260622-04 — FR-028 coverage invariant is ambiguous: static (at chunk time) vs. dynamic (after fix commits add new files)

Finding-ID: AUDIT-20260622-04
Status:     open
Severity:   high
Per-lane:   claude=high
Decision:   single-model (gate-counted high)
Surface:    spec.md — FR-007, FR-028, FR-009

FR-028 defines the coverage invariant as "the union of all chunk files equals the `governedSha`..HEAD changed-file set." This is stated in the present tense without scoping to a point in time. FR-009 specifies that fix-subagents autonomously apply and commit fixes to the feature branch, which moves HEAD. As HEAD moves, the `governedSha`..HEAD changed-file set grows to include files introduced by fix commits. FR-007 says "A new file created by a fix MUST be assigned to a chunk (by coupling) for re-audit."

The ambiguity: does FR-028's invariant need to hold (a) only at initial partition time (when HEAD is the pre-fix commit), or (b) continuously throughout the re-audit loop as fix commits accumulate and HEAD moves? If (a), FR-007's new files need not be in any chunk's file set for the invariant to hold — they are just re-audited somehow. If (b), the chunk partition must dynamically update after each fix commit, which conflicts with FR-004's determinism property (same endpoints → same chunk set) and the static partition assumption underlying the bounded re-audit loop.

An agent building the re-audit loop will be forced to resolve this ambiguity. The most natural reading of FR-028 (invariant always holds) leads to dynamic chunk updates; the most natural reading of FR-004 (deterministic partition) leads to a static partition. The two cannot both hold if fix commits add new files. The spec needs to explicitly state that the coverage invariant is defined at initial partition time, and FR-007's new-file assignment is an additional assignment to an existing chunk's re-audit scope — not a change to the partition's file-list for coverage-invariant purposes.

---

### AUDIT-20260622-05 — FR-014 seam-pass payload is promised to fit the envelope but the spec provides no path when it cannot

Finding-ID: AUDIT-20260622-05
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    spec.md — FR-014

FR-014 states "the seam payload MUST fit the envelope." The seam pass audits "cross-chunk and split-cluster boundaries (signatures + changed-function headers)." For a large feature partitioned into many chunks with many cross-boundary interfaces, the union of all exported signatures and changed-function headers across all boundaries could exceed the fleet envelope. The spec provides no mechanism for what happens when the seam payload is too large — no sub-pass, no seam-chunking, no graceful degradation, no FATAL.

The promise "MUST fit the envelope" is thus either (a) a constraint on the seam payload's construction (the seam pass must trim or sample to fit) or (b) an implicit assumption that cross-boundary interfaces are always small enough. Neither is stated. An agent building the seam pass has no spec guidance for the case where assembling the full seam payload exceeds the envelope, which is not a contrived edge case for large features with many chunks.

A reasonable fix: either specify how the seam payload is trimmed to fit the envelope (e.g., prioritize changed-function headers over stable signatures, or sub-split the seam pass over boundary pairs), or state explicitly that a seam payload exceeding the envelope is a non-fatal degradation that is recorded alongside the graduation decision.

---

### AUDIT-20260622-06 — SC-004's "terminates on every fixture" conflates converged graduation with cap-terminated stall, misrepresenting the two outcomes as equivalent

Finding-ID: AUDIT-20260622-06
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    spec.md — SC-004, FR-013

SC-004 states: "The bounded re-audit loop terminates on every fixture (no non-terminating run)." Termination is guaranteed by the hard max-round cap in FR-013 regardless of convergence — even a loop that never converges will terminate when the cap fires. SC-004's "no non-terminating run" is therefore trivially satisfied by any finite cap and provides no meaningful correctness guarantee. What matters is whether the loop terminates with a converged result or a cap-terminated stall surfaced for operator override — these are qualitatively different outcomes with different operator consequences.

An agent reading SC-004 as the acceptance test for the convergence loop might implement a cap-fires-then-auto-graduates path and still satisfy SC-004 as written, violating FR-013's explicit "MUST STOP and surface the stall for operator override" requirement on cap termination. SC-004 should distinguish the two termination modes to be a meaningful criterion.

A reasonable fix: revise SC-004 to "The bounded re-audit loop terminates on every fixture: converged fixtures reach graduation, cap-terminated fixtures surface an explicit stall for operator override and are not auto-graduated."

---

### AUDIT-20260622-07 — FR-026's dampener "govern invocations, not chunks" collides with the re-audit partial-round case: a partial re-audit round is neither a full invocation nor a chunk

Finding-ID: AUDIT-20260622-07
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    spec.md — FR-013, FR-026

FR-026 says "The N-quiet / consecutive-clean streak MUST count govern invocations, not chunks." FR-013 says graduation occurs when "the dampener clears the touched set." In the re-audit loop, each round re-audits only the touched subset of chunks. A round that audits only 2 of 10 chunks is not a full invocation (govern was invoked once but only 2 chunks were audited) and is not at the chunk granularity (it's a partial-invocation round). The spec doesn't define what constitutes a "quiet" round in the dampener when only a subset of chunks is re-audited: does a round count as quiet if all *re-audited* chunks are clean (even though others were not re-audited this round), or only if all chunks across the whole feature are simultaneously clean?

These two readings produce different dampener behaviors: reading (a) lets the dampener fire after N rounds where only a few chunks are re-audited and come back clean — accelerating graduation; reading (b) requires the whole feature's chunk set to be simultaneously clean for N consecutive invocations — which can never happen if some chunks are never re-audited (they were clean from round 0 and then just carried). The spec doesn't resolve this, and both readings are equally plausible for an unattended agent.

---

### AUDIT-20260622-08 — "Touched-set rounds" listed as a doctor/schema-covered artifact in FR-021 but not defined as a Key Entity

Finding-ID: AUDIT-20260622-08
Status:     open
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    spec.md — FR-021, Key Entities section

FR-021 lists "touched-set rounds" as one of the new on-disk artifacts that must be schema-validated and covered by a doctor rule. The Key Entities section defines Chunk, Cluster, Chunk manifest, Split-cluster marker, Touched set, Seam result, and Whole-feature convergence record — but not "touched-set rounds" as a discrete artifact. The "touched set" is defined (the set of chunks a round's fixes changed), but whether "touched-set rounds" is a per-round journal (one record per round), an accumulated log, or a snapshot is unspecified.

Without a Key Entities definition, an agent writing the schema/doctor rule for "touched-set rounds" has no spec-level contract to enforce — it must invent the schema shape. This makes SC-006 ("100% of seeded-corruption cases flagged") partially untestable because what constitutes a malformed touched-set-rounds artifact is undefined. The finding is low severity because it doesn't break the core mechanism, but it leaves a named artifact without a spec-level contract.

### AUDIT-20260622-09 — Settled open question still defers the non-TS coupling seam

Finding-ID: AUDIT-20260622-09
Status:     open
Severity:   low
Per-lane:   codex=low
Decision:   single-model (gate-counted low)
Surface:    plugins/stack-control/specs/030-chunked-end-govern/spec.md:286-288

OQ-1 is marked “SETTLED,” but the text says the per-adopter coupling-resolver seam is a “follow-on” and “not built now.” The audit prompt explicitly rejects deferral phrasing in the audited surface, and this is in the normative spec body.

The blast radius is low because FR-003 and the non-TS edge case already define the actual required behavior: ship the universal baseline without hard-blocking on language tooling. Still, the wording weakens the spec discipline. A clean fix is to remove the deferred commitment and state only the in-scope decision: non-TS coupling uses directory adjacency plus diff cross-reference, with no per-adopter resolver promised by this feature.

## 2026-06-22 — audit-barrage lift (20260622T222444716Z-031-opencode-support-after_clarify)

Code-sha: 16dc5475f47a46a91e477d873cd0866c549b8479
### AUDIT-20260622-10 — GOVERN_CHECKPOINT rejection stated as absolute in US2 but mode-scoped in FR-029; SC-002 "0 per-phase surfaces" contradicts both

Finding-ID: AUDIT-20260622-10 (claude-01 + codex-02; cross-model)
Status:     open
Severity:   high
Per-lane:   claude=high, codex=high
Decision:   agreement (gate-counted high)
Surface:    spec.md — US2 Acceptance Scenario 1; FR-029; SC-002

US2 AC1 reads: **"Given the shipped CLI, When a caller passes `--phase` or sets `GOVERN_CHECKPOINT`, Then it is rejected as an unknown flag/var (clean break — no legacy accept)."** The clause is unqualified — it says "the shipped CLI," not "implement mode." An agent building from US2 would implement a global rejection for all modes.

FR-029 then carves out an exception: **"GOVERN_CHECKPOINT / --checkpoint rejection MUST be implement-mode-scoped — spec mode retains its checkpoint-label selection; only implement mode rejects them."** That exception directly contradicts US2 AC1 as written, because AC1 does not say "for implement-mode callers." A builder who reads US2 first (the natural reading order) would reject GOVERN_CHECKPOINT globally and then find FR-029 appears to reverse that decision only for spec mode — two contradictory mandates that cannot both be implemented as written.

SC-002 adds a third contradiction layer: **"the count of per-phase surfaces (flags, artifacts, gate arms, doctor rules) remaining in the codebase is 0."** If GOVERN_CHECKPOINT is retained as a flag for spec mode per FR-029, the count is not 0. The spec must either: (a) clarify that SC-002's "per-phase flags" refers only to implement-mode per-phase flags (not all uses of GOVERN_CHECKPOINT) and update US2 AC1 to be mode-qualified, or (b) decide GOVERN_CHECKPOINT is fully removed from all modes and retract FR-029. As written, these three surfaces cannot all be simultaneously satisfied.

---

### AUDIT-20260622-11 — Graduate gate disposition for seam-pass findings is nowhere stated

Finding-ID: AUDIT-20260622-11
Status:     open
Severity:   high
Per-lane:   claude=high
Decision:   adjudicated (gate-counted high) — blast-radius=unstated, reachability=unstated, fix-debt=no; no down-calibration signal — high retained.
Surface:    spec.md — FR-014; US3; US6; US9 AC1; Key Entities (Seam result); SC-001

The spec describes the pipeline as `cluster → (audit → fix → re-audit)* bounded → seam → reconcile-once → one WholeFeatureConvergenceRecord`. The seam pass (FR-014) runs after the convergence loop and produces a "seam result" entity (listed in Key Entities and covered by FR-021 doctor/schema). However, the spec never states what the graduate gate does when the seam pass finds a substantive contract break:

- Does a seam finding block graduation?
- Is it folded into the reconcile-once step as an open finding and lifted per FR-016?
- Does the run enter another fix-and-re-audit round for seam findings?
- Is the seam result merely informational?

US6 AC2 says a finding "still present in the final clean/dampened round…is lifted" — but seam findings arise *after* the convergence loop, so they were never in any round. US9's pipeline diagram puts seam before reconcile-once, suggesting seam findings feed into reconcile; but whether a non-empty seam result prevents the whole-feature convergence record from being "converged" (for purposes of the graduate gate) is not stated anywhere. SC-001 promises "a graduation decision" always results, but if seam findings block graduation, that promise may conflict with SC-001's framing that the run always reaches a graduation decision. An unattended builder faces two equally plausible implementations: (a) seam findings are a hard blocker that must be fixed before graduation; (b) seam findings are lifted like any other finding and do not block graduation. These produce materially different user-visible outcomes; the spec must commit to one.

---

### AUDIT-20260622-12 — Determinism promise (FR-004) conflicts with environment-dependent TS import graph input (FR-003)

Finding-ID: AUDIT-20260622-12 (claude-03 + codex-01; cross-model)
Status:     open
Severity:   medium
Per-lane:   claude=medium, codex=high
Decision:   agreement (gate-counted medium)
Surface:    spec.md — FR-003; FR-004; US1 AC3

FR-004 makes an absolute determinism promise: **"the same committed diff over the same `governedSha`..HEAD endpoints MUST yield the same chunk set with stable chunk ids."** No environmental qualifier is attached.

FR-003 defines the coupling signal as: **"directory-adjacency + diff cross-references (language-agnostic), with the TypeScript import graph as an additional precision signal where available."** The phrase "where available" is the crack in the determinism promise: a developer machine with TypeScript tooling installed produces a more precise coupling graph than a CI runner where it is absent (or a PHP/Bash adopter as named in the edge cases). The same endpoints, the same committed diff — but different import-graph availability — yields different coupling clusters, different chunk ids, and breaks FR-004.

The spec should disambiguate: either (a) determinism is scoped to "same environment" (weakening FR-004), (b) the import graph is always present or always absent for a given project and its availability is itself pinned, or (c) the chunked id is computed only from the language-agnostic signal and the TS import graph only adjusts intra-chunk grouping without affecting chunk ids. As written, an unattended builder has no clear guidance and may implement the import graph as a best-effort probe that silently varies between runs, violating the determinism guarantee.

---

### AUDIT-20260622-13 — Termination condition ambiguity: US4 "empty touched set OR dampener clears" vs. FR-013 "dampener clears" as the sole criterion

Finding-ID: AUDIT-20260622-13
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    spec.md — US4 Acceptance Scenario 2; FR-013

US4 AC2 states: **"Given successive rounds, When the touched set becomes empty OR the dampener clears it, Then the run graduates."** FR-013 states: **"graduation occurs when the dampener clears the touched set."**

These are not self-evidently the same condition. FR-013 makes the dampener the sole criterion. US4 introduces a disjunction: either the touched set is empty (sufficient on its own), or the dampener clears it. An empty touched set means no fix touched any file — zero re-audit candidates — but the dampener's N-quiet / consecutive-clean streak window may not yet be satisfied. Under FR-013 alone, the run would wait for the dampener; under US4 AC2, it would graduate immediately on an empty touched set.

This matters for a specific scenario: a round produces findings, all are fixed, but the fixes touch zero additional files (no cascading effect). Touched set = empty. FR-013 says wait for the dampener; US4 AC2 says graduate. These are different user-visible behaviors. The spec must clarify whether "empty touched set" is a sufficient graduation condition that bypasses the dampener, or whether the dampener is always required and US4 AC2's "OR" is just loose phrasing for the same thing.

---

### AUDIT-20260622-14 — Seam-pass size constraint asserted with no backstop promise when it cannot be met

Finding-ID: AUDIT-20260622-14
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    spec.md — FR-014; FR-002; SC-001; Edge Cases

FR-014 asserts: **"the seam payload MUST fit the envelope."** For the main diff, FR-002 + FR-006 provide the backstop: partition into envelope-sized chunks and sub-split oversized clusters. The spec makes "never FATALs on size" (US1, SC-001) a P1 guarantee.

The seam pass has no analogous backstop. It audits "signatures + changed-function headers" for all cross-chunk and split-cluster boundaries in a single payload. For a feature that partitions into many chunks (exactly the scenario US1 addresses), the number of boundary signatures grows with the number of chunk boundaries. The spec asserts the constraint but provides no promise about what happens when the constraint cannot be met: does the run FATAL? Silently truncate signatures? Chunk the seam pass into multiple rounds? Since US1/SC-001 promise no size-based FATALs for the overall run, a silent FATAL inside the seam pass would violate that promise. The spec must either (a) commit to a bounded seam payload by construction (e.g., the seam only covers CHANGED signatures, and that set is bounded), (b) describe a sub-chunked seam pass, or (c) explicitly carve the seam out of the SC-001 no-FATAL guarantee and state what failure looks like. As written, the constraint is stated without a failure-mode promise, leaving an unattended builder to fabricate behavior for the over-envelope seam case.

---

### AUDIT-20260622-15 — Re-audit shrinkage is promised as both guaranteed and only backstopped

Finding-ID: AUDIT-20260622-15
Status:     open
Severity:   medium
Per-lane:   codex=medium
Decision:   single-model (gate-counted medium)
Surface:    plugins/stack-control/specs/030-chunked-end-govern/spec.md:95-105,222-223,269

US4 says the re-audit set shrinks each round, the independent test asserts it “monotonically shrinks across rounds,” and FR-013 says the touched set “MUST shrink toward empty.” The same FR then admits coupling cycles can prevent shrinkage and requires a hard max-round cap; FR-012 also requires coupling-correct expansion when a fix touches a file coupled into another chunk.

That makes the strict monotonic-shrink promise too strong. The intended behavior seems to be bounded convergence with a cap, not mathematically guaranteed shrinkage every round. As written, tests could enforce an impossible invariant and reject a correct cap-stop path. Reword the promise to require “not full-set unless coupling requires it, carries untouched chunks, terminates by empty/dampener/cap,” and reserve monotonic shrinkage for fixtures intentionally constructed to have no coupling expansion.
