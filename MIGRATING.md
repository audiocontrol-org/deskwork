## Migrating to v0.9.0 (source-shipped re-architecture)

Phase 23 of the deskwork-plugin work retired the precompiled `bundle/` directory in favor of source-shipped plugins that build at first run. v0.9.0 is the first release on this architecture. This page captures what existing adopters see when they upgrade.

### TL;DR

- One-time `npm install` (~30s) on the first `/deskwork:*` skill invocation after the marketplace update. Subsequent invocations are fast.
- Existing `.deskwork/config.json` works unchanged. No data migration.
- If you previously edited a file under `bundle/` to customize behavior, that surface is gone — migrate the change to the override resolver via `/deskwork:customize <category> <name>`.
- Pins to v0.8.x or earlier still work; they continue to use the old bundle-based architecture.

### What changed under the hood

**Before (≤ v0.8.x):** plugins shipped precompiled ESM bundles at `plugins/<plugin>/bundle/server.mjs` and `packages/cli/bundle/cli.mjs`. The bin wrapper preferred a workspace symlink, fell back to `node bundle.mjs`. Marketplace installs ran the bundle directly with no `npm install` on the operator's side.

**After (v0.9.0+):** plugins ship source. Workspace packages are vendored under `plugins/<plugin>/vendor/<pkg>/` — symlinked in dev clones, materialized to real directory copies at release time by `scripts/materialize-vendor.sh`. The bin wrapper detects a missing `node_modules` (the marketplace-install case) and runs `npm install --omit=dev` once before exec'ing the source via `tsx`. Studio client assets (`/static/dist/*.js`) are produced by an on-startup esbuild pass that writes to `<pluginRoot>/.runtime-cache/dist/`. No precompiled artifacts in the tree.

The full mechanism is documented in [`RELEASING.md`](./RELEASING.md#vendor-materialize-mechanism).

### Adopter checklist

#### 1. Update the marketplace

Same as any other update:

```
/plugin marketplace update deskwork
/reload-plugins
```

#### 2. Expect a one-time install on first invocation

The first time you run `/deskwork:install`, `/deskwork-studio:studio`, or any other `/deskwork:*` skill after the update, the bin wrapper runs `npm install --omit=dev` inside the plugin tree. You'll see:

```
deskwork: first run — installing dependencies (one-time)...
```

(or `deskwork-studio: first run — ...` from the studio plugin). This takes ~30s on a typical machine and is a one-time cost per plugin per update. Subsequent invocations skip the install entirely.

If the install fails (network outage, disk full, etc.), the wrapper exits non-zero with the npm error attached. Re-running the same command after fixing the cause picks up where it left off.

#### 3. Existing configs work unchanged

`.deskwork/config.json`, the editorial calendar markdown files, frontmatter `deskwork.id` UUIDs, and review workflow state on disk are all untouched by the architecture change. No migration helper to run, no schema bump.

#### 4. Replace `bundle/` monkeypatches with overrides

If you locally edited a file under `plugins/<plugin>/bundle/` (or `packages/<pkg>/bundle/`) to customize behavior — re-skin the dashboard, alter a doctor rule, change a render shape — that file no longer exists. The replacement is the override resolver added in Phase 23f.

To migrate:

```
/deskwork:customize templates dashboard      # re-skin the dashboard
/deskwork:customize doctor missing-frontmatter-id   # alter a doctor rule
```

The skill copies the plugin default into `<projectRoot>/.deskwork/<category>/<name>.ts`. Edit that copy. The runtime resolver picks it up automatically — no plugin fork, no rebuild. Overrides survive plugin upgrades because they live in your project, not the plugin cache.

See [`plugins/deskwork/skills/customize/SKILL.md`](./plugins/deskwork/skills/customize/SKILL.md) for the full list of overridable templates and rules, plus the safety rules around the override module's signature.

#### 5. Pinned releases continue to work

If your install pinned to a specific tag (e.g. `audiocontrol-org/deskwork#v0.8.7`), nothing changes — that tag still resolves to the bundle-based architecture and runs the same way it always did. Move to v0.9.0+ on your schedule.

When you do move forward, drop the pin or update it to the new tag:

```
/plugin marketplace add audiocontrol-org/deskwork#v0.9.0
```

…and proceed through the checklist above.

### Where to file issues

If anything in the migration path doesn't work for you, open an issue at <https://github.com/audiocontrol-org/deskwork/issues> with:

- Your prior pin (if any) and the version you're moving to.
- The exact command you ran and the full output (especially any `npm install` errors from the first-run path).
- Whether you had local `bundle/` edits, and what they did.
