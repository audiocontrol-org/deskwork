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

## 2026-06-23 — audit-barrage lift (20260623T002310145Z-031-opencode-support-after_clarify)

Code-sha: bde66b2f7ce4115c37d94fd37704685112c8eaf1
### AUDIT-20260623-01 — FR-010 contradicts FR-009 — npm installation path is incompatible with the mandatory load path

Finding-ID: AUDIT-20260623-01 (claude-01 + codex-02; cross-model)
Status:     open
Severity:   medium
Per-lane:   claude=high, codex=medium
Decision:   agreement (gate-counted medium)
Surface:    spec.md — FR-009; FR-010; US2 AC1

FR-009 states: "The plugin MUST load from `.opencode/plugins/stack-control.ts`." FR-010 states: "The plugin MUST support both local installation (copy plugin file) and npm installation." For a single `.ts` file plugin, there is no canonical npm installation behavior that satisfies FR-009's specific path requirement without an unspecified post-install step (e.g., a postinstall script that copies the file into `.opencode/plugins/`). The spec neither describes what the npm package contains nor how npm installation results in the file appearing at the FR-009 path.

An unattended builder has two roughly equally plausible readings: (a) the npm package uses a postinstall hook to place the file at the FR-009 path, or (b) npm installation places the file in `node_modules/` and the plugin path differs from FR-009. Under reading (b), FR-009 and FR-010 cannot both be satisfied. US2 AC1 — the primary acceptance scenario for installation — only describes the copy-file path, not npm installation, so the AC provides no disambiguation. The spec must either describe what "npm installation" means for a `.ts` single-file plugin (what is published, what lands where) or drop one of the two requirements.

---

### AUDIT-20260623-02 — "All stack-control skills" is undefined — builder must fabricate the skill set boundary

Finding-ID: AUDIT-20260623-02
Status:     open
Severity:   high
Per-lane:   claude=high
Decision:   single-model (gate-counted high)
Surface:    spec.md — FR-002; US4 AC3

FR-002 states: "The plugin MUST register all stack-control skills when loaded." US4 AC3 repeats this: "it registers all stack-control skills with opencode." Neither the FR nor the US defines what "all stack-control skills" means: is it the set of skills present at the time this plugin ships (a hardcoded list that silently rots as skills are added or renamed), or skills discovered dynamically at load time from some registry (an API or mechanism never mentioned in the spec)?

US1 AC1 names only `/stack-control:define` as an example — it is not an enumeration. The Key Entities section defines "Skill" as "a stack-control skill (e.g., `define`, `extend`, `execute`)" — also an open-ended example, not a complete list. An unattended builder must invent a boundary: hardcode a list (which breaks on future skill additions with no spec violation to catch it) or implement dynamic discovery (which requires an API surface never specified). The spec should either enumerate the skill set to register, commit to the discovery mechanism, or at minimum state whether new skills added after this feature ships are automatically included.

---

### AUDIT-20260623-03 — FR-004 — "skill arguments" is undefined; the argument surface is never specified

Finding-ID: AUDIT-20260623-03
Status:     open
Severity:   high
Per-lane:   claude=high
Decision:   single-model (gate-counted high)
Surface:    spec.md — FR-004; US1 AC2; US3 AC1

FR-004 states: "The plugin MUST forward skill arguments to the CLI as command arguments." This promise depends on a definition of "skill arguments" — what the user supplies when invoking a skill in opencode — that the spec never provides. The spec does not describe how arguments are passed in opencode's command system: are they typed inline after the slash command (`/stack-control:define my-feature-name`)? Are they prompted interactively via a series of opencode dialog turns? Are they structured data from the event payload?

US1 AC2 ("When the skill requires CLI operations, Then the plugin delegates to the local `stackctl` CLI") and US3 AC1 ("Then the plugin invokes `stackctl <command>` via the shell API") do not close the gap. The mapping from opencode's command invocation surface to `stackctl`'s argument interface is the core of FR-004, and it is completely absent. An unattended builder must fabricate this mapping, and fabrication here directly determines the user-visible invocation UX of every skill.

---

### AUDIT-20260623-04 — US5 AC3 contradicts the "no automated version sync" assumption

Finding-ID: AUDIT-20260623-04
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    spec.md — US5 AC3; Assumptions (version alignment)

US5 AC3 states: "Given user runs `stackctl --version`, When plugin version is available, Then both versions are displayed." The Assumptions section states: "Users will manually ensure plugin and CLI version alignment (no automated version sync)." `stackctl --version` is a CLI binary invocation — for it to display the plugin's version, the `stackctl` binary must have a channel to query the installed opencode plugin's version. That requires coordination the "no automated version sync" assumption appears to rule out.

The most natural reading of "user runs `stackctl --version`" is a direct terminal invocation of the CLI binary, not a stack-control skill routed through opencode. Under that reading, the `stackctl` binary would need to locate and read the plugin version — a mechanism with no spec basis. An alternative reading — that the AC means "when user invokes a version-reporting skill inside opencode" — is plausible but contradicted by the literal text. The spec should either clarify what surface US5 AC3 describes (CLI binary? opencode skill?) or remove the premise that both versions appear in a single CLI command output.

---

### AUDIT-20260623-05 — SC-002 "95%" success rate is unmeasurable — denominator and test protocol undefined

Finding-ID: AUDIT-20260623-05
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    spec.md — SC-002; Edge Cases

SC-002 states: "Plugin successfully delegates 95% of skill invocations to the CLI without errors." No measurement protocol is defined: no test harness, no reference workload, no definition of what counts as a "delegation error" versus a CLI-originated error versus a user/environment error (e.g., missing `stackctl`, bad arguments). The 95% floor implies a denominator — 95% of what? — that is never stated.

The Edge Cases section lists several failure scenarios (missing CLI, network timeouts, concurrent sessions, stackctl not in PATH) without specifying which count against the 5% tolerance and which are categorically excluded from the denominator. An unattended builder cannot verify SC-002 or know when an implementation satisfies it. The SC must either define the measurement protocol (workload, what counts as the denominator, what counts as a delegation failure) or be reworded as a qualitative goal rather than a measured threshold.

---

### AUDIT-20260623-06 — SC-004 "opencode versions 1.0 and later" is an unverifiable compatibility promise

Finding-ID: AUDIT-20260623-06
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    spec.md — SC-004; Assumptions (opencode plugin system)

SC-004 states: "Plugin works with opencode versions 1.0 and later." The spec never enumerates the opencode API surface the plugin depends on — the event system (`command.executed`), the session context, and the shell API (`$`) appear only in the Assumptions section as assumed-stable surfaces. Without specifying which opencode API contracts are the load-bearing dependencies, "versions 1.0 and later" cannot be verified: any future opencode version could change the event schema or shell API, silently breaking the plugin while SC-004 claims compatibility.

This matters especially because US4 AC1 references `command.executed` as a specific event name and schema. If opencode renames or restructures that event in a point release, the plugin breaks but the spec never identified the dependency as load-bearing. The spec should either enumerate the specific API contracts the plugin relies on (and assert they are stable across 1.x), or scope SC-004 to "opencode version X.Y.Z as of this feature's implementation" rather than making an open-ended forward-compatibility claim.

---

### AUDIT-20260623-07 — Edge case "stackctl installed but not in PATH" is listed but has no FR or acceptance scenario

Finding-ID: AUDIT-20260623-07
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    spec.md — Edge Cases; FR-007; US3 AC2

The Edge Cases section explicitly raises: "What if `stackctl` CLI is installed globally but not in PATH?" This is a distinct failure mode from `stackctl` not being installed at all. FR-007 covers "not found" with a clear error message. US3 AC2 states "Given `stackctl` is not installed, When plugin tries to execute a command, Then the plugin reports a clear error." Neither clause commits to what happens in the "installed but not in PATH" case — a situation where the binary exists on disk, can be located if you know where to look, but is not reachable via standard `PATH` resolution.

