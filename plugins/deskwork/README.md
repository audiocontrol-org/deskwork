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

### Content schema requirement

Deskwork binds calendar entries to their content files via a UUID written into each markdown file's frontmatter under a `deskwork:` namespace (`deskwork.id: <uuid>`). The namespace keeps deskwork's binding metadata out of the operator's top-level keyspace — the top-level `id:` field belongs to you, not deskwork. For Astro projects with a strict content-collection schema, the schema must permit the `deskwork` namespace. Two equivalent ways to allow it:

```ts
// option 1: explicit deskwork namespace
schema: z.object({
  deskwork: z.object({ id: z.string().uuid() }).passthrough().optional(),
  title: z.string(),
  // …
})

// option 2: top-level passthrough — allows any unknown fields, including the entire deskwork namespace
schema: z.object({
  title: z.string(),
  // …
}).passthrough()
```

Top-level `id:` is NOT what to add — that's the keyspace deskwork no longer claims (Issue #38, v0.7.2). If you previously ran `deskwork doctor` against v0.7.0 / v0.7.1 and it wrote top-level `id:` fields, the `legacy-top-level-id-migration` doctor rule migrates those to the namespaced form on the next run.

Hugo, Jekyll, Eleventy, and plain-markdown projects don't validate frontmatter against a schema — nothing to configure for those.

If a deskwork write hits a strict-schema rejection, the CLI surfaces a clear error pointing at this section. The `doctor` skill's `schema-rejected` rule prints the same patch instructions on demand (see below).

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
| `doctor` | Audit (and optionally repair) binding metadata across the calendar, content tree, and workflow store |

#### `doctor` — keep calendar, files, and workflows in sync

`deskwork doctor` walks every site in `.deskwork/config.json`, joins the calendar against the content tree (via the frontmatter `id:` binding), and reports anything that doesn't line up. It runs in audit-only mode by default (suitable for pre-commit / CI) and engages interactive repair with `--fix=<rule>` or `--fix=all`. Rules cover missing or orphaned frontmatter ids, duplicate ids, slug collisions, host-schema rejections, stale review workflows, and missing calendar UUIDs.

Examples:

```sh
deskwork doctor                                  # audit-only across every site
deskwork doctor --site main                      # audit one site
deskwork doctor --fix=missing-frontmatter-id     # interactive backfill of ids
deskwork doctor --fix=all --yes                  # non-interactive repair (skips ambiguous prompts)
```

See [`skills/doctor/SKILL.md`](skills/doctor/SKILL.md) for the full rule-by-rule playbook.

### Hierarchical content

deskwork is **not** a flat-blog tool. Slugs accept `/`-separated segments and the lifecycle skills + studio surfaces work at any depth. Long-form projects (novels, essay collections, multi-chapter guides) live alongside flat blog posts in the same calendar.

#### Hierarchical slugs

Slugs are URL-safe paths — kebab-case segments, optionally separated by `/`:

```
scsi-over-wifi-raspberry-pi-bridge          flat
the-outbound                                hierarchical root
the-outbound/characters                     intermediate node
the-outbound/characters/strivers            nested chapter
```

Each segment must match `[a-z0-9][a-z0-9-]*`. Both `add` and `ingest` accept hierarchical slugs without ceremony.

#### Per-entry on-disk shape

The content file's location is picked per-entry at outline time via `--layout`:

| Flag | Resulting path | Use when |
|---|---|---|
| `--layout index` (default) | `<slug>/index.md` | Top-level pieces that should become public routes |
| `--layout readme` | `<slug>/README.md` | Editorial-private nested chapters (often paired with content-collection patterns that exclude `README.md`) |
| `--layout flat` | `<slug>.md` | Many small siblings under one parent (no per-entry dir) |

Each scaffolded file carries a `deskwork:` mapping in its frontmatter (`deskwork.id: <uuid>`) — that's the binding deskwork uses to find the file again on subsequent reads, regardless of the site's default `blogFilenameTemplate` or any later renames in the content tree.

#### Refactor-proof binding

Calendar entries join to their content files via the UUID in frontmatter (`deskwork.id`), not via a cached path. Renaming or moving a file in the content tree (e.g. `projects/the-outbound/index.md` → `projects/the-outbound-novel/index.md`) doesn't break the binding — deskwork rediscovers the file on the next read by scanning `contentDir` for the matching frontmatter `deskwork.id`. No relocate command, no calendar edit.

If you ever do hit a stale binding (legacy entry whose file doesn't yet carry a `deskwork.id:`, file deleted out from under the calendar, or any of the other failure modes), `deskwork doctor` finds it and offers a repair.

#### Each entry stands alone

Adding `the-outbound/characters/strivers` does **not** auto-create entries for `the-outbound` or `the-outbound/characters`. Promote intermediate directories to tracked entries explicitly when they should run through the lifecycle (with `add` or `ingest`). Pure organizational directories — those without their own `index.md` / `README.md` — stay untracked and don't appear in the calendar.

#### Backfilling existing trees

`/deskwork:ingest` walks paths and derives hierarchical slugs from the on-disk layout. A directory's name prefixes child slugs only when the directory itself has an `index.md` or `README.md` (i.e. it's a tracked node). See the ingest skill for examples.

#### Studio surfaces

The studio (`deskwork-studio`) renders hierarchical content at any depth:

- `/dev/editorial-review/<id>` — review surface, canonical id-based URL. Slug-based links (`/dev/editorial-review/the-outbound/characters/strivers`) still resolve and 302-redirect to the canonical id route.
- `/dev/scrapbook/<site>/<path>` — scrapbook viewer at any path; works for tracked entries AND untracked organizational nodes
- `/dev/content/<site>/<project>` — bird's-eye tree view (Phase 16) showing the entire content shape with drillable detail panel

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
