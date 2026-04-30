---
name: release
description: Release the deskwork monorepo (bump → publish → smoke → tag → push). Hard-gated procedure with operator pauses at version, post-bump diff, npm publish, tag message, and final push. Project-internal — for monorepo maintainers, not adopters.
---

# Release

Ship a new version of the deskwork monorepo. Hard-gated. The skill runs preconditions, prompts for version, bumps + commits, publishes `@deskwork/{core,cli,studio}@<version>` to npm, runs the smoke gate against the published packages, prompts for tag message, asks for explicit confirmation, then atomic-pushes the commit + branch + tag in one operation.

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

### Pause 3 — Publish to npm

The smoke gate (next pause) runs `npm install @deskwork/<pkg>@<version>` against the public registry, so the new version must be published BEFORE smoke runs. This pause publishes all three `@deskwork/*` packages.

1. Verify no package is already at the new version (catches the "version already published" case before any OTPs are typed):

   ```
   tsx .claude/skills/release/lib/release-helpers.ts assert-not-published <version>
   ```

2. On non-zero exit: surface stderr (lists which package(s) are already at `<version>`) and abort. The chore-release commit stays in place. Operator must bump to a new version (`git reset --soft HEAD~1`, then re-run `/release` with a new version) — npm forbids republishing the same version, so this isn't recoverable in-place.

3. On zero exit: surface the operator-side instructions and wait for confirmation.

   **Important — the agent does NOT run `make publish` itself.** `npm publish` prompts for a 2FA OTP on stdin per package, and the agent's Bash tool cannot pass interactive prompts through to the operator's terminal. Running it from the agent context blocks indefinitely. The publish must happen in the operator's own terminal, with the agent waiting on confirmation.

   Surface this verbatim:

   ```
   ──────────────────────────────────────────────────────────────────
   Publish step — RUN IN YOUR OWN TERMINAL (not through the agent):

     cd <repo-root>
     make publish

   This publishes (in dependency order, with one 2FA OTP per package):
     @deskwork/core@<version>
     @deskwork/cli@<version>
     @deskwork/studio@<version>

   Three OTPs total. When all three succeed, reply with 'done' (or any
   confirmation) and the agent will verify and continue. If any package
   fails, paste the error.
   ──────────────────────────────────────────────────────────────────
   ```

4. **Wait for the operator's confirmation** before any further action. Do NOT auto-poll npm view, do NOT spawn `make publish` via Bash — wait for the operator to say it's done.

5. On operator confirmation: verify all three are now on the registry:

   ```
   tsx .claude/skills/release/lib/release-helpers.ts assert-published <version>
   ```

   - On zero exit: continue to Pause 4.
   - On non-zero exit: surface stderr (lists which package(s) are still missing). Possible causes: partial-publish state (some succeeded, some failed), registry CDN propagation delay (rare; usually resolves within seconds), or operator confirmed prematurely. Either ask the operator to retry the missing package(s) and reconfirm, OR — if the gap is genuinely partial-publish unrecoverable — abort with the same recovery guidance as below.

6. On operator-reported failure: abort.
   - If the failure was an early package (e.g., core failed before cli or studio), nothing is published; operator can re-run `make publish` once they fix the underlying issue, then reconfirm.
   - If a partial-publish state results (e.g., core published but cli's OTP rejected), surface that fact. Recovery options: bump to v<next-patch> + re-run `/release` (cleanest — the half-published version stays orphaned on npm, which is fine), OR finish the publish manually with `make publish-cli publish-studio` then re-run `/release` from a fresh tree.
   - Do NOT continue past this pause on partial failure. Smoke would fail anyway.

### Pause 4 — Smoke + tag message

1. Run: `bash scripts/smoke-marketplace.sh` (output streamed to operator).
2. On smoke fail: abort. Surface tail of smoke log. Working-tree state preserved (commit + npm-published packages remain). Recovery: a smoke failure post-publish is a `bump-to-next-patch + re-run` situation (the broken version stays orphaned on npm). Operator decides.
3. On smoke pass: draft a tag message:
   - Default: subject of the most recent commit on the branch whose subject does NOT start with `chore: release ` (lookback up to 20 commits). Falls back to `deskwork v<version>`.
   - Show the default and prompt:

     ```
     Tag message? [default: <draft>]
     >
     ```

4. Operator types message or accepts default. Then: `git tag -a v<version> -m "<message>"`.

### Pause 5 — Final push confirmation

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
| `assert-not-published <ver>` | Verify `@deskwork/{core,cli,studio}@<ver>` are NOT yet published on npm (pre-flight before `make publish`). Calls `npm view` per package. | 0 ok / 1 fail (lists already-published packages on stderr) / 2 usage |
| `assert-published <ver>` | Verify `@deskwork/{core,cli,studio}@<ver>` ARE published on npm (post-flight after the operator runs `make publish` in their terminal). Calls `npm view` per package. | 0 ok / 1 fail (lists missing packages on stderr) / 2 usage |
| `atomic-push <tag> <branch>` | Single-RPC push: HEAD to origin/main, HEAD to branch, annotated tag. | 0 ok / 1 fail (git stderr surfaced) |

Tests live at `.claude/skills/release/test/`. Run via `cd .claude/skills/release && npx vitest run` (local-only; not in CI per project rules).
