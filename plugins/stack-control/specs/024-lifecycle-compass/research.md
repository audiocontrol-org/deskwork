# Phase 0 Research: Lifecycle Compass

The spec carried no `[NEEDS CLARIFICATION]` markers (all three forks resolved by operator
confirmation 2026-06-16; see checklists/requirements.md). Research here therefore resolves
the **technical** unknowns the plan must settle before design: how the compass composes the
022 substrate, how intent is mechanically matched, where govern resolution moves, and how
the canonical identity is computed. Each item: Decision / Rationale / Alternatives.

## R1 — Compass verdict computation (reuse, don't reimplement)

**Decision**: `compass.ts` is a pure function `computeVerdict(doc, currentPhase, intentPhase,
hasNode, sideState) → Verdict`. It reuses `derivePhase` (022 `phase-derivation.ts`) for the
current phase and the doc's ordered `phases[]` to compare phase ordinals. The verdict is:
`off-rail` if no node or a terminal side-state; otherwise compare the intent's phase ordinal
against the *legitimate next* phase ordinal — equal ⇒ `on-course`, greater ⇒ `ahead` (name the
skipped step = the phase between current and intent), less-or-equal-to-current ⇒ `behind`.

**Rationale**: 022 already made phase a pure function of artifacts and the phase list ordered
(`DEFAULT_PHASES` / the governed `WORKFLOW.md`). The compass is a *diff over an ordinal*, not
new phase logic — Constitution Principle II (derive from the concrete substrate) and FR-007
(rules live in one place: the compass + WORKFLOW.md).

**Alternatives considered**:
- Reimplement phase logic inside the verdict — rejected: duplicates 022, drifts (FR-007).
- Overload `workflow next` with an `--intent` flag — rejected per design decision #7: `next`
  previews; `compass` adds intent-diff + verdict + gating exit code (a distinct contract).

## R2 — Intent vocabulary: fixed enumeration keyed to the WORKFLOW.md work skills

**Decision**: A fixed `Map<intentName, phaseId>` in `intent-vocabulary.ts`. The intent names
are the lifecycle skill/verb names (`design`, `define`/`specify`, `execute`/`speckit-implement`,
`govern`, `ship`, `release`, `session-end`). The phase each maps to is **derived from the
governed `WORKFLOW.md`** — each phase already names its `work:` skill (`Phase.work`), so the
enumeration is built by inverting `phase.work → phase.id` plus a small fixed set of
transition-intent aliases (e.g. `ship`/`release` → the `governing→shipped` region). An intent
not in the map throws a `WorkflowError` (exit non-zero) — never classified `on-course`.

**Rationale**: FR-004 mandates a fixed enumeration with fail-loud on unknown — a heuristic
NL→phase mapping reintroduces the agent judgment the feature removes. Keying off `Phase.work`
keeps the vocabulary single-sourced from the governed doc (FR-007) rather than a second
hand-maintained table that could drift from the phases.

**Alternatives considered**:
- Free-form NL intent mapped heuristically — rejected (FR-004, clarification 2026-06-16).
- A standalone hardcoded table independent of WORKFLOW.md — rejected: drifts from the phase
  vocabulary when a phase/work skill changes; violates FR-007 single-source.
- Unknown intent treated as advisory `on-course` — rejected: that is the silent-skip hole.

## R3 — Gating via process exit code (no prose parsing)

**Decision**: The verdict maps to an exit code: `on-course` → 0; `ahead`/`off-rail` → non-zero
(distinct codes so a skill can tell "skipped a step" from "off the rail"); `behind` →
0-with-note (re-entry/redundant is allowed, per design decision: `behind` = allow-with-note).
`--json` emits the machine-readable verdict for non-CC adapters. The CLI verb reuses the
existing `workflow.ts` dispatch + `failUsage`/exit conventions (exit 2 = usage/parse).

**Rationale**: FR-003 — a skill body gates on the exit code without parsing prose. The exit-code
split (ahead vs off-rail) lets the embedding skill name the precise violated invariant (FR-006).

**Alternatives considered**:
- Single non-zero for all refusals — rejected: loses the ahead-vs-off-rail distinction the
  skill message needs.
- Parse stdout prose in the skill body — rejected: brittle; FR-003 exists to avoid it.

## R4 — Skill-precondition embedding: one shared helper, invoked by skill bodies

**Decision**: A shared `lifecycle-precondition.ts` exposes the canonical "open with the compass"
contract (resolve item → run `workflow compass <item> --intent <skill>` → refuse loud on
non-zero, naming the violated invariant + the skipped step). Each lifecycle SKILL.md opens by
invoking the compass verb (the skill body is the firing surface, per
`enforcement-lives-in-skills.md`); the helper centralizes the CLI invocation + message shape so
the skills don't re-encode the gate logic (FR-007).

**Rationale**: Design decision #2 (single enforcement brain) + FR-006/FR-007. The skill body is
the enforcement surface that travels with the plugin install — not a hook. The helper prevents
N copies of the precondition drifting (Alternative B rejected in the design record).

**Alternatives considered**:
- Bespoke gate code per skill — rejected (design Alternative B: N copies drift).
- A git-hook precondition — rejected (design Alternative C; `enforcement-lives-in-skills.md`).

## R5 — Govern feature resolution from the item, not the branch slug (FR-011)

