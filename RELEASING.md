## Releasing deskwork

The deskwork marketplace tracks the default branch of `audiocontrol-org/deskwork`. Tagged releases (`v0.1.0`, `v0.2.0`, …) give consumers a stable ref they can pin to via `/plugin marketplace add audiocontrol-org/deskwork#vX.Y.Z`. Without a tag, every consumer who runs `/plugin marketplace update deskwork` gets HEAD of `main`.

### To release: `/release`

The release ceremony is enshrined as the `/release` skill at `.claude/skills/release/`. Run that — it handles version validation, tagging, and the atomic push. The publish + smoke gates run inside `.github/workflows/publish-npm.yml` (triggered by the tag push). The skill is hard-gated: no `--force`, no `--skip-smoke`. If a gate refuses, fix the underlying state.

The skill walks four operator decision points:

1. **Precondition + version** — clean tree, FF over origin/main, branch up-to-date. Operator types the new version; skill validates it as strictly greater than the last tag.
2. **Post-bump diff review** — operator confirms the manifest bump diff before commit.
3. **Tag message** — skill verifies `@deskwork/{core,cli,studio}@<version>` are NOT yet published on npm (catches "version already published" before the tag goes out); operator confirms the tag message; skill creates the annotated tag.
4. **Push + workflow watch** — skill prints the exact push command; operator confirms; skill atomic-pushes commit + branch + tag in one `git push --follow-tags` RPC. The tag push fires `publish-npm.yml`, which publishes all three packages via OIDC, asserts they're on the registry, and runs `scripts/smoke-marketplace.sh`. The skill watches the workflow via `gh run watch` and reports the release URL on success.

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

### npm-publish architecture (Phase 26, v0.9.5+)

Plugin runtime code ships as published npm packages under the `@deskwork/*` scope: `@deskwork/core`, `@deskwork/cli`, `@deskwork/studio`. Plugin trees themselves are thin shells (`bin/` + `skills/` + `plugin.json`) that first-run-install the corresponding package from the public registry.

The plugin shell's `plugin.json` `version` field is kept in lockstep with the published npm package version. `scripts/bump-version.ts` bumps both atomically, plus the per-plugin shell `package.json#dependencies` pin (e.g. `"@deskwork/cli": "0.9.5"`), so the entire repo moves to the same version in one commit.

**Publish path (driven by `/release`, executed in the operator's terminal):** the publish step is the third pause of the `/release` flow.

1. The skill verifies the version is not yet on npm (`assert-not-published`).
2. The skill prints clear instructions and **the operator runs `make publish` in their own terminal**. The agent's Bash tool can't accept interactive stdin (2FA OTP prompts) — running it from the agent context would hang. `make publish` sources an npm token from `~/.config/deskwork/npm-credentials.txt`, writes an ephemeral `.npmrc` per `npm publish`, and prompts for one 2FA OTP per package (three total).
3. When all three packages are published, the operator confirms in chat ("done") and the skill runs `assert-published` to verify the registry actually has all three. Only then does it proceed to the smoke gate.

Publish happens BEFORE the smoke gate, so smoke can `npm install` against the freshly-published packages.

**Adopter install:** Claude Code clones the plugin's `git-subdir` source into the operator's plugin cache. On first invocation, the bin shim (`plugins/<plugin>/bin/<bin>`) runs `npm install --omit=dev` inside the plugin tree, which fetches `@deskwork/<pkg>@<pinned-version>` from the public registry into `<pluginRoot>/node_modules/`. Subsequent invocations skip that step. Plugin updates (via `/plugin marketplace update`) ship a new plugin shell with a bumped `plugin.json` version; the bin shim's version-drift check triggers a re-install on next invocation.

The vendor-materialization mechanism that this replaces (Phase 23b–23g, v0.5.0–v0.9.4) was retired in v0.9.5. CI no longer materializes anything; the release workflow handles tagging + GitHub release notes only.

### What gets released

Each release has two surfaces:

1. **`@deskwork/{core,cli,studio}@<version>` on npm** — published via `make publish`, run by the operator in their own terminal during Pause 3 of `/release`. This is the primary artifact; the plugin shells fetch this at adopter first-run.
2. **A git tag on `main`** (e.g. `v0.9.5`). The tag triggers `.github/workflows/release.yml`, which validates `marketplace.json` plugin paths and creates a GitHub release with auto-generated notes from commits since the previous tag. The marketplace's `git-subdir` sources resolve to the default branch (no per-tag `source.ref` pin), so an operator running `/plugin marketplace update deskwork` after the release picks up the new shell.

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
