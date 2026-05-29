---
name: release
description: Release the deskwork monorepo (bump → tag → push → CI publishes). Hard-gated procedure with operator pauses at version, post-bump diff, tag message, and final push. CI handles publish + smoke via npm Trusted Publisher (OIDC). Project-internal — for monorepo maintainers, not adopters.
---

# Release

Ship a new version of the deskwork monorepo. Hard-gated. The skill runs preconditions, prompts for version, bumps + commits, drafts the tag message, and atomic-pushes the commit + branch + tag in one operation. The tag push triggers `.github/workflows/publish-npm.yml`, which publishes `@deskwork/{core,cli,studio}@<version>` via OIDC, asserts they're on the registry, and runs the marketplace smoke gate. The skill waits for the workflow to complete (`gh run watch`) and reports the release URL.

Pass `--skip-publish-wait` when the operator handled publish manually via `make publish` (the documented fallback when CI is broken) — the skill skips the workflow-watch step.

## Pre-1.0 maturity stance

This skill pushes directly to `origin/main` (no PR-merge, no CI gate). Deliberate pre-1.0 velocity choice. Revisit at 1.0 stabilization — see `RELEASING.md` § "Maturity stance" and the JSDoc on `atomicPush` in `lib/release-helpers.ts`.

## Steps for the agent

The agent invokes the helper subcommands listed below and surfaces operator prompts at four pause points (precondition → diff → tag message → push + workflow-watch). **No `--force` / `--skip-smoke` overrides — all gates are hard.** The only flag the skill itself accepts at invocation is `--skip-publish-wait`, which bypasses the workflow-watch step for the CI-broken recovery path documented below.

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

### Pause 3 — Tag message (CI publishes on tag-push)

Publish is no longer a Pause-3 manual step. `.github/workflows/publish-npm.yml` auto-publishes via npm Trusted Publisher (OIDC) on every `v*` tag push. The smoke gate (`scripts/smoke-marketplace.sh`) and the `assert-published` registry check both run as workflow steps after publish. Pause 3 is now the tag-message draft + the workflow-watch wait.

**Recovery shortcut.** When the operator already published manually via `make publish` (because CI was broken), invoke `/release --skip-publish-wait`. The skill skips Pause 4's workflow-watch and proceeds directly to release-view. See § "Recovery — CI is broken" below for the full manual-fallback procedure.

