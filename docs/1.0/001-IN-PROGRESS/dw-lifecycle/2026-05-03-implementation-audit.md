# dw-lifecycle Implementation Audit

**Date:** 2026-05-03  
**Audited feature:** `dw-lifecycle`  
**Audited against:** `design.md` (the feature PRD/design), the shipped `plugins/dw-lifecycle` implementation, and the current skill surface

## Executive summary

`dw-lifecycle` **partially comports** with its PRD/design.

It succeeds at the narrowest part of the intended scope:

- there is a real plugin shell
- there is a deterministic helper layer for config, path resolution, transitions, workplan parsing, journal append, and GitHub issue creation
- the stop-at-PR posture remains encoded in the skill surface

But it **does not yet satisfy the PRD's overarching feature goals in full**, especially:

1. composing canonical upstream practices rather than shipping deskwork-coupled approximations,
2. providing a reliable, portable managed-project lifecycle across host projects,
3. enforcing the required/recommended peer-plugin contract in a trustworthy way.

The feature as shipped is best described as a **promising prototype with real substrate**, not a fully PRD-conformant lifecycle plugin.

## Audit method

Reviewed:

- [design.md](./design.md)
- [README.md](./README.md)
- `plugins/dw-lifecycle/src/**/*.ts`
- `plugins/dw-lifecycle/skills/*/SKILL.md`
- `plugins/dw-lifecycle/src/__tests__/*.test.ts`

Also ran:

```bash
npm test --workspace plugins/dw-lifecycle
```

Result in this environment: 62 tests passed, 6 failed. The failures were dominated by environment/tooling constraints (`tsx` IPC in sandbox, local git GPG signing in tmp repos), so they do **not** by themselves prove product regressions. They do, however, mean this audit is primarily a design/implementation conformance audit, not a clean green-test certification.

## Goal-by-goal assessment

### Goal A — Add discipline

**PRD intent:** `dw-lifecycle` should add rigor by composing `superpowers` and `feature-dev`, not by freehanding its own weaker workflow.

**Assessment:** **Partial**

What aligns:

- The skill bodies explicitly point at `superpowers:brainstorming`, `writing-plans`, `subagent-driven-development`, `verification-before-completion`, and `feature-dev` agents.
- The review and ship skills preserve the intended "canonical discipline first" posture.

What does not:

- The deterministic implementation layer does not actually enforce that contract.
- Peer-plugin detection is not implemented; the doctor hardcodes peer absence.
- Several lifecycle steps remain prose-only promises rather than verified, reliable orchestration.

Bottom line: the **intent** to compose canonical discipline is present, but the **implementation certainty** the PRD asked for is not yet there.

### Goal B — Reduce duplication

**PRD intent:** stop carrying homegrown versions of practices already canonicalized upstream.

**Assessment:** **Partial**

What aligns:

- No custom subagents were added.
- The review skill points at `feature-dev`'s reviewer rather than inventing another reviewer.

What does not:

- The plugin still ships strongly deskwork-shaped session and documentation conventions rather than a clean lifecycle shell around canonical upstream practices.
- The `define`, `session-start`, and `session-end` skills still carry substantial project-specific behavioral assumptions.

Bottom line: the feature avoids the worst form of duplication, but it has **not yet separated lifecycle orchestration from deskwork-specific conventions** cleanly enough to meet the portability goal.

### Goal C — Standardize and make portable

**PRD intent:** make the lifecycle adoptable across projects.

**Assessment:** **Weak / not yet achieved**

What aligns:

- There is a config file with version-aware doc-tree settings.
- Path resolution, transitions, and worktree naming are parameterized.

What does not:

- Session journaling remains deskwork-coupled.
- Feature-doc shape remains deskwork-coupled.
- Install/bootstrap behavior does not probe or confirm host-project shape the way the skill and design claim.

Bottom line: the plugin is **portable in skeleton**, but not yet portable in the project-facing behaviors that matter most to adopters.

## Detailed findings

### 1. High: peer-plugin contract is not implemented reliably

The PRD/design makes the peer-plugin posture foundational:

- `superpowers` is required
- `feature-dev` is recommended
- `/dw-lifecycle:doctor` should detect missing peers correctly

But the actual implementation hardcodes peer detection to false:

- `plugins/dw-lifecycle/src/subcommands/doctor.ts:54-60`

This means:

- the doctor is not trustworthy on one of the design's core contracts
- the "required peer" posture is not meaningfully enforced by the helper layer
- the feature does not currently satisfy the design acceptance criterion that doctor flags missing peers correctly

This is not a cosmetic bug. It cuts directly against the design's core architecture and boundary contract.

### 2. High: install/bootstrap implementation materially diverges from the designed bootstrap flow

The design and install skill promise a bootstrap that:

- probes host-project structure
- confirms detected values
- writes config matching the host project

The helper actually just writes `defaultConfig()`:

- `plugins/dw-lifecycle/src/subcommands/install.ts:5-22`

And the install skill still claims probing/confirmation behavior:

- `plugins/dw-lifecycle/skills/install/SKILL.md:8-31`

