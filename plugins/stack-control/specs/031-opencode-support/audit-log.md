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
