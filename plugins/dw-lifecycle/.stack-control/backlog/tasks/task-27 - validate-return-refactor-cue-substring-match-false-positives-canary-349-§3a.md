---
id: TASK-27
title: >-
  validate-return: refactor-cue substring match false-positives (canary #349
  §3a)
status: To Do
assignee: []
created_date: '2026-06-10 20:07'
labels:
  - 'type:imported-issue'
  - bug
dependencies: []
references:
  - gh-350
ordinal: 27000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Summary

`dw-lifecycle validate-return`'s refactor-precondition cue check (added v0.24.2) substring-matches on words without context, causing real-world false positives. The graphical-entries canary observed two distinct rejections during a single session, each costing ~5 minutes of prompt-rewriting.

Surfaced in #349 § 3a — highest-priority friction item from the Phase 6 dogfood cycle.

## Failure cases observed

1. **Filename as substring trigger.** An implementer's response listed `Included: .dw-lifecycle/scope-discovery/clones.yaml — operator disposition added` in a non-refactor context (the path itself was the change target). The refactor-cue substring matched on the literal `clones.yaml` filename and rejected the response as a refactor-without-preconditions.

2. **Free-text "extracted helper" trigger.** Another implementer return described declined work: *"considered extracting a helper here but declined because the call sites diverge."* The cue check fired on "extracted helper" without context — that response wasn't claiming a refactor; it was explaining a declined option.

Both cost ~5 minutes of prompt-rewriting per occurrence. The cue check IS solving a real problem (refactor commits silently dropping the Step 0 precondition trio), but the substring matcher is too eager.

## Spec for the fix

Three candidate shapes (canary's framing in #349):

### Light: context-aware substring matching

Require the refactor-cue word AND a `Closes clones.yaml <ID>` marker to BOTH appear before treating the response as a refactor closure. Free-text mentions of "refactor" / "extract" / "helper" don't enforce the precondition trio unless paired with the structured Closes-marker. Cheapest; preserves the existing free-text grammar.

### Medium: structured refactor field in the response grammar

Add a fourth optional block to the dispatch grammar:
```
Refactor-closes: clones.yaml <ID>
```

Only this block (when present) triggers the precondition enforcement. Free-text prose can mention "refactor" / "extracted helper" / etc. without triggering. The agent must explicitly declare a refactor closure to be treated as one.

### Heavy: agent-type-scoped enforcement

Scope the refactor-cue check to specifically refactor-eligible agent types (`implementer`, `code-architect`, `typescript-pro`). Other agent types (`code-explorer`, `documentation-engineer`, etc.) wouldn't be subject to it. Stacks on Light or Medium for finer control.

Canary's recommendation: **Light + Medium together** — Light handles the common substring case; Medium gives operators the explicit structured field for refactor closures. Heavy is over-engineering until usage data shows it's needed.

## Impact

- HIGHEST priority per canary's #349 dogfood ranking (~5min wasted per occurrence × 2 in one session)
- Bug shipped in dw-lifecycle v0.24.2 via the TF-005 + TF-008 fixes that added the cue check
- Affects every implementer/architect dispatch routed through `wrap-prompt`/`validate-return`

## Acceptance criteria

- [ ] `validate-return` no longer rejects the two failure cases observed in #349 § 3a
- [ ] Refactor-precondition enforcement still fires when an agent explicitly claims a refactor closure (e.g. via the Medium structured-field shape)
- [ ] Tests: add two new scenarios to `validate-return.test.ts` covering (a) `clones.yaml` filename in Included not triggering refactor enforcement; (b) free-text "extracted helper" in declined-work context not triggering
- [ ] Verify against canary's exact failing returns from #349 (specifics in the session's audit-log)

## Cross-references

- Dogfood source: #349 § 3a
- Related: #347 (stale-branch-blindness; orthogonal)
- Code surface: `plugins/dw-lifecycle/src/scope-discovery/dispatch-grammar.ts` (refactor-cue logic)
- Tests live in: `plugins/dw-lifecycle/src/__tests__/scope-discovery/validate-return.test.ts`
<!-- SECTION:DESCRIPTION:END -->
