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

### Vendor materialize mechanism

Each plugin tree under `plugins/<name>/vendor/` holds committed symlinks pointing at the corresponding workspace package under `packages/<pkg>/`. In dev (a clone of the repo with `npm install` run at the root), the symlinks resolve correctly — edits to `packages/core/src/*.ts` are picked up immediately by anything reading `plugins/<plugin>/vendor/core/...`. This is the inner-loop convenience.

At release time, those symlinks have to become real directory copies, because the marketplace install path copies `plugins/<name>/` into the operator's plugin cache **without** the surrounding `packages/` tree. A symlink whose relative target traverses out of the copied subtree (`../../../packages/core`) resolves to nothing on the operator's side.

The release workflow handles this via `scripts/materialize-vendor.sh`, run after the test suite passes and before the tag is finalized:

1. For each `(plugin, vendored-package)` pair, replace the symlink at `plugins/<plugin>/vendor/<pkg>` with an `rsync`-driven directory copy of `packages/<pkg>/` (excluding `node_modules`, `dist`, `.turbo`, `*.tsbuildinfo`).
2. Verify byte-for-byte parity via `diff -r` between the source `packages/<pkg>` and the materialized vendor copy — plus mode-bit verification (Phase 23 / Issue #78). Any drift fails the workflow.
3. The `/release` skill's atomic push triggers the workflow which then runs materialize and creates the GitHub release.

Adopters cloning a `v*` ref get a tree where `plugins/<plugin>/vendor/<pkg>` is a real directory, identical to `packages/<pkg>` at the time of release. First-run `npm install --omit=dev` (triggered by the bin wrapper, see plugin READMEs) then links the vendored packages into `node_modules` and the plugin runs from source via `tsx`.

### Marketplace.json `source.ref` and adopter install (Issue #88)

Claude Code's marketplace install reads `marketplace.json` from the marketplace repo's **default branch** (not the tag), then clones each plugin from whatever `source` says. For the materialized-vendor mechanism above to actually reach adopters, every plugin entry in `marketplace.json` uses a `git-subdir` source with an explicit `ref` pointing at the current release tag:

```json
{
  "name": "deskwork",
  "source": {
    "source": "git-subdir",
    "url": "https://github.com/audiocontrol-org/deskwork.git",
    "path": "plugins/deskwork",
    "ref": "v0.9.3"
  }
}
```

The `ref` field is parameterized — `scripts/bump-version.ts` updates it for every git-subdir plugin in the same commit that bumps `version` everywhere else, so the chore-release commit on main carries the new ref atomically with the new version. The release workflow then re-points the tag at the materialize commit; because `source.ref` resolves through the tag (not a fixed sha), adopters running `/plugin marketplace update` after the workflow finishes get the materialized vendor.

The release workflow's "Verify marketplace.json source.ref points at tag" step is a safety gate — if the chore-release commit on main didn't bump `source.ref` to the new tag, the workflow fails before creating the GitHub release. This catches the case where the bump script is bypassed.

### What gets released

A deskwork release is a git tag on `main`. Consumers fetch the tagged commit when they pin their marketplace. The materialized vendor tree means a fresh `claude plugin install` against `audiocontrol-org/deskwork#v0.2.0` lands on a self-contained tree that runs end-to-end after a one-time first-run `npm install` driven by the plugin's bin wrapper.

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

### Pre-push hook (separate from releases)

A pre-push hook at `.husky/pre-push` runs the workspace test suite and validates the plugin manifests. It does NOT rebuild bundles — bundles were retired in Phase 23b in favor of the source-shipped + on-startup-build model documented in the plugin READMEs.

Contributors get the hook installed automatically when they `npm install` (via husky's `prepare` script). If the hook fails, the push fails — fix the underlying issue and push again.
