# Contract: Govern Runnability (FR-011 / FR-012) — the back-half prerequisite

"A gate cannot enforce a step that cannot run." Before the compass can enforce the back-half
`governing → shipped` gate, `govern` must run on the session-pinned `feature/stack-control`
branch. These are the FIRST implementation phases (FR-015). Two distinct fixes.

## FR-011 — resolve the feature from the item, not the branch slug

### Current behavior (the verified blocker)

`govern --mode implement` on `feature/stack-control` calls `resolveSlug({branch})`
(`src/govern/protocol.ts:141`), which derives slug `stack-control` from the branch, then
`resolveFeatureRoot` looks for `specs/<NNN>-stack-control`, finds nothing, and **FATALs
"feature not found"** — for every spec on the branch. The `after_implement` hook passes no
`--feature`.

### Required behavior

`govern` gains an item-driven resolution path. When invoked for a roadmap item (the
`after_implement` hook and `/stack-control:execute` both know the item):

1. Resolve the feature from the item's recorded `spec:` pointer (the roadmap node), via the
   canonical-identity resolver (contracts/canonical-identity.md).
2. Fall back to the CLAUDE.md SPECKIT marker (`specs/<NNN>-<slug>/plan.md`) when no item is
   supplied but a marker is present.
3. The existing `--feature` / branch-`resolveSlug` path remains for explicit/legacy callers.

The branch slug is NEVER the sole resolution source on a session-pinned branch. No silent
fallback: when neither an item `spec:` pointer, a SPECKIT marker, nor `--feature` resolves a
feature, govern FATALs with an actionable message naming what to supply (Principle V).

### Acceptance (SC-004, US4.1)

- On `feature/stack-control`, `govern` for an item with a `spec:` pointer resolves the feature
  with no branch-slug "feature not found" FATAL.

## FR-012 — backtick skill-reference span is not a governed path (TASK-83)

### Current behavior (the verified crash)

`extractScopedPaths` (`src/govern/incremental-audit.ts:61`) treats any backtick token
containing `/` as a governed path. A documentation span `` `/stack-control:define` `` contains
`/`, so it is extracted as a path and handed to the governed-path validator
(`checkpoint-state.ts`), which throws **"governed path escapes the installation root"** —
crashing payload assembly.

### Required behavior

`extractScopedPaths` MUST classify a token as a path only when it is a plausible
installation-relative filesystem path. A skill/verb reference — a token bearing a
`<plugin>:<verb>` namespace segment (a `:` after the leading `/`), or otherwise not resolving
to an installation-relative path — MUST be skipped before reaching the validator. Real
`` `path/to/file.ts` `` scope spans MUST still be extracted (no over-stripping).

Fix is localized to the extractor. It MUST NOT grow `payload-implement.ts` (already over the
300–500-line cap, TASK-48) or `incremental-audit.ts` past the cap.

### Acceptance (SC-004, US4.2)

- A spec/tasks doc containing a `` `/stack-control:define` `` span ⇒ govern assembles the
  payload with no "escapes the installation root" FATAL, and the span is absent from the
  governed-path set.
- A genuine `` `src/govern/protocol.ts` `` span ⇒ still extracted as a governed path.

## Tests (govern-resolution.test.ts)

- RED: item-driven `govern` on a `feature/<non-spec-slug>` branch with a `spec:` pointer
  resolves the feature (no FATAL) — fails before the FR-011 fix.
- RED: `extractScopedPaths` over a body with a `/stack-control:define` backtick span returns
  no path for that token (and still returns a real path span) — fails before the FR-012 fix.
- A missing item + missing marker + missing `--feature` ⇒ FATAL naming what to supply (no
  silent fallback).
