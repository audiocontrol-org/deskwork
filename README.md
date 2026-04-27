## deskwork

Open-source plugins for [Claude Code](https://claude.com/claude-code). Flagship plugin `deskwork` — an editorial calendar lifecycle tool — is the first inhabitant of this monorepo; `feature-image` and `analytics` will follow.

### Plugins

| Name | Status | Purpose |
|---|---|---|
| `deskwork` | Shipping (v0) | Editorial calendar lifecycle: capture, plan, outline, draft, review, publish |
| `deskwork-studio` | Shipping (v0) | Optional local Hono web surface — dashboard, review pane, scrapbook, content view, manual |
| `feature-image` | Planned | Feature image generation for blog posts and pages |
| `analytics` | Planned | Content performance analytics |

### Capabilities

- **Editorial lifecycle** — Ideas → Planned → Outlining → Drafting → Review → Published, with structured review iteration loops.
- **Hierarchical content** — slugs accept `/`-separated segments (`the-outbound/characters/strivers`) and every lifecycle skill, calendar surface, and studio page works at any depth. Long-form projects (novels, essay collections, multi-chapter guides) live alongside flat blog posts in the same calendar. Per-entry `--layout {index|readme|flat}` controls the on-disk shape; `directoryIsHierarchicalNode` keeps untracked organizational dirs out of the slug.
- **Backfill existing content** — `/deskwork:ingest` walks paths, derives slugs from the on-disk layout, and adds rows to the calendar after a dry-run.
- **Studio web surface** — local Hono server with dashboard, longform review pane, shortform desk, scrapbook viewer, and bird's-eye content view.

### Installation

The monorepo publishes a Claude Code marketplace at the repository root. Inside any Claude Code session:

```
/plugin marketplace add https://github.com/audiocontrol-org/deskwork
/plugin install deskwork@deskwork
/plugin install deskwork-studio@deskwork    # optional companion
```

Then bootstrap the host project:

```
/deskwork:install
```

The plugins ship with self-contained ESM bundles (`packages/cli/bundle/cli.mjs`, `packages/studio/bundle/server.mjs`) so a fresh install runs end-to-end with nothing more than the cloned repo and `node` on PATH. Local-development installs (`claude --plugin-dir plugins/deskwork`) use the workspace-linked tsx binary instead — same wrapper, layered resolution.

See each plugin's `README.md` under `plugins/` for configuration and usage.

### Getting updates

deskwork tracks the default branch of `audiocontrol-org/deskwork`. To pull the latest:

```
/plugin marketplace update deskwork
/reload-plugins
```

By default, third-party marketplaces don't auto-update — run those two commands when you want to refresh. To toggle auto-update, use `/plugin` and look for the **Marketplaces** tab.

### Pinning to a stable release

Tagged releases (e.g. `v0.1.0`) give a stable point-in-time ref. Pin to one at install time:

```
/plugin marketplace add audiocontrol-org/deskwork#v0.1.0
```

Releases are listed at <https://github.com/audiocontrol-org/deskwork/releases>. The release procedure is documented in [`RELEASING.md`](./RELEASING.md) for contributors.

### Repository layout

```
deskwork/
├── .claude-plugin/
│   └── marketplace.json     # Marketplace manifest (lists each plugin)
├── packages/
│   ├── core/                # @deskwork/core — pure lib (no entry point)
│   ├── cli/                 # @deskwork/cli — single-dispatcher CLI
│   └── studio/              # @deskwork/studio — Hono web server
├── plugins/
│   ├── deskwork/            # Lifecycle plugin shell (SKILL.md + bash wrapper)
│   └── deskwork-studio/     # Studio plugin shell (single launch skill)
├── docs/                    # Feature PRDs, workplans, implementation notes
├── package.json             # npm workspaces root
├── LICENSE
└── README.md
```

Plugins are self-contained — no cross-plugin `../` imports. The plugin shells are thin (manifest + SKILL.md + bash wrapper); all logic lives in the npm packages under `packages/`.

### Development

See `docs/1.0/001-IN-PROGRESS/` for active feature work. The repo uses the feature lifecycle skills under `.claude/skills/feature-*` — run `/feature-help` for an overview.

### License

GPL-3.0-or-later. See `LICENSE`.
