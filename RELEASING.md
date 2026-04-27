## Releasing deskwork

The deskwork marketplace tracks the default branch of `audiocontrol-org/deskwork`. Tagged releases (`v0.1.0`, `v0.2.0`, …) give consumers a stable ref they can pin to via `/plugin marketplace add audiocontrol-org/deskwork#vX.Y.Z`. Without a tag, every consumer who runs `/plugin marketplace update deskwork` gets HEAD of `main`.

This document is the manual release procedure. It's intentionally not "release on every merge" — release cadence is judgment-driven, not automated.

### Procedure

**1. Decide a version**

Pick `MAJOR.MINOR.PATCH`. The plugin doesn't have a stable public API yet; `0.x.y` numbering is informational. Bump on judgment:

- `0.x.0` — meaningful new capability (a new skill, a new plugin shell, a new architectural surface)
- `0.x.y` — bug fix, refinement, or doc-only change

**2. Bump every manifest**

```sh
npm run version:bump 0.2.0
```

This atomically updates `version` in: root `package.json`, every workspace `package.json`, both `plugins/*/.claude-plugin/plugin.json` files, and `.claude-plugin/marketplace.json` (top-level `metadata.version` plus each plugin entry's version).

Review the diff:

```sh
git diff
```

**3. Commit + tag**

```sh
git commit -am "chore: release v0.2.0"
git tag v0.2.0
git push && git push --tags
```

The push of the `v*` tag triggers `.github/workflows/release.yml`, which:

- Installs deps
- Runs the full test suite
- Verifies the bundles in `packages/*/bundle/` are up-to-date
- Creates a GitHub release with auto-generated notes from commits since the previous tag

If the workflow fails, the tag is pushed but no release exists. Fix the issue, retry the workflow, or delete the tag and re-tag the fix:

```sh
git tag -d v0.2.0
git push --delete origin v0.2.0
# fix, then re-tag
```

**4. Verify**

```sh
gh release view v0.2.0
```

Should print the release with auto-generated notes. The release page on GitHub shows the changelog and links to the tagged commit.

### Pre-push hook (separate from releases)

A pre-push hook at `.husky/pre-push` rebuilds the cli and studio bundles whenever source under `packages/{core,cli,studio}/src/` has changed since the remote tip. If the rebuilt bundle differs from what's committed, the push aborts with a message asking you to commit the regenerated bundle and try again. This keeps `bundle/cli.mjs` and `bundle/server.mjs` in sync with their source on every push, so a release tag can never include a stale bundle.

Originally a pre-commit hook (issue #4 install-gap fix). Moved to pre-push in v0.6.0 (issue #16) because the commit-level rebuild added perceptible friction to every commit. Pre-push catches the same correctness problem (no stale bundle ever lands on a remote branch) without paying the cost on every local commit. CI is the layered safety net for anyone whose local hook is disabled.

Contributors get the hook installed automatically when they `npm install` (via husky's `prepare` script). If the hook fails, the push fails — fix the build, commit the rebuilt bundle, and push again.

### What gets released

A deskwork release is just a git tag on `main`. Consumers fetch the tagged commit when they pin their marketplace. Bundles ship with the tag (committed to git), so a fresh `claude plugin install` against `audiocontrol-org/deskwork#v0.2.0` runs end-to-end with zero install ceremony.

No npm registry involvement. No release-artifact attachments. The git tag IS the release.

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
