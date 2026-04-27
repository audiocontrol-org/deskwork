---
name: doctor
description: Audit and repair binding metadata across the editorial calendar, content tree, and review workflow store. Detects calendar entries with no bound file, files with orphan ids, duplicate ids, slug collisions, stale workflows, missing UUIDs, and host-content-schema rejections. Default mode is read-only audit; opt-in to repair with --fix.
---

## Doctor — keep calendar, files, and workflows in sync

`deskwork doctor` is the maintenance command. It walks every site in the project's `.deskwork/config.json`, joins the calendar against the content tree (via frontmatter `id:`), and reports anything that doesn't line up. By default it changes nothing — you read the report, decide what to fix, and run again with `--fix`.

### When to run

- After an upgrade (Phase 19 introduced the `id:` frontmatter binding; existing projects backfill via doctor).
- After bulk editing the calendar by hand.
- After moving or renaming content files in the host project (the frontmatter id moves with the file, but doctor will surface anything that drifted).
- As a pre-commit / CI check: audit-only mode exits non-zero on any finding, so it composes with `--exit-code` workflows.

### One look at the rules

| Rule | What it catches |
|---|---|
| `missing-frontmatter-id` | Calendar entry exists, no file claims that id via frontmatter. |
| `orphan-frontmatter-id` | File has `id:`, no calendar entry with that id. |
| `duplicate-id` | Two or more files share the same `id`. |
| `slug-collision` | Two calendar entries share the same slug (URL conflict). |
| `schema-rejected` | Host's content schema refuses the `id` field — surfaces patch instructions. |
| `workflow-stale` | A draft workflow points at a non-existent calendar entry. |
| `calendar-uuid-missing` | A calendar row on disk has no UUID column populated. |

### Step 1 — audit

```sh
deskwork doctor
```

Walks every site. Exits 0 on a clean tree, 1 if anything is reported. Read the output. Each finding is tagged with its rule id; `--fix=<rule-id>` is what you'll pass next if you want to repair just that rule.

```sh
# Just one site:
deskwork doctor --site main

# JSON for piping into other tools:
deskwork doctor --json | jq '.findings | group_by(.ruleId) | map({rule: .[0].ruleId, count: length})'
```

### Step 2 — repair

Repair mode is opt-in. The default is interactive: each ambiguous finding prompts you to pick. `--yes` runs non-interactively and skips ambiguous cases (those are still listed in the final report so you can address them by hand).

```sh
# Fix one rule, interactive:
deskwork doctor --fix=missing-frontmatter-id

# Fix everything fixable, non-interactive:
deskwork doctor --fix=all --yes

# Dry-run a fix in JSON to see what doctor would do:
deskwork doctor --fix=all --yes --json
```

Doctor never auto-applies destructive choices — clearing an orphan id, picking a canonical file out of a duplicate-id group, renaming a slug-colliding entry. Those always prompt (interactive) or skip (with `--yes`). Audit-only output tells you which findings will need manual attention even with `--fix=all`.

### Rule-by-rule playbook

#### `missing-frontmatter-id`

Most common after first install (the calendar has rows but the files don't yet carry `id:`). Doctor searches for candidate files in three widening passes:

1. The file at the slug-template path (e.g. `<contentDir>/<slug>/index.md`).
2. Any file whose frontmatter `title` matches the calendar entry's title.
3. Any file whose basename matches the slug.

Exactly one candidate → write `id: <entry.id>` into the file and exit. Multiple candidates → prompt. Zero candidates → report and skip (no file to bind to).

```sh
# Backfill ids for the active site:
deskwork doctor --fix=missing-frontmatter-id --site main
```

#### `orphan-frontmatter-id`

A file has an `id:` that no calendar entry claims. Three plausible intents (add a calendar row, clear the id, leave it alone) — there's no safe automatic action, so the rule prompts. With `--yes` it skips and reports.

#### `duplicate-id`

Two files claim the same id. Pick the canonical file; doctor clears the id from the others. With `--yes` doctor skips and reports — picking which file is editorial.

#### `slug-collision`

Two calendar entries share a slug. The host renderer maps URLs by slug, so this produces duplicate or hidden public pages. Doctor refuses to auto-rename — the operator decides which entry owns the URL and hand-edits the slug column in the calendar markdown.

#### `schema-rejected`

The host's Astro content collection schema rejects the `id` field. The audit doesn't actively probe for this (would require running the host's build). Other code paths surface schema rejection at write time and reference this rule's patch instructions.

The fix is a one-line content-schema patch — see the plugin README's [Content schema requirement](../../README.md#content-schema-requirement) section for the full prose, or import the helper directly:

```ts
import { printSchemaPatchInstructions } from '@deskwork/core/doctor';
console.log(printSchemaPatchInstructions());
```

Two options the helper documents:

1. Add `id: z.string().uuid().optional()` to the collection schema.
2. Add `.passthrough()` to allow unknown fields through.

Hugo / Jekyll / Eleventy / plain markdown projects: not applicable, those engines don't validate frontmatter against a schema.

#### `workflow-stale`

A draft workflow references a calendar entry that no longer exists (deleted from the calendar, or slug-renamed before workflows carried `entryId`). Repair clears the pipeline-journal entry; the history journal stays untouched (provenance preserved).

#### `calendar-uuid-missing`

The on-disk calendar has rows with no UUID column populated (typical of legacy calendars from before Phase 11). Repair re-writes the calendar — the in-memory parser auto-backfills missing UUIDs on read, so a single write/read cycle migrates the file.

### Steps for the agent

1. **Confirm intent.** Ask the operator: audit-only, or repair? Which rule(s)?
2. **Pick site scope.** Ask whether to run for one site (`--site <slug>`) or every site (default).
3. **Audit first.** Always run audit-only before repair so the operator sees what's at stake.
4. **Walk findings.** For each rule with findings, summarize what the operator will be agreeing to.
5. **Run with `--fix`** once the operator confirms. Use `--yes` only when they explicitly opted in to non-interactive mode.
6. **Re-audit.** Run `deskwork doctor` (no flags) once more; report the residual findings (ambiguous prompts that need manual review, slug collisions, schema patches required).

### Error handling

- **Unknown `--site`** — surfaces the configured site list.
- **Unknown rule id in `--fix`** — surfaces the registered rule list.
- **Schema rejection during repair** — doctor prints the patch instructions and stops. Apply the patch, then re-run.

### What this is not

- **Not a bulk renamer.** `slug-collision` reports; you decide which entry owns the URL and hand-edit the slug column.
- **Not a workflow recovery tool.** `workflow-stale` clears stale pipeline records but doesn't recreate workflows that should exist.
- **Not a content-schema generator.** `schema-rejected` prints patch instructions; you apply them by hand.
