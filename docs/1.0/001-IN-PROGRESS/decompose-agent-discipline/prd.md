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

## Disposition table (first draft — subject to PRD review)

The disposition column captures the brainstorming-thread first draft. Operator confirmation via margin notes turns this into the workplan source-of-truth.

| # | Line | Rule | Disposition | Destination |
|---|---|---|---|---|
| 1 | 5 | Use /frontend-design for design tasks | `compose-into-skill` | `/dw-lifecycle:implement` precondition + `/dw-lifecycle:setup` design-shaped check |
| 2 | 17 | Use /dw-lifecycle:review after every step | `delete` | Superseded by audit-barrage hook — no replacement |
| 3 | 36 | Audit findings: scope-don't-defer + TDD | `compose-into-skill` (DONE) | `scope-discovery:promote-findings` SKILL.md + doctor rules already exist; pointer only |
| 4 | 75 | Audit-barrage | `compose-into-skill` (DONE) | `/dw-lifecycle:audit-barrage` SKILL.md already exists; pointer only |
| 5 | 126 | scope-discovery v1 — tooling-feedback | `compose-into-skill` | `scope-inventory` skill body + `/dw-lifecycle:setup` (seeds the template) |
| 6 | 144 | Inventory vs discovery — reading reports | `compose-into-skill` | `scope-inventory` skill body (output-interpretation section) — partial mechanization already exists via stderr |
| 7 | 185 | Read docs before quoting commands | `stays-shrunk` | No clear trigger — always-on default; shrink from ~10 lines to ~5 |
| 8 | 196 | Operator owns scope decisions | Mixed | Sub-agent dispatch-report handling → `/dw-lifecycle:implement`; operator-hedge-default-to-ASK part `stays-shrunk` |
| 9 | 211 | Capture mode vs scope mode | `compose-into-skill` | `/dw-lifecycle:define` + `/deskwork:iterate` skill bodies (**upstream question — see open-questions**) |
| 10 | 256 | Empty revisions beat missed changes | `compose-into-skill` | `/deskwork:iterate` + `/deskwork:approve` skill bodies (**upstream question — see open-questions**) |
| 11 | 276 | Orchestrator session ≠ implementation session | `compose-into-skill` + `gate-or-hook` | `/dw-lifecycle:setup`,`:issues` exit-step + `/dw-lifecycle:implement` precondition refuses to run in main repo working tree (**upstream question — see open-questions**) |
| 12 | 315 | "Just for now" is bullshit | **DEFER** | Operator-flagged load-bearing; left untouched this feature |
| 13 | 364 | Packaging is UX | `compose-into-skill` | `/dw-lifecycle:review` install-evaluation handling (**upstream question — see open-questions**) |
| 14 | 375 | Use plugin only through public distribution | `stays-shrunk` | Doctor rule could detect local-symlink invocation but irreducible at root |
| 15 | 390 | Never pass `--no-tailscale` | `tool-fix` | Remove flag from bin shim OR make it a no-op alias with stderr warning; smoke scripts use env var |
| 16 | 404 | Memory-vs-rule placement | `stays-shrunk` | Meta-rule about this file; shrink to ~3 lines |
| 17 | 417 | Namespace deskwork-owned metadata | `gate-or-hook` + `compose-into-skill` | Schema-write helpers refuse top-level writes (fail loud); doctor rule scans existing sidecars (**upstream question — see open-questions**) |
| 18a | 429 | Stay on feature/deskwork-plugin | `compose-into-skill` | `/dw-lifecycle:setup` knows project convention |
| 18b | 429 | Don't pitch /schedule check-ins | `session-start` or `stays-shrunk` | System-prompt-induced reflex suppression — could move to CLAUDE.md or SessionStart hook |
| 18c | 429 | No test infrastructure in CI | `stays-shrunk` | Compose into CI-touching skills if any; otherwise stays |
| 18d | 429 | Content-management databases preserve | `stays-shrunk` | Future `/deskwork:remove` skill could compose; for now stays |
| 18e | 429 | Stay in agent-as-user dogfood mode | `stays-shrunk` | Pure culture/taste |
| 19 | 487 | Issue closure requires verification | `compose-into-skill` | Hygiene `close-shipped` skill + `/dw-lifecycle:complete` — partial mechanization already exists |
| 19b | (sub) | Marketplace-clone script names + flags are an adopter contract | TBD by PRD review | Lives inside entry 19's section — could move to `dw-lifecycle/scripts/CONTRACT.md` or stay |
| 20 | 526 | Closure is a structural step | `compose-into-skill` (DONE) | Hygiene-family SKILL.md cross-link section already exists; pointer only |

## Open questions for PRD review

These are the deliberate margin-note prompts. The disposition table is the agent's first-pass triage; these questions are the points the operator should override or confirm.

1. **Upstream-scope split.** Entries 9, 10, 11, 13, 17 compose into skill bodies in plugins outside `dw-lifecycle` (mostly `deskwork`) or require new gate/doctor-rule code in shared packages. Two options:
   - **In-scope:** this feature reaches into the upstream plugin source. Risk: scope creep, longer cycle, potential conflicts with other in-flight work in those plugins.
   - **Sibling feature:** this feature ships only the in-repo and irreducible-stays dispositions; the upstream composes get a sibling feature (`decompose-agent-discipline-upstream` or similar). Risk: agent-discipline.md retains pointer entries to "see sibling feature #NNN" until the sibling lands.
2. **STAYS cluster placement.** Entries 7, 14, 16, 18a–e all end up `stays-shrunk`. Should the whole cluster move to a sibling rule file (`.claude/rules/project-conventions.md`) so that what remains in `agent-discipline.md` is purely irreducible always-on agent-behavior defaults — and a separate file owns project conventions?
3. **Entry 18 cluster triage shape.** Entry 18 is one `## ` heading covering five sub-rules. Triage as one unit (whole cluster has one disposition) or per-sub-rule (each gets its own — as currently drafted)?
4. **Marketplace-clone-script-contract sub-rule (19b).** It lives inside entry 19's section by file position but governs an orthogonal concern (CLI flag stability). Disposition target?
5. **Ordering.** First-draft order: pure-deletes → DONE-pointer-shrinks → tool-fixes → in-repo composes → upstream composes → shrunk-stays. Confirm or re-order?
6. **Rule-12 deferral mechanism.** Operator deferred entry 12. Should the deferral be recorded in this PRD's Out-of-Scope section explicitly (so future feature-extension can re-pick-up), or in a separate `[debt: #NNN]` GitHub issue?

## Acceptance Criteria

- [ ] PRD disposition table (above) has been iterated via deskwork until the operator clicks Approve and the workflow state is `applied`.
- [ ] `agent-discipline.md` is at 150–200 lines after Phase 2 completes (down from 566).
- [ ] Every entry whose disposition was `compose-into-skill` or `new-skill` has a verifiable new home cited by file path in the workplan's task closure.
- [ ] Every entry whose disposition was `gate-or-hook` ships with a test exercising the new failure path (per the audit-discipline TDD enforcement in agent-discipline.md entry 3).
- [ ] Every entry whose disposition was `tool-fix` removes the failure-mode source at the tool level (flag deletion, schema rejection, etc.).
- [ ] Every entry whose disposition was `stays-shrunk` has been rewritten to ≤10 lines while preserving the "Why" and "How to apply" structure.
- [ ] Entry 12 ("Just for now" is bullshit) is unchanged from its pre-feature state.
- [ ] Entry 2 (Use /dw-lifecycle:review after every step) is deleted entirely.
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