1. Verify no package is already at the new version (catches the "version already published" case before the tag goes out — npm rejects the workflow's publish step otherwise):

   ```
   tsx .claude/skills/release/lib/release-helpers.ts assert-not-published <version>
   ```

2. On non-zero exit: surface stderr (lists which package(s) are already at `<version>`) and abort. The chore-release commit stays in place. Operator must bump to a new version (`git reset --soft HEAD~1`, then re-run `/release` with a new version) — npm forbids republishing the same version.

3. On zero exit: draft a tag message:
   - Default: subject of the most recent commit on the branch whose subject does NOT start with `chore: release ` (lookback up to 20 commits). Falls back to `deskwork v<version>`.
   - Show the default and prompt:

     ```
     Tag message? [default: <draft>]
     >
     ```

4. Operator types message or accepts default. Then: `git tag -a v<version> -m "<message>"`.

### Pause 4 — Final push + workflow watch

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

   The tag push triggers .github/workflows/publish-npm.yml, which:
     - publishes @deskwork/{core,cli,studio}@<version> via OIDC
     - runs assert-published
     - runs scripts/smoke-marketplace.sh

   Non-reversible after the workflow succeeds.

   Run push? [y/N]
   >
   ```

4. On `y`: `tsx .claude/skills/release/lib/release-helpers.ts atomic-push v<version> <current-branch>`.
5. On push success: watch the publish workflow (skip when `--skip-publish-wait` was passed at skill invocation):

   ```
   gh run list --workflow=publish-npm.yml --limit=5 --json databaseId,headSha,event,status,conclusion,createdAt
   ```

   - Match the just-pushed run by `headSha == <pushed-HEAD-SHA>` AND `event == "push"`. If multiple, take the most recent.
   - `gh run watch <run-id>` with a 15-minute timeout.
   - On `conclusion == success`: proceed to release-view step.
   - On `conclusion == failure`: surface the workflow logs URL (`gh run view <run-id> --web`) and advise the operator to investigate. Do NOT auto-retry. Do NOT delete the tag. See § "Recovery — CI is broken" for next steps.
   - On timeout: surface the workflow URL; advise the operator to watch it themselves and re-run `/release --skip-publish-wait` once the workflow finishes.

6. On workflow success (or when `--skip-publish-wait`): run `gh release view v<version>` and report the release URL.
7. On push fail: abort. Surface git's stderr. Local commit + tag intact. Operator can fix (e.g. fetch + rebase if origin/main moved) and re-run; the skill will detect the existing local tag.
8. On `n` at push prompt: abort. Local state preserved.

### Recovery — CI is broken

When the `publish-npm.yml` workflow fails (npm outage, OIDC misconfiguration, transient flake) or the operator wants a one-off out-of-band publish, fall back to `make publish`:

1. **Determine published state** — for each package, check what npm shows:
   ```
   npm view @deskwork/core versions --json | jq '.[-1]'
   npm view @deskwork/cli  versions --json | jq '.[-1]'
   npm view @deskwork/studio versions --json | jq '.[-1]'
   ```
2. **Nothing published yet** (workflow failed before publish step): the chore-release commit + tag are still local-only IF you haven't pushed yet. If you HAVE pushed, the tag is on origin but no npm artifacts ship. Revert the bump commit (`git reset --soft HEAD~1`), fix the underlying issue, re-run `/release`.
3. **Partial publish** (e.g. core succeeded, cli failed mid-flight): the safest path is to bump to v<next-patch> + re-run `/release`. The half-published version stays orphaned on npm (npm forbids republishing the same version anyway). Document the orphaned version in the release notes.
4. **All three published, but workflow failed at smoke or assert-published**: the artifacts are reachable by adopters; what failed was the post-publish gate. Investigate the workflow logs; re-run the smoke locally (`bash scripts/smoke-marketplace.sh`); if smoke passes locally, the gap is CI-side and the release is salvageable.
5. **Manual publish flow** (used during recovery OR for one-off out-of-band publishes):
   ```
   make publish      # token-auth, prompts for 2FA OTP per package
   ```
   `make publish` reads `~/.config/deskwork/npm-credentials.txt`. It publishes WITHOUT provenance (the manual path uses token auth; provenance requires the OIDC env that only the workflow has). The artifacts ship; adopters get them; the npm-side trusted-publisher attestation is the only thing missing for that release.
6. **Resume `/release` after manual publish**: invoke `/release --skip-publish-wait`. The skill skips Pause 4's workflow-watch step (since the operator already handled publish out-of-band).

### Flow shape after Phase 10

The release flow used to walk five pauses (precondition → diff → manual publish → local smoke → push). Phase 10 of `feature/hygiene` (npm Trusted Publisher CI workflow) collapsed the manual-publish + local-smoke pauses into CI-owned steps. The agent now walks four pauses: precondition (Pause 1) → diff (Pause 2) → tag message (Pause 3) → push + workflow-watch (Pause 4).

The `--skip-publish-wait` flag is the recovery escape hatch: pass it when the operator handled publish manually via `make publish` and the workflow-watch step is therefore moot.

## Helper subcommands

All helpers live in `.claude/skills/release/lib/release-helpers.ts` and are invoked via tsx:

| Subcommand | Purpose | Exit codes |
|---|---|---|
| `check-preconditions` | Verify clean tree, FF over origin/main, branch up-to-date. Prints status line. | 0 ok / 1 fail / 2 usage |
| `validate-version <ver> <last-tag>` | Pure semver tuple compare. Strictly greater required. | 0 ok / 1 fail (reason on stderr) / 2 usage |
| `assert-not-published <ver>` | Verify `@deskwork/{core,cli,studio}@<ver>` are NOT yet published on npm. Pre-flight gate at Pause 3 so the tag-triggered workflow doesn't fail mid-publish on a duplicate version. Calls `npm view` per package. | 0 ok / 1 fail (lists already-published packages on stderr) / 2 usage |
| `assert-published <ver>` | Verify `@deskwork/{core,cli,studio}@<ver>` ARE published on npm. Used as a workflow step inside `.github/workflows/publish-npm.yml` after the publish step. The skill itself relies on `gh run watch` for end-of-publish signal. Calls `npm view` per package. | 0 ok / 1 fail (lists missing packages on stderr) / 2 usage |
| `atomic-push <tag> <branch>` | Single-RPC push: HEAD to origin/main, HEAD to branch, annotated tag. | 0 ok / 1 fail (git stderr surfaced) |

Tests live at `.claude/skills/release/test/`. Run via `cd .claude/skills/release && npx vitest run` (local-only; not in CI per project rules).