A user in this situation would receive a generic "not found" error (if FR-007's message is unhelpful) when the real fix is a `PATH` configuration step. The spec either needs a separate FR covering this case with a diagnostic-quality error message (e.g., "stackctl is not in your PATH — ensure the directory containing stackctl is exported"), or must explicitly state it is subsumed under FR-007 and the "clear error" there is defined to cover path-resolution advice.

---

### AUDIT-20260623-08 — "Shell API" in FR-003 is not defined in Key Entities — ambiguous execution primitive

Finding-ID: AUDIT-20260623-08
Status:     open
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    spec.md — FR-003; Key Entities; Assumptions

FR-003 requires CLI delegation "via the shell API." The Assumptions section parenthetically notes `($)` as the shell API symbol, but "Shell API" does not appear in Key Entities alongside Plugin, Skill, CLI, and Session. If opencode exposes multiple subprocess execution mechanisms (e.g., a streaming shell API vs. a synchronous one, or different privilege contexts), the choice between them affects how FR-005 (capture CLI output) and FR-006 (handle non-zero exit codes) are satisfied.

This is hygiene-level as an unattended builder can likely find the correct API from opencode's documentation. However, the Key Entities section defines the spec's vocabulary, and leaving the execution primitive undefined there while referencing it in a functional requirement is an internal inconsistency. Adding "Shell API: opencode's subprocess execution interface (`$`)" to Key Entities would close the gap at no cost.

### AUDIT-20260623-09 — Command surface for `/speckit-*` is promised but not registered

Finding-ID: AUDIT-20260623-09
Status:     open
Severity:   high
Per-lane:   codex=high
Decision:   single-model (gate-counted high)
Surface:    `plugins/stack-control/specs/031-opencode-support/spec.md:23-25`, `plugins/stack-control/specs/031-opencode-support/spec.md:71-73`, `plugins/stack-control/specs/031-opencode-support/spec.md:112`

US1 promises that users can run `/speckit-*` commands through the skill and those commands execute in the installation context, but US4 and FR-008 only require routing commands that start with `/stack-control:`. Those are two different command namespaces. An unattended builder following FR-008 could implement only `/stack-control:*` dispatch and still believe the requirements are satisfied, while US1’s spec-authoring flow fails when it reaches `/speckit-*`.

The blast radius is high because this affects the core P1 workflow: `/stack-control:define` begins a chain that explicitly depends on `/speckit-*` commands. The spec should state whether `/speckit-*` is a first-class registered opencode command namespace, an internal delegation target hidden behind `/stack-control:*`, or out of scope.

### AUDIT-20260623-10 — Version reporting assigns plugin behavior to `stackctl --version`

Finding-ID: AUDIT-20260623-10
Status:     open
Severity:   medium
Per-lane:   codex=medium
Decision:   single-model (gate-counted medium)
Surface:    `plugins/stack-control/specs/031-opencode-support/spec.md:87-89`, `plugins/stack-control/specs/031-opencode-support/spec.md:115-116`, `plugins/stack-control/specs/031-opencode-support/spec.md:146`

US5 AC3 says that when the user runs `stackctl --version`, both CLI and plugin versions are displayed. But the feature scope is an opencode plugin delegating to `stackctl`, while FR-011/FR-012 only require the plugin to report its own version and warn on mismatch. The assumptions also say users manually ensure version alignment, with no automated version sync.

As written, this can be read as requiring a change to the `stackctl` CLI version command, or as requiring the plugin to display both versions inside opencode. Those are materially different promises. The blast radius is medium: version checks are P3, but an unattended builder could modify the wrong surface or omit the AC3 behavior entirely.

## 2026-06-23 — audit-barrage lift (20260623T002534664Z-031-opencode-support-after_clarify)

Code-sha: bde66b2f7ce4115c37d94fd37704685112c8eaf1
### AUDIT-20260623-11 — FR-009 and FR-010 state mutually exclusive installation paths

Finding-ID: AUDIT-20260623-11 (claude-01 + claude-08 + codex-03; cross-model)
Status:     open
Severity:   medium
Per-lane:   claude=high, codex=medium
Decision:   agreement (gate-counted medium)
Surface:    spec.md — FR-009; FR-010

FR-009 states: "The plugin MUST load from `.opencode/plugins/stack-control.ts`." FR-010 states: "The plugin MUST support both local installation (copy plugin file) and npm installation." These requirements cannot both be true simultaneously. npm installation places a module in `node_modules/` (or a global npm prefix), not in `.opencode/plugins/stack-control.ts`. An unattended agent building to both requirements faces an irreconcilable contradiction: it cannot place the plugin at a fixed path in `.opencode/plugins/` and also load it from wherever npm puts it. The two readings are roughly equally plausible — a builder might interpret FR-009 as "this is where users put it manually" and FR-010 as "npm also works somehow" — but the spec gives no guidance on how opencode discovers npm-installed plugins versus file-based plugins, nor how these two paths relate. Either FR-009 needs to be scoped to the "local copy" path only (and npm installation needs its own load-path description), or FR-010's "npm installation" needs to explain how the module ends up at the FR-009 path. As written, an agent implementing both FRs will fabricate a resolution that may contradict the intended architecture.

---

### AUDIT-20260623-12 — "All stack-control skills" in FR-002 is undefined — no canonical list

Finding-ID: AUDIT-20260623-12 (claude-02 + codex-02; cross-model)
Status:     open
Severity:   high
Per-lane:   claude=high, codex=high
Decision:   agreement (gate-counted high)
Surface:    spec.md — FR-002; US4 AC3

FR-002 states: "The plugin MUST register all stack-control skills when loaded." US4 AC3 echoes this: "it registers all stack-control skills with opencode." Neither the spec nor any referenced artifact defines the canonical set of skills. An unattended agent building to this requirement has three equally plausible resolutions: (1) hardcode a list it infers from the skill names mentioned in the spec (e.g., `define`, `extend`, `execute`, `plan`); (2) dynamically introspect the local stack-control installation for available skills; (3) query the `stackctl` CLI for its skill manifest. All three produce different runtime behavior. The spec does not commit to which approach is intended or what the list comprises. If a new skill is added to stack-control after the plugin ships, reading (1) silently misses it; readings (2) and (3) require mechanisms the spec never promises. A wrong implementation of "all" is invisible until a user invokes a skill that isn't registered. The spec should either enumerate the skill set explicitly or state the discovery mechanism as a promise.

---

### AUDIT-20260623-13 — US5 AC3 describes behavior architecturally impossible for the CLI

Finding-ID: AUDIT-20260623-13
Status:     open
Severity:   high
Per-lane:   claude=high
Decision:   single-model (gate-counted high)
Surface:    spec.md — US5 AC3; FR-011; FR-012

US5 AC3 states: "Given user runs `stackctl --version`, When plugin version is available, Then both versions are displayed." This acceptance scenario requires the `stackctl` CLI to display the opencode plugin's version. The CLI has no architectural visibility into which opencode plugin file the user has installed, where it is, or what version it carries. The plugin is a file in `.opencode/plugins/` (per FR-009); the CLI is an independent binary. There is no plausible mechanism by which `stackctl --version` would report a plugin version without either (a) the CLI querying a registry of installed plugins (no such registry is defined in the spec), or (b) the plugin intercepting the CLI invocation (no such interception mechanism is promised). An agent building to this acceptance scenario will either fabricate a mechanism that doesn't exist or silently skip it. FR-011 ("the plugin MUST report its version when queried") and FR-012 ("warn when plugin version doesn't match CLI version") describe a sensible version-awareness model in the opposite direction (the plugin knows the CLI version), making AC3's inversion a plausible spec confusion. The scenario should be corrected to describe the plugin reporting its own version, with the CLI version obtained by running `stackctl --version` separately.

---

### AUDIT-20260623-14 — US1 AC3 introduces `/speckit-*` command routing with no backing FR

Finding-ID: AUDIT-20260623-14
Status:     open
Severity:   high
Per-lane:   claude=high
Decision:   single-model (gate-counted high)
Surface:    spec.md — US1 AC3; FR-008

US1 AC3 states: "Given user is in an opencode session, When they run `/speckit-*` commands through the skill, Then those commands execute in the installation context." FR-008, the only routing requirement, states: "The plugin MUST map `/stack-control:` prefixed commands to the appropriate skill." FR-008 has no analogous requirement for `/speckit-*` prefixed commands. An agent building to the FR set would implement `/stack-control:` routing and consider the routing requirement satisfied. US1 AC3 would then fail: `/speckit-*` commands would not be routed by the plugin. The spec never explains what a `/speckit-*` command is, whether it maps to the same CLI delegation model as `/stack-control:` commands, or how the plugin would discover which `/speckit-*` commands exist. This is a silent gap between the acceptance scenario and the requirements: the scenario promises a capability the requirements do not require. A builder working from the FRs alone will ship a plugin that passes all FR-level tests and fails US1 AC3 at system test.

---

### AUDIT-20260623-15 — SC-005 directly contradicts the CLI prerequisite

Finding-ID: AUDIT-20260623-15
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    spec.md — SC-005; FR-007; US3 AC2; Assumptions

SC-005 states: "Plugin loads successfully in opencode without requiring additional configuration." The Assumptions section states: "Users have `stackctl` CLI installed and available in their PATH." FR-007 and US3 AC2 describe the error path when `stackctl` is not found — implying that `stackctl` must be pre-installed for the plugin to function. Installing `stackctl` is additional configuration. A user who copies the plugin file (per US2 AC1) and restarts opencode (SC-005's implied baseline) has not yet installed `stackctl`; the plugin loads but fails immediately on first skill invocation with the FR-007 error. The spec cannot simultaneously promise "no additional configuration" (SC-005) and require a separate CLI installation (Assumptions). A reasonable consumer would resolve this as SC-005 referring only to plugin-side configuration (no config file, no env vars, etc.), but that resolution is not stated — the guarantee as written is misleading. The spec should narrow SC-005 to "plugin-side configuration" explicitly and acknowledge CLI installation as a prerequisite outside the 5-minute SC-001 window.

---

### AUDIT-20260623-16 — SC-002 "95% of skill invocations without errors" is unmeasurable as stated

Finding-ID: AUDIT-20260623-16
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    spec.md — SC-002

SC-002 states: "Plugin successfully delegates 95% of skill invocations to the CLI without errors." No testing methodology, sample population, measurement context, or definition of "error" is provided. A passing implementation could trivially satisfy this by only registering 20 skills and ensuring 19 of them have no error paths exercised. A failing implementation could be reported as passing if the measurement window excludes edge-case invocations. "Without errors" is undefined: does it mean non-zero CLI exit codes? Plugin-side exceptions? User-visible error messages? The 95% threshold implies a tolerated 5% failure rate, but the spec does not state what failure modes are acceptable, which means the 5% cannot be reasoned about at implementation time. This criterion is not independently testable and provides no actionable gate. It should be replaced with a concrete, bounded assertion (e.g., "all CLI delegation paths in the test suite exit without uncaught exceptions") or removed.

---

### AUDIT-20260623-17 — Blocking assumption about opencode's event API has no mitigation

Finding-ID: AUDIT-20260623-17
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    spec.md — Assumptions; US4 AC1

US4 AC1 states: "Given opencode fires a `command.executed` event, When the command starts with `/stack-control:`, Then the plugin routes it to the appropriate skill." The Assumptions section lists: "The opencode plugin system supports the event hooks needed (command.executed, session events)." This assumption is structurally blocking: if opencode's actual event API uses a different name or shape for command events, the entire routing model (US4, FR-008) collapses. No fallback, no verification step, and no reference to opencode's published API is provided. The spec names a specific event string (`command.executed`) as a factual commitment inside an acceptance scenario — an agent building to this will hardcode a listener for exactly this event name. If opencode's plugin documentation uses a different event name (e.g., `command:execute` or `onCommand`), the plugin will silently never route anything. The spec should either reference the opencode plugin API document as the authoritative source for event names (and not pre-commit to a specific name in AC1), or confirm the event name via the opencode API and state it as a verified fact, not an assumption. The current form buries a blocking integration dependency inside "Assumptions" while committing to a specific API surface in the acceptance scenario.

---

### AUDIT-20260623-18 — `/speckit-*` invocation is promised but never mapped

Finding-ID: AUDIT-20260623-18
Status:     open
Severity:   high
Per-lane:   codex=high
Decision:   single-model (gate-counted high)
Surface:    plugins/stack-control/specs/031-opencode-support/spec.md:23-25,71-73,112

US1 acceptance scenario 3 promises that users can run `/speckit-*` commands “through the skill” and have them execute in the installation context. But US4 and FR-008 only define routing for commands starting with `/stack-control:`. There is no matching requirement for `/speckit-*` command registration, routing, aliasing, or rejection.

This is a high-blast-radius ambiguity because an unattended builder following the requirements will likely implement only `/stack-control:` dispatch and still believe FR-008 is satisfied, while a user following US1 will expect `/speckit-*` commands to work. The spec should state whether `/speckit-*` commands are first-class opencode commands, aliases under `/stack-control:`, or intentionally unavailable except inside the prose flow of a stack-control skill.

### AUDIT-20260623-19 — Version check is assigned to both plugin and CLI in incompatible ways

Finding-ID: AUDIT-20260623-19
Status:     open
Severity:   medium
Per-lane:   codex=medium
Decision:   single-model (gate-counted medium)
Surface:    plugins/stack-control/specs/031-opencode-support/spec.md:77-89,115-116,146

US5 says users can verify plugin/CLI version alignment, FR-011 says the plugin reports its version, and FR-012 says the plugin warns when versions differ. But acceptance scenario 3 says that when the user runs `stackctl --version`, “both versions are displayed.” That assigns plugin-version reporting to the CLI command, while the surrounding requirements frame version reporting as plugin behavior. The assumptions also say users manually ensure alignment with no automated version sync.

The likely intended behavior is clear enough that this is medium rather than high, but an unattended builder could implement only plugin-side warning and never alter `stackctl --version`, leaving AC3 unmet; or alter CLI version output even though the feature is scoped as an opencode plugin. The spec should choose the user-visible version surface: plugin command/query, CLI output, or both.

## 2026-06-23 — audit-barrage lift (20260623T010819772Z-031-opencode-support-after_clarify)

Code-sha: bc7740778f698245a85b2d376c68d73f347f969a
### AUDIT-20260623-20 — FR-010 "npm installation" is undefined and irreconcilable with the single-file loading model

Finding-ID: AUDIT-20260623-20 (claude-01 + codex-02; cross-model)
Status:     open
Severity:   high
Per-lane:   claude=high, codex=high
Decision:   agreement (gate-counted high)
Surface:    spec.md — FR-009, FR-010, Assumptions (last two bullets), Clarifications

FR-009 states the plugin MUST load from `.opencode/plugins/stack-control.ts`. The Assumptions commit to a single-file design (`opencode-plugin.ts`) installed per-project. The Clarifications confirm "Single file (`opencode-plugin.ts`)". FR-010 then adds a MUST requirement that the plugin support "npm installation" alongside the local-copy path — but npm packages install into `node_modules/`, not into `.opencode/plugins/`. The spec never bridges these two facts.

An unattended builder reading FR-010 faces two roughly-equally-plausible builds: (a) publish to npm, write a `postinstall` script that copies the plugin file to `.opencode/plugins/stack-control.ts` in the CWD — but this requires knowing whether `postinstall` has access to the project root, and it ties installation to `npm install` in a project's CWD; or (b) publish a module that can be `import`ed from inside `.opencode/plugins/stack-control.ts`, making the user-written plugin file a thin re-export — which is no longer a single file and contradicts the Assumptions. Both readings lead to substantively different implementations, and the wrong one is just as easy to reach as the right one.

The fix is to either remove "npm installation" from FR-010 if the single-file copy model is the intended delivery, or to add a requirement that states exactly how npm installation interacts with FR-009's loading path.

---

### AUDIT-20260623-21 — FR-001: The opencode plugin API signature is never stated or referenced

Finding-ID: AUDIT-20260623-21
Status:     open
Severity:   high
Per-lane:   claude=high
Decision:   adjudicated (gate-counted high) — blast-radius=unstated, reachability=unstated, fix-debt=no; no down-calibration signal — high retained.
Surface:    spec.md — FR-001, US2 AC2, Assumptions ("Opencode's shell API (`$`) provides sufficient functionality")

FR-001 states the plugin MUST "export a function following opencode's plugin API signature" — but the spec never states what that signature is and never references opencode's documentation as the authoritative source. US2 AC2 says the plugin "exports the plugin function following opencode's plugin API" without elaborating. The Assumptions mention the `$` shell API by name but give no citation or description of it.

An unattended builder reading this spec cannot produce a compliant plugin without consulting opencode documentation that the spec never links. This is functionally the same failure mode AUDIT-20260623-17 identified for the `command.executed` event name, but at a higher level: the entire export contract (function signature, return type, registration mechanism) is unspecified. An agent building to this will either guess, produce an import for `$` that doesn't exist at that path, or export the wrong shape entirely — and nothing in the spec corrects the wrong guess. AUDIT-20260623-17 covers the event name; this finding covers the plugin API shape, which is the load-bearing contract for FR-001 through FR-005.

The fix is to add a normative reference to opencode's plugin API documentation, quote the expected function signature, and confirm that `$` is the correct shell API identifier and import path — or explicitly state that the builder must derive these from the opencode docs before implementing.

---

### AUDIT-20260623-22 — Edge Cases section poses unanswered questions — unattended builder fills in all decisions unilaterally

Finding-ID: AUDIT-20260623-22
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    spec.md — Edge Cases section

The Edge Cases section lists five open questions about behavior the plugin must exhibit, but commits to answers for none of them. Among these, two carry real implementation consequence:

"What if the user has multiple opencode sessions running simultaneously?" — if two sessions both invoke `stackctl govern` against the same project simultaneously, there are file-system and output-ordering race conditions. The spec must state whether concurrent invocations are in scope (and if so, how the plugin isolates them) or explicitly out of scope (and what the user sees when they try).

"What happens if `stackctl` CLI is installed globally but not in PATH?" — the Assumptions say "Users have `stackctl` CLI installed and available in their PATH (or opencode has access to it via shell)," which makes "not in PATH" an out-of-scope assumption violation. Yet the Edge Cases section re-opens this as a question, contradicting the Assumptions. An unattended builder reading both sections will not know whether to handle this case or reject it.

The other three questions (session ends mid-skill, network/FS errors, CLI errors) have partial FR coverage (FR-006 covers non-zero exit codes) but no full decision. A spec that lists open questions without closing them hands every decision to the builder. The fix is to answer each question — even if the answer is "this is explicitly unsupported and the user receives FR-007's missing-CLI error" — so a builder has a commitment to implement against.

---

### AUDIT-20260623-23 — FR-002 "all stack-control skills" is undefined — no enumeration or discovery mechanism stated

Finding-ID: AUDIT-20260623-23 (claude-04 + codex-01; cross-model)
Status:     open
Severity:   medium
Per-lane:   claude=medium, codex=high
Decision:   agreement (gate-counted medium)
Surface:    spec.md — FR-002, US2 AC3, US4 AC3

FR-002 states the plugin MUST "register all stack-control skills when loaded." US2 AC3 says "any stack-control skill" is available in the command menu. US4 AC3 says the plugin "registers all stack-control skills." But the spec never defines what "all skills" means: it doesn't enumerate them, doesn't reference the plugin's `skills/` directory, and doesn't say whether the set is static (fixed at build time) or dynamic (discovered at load time from whatever skills exist in the installation).

Two divergent builds follow: (a) the builder hardcodes the list of skills known at the time of writing (currently: `define`, `execute`, `extend`, `speckit-guard`); or (b) the builder reads the skills directory at load time to discover the set dynamically. These differ in behavior whenever stack-control adds or removes a skill. If (a), a future new skill silently doesn't appear in opencode until the opencode plugin is manually updated. If (b), the loading mechanism must be specified. The spec's "all" implies (b) but describes nothing that enables it.

The fix is to either enumerate the skills the plugin registers (documenting the static list) or add a requirement that the plugin discovers skills dynamically by reading the installation's `skills/` directory — and add a success criterion that a newly-added skill appears in opencode without a plugin update.

---

### AUDIT-20260623-24 — SC-002 "95% success rate" is unmeasurable and implies an acceptable failure mode that conflicts with FR-006

Finding-ID: AUDIT-20260623-24 (claude-05 + codex-03; cross-model)
Status:     open
Severity:   medium
Per-lane:   claude=medium, codex=medium
Decision:   agreement (gate-counted medium)
Surface:    spec.md — SC-002, FR-006

SC-002 states: "Plugin successfully delegates 95% of skill invocations to the CLI without errors." This is unmeasurable for two reasons. First, there is no defined population of "skill invocations" to sample over — the criterion could pass with a single successful invocation (100% ≥ 95%) and fail with two invocations where one errors (50% < 95%). Second, the threshold implies a 5% tolerated failure rate for the plugin's core delegation function. For a thin forwarding layer (plugin invokes CLI, captures output, returns it), the correct bar is 100%: the delegation either works or it doesn't, and failures are FR-006's handled error path, not a statistical tolerance.

The "without errors" qualifier further conflicts with FR-006, which explicitly requires the plugin to handle CLI errors (non-zero exit codes). A CLI error is a legitimate outcome — FR-006 says the plugin MUST handle it and return it to opencode. That handling is success, not failure. SC-002 as written cannot distinguish between a delegation failure (plugin crashed, output lost) and a CLI error that FR-006 requires the plugin to surface correctly.

The fix is to replace SC-002 with a binary criterion: "Plugin correctly delegates skill invocations to the CLI, captures both successful output and non-zero-exit errors per FR-006, and returns them to opencode" — testable by running a skill against a functioning CLI and against a CLI that returns non-zero, verifying both are handled.

---

### AUDIT-20260623-25 — SC-004 forward-compatibility promise has no corresponding requirement or mechanism

Finding-ID: AUDIT-20260623-25 (claude-06 + codex-04; cross-model)
Status:     open
Severity:   low
Per-lane:   claude=low, codex=medium
Decision:   agreement (gate-counted low)
Surface:    spec.md — SC-004, FR-001

SC-004 states "Plugin works with opencode versions 1.0 and later." No FR constrains which opencode APIs the plugin may use, no requirement says the plugin must declare a minimum opencode version, and no requirement says the plugin must handle API changes between opencode versions. If opencode changes its plugin API between 1.0 and 2.0 (e.g., renames the function signature shape, removes `$`, changes the event system), SC-004 becomes false but no FR would be violated.

This is a commitment without a mechanism: the spec cannot verify SC-004 against its own requirements. A builder cannot know, from the FRs alone, how to ensure forward compatibility — whether that means using only a stable/documented API subset, adding feature-detection at load time, or declaring `engines: { opencode: ">=1.0" }` in a manifest. As a low-severity finding, this is a hygiene issue rather than a build-blocking ambiguity, but a tester verifying SC-004 has nothing in the FRs to test against.

## 2026-06-23 — audit-barrage lift (20260623T011050650Z-031-opencode-support-after_clarify)

Code-sha: bc7740778f698245a85b2d376c68d73f347f969a
### AUDIT-20260623-26 — FR-009 and FR-010 contradict each other on the plugin load path

Finding-ID: AUDIT-20260623-26
Status:     open
Severity:   high
Per-lane:   claude=high
Decision:   single-model (gate-counted high)
Surface:    spec.md — FR-009, FR-010

FR-009 states: "The plugin MUST load from `.opencode/plugins/stack-control.ts`." FR-010 states: "The plugin MUST support both local installation (copy plugin file) and npm installation." These two requirements cannot hold simultaneously as written. When a plugin is installed via npm, it resolves to a path inside `node_modules/`, not to `.opencode/plugins/stack-control.ts`. For both to be true, the spec would need to commit to one of: (a) npm installation is defined as "npm downloads a file and places it at the `.opencode/plugins/` path," or (b) FR-009's load path is only the canonical location for the local-copy flow, and npm installation produces a different load path. Neither interpretation is stated.

An unattended builder reading FR-009 will hardcode `.opencode/plugins/stack-control.ts` as the load location and have no definition of what an npm install looks like. The builder reading FR-010 will add npm support but cannot know what path opencode will load the plugin from post-npm-install. One of these requirements will be dropped or silently violated. The spec must either eliminate one installation path from scope, or define both load paths and the conditions that select between them.

---

### AUDIT-20260623-27 — FR-002 promises to register "all stack-control skills" but never enumerates or bounds the set

Finding-ID: AUDIT-20260623-27 (claude-02 + codex-01; cross-model)
Status:     open
Severity:   high
Per-lane:   claude=high, codex=high
Decision:   agreement (gate-counted high)
Surface:    spec.md — FR-002, US2 AC3

FR-002: "The plugin MUST register all stack-control skills when loaded." US2 AC3: "Given plugin is loaded, When user types any stack-control skill, Then the skill is available in the command menu." Neither the requirement nor the acceptance scenario defines what the complete set of stack-control skills is. The set is open-ended: stack-control adds new skills over time. The requirement "all" is a moving target with no enumeration and no discovery mechanism specified.

An unattended builder will face two equally plausible implementations: (a) hard-code the list of known skills at time of writing (which silently excludes future skills), or (b) attempt to auto-discover skills dynamically (with no discovery mechanism defined in the spec). Both readings are plausible; neither is the spec's stated intent. The spec must either enumerate the required set of skills explicitly, define how the plugin discovers the set at runtime, or scope the requirement to a named subset (e.g., the skills listed in the roadmap's current milestone).

---

### AUDIT-20260623-28 — FR-008 promises to route commands to "the appropriate skill" but never defines the mapping

Finding-ID: AUDIT-20260623-28
Status:     open
Severity:   high
Per-lane:   claude=high
Decision:   single-model (gate-counted high)
Surface:    spec.md — FR-008, US4 AC1

FR-008: "The plugin MUST map `/stack-control:` prefixed commands to the appropriate skill." "Appropriate" is undefined. The spec provides no routing table, no naming convention that would allow a builder to derive the mapping, and no canonical source-of-truth reference. US4 AC1's acceptance scenario says "the plugin routes it to the appropriate skill" using the same undefined word.

An unattended builder has no way to implement or test this requirement. The most natural reading — that `/stack-control:define` maps to the `define` skill, `/stack-control:execute` maps to the `execute` skill, and so on by the suffix after the colon — may be the intent, but if that convention exists it must be stated. Any skill whose name contains a colon, a namespace, or a multi-word slug would break this naive mapping immediately. The spec must state the mapping rule explicitly (or reference the source that defines it), so the requirement is falsifiable.

---

### AUDIT-20260623-29 — FR-005 "capture CLI output and return it" conflicts with SC-003's first-output latency for long-running skills

Finding-ID: AUDIT-20260623-29
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    spec.md — FR-005, SC-003

FR-005: "The plugin MUST capture CLI output and return it to opencode." "Capture and return" describes a buffered model: collect all output, then deliver it. SC-003: "Skill invocation latency (from typing command to first output) is under 2 seconds for local CLI." "First output" implies a streaming model: the user sees partial output before the skill completes.

For any stack-control skill that runs longer than two seconds end-to-end (e.g., `define` driving a multi-step spec authoring chain, `execute` driving a phased implementation), a buffered implementation of FR-005 cannot satisfy SC-003. The spec makes both promises without acknowledging the conflict. An unattended builder who implements FR-005 faithfully (capture-then-return) will fail SC-003 on any long-running skill. The spec must choose: buffer (and adjust SC-003 to measure total latency, or restrict it to skills with known short runtimes), or stream (and reword FR-005 to say "stream CLI output incrementally").

---

### AUDIT-20260623-30 — Edge cases section lists five open questions with no disposition

Finding-ID: AUDIT-20260623-30
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    spec.md — Edge Cases section

The Edge Cases section lists five unresolved behavioral questions:
1. Session ends during a long-running skill
2. Non-zero exit codes from the CLI
3. Multiple simultaneous opencode sessions
4. Network timeouts or file system errors
5. `stackctl` installed globally but not in PATH

None of these has a stated disposition — no "in scope," "out of scope," "handled by FR-XXX," or "deferred with justification." An unattended builder reads this section as an open question list and must guess: are these in scope (requiring implementation), or acknowledged known unknowns (requiring nothing)? The most dangerous reading is #2 (non-zero exit codes), which is also partially addressed by FR-006 — but the edge case question is whether FR-006 fully covers it. The ambiguity invites the builder to either over-implement (inventing behavior for all five) or under-implement (treating them as implicitly out of scope). The spec must either close each edge case by pointing to the FR that covers it, or explicitly mark each as out of scope with the reason.

---

### AUDIT-20260623-31 — SC-001 measures a 5-minute install-to-invoke time but omits `stackctl` as a stated prerequisite

Finding-ID: AUDIT-20260623-31
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    spec.md — SC-001, US3 AC2, Assumptions

SC-001: "Users can install the stack-control plugin and invoke `/stack-control:define` within 5 minutes of first opening opencode." Invoking any skill requires `stackctl` CLI to be installed (US3 AC2, FR-007, FR-003 all establish this dependency). The Assumptions section mentions this, but SC-001 does not state it as a precondition. The 5-minute window thus either (a) includes `stackctl` installation — which on a fresh machine with no prior install is well over 5 minutes — or (b) assumes `stackctl` is already installed, making the SC untestable from a clean state without first satisfying an unstated prerequisite.

A verifier testing SC-001 against a literal reading has no way to know which interpretation is intended. If the intent is (b), the SC must say "given `stackctl` is already installed and in PATH." If the intent is (a), the 5-minute bound needs revision or a definition of the test environment.

---

### AUDIT-20260623-32 — SC-002 "95% of skill invocations" is unmeasurable — no test corpus or error taxonomy defined

Finding-ID: AUDIT-20260623-32
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    spec.md — SC-002

SC-002: "Plugin successfully delegates 95% of skill invocations to the CLI without errors." This success criterion contains no: (a) definition of the reference set of invocations over which 95% is measured, (b) categorization of what counts as "without errors" vs. an expected CLI failure (e.g., a user invoking `define` with invalid arguments), or (c) measurement procedure for collecting the sample. Without these, no one can determine whether SC-002 is met.

Additionally, the 5% implicit failure budget is unusual for a delegation path. A plugin that drops 1 in 20 invocations silently would be a serious defect; a plugin that correctly surfaces CLI errors on 5% of calls is working as designed. These two outcomes are indistinguishable under the current wording. The spec should either replace SC-002 with a falsifiable criterion (e.g., "zero silent failures — all CLI errors are surfaced to the user") or define the corpus and measurement method that makes 95% a testable threshold.

---

### AUDIT-20260623-33 — Opencode `$` shell API is assumed to exist but is named in an assumption, not verified — creating a second blocking integration dependency

Finding-ID: AUDIT-20260623-33
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    spec.md — Assumptions (shell API bullet), FR-003

The Assumptions section states: "Opencode's shell API (`$`) provides sufficient functionality for CLI invocation." FR-003 then commits to this: "The plugin MUST delegate skill execution to the `stackctl` CLI via the shell API." The `$` tagged-template-literal shell API is named as a specific symbol — it appears in libraries like `bun:shell` and some process-execution utilities, but it is not a universal JavaScript convention. The spec treats this as a known-good integration point while explicitly labeling it as an assumption.

Unlike AUDIT-20260623-17 (which covers the `command.executed` event routing assumption), this is a second, independent blocking assumption: if opencode does not expose a `$` shell API, or exposes shell execution under a different name or shape, FR-003 cannot be satisfied as written. The spec should verify the opencode shell execution API name and shape from opencode's published documentation before committing to it in FR-003, or state the verification evidence. Leaving it as an unverified assumption with "sufficient" as the adequacy criterion (also undefined) means an unattended builder may discover the API mismatch only at integration time.

### AUDIT-20260623-34 — Local copy install and npm install are both required, but only one load path is promised

Finding-ID: AUDIT-20260623-34
Status:     open
Severity:   medium
Per-lane:   codex=medium
Decision:   single-model (gate-counted medium)
Surface:    `plugins/stack-control/specs/031-opencode-support/spec.md:31-40,113-114,139-150`

US2 defines installation as copying `opencode-plugin.ts` to `.opencode/plugins/stack-control.ts` (lines 31-40), FR-009 requires loading from that exact project path (line 113), and the clarification/assumption section repeats that the plugin is a single file rather than a module directory (lines 139, 150). FR-010 then requires “both local installation (copy plugin file) and npm installation” (line 114), but the spec never states what npm installation means for an opencode plugin or whether npm install must still result in the `.opencode/plugins/stack-control.ts` file.

This is medium because the likely intended behavior is local copy first, but a builder could satisfy FR-010 by publishing a package that opencode cannot load, or by creating a package-based load path that conflicts with the single-file/per-project promise. The spec should choose the user-visible npm installation contract: package provides the same copyable file, package installs/links the opencode plugin path, or npm support is out of scope for this feature.

### AUDIT-20260623-35 — Delegation success metric is not testable as written

Finding-ID: AUDIT-20260623-35
Status:     open
Severity:   medium
Per-lane:   codex=medium
Decision:   single-model (gate-counted medium)
Surface:    `plugins/stack-control/specs/031-opencode-support/spec.md:107-112,129-131`

SC-002 says “Plugin successfully delegates 95% of skill invocations to the CLI without errors” (line 130), while FR-006 and FR-007 explicitly require handling CLI errors and missing CLI cases (lines 110-111). The success criterion does not define the denominator for “skill invocations,” whether user/CLI failures count against the plugin, or how many invocations are needed for the percentage to be meaningful.

The blast radius is medium: this will not necessarily break the plugin, but it gives builders and reviewers no stable pass/fail condition. One implementation can claim success by excluding CLI failures from the metric, while another can fail the criterion because valid CLI rejections count as errors. The spec should restate SC-002 as a measurable delegation contract, such as successful handoff for all registered valid commands in a defined test matrix, with CLI-returned failures classified separately from plugin delegation failures.

## 2026-06-23 — audit-barrage lift (20260623T011827629Z-031-opencode-support-after_clarify)

Code-sha: 9773f1639793a8a70bbee56851465634ca8a65f9
### AUDIT-20260623-36 — Spec commits to `stackctl` CLI delegation for skills that may not exist as `stackctl` subcommands

Finding-ID: AUDIT-20260623-36
Status:     open
Severity:   blocking
Per-lane:   claude=blocking
Decision:   single-model (gate-counted blocking)
Surface:    spec.md — FR-003, FR-004, FR-008, Key Entities (skill list), US3 acceptance scenarios

FR-003 requires the plugin to "delegate skill execution to the `stackctl` CLI via the shell API." FR-004 requires forwarding "skill arguments to the CLI as command arguments." FR-008 requires mapping `/stack-control:` prefixed commands to "the appropriate skill." The five registered skills are named as `define`, `extend`, `execute`, `workflow`, `roadmap`. These five names appear in stack-control as SKILL.md-driven agent guidance files — `/stack-control:define` loads a SKILL.md and the agent follows conversational instructions; it is not a CLI-executable entry point. The `stackctl` CLI exposes verbs like `govern`, `specify`, `clarify`, `plan`, `tasks`, `analyze`, `implement`, `roadmap`, `inbox`, and `backlog`. The spec never establishes that `stackctl define`, `stackctl extend`, `stackctl execute`, `stackctl workflow`, and `stackctl roadmap` exist as CLI subcommands.

Blast-radius: if these subcommands do not exist, the entire US3 delegation model (and every acceptance scenario under it) is unbuildable as written. An unattended builder reads FR-003 + FR-004, calls `stackctl define`, gets a "command not found" error, and has no spec-level guidance for how to proceed. This is the most load-bearing unbuildable promise in the document.

A minimum fix: for each registered skill, explicitly state the `stackctl` subcommand or verb sequence it maps to (e.g. "invoking `/stack-control:define` delegates to `stackctl specify --mode feature`"), OR re-specify the delegation model as "the plugin loads and presents the skill's SKILL.md to the opencode agent for execution" rather than CLI invocation.

---

### AUDIT-20260623-37 — FR-002 "all stack-control skills" directly contradicts Key Entities' five-skill set

Finding-ID: AUDIT-20260623-37 (claude-02 + claude-03 + codex-01 + codex-02; cross-model)
Status:     open
Severity:   high
Per-lane:   claude=high, codex=high
Decision:   agreement (gate-counted high)
Surface:    spec.md — FR-002 ("all stack-control skills"), Key Entities section (five-skill set)

FR-002: "The plugin MUST register all stack-control skills when loaded." Key Entities: "The set of skills registered by the plugin is: `define`, `extend`, `execute`, `workflow`, `roadmap` (the primary lifecycle skills)." These directly contradict. The stack-control plugin exposes many more skills than five: `archive`, `audit-runs`, `backlog`, `batch-dispose`, `check-adopters`, `check-anti-patterns`, `check-clones`, `check-deprecations`, `curate`, `define`, `design`, `dispatch-wrapper`, `execute`, `extend`, `inbox`, `install-drift`, `release`, `roadmap`, `scope-doctor`, `scope-export`, `scope-inventory`, `scope-summary`, `scope-widen`, `session-end`, `session-start`, `setup`, `unarchive`, `validate-scope-discovery`, `workflow`.

An unattended builder following FR-002 (a MUST requirement) registers all of these. Key Entities constrains it to five, but requirements outweigh definitional prose in standard practice — an agent that notices the conflict resolves it toward the stricter MUST. The wrong building direction (registering all skills) produces a plugin that exposes governance, scope, auditing, and teardown operations to opencode users who expect only the five lifecycle skills. The fix is to align FR-002 with Key Entities: "The plugin MUST register the five primary lifecycle skills (`define`, `extend`, `execute`, `workflow`, `roadmap`) when loaded."

---

### AUDIT-20260623-38 — Edge cases section raises three behavioral questions with no corresponding promises

Finding-ID: AUDIT-20260623-38
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    spec.md — Edge Cases section

The spec's Edge Cases section lists five questions. FR-006 and FR-007 address CLI errors (non-zero exit codes) and missing CLI. The remaining three questions are unaddressed by any FR, acceptance scenario, or explicit "undefined behavior" declaration:

1. "What happens when the opencode session ends during a long-running stack-control skill?" — No FR. The plugin may leave orphaned `stackctl` processes.
2. "What if the user has multiple opencode sessions running simultaneously?" — No FR. Concurrent access to shared state (roadmap files, specs) has no promise.
3. "How does the plugin handle network timeouts or file system errors during CLI execution?" — No FR beyond the general "CLI errors" handling in FR-006, which addresses non-zero exit codes but not OS-level failures.

A spec that explicitly names edge cases without either addressing them or declaring them out-of-scope leaves builders to implement as they see fit. The three items above each involve state that outlives the command invocation — orphaned processes, lock conflicts, and partial writes — and each could produce meaningfully different plugin behavior depending on how the builder resolves the gap.

---

### AUDIT-20260623-39 — SC-003 latency metric cannot be measured as written

Finding-ID: AUDIT-20260623-39
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    spec.md — SC-003

SC-003: "Skill invocation latency (from typing command to first output) is under 2 seconds for local CLI." Two undefined boundaries make this untestable: (1) "first output" — the first byte of stdout, the first newline, the first user-meaningful line, or the complete response? For `stackctl govern` or `stackctl specify`, the first stdout line is often a startup/progress log, not a result; the criterion could be satisfied by printing a progress indicator immediately while useful output arrives 30 seconds later. (2) "typing command" — when the user presses Enter in opencode's UI, when opencode fires the `command.executed` event, or when the plugin dispatches to the shell API?

SC-002 (prior finding AUDIT-20260623-35) is also flagged for measurability issues but covers a different criterion (95% delegation success rate). SC-003 is independently unmeasurable. The fix is to specify the start event (e.g. "from `command.executed` event receipt") and the end event (e.g. "to first line of CLI stdout").

---

### AUDIT-20260623-40 — SC-004 forward compatibility promise is unmeasurable and unbounded

Finding-ID: AUDIT-20260623-40
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    spec.md — SC-004

SC-004: "Plugin works with opencode versions 1.0 and later." "Works" is undefined: the same plugin API shape? The same event names? The same shell API? No FR addresses version compatibility, no FR pins the opencode API version relied upon, and no acceptance scenario exercises multi-version behavior. Since opencode's current version is not stated, "1.0 and later" is an open-ended forward compatibility promise with no mechanism to verify it at any point in time. If opencode v1.5 changes the plugin API signature or renames `command.executed`, the spec provides no basis for determining whether SC-004 is met or broken.

The blast-radius is that this criterion will always appear satisfied in a single-version test environment (whatever opencode version the builder has), and "and later" will never be falsified until an adopter reports a regression on a future version. The fix is either to scope SC-004 to a specific tested version ("Plugin works with opencode v1.0") or to add a companion FR that pins the API surface the plugin relies on, making future-version incompatibilities detectable.

---

### AUDIT-20260623-41 — FR-001 compliance promise references an API signature the spec never describes or cites

Finding-ID: AUDIT-20260623-41
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    spec.md — FR-001, Assumptions (plugin API bullet)

FR-001: "The plugin MUST export a function following opencode's plugin API signature." The spec never describes what this signature is: the function's name, its parameter types, its return type, whether it is synchronous or asynchronous, and what registration calls it is expected to make. Every subsequent FR (FR-002 through FR-012) depends on this foundation — a plugin that exports the wrong function shape fails silently at load time, and none of the functional requirements can be exercised.

The Assumptions section states "The opencode plugin system supports the event hooks needed" but does not quote or cite the API. AUDIT-20260623-33 (prior, open) covers the `$` shell execution sub-API. This finding is distinct: the top-level plugin export signature itself is unspecified, not just the shell utility. A builder must look up opencode's documentation independently; if that documentation changes between the spec being written and the plugin being built, the spec provides no baseline against which to verify FR-001 compliance. At minimum, the spec should quote the expected function signature (even as pseudocode) and cite the opencode documentation version it was taken from.

## 2026-06-23 — audit-barrage lift (20260623T012430527Z-031-opencode-support-after_clarify)

Code-sha: 06025d3a39dcccc67fec9c7b8231e08c7a26cbaa
### AUDIT-20260623-42 — FR-012 automated version check contradicts the "manually ensure" Assumption

Finding-ID: AUDIT-20260623-42
Status:     open
Severity:   high
Per-lane:   claude=high
Decision:   single-model (gate-counted high)
Surface:    spec.md — FR-012, Assumptions (version alignment bullet)

FR-012 reads: "The plugin MUST warn users when plugin version doesn't match CLI version." This is an automated check — the plugin detects a mismatch and surfaces a warning without user action. The Assumptions section reads: "Users will manually ensure plugin and CLI version alignment (no automated version sync)."

These two statements cannot both be true. FR-012 makes the detection semi-automatic (the plugin does the checking); the Assumption says it's manual. US5 Priority rationale reinforces the assumption side ("Users can manually ensure alignment if needed"), but FR-012 is stated as MUST. An unattended builder reading only the FRs implements the automated check; one reading only the Assumptions skips it. Since both sections carry normative weight, the builder has no clear resolution. The blast-radius is that version-mismatch warnings either ship as a required feature or are omitted, depending on which section the builder treats as authoritative — and the spec provides no tiebreaker.

Fix: remove the Assumption's "no automated version sync" clause (it directly contradicts FR-012), or downgrade FR-012 to SHOULD and add an explicit note that automatic detection is optional.

---

### AUDIT-20260623-43 — US5 Acceptance Scenarios 1 and 3 give contradictory output for `/stack-control:version`, and FR-011 contradicts AS3

Finding-ID: AUDIT-20260623-43
Status:     open
Severity:   high
Per-lane:   claude=high
Decision:   single-model (gate-counted high)
Surface:    spec.md — User Story 5, AS1, AS3; FR-011

User Story 5 has two acceptance scenarios for the same trigger (`/stack-control:version` is invoked):

- **AS1**: "Then plugin reports its version" — plugin version only.
- **AS3**: "Then both plugin and CLI versions are displayed" — both versions.

AS1 reads as exclusive ("its version" = the plugin's version, not the CLI's). AS3 requires two values to be displayed. These cannot simultaneously be the correct behavior for the same command.

FR-011 resolves in AS1's direction: "The plugin MUST expose a `/stack-control:version` command that reports the plugin version." This gives the builder three signals: AS1 (plugin only), AS3 (both), and FR-011 (plugin only). The correct behavior cannot be inferred from the spec as written — an unattended builder chooses one of the two contradictory outputs. A builder who defers to FRs over user stories implements plugin-only and fails the AS3 scenario; a builder who treats US5 as requirements-grade picks AS3 and contradicts FR-011. Neither reading is obviously wrong given the spec's structure. The blast-radius is that the version command ships with ambiguous, likely incorrect output and neither path satisfies the full spec.

Fix: delete one of AS1/AS3 (keep AS3 — showing both is strictly more useful), update FR-011 to match ("reports the plugin and CLI versions"), and delete the "both" redundancy with FR-012's warning behavior.

---

### AUDIT-20260623-44 — FR-009 and FR-010 impose two mutually incompatible installation paths on a single-file plugin with no packaging pathway described

Finding-ID: AUDIT-20260623-44
Status:     open
Severity:   high
Per-lane:   claude=high
Decision:   single-model (gate-counted high)
Surface:    spec.md — FR-009, FR-010, Assumptions (single-file bullet), Clarifications

FR-009: "The plugin MUST load from `.opencode/plugins/stack-control.ts` (local file installation)" — a raw TypeScript file copied to a local directory.

FR-010: "The plugin MUST support npm installation by exporting a default function that opencode can load from `node_modules/@stack-control/opencode-plugin` (npm package installation)."

The Assumptions section states "The plugin will be a single file (`opencode-plugin.ts`)" and the Clarifications confirm this. A bare TypeScript file can be copied locally (FR-009 path) or published as an npm package (FR-010 path). However, publishing to npm as `@stack-control/opencode-plugin` requires a `package.json`, a build or bundle step, and a registry publish workflow — none of which the spec mentions. The Assumptions section says nothing about npm publishing infrastructure.

The blast-radius: an unattended builder reads both MUSTs, builds the local-copy path (straightforward), and has no information about how to satisfy FR-010 — what the package.json contains, who publishes it, whether the TypeScript source ships as-is or compiled, or whether the two installation paths are tested against the same artifact. A builder who implements only FR-009's path has satisfied FR-009 but violated FR-010; one who attempts FR-010 must invent an entire packaging and publishing mechanism from no spec guidance. The two MUSTs are structurally incompatible with a "single file, no build step" assumption.

Fix: either add a packaging assumption ("a `package.json` and npm publish step exist"), or drop FR-010 to SHOULD/MAY and explicitly note it requires separate packaging infrastructure not covered by this spec.

---

### AUDIT-20260623-45 — FR-002's exhaustive skill list omits the `version` skill required by FR-011 and FR-012

Finding-ID: AUDIT-20260623-45
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    spec.md — FR-002, FR-011, FR-012

FR-002: "The plugin MUST register the primary lifecycle skills when loaded (`define`, `extend`, `execute`, `workflow`, `roadmap`)." The parenthetical reads as an exhaustive enumeration.

FR-011 requires the plugin to expose `/stack-control:version`, and FR-012 requires version-mismatch warnings. US4 AS3 also echoes FR-002's enumeration verbatim without mentioning `version`. Nowhere does the spec extend the registration requirement to include `version`.

An unattended builder implementing FR-002 as a complete list registers five skills and may not wire up `version` as a registered command at all — satisfying FR-002 while violating FR-011. The spec provides no bridging statement like "in addition to the lifecycle skills, the plugin registers a `version` command." The blast-radius is that `/stack-control:version` is never registered with opencode's command palette and US5 is never testable.

Fix: either add `version` to FR-002's enumeration, or add a new FR for version command registration separate from the lifecycle skills.

---

### AUDIT-20260623-46 — Three listed edge cases have no governing requirement or assumption, leaving builder behavior undefined

Finding-ID: AUDIT-20260623-46
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    spec.md — Edge Cases section (items 1, 3, 4)

The Edge Cases section lists five open questions but resolves only two: item 2 (CLI errors) is addressed by FR-006/FR-007, and item 5 (`stackctl` not in PATH) is addressed by FR-007 and the PATH assumption. Three items have no governing FR, design decision, or assumption:

- **EC1**: "What happens when the opencode session ends during a long-running stack-control skill?" — No requirement. The plugin could kill the subprocess, leave it running, emit partial output, or crash. All are equally valid readings.
- **EC3**: "What if the user has multiple opencode sessions running simultaneously?" — No requirement. Concurrent `stackctl` invocations against the same project directory could conflict; the spec provides no isolation or ordering guarantee.
- **EC4**: "How does the plugin handle network timeouts or file system errors during CLI execution?" — No requirement beyond FR-006's "handle CLI errors (non-zero exit codes)." Timeouts and file system errors may not produce non-zero exits; the spec provides no guidance.

The blast-radius for each: an unattended builder makes an arbitrary implementation choice. Since the spec explicitly names these as concerns (listing them implies awareness), omitting any resolution signals a missing promise rather than a deliberate out-of-scope decision. If they are out of scope, the spec should state "these edge cases are out of scope for this release; behavior is undefined." As-is, the builder is uncertain whether the spec has a gap or intentionally punts.

Fix: for each unresolved edge case, add either (a) a governing FR, (b) an explicit assumption bounding the behavior, or (c) an explicit "out of scope" statement. The current listing-without-resolution is the worst of all worlds.

---

### AUDIT-20260623-47 — SC-001 "within 5 minutes" has an undefined measurement start event

Finding-ID: AUDIT-20260623-47
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    spec.md — SC-001

SC-001: "Users can install the stack-control plugin and invoke `/stack-control:define` within 5 minutes of first opening opencode."

Two boundaries are undefined: (1) "first opening opencode" — does the five-minute clock start when opencode first launches (before the user even decides to install the plugin), when the user begins the install procedure, or when opencode is first launched after a fresh system setup? (2) "install" — the spec supports two installation paths (FR-009 local copy, FR-010 npm), which have materially different durations; which path does the 5-minute criterion apply to?

The blast-radius is lower than SC-003 (already open) because the 5-minute bound is loose enough that a reasonable builder would pass it on the local-copy path regardless of the start-event interpretation. However, if a reviewer tests the npm installation path on a slow network (package not cached), the 5-minute bound becomes load-bearing, and without a defined start event, the criterion cannot be declared met or failed. This is not as urgent as AUDIT-BARRAGE-claude-01 through -03, but it makes SC-001 the third unmeasurable success criterion alongside SC-003 (open) and SC-004 (open).

Fix: specify the start event ("from the moment the user copies `opencode-plugin.ts` to `.opencode/plugins/`") and which installation path the criterion targets.

### AUDIT-20260623-48 — FR-004 does not define argument preservation semantics

Finding-ID: AUDIT-20260623-48
Status:     open
Severity:   high
Per-lane:   codex=high
Decision:   single-model (gate-counted high)
Surface:    plugins/stack-control/specs/031-opencode-support/spec.md:107-108

FR-004 says the plugin “MUST forward skill arguments to the CLI as command arguments,” but it never defines what counts as an argument boundary or whether user quoting must be preserved. For commands like `/stack-control:define "opencode support"` or flags with values, two plausible builds diverge: pass the raw suffix through to `stackctl`, or split it into argv tokens before invoking the shell API. An unattended builder could choose either, and the wrong choice breaks normal CLI usage for quoted strings, paths with spaces, or multi-token values.

The blast radius is high because this is a core invocation contract, not an edge case. A reasonable fix would state the user-facing promise explicitly, for example that opencode command arguments are passed to `stackctl` with the same token boundaries and quoting semantics as a direct CLI invocation.

### AUDIT-20260623-49 — Success criteria omit two required primary skills

Finding-ID: AUDIT-20260623-49
Status:     open
Severity:   medium
Per-lane:   codex=medium
Decision:   single-model (gate-counted medium)
Surface:    plugins/stack-control/specs/031-opencode-support/spec.md:105-116,129-133

FR-002 requires registering five primary lifecycle skills: `define`, `extend`, `execute`, `workflow`, and `roadmap`. SC-002, however, measures delegation only over `/stack-control:define`, `/stack-control:extend`, and `/stack-control:execute`. As written, the feature can satisfy its measurable delegation success criterion while `workflow` and `roadmap` fail to execute or delegate correctly.

The intended requirement is clear enough from FR-002 and the key entity definition, so this is medium rather than high. Still, it weakens the spec as an unattended build input because the testable success surface excludes two promised commands. The fix is to include all registered primary lifecycle skills in the delegation success set, or add separate success criteria for `workflow` and `roadmap`.

### AUDIT-20260623-50 — Version alignment responsibility is internally split between user and plugin

Finding-ID: AUDIT-20260623-50
Status:     open
Severity:   medium
Per-lane:   codex=medium
Decision:   single-model (gate-counted medium)
Surface:    plugins/stack-control/specs/031-opencode-support/spec.md:77-89,115-116,149

User Story 5 says users can manually ensure version alignment, and the Assumptions section says “Users will manually ensure plugin and CLI version alignment.” But FR-012 requires the plugin to warn users when the plugin version does not match the CLI version, and the acceptance scenario requires that warning when a skill runs. Those are different promises: either mismatch detection is a plugin responsibility, or it is left to the user via manual comparison.

The likely intended reading is “the plugin warns but does not auto-sync,” so the contradiction is resolvable. The risk is that a builder treats the assumption as permission to skip runtime mismatch checks while still claiming FR-012 is satisfied by `/stack-control:version`. The spec should say the plugin must detect and warn on mismatch, while users remain responsible for resolving the mismatch manually.

## 2026-06-23 — audit-barrage lift (20260623T013031899Z-031-opencode-support-after_clarify)

Code-sha: ea815cc5d91f46f9feeef81c2164bb5120866767
### AUDIT-20260623-51 — US5 P3 priority directly contradicts FR-012 MUST-level requirement

Finding-ID: AUDIT-20260623-51
Status:     open
Severity:   high
Per-lane:   claude=high
Decision:   single-model (gate-counted high)
Surface:    plugins/stack-control/specs/031-opencode-support/spec.md:77-89 (US5), 115-116 (FR-012)

User Story 5 carries Priority P3, with an explicit rationale saying the feature "is important for maintainability but not critical for first release. Users can manually ensure alignment if needed." This framing signals to a builder that the version-mismatch capability can be deferred to a future release.

FR-012, however, uses MUST: "The plugin MUST detect version mismatch between plugin and CLI and warn users when a skill is invoked." MUST is a binding obligation in RFC 2119 usage and has no deferral escape. The Clarifications section also confirms the behavior is intended: "Plugin detects mismatch and warns on skill invocation."

An unattended builder following priority-first development would treat US5 as out-of-scope for v1 and skip implementing FR-012. An unattended builder treating all MUST clauses as mandatory would implement it. Both readings are equally supported by the document. The blast radius is a user-visible feature — the mismatch warning — either being absent or present depending on which part of the spec the builder weighted. One of these must be wrong: either downgrade FR-012 to SHOULD/MAY (consistent with P3 "not critical"), or promote US5 to P1/P2 (consistent with MUST).

---

### AUDIT-20260623-52 — SC-002 95% delegation threshold is unmeasurable against a 5-item test set

Finding-ID: AUDIT-20260623-52
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    plugins/stack-control/specs/031-opencode-support/spec.md:129-133

SC-002 states: "Plugin successfully delegates 95% of skill invocations to the CLI without errors (measured over a defined set of happy-path skill invocations: `/stack-control:define`, `/stack-control:extend`, `/stack-control:execute`, `/stack-control:workflow`, `/stack-control:roadmap`)."

The "defined set" enumerates exactly 5 invocations — one per skill. With a set of 5, the achievable percentages are 0%, 20%, 40%, 60%, 80%, and 100%. There is no outcome that yields 95%. A builder implementing the acceptance test cannot construct a test suite that distinguishes "passes SC-002" from "fails SC-002" for the 80% case (4 of 5 pass) versus the 100% case. If the intent is "all five skills must delegate successfully," the criterion should state exactly that. If the 5% failure tolerance is genuine (one failure per 20 invocations), the test set must be sized to 20 or more invocations across varied inputs. As written, the criterion cannot be evaluated.

---

### AUDIT-20260623-53 — FR-007 conflates "CLI not installed" with "CLI not in PATH" while Edge Cases explicitly distinguishes them

Finding-ID: AUDIT-20260623-53
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    plugins/stack-control/specs/031-opencode-support/spec.md:112 (FR-007), Edge Cases section

FR-007 requires "a clear error message when `stackctl` CLI is not found." The Edge Cases section separately calls out: "What happens if `stackctl` CLI is installed globally but not in PATH?" — raising this as a distinct, unresolved question. These are different failure modes with different recovery instructions for the user ("install `stackctl`" vs. "add `stackctl` to your PATH"), yet FR-007 collapses them under the single phrase "not found."

An unattended builder implementing FR-007 would write a single error path — most likely relying on the shell API's failure to locate the binary — which handles PATH absence but is indistinguishable from non-installation. Users who have `stackctl` installed at a non-PATH location (common with language-version managers, local `./bin/` installations, or shell wrapper scripts) would receive a "CLI not found" error that doesn't explain how to fix their situation. The spec itself identified this as an open question but did not resolve it in a requirement. A minimal fix is to state the promise explicitly: either FR-007 applies to any failure to invoke the binary (regardless of reason), or the spec adds a second requirement that distinguishes the two and requires differentiated messaging.

---

### AUDIT-20260623-54 — FR-005 does not specify which output streams the plugin captures

Finding-ID: AUDIT-20260623-54
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    plugins/stack-control/specs/031-opencode-support/spec.md:109 (FR-005), 110 (FR-006)

FR-005 says "The plugin MUST capture CLI output and return it to opencode." FR-006 separately covers "CLI errors (non-zero exit codes)." The spec never states whether "CLI output" in FR-005 means stdout only, stderr only, or both streams combined.

This creates a build-time ambiguity with real user-facing consequences. Stackctl commands (like governance runs) commonly emit progress information on stderr and results on stdout. If the plugin captures stdout-only, users lose visibility into progress or warning messages during normal execution. If it captures stderr-only, result data is discarded. If it merges both, error markers in the output stream become indistinguishable from result content. The case where FR-006 fires (non-zero exit) makes this more acute: the CLI may write an actionable error description to stderr, but a stdout-only FR-005 implementation would return empty output alongside an error code, leaving users with no diagnostic information.

A reasonable fix states the stream promise explicitly: for example, "the plugin MUST capture stdout and present it as output; on non-zero exit, MUST also surface stderr content as the error detail."

---

### AUDIT-20260623-55 — SC-004 open-ended forward-compatibility promise is unverifiable as a success criterion

Finding-ID: AUDIT-20260623-55
Status:     open
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    plugins/stack-control/specs/031-opencode-support/spec.md:134

SC-004 states: "Plugin works with opencode versions 1.0 and later." The "and later" clause makes this a forward-looking guarantee covering versions that do not yet exist and whose API changes are unknown. No test written at implementation time can verify "versions not yet released will remain compatible." This is a promise the spec cannot keep as a verifiable success criterion.

This is common in product specs and a reader would understand it as "track opencode API changes," but as a measurable outcome it only covers opencode 1.0 specifically. A minimal fix replaces "versions 1.0 and later" with "opencode version 1.0" as the verifiable floor, and separately notes that compatibility with future versions is tracked as an ongoing commitment rather than a ship-gate criterion.

### AUDIT-20260623-56 — npm installation conflicts with the single-file/per-project installation decision

Finding-ID: AUDIT-20260623-56
Status:     open
Severity:   high
Per-lane:   codex=high
Decision:   single-model (gate-counted high)
Surface:    plugins/stack-control/specs/031-opencode-support/spec.md:113-114,147-154

FR-009 requires the plugin to load from `.opencode/plugins/stack-control.ts`, while FR-010 also requires npm installation from `node_modules/@stack-control/opencode-plugin`. The assumptions then say the plugin is installed per-project and “will be a single file (`opencode-plugin.ts`) rather than a module directory.” Those promises can be reconciled by a careful reader, but they are not the same product contract: local file copying and npm package loading have different install surfaces, update behavior, and file layout expectations.

The blast radius is high for unattended build input because a builder could satisfy only the local-file story, treating the npm line as an export-shape detail, or could build a package layout that violates the single-file/per-project assumption. A reasonable fix would state the two supported installation modes explicitly and define whether “single file” means the source artifact only, the local install artifact only, or also the npm package entrypoint.

### AUDIT-20260623-57 — Unknown `/stack-control:` commands have no promised user-facing behavior

Finding-ID: AUDIT-20260623-57
Status:     open
Severity:   medium
Per-lane:   codex=medium
Decision:   single-model (gate-counted medium)
Surface:    plugins/stack-control/specs/031-opencode-support/spec.md:71-73,112,142

The spec says commands starting with `/stack-control:` are routed to the appropriate skill, and clarifies that only `/stack-control:` commands are routed. It also defines the registered skill set as `define`, `extend`, `execute`, `workflow`, and `roadmap`, plus `/stack-control:version`. It never promises what happens for an in-namespace but unsupported command such as `/stack-control:foo` or `/stack-control:speckit-plan`.

The likely intended behavior is a clear unsupported-command error, so this is medium rather than high. Still, the namespace contract is user-facing: an unattended builder could silently ignore unknown commands, pass them through to `stackctl`, or report an error, and all are plausible from the current prose. The spec should add a requirement for unsupported `/stack-control:` commands to produce a clear “unknown stack-control command” result and not invoke unrelated CLI operations.

## 2026-06-23 — audit-barrage lift (20260623T013634159Z-031-opencode-support-after_clarify)

Code-sha: 772f37f5abbaf61e0168e667ce5c48bd7d099ad8
### AUDIT-20260623-58 — US5 acceptance scenarios 1 and 3 promise contradictory outputs for the same command

Finding-ID: AUDIT-20260623-58
Status:     open
Severity:   high
Per-lane:   claude=high
Decision:   single-model (gate-counted high)
Surface:    plugins/stack-control/specs/031-opencode-support/spec.md:94-105 (US5 acceptance scenarios)

Scenarios 1 and 3 of User Story 5 both trigger on the identical user action (`/stack-control:version`) but commit to different outputs:

- Scenario 1: "Then plugin reports its version" — outputs plugin version only.
- Scenario 3: "Then both plugin and CLI versions are displayed" — outputs both plugin and CLI versions.

These cannot both be true. An unattended builder reading FR-011 ("expose a `/stack-control:version` command that reports the plugin version") alongside Scenario 1 would implement a single-version display. Reading Scenario 3 alongside the intent of US5 (version sync and mismatch detection) would build a dual-version display. Both readings are equally plausible from the spec text; the spec provides no tie-breaker. The correct behavior is almost certainly Scenario 3 (showing both versions so the user can verify alignment), but Scenario 1 and FR-011 as written point in the other direction. A reasonable fix is to delete Scenario 1 (it is strictly weaker than Scenario 3) and update FR-011 to state "reports both plugin version and CLI version."

---

### AUDIT-20260623-59 — FR-005 and SC-003 are contradictory on whether CLI output is buffered or streamed

Finding-ID: AUDIT-20260623-59
Status:     open
Severity:   high
Per-lane:   claude=high
Decision:   single-model (gate-counted high)
Surface:    plugins/stack-control/specs/031-opencode-support/spec.md:118 (FR-005), 133 (SC-003)

FR-005 says: "The plugin MUST capture CLI output and return it to opencode." The word "capture" followed by "return" is the language of buffer-then-emit: collect all output, then hand it back as a unit.

SC-003 says: "Skill invocation latency (from typing command to first output) is under 2 seconds for local CLI." If "first output" means the first character or line the user sees, this is a streaming requirement — anything that buffers the complete CLI response violates SC-003 for any `stackctl` operation that takes more than two seconds end-to-end (which feature-definition, execution, and roadmap commands plausibly do, given they drive multi-step spec authoring or parallel execution).

These two requirements are contradictory unless the spec means something narrow by "first output" (e.g., "time until CLI process starts producing bytes" rather than "time until user sees anything"). The spec does not clarify. An unattended builder implementing FR-005 as a buffered capture-and-return will violate SC-003 for non-trivial CLI operations; a builder implementing streaming to satisfy SC-003 will need to interpret FR-005's "capture and return" differently than written. A reasonable fix is to state explicitly in FR-005 whether output is streamed incrementally or returned as a single payload, and to adjust SC-003's "first output" definition accordingly (e.g., "time from command entry to first line of CLI output appearing in the opencode interface").

---

### AUDIT-20260623-60 — FR-007 and FR-012 interaction is undefined when `stackctl` is absent

Finding-ID: AUDIT-20260623-60 (claude-03 + codex-01; cross-model)
Status:     open
Severity:   medium
Per-lane:   claude=medium, codex=high
Decision:   agreement (gate-counted medium)
Surface:    plugins/stack-control/specs/031-opencode-support/spec.md:119-120 (FR-007, FR-012)

FR-007 requires a clear error when `stackctl` is not found. FR-012 requires detecting version mismatch and warning the user on skill invocation. Version mismatch detection requires executing the CLI to read its version string. When the CLI is absent, both requirements apply to the same trigger (a skill invocation): FR-007 fires because the CLI is not found, and FR-012 would also attempt to fire but cannot retrieve the CLI version.

The spec does not state that FR-007 takes precedence and that FR-012 is skipped when the CLI is not installed, nor does it define what happens if the version-check subprocess fails for reasons other than the CLI being absent (e.g., the CLI binary is present but crashes on `--version`). A reasonable builder would handle "CLI not found" as the error path and never reach the version check, but the spec leaves this implicit. A reasonable fix adds a single sentence to FR-012: "Version mismatch detection is skipped when the CLI is not found; FR-007 governs that case."

---

### AUDIT-20260623-61 — Skill registration set defined inconsistently across Key Entities and Clarifications

Finding-ID: AUDIT-20260623-61
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    plugins/stack-control/specs/031-opencode-support/spec.md:67 (Key Entities), 110 (FR-002), 143 (Clarifications)

Three places define the set of skills registered by the plugin, and they disagree:

- FR-002: "`define`, `extend`, `execute`, `workflow`, `roadmap`" — five skills, no `version`.
- Key Entities: "The set of skills registered by the plugin is: `define`, `extend`, `execute`, `workflow`, `roadmap` (the primary lifecycle skills)" — same five, no `version`.
- Clarifications: "Which stack-control skills are registered with opencode? → A: `define`, `extend`, `execute`, `workflow`, `roadmap`, `version` (primary lifecycle skills + version command)" — six items, `version` included.

A builder following FR-002 and Key Entities literally would implement `version` as a special-case command handler distinct from the registered skill set — it might not appear in the opencode command palette under the skill enumeration, only via explicit routing. A builder following the Clarifications would register all six. The spec never resolves whether `version` is a "registered skill" (command-palette entry) or a "routed command" (handled by FR-008's mapping logic but not a registered skill). This distinction matters to adopters who want to discover available commands from the palette. A reasonable fix is to update FR-002 and Key Entities to include `version` explicitly, or to define `version` as a "built-in routed command, not a registered skill, and explain the difference.

---

### AUDIT-20260623-62 — SC-002 measurement methodology is undefined against a five-item happy-path set

Finding-ID: AUDIT-20260623-62
Status:     open
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    plugins/stack-control/specs/031-opencode-support/spec.md:131-132 (SC-002)

SC-002 requires "95% of skill invocations succeed" measured against exactly five named happy-path invocations. With a five-item set, 95% success means 4.75 items must pass — a fractional result against a discrete count. A builder interpreting this as "all five must pass" is enforcing 100%; one interpreting it as "repeat each invocation N times and require 95% of runs to succeed" gets a different protocol. The spec names the five items but does not define how many times each is run, under what conditions, or what counts as a "successful delegation" (CLI exits 0? Output is non-empty? User sees a response?).

The intent is clearly that happy-path invocations should reliably succeed, but the 95% figure is arithmetically incoherent against exactly 5 discrete items unless a sampling protocol is also defined. A reasonable fix replaces "95% of skill invocations" with "all five listed skill invocations" (since these are happy-path conditions where the CLI is installed and the inputs are valid), and adds "delegation is successful when the CLI exits 0 and the plugin returns non-empty output to the user."

### AUDIT-20260623-63 — SC-002 uses an impossible 95% threshold over five listed invocations

Finding-ID: AUDIT-20260623-63
Status:     open
Severity:   medium
Per-lane:   codex=medium
Decision:   single-model (gate-counted medium)
Surface:    plugins/stack-control/specs/031-opencode-support/spec.md:129-130

SC-002 says the plugin “successfully delegates 95% of skill invocations” and then defines the measured set as five happy-path commands: `define`, `extend`, `execute`, `workflow`, and `roadmap`. Over a five-case acceptance set, 95% is not a measurable pass threshold: four successes is 80%, and five successes is 100%.

The likely intended outcome is that all five happy-path commands delegate successfully, so a human reader can resolve this. The blast radius is still medium because this is a success criterion for an unattended build: one builder might treat it as “all five,” another might invent repeated trials, and another might ignore a single failure as statistically acceptable. A reasonable fix would replace the percentage with “all five listed happy-path invocations” or define a real repeated-measure sample size.

## 2026-06-23 — audit-barrage lift (20260623T014243894Z-031-opencode-support-after_clarify)

Code-sha: 666121a45e9ecaf116c00284b27259e40f19b526
### AUDIT-20260623-64 — US5 acceptance scenarios 1 and 3 make contradictory promises about `/stack-control:version` output

Finding-ID: AUDIT-20260623-64 (claude-01 + claude-03 + codex-03; cross-model)
Status:     open
Severity:   medium
Per-lane:   claude=high, codex=medium
Decision:   agreement (gate-counted medium)
Surface:    plugins/stack-control/specs/031-opencode-support/spec.md (User Story 5 — acceptance scenarios 1 and 3)

Both scenarios share the same trigger condition — "Given user runs `/stack-control:version`, When the command is invoked" — but promise different outputs:

- Scenario 1: "Then plugin reports **its version**" (plugin version only)
- Scenario 3: "Then **both plugin and CLI versions are displayed**"

These cannot both be true. An unattended builder reads the acceptance criteria as the testable contract. Scenario 1 is satisfied by reporting only the plugin version; scenario 3 requires both. A builder implementing scenario 1 will fail scenario 3, and vice versa. There is no disambiguating priority signal in the spec, no "scenario 3 supersedes scenario 1," and no "both together describe a single behavior." The wrong reading gets built by default.

Blast radius: this is a user-facing output difference visible to every adopter who runs `/stack-control:version`. The two-version display (scenario 3) is the more useful behavior and aligns with FR-012's version-mismatch detection theme, but nothing in the spec establishes that precedence. A reasonable fix is to delete scenario 1 or collapse it into scenario 3: "Then both plugin and CLI versions are displayed."

---

### AUDIT-20260623-65 — FR-012 "version mismatch" is undefined — no specification of what constitutes a mismatch

Finding-ID: AUDIT-20260623-65
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    plugins/stack-control/specs/031-opencode-support/spec.md:143 (FR-012), Assumptions

FR-012 requires the plugin to "detect version mismatch between plugin and CLI and warn users when a skill is invoked." The Assumptions section repeats the behavior: "The plugin detects version mismatch and warns users; users manually resolve mismatches." Neither defines what "version mismatch" means operationally.

Three equally plausible interpretations exist: (a) any difference in the full version string is a mismatch; (b) a semver major-version difference is a mismatch, but minor/patch differences are tolerated; (c) any version string difference beyond an exact match is a mismatch. Each produces different warning frequency — exact-match strict would warn on every patch release; major-only would suppress warnings until a breaking change. An unattended builder picks whichever interpretation feels natural, producing a user-facing behavior that may differ significantly from what the operator intended.

Blast radius: the mismatch warning fires on every skill invocation per FR-012, so a too-strict interpretation creates alert fatigue for every patch upgrade; a too-loose interpretation silently ignores incompatibilities. A reasonable fix adds one sentence to FR-012: "A mismatch is defined as a difference in the major semver component between plugin and CLI versions" (or whatever the intended policy is).

---

### AUDIT-20260623-66 — FR-008 routing creates an irreconcilable gap when combined with the unresolved `version` skill enumeration (new consequence of AUDIT-20260623-61)

Finding-ID: AUDIT-20260623-66
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    plugins/stack-control/specs/031-opencode-support/spec.md:126 (FR-008), 110 (FR-002), 147 (FR-011)

This finding surfaces a concrete implementability consequence of the still-open AUDIT-20260623-61 rather than re-reporting the enumeration inconsistency itself.

FR-008 states: "The plugin MUST map `/stack-control:` prefixed commands to the appropriate skill; **unknown commands produce a clear 'unknown stack-control command' error**." FR-002 defines the registered skill set as `define`, `extend`, `execute`, `workflow`, `roadmap` — no `version`. FR-011 independently requires the plugin to expose `/stack-control:version`.

When these three requirements are read together as written: `version` is not in the FR-002 registered set; FR-008 routes all unrecognized commands to an error; therefore `/stack-control:version` — being unrecognized per FR-002 — hits the FR-008 error path. This makes FR-008 and FR-011 directly irreconcilable without first resolving the FR-002 vs. Clarifications inconsistency. An unattended builder following FR-002 + FR-008 literally will produce "unknown stack-control command" for the required `/stack-control:version` command, violating FR-011.

Blast radius: the consequence is a required command throwing an error at runtime, a regression visible to every user who runs `/stack-control:version`. AUDIT-20260623-61's fix (add `version` to FR-002's enumeration) would resolve this gap; until then, these three requirements cannot all be satisfied simultaneously. Flagging here because the existing finding was about enumeration inconsistency — the implementability break via FR-008 is a distinct and concrete consequence that merits its own signal.

---

### AUDIT-20260623-67 — Listed edge cases are questions without committed answers — three behaviors are entirely undefined

Finding-ID: AUDIT-20260623-67
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    plugins/stack-control/specs/031-opencode-support/spec.md (Edge Cases section)

The spec lists five edge cases and frames them as open questions. Two are addressed by FRs: non-zero exit codes by FR-006, and `stackctl` not found by FR-007. Three have no committed behavior anywhere in the spec:

1. "What happens when the opencode session ends during a long-running stack-control skill?" — no FR, no acceptance scenario, no assumption.
2. "What if the user has multiple opencode sessions running simultaneously?" — no FR, no acceptance scenario, no assumption.
3. "How does the plugin handle network timeouts or file system errors during CLI execution?" — no FR, no acceptance scenario, no assumption.

Listing an edge case as an open question signals the spec authors were aware of the scenario. Leaving it answered by nothing commits the behavior to "undefined" — an unattended builder will either ignore the scenario or implement whatever feels natural, and neither is auditable against the spec.

Blast radius: session-termination during a long-running skill (e.g., `/stack-control:execute` over a large feature) is plausibly common; without a committed behavior (abort cleanly? leave CLI running? warn on next open?), users experience whatever the implementation chose. A reasonable fix adds explicit Assumptions or FRs for these three: even "behavior is undefined and left to the CLI's own termination handling" is a committed answer that guides implementation.

---

### AUDIT-20260623-68 — SC-004 "opencode versions 1.0 and later" is untestable without a minimum API compatibility contract

Finding-ID: AUDIT-20260623-68 (claude-06 + codex-01; cross-model)
Status:     open
Severity:   low
Per-lane:   claude=low, codex=medium
Decision:   agreement (gate-counted low)
Surface:    plugins/stack-control/specs/031-opencode-support/spec.md:137 (SC-004)

SC-004 states: "Plugin works with opencode versions 1.0 and later." There is no mechanism in the spec or its assumptions for verifying this. Opencode's plugin API versioning, what API surface the plugin depends on, or what constitutes a breaking opencode API change are all unspecified. If opencode 2.0 changes its plugin event model, this criterion's "and later" clause becomes retroactively false for a shipped plugin, with no way for the builder to have guarded against it at implementation time.

Additionally, the spec's Assumptions name "The opencode plugin system supports the event hooks needed (command.executed, session events)" — a conditional dependency on specific opencode API surface — but SC-004 offers no way to verify that dependency holds across "versions 1.0 and later." A builder cannot write a test for "works with all future opencode versions."

A reasonable fix replaces "versions 1.0 and later" with the specific API surface the plugin depends on (e.g., "Plugin works with any opencode version that implements the `command.executed` hook and shell API as used at the time of authoring"), or adds an Assumption that constrains the API surface being relied upon so the criterion becomes falsifiable.

### AUDIT-20260623-69 — FR-004’s argument-count example is ambiguous about what gets passed to `stackctl`

Finding-ID: AUDIT-20260623-69
Status:     open
Severity:   high
Per-lane:   codex=high
Decision:   single-model (gate-counted high)
Surface:    plugins/stack-control/specs/031-opencode-support/spec.md:108

FR-004 requires preserving token boundaries and gives `/stack-control:define "opencode support"` as an example that “passes two arguments to `stackctl`.” There are two plausible readings: either `stackctl` receives `define` plus one preserved quoted argument (`["define", "opencode support"]`), or the quoted phrase is mistakenly expected to become two arguments (`["define", "opencode", "support"]`). The wording “preserving ... quoting semantics” points to the first reading, while “passes two arguments” can be read as counting the words in the quoted phrase.

The blast radius is high because unattended builders often implement examples literally. If the wrong reading is built, multi-word feature names are split incorrectly, which affects the first core workflow `/stack-control:define "opencode support"`. A reasonable fix would state the exact argv shape, for example: `/stack-control:define "opencode support"` invokes `stackctl` with command `define` and one user argument whose value is `opencode support`.

## 2026-06-23 — audit-barrage lift (20260623T014859835Z-031-opencode-support-after_clarify)

Code-sha: 46c4fd9aeae1013885c514b657d796b14dc6ef34
### AUDIT-20260623-70 — FR-003 and US5 scenario 3 are contradictory about what `:version` reports

Finding-ID: AUDIT-20260623-70 (claude-01 + codex-01; cross-model)
Status:     open
Severity:   high
Per-lane:   claude=high, codex=high
Decision:   agreement (gate-counted high)
Surface:    plugins/stack-control/specs/031-opencode-support/spec.md (FR-003, FR-011, US5 acceptance scenario 3)

FR-003 explicitly carves `:version` out of CLI delegation: it "reports the plugin-local version" and is the named exception to the rule that all skills delegate to `stackctl`. FR-011 similarly says the command "reports the plugin version." But US5 acceptance scenario 3 states: "both plugin and CLI versions are displayed." Displaying the CLI version requires invoking `stackctl` (or at minimum `stackctl --version`) — which is exactly what FR-003 forbids for this command.

An unattended builder has two contradictory authoritative surfaces. Reading FR-003 + FR-011 literally, they implement `:version` as a purely local metadata lookup that never touches the CLI. Reading US5 scenario 3 literally, they add a `stackctl --version` subprocess call. These cannot both be correct. The blast radius is user-visible: a user running `:version` either sees only the plugin version (can't verify CLI alignment) or sees both (FR-003 violated). If the intent is that `:version` calls `stackctl --version` despite FR-003's "exception" framing, FR-003 needs rewording. If `:version` is genuinely local-only, US5 scenario 3 needs to be revised to "plugin version only."

---

### AUDIT-20260623-71 — FR-002 and US4 scenario 3 omit `version` from the registered skill list, contradicting the Clarifications section

Finding-ID: AUDIT-20260623-71
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    plugins/stack-control/specs/031-opencode-support/spec.md (FR-002, US4 scenario 3, Clarifications, FR-011, US2 scenario 2)

FR-002 enumerates exactly five registered skills: `define`, `extend`, `execute`, `workflow`, `roadmap`. US4 scenario 3 confirms five: "registers the primary lifecycle skills (`define`, `extend`, `execute`, `workflow`, `roadmap`)." But the Clarifications section explicitly states: "Which stack-control skills are registered with opencode? → A: `define`, `extend`, `execute`, `workflow`, `roadmap`, `version`" — six skills. FR-011 separately specifies the `:version` command but never says it is "registered" in the same sense (i.e., discoverable in the command palette per US2 scenario 2).

An unattended builder reading FR-002 as the authoritative registration list would build a plugin where `:version` does not appear in opencode's command palette — it would only work if typed exactly, not discovered. A builder reading the Clarifications as authoritative would register six skills. The spec does not resolve which surface is canonical when they differ. The practical consequence is that `:version` discoverability is unspecified — a real user-experience decision left undefined.

---

### AUDIT-20260623-72 — SC-003 latency criterion is unmeasurable as stated for heavy skills

Finding-ID: AUDIT-20260623-72
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    plugins/stack-control/specs/031-opencode-support/spec.md (SC-003)

SC-003 requires: "Skill invocation latency (from typing command to first output) is under 2 seconds for local CLI." The spec registers five primary skills, one of which is `execute`. The spec itself acknowledges in the Edge Cases section "a long-running stack-control skill" as a plausible scenario — `/stack-control:execute` over a large feature can run for minutes. SC-003 does not carve out `execute` (or any other heavy skill), does not qualify the criterion to apply only to lightweight commands, and does not define "first output" (completion of the CLI call, or the first streaming byte of output).

As written, an unattended builder cannot satisfy SC-003 for `execute` while also fully delegating to `stackctl execute` — these are contradictory promises. If the intent is "first streaming byte" (which would be achievable even for long operations), that must be stated. If the criterion applies only to non-execute skills, the spec must say so. A test suite written against SC-003 as written would either incorrectly fail `execute` or require the test author to make an assumption the spec doesn't license.

---

### AUDIT-20260623-73 — "Active project/workspace as working context" is never defined in opencode API terms

Finding-ID: AUDIT-20260623-73
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    plugins/stack-control/specs/031-opencode-support/spec.md (US3 scenario 1, Assumptions)

US3 acceptance scenario 1 requires the plugin to invoke `stackctl <command>` "with the opencode session's active project/workspace as the working context." The Assumptions section restates this: "Skill invocations execute `stackctl` with the opencode session's active project/workspace as the working context." Neither location defines what "active project/workspace" means in opencode's plugin API, how it maps to a filesystem working directory, or how the plugin obtains it.

The Assumptions list what the opencode plugin system exposes (`command.executed` events, shell API), but do not include an assumption that opencode exposes the active project path. If opencode's shell API runs subprocesses from a fixed working directory (the opencode install directory, the user's home, etc.) rather than the project's directory, `stackctl` will silently operate on the wrong project — a failure mode that produces no error, just wrong behavior. Since `stackctl`'s correctness depends critically on running in the right directory (it reads `plugins/stack-control/` relative paths, roadmap files, etc.), this missing commitment is load-bearing. A reasonable fix adds an explicit Assumption naming the opencode API surface that exposes the project path, or acknowledges that the CWD must be passed explicitly to `stackctl`.

---

### AUDIT-20260623-74 — FR-009 and FR-010 assume opencode handles TypeScript npm packages identically to local `.ts` files — never stated

Finding-ID: AUDIT-20260623-74
Status:     open
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    plugins/stack-control/specs/031-opencode-support/spec.md (FR-009, FR-010, Clarifications)

FR-009 specifies local installation as `.opencode/plugins/stack-control.ts` — a raw TypeScript file. FR-010 requires npm package installation where "npm package entrypoint is the same single file." Publishing raw TypeScript as an npm package entrypoint is only viable if opencode's npm plugin loader handles TypeScript source the same way as locally-copied `.ts` files. If opencode compiles local plugins from TypeScript but loads npm packages as pre-compiled JavaScript (the conventional npm expectation), then "same single file" is self-contradictory: the local path is a `.ts` source file, but the npm entrypoint would need to be compiled JavaScript.

The Assumptions section does not include any claim that opencode's npm plugin loading supports TypeScript source. Without this assumption, FR-010's "same single file" promise may be impossible to satisfy while also satisfying FR-009's `.ts` extension requirement. A reasonable fix either adds an Assumption that opencode's npm loader supports TypeScript source, or acknowledges that the npm package ships compiled JavaScript (making it technically a different file format from the local `.ts` copy, with the "same single file" claim requiring clarification).

## 2026-06-23 — audit-barrage lift (20260623T015519382Z-031-opencode-support-after_clarify)

Code-sha: a76efbf06ca400cb92b0cae4284fd625fae409a1
### AUDIT-20260623-75 — `version` is registered in Clarifications (6 skills) but not in FR-002, Key Entities, or US4-SC3 (5 skills) — creating an unresolvable routing gap at FR-008

Finding-ID: AUDIT-20260623-75
Status:     open
Severity:   high
Per-lane:   claude=high
Decision:   single-model (gate-counted high)
Surface:    plugins/stack-control/specs/031-opencode-support/spec.md (FR-002, Key Entities, US4-SC3, Clarifications, FR-008, FR-011)

Three sections of the spec give an enumeration of registered skills that excludes `version`: FR-002 ("register the primary lifecycle skills when loaded (`define`, `extend`, `execute`, `workflow`, `roadmap`)"), Key Entities ("The set of skills registered by the plugin is: `define`, `extend`, `execute`, `workflow`, `roadmap`"), and US4-SC3 ("it registers the primary lifecycle skills (`define`, `extend`, `execute`, `workflow`, `roadmap`) with opencode"). The Clarifications section contradicts all three: "Which stack-control skills are registered with opencode? → A: `define`, `extend`, `execute`, `workflow`, `roadmap`, `version` (primary lifecycle skills + version command)." The spec has four sections that address this exact question and produces two different authoritative answers.

This contradiction directly cascades into FR-008's routing behavior. FR-008 says: "The plugin MUST map `/stack-control:` prefixed commands to the appropriate skill; unknown commands produce a clear 'unknown stack-control command' error." FR-011 separately says: "The plugin MUST expose a `/stack-control:version` command that reports only the plugin version." The spec never says whether FR-011's `version` command is: (a) an entry in FR-002's registered-skill list (which would make Clarifications authoritative and FR-002's enumeration wrong), or (b) a special-case command handled before FR-008's routing fires (which would make FR-002 authoritative but require an explicit exemption clause in FR-008). An unattended builder implementing FR-008's routing table from FR-002's 5-skill list would route `/stack-control:version` to the "unknown command" error handler — making FR-011 impossible to satisfy without adding an undocumented special case. The spec never acknowledges this gap, let alone resolves it. Blast-radius: high — an agent building FR-008 first from the formal requirements would build exactly this wrong behavior, and the spec offers no correction.

