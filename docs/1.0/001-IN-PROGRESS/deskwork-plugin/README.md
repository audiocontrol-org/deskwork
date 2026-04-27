## Feature: deskwork-plugin

Extract the editorial calendar skills from audiocontrol.org into an open-source Claude Code plugin. The plugin (codename "deskwork") manages the editorial lifecycle from idea capture through publication and distribution tracking. Ships as part of a multi-plugin monorepo.

### Status

| Phase | Description | Status |
|---|---|---|
| 1 | Monorepo bootstrap and plugin skeleton | Complete |
| 2 | Adapter layer and config schema | Complete |
| 3 | Core lifecycle skills | Complete |
| 4 | Dogfood in audiocontrol.org | Deferred to Phase 12 |
| 5 | Visibility and distribution skills | Not started |
| 6 | Cut over and cleanup | Not started |
| 7 | Extract @deskwork/core npm package | Complete |
| 8 | Extract @deskwork/cli with single dispatcher | Complete |
| 9 | Build @deskwork/studio (Hono server + scaffolds) | Complete |
| 10a | Re-sync @deskwork/core from upstream editorial-calendar | Complete |
| 10b | Port studio UI assets + page renders | Complete |
| 11 | Add deskwork-studio plugin shell + marketplace entry | Complete |
| 12 | End-to-end dogfood (CLI + studio) against sandbox | Complete |
| 13 | Hierarchical content + scrapbook secret subdir | Complete |
| 14 | Versioning, release process, and build correctness | Complete (v0.1.0, v0.2.0 released) |
| 15 | `deskwork ingest` — backfill existing content into calendar | Complete ([#15](https://github.com/audiocontrol-org/deskwork/issues/15), [PR #17](https://github.com/audiocontrol-org/deskwork/pull/17)) |
| 16 | Hierarchical content gaps + scrapbook-in-review + bird's-eye content view | Complete ([#18](https://github.com/audiocontrol-org/deskwork/issues/18); design mockup at [`mockups/birds-eye-content-view.html`](mockups/birds-eye-content-view.html)) |
| 17 | Cross-page editorial nav + studio index at `/dev/` | Complete (v0.5.0; design mockup at [`mockups/editorial-nav-and-index.html`](mockups/editorial-nav-and-index.html)) |
| 18 | Deferral catalog — finish the deferred work | In progress (catalog of [#16](https://github.com/audiocontrol-org/deskwork/issues/16), [#24](https://github.com/audiocontrol-org/deskwork/issues/24), [#27](https://github.com/audiocontrol-org/deskwork/issues/27), [#28](https://github.com/audiocontrol-org/deskwork/issues/28), [#29](https://github.com/audiocontrol-org/deskwork/issues/29), [#30](https://github.com/audiocontrol-org/deskwork/issues/30), Phase 4/5/6 unchecked items, PRD-deferred MCP/npm/shortform-cross-link) |

### Key Links

- Design spec: `docs/superpowers/specs/2026-04-20-deskwork-plugin-design.md`
- Feature definition: `/tmp/feature-definition-deskwork-plugin.md`
- Pull request: https://github.com/audiocontrol-org/deskwork/pull/1
- Bird's-eye content view mockup (Phase 16d): [`mockups/birds-eye-content-view.html`](mockups/birds-eye-content-view.html) — Writer's Catalog aesthetic; three states (top-level, drilldown, drilldown with selected node).
