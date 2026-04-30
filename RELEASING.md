## Releasing deskwork

The deskwork marketplace tracks the default branch of `audiocontrol-org/deskwork`. Tagged releases (`v0.1.0`, `v0.2.0`, …) give consumers a stable ref they can pin to via `/plugin marketplace add audiocontrol-org/deskwork#vX.Y.Z`. Without a tag, every consumer who runs `/plugin marketplace update deskwork` gets HEAD of `main`.

### To release: `/release`

The release ceremony is enshrined as the `/release` skill at `.claude/skills/release/`. Run that — it handles version validation, smoke, tagging, and the atomic push. The skill is hard-gated: no `--force`, no `--skip-smoke`. If a gate refuses, fix the underlying state.

The skill walks four operator decision points:

1. **Precondition + version** — clean tree, FF over origin/main, branch up-to-date. Operator types the new version; skill validates it as strictly greater than the last tag.
2. **Post-bump diff review** — operator confirms the manifest bump diff before commit.
3. **Smoke + tag message** — `scripts/smoke-marketplace.sh` runs as a hard gate; on pass, operator confirms the tag message.
4. **Final push confirmation** — skill prints the exact push command + what it will do; operator confirms; skill atomic-pushes commit + branch + tag in one `git push --follow-tags` RPC.

The skill refuses to re-tag a published version. Recovery from a botched release is to bump-patch (e.g. `v0.9.0` broken → ship `v0.9.1`).

### Maturity stance

The skill currently pushes directly to `origin/main` (no PR-merge, no CI-as-second-gate). This is a **deliberate pre-1.0 velocity decision**:

- Solo-maintainer project — PR-as-second-reviewer mostly adds drag without catching real bugs the agent code-review hasn't already caught.
- CI on this project is brutally slow; PR + CI gate adds friction we can't afford pre-1.0.
- The local smoke (`scripts/smoke-marketplace.sh`) is the real release-blocking gate.

**Revisit at 1.0 stabilization.** Once the project stabilizes, the case for PR-merge / CI-as-second-gate / branch protection grows substantially: adopter base widens; multi-contributor work becomes plausible; branch protection becomes appropriate. The release skill (specifically `atomicPush` in `lib/release-helpers.ts`) is the place to swap in a PR-merge flow when that happens. The maturity comment on `atomicPush` itself names the trigger.

### npm-publish architecture (Phase 26, v0.9.5+)

Plugin runtime code ships as published npm packages under the `@deskwork/*` scope: `@deskwork/core`, `@deskwork/cli`, `@deskwork/studio`. Plugin trees themselves are thin shells (`bin/` + `skills/` + `plugin.json`) that first-run-install the corresponding package from the public registry.

The plugin shell's `plugin.json` `version` field is kept in lockstep with the published npm package version. `scripts/bump-version.ts` bumps both atomically, plus the per-plugin shell `package.json#dependencies` pin (e.g. `"@deskwork/cli": "0.9.5"`), so the entire repo moves to the same version in one commit.

**Publish path (manual, operator's terminal):** the operator publishes via `make publish` (which sources an npm token from `~/.config/deskwork/npm-credentials.txt`). This step happens BEFORE tagging — the smoke checks `npm view @deskwork/<pkg>@<version>` and refuses to proceed if the pinned version isn't on the registry yet.

**Adopter install:** Claude Code clones the plugin's `git-subdir` source into the operator's plugin cache. On first invocation, the bin shim (`plugins/<plugin>/bin/<bin>`) runs `npm install --omit=dev` inside the plugin tree, which fetches `@deskwork/<pkg>@<pinned-version>` from the public registry into `<pluginRoot>/node_modules/`. Subsequent invocations skip that step. Plugin updates (via `/plugin marketplace update`) ship a new plugin shell with a bumped `plugin.json` version; the bin shim's version-drift check triggers a re-install on next invocation.

The vendor-materialization mechanism that this replaces (Phase 23b–23g, v0.5.0–v0.9.4) was retired in v0.9.5. CI no longer materializes anything; the release workflow handles tagging + GitHub release notes only.

### What gets released

Each release has two surfaces:

1. **`@deskwork/{core,cli,studio}@<version>` on npm** — published manually via `make publish` from the operator's terminal. This is the primary artifact; the plugin shells fetch this at adopter first-run.
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
