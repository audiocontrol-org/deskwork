---
id: TASK-4
title: 'Gap: no slug-rename equivalent for /editorial-rename-slug'
status: To Do
assignee: []
created_date: '2026-06-10 18:59'
labels:
  - agent-found
  - 'type:gap'
dependencies: []
references:
  - gh-370
ordinal: 4000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Imported from https://github.com/audiocontrol-org/deskwork/issues/370

## Gap: no slug-rename equivalent for the in-house `/editorial-rename-slug`

While mothballing audiocontrol.org's in-house editorial pipeline in favor of the deskwork plugin, one in-house skill has **no deskwork equivalent** and is being kept in-repo (renamed `platform-rename-slug`) until deskwork offers one.

### What the in-house skill does

`/editorial-rename-slug --site <site> <old-slug> <new-slug> [--dry-run]` renames a **published** post's slug cleanly across every surface that references it:

- the content markdown filename / directory
- the post's frontmatter and public URL
- a 301 redirect for legacy inbound links

It relies on stable UUID identity (each entry joins through `entry.id`), so workflows, distribution records, and journal history survive the rename **without** being rewritten — only the public surface (filename, URL, redirect) changes. The helper refuses with a descriptive non-zero exit on invalid input (unknown site, missing old slug, colliding new slug, etc.).

### The gap

deskwork's calendar binds entries by UUID (`deskwork.id`), which is the right foundation for a safe rename — but there's no deskwork skill/verb that performs the public-surface rename (filename + URL + redirect) while preserving the UUID join. A published entry's slug is effectively frozen once it lands.

### Ask

A deskwork verb — e.g. `/deskwork:rename-slug <old> <new>` — that:

1. renames the content file / directory and updates frontmatter,
2. updates the entry's calendar row (slug column) while preserving `deskwork.id`,
3. emits a redirect mapping (or documents how the host site should wire one) for legacy inbound links,
4. supports `--dry-run`, and refuses with a descriptive error on collisions / unknown entries.

### Meanwhile

audiocontrol.org keeps `platform-rename-slug` in-house until this exists. Tracking on the audiocontrol.org side: https://github.com/oletizi/audiocontrol.org/issues/126
<!-- SECTION:DESCRIPTION:END -->
