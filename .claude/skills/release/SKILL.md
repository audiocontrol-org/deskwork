---
name: release
description: Release the deskwork monorepo (bump → tag → push → CI publishes → local assert + smoke). Hard-gated procedure with operator pauses at version, post-bump diff, tag message, and final push. CI publishes via npm Trusted Publisher (OIDC); the skill runs assert-published + marketplace smoke LOCALLY after publish completes (faster turnaround than waiting on GH Actions minutes). Pass `--skip-publish-wait` to bypass local assert + smoke when the operator already published manually via `make publish`. Project-internal — for monorepo maintainers, not adopters.
---

# Release

Ship a new version of the deskwork monorepo. Hard-gated. The skill runs preconditions, prompts for version, bumps + commits, drafts the tag message, and atomic-pushes the commit + branch + tag in one operation. The tag push triggers `.github/workflows/publish-npm.yml`, which publishes `@deskwork/{core,cli,studio}@<version>` via OIDC and exits. The skill then runs `assert-published` (with retry-with-backoff for npm CDN propagation) and the marketplace smoke LOCALLY, then reports the release URL.

The CI workflow does the one thing that only CI can do — publish via OIDC. Everything else (assert-published, marketplace smoke) runs locally where iteration is fast (~30s vs 5-10 min waiting on GH Actions). The local steps are the same scripts that ran in CI pre-v0.26.6; they just live in the operator's terminal now.

Pass `--skip-publish-wait` when the operator handled publish manually via `make publish` (the documented fallback when CI is broken) — the skill skips substeps 5a (assert-published) and 5b (smoke) since the operator just handled publish out-of-band.

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

5. On push success: wait for npm visibility, then smoke locally (skip both when `--skip-publish-wait` was passed):

   **5a. Assert all three packages reach npm:**

   ```
   tsx .claude/skills/release/lib/release-helpers.ts assert-published <version>
   ```

   The helper polls `npm view @deskwork/<pkg>@<version>` with retry-with-backoff (initial 5s, exponential to 30s cap, 6 attempts, ~2-min total). This rides out npm's CDN propagation lag between the workflow's publish step accepting the PUT and the read API seeing the new version. The skill does NOT poll the GH Action — npm visibility is the ground truth for "publish succeeded."

   - On exit 0: continue to 5b.
   - On exit 1 (after retry budget exhausts): surface the missing packages + the workflow URL (`gh run list --workflow=publish-npm.yml --limit=1`). Likely causes: workflow publish step failed (check logs), trusted-publisher misconfiguration on npmjs.com, or genuinely-slow CDN propagation beyond 2 min. See § "Recovery — CI is broken."

   **5b. Marketplace smoke (local):**

   ```
   bash scripts/smoke-marketplace.sh
   ```

   Clones the marketplace, npm-installs `@deskwork/<pkg>@<version>` from the public registry, boots the studio against a fixture project, checks every route + asset returns 200. The smoke is the adopter-perspective verification — if it passes locally, adopters running `/plugin marketplace update deskwork` will get a working install.

   - On exit 0: continue to 6.
   - On exit non-zero: surface the smoke log tail + the workflow URL. The packages are on npm (5a passed) but something in the marketplace-clone or studio-boot path broke. See § "Recovery — CI is broken."

6. On 5a + 5b both success (or when `--skip-publish-wait`): run `gh release view v<version>` and report the release URL.
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
4. **All three published, but assert-published or smoke failed locally** (substeps 5a/5b): the workflow's publish step succeeded; the gate that failed is the operator's local verification. If assert-published failed: re-run it manually (`tsx .claude/skills/release/lib/release-helpers.ts assert-published <ver>`); CDN propagation usually resolves within 1-2 minutes of publish. If smoke failed: read the smoke log tail, identify the broken route/asset, file an issue. The artifacts are on npm and adopters will get them — only the gate behind a known-good ship blocked.
5. **Manual publish flow** (used during recovery OR for one-off out-of-band publishes):
   ```
   make publish      # token-auth, prompts for 2FA OTP per package
   ```
   `make publish` reads `~/.config/deskwork/npm-credentials.txt`. It publishes WITHOUT provenance (the manual path uses token auth; provenance requires the OIDC env that only the workflow has). The artifacts ship; adopters get them; the npm-side trusted-publisher attestation is the only thing missing for that release.
6. **Resume `/release` after manual publish**: invoke `/release --skip-publish-wait`. The skill skips Pause 4's workflow-watch step (since the operator already handled publish out-of-band).

### Flow shape evolution

- **Pre-Phase-10:** 5 pauses — precondition → diff → manual publish → local smoke → push. Publish step required 3 OTPs.
- **Phase 10 (v0.26.1):** 4 pauses — precondition → diff → tag message → push + workflow-watch. The CI workflow ran publish + assert-published + smoke; the skill watched it.
- **Current (post-v0.26.5):** still 4 pauses, but Pause 4 splits into substeps run LOCALLY (5a assert-published, 5b smoke). The CI workflow only publishes. Rationale: CI minutes are not free, smoke takes 5-10 min in CI vs ~1 min locally, and iterating on a workflow bug at 10-min turnarounds is too slow vs the same step at 30s locally. The single thing CI uniquely does — publish via OIDC (token-less, provenance-attested) — stays in CI. Everything else stays local where the operator gets results immediately.

The `--skip-publish-wait` flag is the recovery escape hatch: pass it when the operator handled publish manually via `make publish` and substeps 5a + 5b are therefore moot.

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
