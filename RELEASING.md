## Releasing deskwork

The deskwork marketplace tracks the default branch of `audiocontrol-org/deskwork`. Tagged releases (`v0.1.0`, `v0.2.0`, …) give consumers a stable ref they can pin to via `/plugin marketplace add audiocontrol-org/deskwork#vX.Y.Z`. Without a tag, every consumer who runs `/plugin marketplace update deskwork` gets HEAD of `main`.

### To release: `/release`

The release ceremony is enshrined as the `/release` skill at `.claude/skills/release/`. Run that — it handles version validation, tagging, and the atomic push. The publish step runs inside `.github/workflows/publish-npm.yml` (triggered by the tag push). Everything else (assert-published, marketplace smoke) runs LOCALLY in the skill — much faster turnaround than waiting on GH Actions minutes. The skill is hard-gated: no `--force`, no `--skip-smoke`. If a gate refuses, fix the underlying state.

The skill walks four operator decision points:

1. **Precondition + version** — clean tree, FF over origin/main, branch up-to-date. Operator types the new version; skill validates it as strictly greater than the last tag.
2. **Post-bump diff review** — operator confirms the manifest bump diff before commit.
3. **Tag message** — skill verifies `@deskwork/{core,cli,studio}@<version>` are NOT yet published on npm (catches "version already published" before the tag goes out); operator confirms the tag message; skill creates the annotated tag.
4. **Push + local verification** — skill prints the exact push command; operator confirms; skill atomic-pushes commit + branch + tag in one `git push --follow-tags` RPC. The tag push fires `publish-npm.yml`, which publishes all three packages via OIDC and exits. The skill then runs `assert-published` LOCALLY (with retry-with-backoff to ride out npm CDN propagation) followed by `scripts/smoke-marketplace.sh` LOCALLY, then reports the release URL.

The skill refuses to re-tag a published version. Recovery from a botched release is to bump-patch (e.g. `v0.9.0` broken → ship `v0.9.1`).

### Trusted Publisher setup (one-time per package on npmjs.com)

`.github/workflows/publish-npm.yml` authenticates to npm via OIDC, not a token. For npm to honor the workflow's OIDC token, each `@deskwork/*` package on npmjs.com must have a Trusted Publisher entry pointing at this workflow file. Do this once per package:

1. Sign in to npmjs.com.
2. Navigate to the package page (e.g. `https://www.npmjs.com/package/@deskwork/core`).
3. Settings → Publishing access (or "Trusted Publishers").
4. Add trusted publisher:
   - Publisher: GitHub Actions
   - Organization: `audiocontrol-org`
   - Repository: `deskwork`
   - Workflow filename: `publish-npm.yml`
   - Environment: (leave blank)
5. Save.

Repeat for all three packages: `@deskwork/core`, `@deskwork/cli`, `@deskwork/studio`.

The workflow filename is a contract — renaming `publish-npm.yml` requires re-registering the trusted publisher on each package. Keep the path stable.

### Recovery — CI is broken

When the `publish-npm.yml` workflow fails (npm outage, OIDC misconfiguration, transient flake) or the operator wants a one-off out-of-band publish, fall back to `make publish`:

1. **Determine published state** — for each package:
   ```
   npm view @deskwork/core versions --json | jq '.[-1]'
   npm view @deskwork/cli  versions --json | jq '.[-1]'
   npm view @deskwork/studio versions --json | jq '.[-1]'
   ```
2. **Nothing published yet**: revert the bump commit (`git reset --soft HEAD~1`), fix the underlying issue, re-run `/release`. If the tag already went to origin, the npm artifacts are missing but the git tag stands; bump-patch the next release.
3. **Partial publish state** (some packages succeeded, others failed): the safest path is to bump to v<next-patch> + re-run `/release`. The half-published version stays orphaned on npm — npm forbids republishing the same version anyway. Document the orphaned version in the next release notes.
4. **Manual publish path**:
   ```
   make publish      # token-auth, prompts for 2FA OTP per package
   ```
   `make publish` reads the npm token from `~/.config/deskwork/npm-credentials.txt`, writes an ephemeral `.npmrc`, and publishes WITHOUT provenance (the manual path uses token auth; provenance attestation requires the OIDC env that only the workflow has). The artifacts reach adopters; the npm-side trusted-publisher attestation is the only thing missing for that release.
5. **One-off publish of a single package** (out-of-band fix, no full release):
   ```
   make publish-core      # or publish-cli / publish-studio
   ```
   Use sparingly. Most fixes should go through a full release.
