---
id: TASK-13
title: >-
  Make session-end → clear → session-start the explicit alternative to context
  compaction in long /dwi loops
status: To Do
assignee: []
created_date: '2026-06-10 20:07'
labels:
  - 'type:imported-issue'
  - enhancement
dependencies: []
references:
  - gh-408
ordinal: 13000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Problem

After a long `/dw-lifecycle:implement` (`/dwi`) loop — concretely, 38+ commits across 4 hours on `feature/scope-discovery` 2026-06-03 — agent output quality degraded in a repeatable shape. The agent produced confident-sounding but provably wrong artifacts that the audit-barrage caught, then re-introduced similar-shaped errors in the fixes. The agent itself surfaced this as "session fatigue," but the mechanics aren't human-fatigue analogues — they're a specific compound of failure modes.

This issue captures (a) what the failure modes actually are, (b) why context compaction is a worse intervention than session-end + clear + session-start, and (c) concrete enhancements to the iterate tooling to make the cycle explicit.

## Observed failure modes

### 1. Context-window dilution

The earliest things in the session (CLAUDE.md, agent-discipline.md rules, prior session journal entries) get summarized or pushed past the model's effective attention. Concrete example: the agent "knew" CLAUDE.md's AUDIT-04 arithmetic-reconciliation convention at hour 1 but wrote three contradictory commit counts in the same Quantitative paragraph at hour 4 (which AUDIT-20260603-78 caught).

### 2. Self-confirmation loops

Each commit that ships feels like progress, reducing care on the next one. The audit-barrage caught real defects (over-broad regex in AUDIT-81; the false claim that `apply-audit-flips` reads `Acknowledges` trailers in AUDIT-50; duplicate Task 20 numbering in AUDIT-86) that the agent's own self-review missed.

### 3. Pattern-match-substitute, not principled recall

When the agent writes a fix-task disposition, it produces something *shaped like* a correct disposition without re-reading the actual source code. AUDIT-50 caught the agent claiming `apply-audit-flips` reads `Acknowledges` trailers, when the source at `auto-flip-from-commit.ts:43` is `CLOSES_VERB_RE = /\bcloses\b[\s:]+/gi` — `Closes` only. The agent had access to the same source and didn't re-read it.

### 4. Recursive meta-findings

The audit-barrage started flagging the *form* of fix-task blocks rather than the substance (AUDIT-72 → 76 → 79 → 83 caught the same "fix-task block with unchecked TDD scaffolds for already-done doc-only work" pattern across four iterations). Each round of follow-ups created new fix-task blocks that themselves got flagged. The per-cycle marginal value drops as the recursion deepens; eventually each new finding is a meta-pattern about the fix-task lifecycle, not a substantive defect in the work product.

### 5. Concrete evidence from this session

- Hour 1: shipped Phase 24 Task 1 cleanly — ADR + rule, careful citation of THESIS, four files coordinated.
- Hour 4: shipped AUDIT-78's journal arithmetic with three contradictory counts in the same paragraph (`"10 findings" / 12 IDs enumerated / 15 in cited range`).
- The drop wasn't because hour-4 work was harder — it was *easier* (counting numbers vs synthesizing an architectural reframe). The work-quality discipline degraded as the session lengthened.

## Why context compaction is worse than session-end + clear + session-start

### Compaction amplifies pattern-match-substitute

The failure mode is acting on a digest of what was done rather than re-reading the source. **Compaction IS that digest.** It compresses concrete evidence ("here's the exact `CLOSES_VERB_RE` regex in auto-flip-from-commit.ts:43") down to summary ("apply-audit-flips parses Closes trailers"). The compressed form *feels* like fact; the original line was *evidence*. Acting on the compressed form is what produced AUDIT-50. Compaction would amplify that exact failure mode.

### Compaction is lossy on the rules layer

Earlier rules and conventions (CLAUDE.md, agent-discipline.md, the workplan body) aren't in the conversation in the first place — they're loaded via system reminder / file reads. Compaction can't lose them. **What compaction loses is the in-conversation evidence of what the agent just got wrong and how the audit caught it.** That evidence is precisely what makes the agent MORE careful in the next commit. Losing it degrades quality further.

### Session-end+clear+session-start writes durable artifacts deliberately

The journal entry, workplan checkbox state, audit-log statuses, README phase table — these are the SAME information compaction would summarize, but written by the agent *deliberately for a future reader* (the agent in the next session). They're already optimized for "future reader in fresh context" because that's literally what the journal-entry template is for.

When the next session reads those, it reads them **critically** — checking the claims against the code. In-session, the agent trusts its own commit message from 30 minutes ago.

