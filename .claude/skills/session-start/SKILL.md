---
name: session-start
description: "Bootstrap a session on the stack-control feature branch: orient a fresh agent to the Spec Kit tooling + this feature's docs, read the latest journal entry and open issues, report state before work begins."
user_invocable: true
---

# Session Start — stack-control feature branch (Spec Kit)

> **Branch-local bootstrap (temporary).** This worktree (`feature/pluggable-lifecycle-providers`) builds **`stack-control`** via GitHub **Spec Kit** — NOT the dw-lifecycle workplan and NOT the deskwork-studio product. This file holds a different, studio-product bootstrap on `main`; it is intentionally replaced on this branch to orient a fresh, blank-context agent to *this* feature's tooling and docs. Reconcile at merge.

Read the following and report a concise summary. **Do NOT start work until the operator confirms the session goal.**

1. **Confirm branch + feature.**
   - Run: `git rev-parse --abbrev-ref HEAD` (expect `feature/pluggable-lifecycle-providers`) and `basename $(pwd)`.
   - If NOT on this branch, stop and say so — this bootstrap is branch-specific.

2. **Read the program orientation — the durable "why" + settled decisions.**
   - `docs/1.0/001-IN-PROGRESS/pluggable-lifecycle-providers/stack-control-thesis.md` — **READ FIRST. The thesis + hard-won principles + the motivating blog post.** Grounds everything: *invest heavily in up-front design and tooling, industrialize execution*; agents are "hyperintelligent toddlers" fixed by environmental design + stochastic correctness, not by rules. If work doesn't trace back to the thesis, stop and reconsider.
   - `docs/1.0/001-IN-PROGRESS/pluggable-lifecycle-providers/README.md` — feature overview + key links.
   - `docs/1.0/001-IN-PROGRESS/pluggable-lifecycle-providers/stack-control-roadmap.md` — the **canonical feature sequence** (scope + status; don't look for it elsewhere).
   - `.claude/rules/stack-control-succession.md` — **settled decisions; do NOT relitigate** (stack-control succeeds dw-lifecycle via absorb-then-retire; isolation invariant; naming; the two pluggability axes).

3. **Read the Spec Kit governance + tooling.**
   - `.specify/memory/constitution.md` — the principles every spec inherits (TDD-first, integration-first / capture-don't-cut, branch-on-capability-not-vendor, no-fallbacks, strict typing, commit-and-push-often, faithful tool adoption, execution-backend pluggability). **Cite the relevant principle before writing code.**
   - `.specify/extensions.yml` — the Spec Kit lifecycle hooks (git auto-commit on each step; **`deskwork-governance`** fires cross-model audit-barrage on `after_implement`).
   - **Spec Kit workflow order (Principle VIII — follow in order, don't off-road):** constitution → specify → clarify → plan → checklist → tasks → analyze → implement. Each step is a `/speckit-*` skill. Hooks may prompt an auto-commit before/after a step — honor the commit-and-push-often discipline.

4. **Read the active feature spec + determine where we are in the chain.**
   - The active plan path is named in the `<!-- SPECKIT START -->…<!-- SPECKIT END -->` marker in `CLAUDE.md`.
   - Read whichever of these exist, in order: `specs/<feature>/spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/`, `tasks.md`.
   - Infer the **next Spec Kit step** from which artifacts exist (e.g. plan but no tasks → `/speckit-tasks`).

5. **Read the latest `DEVELOPMENT-NOTES.md` entry** (last entry only) — accomplishments, failures, course corrections, and the prior session's "next" note. This is the development log; it carries the session-to-session thread.

6. **Check open GitHub issues:** `gh issue list --state open` (add `--search <term>` if a focus area is known).

7. **Report to the operator:**
   - Branch + feature + **where we are in the Spec Kit chain** (artifacts present → next `/speckit-*` step).
   - Last session's key accomplishments / failures / open decisions.
   - Proposed goal for this session.
   - **Do NOT start work until the operator confirms.**