6. **Resume `/release` after manual publish** (when CI succeeded at every step except the publish): invoke `/release --skip-publish-wait`. The skill skips Pause 4's workflow-watch step (since the operator already handled publish out-of-band) and proceeds directly to `gh release view`.

### Maturity stance

The skill currently pushes directly to `origin/main` (no PR-merge, no CI-as-second-gate). This is a **deliberate pre-1.0 velocity decision**:

- Solo-maintainer project — PR-as-second-reviewer mostly adds drag without catching real bugs the agent code-review hasn't already caught.
- CI on this project is brutally slow; PR + CI gate adds friction we can't afford pre-1.0.
- The local smoke (`scripts/smoke-marketplace.sh`) is the real release-blocking gate.

**Revisit at 1.0 stabilization.** Once the project stabilizes, the case for PR-merge / CI-as-second-gate / branch protection grows substantially: adopter base widens; multi-contributor work becomes plausible; branch protection becomes appropriate. The release skill (specifically `atomicPush` in `lib/release-helpers.ts`) is the place to swap in a PR-merge flow when that happens. The maturity comment on `atomicPush` itself names the trigger.

### Branch model: trunk-based, no release branches

`main` IS the release surface. `/release` runs from a working branch, smokes, and atomic-pushes HEAD to `origin/main` + the tag in one RPC. There is no long-lived `release` branch; there is no per-version `release/v0.x` branch. The model is trunk-based:

- **Feature branches** (`feature/<slug>`) develop in isolation. Merge or rebase from `main` before integration.
- **Integration**: when a feature is ready, it merges to `main` (typically via `/release` from the feature branch when the feature itself is the next release, or via plain merge when batched into a later release).
- **Releases**: `/release` from any branch whose HEAD should become the next tagged version. The skill validates clean tree + fast-forward over `origin/main` + tracking-up-to-date as preconditions; if those pass, HEAD goes to `origin/main` and gets tagged.

**The cost** is that a feature branch must catch up with `main` before it can release. If `main` advanced (e.g. an architecture pivot landed) while a feature was in flight, the feature branch needs `git merge origin/main` before `/release` will accept it. This is intended — it forces the feature to integrate against current reality before becoming the release.

**Why not a long-lived `release` branch?** It would have to merge from `main` for every architecture change anyway; it would shift the integration cost without removing it. For solo / small-team pre-1.0 work, the extra branch is overhead without payoff.

**Why not short-lived per-version release branches** (`release/v0.9.6`, etc.)? They earn their keep when `main` needs to keep accepting work *while* a release is being prepared (parallel teams, CI race conditions during smoke, last-minute fixes). For solo pre-1.0 work where `/release` runs serially, there is no "main keeps moving" — only one operator, one release at a time.

**When to introduce release branches**: at 1.0 stabilization, when the project starts supporting v1.x bugfixes alongside v2.x development. `release/v1.x` then becomes a real maintenance branch with its own backport policy. Mark this as a deferred decision; the trunk-based model holds for now.

### npm-publish architecture

Plugin runtime code ships as published npm packages under the `@deskwork/*` scope: `@deskwork/core`, `@deskwork/cli`, `@deskwork/studio`. Plugin trees themselves are thin shells (`bin/` + `skills/` + `plugin.json`) that first-run-install the corresponding package from the public registry.

The plugin shell's `plugin.json` `version` field is kept in lockstep with the published npm package version. `scripts/bump-version.ts` bumps both atomically, plus the per-plugin shell `package.json#dependencies` pin (e.g. `"@deskwork/cli": "0.9.5"`), so the entire repo moves to the same version in one commit.

**Publish path (CI-driven via npm Trusted Publisher / OIDC; verification runs locally):** `.github/workflows/publish-npm.yml` is triggered by every `v*` tag push. The workflow does ONE thing — `npm publish` via OIDC — because that's the only step that requires CI (OIDC token-less, provenance-attested publishing only works from a workflow with `id-token: write`). The post-publish verification (assert-published + marketplace smoke) runs LOCALLY in the `/release` skill, because waiting 5-10 minutes on GH Actions minutes for the same scripts that run in ~1-2 minutes locally is poor turnaround for iteration on release-process bugs.

