---
name: outline
description: Move a Planned entry to Outlining. For blog entries, scaffolds the blog post markdown with frontmatter and (optionally) an empty `## Outline` section so the shape can be reviewed before the body is drafted. For youtube/tool entries, no file is created — the stage flips anyway because Drafting requires Outlining.
---

## Outline — Shape before prose

Insert point between Planned and Drafting in the editorial calendar lifecycle. Real editorial teams outline first; the operator approves the shape before the agent invests in prose. Skipping this step burns iteration cycles on structural problems a 30-second outline review would have caught.

### Input

The user provides the slug of a Planned entry. Slugs may be **flat** or **hierarchical** (slash-separated kebab-case segments). Examples:

- `/deskwork:outline scsi-protocol-deep-dive`
- `/deskwork:outline --site editorialcontrol agent-as-workflow`
- `/deskwork:outline the-outbound/characters/strivers`

### Behavior

For **blog** entries, the helper scaffolds the markdown file at the site's configured blog path. The scaffolded frontmatter includes `id` (UUID — binds the file to its calendar entry refactor-proof), `title`, `description`, `date`, `datePublished`, `dateModified`, `author`, and (when configured) `layout` and `state`. The body contains an H1, the `## Outline` section (when the site has `blogOutlineSection: true` in its config), and a body placeholder.

For **youtube** and **tool** entries, no file is created — the content lives outside the repo. The stage still flips to Outlining because Drafting requires it.

### --layout: pick the on-disk shape (per-entry)

Hierarchical projects often want different file shapes for different nodes — a top-level project gets `<slug>/index.md` so it becomes a public route, while a sub-piece prefers `<slug>/README.md` (editorial-private, never picked up by `*/index.md` content patterns) or a flat `<slug>.md` (sibling files at one parent dir).

`--layout` overrides the site's default `blogFilenameTemplate` for this entry only. The scaffolded file carries `id: <uuid>` in its frontmatter, so subsequent reads find the file via the content-index scan regardless of the layout chosen.

| `--layout` value | File created | Best for |
|---|---|---|
| `index` (default) | `<slug>/index.md` | Top-level project hubs that should be public routes |
| `readme` | `<slug>/README.md` | Editorial-private nested chapters / sub-pieces |
| `flat` | `<slug>.md` | Many small chapters under one parent (no own dir) |

Examples:

```
/deskwork:outline --layout index   the-outbound
/deskwork:outline --layout readme  the-outbound/characters/strivers
/deskwork:outline --layout flat    the-outbound/characters/alice
```

When `--layout` is omitted, the site's `blogFilenameTemplate` applies (matches existing flat-blog behavior for audiocontrol-shaped projects).

For destinations that don't fit any of the three layouts (e.g. `projects/the-outbound/index.md` under writingcontrol's two-collection layout), the operator can scaffold the file by hand and then run `deskwork doctor --fix=missing-frontmatter-id` to bind it — the doctor's three-tier candidate search picks up files outside the template path.

### Steps

1. Resolve `--site` (or default).
2. Read the calendar; confirm the entry is in Planned. Surface the helper's error (with list of Planned slugs) if not.
3. Invoke the helper:

```
deskwork outline [--site <slug>] [--author "Name"] [--layout index|readme|flat] <slug>
```

4. For blog entries, Claude should now sketch the outline in the scaffolded file's `## Outline` section. Use the Edit tool to replace the placeholder comment with a structured outline (headings, sub-points). If the project has a voice skill, load it first — the outline sets the article's shape, so voice-appropriate structure saves a rewrite later.

5. Report: slug, new stage (Outlining), content type, scaffolded file path (if any). Next step: operator reviews the outline, then `/deskwork:draft <slug>` to advance.

### Author override

`--author "Name"` overrides `config.author` for this post. Useful for guest posts.

### Error handling

- **Entry not in Planned** — the helper refuses. Surface the current stage and stop.
- **Blog file already exists** — pipeline is out of sync; do NOT force-overwrite. Ask the operator what happened.
- **No author configured** — set `author` at the top level of `.deskwork/config.json`, or pass `--author`.
- **Host content schema rejects `id`** — Astro projects with strict content-collection schemas refuse the `id` field by default. The host plugin README has the one-line schema patch (`z.string().uuid().optional()` or `.passthrough()`); `deskwork doctor`'s `schema-rejected` rule prints the same patch on demand.
