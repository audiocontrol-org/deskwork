---
id: TASK-95
title: >-
  UX: shortform desk shows hard-coded platform list
  (reddit/linkedin/youtube/instagram)
status: To Do
assignee: []
created_date: '2026-06-10 19:31'
labels:
  - 'type:imported-issue'
  - enhancement
dependencies: []
references:
  - gh-72
ordinal: 95000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Friction surfaced during 2026-04-28 dogfood

The shortform desk at `/dev/editorial-review-shortform` shows a hard-coded list of "supported platforms":

```
※ No short-form galleys on the desk. Supported platforms: reddit, linkedin, youtube, instagram.
Start a new shortform draft from the dashboard's coverage matrix.
```

These four platforms come from audiocontrol.org's distribution targets. They have nothing to do with collections that aren't being distributed to social — and even for collections that ARE distributed, the operator's set of platforms may differ (Mastodon, Bluesky, Threads, Hacker News, Substack, IndieWeb...).

This is the same class of friction as [#60](https://github.com/audiocontrol-org/deskwork/issues/60) (content types) — a vocabulary baked in for one use case appearing globally for all collections.

## What changes

The list of platforms a collection cares about is part of the collection's config, not a global constant:

```json
// .deskwork/config.json
{
  "collections": {
    "audiocontrol": {
      "shortformPlatforms": ["reddit", "linkedin", "youtube", "instagram"]
    },
    "deskwork-internal": {
      "shortformPlatforms": []   // or omit — internal docs aren't distributed
    }
  }
}
```

Studio surfaces:

- Shortform desk renders empty with no "supported platforms" prose when the active collection has no `shortformPlatforms`. *"This collection has no shortform distribution configured."* with a link to the install / config docs if the operator wants to add one.
- Coverage matrix only shows columns for the configured platforms.
- `/deskwork:shortform-start` rejects platforms not in the collection's list with a clear error and the valid set.

## Acceptance

- A collection without `shortformPlatforms` produces a shortform desk with no platform list — just the *"no shortform distribution configured"* message.
- A collection with `shortformPlatforms: ["bluesky", "mastodon"]` shows exactly those two platforms in the desk and coverage matrix; the legacy four are not assumed.
- Existing audiocontrol-shaped configs without `shortformPlatforms` continue to work via a deprecation path that defaults to the legacy four with a one-time warning, then drops the default in a later release.

## Origin

Surfaced 2026-04-28 by visiting `/dev/editorial-review-shortform` against the `deskwork-internal` collection (no shortform distribution at all). The hard-coded *"reddit, linkedin, youtube, instagram"* prose appeared regardless. Coordinated with [#60](https://github.com/audiocontrol-org/deskwork/issues/60) (broader vocabulary-not-website-shaped issue) and [Phase 24](https://github.com/audiocontrol-org/deskwork/issues/56). Part of the Phase 23 dogfood arc.
<!-- SECTION:DESCRIPTION:END -->
