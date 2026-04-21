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