A reasonable fix: add `version` to FR-002's enumeration with a note that it is handled plugin-locally per FR-003/FR-011 (not delegated to the CLI), and update Key Entities and US4-SC3 to match. Alternatively, add a sentence to FR-008 stating that `version` is exempted from its unknown-command routing.

---

### AUDIT-20260623-76 — FR-012's "version mismatch" trigger is undefined — any version difference or only breaking-level differences?

Finding-ID: AUDIT-20260623-76
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    plugins/stack-control/specs/031-opencode-support/spec.md (FR-012, US5-SC2)

FR-012: "The plugin MUST detect version mismatch between plugin and CLI and warn users when a skill is invoked." US5-SC2: "Given CLI version differs from plugin version, When user runs a skill, Then a warning is displayed about version mismatch." US5-SC2 says "differs" without qualification, which a literal reading maps to: any version difference at all triggers a warning. Under this reading, a plugin at 1.0.1 paired with a CLI at 1.0.0 produces a warning on every skill invocation — a plausible but probably unintended UX.

The spec never defines version compatibility semantics: is the threshold major-version change? any semver incompatible change? any version difference? Without this definition, FR-012 is an unmeasurable requirement — there is no test that can definitively confirm whether the plugin "correctly detected a mismatch" because the spec has not defined what detection threshold is correct. Blast-radius: medium — an unattended builder will make a reasonable-seeming choice (likely "any difference") that may be wrong, producing either warning fatigue or silent incompatibility, neither of which the spec catches because it never states the intended threshold.

