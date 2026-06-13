---
id: TASK-90
title: >-
  BUG: dashboard scaffold button returns 404 — POSTs to in-house pipeline
  endpoint /api/dev/editorial-calendar/draft
status: To Do
assignee: []
created_date: '2026-06-10 19:31'
labels:
  - 'type:imported-issue'
dependencies: []
references:
  - gh-98
ordinal: 90000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Bug surfaced 2026-04-29 during routine scaffold from studio

Clicking the **scaffold →** button on a Planned-stage entry in the dashboard (`/dev/editorial-studio`) returns **404**, no file is scaffolded, and the calendar entry stays in Planned. Same class as #75 (Publish 404) and #68 (state-signature 404) — dashboard handler POSTs to an endpoint the Hono server doesn't implement.

## Reproduction

1. Boot studio v0.9.5 against any project with at least one Planned-stage calendar entry.
2. Visit `/dev/editorial-studio`.
3. Find a Planned entry (in this report: `midi-to-mcu-macro-bridge`, audiocontrol site, calendar UUID `721d5212-c023-41fd-afa8-3fbd75ec6fbf`).
4. Click the **scaffold →** button on the row.
5. Observe browser console:
   ```
   POST http://<host>:47321/api/dev/editorial-calendar/draft 404 (Not Found)
   ```
6. Observe filesystem: no `src/sites/<site>/content/blog/<slug>/` directory created.
7. Observe calendar markdown: entry still in Planned section, not Outlining.

## Diagnosis

The button handler POSTs to `/api/dev/editorial-calendar/draft`. That path is the **in-house pipeline's** Phase-14 Astro endpoint (lives at `src/sites/<site>/pages/api/dev/editorial-calendar/draft.ts` in the audiocontrol monorepo this report comes from), **not** a deskwork-studio Hono route.

The studio frontend appears to have leftover wiring from a host project's in-house pipeline — calling an endpoint by an in-house name that the deskwork-studio Hono server doesn't expose. Different shape from #68 (`/api/dev/editorial-studio/state-signature`) and #75 (`/api/dev/editorial-studio/publish`), where at least the namespace is studio-owned. This one is calling the wrong namespace entirely.

CLI fallback works correctly:
```
deskwork outline /<project-root> --site <site> <slug>
```
returned a clean JSON receipt with the scaffolded path and stage transition. So the underlying scaffold action is fine; the studio's button just isn't wired to it.

## Acceptance

- Clicking **scaffold →** on a Planned entry either:
  - Successfully scaffolds the markdown file, transitions the entry to Outlining, and updates the on-disk calendar (matching `deskwork outline` CLI behavior), OR
  - Returns a clear error (NOT a 404) explaining the missing prerequisite.
- A grep across studio routes for `editorial-calendar/draft` either finds a matching server route OR the button handler is rewired to whatever the studio's actual scaffold endpoint should be.
- Sibling buttons audited: see #75 (Publish 404) and #68 (state-signature 404) — likely same class of stale frontend wiring.

## Environment

- deskwork v0.9.5 + deskwork-studio v0.9.5 (marketplace install)
- Project: audiocontrol.org-editorial-calendar (Astro multi-site, two collections: `audiocontrol`, `editorialcontrol`, both with `host` configured)
- Studio listening on Tailscale + loopback; reproduced via Playwright over Tailscale magic-DNS

## Origin

Surfaced 2026-04-29 while trying to scaffold `midi-to-mcu-macro-bridge` through the studio. CLI worked; button did not.
<!-- SECTION:DESCRIPTION:END -->