1. The `/release` skill verifies the version is not yet on npm (`assert-not-published`) BEFORE the tag goes out, so the workflow doesn't fail mid-publish on a duplicate version.
2. The operator confirms the push prompt; the skill runs `git push --follow-tags`, which lands the tag on origin and fires `publish-npm.yml`.
3. The workflow checks out the tagged commit, runs `npm ci`, then `make publish-ci` — which calls `npm publish --workspace @deskwork/<pkg>` for each of core / cli / studio under OIDC. Each `npm publish` invokes the package's own `prepack` script automatically (tsc build + auxiliary file copies + chmod on bin entries), so no separate build step is needed. `NPM_CONFIG_PROVENANCE=true` is set on the workflow env, so the publish emits provenance attestation tied to the workflow run.
4. After atomic-push returns success, the `/release` skill runs (locally) `tsx .claude/skills/release/lib/release-helpers.ts assert-published <version>` to confirm all three packages reached the registry. The helper polls `npm view` with retry-with-backoff (initial 5s, exponential to 30s cap, 6 attempts) to ride out CDN propagation lag between the workflow accepting the PUT and the read API serving the new version.
5. After assert-published succeeds, the skill runs `bash scripts/smoke-marketplace.sh` LOCALLY — clones the marketplace, npm-installs from the registry, boots studio, asserts routes return 200. This is the adopter-perspective verification.
6. On both succeeding, the skill reports the release URL via `gh release view`.

Each `@deskwork/*` package on npmjs.com has a Trusted Publisher entry registered against this exact workflow filename (`publish-npm.yml`). That registration plus the workflow's `id-token: write` permission is what authorizes the publish — there is no `NPM_TOKEN` secret. See § "Trusted Publisher setup" above for the one-time-per-package registration steps and § "Recovery — CI is broken" for the `make publish` manual-fallback procedure when the workflow itself is broken.

**Manual fallback paths:** `make publish` (token-auth, prompts for 2FA OTP per package) is the operator-driven recovery flow when CI is broken or for one-off out-of-band publishes. `make publish-ci` is what the workflow invokes under OIDC; running it from a local shell without the OIDC env will fail. Each per-package manifest declares `"publishConfig": { "access": "public", "provenance": true }` so the registry-side defaults match the workflow path; manual `make publish` overrides provenance off (`--no-provenance`) because token auth can't emit OIDC attestation.

**Adopter install:** Claude Code clones the plugin's `git-subdir` source into the operator's plugin cache. On first invocation, the bin shim (`plugins/<plugin>/bin/<bin>`) runs `npm install --omit=dev` inside the plugin tree, which fetches `@deskwork/<pkg>@<pinned-version>` from the public registry into `<pluginRoot>/node_modules/`. Subsequent invocations skip that step. Plugin updates (via `/plugin marketplace update`) ship a new plugin shell with a bumped `plugin.json` version; the bin shim's version-drift check triggers a re-install on next invocation.

### What gets released

Each release has two surfaces, both triggered by the single `v*` tag push:

1. **`@deskwork/{core,cli,studio}@<version>` on npm** — published by `.github/workflows/publish-npm.yml`, the canonical publish authority. The workflow runs the publish, the post-publish `assert-published` registry check, and the marketplace smoke gate in CI under OIDC (no token). The plugin shells fetch these packages at adopter first-run. `make publish` (token + 2FA) is the manual fallback when CI is broken — see § "Recovery — CI is broken" and § "Trusted Publisher setup" for the registration that makes the workflow path work.
2. **A git tag on `main`** (e.g. `v0.9.5`). The tag triggers `.github/workflows/release.yml` in parallel with `publish-npm.yml`; `release.yml` creates a GitHub release with auto-generated notes from commits since the previous tag. The marketplace's `git-subdir` sources resolve to the default branch (no per-tag `source.ref` pin), so an operator running `/plugin marketplace update deskwork` after the release picks up the new shell.

### Operator update path

Operators using deskwork in the wild get updates by:

```
/plugin marketplace update deskwork
/reload-plugins
```

Or pin to a specific release at install time:

```
/plugin marketplace add audiocontrol-org/deskwork#v0.2.0
```

Both flows are documented in the root `README.md`.

### Pre-push hook (separate from releases)

A pre-push hook at `.husky/pre-push` is currently a no-op — vendor materialization (which it used to verify) is retired (Phase 26). The hook file remains so future push-time checks can be added without re-bootstrapping husky.

Contributors get the hook installed automatically when they `npm install` (via husky's `prepare` script). If the hook fails, the push fails — fix the underlying issue and push again.