A reasonable fix: add one sentence to FR-012 defining the threshold (e.g., "version mismatch is defined as a difference in major version component" or "any version string inequality") so the requirement is testable.

---

### AUDIT-20260623-77 — SC-004 commits to "1.0 and later" then immediately hedges future compatibility away — the criterion is self-contradictory and untestable

Finding-ID: AUDIT-20260623-77
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    plugins/stack-control/specs/031-opencode-support/spec.md (SC-004)

SC-004: "Plugin works with opencode versions 1.0 and later (tested against opencode 1.0+; compatibility with future versions depends on opencode's plugin API stability)."

The bare criterion "works with opencode versions 1.0 and later" is a forward-looking compatibility commitment: it says the plugin works with all current and future 1.x releases. The parenthetical immediately conditions this away: "compatibility with future versions depends on opencode's plugin API stability." These claims cannot both be true simultaneously — "1.0 and later" is unconditional; "depends on API stability" is conditional. If the intent is "we tested against 1.0 and make no forward commitment," that is a different, weaker claim than what the opening clause states.

Beyond the internal contradiction, the criterion as written is not testable: testing "1.0 and later" requires testing against unreleased future versions; the parenthetical hedge licenses treating any future incompatibility as "not our problem." An unattended builder cannot write a definitive test against SC-004 because the spec never resolves which half of the criterion is authoritative — must tests cover all released 1.x versions? only 1.0? whatever is available? Blast-radius: the spec's quality is the issue rather than the implementation, but a downstream QA agent would likely write a test against 1.0 only and declare SC-004 satisfied, leaving the broader compatibility claim unverified.

