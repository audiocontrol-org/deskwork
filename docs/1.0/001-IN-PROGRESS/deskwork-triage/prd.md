## PRD: deskwork-triage

### Problem Statement

After the v0.1 marketplace cut, installing either `deskwork` or `deskwork-studio` through the documented Claude Code marketplace flow (`/plugin install <name>@deskwork`) fails at runtime: any skill that shells out to the plugin's wrapper (`deskwork <sub>` or `deskwork-studio ...`) exits 127. The wrappers look for a runnable bundle at `${SCRIPT_DIR}/../../../packages/<pkg>/bundle/...` and `${SCRIPT_DIR}/../../packages/<pkg>/bundle/...`, but Claude Code's marketplace install only copies the contents of `plugins/<name>/` into `~/.claude/plugins/cache/`. Both candidate paths therefore resolve outside the cache and never exist, so the wrapper hits its loud-error fallback. The plugins are non-functional for anyone on the consumer install path.

PR #3 (`feat(build): self-contained bundles`) committed pre-built bundles to git so a fresh `git clone` runs without `npm install`. That closed the *developer* install gap. It did not close the *marketplace* install gap, because the bundles still live under `packages/<pkg>/bundle/`, outside the plugin payload.

### Solution

Move the runtime distribution artifacts of each plugin into the plugin tree itself, so the marketplace boundary (`plugins/<name>/`) is the single distribution unit:

- `packages/cli/bundle/cli.mjs` → `plugins/deskwork/bundle/cli.mjs`
- `packages/studio/bundle/server.mjs` → `plugins/deskwork-studio/bundle/server.mjs`
- `packages/studio/public/` → `plugins/deskwork-studio/public/`

Each `bin/<wrapper>` resolves the bundle at `${SCRIPT_DIR}/../bundle/<entry>.mjs`, which works in both the dev path (running from the source tree) and the marketplace cache (running from `~/.claude/plugins/cache/...`). The workspace-symlink lookup (`node_modules/.bin/<bin>`) stays first in the resolution order so dev iteration keeps running source via tsx.

For studio, the server's `publicDir()` resolver checks two candidates so the source-path layout (`packages/studio/src/server.ts` resolving via `../../../plugins/deskwork-studio/public/`) and the bundle-path layout (`plugins/deskwork-studio/bundle/server.mjs` resolving via `../public/`) both find the relocated assets.

### Acceptance Criteria

- A clean simulation of the marketplace cache (a copy of `plugins/deskwork/` to a tmp directory, no surrounding repo) runs `bin/deskwork --help` to exit 0
- A clean simulation of `plugins/deskwork-studio/` runs `bin/deskwork-studio --help` to exit 0 and serves `/static/*` assets from the in-tree `public/`
- Workspace dev path still runs source via tsx unchanged: `node_modules/.bin/deskwork ...` resolves to source for both packages
- All existing unit + integration tests in `packages/cli` and `packages/studio` pass
- `claude plugin validate plugins/deskwork` and `claude plugin validate plugins/deskwork-studio` both pass
- `git ls-files plugins/deskwork/bundle plugins/deskwork-studio/bundle plugins/deskwork-studio/public` shows the relocated artifacts tracked

### Out of Scope

- Reorganising the npm `packages/` tree beyond moving build outputs out of it
- Changing the plugin manifest, marketplace.json, or skill SKILL.md content
- Re-architecting the studio's `public/dist/` build pipeline (still produced by `packages/studio/build.ts`, just written to the new path)
- Future bugs unrelated to marketplace install
- Symlink-based solutions (rejected: marketplace cache copies do not preserve cross-tree symlinks portably)

### Technical Approach

**Single distribution unit.** `plugins/<name>/` is what the marketplace ships. Every file the runtime needs at install time must live under that root. Source packages under `packages/` remain the build inputs; their `build.ts` writes outputs into the plugin tree.

**One source of truth per artifact.** Avoid committing two copies of the same bundle. The build script writes directly to the plugin tree; nothing else points at the old location.

**Resolution order in wrappers.** Unchanged in spirit, only paths shift:

1. Workspace symlink (`node_modules/.bin/<name>`) — dev path, runs source via tsx, supports edits without rebuild.
2. Plugin-internal bundle (`${SCRIPT_DIR}/../bundle/<entry>.mjs`) — works for both `git clone` users (because the bundle is committed under `plugins/`) and marketplace-install users.
3. Loud error.

**Studio public/ resolution.** `publicDir()` tries `${dirname(here)}/../public` first (the bundle layout) and falls back to `${dirname(here)}/../../../plugins/deskwork-studio/public/` (the dev layout where `here` is `packages/studio/src/`). Both candidates resolve to the same absolute path, the latter only used when running source via tsx.
