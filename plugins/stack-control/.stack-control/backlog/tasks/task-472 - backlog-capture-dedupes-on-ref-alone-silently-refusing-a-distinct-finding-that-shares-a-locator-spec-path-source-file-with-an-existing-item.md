---
id: TASK-472
title: >-
  backlog capture dedupes on --ref alone, silently refusing a distinct finding
  that shares a locator (spec path / source file) with an existing item
status: To Do
assignee: []
created_date: '2026-07-18 16:57'
labels:
  - agent-found
  - 'type:bug'
dependencies: []
references:
  - 'src/subcommands/backlog.ts:134'
ordinal: 471000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
src/subcommands/backlog.ts emitCapture(): 'if (ref !== undefined && backend.exists(ref)) { ...report existing... return; }' treats --ref as a uniqueness key and refuses to create a second item whenever the ref matches ANY existing item, regardless of title. The dedupe was built for the GitHub-import path (028 FR-013, TASK-38) where a ref (gh-<n>) IS a unique identity key. But 'backlog capture --ref' accepts an arbitrary locator, and a spec path or source file is legitimately shared across many distinct findings — so capturing a second, genuinely-different gap against the same spec file is silently rejected. Worse, the refusal prints to stdout as 'backlog capture: TASK-N (already captured for ref <ref>)' and exits 0 — success-shaped, easy to miss that nothing was created. Hit live 2026-07-18 filing TASK-470 then TASK-471: both used ref specs/036-fleet-control-plane/spec.md; the second was dropped and only landed after re-pointing its ref elsewhere. Candidate fixes: dedupe on (ref, title) or content hash rather than ref alone; OR only auto-dedupe for provenance-class refs (gh-<n>/import) and treat free-form locators as non-unique; OR require an explicit --dedupe-ref/--idempotent flag for the skip behavior; AND make the no-op path visibly distinct (stderr + a clear 'not created' line, or a nonzero-ish signal) so it can't read as success.
<!-- SECTION:DESCRIPTION:END -->
