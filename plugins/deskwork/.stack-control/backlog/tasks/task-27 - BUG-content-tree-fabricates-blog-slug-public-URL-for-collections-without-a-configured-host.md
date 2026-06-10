---
id: TASK-27
title: >-
  BUG: content tree fabricates /blog/<slug> public URL for collections without a
  configured host
status: To Do
assignee: []
created_date: '2026-06-10 19:00'
labels:
  - agent-found
  - 'type:bug'
dependencies: []
references:
  - gh-71
ordinal: 27000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Imported from https://github.com/audiocontrol-org/deskwork/issues/71

## Friction surfaced during 2026-04-28 dogfood

The studio's content tree page renders a fake `/blog/<slug>` URL labelled *"public URL on the host site"* for entries in collections that have **no `host` configured**.

### Reproduction

The `deskwork-internal` collection in this repo's `.deskwork/config.json` has no `host` field — it's a non-website collection (per the v0.8.2 host-optional work and the `.claude/CLAUDE.md` *"deskwork manages collections of markdown content, not websites"* principle).

Visit `/dev/content/deskwork-internal/1.0`. The PRD node renders:

```
/1.0/001-IN-PROGRESS/deskwork-plugin/prd/index.md
/blog/deskwork-plugin/prd  (public URL on the host site)
```

The bottom line is captioned *"public URL on the host site"* — but there is no host site. There is no `/blog/...` URL anyone can visit. The studio fabricated a plausible-looking URL based on assumptions that don't apply to host-less collections.

### Why this matters

This is the same class of bug as [#52](https://github.com/audiocontrol-org/deskwork/pull/52) (v0.8.2 host-optional work). v0.8.2 made the schema accept missing `host`, but didn't audit every studio rendering surface for places that still assume `host` exists. The content tree is one such place.

### What changes

In the content-tree node renderer:

```typescript
// Pseudocode
if (collection.host) {
  renderPublicURL(`${collection.host}/blog/${entry.slug}`);
}
// else: render nothing for "public URL"; the collection has no public surface.
```

Same audit needed across all studio surfaces that render public URLs (dashboard's "open in production" affordances, scrapbook viewer if any, distribute page, etc.).

### Acceptance

- Loading `/dev/content/<host-less-collection>/<path>` produces zero references to `/blog/<slug>` URLs or "host site" prose.
- Loading the same page against a `host`-bearing collection still renders the public URL correctly.
- A grep across studio renderers for `/blog/` finds no unconditional template substitutions — every one is gated on collection.host being set.

### Origin

Surfaced 2026-04-28 by `/dev/content/deskwork-internal/1.0` showing `/blog/deskwork-plugin/prd` as the public URL for the PRD entry, despite the collection having no host. Connected to [Phase 24](https://github.com/audiocontrol-org/deskwork/issues/56) (content-collections-not-websites) — Phase 24's documentation pass should also surface remaining host-assumes-website rendering bugs as it migrates prose.
<!-- SECTION:DESCRIPTION:END -->
