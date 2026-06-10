---
id: TASK-36
title: 'Phase 24: Content collections (not websites) — v0.9.0'
status: To Do
assignee: []
created_date: '2026-06-10 19:01'
labels:
  - agent-found
  - 'type:gap'
dependencies: []
references:
  - gh-56
ordinal: 36000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Imported from https://github.com/audiocontrol-org/deskwork/issues/56

## Phase 24: Content collections (not websites)

**Plan (source-of-truth):** [`docs/source-shipped-deskwork-plan/index.md`](https://github.com/audiocontrol-org/deskwork/blob/main/docs/source-shipped-deskwork-plan/index.md) — applied at v2 via deskwork workflow `4180c05e-c6a3-4b3d-8fc1-2100492c3f38`.

**Workplan section:** [Phase 24 in `docs/1.0/001-IN-PROGRESS/deskwork-plugin/workplan.md`](https://github.com/audiocontrol-org/deskwork/blob/main/docs/1.0/001-IN-PROGRESS/deskwork-plugin/workplan.md).

### Deliverable

Schema rename `sites` → `collections`. Per-collection `host` becomes optional (already shipped in v0.8.2). Install skill detects content collections without assuming a website renderer. Studio surfaces stop assuming `host` is present. CLI flags `--site` → `--collection` (with deprecated alias). All operator-facing "site" prose migrates to "collection." Doctor migration rule (`legacy-sites-key-migration`) handles existing adopter configs in both shapes for one release.

### Open question (deferred to 24a)

`defaultSite` field's future. Three candidate treatments:
- **(a)** Rename to `defaultCollection` for consistency.
- **(b)** Eliminate the concept; multi-collection projects must always pass `--collection`.
- **(c)** Re-term to a less hierarchy-flavored name (`pinned`, etc.).

See plan v2 "Open question" framing for the trade-off discussion.

### Sub-phases

- [ ] **24a** — Schema migration: `sites` → `collections`
- [ ] **24b** — Install skill + CLI rewrite for collection model
- [ ] **24c** — Studio + URL parameter migration
- [ ] **24d** — Documentation pass: collection vocabulary throughout
- [ ] **24e** — Migration notes for existing adopters

### Acceptance

A non-website project (the deskwork-plugin monorepo, the operator's internal-doc collection) gets a clean `/deskwork:install` that produces a host-less collection config. Existing website-shaped projects continue working unchanged through the deprecation warning. Studio renders correctly for both shapes. All operator-facing docs use "collection" as the headline term.

### Origin

Surfaced when `/deskwork:install` was invoked against this monorepo (no Astro/Next/Hugo signals; no public hostname). The schema rejected it. Proximate fix (host-becomes-optional) shipped as v0.8.2; subsequent button-handler stale-slash-command bug surfaced via the dogfood (v0.8.4) and a stuck-iterating-workflow gap (v0.8.5). This issue tracks the deeper reframe — collection vocabulary throughout, install detecting non-website collections, studio not assuming host.

### Coordinated with

[Phase 23] Source-shipped re-architecture — both ship as v0.9.0.
<!-- SECTION:DESCRIPTION:END -->
