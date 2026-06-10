---
id: TASK-3
title: >-
  doctor: file-presence resolves entry artifacts under docs/<slug>/ instead of
  the per-site contentDir (multi-site config)
status: To Do
assignee: []
created_date: '2026-06-10 18:59'
labels:
  - agent-found
  - 'type:bug'
dependencies: []
references:
  - gh-394
ordinal: 3000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Imported from https://github.com/audiocontrol-org/deskwork/issues/394

## Summary

In a **multi-site** project, `deskwork doctor` resolves an entry's expected artifact path under a project-root `docs/<slug>/` base instead of the entry's configured per-site `contentDir`. Every Ideas-stage entry whose `idea.md` correctly lives at `<site.contentDir>/<slug>/scrapbook/idea.md` is reported as a false `file-presence` failure (plus a related `calendar-sidecar` failure), so `doctor` cannot be used as a green gate in any project whose content lives under `src/sites/<site>/content/blog/` rather than `docs/<slug>/`.

## Environment

- deskwork CLI: `0.32.1` (`~/.claude/plugins/cache/deskwork/deskwork/0.32.1/bin/deskwork`)
- Multi-site `.deskwork/config.json` (3 sites), each with its own `contentDir`, e.g.:

```json
{
  "version": 1,
  "sites": {
    "stackcontrol": {
      "host": "stackcontrol.org",
      "contentDir": "src/sites/stackcontrol/content/blog",
      "calendarPath": "docs/editorial-calendar-stackcontrol.md"
    }
  },
  "defaultSite": "editorialcontrol"
}
```

## Reproduction (clean, artifact verified to exist)

1. Multi-site config as above.
2. Create an Ideas-stage entry per the `add` skill: sidecar in `.deskwork/entries/<uuid>.json` with `currentStage: "Ideas"` and `slug: "the-lifecycle-and-why-agents-need-one"`, and the scaffolded artifact at:
   `src/sites/stackcontrol/content/blog/the-lifecycle-and-why-agents-need-one/scrapbook/idea.md`
   (i.e. `<contentDir>/<slug>/scrapbook/idea.md` — exactly where the `add` skill says to put it, and where the studio serves scrapbook assets from).
3. Run `deskwork doctor`.

## Observed

```
file-presence [entry=<uuid>]: sidecar currentStage=Ideas requires artifact at
  <root>/docs/the-lifecycle-and-why-agents-need-one/scrapbook/idea.md
  but the file is missing

calendar-sidecar [entry=<uuid>]: sidecar <uuid>.json exists but calendar.md
  does not list this uuid
```

The artifact **does** exist — at `src/sites/stackcontrol/content/blog/the-lifecycle-and-why-agents-need-one/scrapbook/idea.md`. doctor checked a `docs/<slug>/` base instead of the site's `contentDir`, so it reports a false miss. This reproduces for **every** Ideas-stage entry across **all** sites in the config.

## Expected

For an entry whose site is `stackcontrol` (`contentDir: src/sites/stackcontrol/content/blog`), the `file-presence` rule should look for the stage artifact at `<contentDir>/<slug>/scrapbook/idea.md`, not at `docs/<slug>/scrapbook/idea.md`.

## Hypothesis / notes

- Entry sidecars carry **no `site` field** (confirmed across existing entries — only `uuid`, `slug`, `title`, `description`, `keywords`, `source`, `currentStage`, `iterationByStage`, timestamps). In a single-site or `docs/`-based project, a `docs/<slug>/` fallback happens to work; in a multi-site `src/sites/<site>/content/blog` layout there is apparently no path from an unbound entry back to its site's `contentDir`, so doctor falls back to a project-root `docs/<slug>/` base.
- Likely fixes (maintainer's call): (a) persist the resolved `site` on the sidecar at `add`/`ingest` time; or (b) have `doctor` search every configured site's `contentDir` for `<slug>/scrapbook/<stagefile>.md` before falling back to `docs/<slug>/`.
- **Risk:** a `doctor --fix` run in this state could relocate or recreate correctly-placed artifacts under the wrong `docs/<slug>/` base, or churn the calendar. (I did not run `--fix`.)

## Out of scope (a confound to ignore)

I first noticed this in a feature worktree that is intentionally behind `main`, so some inherited entries also reference published content not checked out at that branch point — those are legitimately-missing files, not this bug. The clean repro above uses an entry whose artifact is verified present at the configured `contentDir`.
<!-- SECTION:DESCRIPTION:END -->
