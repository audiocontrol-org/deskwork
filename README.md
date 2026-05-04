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

- **Editorial lifecycle** — Ideas → Planned → Outlining → Drafting → Review → Published, with structured review iteration loops.
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

### Getting updates

deskwork tracks the default branch of `audiocontrol-org/deskwork`. To pull the latest:

```
/plugin marketplace update deskwork
/reload-plugins
```

The first invocation of any deskwork skill after an update may rerun the plugin tree's `npm install --omit=dev` if the pinned `@deskwork/*` version changed (still a one-time ~30s step per update). Subsequent invocations are fast.

By default, third-party marketplaces don't auto-update — run those two commands when you want to refresh. To toggle auto-update, use `/plugin` and look for the **Marketplaces** tab.

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
