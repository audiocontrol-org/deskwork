---
name: release
description: Release the deskwork monorepo (bump → smoke → tag → push). Hard-gated procedure with operator pauses at version, post-bump diff, tag message, and final push. Project-internal — for monorepo maintainers, not adopters.
---

# Release

Ship a new version of the deskwork monorepo. Hard-gated. The skill runs preconditions, prompts for version, runs the smoke gate, prompts for tag message, asks for explicit confirmation, then atomic-pushes the commit + branch + tag in one operation.

## Pre-1.0 maturity stance

This skill pushes directly to `origin/main` (no PR-merge, no CI gate). Deliberate pre-1.0 velocity choice. Revisit at 1.0 stabilization — see `RELEASING.md` § "Maturity stance" and the JSDoc on `atomicPush` in `lib/release-helpers.ts`.

## Steps for the agent

The agent invokes the helper subcommands listed below and surfaces operator prompts at the four pause points. **No `--force` / `--skip-smoke` overrides — all gates are hard.**

### Pause 1 — Precondition + version

1. Run: `tsx .claude/skills/release/lib/release-helpers.ts check-preconditions`
2. If exit code is non-zero, surface the failure list and abort. Operator must fix the underlying state and re-run.
3. If exit code is 0, surface the report (HEAD, relative-to-origin/main, working-tree state, tracking-remote state, last release tag). Then prompt:

   ```
   What version? (must be > <last-release-tag>)
   >
   ```

4. Validate via: `tsx .claude/skills/release/lib/release-helpers.ts validate-version <version> <last-release-tag>`
5. On non-zero, surface the stderr reason and abort. Operator re-runs with a corrected version.

### Pause 2 — Post-bump diff review

1. Run: `npm run version:bump <version>` (the project's existing manifest-bump script — `tsx scripts/bump-version.ts`).
2. Show `git diff --stat`.
3. Show `git diff` (truncated to ~80 lines if large; operator can run the command themselves for the full diff).
4. Prompt:

   ```
   Commit as 'chore: release v<version>' and continue? [y/N]
   >
   ```

5. On `y`: `git commit -am "chore: release v<version>"`.
6. On `n`: abort. Bumped manifests stay in the working tree. Operator decides whether to revert (`git restore .`) or fix something and re-run.

### Pause 3 — Smoke + tag message

1. Run: `bash scripts/smoke-marketplace.sh` (output streamed to operator).
2. On smoke fail: abort. Surface tail of smoke log. Working-tree state preserved. Operator: fix the bug → `git commit --amend` → re-run.
3. On smoke pass: draft a tag message:
   - Default: subject of the most recent commit on the branch whose subject does NOT start with `chore: release ` (lookback up to 20 commits). Falls back to `deskwork v<version>`.
   - Show the default and prompt:

     ```
     Tag message? [default: <draft>]
     >
     ```

4. Operator types message or accepts default. Then: `git tag -a v<version> -m "<message>"`.

### Pause 4 — Final push confirmation

1. Check the published-tag gate:
   ```bash
   git ls-remote --tags origin v<version>
   ```
2. If non-empty: abort with: *"v<version> already exists on origin. Re-tagging silently mutates what adopters fetch on next update. Bump to v<next-patch> instead and re-run."* No override.
3. Surface the exact push command and what it will do:

   ```
   About to run:
     tsx .claude/skills/release/lib/release-helpers.ts atomic-push v<version> <current-branch>

   This pushes (in one --follow-tags RPC):
     - HEAD (<sha>) → origin/main
     - HEAD → origin/<current-branch>
     - tag v<version> → origin

   This is non-reversible after success: v<version> will be visible to
   adopters running '/plugin marketplace update deskwork'.

   Run push? [y/N]
   >
   ```

4. On `y`: `tsx .claude/skills/release/lib/release-helpers.ts atomic-push v<version> <current-branch>`.
5. On push success:
   - Run `gh release view v<version>` (the workflow may not have finished — show whatever is available; advise the operator to `gh run watch` for the workflow status).
   - Report the release URL.
6. On push fail: abort. Surface git's stderr. Local commit + tag intact. Operator can fix (e.g. fetch + rebase if origin/main moved) and re-run; the skill will detect the existing local tag.
7. On `n`: abort. Local state preserved.

## Helper subcommands

All helpers live in `.claude/skills/release/lib/release-helpers.ts` and are invoked via tsx:

| Subcommand | Purpose | Exit codes |
|---|---|---|
| `check-preconditions` | Verify clean tree, FF over origin/main, branch up-to-date. Prints status line. | 0 ok / 1 fail / 2 usage |
| `validate-version <ver> <last-tag>` | Pure semver tuple compare. Strictly greater required. | 0 ok / 1 fail (reason on stderr) / 2 usage |
| `atomic-push <tag> <branch>` | Single-RPC push: HEAD to origin/main, HEAD to branch, annotated tag. | 0 ok / 1 fail (git stderr surfaced) |

Tests live at `.claude/skills/release/test/`. Run via `cd .claude/skills/release && npx vitest run` (local-only; not in CI per project rules).
