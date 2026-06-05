---
name: session-start
description: "Bootstrap a session on the stack-control feature branch: orient to the Spec Kit tooling + this feature's docs, read the latest journal entry and open issues, then summarize state before work begins."
---

# Session Start — stack-control feature branch (Spec Kit)

> Branch-local bootstrap for `feature/pluggable-lifecycle-providers`: this builds **stack-control** via GitHub **Spec Kit**, not the dw-lifecycle workplan or the deskwork-studio product.

1. Confirm branch (`git rev-parse --abbrev-ref HEAD` → `feature/pluggable-lifecycle-providers`); stop if elsewhere.
2. Read program orientation: `docs/1.0/001-IN-PROGRESS/pluggable-lifecycle-providers/{README.md, stack-control-roadmap.md}` and `.claude/rules/stack-control-succession.md` (settled decisions — do not relitigate).
3. Read Spec Kit tooling: `.specify/memory/constitution.md` (cite a principle before coding) and `.specify/extensions.yml` (hooks; governance fires on `after_implement`). Workflow order: constitution → specify → clarify → plan → checklist → tasks → analyze → implement (`/speckit-*` skills, in order).
4. Read the active spec (path is in `CLAUDE.md`'s `<!-- SPECKIT -->` marker): `specs/<feature>/{spec,plan,research,data-model,contracts,tasks}.md` — whichever exist. Infer the next `/speckit-*` step from which artifacts are present.
5. Read the latest `DEVELOPMENT-NOTES.md` entry (the development log).
6. Check open GitHub issues (`gh issue list --state open`).
7. Report: branch + feature + where we are in the Spec Kit chain (+ next step), last session's accomplishments/failures, proposed goal. Wait for operator confirmation before working.
