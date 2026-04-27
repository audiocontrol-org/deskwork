## Implementation Summary: deskwork-plugin

(To be updated as implementation progresses.)

### Decisions Made

- **Approach C** selected: extract existing skills with an adapter layer
- Plugin codename: **deskwork**
- Three separate plugins in one monorepo (deskwork first, feature-image and analytics later)
- Skills namespaced as `deskwork:<skill>` (automatic by Claude Code)
- Plugin is opinionated about its data format; adapts only to host project content paths
- Install skill uses the coding agent to explore the host project and write config
- Migration is incremental: side-by-side validation before cutting over

### Architecture Notes

- Each plugin is self-contained (no cross-plugin `../` references)
- Adapter layer in `lib/` handles path resolution, frontmatter I/O, site detection
- Config written to `.deskwork/config.json` in host project
- Calendar format: pipe-delimited markdown tables (same as current audiocontrol.org format)
- Helper scripts in `bin/` (added to PATH by Claude Code plugin system)

### Phase 16 — writingcontrol.org dogfood

Sandbox: `/Users/orion/work/writingcontrol.org` (HEAD checkout). Working
copy used for the smoke had to be staged into a temp project tree
because writingcontrol's shipped `.deskwork/config.json` points
`contentDir` at `src/content/essays/`, not `src/content/projects/`
where the `the-outbound` novel lives. The config mismatch isn't an
ingest bug — it's a writingcontrol setup gap (the project hosts both
flat essays and hierarchical projects under different roots; the
deskwork config schema is one-contentDir-per-site).

Smoke fixture: `/tmp/wc-dogfood-16b/` with a `.deskwork/config.json`
pointing at `src/content/projects/` plus a fresh empty calendar at
`docs/editorial-calendar-writingcontrol.md`. The `src/` tree was a
literal copy of writingcontrol's source.

#### Slug derivation — pass

Running `deskwork ingest src/content/projects/the-outbound/` produced
the six expected hierarchical slugs:

```
the-outbound                                 (Published — has frontmatter)
the-outbound/characters
the-outbound/characters/strivers
the-outbound/settings
the-outbound/settings/libertardistan
the-outbound/structure
```

Each tracked node is either an `index.md` (root) or a `README.md`
(everything below). The `directoryIsHierarchicalNode` rule treats
`README.md` as equivalent to `index.md`, so descendants nest correctly.
Pure organizational dirs without `index.md` / `README.md` produce no
slug — there are none in this tree.

#### Studio surfaces — pass

Booted via `node plugins/deskwork-studio/bundle/server.mjs --project-root
/tmp/wc-dogfood-16b --no-tailscale --port 47322`. Tested:

| Path | Status |
|---|---|
| `/dev/editorial-studio` | 200 |
| `/dev/scrapbook/writingcontrol/the-outbound` | 200 |
| `/dev/scrapbook/writingcontrol/the-outbound/characters` | 200 |
| `/dev/scrapbook/writingcontrol/the-outbound/characters/strivers` | 200 — breadcrumb resolves to `strivers`; lists `archetypes.md` + `preemptive-capitulation.md` |
| `/dev/scrapbook/writingcontrol/the-outbound/settings/libertardistan` | 200 |

#### Findings to follow up (not blocking Phase 16)

1. **`isUnderScrapbook` only matches the configured `<contentDir>/scrapbook/`
   prefix.** When `ingest` walks a hierarchical tree, every node has
   its own `<node>/scrapbook/` — but only the top-level one is filtered.
   On `the-outbound/`, eight scrapbook markdowns slipped into the
   ingest plan as candidates with non-prefixed slugs (the ancestor
   chain breaks at `scrapbook/`, which isn't a hierarchical node, so
   the prefix gets reset to `[]`). That produced two duplicate
   `archetypes` rows in the calendar (one from `the-outbound/scrapbook/`,
   one from `the-outbound/characters/scrapbook/`). Fix: change the
   skip predicate to match `/scrapbook/` anywhere in the path, not
   just under `<contentDir>/scrapbook/`. Out of scope for Phase 16
   — file as a follow-up issue.

2. **Review route doesn't accept hierarchical slugs.**
   `/dev/editorial-review/the-outbound/characters/strivers` returns 404
   because the route is `app.get('/dev/editorial-review/:slug', ...)`
   — Hono's `:slug` matches a single segment. The scrapbook route uses
   `:path{.+}` to capture multi-segment paths; the review route needs
   the same treatment. Out of scope for Phase 16 — file as a follow-up
   issue. Phase 16d's bird's-eye content view will produce review
   links for hierarchical entries, so the fix is a hard prerequisite
   for the linked-review experience, but reaches beyond Phase 16's
   scope (touches client-side review code that assumes single-segment
   slug encoding).

3. **writingcontrol's config doesn't represent both content roots.**
   `essays/` and `projects/` are siblings under `src/content/`, but
   the schema only lets one site declare one `contentDir`. Either
   the operator picks `src/content/` (and accepts that essays + projects
   share the same root) or runs two sites. Not a deskwork bug — a
   project-management decision that the writingcontrol operator owns.
   Documenting it here so the next dogfood pass starts from the same
   understanding.
