## deskwork

Open-source plugins for [Claude Code](https://claude.com/claude-code). Flagship plugin `deskwork` — an editorial calendar lifecycle tool — is the first inhabitant of this monorepo; `feature-image` and `analytics` will follow.

### Plugins

| Name | Status | Purpose |
|---|---|---|
| `deskwork` | Shipping | Editorial calendar lifecycle: capture, plan, outline, draft, review, publish |
| `deskwork-studio` | Shipping | Optional local Hono web surface — dashboard, review pane, scrapbook, content view, manual |
| `dw-lifecycle` | Shipping | Project lifecycle orchestration: define → setup → issues → implement → review → ship → complete. Composes `superpowers` (required) and `feature-dev` (recommended) |
| `feature-image` | Planned | Feature image generation for blog posts and pages |
| `analytics` | Planned | Content performance analytics |

Current version + per-release notes live on the [GitHub releases page](https://github.com/audiocontrol-org/deskwork/releases).

### Capabilities

- **Editorial lifecycle** — eight stages: Ideas → Planned → Outlining → Drafting → Final → Published (linear pipeline), plus Blocked and Cancelled (off-pipeline). Universal verbs (iterate / approve / cancel) operate on any stage. The canonical state-machine spec is [`DESKWORK-STATE-MACHINE.md`](DESKWORK-STATE-MACHINE.md).
- **Hierarchical content** — slugs accept `/`-separated segments (`the-outbound/characters/strivers`) and every lifecycle skill, calendar surface, and studio page works at any depth. Long-form projects (novels, essay collections, multi-chapter guides) live alongside flat blog posts in the same calendar. Per-entry `--layout {index|readme|flat}` controls the on-disk shape; `directoryIsHierarchicalNode` keeps untracked organizational dirs out of the slug.
- **Cross-platform shortform composition** — author LinkedIn / Reddit / YouTube / Instagram posts for any tracked entry through the **same review surface** as longform (no parallel composer). Each draft is a real markdown file under the entry's scrapbook; the studio renders a small platform/channel header above the longform editor; approval writes the body into the calendar's distribution record. See [`plugins/deskwork/README.md`](plugins/deskwork/README.md#shortform--cross-platform-posts) for the lifecycle.
- **Refactor-proof binding** — calendar entries join to their content files via a UUID written into each markdown's frontmatter (`id: <uuid>`), not via a cached path. Renaming or moving a file in the content tree doesn't break the binding; deskwork rediscovers it on the next read by scanning `contentDir` for the matching id. The `deskwork doctor` command audits the binding metadata across calendar, files, and review workflows, and repairs ambiguous cases interactively.
- **Backfill existing content** — `/deskwork:ingest` walks paths, derives slugs from the on-disk layout, and adds rows to the calendar after a dry-run.
- **Studio web surface** — local Hono server with dashboard, unified review pane (longform + shortform), shortform coverage matrix, scrapbook viewer, and bird's-eye content view.
- **Customization layer** — operators override built-in studio templates and doctor rules in-project at `<projectRoot>/.deskwork/{templates,doctor}/<name>.ts` without forking the plugin. Use `/deskwork:customize <category> <name>` to copy a default into the project as a starting point.

### Installation

The monorepo publishes a Claude Code marketplace at the repository root. Inside any Claude Code session:

```
/plugin marketplace add https://github.com/audiocontrol-org/deskwork
/plugin install deskwork@deskwork
/plugin install deskwork-studio@deskwork    # optional companion
/plugin install dw-lifecycle@deskwork       # project lifecycle orchestration
```

Then bootstrap the host project:

```
/deskwork:install        # if using deskwork
/dw-lifecycle:install    # if using dw-lifecycle
```

The plugins ship as thin shells. On the first invocation after marketplace install, each plugin's `bin/` shim runs `npm install --omit=dev` inside the plugin tree once (~30s, one-time) to fetch its runtime dependencies. For `deskwork` and `deskwork-studio`, that means the corresponding `@deskwork/*` package from the public npm registry at the version pinned in the plugin's `plugin.json`; their manifest version is kept in lockstep with the published `@deskwork/{core,cli,studio}` npm package versions — bumping one bumps the others (see [`RELEASING.md`](./RELEASING.md)). For `dw-lifecycle`, the install fetches public deps (tsx, yaml, zod) only — its own logic ships in-tree, no `@deskwork/*` package involved. Subsequent invocations of any plugin skip the install step.

See each plugin's `README.md` under `plugins/` for configuration and usage. The `deskwork` plugin README documents the host content-schema requirement (Astro projects must allow the `deskwork:` namespace in frontmatter) and the `doctor` maintenance command.

### Install scope: user vs project

Claude Code records each `/plugin install` as either a **user-scope** install (`scope: "user"`) or a **project-scope** install (`scope: "local"`, bound to the project directory you ran the command in). The scope affects two things:

1. **Where the plugin is visible.** User-scope installs apply across every Claude Code session on the machine. Project-scope installs apply only to sessions started from that specific project directory.
2. **How updates flow.** When the marketplace catalog advances to a newer version (see *Getting updates* below), Claude Code auto-upgrades user-scope installs to the new version. **Project-scope installs do NOT auto-upgrade** — they stay pinned to the version that was current at install time until you explicitly re-install in that project. *(This scope-driven upgrade asymmetry is not currently documented in Claude Code's user-facing plugin docs; it's observable behavior verified against `~/.claude/plugins/installed_plugins.json`.)*

**Which scope to pick:**

- **User-scope (recommended for most adopters)** — `/plugin install <plugin>@<marketplace>` ensures every project on your machine sees the same plugin version, and a single `/plugin marketplace update` keeps them all current. Default to this unless you have a specific reason to pin.
- **Project-scope (for pinning)** — when you need a specific project to stay on a specific plugin version regardless of what the marketplace says next. Useful for reproducible builds, debugging a regression against a known-good version, or temporarily holding a project back while you migrate.

**Inspect your install state** by reading `~/.claude/plugins/installed_plugins.json`. Each plugin lists every install instance with its `scope`, `installPath` (`~/.claude/plugins/cache/<marketplace>/<plugin>/<version>/`), and `version`. If you installed deskwork from multiple worktrees over time, you'll typically see one `scope: "user"` entry plus several `scope: "local"` entries, each pinned to whatever version was current the moment you ran `/plugin install` in that project.

**Filesystem layout:**

```
~/.claude/plugins/
├── marketplaces/<marketplace>/         # git clone of the marketplace repo
│                                       # (advances on `/plugin marketplace update`)
├── cache/<marketplace>/<plugin>/<version>/   # checked-out plugin payload
│                                             # (Claude Code loads from here)
└── installed_plugins.json              # registry: which (plugin, version)
                                        # is installed at which scope
```

### Getting updates

deskwork tracks the default branch of `audiocontrol-org/deskwork`. Claude Code splits the update flow into a marketplace-catalog refresh + a per-plugin payload fetch (the analogue of `apt update` + `apt upgrade`, or `brew update` + `brew upgrade`). The actual command sequence depends on whether your installs are user-scope or project-scope (see *Install scope* above).

**If all your installs are user-scope (the recommended default):**

```
/plugin marketplace update deskwork
/reload-plugins
```

The marketplace update advances the catalog. Claude Code then auto-upgrades the user-scope installs to the new manifest version. `/reload-plugins` activates the new code in the current session without requiring a restart.

**If you have project-scope installs to upgrade:**

```
/plugin marketplace update deskwork
/plugin install deskwork@deskwork           # if installed at project-scope here
/plugin install deskwork-studio@deskwork    # if installed at project-scope here
/plugin install dw-lifecycle@deskwork       # if installed at project-scope here
/reload-plugins
```

The per-plugin `/plugin install` re-fetches the payload at the now-current manifest version, in the current project's scope. Run it from each project where you have project-scope installs you want to upgrade. *(If you have NO project-scope installs in this project, the `/plugin install` calls are still safe — they're no-ops against user-scope installs that already auto-upgraded.)*

**Mixed-scope adopters** (one plugin at user-scope, another at project-scope in this project): only the user-scope ones auto-upgrade on `marketplace update`; the project-scope ones need explicit `/plugin install`. The symptom is "I ran update and only some plugins picked up the new version." That's the scope distinction at work.

**What each command does:**
- `/plugin marketplace update <name>` — refresh the marketplace catalog (the git clone at `~/.claude/plugins/marketplaces/<name>/`). Does NOT itself fetch plugin payloads. May trigger auto-upgrade for user-scope installs.
- `/plugin install <plugin>@<marketplace>` — fetch the plugin's payload at the catalog's current version into `~/.claude/plugins/cache/<marketplace>/<plugin>/<version>/`. Records the install (or upgrade) in `installed_plugins.json`. Scope depends on the session context (user vs project).
- `/reload-plugins` — re-read plugin code from the on-disk cache into the running Claude Code session. Does NOT fetch anything; it's the activation step after a fetch.

The first invocation of any deskwork skill after an upgrade may rerun the plugin tree's `npm install --omit=dev` if the pinned `@deskwork/*` version changed (still a one-time ~30s step per upgrade). Subsequent invocations are fast.

**Catalog auto-update.** By default, third-party marketplaces don't auto-update the catalog — run `/plugin marketplace update` when you want to refresh. To toggle catalog auto-update, use `/plugin` and look for the **Marketplaces** tab. Auto-update only refreshes the catalog and (per the scope-driven behavior above) auto-upgrades user-scope installs; project-scope installs still need explicit `/plugin install` to advance.

**Why the asymmetry?** Most package managers separate manifest-refresh from version-upgrade for safety (`apt update` ≠ `apt upgrade`; `brew update` ≠ `brew upgrade`). Claude Code follows the same model for project-scope installs (where pinning is intentional) but auto-upgrades user-scope installs (where global currency is intentional). If you want all your installs to track the latest automatically, install at user-scope. If you want a project to hold a specific version, install at project-scope.

### Pinning to a stable release

Tagged releases give a stable point-in-time ref. Pick a version from the [releases page](https://github.com/audiocontrol-org/deskwork/releases) and pin at install time:

```
/plugin marketplace add audiocontrol-org/deskwork#<tag>
```

The release procedure is documented in [`RELEASING.md`](./RELEASING.md) for contributors.

### Migrating from earlier versions

The current shape (v0.10.0+) ships `@deskwork/{core,cli,studio}` as npm
packages; plugin shells `npm install --omit=dev` on first invocation. See
[`MIGRATING.md`](./MIGRATING.md) for version-by-version upgrade notes —
the v0.10.0 npm pivot superseded the v0.9.x source-shipped vendor/symlink
architecture, so historical sections in that file describing
`vendor/`, `materialize-vendor.sh`, or pinned `source.ref` describe earlier
versions, not current shape.

### Repository layout

```
deskwork/
├── .claude-plugin/
│   └── marketplace.json     # Marketplace manifest (lists each plugin)
├── packages/
│   ├── core/                # @deskwork/core   — pure lib, npm-published
│   ├── cli/                 # @deskwork/cli    — CLI, npm-published
│   └── studio/              # @deskwork/studio — Hono web server, npm-published
├── plugins/
│   ├── deskwork/            # Lifecycle plugin shell (SKILL.md + bin shim)
│   └── deskwork-studio/     # Studio plugin shell (SKILL.md + bin shim)
├── scripts/
│   ├── bump-version.ts      # Atomic version bump across every manifest
│   └── smoke-marketplace.sh # Local-only release-blocking smoke
├── Makefile                 # Publish targets for the @deskwork/* npm packages
├── docs/                    # Feature PRDs, workplans, implementation notes
├── package.json             # npm workspaces root
├── LICENSE
└── README.md
```

Plugins are self-contained — no cross-plugin `../` imports. The plugin shells are thin (manifest + SKILL.md + bin shim); the bin shim first-run-installs `@deskwork/<pkg>@<version>` from npm into the plugin's `node_modules/`, then dispatches.

### Development

See `docs/1.0/001-IN-PROGRESS/` for active feature work. The repo uses the feature lifecycle skills under `.claude/skills/feature-*` — run `/feature-help` for an overview.

### License

GPL-3.0-or-later. See `LICENSE`.