This gap matters because portability depends on bootstrap getting the host project shape right. As implemented, portability is mostly aspirational at install time.

### 3. High: setup flow diverges from the PRD's feature-scaffolding contract

The setup implementation creates the worktree and scaffolds files, but several promised behaviors are absent or mismatched:

- it does **not** write a `deskwork.id` UUID into the PRD
- it does **not** seed the PRD from the definition file
- instead, it appends the definition file contents to `workplan.md`

Relevant implementation:

- `plugins/dw-lifecycle/src/subcommands/setup.ts:131-149`

This is a material divergence from the designed lifecycle because the PRD is supposed to be a first-class document in the flow, not a mostly-empty template while the workplan absorbs the definition body.

This is also directly tied to the reopened follow-up issues and explains why the post-ship bug cluster exists.

### 4. Medium: portability goal is undercut by deskwork-coupled session and document conventions

The PRD says the plugin should be adoptable across projects, but the shipped session skills are still strongly deskwork-shaped:

- `plugins/dw-lifecycle/skills/session-start/SKILL.md:12-17`
- `plugins/dw-lifecycle/skills/session-end/SKILL.md:12-44`

The session-end skill hardcodes the deskwork journal structure:

- `Goal`
- `Accomplished`
- `Didn't Work`
- `Course Corrections`
- `Quantitative`
- `Insights`

That does not match the portability story in spirit, even if it is internally consistent with deskwork. The same applies to the README/PRD/workplan feature-doc shape.

This is why issues [#122](https://github.com/audiocontrol-org/deskwork/issues/122) and [#123](https://github.com/audiocontrol-org/deskwork/issues/123) are not secondary polish items; they are direct goal-alignment issues.

### 5. Medium: retargeting/version-travel behavior described in the skills is not actually implemented

The `extend` skill claims same-stage transition can retarget a feature to a new version:

- `plugins/dw-lifecycle/skills/extend/SKILL.md:22-28`

But the transition helper accepts only a single `targetVersion`, and uses it for **both** source and destination resolution:

- `plugins/dw-lifecycle/src/transitions.ts:12-24`

So there is no implemented "move from old version path to new version path" behavior here. The skill promises more than the helper can do.

That undercuts one of the PRD's more important portability ideas: version-aware document travel.

### 6. Medium: the implemented deterministic substrate is narrower than the public surface implies

The PRD's public surface is a full lifecycle:

- define
- setup
- issues
- implement
- review
- ship
- complete
- pickup
- extend
- teardown
- doctor
- help
- session-start
- session-end

The actual helper CLI implements only:

- install
- setup
- issues
- transition
- journal-append
- doctor

See:

- `plugins/dw-lifecycle/src/cli.ts`

This is not automatically wrong, because skills are allowed to carry orchestration. But in practice it means many user-visible lifecycle promises exist only at the prose-skill layer, without the deterministic support the design implies.

For a lifecycle plugin whose value is process reliability, that gap matters.

## Positive conformance

The implementation is not hollow. Several important design elements are real and reasonably solid:

### 1. Version-aware path resolution exists

- `plugins/dw-lifecycle/src/docs.ts`
- covered by `plugins/dw-lifecycle/src/__tests__/docs.test.ts`

This is an important part of the portability story and is genuinely implemented.

### 2. Transition logic is simple and appropriately idempotent

- `plugins/dw-lifecycle/src/transitions.ts`
- covered by `plugins/dw-lifecycle/src/__tests__/transitions.test.ts`

The helper does one thing cleanly: move a feature directory between lifecycle states.

### 3. Workplan parsing and journal append logic exist as real substrate

- `plugins/dw-lifecycle/src/workplan.ts`
- `plugins/dw-lifecycle/src/journal.ts`

These are meaningful pieces of reusable lifecycle infrastructure rather than only prompt prose.

### 4. The stop-at-PR rule is preserved

The `ship` skill still encodes the design's "operator owns merge" rule:

- `plugins/dw-lifecycle/skills/ship/SKILL.md`

That is one of the most important behavior-level constraints from the PRD, and it is still present.

## Overall conclusion

As implemented, `dw-lifecycle` **does comport with the PRD in broad architecture**, but **does not yet comport with it strongly enough in execution detail to claim the feature fully achieved its own overarching goals**.

The strongest statement I can defend is:

> `dw-lifecycle` shipped a real lifecycle substrate and a coherent design direction, but it did not yet close the loop on portability, canonical-peer enforcement, or bootstrap/scaffold fidelity.

In practical terms:

- **prototype / first release:** yes
- **fully goal-conformant managed-project lifecycle plugin:** not yet

## Recommended next moves

1. Finish the Phase 7 bug-fix cluster first:
   - bootstrap fidelity
   - setup fidelity
   - UUID/frontmatter correctness
   - definition-file handling

2. Then finish the Phase 8 tailoring seam:
   - session-start/session-end customization
   - feature-doc shape customization

3. Treat doctor peer detection as a first-order architectural fix, not a minor bug.

Until those are done, the implementation remains materially short of the PRD's portability and canonical-composition goals.
