## deskwork

Open-source plugins for [Claude Code](https://claude.com/claude-code). Flagship plugin `deskwork` — an editorial calendar lifecycle tool — is the first inhabitant of this monorepo; `feature-image` and `analytics` will follow.

### Plugins

| Name | Status | Purpose |
|---|---|---|
| `deskwork` | Shipping (v0.4.2) | Editorial calendar lifecycle: capture, plan, outline, draft, review, publish |
| `deskwork-studio` | Shipping (v0.4.2) | Optional local Hono web surface — dashboard, review pane, scrapbook, content view, manual |
| `feature-image` | Planned | Feature image generation for blog posts and pages |
| `analytics` | Planned | Content performance analytics |

v0.4.2 patch — fixes: `deskwork ingest` skips `README.md` files without frontmatter (organizational, not pipeline content); provenance labels say `default` instead of `frontmatter` when a derived value came from a fallback rather than the file (#23).

v0.4.1 patch — fixes: scrapbook ingest predicate handles nested scrapbook dirs (#20); standalone scrapbook viewer save/rename/delete/create/upload endpoints now exist (#21).

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
```

Then bootstrap the host project:

```
/deskwork:install
```

The plugins ship source — there are no precompiled bundles to track. On the first `/deskwork:*` skill invocation (or a direct `deskwork` / `deskwork-studio` CLI call) after marketplace install, the plugin's `bin/` wrapper runs `npm install --omit=dev` inside the plugin tree once (~30s, one-time), then exec's the source via `tsx`. Subsequent invocations skip that step. Workspace packages (`@deskwork/core`, `@deskwork/cli`, `@deskwork/studio`) are vendored under `plugins/<plugin>/vendor/` — symlinked in dev clones, materialized to real directory copies at release time so a marketplace install is self-contained. See [`RELEASING.md`](./RELEASING.md#vendor-materialize-mechanism) for the mechanism.

See each plugin's `README.md` under `plugins/` for configuration and usage. The `deskwork` plugin README documents the host content-schema requirement (Astro projects must allow the `deskwork:` namespace in frontmatter) and the `doctor` maintenance command.

### Getting updates

deskwork tracks the default branch of `audiocontrol-org/deskwork`. To pull the latest:

```
/plugin marketplace update deskwork
/reload-plugins
```

The first invocation of any deskwork skill after an update may rerun the plugin tree's `npm install --omit=dev` if package versions changed (still a one-time ~30s step per update). Subsequent invocations are fast.

By default, third-party marketplaces don't auto-update — run those two commands when you want to refresh. To toggle auto-update, use `/plugin` and look for the **Marketplaces** tab.

### Pinning to a stable release

Tagged releases (e.g. `v0.1.0`) give a stable point-in-time ref. Pin to one at install time:

```
/plugin marketplace add audiocontrol-org/deskwork#v0.1.0
```

Releases are listed at <https://github.com/audiocontrol-org/deskwork/releases>. The release procedure is documented in [`RELEASING.md`](./RELEASING.md) for contributors.

### Migrating from earlier versions

If you're upgrading from v0.8.x or earlier, see [`MIGRATING.md`](./MIGRATING.md) for the one-time first-run install behavior, the customization-layer migration path (replacing local `bundle/` monkeypatches), and other adopter-facing notes for the source-shipped re-architecture.

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
│   ├── deskwork/            # Lifecycle plugin shell (SKILL.md + bash wrapper + vendor/)
│   └── deskwork-studio/     # Studio plugin shell (single launch skill + vendor/)
├── scripts/
│   └── materialize-vendor.sh # Release-time vendor symlink → directory-copy
├── docs/                    # Feature PRDs, workplans, implementation notes
├── package.json             # npm workspaces root
├── LICENSE
└── README.md
```

Plugins are self-contained — no cross-plugin `../` imports. The plugin shells are thin (manifest + SKILL.md + bash wrapper); all logic lives in the npm packages under `packages/`, vendored into each plugin under `vendor/`.

### Development

See `docs/1.0/001-IN-PROGRESS/` for active feature work. The repo uses the feature lifecycle skills under `.claude/skills/feature-*` — run `/feature-help` for an overview.

### License

GPL-3.0-or-later. See `LICENSE`.
