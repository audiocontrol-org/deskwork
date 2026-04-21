---
name: install
description: Bootstrap deskwork in a host project. Explores the project structure, confirms content locations and site layout with the user, then writes .deskwork/config.json and creates empty editorial calendar files. Run once when adopting the plugin in a new project.
---

## Install

Bootstrap deskwork in the current project. Your job is to learn the project's content layout, confirm the details with the user, and write a valid `.deskwork/config.json` plus empty calendar file(s).

### Step 1 — Explore the project

Use Read/Glob/Grep to characterize the host project before asking anything:

- Does the project publish one site or several?
  - Single-site signals: one `astro.config.mjs`, one `next.config.*`, one `_config.yml`, one `package.json` with a single build script
  - Multi-site signals: multiple `astro.*.config.*`, site-specific build scripts, a `src/sites/<name>/` tree
- Where does blog content live? Look for:
  - `src/pages/blog/`, `src/content/blog/`, `src/sites/*/pages/blog/`, `content/blog/`, `posts/`, `_posts/`
- Is there an existing editorial calendar? Look for:
  - `docs/editorial-calendar*.md`, `CONTENT-CALENDAR.md`, any markdown file with `## Ideas`, `## Published` tables
- What are the public hostnames? Look for:
  - `package.json` homepage, `astro.config.*` site, `CNAME`, README mentions of `*.com`/`*.org`

### Step 2 — Propose a config and confirm with the user

Build a draft config in your head following this shape:

```json
{
  "version": 1,
  "sites": {
    "<slug>": {
      "host": "<bare hostname, no https://>",
      "contentDir": "<path relative to project root>",
      "calendarPath": "<path relative to project root>",
      "channelsPath": "<optional — path to cross-posting channels JSON>"
    }
  },
  "defaultSite": "<slug — required when more than one site>"
}
```

Rules:

- `version` is always `1`.
- `sites` is a map keyed by site slug (slug should match any existing `src/sites/<slug>/` directory or the filename convention of existing calendars).
- Each site needs `host`, `contentDir`, `calendarPath`. `channelsPath` is optional — only include it if the project already tracks cross-posting channels or the user asks for it.
- With a single site, `defaultSite` is inferred — omit it.
- All paths are relative to the project root.

Present your draft to the user. Ask confirmation one field at a time when something is uncertain. Prefer pointing at existing files over creating new ones — if the user already has `docs/editorial-calendar-foo.md`, use that as the `calendarPath`, don't move it to `.deskwork/calendar.md`.

### Step 3 — Write the config file to a temp path

Use the Write tool to create a temporary config file (e.g. `/tmp/deskwork-install-config.json`) with the confirmed JSON. Keep the JSON clean — the helper validates it and will refuse invalid shapes with a specific error.

### Step 4 — Run the installer

Invoke the helper script (available on PATH because it lives under the plugin's `bin/`):

```
deskwork-install.ts <project-root> /tmp/deskwork-install-config.json
```

Pass the absolute path to the project root. The script:

1. Validates the JSON against the config schema
2. Writes it to `<project-root>/.deskwork/config.json`
3. Creates empty calendar files for any site whose `calendarPath` doesn't already exist
4. Prints a summary of what was written and what was left untouched

If the helper exits non-zero, **do not retry blindly** — read the error, correct the config, and re-run. The script is idempotent: running it again with the same config is safe.

### Step 5 — Report to the user

Tell the user what was configured:

- Path to the written config
- Each site slug and its calendar path
- Whether any calendars were preserved (existing files the install did not overwrite)
- Suggested next step: run `/deskwork:add "<idea title>"` (once Phase 3 ships) to start capturing content

### Safety rules

- **Never overwrite an existing calendar file.** The helper already preserves them; don't work around it.
- **Don't write `.deskwork/config.json` directly with the Write tool.** Always go through the helper so the config is validated before landing on disk.
- **If the helper fails with a schema error**, fix the config and re-run. Don't report success unless the script exited zero.