A reasonable fix: split into a testable "tested against" claim and a separate design note about expected API stability, e.g.: "Plugin is tested against opencode 1.0. The plugin API surface used (`command.executed` events, shell API) is expected to remain stable across opencode 1.x releases, but compatibility with future versions is not guaranteed."

---

### AUDIT-20260623-78 — US3-SC3 says the plugin "formats and returns" CLI output, but no FR defines any formatting behavior

Finding-ID: AUDIT-20260623-78
Status:     open
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    plugins/stack-control/specs/031-opencode-support/spec.md (US3-SC3, FR-005)

US3 Acceptance Scenario 3: "Given CLI command completes, When output is returned, Then the plugin formats and returns it to opencode." FR-005: "The plugin MUST capture CLI output and return it to opencode." FR-005 omits the word "formats" and imposes no transformation requirements on the output. The acceptance scenario implies a defined formatting step; the corresponding functional requirement does not.

If "formats" is meaningful — stripping ANSI codes, wrapping in a structured response, applying markdown, or any other transformation — the behavior is missing from the formal requirements and an unattended builder would miss it. If "formats" is just informal phrasing for "returns," the acceptance scenario language is misleading and should be replaced with language matching FR-005. Blast-radius: low — an unattended builder would return raw stdout and this is likely exactly right; the gap only matters if a specific formatting behavior was intended.

