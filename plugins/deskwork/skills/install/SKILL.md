---
name: install
description: Bootstrap deskwork in a host project. Explores the project structure, confirms content locations and (optionally) site/host details with the user, then writes .deskwork/config.json and creates empty editorial calendar files. Works for any markdown content collection — websites, internal docs, books, tool monorepos. Run once when adopting the plugin in a new project.
---

## Install

Bootstrap deskwork in the current project. Your job is to learn the project's content collection layout, confirm the details with the user, and write a valid `.deskwork/config.json` plus empty calendar file(s).

Deskwork manages **collections of markdown content** (a tree of markdown files plus supporting media). A collection MAY be rendered as a website (Astro / Next / Hugo / Eleventy / Jekyll / etc.), but it doesn't have to be — internal documentation, books, manuscripts, knowledge bases, and tool repos all work. The install skill detects collections without assuming a website.

### Step 1 — Explore the project

Use Read/Glob/Grep to characterize the host project before asking anything.

**A. Identify content collections.** Look for directories of markdown organized hierarchically:
- Website-shaped: `src/pages/blog/`, `src/content/blog/`, `src/sites/*/pages/blog/`, `content/blog/`, `posts/`, `_posts/`
- Internal-doc-shaped: `docs/`, `documentation/`, `content/` (without a renderer), `notes/`
- Book/manuscript-shaped: `chapters/`, `manuscript/`, `book/`
- The defining trait: a tree of `.md` files (typically with H1 + body) that the project treats as a unit of editorial work

**B. Detect website renderer (secondary attribute).** If a collection IS rendered as a website, identify the renderer because it informs whether a host is configured and whether a schema patch is needed:
- Astro: `astro.config.*` (single or multiple)
- Next.js: `next.config.*`
- Hugo: `config.toml`, `config.yaml`, `config.yml` at the root, plus `content/` directory
- Eleventy: `.eleventy.js`, `eleventy.config.*`
- Jekyll: `_config.yml` plus `_posts/`
- Gatsby: `gatsby-config.*`
- None of the above? It's a non-website collection — that's a fully supported case.

**C. Single collection or several?** Multi-collection signals: multiple renderer configs (`astro.audiocontrol.config.mjs` + `astro.editorialcontrol.config.mjs`), a `src/sites/<name>/` tree, separate calendar markdown files per slug.

**D. Existing editorial calendar?** Look for `docs/editorial-calendar*.md`, `CONTENT-CALENDAR.md`, any markdown file with `## Ideas`, `## Published` tables.

**E. Public hostname (only when a website renderer was detected in step B).** Look for `package.json` homepage, the renderer's `site` config, `CNAME`, README mentions of `*.com`/`*.org`. **Do not invent a hostname for a non-website collection** — leave host unset.

### Step 2 — Propose a config and confirm with the user

Build a draft config in your head following this shape (the `host` field is shown but is OPTIONAL — include it only when the collection is rendered as a website):

```json
{
  "version": 1,
  "sites": {
    "<slug>": {
      "host": "<bare hostname, no https://> — OPTIONAL, only for website-rendered collections",
      "contentDir": "<path relative to project root>",
      "calendarPath": "<path relative to project root>",
      "channelsPath": "<optional — path to cross-posting channels JSON>"
    }
  },
  "defaultSite": "<slug — required when more than one collection>"
}
```

Rules:

- `version` is always `1`.
- `sites` is a map keyed by collection slug. Naming: match any existing `src/sites/<slug>/` directory or the filename convention of existing calendars; for non-website collections, pick a short descriptive slug (e.g., `internal-docs`, `manuscript`, `engineering-plans`).
- Each entry needs `contentDir` and `calendarPath`. `host` is **optional** — include it only when the collection is rendered as a website. `channelsPath` is also optional.
- With a single collection, `defaultSite` is inferred — omit it.
- All paths are relative to the project root.

**For non-website collections** (no renderer detected in Step 1B): omit `host` entirely. The schema accepts a host-less collection. Do not invent a hostname or use `localhost`.

