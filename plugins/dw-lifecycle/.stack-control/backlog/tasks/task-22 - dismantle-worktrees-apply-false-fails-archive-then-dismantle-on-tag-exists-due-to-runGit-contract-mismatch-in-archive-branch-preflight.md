---
id: TASK-22
title: >-
  dismantle-worktrees apply false-fails archive-then-dismantle on tag-exists due
  to runGit-contract mismatch in archive-branch preflight
status: To Do
assignee: []
created_date: '2026-06-10 20:07'
labels:
  - 'type:imported-issue'
  - bug
dependencies: []
references:
  - gh-364
ordinal: 22000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Summary

`dw-lifecycle dismantle-worktrees apply` false-fails every `archive-then-dismantle` decision with "Tag already exists" even when the tag does NOT exist. Root cause is a runGit-contract mismatch: `archive-branch`'s preflight assumes a throwing runGit (exception on non-zero git exit), but `dismantle-worktrees apply` calls into `archive-branch`'s `applyArchive` with `runGitStdout` from `subcommands/lib/process-probes.ts` — a SWALLOWING runner that returns `''` on failure.

Found during the Phase 11 Task 6 dogfood pass (2026-05-29). Promoted from `hygiene` feature's `tooling-feedback.md` TF-002.

## Repro

1. Have at least one worktree whose `git worktree list` verdict resolves to `stale` with branch ahead of `origin/main`.
2. Run `dw-lifecycle dismantle-worktrees propose --worktree-base <base>` and set every item's `decision` to `archive-then-dismantle` with a substantive reason.
3. Run `dw-lifecycle dismantle-worktrees apply --proposal <path>`.

Expected: each item archives the branch as `archived/<branch-slashed>-<date>`, then removes the worktree + branch.

Actual: every `archive-then-dismantle` item fails with:

```
failed: <worktree-path> — Tag archived/<branch>-<date> already exists.
  Either delete the existing tag (git tag -d ...) or use a different date.
```

The tag does NOT actually exist (`git tag --list "archived/*"` is empty; `git ls-remote --tags origin | grep archived` is empty). The worktree DOES get removed (step 1 of the dismantle sequence), so the operator is left with dangling branches + no archive tags + no remote-branch cleanup.

## Root cause

`archive-branch/preflight.ts` `assertTagDoesNotExist`:

```ts
let exists = false;
try {
  runGit(['rev-parse', '--verify', `refs/tags/${tagName}`]);
  exists = true;
} catch {
  // tag absence is the desired state
}
if (exists) throw new ArchiveBranchPreflightError('tag-exists', ...);
```

The contract this code assumes: `runGit` throws on non-zero git exit.

`subcommands/lib/process-probes.ts` `runGitStdout`:

```ts
export function runGitStdout(args) {
  try {
    return execFileSync('git', args, { ... });
  } catch {
    return '';
  }
}
```

This runner SWALLOWS the non-zero exit and returns `''`. The standalone `archive-branch` subcommand wires a throwing runGit, so the preflight works there. But `dismantle-worktrees apply` calls `applyArchive` (when `decision === 'archive-then-dismantle'`) with the swallowing `runGitStdout`. Under that runner, `rev-parse --verify` for a missing tag returns `''` without throwing, the `try` block completes, `exists = true`, and the preflight fires "tag already exists" for every decision.

## Recovery from the dogfood pass

The 3 affected worktrees were already removed (`git worktree remove` ran in step 1 before the archive step). The branches were intact locally. Recovery: ran `dw-lifecycle archive-branch <branch>` standalone for each, which uses the throwing runGit contract correctly and successfully archived all three.

## Suggested fix

### Light (applied this session)

Make `assertTagDoesNotExist` robust against both runGit contracts by checking the RETURNED value too:

```ts
let output = '';
try {
  output = runGit(['rev-parse', '--verify', `refs/tags/${tagName}`]).trim();
} catch {
  // throw-on-failure variant exits here; output stays empty
}
if (output.length > 0) throw new ArchiveBranchPreflightError(...);
```

Localized fix; lands behind a clear comment naming both contracts. Regression test added at `archive-branch-preflight.test.ts` exercising the swallowing-runner shape.

### Medium

Unify the two runGit contracts. Either:

- Rename `runGitStdout` to `runGitOrEmpty` (or similar) so the swallow semantics are signaled by the name, AND switch consumers that need the throw contract to a separate `runGit` helper. OR
- Make `runGitStdout` throw on non-zero exit — and add a separate `runGitOrEmpty` helper for callers that genuinely want empty-on-failure.

The latter is closer to git's natural CLI shape, but it would break every existing caller that relies on the swallow.

### Heavy

Audit every consumer of `runGitStdout` for the same latent bug. Any code that uses `try/catch` around a `runGitStdout` call to detect a non-zero exit has this bug shape; the catch never fires. The preflight was the surfacing case but the codebase pattern may have siblings.

## Provenance

- Surfaced live during the Phase 11 Task 6 dogfood pass (2026-05-29; `hygiene` feature).
- TF entry: `docs/1.0/001-IN-PROGRESS/hygiene/tooling-feedback.md` TF-002.
- Fix landed on `feature/hygiene` this session. Audit-log entry at `docs/1.0/001-IN-PROGRESS/hygiene/audit-log.md` `AUDIT-20260529-07`.
<!-- SECTION:DESCRIPTION:END -->
