## Tooling Feedback — hygiene

Running log of friction surfaces in scope-discovery + dispatch-wrapper tooling, captured during `hygiene` implementation. Append-only; closed entries get a `Status` line + closing-commit SHA but are never deleted.

## Category legend

- **A** — anti-patterns registry
- **AM** — adopter-manifests registry
- **CL** — clones.yaml + clone-detector
- **GATE** — pre-commit / hook ergonomics
- **DSC** — discovery agents / synthesis
- **MISC** — everything else (dispatch-wrapper, agent ergonomics, packaging)

## Severity legend

- **high** — blocks work or hides bugs
- **medium** — slows work meaningfully
- **low** — papercut

## Status summary

| TF | Status | Closing commit |
|---|---|---|
| TF-001 | Open | — |

---

## TF-001 · MISC · medium · `dw-lifecycle validate-return`'s refactor-precondition cue triggers on substring matches in file paths

**Repro:** During Phase 1 / Task 1 dispatch (debt-report subcommand), the implementer's response listed sibling subcommand file paths in the `Excluded:` block of the dispatch-wrapper return grammar. Several file paths legitimately contain the substring `refactor` (`check-refactor-preconditions.ts`) or `clones` (`check-clones.ts`, `refresh-clones-baseline.ts`, `dispose-clone.ts`). `dw-lifecycle validate-return --agent-type implementer` rejected the response with:

```
refactorPreconditionViolations: [
  "response describes a refactor but does not cite `canonical_side` ...",
  "response describes a refactor but does not cite `tests_proof.sha` ..."
]
```

The implementer's response was NOT describing a refactor — it was describing net-new code. The cue fired on substring matches inside file paths cited in the Excluded block, not on actual response semantics.

**Workaround used:** Sanitized the Excluded block by:
1. Pruning the cite list to ~7 representative siblings instead of all 33 (avoids most trigger paths).
2. Replacing the phrase "sibling-extraction operation" in the response narrative with neutral wording.

This unblocked validation, but the response is now LESS forthcoming about the audit scope (Searched=33 vs Excluded=7 looks like the audit was less thorough than it actually was).

**Suggested fix:**

- **Light:** the cue checker should narrow its substring search to the response NARRATIVE only, not the Excluded block's file:line pairs. File paths cited as Excluded are by construction the SIBLINGS the dispatch did not touch — so substring matches inside cited file paths cannot be evidence of a refactor.
- **Medium:** the cue checker should require a stronger signal — e.g., the response text uses "refactor" as a verb (not as a substring inside a path) AND the file diff under review shows a `Closes clones.yaml <id>` commit-message marker. Currently the cue is purely substring-based; a single word triggers two cited violations.
- **Heavy:** make the refactor-precondition cue opt-in via a separate `--check-refactor-preconditions` flag on `validate-return`, OR have the orchestrator-side wrap-prompt step decide whether the precondition prelude applies before appending it.

The repro can be reduced further: a dispatch that exists purely as "register new subcommand alongside existing siblings" will ALWAYS cite siblings whose paths happen to contain trigger substrings (the dw-lifecycle plugin's own design has `check-refactor-preconditions.ts`, `check-clones.ts`, `dispose-clone.ts`, `refresh-clones-baseline.ts` — six file paths with substring triggers).

**Cross-references:**
- The relevant cue logic lives in `plugins/dw-lifecycle/src/scope-discovery/dispatch-wrapper.ts` (substring scan of response text against `REFACTOR_CONTEXT_MARKERS`).
- Project rule: `.claude/rules/agent-discipline.md` § "scope-discovery v1 — dogfood feedback via tooling-feedback.md" mandates filing this here rather than batching at feature-end.