### AUDIT-20260623-79 — `/stack-control:version` cannot verify version alignment as promised

Finding-ID: AUDIT-20260623-79
Status:     open
Severity:   medium
Per-lane:   codex=medium
Decision:   single-model (gate-counted medium)
Surface:    `plugins/stack-control/specs/031-opencode-support/spec.md:79-93`, `plugins/stack-control/specs/031-opencode-support/spec.md:119-120`

US5 promises “Users should be able to verify version alignment” and its independent test says the feature “can be fully tested by comparing plugin version to CLI version” (`lines 81-85`). But the accepted behavior for `/stack-control:version` is explicitly plugin-only: it “reports only its version” (`line 89`), FR-011 repeats that it reports “only the plugin version” (`line 119`), and the note says CLI version detection happens silently only for mismatch warnings on skill invocation (`line 93`).

As written, a user can detect a mismatch only indirectly after running a skill, and cannot verify alignment when there is no mismatch warning. The blast radius is medium because a builder would likely implement the stated plugin-only version command correctly, but the delivered UX would fail US5’s stated verification promise. A reasonable fix would either remove the “verify alignment” promise/test, or add a distinct user-facing behavior that reports both plugin and CLI versions without contradicting `/stack-control:version`’s plugin-only contract.

### AUDIT-20260623-80 — `workflow` is required as a happy-path skill but has no user-facing contract

Finding-ID: AUDIT-20260623-80
Status:     open
Severity:   medium
Per-lane:   codex=medium
Decision:   single-model (gate-counted medium)
Surface:    `plugins/stack-control/specs/031-opencode-support/spec.md:9`, `plugins/stack-control/specs/031-opencode-support/spec.md:73-75`, `plugins/stack-control/specs/031-opencode-support/spec.md:109-120`, `plugins/stack-control/specs/031-opencode-support/spec.md:133-135`

The spec requires registering and successfully delegating `/stack-control:workflow`: it is listed in the feature input (`line 9`), required by FR-002 (`line 110`), included in SC-002’s five happy-path invocations (`line 134`), and appears in the command registration scenario (`lines 73-75`). But no user story or acceptance scenario states what `workflow` should do, what `stackctl` command it maps to, or what successful output means.

This is not a request for implementation mechanism; it is a missing behavioral promise for one of the five success-criterion commands. The blast radius is medium because an unattended builder will probably infer `stackctl workflow`, but the spec gives no way to distinguish a correct implementation from a merely registered command that calls the wrong lifecycle surface. A reasonable fix would add a one-sentence contract for `/stack-control:workflow`, parallel to the other lifecycle commands, or remove it from the required happy-path list if it is not part of this feature.
