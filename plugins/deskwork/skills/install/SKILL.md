---
name: install
description: Bootstrap deskwork in a host project. Explores the project structure, asks the user about content locations and site layout, then writes a .deskwork/config.json and creates an editorial calendar file. Run this once when adopting the plugin in a new project.
---

## Install

Not yet implemented. This is a Phase 1 skeleton — the install flow is built out in Phase 2 once the adapter layer and config schema exist.

When implemented, this skill will:

1. Detect the host project layout (monorepo vs. single-site, content directory location, frontmatter conventions)
2. Ask the user about any details that can't be inferred (site name, calendar location, which paths to track)
3. Write `.deskwork/config.json` with the resolved configuration
4. Create an empty editorial calendar at the configured location
5. Report what was configured so the user can verify

Until Phase 2 lands, this skill should stop and inform the user that install is not yet implemented.
