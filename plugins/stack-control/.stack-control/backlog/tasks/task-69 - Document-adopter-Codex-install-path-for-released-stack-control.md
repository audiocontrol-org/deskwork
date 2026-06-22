---
id: TASK-69
title: Document adopter Codex install path for released stack-control
status: Done
assignee: []
created_date: '2026-06-12 18:01'
updated_date: '2026-06-22 17:24'
labels:
  - agent-found
  - 'type:gap'
dependencies: []
references:
  - v0.45.0 / plugins/stack-control/README.md / .codex-plugin/plugin.json
ordinal: 69000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The latest release ships a Codex manifest and claims Codex portability, but adopter-facing docs do not explain how a fresh Codex session with no privileged local repo copy installs or loads stack-control from a tagged release. The README documents the Claude marketplace path, but for Codex it only states that Codex consumes the plugin-local manifest. Add an adopter-grade Codex install/update section that starts from a clean session and names the exact remote release surface to use.
<!-- SECTION:DESCRIPTION:END -->