**For website collections**: include `host` as the bare public hostname (no `https://`).

Present your draft to the user. Ask confirmation one field at a time when something is uncertain. Prefer pointing at existing files over creating new ones — if the user already has `docs/editorial-calendar-foo.md`, use that as the `calendarPath`, don't move it to `.deskwork/calendar.md`.

### Step 3 — Write the config file to a temp path

Use the Write tool to create a temporary config file (e.g. `/tmp/deskwork-install-config.json`) with the confirmed JSON. Keep the JSON clean — the helper validates it and will refuse invalid shapes with a specific error.

### Step 4 — Run the installer

Invoke the helper script (available on PATH because it lives under the plugin's `bin/`):

```
deskwork install /tmp/deskwork-install-config.json
```

Project root defaults to the current working directory. The agent is already running in the host project's directory inside Claude Code, so the one-arg form is the natural call. The first line of output (`Installing into: <abspath>`) confirms the inferred project root before any disk writes happen — if it's wrong, interrupt the run and re-invoke with an explicit project root:

```
deskwork install /Users/me/work/my-site /tmp/deskwork-install-config.json
```

The script:

1. Validates the JSON against the config schema
2. Writes it to `<project-root>/.deskwork/config.json`
3. Creates empty calendar files for any site whose `calendarPath` doesn't already exist
4. Prints a summary of what was written and what was left untouched

If the helper exits non-zero, **do not retry blindly** — read the error, correct the config, and re-run. The script is idempotent: running it again with the same config is safe.

### Step 5 — Note the host content-schema requirement (Astro renderer only)

**Skip this step entirely for non-website collections** (no renderer detected in Step 1B). Only Astro's strict zod content-collection schemas reject unknown frontmatter; markdown files in a non-rendered collection have no schema gate to satisfy.

Deskwork binds calendar entries to their content files via a UUID written under a `deskwork:` mapping in each markdown's frontmatter (i.e. `deskwork.id`). Astro content-collection schemas are strict by default and will reject any unknown frontmatter field — including the `deskwork:` namespace. After install, before the first `/deskwork:add` or `/deskwork:ingest` writes a file with frontmatter, confirm that each collection's schema permits the namespace.

Pick one of these patches and apply it to every Astro collection schema (typically `src/content/config.ts` or `src/content.config.ts`):

**Option 1 — explicit `deskwork` namespace (recommended)**

```ts
schema: z.object({
  deskwork: z.object({ id: z.string().uuid() }).passthrough().optional(),
  // ...your existing fields
})
```

**Option 2 — passthrough unknown keys at the top level**

```ts
schema: z.object({
  // ...your existing fields
}).passthrough()
```

The `doctor` skill's `schema-rejected` rule prints the same instructions if a write hits the rejection.

> **Note:** Top-level `id: z.string().uuid().optional()` is **NOT** what to add — that field belongs to the operator's keyspace. Deskwork no longer claims it (Issue #38, v0.7.2). A top-level `id` schema field is silently a no-op against deskwork's binding because the binding lives under `deskwork:`.

Hugo, Jekyll, Eleventy, and plain-markdown projects don't validate frontmatter against a schema — nothing to do for those.

### Step 6 — Report to the user

Tell the user what was configured:

- Path to the written config
- Each collection slug and its calendar path
- Whether the collection has a configured website renderer (and a `host`) or is internal-doc / non-website shape
- Whether any calendars were preserved (existing files the install did not overwrite)
- Whether the host needs a content-schema patch (only relevant for Astro-rendered collections), and where to find the patch instructions
- Suggested next step: run `/deskwork:add "<idea title>"` to start capturing content

### Safety rules

- **Never overwrite an existing calendar file.** The helper already preserves them; don't work around it.
- **Don't write `.deskwork/config.json` directly with the Write tool.** Always go through the helper so the config is validated before landing on disk.
- **If the helper fails with a schema error**, fix the config and re-run. Don't report success unless the script exited zero.
