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

**3. Run the marketplace smoke test (pre-tag gate)**

```sh
bash scripts/smoke-marketplace.sh
```

This reproduces the marketplace install path against the current commit: it `git archive`s `plugins/<name>` + `packages/` from HEAD, materializes the vendor symlinks the same way the release workflow does, runs `npm install --omit=dev`, boots the studio against an in-tmp fixture project, asserts every documented page route + every scraped `<script src>` / `<link href>` returns HTTP 200, and exercises `deskwork --help` for the CLI plugin. It catches the v0.6.0–v0.8.2 client-JS-404 bug class, dangling vendor symlinks, missing files, and broken bin wrappers — packaging regressions — before they ship.

The smoke test reads from `HEAD`, so any fix you intend to release must be committed before this step. If the smoke test fails, do NOT tag — fix the bug, commit, re-run.

Local-only by design (per `.claude/rules/agent-discipline.md`: "No test infrastructure in CI"). CI on this project is brutally slow; the smoke test materializes a vendor tree and boots a real HTTP listener, which would extend CI runtime significantly. The release-time gate is the operator running this script before pushing the tag.

**4. Commit + tag**

```sh
git commit -am "chore: release v0.2.0"
git tag v0.2.0
git push && git push --tags
```

The push of the `v*` tag triggers `.github/workflows/release.yml`, which:

- Installs deps
- Runs the full test suite
- Materializes the vendor tree (see "Vendor materialize mechanism" below)
- Creates a GitHub release with auto-generated notes from commits since the previous tag

If the workflow fails, the tag is pushed but no release exists. Fix the issue, retry the workflow, or delete the tag and re-tag the fix:

```sh
git tag -d v0.2.0
git push --delete origin v0.2.0
# fix, then re-tag
```

### Vendor materialize mechanism

Each plugin tree under `plugins/<name>/vendor/` holds committed symlinks pointing at the corresponding workspace package under `packages/<pkg>/`. In dev (a clone of the repo with `npm install` run at the root), the symlinks resolve correctly — edits to `packages/core/src/*.ts` are picked up immediately by anything reading `plugins/<plugin>/vendor/core/...`. This is the inner-loop convenience.

At release time, those symlinks have to become real directory copies, because the marketplace install path copies `plugins/<name>/` into the operator's plugin cache **without** the surrounding `packages/` tree. A symlink whose relative target traverses out of the copied subtree (`../../../packages/core`) resolves to nothing on the operator's side.

The release workflow handles this via `scripts/materialize-vendor.sh`, run after the test suite passes and before the tag is finalized:

1. For each `(plugin, vendored-package)` pair, replace the symlink at `plugins/<plugin>/vendor/<pkg>` with an `rsync`-driven directory copy of `packages/<pkg>/` (excluding `node_modules`, `dist`, `.turbo`, `*.tsbuildinfo`).
2. Verify byte-for-byte parity via `diff -r` between the source `packages/<pkg>` and the materialized vendor copy. Any drift fails the workflow.
3. Commit the materialized tree on top of the version-bump commit. The tag points at this materialized commit, so any consumer cloning `audiocontrol-org/deskwork#vX.Y.Z` lands on a self-contained tree.

This is "Path B" from the Phase 23 verification spike. Path A (rewriting the symlinks to point inside the cache at install time) was rejected because Claude Code's marketplace install is opaque — there's no install hook the plugin can run on the operator's side. Path B keeps all the work at the repo's release boundary, where we control it.

Adopters cloning a `v*` ref get a tree where `plugins/<plugin>/vendor/<pkg>` is a real directory, identical to `packages/<pkg>` at the time of release. First-run `npm install --omit=dev` (triggered by the bin wrapper, see plugin READMEs) then links the vendored packages into `node_modules` and the plugin runs from source via `tsx`.

**5. Verify**

```sh
gh release view v0.2.0
```

Should print the release with auto-generated notes. The release page on GitHub shows the changelog and links to the tagged commit.

### Pre-push hook (separate from releases)

A pre-push hook at `.husky/pre-push` runs the workspace test suite and validates the plugin manifests. It does NOT rebuild bundles — bundles are no longer part of the architecture (Phase 23b retired the `bundle/` directory in favor of the source-shipped + on-startup-build model documented in the plugin READMEs).

Contributors get the hook installed automatically when they `npm install` (via husky's `prepare` script). If the hook fails, the push fails — fix the underlying issue and push again.

### What gets released

A deskwork release is a git tag on `main`, with one materialize-vendor commit on top of the version-bump commit. Consumers fetch the tagged commit when they pin their marketplace. The materialized vendor tree means a fresh `claude plugin install` against `audiocontrol-org/deskwork#v0.2.0` lands on a self-contained tree that runs end-to-end after a one-time first-run `npm install` driven by the plugin's bin wrapper.

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
