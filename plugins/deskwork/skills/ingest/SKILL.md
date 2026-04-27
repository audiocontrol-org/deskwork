---
name: ingest
description: Backfill existing markdown content into the editorial calendar. Walks files / directories / globs, parses frontmatter, derives slug + state + date with provenance, and (after a dry-run) appends calendar rows + a journal record per file. Use when adopting deskwork on a project that already has published or in-progress posts.
---

## Ingest — Backfill what you already have

The lifecycle (`add → plan → outline → draft → publish`) is forward-only. Anyone adopting deskwork on a project that already has content hits this on day one: the calendar starts empty and there's no first-class way to populate it from existing posts. `ingest` is that way.

**Layout-agnostic.** Works for Astro `<slug>/index.md`, Hugo leaf bundles, Jekyll `_posts/YYYY-MM-DD-<slug>.md`, flat `<slug>.md`, hierarchical content nodes, and plain markdown notes folders without per-tree configuration. The operator picks paths; deskwork honors whatever shape is on disk.

### When to use ingest vs. add

| Situation | Use |
|---|---|
| Brand-new idea, nothing on disk yet | `/deskwork:add` |
| File already exists and reflects work in progress (drafted, published, etc.) | `/deskwork:ingest` |
| Migrating from a different editorial calendar format | Not in scope — out of scope per PRD |
| Pulling from Substack / RSS / Notion | Not in scope — `ingest` reads markdown on disk only |

**Rule of thumb:** if the markdown file already contains body text the operator wrote, ingest. If it doesn't exist yet, add.

### The dry-run-first contract

`ingest` is **dry-run by default**. Without `--apply`, it walks the discovery target, prints a complete plan to stdout, and writes nothing to disk. Always run dry-run first, read the plan, then re-run with `--apply` when the plan looks right.

```
deskwork ingest src/content/essays/
```

…produces output like:

```
Plan: 3 add, 0 skip (dry-run; pass --apply to commit)

add  whats-in-a-name                      Published   2020-10-01    slug:path state:frontmatter date:frontmatter
add  the-deskwork-experiment              Published   2026-04-20    slug:path state:frontmatter date:frontmatter
add  on-revising-in-the-open              Drafting    2026-05-15    slug:path state:frontmatter date:frontmatter
```

The trailing `slug:... state:... date:...` columns record where each derived value came from — verify them before committing. Sources:

- `frontmatter` — pulled from a YAML field
- `path` — derived from the file path
- `mtime` — file modification time fallback
- `today` — last-resort fallback (current date)
- `explicit` — passed via `--slug` / `--state` / `--date`

### Layout-agnostic discovery — examples

The operator passes paths; deskwork walks them and derives slugs from the layout. The path argument's basename does **not** prefix child slugs unless that directory has its own `index.md`/`README.md` (i.e. it's itself a content node).

#### Astro / Hugo `<slug>/index.md`

```
src/content/essays/
├── whats-in-a-name/index.md          → slug "whats-in-a-name"
├── the-deskwork-experiment/index.md  → slug "the-deskwork-experiment"
└── on-revising-in-the-open/index.md  → slug "on-revising-in-the-open"
```

```
deskwork ingest src/content/essays/
```

`essays/` has no `essays/index.md`, so it's a collection container — its name doesn't prefix slugs.

#### Hierarchical content nodes (own `index.md` at each level)

```
src/content/the-outbound/
├── index.md                              → slug "the-outbound"
├── characters/
│   ├── index.md                          → slug "the-outbound/characters"
│   ├── strivers/index.md                 → slug "the-outbound/characters/strivers"
│   └── dreamers/index.md                 → slug "the-outbound/characters/dreamers"
└── structure/index.md                    → slug "the-outbound/structure"
```

```
deskwork ingest src/content/the-outbound/
```

Each directory with its own `index.md` is itself a tracked content node, so its name prefixes child slugs.

#### Jekyll `_posts/YYYY-MM-DD-<slug>.md`

```
_posts/
├── 2024-01-15-hello-world.md             → slug "hello-world"
└── 2024-02-20-second-post.md             → slug "second-post"
```

```
deskwork ingest _posts/
```

The date prefix gets stripped; the post body remains the slug.

#### Flat `<slug>.md`

