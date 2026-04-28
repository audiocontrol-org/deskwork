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
| 18 | Deferral catalog — finish the deferred work | Group A code items shipped in v0.6.0 ([#16](https://github.com/audiocontrol-org/deskwork/issues/16), [#24](https://github.com/audiocontrol-org/deskwork/issues/24), [#27](https://github.com/audiocontrol-org/deskwork/issues/27), [#28](https://github.com/audiocontrol-org/deskwork/issues/28), [#29](https://github.com/audiocontrol-org/deskwork/issues/29), [#31](https://github.com/audiocontrol-org/deskwork/issues/31) — all 10 cross-surface design audit unifications). [#30](https://github.com/audiocontrol-org/deskwork/issues/30) conditional. Group B (Phase 4/5/6) and Group C (MCP/npm/shortform-cross-link) remain operator decisions. |
| 19 | Separate identity (UUID) and path-encoding (frontmatter id) from slug; `deskwork doctor` validate/repair | Shipped v0.7.0 ([PR #35](https://github.com/audiocontrol-org/deskwork/pull/35)) + v0.7.1 review-handler/dashboard fixes ([PR #36](https://github.com/audiocontrol-org/deskwork/pull/36)) + v0.7.2 frontmatter round-trip + `deskwork:` namespace ([PR #39](https://github.com/audiocontrol-org/deskwork/pull/39)); [#33](https://github.com/audiocontrol-org/deskwork/issues/33) 19e operator verification still pending |
| 20 | Move outline content out of user-supplied markdown into the scrapbook (minimize intrusion principle) | Not started ([#40](https://github.com/audiocontrol-org/deskwork/issues/40)) |
| 21 | End-to-end shortform composition (LinkedIn) through the unified review surface | Shipped v0.8.0 ([PR #48](https://github.com/audiocontrol-org/deskwork/pull/48); [#47](https://github.com/audiocontrol-org/deskwork/issues/47)). Operator can now author cross-platform shortform posts through the unified review surface; `shortform-start` + `distribute` skills + CLI subcommands. |
| 22 | Install / studio / doctor polish ([#41](https://github.com/audiocontrol-org/deskwork/issues/41)–[#46](https://github.com/audiocontrol-org/deskwork/issues/46)) | Shipped v0.8.0 (bundled with Phase 21 in [PR #48](https://github.com/audiocontrol-org/deskwork/pull/48)). Six fixes: install schema docs, install pre-flight schema probe, install existing-pipeline detection, studio EADDRINUSE auto-increment, doctor exit-code + verbosity + skipReason, scrapbook hierarchical-path docs verified. |
| 22+ | dev-source boot fix | Shipped v0.8.1 ([PR #50](https://github.com/audiocontrol-org/deskwork/pull/50); [#49](https://github.com/audiocontrol-org/deskwork/issues/49)). Cross-package relative `.ts` imports broke `tsx`-from-source boot; `outline-split.ts` promoted to `@deskwork/core/outline-split`, `editorial-skills-catalogue.ts` collocated under `packages/studio/src/lib/`. |

### Key Links

- Design spec: `docs/superpowers/specs/2026-04-20-deskwork-plugin-design.md`
- Feature definition: `/tmp/feature-definition-deskwork-plugin.md`
- Pull request: https://github.com/audiocontrol-org/deskwork/pull/1
- Bird's-eye content view mockup (Phase 16d): [`mockups/birds-eye-content-view.html`](mockups/birds-eye-content-view.html) — Writer's Catalog aesthetic; three states (top-level, drilldown, drilldown with selected node).
