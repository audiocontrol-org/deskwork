---
name: customize
description: Copy a deskwork plugin default (a studio template page renderer or a doctor rule) into the project's .deskwork/<category>/<name>.ts so the operator can edit it. The plugin loads the override automatically — no fork required. Categories are templates and doctor; prompts is reserved for future use.
---

## Customize — drop-in overrides for studio templates and doctor rules

`deskwork customize` copies one of the plugin's built-in default files into the project at `<projectRoot>/.deskwork/<category>/<name>.ts`. After the copy, edit the file to change behavior. The plugin reads the override on the next request (studio templates) or the next audit/repair run (doctor rules) — no plugin fork or rebuild required.

This is the customization layer added in Phase 23f. Operators get a clean way to tweak a single template or rule without forking the plugin and shipping their own marketplace entry.

### Categories

| Category | What it overrides | Where the default lives |
|---|---|---|
| `templates` | A studio page renderer (dashboard, content tree, scrapbook, review surface, manual) | `packages/studio/src/pages/<name>.ts` |
| `doctor` | A doctor rule (audit + plan + apply) | `packages/core/src/doctor/rules/<name>.ts` |
| `prompts` | Reserved for future use — no defaults to copy yet | n/a |

In scope today: dashboard, content (top-level and project drilldown), scrapbook, review, manual (help). Not yet wired: shortform desk, scrapbook viewer's secret subpage, error pages.

### Step 1 — pick a category

Ask the operator which category they want to customize.

- `templates` — modify a studio page's rendered HTML (e.g., re-skin the dashboard, hide a section, add a banner).
- `doctor` — modify or replace a binding-validation rule (e.g., a stricter check for a project-specific frontmatter field, or a custom report).
- `prompts` — not available yet. If the operator asks for `prompts`, surface that the category is reserved and there's no default source to copy.

### Step 2 — pick a name

The `name` is the file basename WITHOUT the `.ts` extension. Common picks:

- Templates: `dashboard`, `content`, `content-project`, `scrapbook`, `review`, `help`.
- Doctor rules: `missing-frontmatter-id`, `orphan-frontmatter-id`, `duplicate-id`, `slug-collision`, `schema-rejected`, `workflow-stale`, `calendar-uuid-missing`, `legacy-top-level-id-migration`.

If the operator names something that doesn't exist as a built-in, the helper exits with an actionable error listing the available basenames. Re-prompt with one of the listed names.

### Step 3 — run the helper

Invoke `deskwork customize <category> <name>` from the project root:

```sh
deskwork customize templates dashboard
```

The helper copies the plugin-default source verbatim to `<projectRoot>/.deskwork/<category>/<name>.ts`, creating the directory tree as needed.

If the destination file already exists, the helper REFUSES to overwrite it — operator edits are protected. Move or delete the existing file before re-running.

The helper prints the exact destination path on success. Surface that path to the operator so they can open and edit it.

### Step 4 — edit the override

The override module exports a `default` function. The function signature must match the built-in renderer (templates) or rule (doctor) it replaces. Read the copied file's existing implementation as the starting template. Common edit shapes:

- Templates: change rendered HTML, swap the layout, branch on `ctx.config.sites` to surface different content per site.
- Doctor rules: tighten `audit()` predicates, change the operator-facing `label`, or add a custom `apply()` that writes a project-specific repair.

The override module's signature must match the default. If the default is `async function (ctx, getIndex): Promise<string>`, the override must also be async; if the default returns `string` synchronously, return a string.

### Step 5 — verify

- Templates: reload the relevant studio page (e.g., `/dev/editorial-studio` for `dashboard`). The override's HTML appears.
- Doctor rules: re-run `deskwork doctor` (or `--fix=all`). Project rules show up alongside built-ins; basename collisions REPLACE the built-in.

If the override has a syntax error or the wrong default-export shape, the studio (or doctor) surfaces a descriptive error rather than silently falling back. Read the error, fix the file, retry.

### Safety rules

- **Never edit the built-in source files inside the plugin.** The override path keeps your changes isolated to `<projectRoot>/.deskwork/`, so they survive plugin upgrades.
- **The helper refuses to clobber existing destination files.** This is intentional. If you want to start over, delete the file yourself first.
- **Override modules must export a `default` function.** No `default`, or a `default` that isn't a function, produces a loud error at request time.
- **Don't introduce node_modules dependencies in an override.** The runtime uses tsx to execute the override; relative imports back to the plugin's source aren't supported because the project's `node_modules` may not have `@deskwork/*` packages linked. Keep the override self-contained or copy code from the original verbatim.