```
src/content/blog/
├── foo.md                                → slug "foo"
└── bar.md                                → slug "bar"
```

```
deskwork ingest src/content/blog/
```

#### Eleventy / plain notes / globs

```
deskwork ingest 'notes/2024/**/*.md'
deskwork ingest src/posts/ another-dir/specific-file.md
```

Multiple paths in one call are supported. Glob expansion uses the deepest static prefix as the slug-derivation root (`src/posts/​**​/*.md` rooted at `src/posts/`).

### State derivation

By default, the helper reads the `state:` frontmatter field and normalizes it onto the calendar's six lanes:

| Frontmatter value | Lane |
|---|---|
| `published`, `publish` | Published |
| `review`, `reviewing`, `in-review` | Review |
| `drafting`, `draft` | Drafting |
| `outline`, `outlining` | Outlining |
| `planned` | Planned |
| `idea`, `ideas` | Ideas |
| (anything else) | **ambiguous** — operator must pass `--state` |

Files without a `state:` field default to `Ideas`.

### Common flag combinations

```sh
# Dry-run — read the plan first.
deskwork ingest src/content/essays/

# Commit after the plan looks right.
deskwork ingest src/content/essays/ --apply

# Single file with explicit overrides (slug + state + date).
deskwork ingest --slug whats-in-a-name --state Published --date 2020-10-01 \
  src/content/essays/whats-in-a-name/index.md --apply

# State the operator's project schema spells differently:
#   their YAML uses `status:` instead of `state:`.
deskwork ingest --state-field status src/content/posts/ --apply

# Frontmatter has no state field; infer from datePublished
# (past → Published; future → Drafting).
deskwork ingest --state-from datePublished src/content/posts/ --apply

# Glob across multiple year-bucketed directories.
deskwork ingest 'src/posts/2023/**/*.md' 'src/posts/2024/**/*.md' --apply

# Multi-site project — explicit site:
deskwork ingest --site secondary src/sites/secondary/content/ --apply

# Operator manually reconciled a duplicate; force a re-add:
deskwork ingest --force src/content/essays/the-revised-one/index.md --apply
```

### Idempotency

Re-running `ingest --apply` over the same paths is safe: candidates whose slug already exists in the calendar emit a `skip` line with the reason. The journal records the first ingest only — duplicate skips don't create new journal entries.

`--force` bypasses the duplicate-slug check after the operator has manually reconciled (e.g. moved an old row to a different lane and now wants the file ingested fresh). The apply layer does **not** dedupe after `--force`; the operator owns the reconciliation.

### Steps for the agent

1. **Confirm the target.** Ask the operator which path(s) to ingest. If they say "everything", point them at the project's primary content directory (`src/content/`, `content/`, `_posts/`, etc.) — never auto-walk the entire repo (out of scope: `node_modules/`, `vendor/`, etc.).
2. **Resolve `--site`** (or default).
3. **Run a dry-run first.** Always. Read the plan with the operator before committing.
4. **Surface ambiguities.** Files with unrecognized `state:` values land in the `skip` list with `state ambiguous`. The operator either edits the frontmatter or passes `--state <lane>` per-file (which means re-running per-file — not a bulk override).
5. **Run with `--apply`** once the plan is correct.
6. **Report.** Read the calendar back and tell the operator how many rows landed in each lane, plus any remaining skips.

### Error handling

- **Path does not exist** — surface verbatim. Don't paper over with a fallback.
- **Unknown `state:` value** — file is skipped with `state ambiguous`. Per-file fix: `deskwork ingest --apply --state Published <file>`.
- **Slug collision with an existing calendar row** — file is skipped with `already has an entry`. Inspect the existing row before reaching for `--force`.
- **Malformed frontmatter** — file is skipped with `frontmatter parse failed: <reason>`. The operator fixes the YAML and re-runs.
- **Files under `<contentDir>/scrapbook/`** — skipped by default; ingest those explicitly when the operator wants them tracked.

### What this is not

- **Not a migration tool for other editorial-calendar formats.** Source is markdown files on disk + their frontmatter. Importing from Notion / Airtable / a different calendar-markdown shape is out of scope.
- **Not a publishing-platform sync.** No Substack, Ghost, RSS pulling.
- **Not auto-detection of the content tree.** The operator passes paths explicitly.