### The session-end skill exists for exactly this

The `/dw-lifecycle:session-end` + `/dw-lifecycle:session-start` + `dw-lifecycle session-end-hygiene` + `dw-lifecycle session-start-recommendation` family exists because operators figured this out empirically. The hygiene-recommendation handoff at session-end → session-start replay IS the project-architected version of "compaction done right":
- Written by the agent at session-end with full attention
- Read by the agent at session-start with fresh attention
- Both at full fidelity (no lossy compression)
- Operator can review + correct the next-session recommendation before it gets read

### Compaction is a band-aid; session-end is the architecture

If the project rule says "the journal is the durable record" + the session-end skill exists + scope-discovery's pickup skill reads it — then routing through that flow honors the durable-artifact contract. Compaction routes around it.

## Exception: mid-task in-flight state

The one case where compaction beats session-end-then-resume: mid-task refactors where state ISN'T yet durable (types being moved across files, an in-flight TDD red-green, a multi-file rename mid-execution). Those benefit from continuing the current session rather than checkpointing prematurely. But once each task is durable (committed), session-end is strictly better than compaction.

## Proposed enhancements to the iterate tooling

### A. `/dwi` should detect the inflection point

When the `/dw-lifecycle:implement` loop has been running for N commits AND the last N audit-barrage rounds have hit recurring meta-patterns (e.g., same audit-shape ID family across 3+ findings), the skill should emit a structured signal: *"This session has crossed the value-inflection-point. Recommend `/dwse` → clear → `/dwss` rather than continuing."*

Concrete signals (any 2 suggests checkpoint):
- Commit count since session start > 20
- Last 3 audit-barrage rounds each surfaced findings about the form of fix-task blocks (not substantive defects)
- A meta-pattern AUDIT chain (e.g., AUDIT-X → AUDIT-Y where Y is "AUDIT-X's fix introduced..." — the recursive shape)
- Operator has authorized 3+ override decisions or recovery patches (sign of accumulating context complexity)

### B. `/dwse` should emit a "ready to clear" signal

The session-end skill's final report already names the next-session entry point. Add an explicit line: *"Recommend `/clear` then `/dwss <slug>` to resume. Compaction NOT recommended — see [issue link] for why."*

### C. `/dwss` should be the only-supported way to resume

It already mostly is, but the agent should be coached (in the SKILL.md or via the harness) to recognize that "compact + continue" is not the supported pattern for resuming work on a feature that has a durable workplan + journal + audit-log.

### D. Document the rule

Add a `.claude/rules/session-checkpointing.md` rule that captures:
- The four failure modes (context-window dilution, self-confirmation, pattern-match-substitute, recursive meta-findings)
- The inflection-point heuristic
- "session-end + clear + session-start beats compaction" as the operating rule
- The mid-task-state exception

Cross-link from `agent-discipline.md` § the session-lifecycle section.

### E. Optional: audit-barrage meta-pattern detector

Add a helper to `dw-lifecycle audit-barrage-lift` that detects when consecutive lifts surface findings whose surface is a previously-promoted fix-task block (the AUDIT-72→76→79→83 chain). When detected, emit a structured note in the lift's stderr: *"Recurring meta-pattern detected — this session may have crossed the value-inflection-point."*

## Why this matters

The project's iterate cycle (`/dwi`) is the load-bearing surface where the agent does substantial work. The two failure modes — quality degradation on long sessions, and compaction-as-the-wrong-cure — both compound silently. Without an explicit signal, the agent will keep working past the inflection point, and the operator will see the symptoms (a session that "feels productive" but is shipping recursive meta-fixes rather than substantive progress) only in retrospect.

Making the checkpoint cycle explicit in the tooling — at `/dwi`, at `/dwse`, in a written rule — moves this from "operator catches it" to "tooling surfaces it." That's the pattern the project favors (mechanize over policy; enforcement lives in the surfaces the operator and agent both see).

## Reference session

`feature/scope-discovery`, 2026-06-03 cont. 4 (commits `8da2ff0b..0fe000d1` — 38 substantive commits + 1 session-end). The DEVELOPMENT-NOTES.md entry for that session captures the failure modes in operator-readable form; the audit-log entries AUDIT-20260603-37..87 record the per-finding evidence.

The pattern is reproducible: the audit-barrage's recursion into meta-patterns is visible in the audit-log; the inflection point is locatable as the commit where the audit-barrage stops finding substantive defects and starts finding fix-task lifecycle artifacts.
<!-- SECTION:DESCRIPTION:END -->
