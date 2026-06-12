---
id: TASK-59
title: >-
  stack-control: session-end auto-derives 'Commits: 0' on long-lived branches —
  boundary resolution fails silently, inverting the never-fabricate guarantee
status: To Do
assignee: []
created_date: '2026-06-12 06:26'
labels:
  - 'type:imported-issue'
dependencies: []
references:
  - gh-455
ordinal: 59000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
stack-control tooling friction, surfaced closing the 2026-06-10/11 design-control session.

## Symptom

`stackctl session-end` auto-derived the journal entry's quantitative section as `Commits: 0 / (no commits this session) / Files changed: 0` for a session whose actual span was ~70 first-parent commits (`git rev-list --count --first-parent 158efce4..8ff60576` = 70). The skill's contract says the mechanical sections are "re-derived from `git log <boundary>..HEAD` (re-derived from source, never fabricated)" — the derivation ran, but the boundary resolved to (or past) HEAD, producing a confidently-wrong zero.

## Context that likely matters

- Long-lived feature branch (`feature/design-control`), hundreds of commits ahead of the default branch, with a mid-session `origin/main` merge in the range.
- The documented boundary chain is "merge-base with the base branch → `HEAD~N` fallback". Merge-base with main here is a mid-session merge ancestor; whatever was computed yielded an empty range rather than the session's commits.
- The journal also landed at the installation default path (`plugins/design-control/DEVELOPMENT-NOTES.md`, freshly created) — fine per audience-split defaults, but a first-run journal plus an empty commit range makes the sparse entry look like a no-op session when it was the opposite.

## Why it matters

The quantitative section is the part the verb owns precisely because agents fabricate numbers; a silently-empty derivation inverts the guarantee (the operator reads "0 commits" as derived truth). The agent had to re-derive by hand and annotate the entry.

## Suggested directions

- When the derived range is empty but `HEAD` != boundary-candidate ancestry suggests activity (e.g. reflog or a `--since` hint), say "boundary could not be determined" loudly in the entry instead of printing zeros.
- Accept/document `--since <sha>` as the reliable path on long-lived branches, and have the skill body instruct agents to pass it when the branch predates the session.
- Consider a reflog-based default boundary (first HEAD position of the session) where available.

## Provenance

Observed in `stackctl session-end --no-push` (in-repo 0.40.0) on the design-control installation; entry hand-corrected in the same close. Filed per the tooling-friction-to-GitHub-issues policy.
<!-- SECTION:DESCRIPTION:END -->
