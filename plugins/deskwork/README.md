## deskwork

Editorial calendar lifecycle plugin for [Claude Code](https://claude.com/claude-code). Capture ideas, plan drafts, run a structured review loop, publish, and track distribution — all driven by skills under the `/deskwork:` namespace, against `.deskwork/config.json` in any host project.

### Install

```
/plugin marketplace add https://github.com/audiocontrol-org/deskwork
/plugin install deskwork@deskwork
```

For local development against the workspace, point Claude Code at this plugin directory:

```
claude --plugin-dir plugins/deskwork
```

Pair with the optional [`deskwork-studio`](../deskwork-studio/) plugin for a local Hono web surface (dashboard, longform review pane, shortform desk, scrapbook viewer, manual).

### Bootstrap a project

```
/deskwork:install
```

The install skill explores the project (Astro / Next / Hugo / etc), proposes a config shape, and writes `.deskwork/config.json` plus an empty `editorial-calendar-<site>.md`. Idempotent — safe to re-run.

### Skills

All skills are under the `/deskwork:` namespace. Slugs accept `/`-separated kebab-case segments — both flat (`scsi-protocol`) and hierarchical (`the-outbound/characters/strivers`).

| Skill | Purpose |
|---|---|
| `install` | Bootstrap deskwork in a host project |
| `add` | Capture a new idea (Ideas stage). `--slug` for explicit hierarchical paths |
| `plan` | Move Ideas → Planned with target keywords |
| `outline` | Move Planned → Outlining; scaffold the content file. `--layout index\|readme\|flat` for nested entries |
| `draft` | Move Outlining → Drafting |
| `publish` | Move to Published |
| `review-start` | Open a longform review workflow |
| `iterate` | Snapshot agent revision; back to in-review |
| `approve` | Finalize an approved review |
| `review-cancel` | Cancel a review workflow |
| `review-help` | List open workflows |
| `review-report` | Voice-drift report across recent terminal workflows |

### Hierarchical content

Each calendar entry's slug is its logical tree position. Three on-disk shapes for the scaffolded content file, picked per-entry at outline time:

- `--layout index` (default) → `<slug>/index.md` — typical for top-level pieces that should become public routes
- `--layout readme` → `<slug>/README.md` — editorial-private nested chapters / sub-pieces
- `--layout flat` → `<slug>.md` — many small chapters under one parent (no own dir)

Each entry's actual file path is recorded in the calendar's `FilePath` column, so subsequent reads find the right file regardless of the site's default `blogFilenameTemplate`.

Adding `the-outbound/characters/strivers` does **not** auto-create entries for `the-outbound` or `the-outbound/characters` — each entry stands alone. Promote intermediate directories to tracked entries explicitly when they should run through the lifecycle.

### Scrapbooks

Every node in a content tree can host its own scrapbook at `<contentDir>/<path>/scrapbook/`. Items at the top level are public (committed alongside the article); items inside `scrapbook/secret/` are editorially private — the studio surfaces them in a separate section, and host content-collection patterns shouldn't pick them up.

### Configuration

Lives in `.deskwork/config.json` in the host project. Written by `/deskwork:install`. Schema includes per-site `host`, `contentDir`, `calendarPath`, optional `channelsPath`, and content-shape knobs (`blogFilenameTemplate`, `blogInitialState`, `blogOutlineSection`).

### How `bin/deskwork` resolves the binary

The wrapper tries, in order:

1. **Workspace-linked binary** at `node_modules/.bin/deskwork` (tsx-runtime symlink, present after `npm install` in the monorepo). Dev path — runs source, edits show up immediately.
2. **Self-contained bundle** at `packages/cli/bundle/cli.mjs` (committed to git; produced by `npm --workspace packages/cli run build`). Plain `node bundle.mjs` — no install ceremony, ships with every clone.
3. Loud error pointing at the two recovery paths.

Fresh `claude plugin install` users hit path 2 — nothing extra to do. Local-dev installs hit path 1.

### Updates + pinning

Tracks the default branch of `audiocontrol-org/deskwork`. To pull the latest, run `/plugin marketplace update deskwork && /reload-plugins`. To pin to a stable release, install the marketplace with a tag: `/plugin marketplace add audiocontrol-org/deskwork#v0.1.0`. See the [root README](../../README.md#getting-updates) for the full update story.

### License

GPL-3.0-or-later. See the monorepo `LICENSE`.
