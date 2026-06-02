---
slug: decompose-agent-discipline
title: decompose-agent-discipline
targetVersion: "1.0"
date: 2026-05-30
parentIssue:
deskwork:
  id: 38410ae2-0e2a-4d09-84b4-f441b38c1e59
---

# PRD: decompose-agent-discipline

## Problem Statement

`.claude/rules/agent-discipline.md` has grown to 566 lines — well over the 300–500 line cap CLAUDE.md mandates — and continues to silt up. Two intertwined issues:

1. **Always-on context cost.** Every rule in this file loads on every turn (it's pulled into the system prompt). The corpus has crossed the threshold where the marginal rule costs more in per-turn budget than it earns in behavioral signal.

2. **Policy embedded in rules is less effective than policy enforced in process.** This is the operator's load-bearing observation, and the dw-lifecycle plugin's history corroborates it: much of what's now mechanized as CLI verbs, doctor rules, and skill bodies (scope-discovery closure triad, audit-barrage, hygiene closure family, pre-commit hooks) started life as policy in this file and didn't gain teeth until converted to process. We've silted up again with policy that is likely more effective as process.

The motivating thesis: **decompose rules into skills (or skill bodies, gates, doctor rules, tool fixes) where possible.** Rules that resist decomposition stay in `agent-discipline.md`; rules that can be mechanized should be.

## Solution

Triage each of the 21 entries in `agent-discipline.md` to its most effective home. For each entry, pick one disposition from a fixed menu, then implement that disposition incrementally — landing the new home AND the corresponding edit to `agent-discipline.md` in the same commit so the audit trail stays legible.

The deliverable is a slimmed `agent-discipline.md` (~150–200 lines, all of it either pointer text or genuinely irreducible always-on default) plus the destinations the displaced content moves to (skill bodies, gate/hook scripts, doctor rules, tool-shim edits).

The work splits into two phases. Phase 1 stabilizes the **disposition plan itself** via the deskwork review tooling — the operator iterates the per-rule disposition table via studio margin notes; the agent runs `/deskwork:iterate` to address comments; the cycle repeats until applied. Phase 2 walks the stabilized plan as per-rule implementation commits. This split is intentional: the disposition table is the artifact under operator review, and developing it via deskwork (rather than in conversation) gives it the same auditable revision history every other PRD on this project carries.

## Conversion menu

Each rule's disposition picks from this menu:

| Disposition | Meaning |
|---|---|
| `compose-into-skill` | Rule content moves into the body of an existing skill in `plugins/<plugin>/skills/<name>/SKILL.md`. Agent-discipline.md shrinks to a 1-line pointer. |
| `new-skill` | Rule content becomes its own new skill. Agent-discipline.md shrinks to a 1-line pointer. |
| `gate-or-hook` | Rule is enforced structurally via a commit-msg hook, pre-commit hook, doctor rule, or schema validator. Agent-discipline.md shrinks to a 1-line pointer or is deleted entirely (if the gate fully replaces the policy). |
| `tool-fix` | The pathological behavior is removed at the source — a CLI flag is deleted or no-op'd, a write helper refuses the bad shape, an option is removed. Agent-discipline.md entry is deleted (when the bait is gone) or shrunk (when residual judgment remains). |
| `session-start` | Rule is injected via a `.claude/settings.json` SessionStart hook (the harness loads it on session bootstrap, not via always-loaded rule prose). Agent-discipline.md entry is deleted. |
| `stays-shrunk` | Rule is irreducible always-on default and stays in `agent-discipline.md`, rewritten to its minimum useful form (3–10 lines). |
| `delete` | Rule is wholly superseded or no longer applicable. Removed with no replacement. |

## Disposition table (operator-reviewed — revision 2)

The disposition column started as the brainstorming-thread first draft; revision 2 folds in the operator's margin notes. Open questions that were "upstream-scope" prompts are now resolved (all deskwork-family plugins are in-scope — see *Resolved questions*), so the per-row "upstream question" markers are gone.

| # | Line | Rule | Disposition | Destination |
|---|---|---|---|---|
| 1 | 5 | Use /frontend-design for design tasks | `compose-into-skill` | `/dw-lifecycle:implement` precondition + `/dw-lifecycle:setup` design-shaped check |
| 2 | 17 | Use /dw-lifecycle:review after every step | `delete` | Operator-confirmed: review is no longer hooked into the iterate cycle (superseded by the audit-barrage hook) and is not operationally enforced. Delete the rule entry. **Also surfaces a larger scope item — retire the `/dw-lifecycle:review` + `/dw-lifecycle:audit` skills in favor of audit-barrage; see *Operator-raised: retire review/audit*.** |
| 3 | 36 | Audit findings: scope-don't-defer + TDD | `compose-into-skill` (DONE) | `scope-discovery:promote-findings` SKILL.md + doctor rules already exist; pointer only |
| 4 | 75 | Audit-barrage | `compose-into-skill` (DONE) | `/dw-lifecycle:audit-barrage` SKILL.md already exists; pointer only |
| 5 | 126 | scope-discovery v1 — tooling-feedback | `compose-into-skill` | `scope-inventory` skill body + `/dw-lifecycle:setup` (seeds the template) |
| 6 | 144 | Inventory vs discovery — reading reports | `compose-into-skill` | `scope-inventory` skill body (output-interpretation section) — partial mechanization already exists via stderr |
| 7 | 185 | Read docs before quoting commands | `stays-shrunk` | No clear trigger — always-on default; shrink from ~10 lines to ~5 |
| 8 | 196 | Operator owns scope decisions | Mixed | Sub-agent dispatch-report handling → `/dw-lifecycle:implement`; operator-hedge-default-to-ASK part `stays-shrunk` |
| 9 | 211 | Capture mode vs scope mode | `compose-into-skill` | `/dw-lifecycle:define` + `/deskwork:iterate` skill bodies (in-scope) |
| 10 | 256 | Empty revisions beat missed changes | `compose-into-skill` | `/deskwork:iterate` + `/deskwork:approve` skill bodies (in-scope) |
| 11 | 276 | Orchestrator session ≠ implementation session | `compose-into-skill` + `gate-or-hook` | `/dw-lifecycle:setup`,`:issues` exit-step + `/dw-lifecycle:implement` precondition refuses to run in main repo working tree (in-scope) |
| 12 | 315 | "Just for now" is bullshit | **DEFER** | Operator-flagged load-bearing; left untouched this feature |
| 13 | 364 | Packaging is UX | `compose-into-skill` | `/dw-lifecycle:complete` / hygiene `close-shipped` install-evaluation handling (in-scope; routed away from `/dw-lifecycle:review` since that skill is itself slated for retirement — see row 2) |
| 14 | 375 | Use plugin only through public distribution | `stays-shrunk` | Doctor rule could detect local-symlink invocation but irreducible at root |
| 15 | 390 | Never pass `--no-tailscale` | `tool-fix` | Remove flag from bin shim OR make it a no-op alias with stderr warning; smoke scripts use env var |
| 16 | 404 | Memory-vs-rule placement | `stays-shrunk` | Meta-rule about this file; shrink to ~3 lines |
| 17 | 417 | Namespace deskwork-owned metadata | `gate-or-hook` + `compose-into-skill` | Schema-write helpers refuse top-level writes (fail loud); doctor rule scans existing sidecars (in-scope) |
| 18a | 429 | Stay on feature/deskwork-plugin | `delete` | Operator-confirmed: no longer relevant. This feature's own branch is `feature/decompose-agent-discipline`, not `feature/deskwork-plugin`; the single-long-lived-branch convention named here is stale. Delete the sub-rule. |
| 18b | 429 | Don't pitch /schedule check-ins | `session-start` or `stays-shrunk` | System-prompt-induced reflex suppression — could move to CLAUDE.md or SessionStart hook |
| 18c | 429 | No test infrastructure in CI | `stays-shrunk` | Compose into CI-touching skills if any; otherwise stays |
| 18d | 429 | Content-management databases preserve | `stays-shrunk` | Future `/deskwork:remove` skill could compose; for now stays |
| 18e | 429 | Stay in agent-as-user dogfood mode | `stays-shrunk` | Pure culture/taste |
| 19 | 487 | Issue closure requires verification | `compose-into-skill` | Hygiene `close-shipped` skill + `/dw-lifecycle:complete` — partial mechanization already exists |
| 19b | (sub) | Marketplace-clone script names + flags are an adopter contract | `stays-shrunk` | Least-dumb call: this governs CLI flag/path/exit-code stability for scripts adopters wire into SessionStart hooks — a real but narrow contract with no skill trigger and no existing gate. Shrink to ~2 lines in place (don't spin up a separate `CONTRACT.md` that also loads nowhere useful). A future gate (a test asserting documented flags still parse) is possible but speculative — not built in this feature. |
| 20 | 526 | Closure is a structural step | `compose-into-skill` (DONE) | Hygiene-family SKILL.md cross-link section already exists; pointer only |

## Resolved questions (revision 2)

The first-draft open questions are now resolved — by operator margin note where one was left, by the agent's "least dumb thing" judgment where the operator delegated ("do the least dumb thing" / "I don't care"). Recorded here so the decisions carry an audit trail rather than living only in conversation.

1. **Upstream-scope split → RESOLVED: all in-scope, no sibling feature.** Operator: *"deskwork **is** in this repository. All of the deskwork family of plugins are in scope."* Entries 9, 10, 11, 13, 17 compose into `deskwork`-plugin skill bodies (and shared-package gate/doctor code) **inside this feature**. The "sibling feature" option is dropped; the per-row "upstream question" markers are removed from the table above. agent-discipline.md will not carry "see sibling feature #NNN" pointers.

2. **STAYS cluster placement → RESOLVED: shrink in place; do NOT create `project-conventions.md`.** A separate `.claude/rules/project-conventions.md` would load on every turn exactly like `agent-discipline.md` does, so relocating the cluster there buys **zero** reduction in the always-on context cost that is Problem #1 — it just moves bytes between two always-loaded files. The least-dumb path: route each STAYS-cluster sub-rule that *has* a real home into that home (a skill body, a gate, or a SessionStart hook), and shrink the genuinely-irreducible remainder in place within `agent-discipline.md`. No new always-loaded rule file is created.

3. **Entry 18 cluster triage shape → RESOLVED: per-sub-rule.** The five sub-rules under the one `## Project workflow conventions` heading are orthogonal concerns (branch convention, `/schedule` pitch suppression, no-CI-test-infra, content-DB-preserve, dogfood-mode). Each gets its own disposition (18a `delete`, 18b–e as drafted). Triaging them as one unit would force the lowest-common-denominator disposition (`stays-shrunk`) onto sub-rules that can actually be decomposed (18a is a `delete`).

4. **Marketplace-clone-script-contract sub-rule (19b) → RESOLVED: `stays-shrunk`.** See the table row — narrow real contract, no skill trigger, no existing gate; shrink in place, don't spin up a separate file.

5. **Ordering → RESOLVED: keep the risk-minimizing order, minus the now-removed upstream tier.** deletes → DONE-pointer-shrinks → tool-fixes → composes (in-repo + deskwork-plugin, now one tier since the sibling split is gone) → shrunk-stays. Phase 2 sub-phases (2a–2e) follow this order.

6. **Rule-12 deferral mechanism → RESOLVED: PRD Out-of-Scope is the record; no separate debt issue.** Entry 12 is already captured in the Out-of-Scope section below. A standalone `[debt: #NNN]` issue for "we intentionally left a load-bearing rule untouched" would be tracking-noise — the deferral is legible in the PRD, and a future `/dw-lifecycle:extend` can re-pick-it-up from there.

## Operator-raised: retire `/dw-lifecycle:review` + `/dw-lifecycle:audit` in favor of audit-barrage

Margin note on row 2 (verbatim): *"the review skill is no longer hooked into the iterate cycle—superseded by the audit barrage hook. Review is no longer operationally enforced, so we shouldn't put anything in there. In fact, we should consider retiring review and audit in favor of audit barrage."*

This is broader than deleting one rule entry — it proposes retiring two skills. Captured here in full (capture mode; scoping is a separate operator-driven pass):

**What "retire review + audit" would entail (surface inventory — to be confirmed before any deletion):**
- `/dw-lifecycle:review` skill (`plugins/dw-lifecycle/skills/review/SKILL.md`) and its CLI surface.
- `/dw-lifecycle:audit` skill — currently an **alias** of `/dw-lifecycle:review` (same three-track protocol + durable audit-log workflow).
- The durable **audit-log workflow** both drive (`docs/.../audit-log.md` per feature). audit-barrage *feeds* the audit-log today but does not own the lifecycle around it — retiring review/audit means audit-barrage (or a successor) has to own audit-log creation + the promote-findings/closure-triad entry points that currently reference the review cycle.
- Every cross-reference in `.claude/rules/agent-discipline.md` (the "Use /dw-lifecycle:review after every implementation step" rule = row 2, plus the audit-barrage rule's "three independent audit surfaces" framing, which names review as surface #2 of 3) and in `.claude/CLAUDE.md` (the sub-agent-delegation table lists `code-reviewer`).
- The `/dw-lifecycle:review` invocations baked into other skills' "after every commit" steps.

**Decision (operator, at revision-2 approval — "follow your recommendation"):** the retirement is **split into its own feature**, tracked at **[#387](https://github.com/audiocontrol-org/deskwork/issues/387)**. This feature (`decompose-agent-discipline`) does the mechanically-separable part: **delete row 2's dead rule entry** (the rule is dead regardless of the skill's fate). The skill retirement — removing `/dw-lifecycle:review` + `/dw-lifecycle:audit`, rehoming the audit-log lifecycle + closure-triad entry points, and updating the "three audit surfaces" framing — is a multi-skill architectural change carried by #387, not by this feature's Phase 2.

## Acceptance Criteria

- [ ] PRD disposition table (above) has been iterated via deskwork until the operator clicks Approve and the workflow state is `applied`.
- [ ] `agent-discipline.md` is at 150–200 lines after Phase 2 completes (down from 566).
- [ ] Every entry whose disposition was `compose-into-skill` or `new-skill` has a verifiable new home cited by file path in the workplan's task closure.
- [ ] Every entry whose disposition was `gate-or-hook` ships with a test exercising the new failure path (per the audit-discipline TDD enforcement in agent-discipline.md entry 3).
- [ ] Every entry whose disposition was `tool-fix` removes the failure-mode source at the tool level (flag deletion, schema rejection, etc.).
- [ ] Every entry whose disposition was `stays-shrunk` has been rewritten to ≤10 lines while preserving the "Why" and "How to apply" structure.
- [ ] Entry 12 ("Just for now" is bullshit) is unchanged from its pre-feature state.
- [ ] Entry 2 (Use /dw-lifecycle:review after every step) is deleted entirely.
- [ ] Entry 18a (Stay on feature/deskwork-plugin) is deleted entirely (stale convention).
- [ ] All `deskwork`-plugin composes (entries 9, 10, 13, and the deskwork-side of 17) land inside this feature — no sibling feature is filed for them.
- [ ] No new always-loaded rule file (`project-conventions.md` or similar) is created; the STAYS cluster shrinks in place or routes into a skill/gate/SessionStart home.
- [ ] The operator-raised "retire `/dw-lifecycle:review` + `/dw-lifecycle:audit` in favor of audit-barrage" item is split to its own feature ([#387](https://github.com/audiocontrol-org/deskwork/issues/387)); this feature only deletes row 2's dead rule entry (see acceptance criterion for entry 2).
- [ ] No commit in this feature's range introduces a `// TODO|// FIXME|// for now` comment without paired GitHub issue link (existing pre-commit hook + audit-barrage gate continue to apply mid-stream).
- [ ] Audit-log entry for this feature summarizes per-disposition outcomes by entry number.

## Out of Scope

- Other rule files (`.claude/rules/design-standards.md`, `state-machine.md`, `ui-verification.md`, `affordance-placement.md`, `documentation.md`, `testing.md`, `workflow-playbooks.md`, `file-handling.md`, `session-analytics.md`). They're small (≤93 lines each) and not silted; the conversion criteria developed here may inform a later pass on them but that work is a separate feature.
- `.claude/CLAUDE.md` decomposition (253 lines). Also a separate feature.
- Entry 12 ("Just for now" is bullshit, lines 315–362). Operator-flagged load-bearing; intentionally untouched.
- Decomposition of rules in the `~/.claude/CLAUDE.md` global instructions or `~/work/CLAUDE.md` work-level instructions. This feature operates only on the `deskwork` project-scoped rules.

## Technical Approach

### Phase 1 — Stabilize the disposition table via deskwork review

The disposition table above is a first draft from brainstorming. Several entries carry deliberate uncertainty marked as "upstream question" or as one of the six numbered open questions. Phase 1's job is to drive that table to a stable state via the deskwork review tooling:

1. Operator opens the studio review URL for this PRD.
2. Operator leaves margin notes on disposition cells, on open-question prompts, or on any section.
3. Operator requests iteration.
4. Agent runs `/deskwork:iterate` to read comments, edit the PRD (typically the disposition table or open-questions list), snapshot the new revision, and report.
5. Cycle until the operator clicks Approve and the workflow state becomes `applied`.

Per the per-CLAUDE.md gate: **no Phase 2 work begins until the PRD's deskwork workflow state is `applied`.** This is the same strict gate every other feature on this project uses; this feature does not get an exception.

### Phase 2 — Per-disposition implementation cycles

After the disposition table is applied, `/dw-lifecycle:extend` adds Phase 2 sub-phases (2a–2e, organized by disposition class for risk minimization) to the workplan, then `/dw-lifecycle:issues` files the corresponding GitHub issues.

Each Phase 2 task lands as one commit per rule (or one per tight cluster) with this shape:

1. Write or edit the destination (skill body / gate script / doctor rule / tool shim).
2. Edit `agent-discipline.md` in the same commit: shrink the entry to a pointer, or delete it outright per the disposition.
3. Commit message names the entry number and the destination; the audit-log entry for this feature back-fills the per-entry outcome.

The existing audit-barrage commit hook continues to fire on every Phase 2 commit. Entry 12's discipline applies mid-stream (deferring rule 12 does not deactivate it).

### Why the two-phase split

Per the operator's framing in the brainstorming thread: *"the first part of the implementation plan should be a continuation of this exploration, but we'll use the deskwork review tooling to develop the disposition plan."* This is exactly what the two-phase split mechanizes — Phase 1 IS the continued exploration, hosted in the deskwork review surface (margin notes + iteration snapshots) rather than in conversation, so the iteration trail is permanently recorded. Phase 2 then walks the operator-confirmed plan.

This pattern also honors the "Capture mode vs scope mode" rule from `agent-discipline.md` (line 211) which this feature itself targets for decomposition: the PRD captures every disposition we're considering — including ones the operator may overturn — and scoping (which dispositions actually ship and in what order) is a separate operator-driven activity inside the review surface.