**Decision**: Add an item-driven resolution path to govern. When invoked for a roadmap item
(the `after_implement` hook and `execute` both know the item), govern resolves the feature from
the item's recorded `spec:` pointer (the roadmap node) — falling back to the active-feature
marker, which as built is Spec Kit's own `.specify/feature.json` (`feature_directory` basename),
NOT a separate `CLAUDE.md` marker (Principle VIII — read the tool's pointer; AUDIT-BARRAGE
claude-03) — instead of `resolveSlug({branch})`. The existing `resolveSlug` branch-derivation stays
as the explicit-`--feature` / legacy path; the new path is preferred when an item/spec pointer
is available, so the session-pinned `feature/stack-control` branch no longer FATALs
"feature 'stack-control' not found".

**Rationale**: FR-011 + the verified blocker (govern FATALs on the session-pinned branch for
every spec). The roadmap node's `spec:` pointer is the authoritative feature→spec binding the
022 engine already maintains; reusing it unifies with FR-013's canonical identity.

**Alternatives considered**:
- Always require explicit `--feature` from the hook — rejected: the `after_implement` hook
  passes none and shouldn't have to; the item already names its spec.
- Rename the branch per feature — rejected: the session-pinned branch carries many features by
  design (ratified framing); per-spec branches are explicitly not used here.

## R6 — TASK-83: backtick skill-reference span is not a governed path (FR-012)

**Decision**: In `incremental-audit.ts` `extractScopedPaths`, exclude backtick tokens that are
skill/verb references rather than filesystem paths. A token like `` `/stack-control:define` ``
contains a `:` namespace segment and is not a real path; the extractor must skip tokens matching
the skill-reference shape (a `:`-bearing `/<plugin>:<verb>` token, and more generally a token
that does not resolve to an installation-relative path) before they reach the governed-path
validator that throws "escapes the installation root". Fix is localized to the extractor; it must
not grow `payload-implement.ts` (already over the line cap — TASK-48).

**Rationale**: FR-012 + reproduced TASK-83/AUDIT-20260614-28. The crash is a category error —
treating a documentation code-span as a path. The correct fix is at the classification point
(extractor), not by widening the validator.

**Alternatives considered**:
- Loosen the governed-path validator to tolerate the token — rejected: it would let real escape
  paths through; the validator is correct, the extractor's input is wrong.
- Strip all backtick spans — rejected: real `` `path/to/file.ts` `` scope spans are legitimate
  and must still be extracted.

## R7 — Canonical feature identity (FR-013 / TASK-139)

**Decision**: A single `identity.ts` resolver computes one canonical identity for a feature from
the roadmap node, routing the compass, govern, the convergence record, and `close-related`
through it. The identity is the **roadmap node id** (the stable `<phase>:<codename>` key), with
the spec-dir binding carried by the node's `spec:` pointer — NOT the spec-dir basename. The
convergence record is keyed by this canonical identity instead of `basename(item.spec)`
(today's collision source in `workflow-context.ts` and `convergence-record.ts`), eliminating
the basename-collision class (two specs sharing a dir basename).

**Rationale**: FR-013 + TASK-139. The three subsystems identify a feature three ways today
(branch slug / spec-dir basename / node id); the node id is the one already-stable key the
roadmap maintains and the workflow engine resolves items by. Keying convergence on it makes the
identity principled rather than patched (US6).

**Alternatives considered**:
- Key on a hash of the spec dir's absolute path — rejected: not human-legible; breaks on a
  tree-move (TASK-47 territory); the node id is already canonical.
- Leave basename keying and just detect collisions — rejected: detection is not resolution;
  US6 asks for one identity, not a collision warning.

## R8 — FR-010 report-only retirement: phased, two enforced gates first

**Decision**: Retire report-only (FR-010) only where this feature enforces: (1) the **entry
gate** — orphan/capture is a hard error (US3/FR-008/FR-009); (2) the back-half
**`governing → shipped`** transition gate — refuses on an unmet exit gate (US5). The engine's
own `advance` path keeps mid-pipeline gates **advisory** during migration; mid-pipeline ORDER
is still enforced by the compass embedded in the skills (FR-006). Legacy: the 21+ shipped nodes
are grandfathered (terminal-status derivation already reports them `shipped`); in-flight items
are reconciled/flagged, not refused retroactively (spec Assumptions).

**Rationale**: Clarification 2026-06-16 (phased, not global). A global flip risks blocking
legitimate in-flight work before the govern fixes are proven. The compass at the skill surface
already delivers order-enforcement; the engine's advance path tightens incrementally.

**Alternatives considered**:
- Global flip of all gates to refusals now — rejected (clarification): premature, blocks
  in-flight work before govern runnability is proven.
- Keep everything report-only — rejected: that is the no-teeth status quo this feature kills.

## R9 — Sequencing (FR-015): prerequisites lead

**Decision**: Implementation order is govern-runnability (R5/R6, FR-011/FR-012) → canonical
identity (R7, FR-013) → compass primitive (R1–R3) → skill embedding + capture-fusion (R4, US2/US3)
→ FR-010 retirement on the two enforced gates (R8). The prerequisites lead because "a gate cannot
enforce a step that cannot run."

**Rationale**: FR-015 (operator-clarified). Encoded into the task ordering at `/speckit-tasks`.

**Alternatives considered**:
- Ship the compass first, fix govern later — rejected (FR-015): the back-half gate would block
  all work instead of enforcing the step.
