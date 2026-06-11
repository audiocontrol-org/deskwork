---
id: TASK-66
title: >-
  studio scrapbook mutations write to slug-template path, orphaning entry-aware
  scrapbook
status: To Do
assignee: []
created_date: '2026-06-10 19:31'
labels:
  - 'type:imported-issue'
  - bug
dependencies: []
references:
  - gh-191
ordinal: 66000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Symptom

Studio scrapbook mutation endpoints (upload, save, create, rename, delete) write to a slug-template path even when the entry does not live at `<contentDir>/<slug>/`. The result: an orphan scrapbook directory at the slug-template location that nothing else reads from, while the entry's real scrapbook (resolved by the entry-aware reader) sits unchanged elsewhere.

Originally surfaced during the issue-158 UX audit dogfood: the audit entry lives under `docs/1.0/001-IN-PROGRESS/deskwork-plugin/`, but studio writes (e.g. file uploads, saves) created a stale duplicate scrapbook at `docs/deskwork-plugin/issue-158-ux-audit/scrapbook/` — the kebab-case slug-template path. Eight stale duplicate PNGs landed there before anyone noticed.

## Root cause

`packages/studio/src/routes/scrapbook-mutations.ts` resolves every write through the slug-template helper:

- `scrapbook-mutations.ts:44` — `import { scrapbookFilePath } from '@deskwork/core/scrapbook'`
- `scrapbook-mutations.ts:161,263,271` — three call sites, all `scrapbookFilePath(projectRoot, config, site, slug, filename, opts)`

`scrapbookFilePath` is the slug-template resolver that joins `<contentDir>/<slug>/scrapbook/<filename>`. It has no awareness of the content index or the entry's actual on-disk location.

Reads, by contrast, go through `scrapbookDirForEntry` (entry-aware, content-index-driven) — see `packages/studio/src/pages/review-scrapbook-drawer.ts:65,137`. This is the asymmetry: reads resolve correctly via entry id; writes silently land at the slug-template path and orphan.

The `scrapbook-mutations.ts` envelope validates `{ site, slug, ... }` — the route shape itself bakes in the slug assumption.

## Expected behavior

Studio writes should resolve via the entry-aware resolver — same code path the reader uses — so the operator sees a single coherent scrapbook regardless of where the entry's file actually lives.

## Repro

1. Ingest a markdown file whose path does not match the kebab-case slug template (e.g. `docs/1.0/001-IN-PROGRESS/<feature>/<doc>.md`, slug `<doc>`).
2. Open the studio's review surface for that entry.
3. Upload an image, or save / create a scrapbook note via the studio.
4. The file lands at `<contentDir>/<slug>/scrapbook/<filename>` (slug-template), not at `dirname(<doc>.md)/scrapbook/<filename>` (entry-aware).
5. Subsequent reads from the review surface look in the entry-aware location and find nothing — the upload appears to have been dropped on the floor.

## Fix shape

Switch `packages/studio/src/routes/scrapbook-mutations.ts` to entry-aware addressing:

- Change the request envelope from `{ site, slug, ... }` to `{ site, entryId, ... }` (or accept both during a deprecation window — `entryId` preferred, `slug` falls back to slug-template only when no `entryId` is provided, matching what the scrapbook-file route already does post-Phase-35).
- Resolve the dir via `scrapbookDirForEntry(projectRoot, config, site, entry, index)` after looking up the entry sidecar.
- Update the studio client at `plugins/deskwork-studio/public/src/scrapbook-client.ts` to send `entryId` instead of (or alongside) `slug`.

The dual-resolver asymmetry that allowed this bug to compile is the subject of a separate feature request — collapse `scrapbookDir` into `scrapbookDirForEntry` so the slug-only entry point disappears.

## Why this matters

Silent data loss to a phantom location is the worst kind of UX failure — the operator's upload "works" (no error), the file exists on disk somewhere, but nothing reads from where it landed. The scrapbook contract — *"this is where research artifacts for an entry live"* — breaks at exactly the surface that's supposed to enforce it.

## Verification

- After fix: re-run the audit dogfood; uploads should land in the entry-aware scrapbook dir; reads should find them; no orphan dir at the slug-template path.
<!-- SECTION:DESCRIPTION:END -->
