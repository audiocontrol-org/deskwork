---
id: TASK-163
title: >-
  capability mediation: refactor the bash parser (extract tokenizer) and close
  residual under-match edges
status: To Do
assignee: []
created_date: '2026-06-18 02:49'
labels:
  - agent-found
  - 'type:gap'
dependencies: []
ordinal: 163000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
src/capability/identity.ts parseCommands grew across 7 cross-model audit rounds into a ~150-line single char-state machine (quote/$()-depth-with-nested-quotes/backtick/heredoc-opener+body/redirection-vs-separator). claude-04 (026 P2 round 7): the file is 431 lines (within 300-500 cap but trending) and the complexity is where bugs hid (the <<< here-string bug). Refactor: extract the tokenizer (quote/subst/heredoc scanning) from the command-splitter so each is independently testable before the next indirection form is added. Bundle the residual UNDER-match edges (all FR-017 best-effort, US3-backstopped, overridden at the round-7 plateau): case-statement pattern bodies ('case x in *) backlog;; esac' — codex-01 round 7, fix-induced from HEADER_WORDS), stacked heredocs ('cat <<A <<B' — claude-02 round 7), and function-definition bodies (TASK-162). Also narrow the normalizeArgv0 export footgun (claude-03 round 7: it is first-command-only; an adapter misusing it instead of argv0sOf/matchCapability reopens the compound-command bypass — don't export it, or rename/annotate). NONE of these are over-match/false-refusal (those were all fixed); all are backstopped under-matches. Source: 026 Phase-2 govern rounds 6-7.
<!-- SECTION:DESCRIPTION:END -->
