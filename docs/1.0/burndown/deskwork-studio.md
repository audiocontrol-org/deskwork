---
slug: burndown-deskwork-studio
date: 2026-05-29
kind: burndown-marching-orders
lane: deskwork-studio
source: docs/1.0/001-IN-PROGRESS/hygiene/issue-closure-audit-2026-05-29.md
---

# Marching Orders — @deskwork/studio

Covers the web review surface: server (`packages/studio/src/server.ts`), routes (`packages/studio/src/routes/`), pages (`packages/studio/src/pages/`), client TS (`plugins/deskwork-studio/public/src/`), CSS (`plugins/deskwork-studio/public/css/`).

**Status as of 2026-05-29:** Phase 30 entry-centric pivot + Phase 34 legacy-review-surface retirement complete. Open issues cluster around (a) the mobile rebuild's residual concerns, (b) the entry-keyed surface's missing affordances (Publish, induct-to gating, version strip, margin-note authoring), (c) ergonomic gaps surfaced during the v0.16.0 dogfood, (d) endpoint asymmetries between client polling and server routes.

## Quick fixes (~1 hour each)

| # | Title | Action | Size | Deps |
|---|---|---|---|---|
| [#68](https://github.com/audiocontrol-org/deskwork/issues/68) | Dashboard polls `/api/dev/editorial-studio/state-signature` which returns 404 | Add the route (returns a signature for client polling) OR remove the polling from `editorial-studio-client.ts:285`. Pick whichever delivers the auto-refresh contract documented in the dashboard footer | ~15 LOC | none |
| [#98](https://github.com/audiocontrol-org/deskwork/issues/98) | Dashboard scaffold button 404s — POSTs to `/api/dev/editorial-calendar/draft` | Same shape as #68: add the route OR remove the button. The skill prose may already cover the scaffold flow externally; check before adding the route | ~30 LOC + test | none |
| [#71](https://github.com/audiocontrol-org/deskwork/issues/71) | Content tree fabricates `/blog/<slug>` public URL for collections without `host` | Gate the `publicUrlHint` render at `content-detail.ts:144-149` on `collection.host !== undefined` | ~5 LOC | none |
| [#233](https://github.com/audiocontrol-org/deskwork/issues/233) | `/deskwork:doctor` skill collides with CC built-in `/doctor` via autocomplete | Rename to `/deskwork:check` or `/deskwork:doctor-calendar`; update SKILL.md `name:` field + cross-references | ~5 LOC + announcement note | none |
| [#229](https://github.com/audiocontrol-org/deskwork/issues/229) | Review surface stacks chrome divider on top of host `<hr>` | Drop the chrome divider when followed by a sibling `<hr>` in the rendered content; needs a CSS sibling-selector or markdown-render hook | ~10 LOC CSS + smoke | none |
| [#177](https://github.com/audiocontrol-org/deskwork/issues/177) | Index vs dashboard content-container width mismatch | Align both pages on the same `--er-container-wide` token already used elsewhere | ~5 LOC CSS | none |

## Medium effort (1-2 days)

| # | Title | Action | Size | Deps |
|---|---|---|---|---|
| [#103](https://github.com/audiocontrol-org/deskwork/issues/103) | content-detail panel reports "no frontmatter / no body" for files that have both | Audit the panel's frontmatter parser path; likely a mismatch between the disk-read fixture and the rendered slot | ~50 LOC + 3 regression cases | none |
| [#193](https://github.com/audiocontrol-org/deskwork/issues/193) | induct-to picker only on Blocked/Cancelled, not Final + pipeline stages | Extend `lib/stage-affordances.ts` to include `'induct-to'` in the pipeline-stage `controls` array | ~10 LOC + tests | none |
| [#230](https://github.com/audiocontrol-org/deskwork/issues/230) | Review surface has no Publish action at Final stage; toolbar is stage-blind | Add stage-aware `Publish` button gated on `currentStage === 'Final'` in decision-strip.ts; route to publish skill command via clipboard-copy per THESIS Consequence 2 | ~30 LOC + tests | none, but couples to #246 if approve becomes universal |
| [#231](https://github.com/audiocontrol-org/deskwork/issues/231) | runtime-cache key for client assets doesn't include @deskwork/studio version | Include the package version in the build-client-assets cache key; bumps invalidate cleanly | ~15 LOC + smoke | none |
| [#272](https://github.com/audiocontrol-org/deskwork/issues/272) | `.runtime-cache` freshness check misses transitively-imported source changes | Walk the import graph (via esbuild metafile or `tsc --listFiles`); use the broader mtime set for the freshness comparison | ~80 LOC + smoke | none |
| [#216](https://github.com/audiocontrol-org/deskwork/issues/216) | Stale running studio process silently 404s on `/static/*` after plugin upgrade | Server-side route: surface a one-line stderr breadcrumb on 404 for `/static/*` paths under a stale cache | ~20 LOC + log assertion | none |
| [#229](https://github.com/audiocontrol-org/deskwork/issues/229) | (already listed as quick-fix above) | — | — | — |
| [#114](https://github.com/audiocontrol-org/deskwork/issues/114) | Studio uses typesetting jargon without glossary or hover tooltips | Add hover-tooltip data attrs on jargon spans (`press-check`, `galley`, `compositor`, `proof`); cross-link to the existing `/dev/editorial-help` glossary | ~40 LOC + content | none |
| [#191](https://github.com/audiocontrol-org/deskwork/issues/191) | Scrapbook mutations write to slug-template path, orphaning entry-aware scrapbook | Companion to #192 (closed). Route mutations through `scrapbookDirForEntry` instead of `scrapbookDir(slug)` | ~50 LOC + integration tests | none |
| [#202](https://github.com/audiocontrol-org/deskwork/issues/202) | `public/scrapbook-mutations.ts` at 620 LOC over the 500-line cap | Split into mutation-dispatch + per-mutation modules; mirror the core/scrapbook split (Issue #207 closed via the same shape) | ~refactor only, no behavior change | none |
| [#186](https://github.com/audiocontrol-org/deskwork/issues/186) | Add operations don't support adding more than one item at a time | Extend file-picker + drag-drop to accept multiple files; loop the existing single-file upload helper | ~80 LOC + integration tests | none |
| [#204](https://github.com/audiocontrol-org/deskwork/issues/204) | Marginalia: client UI for category edits | Server already in v0.16.0; add a category dropdown to the existing edit-comment affordance | ~40 LOC + tests | none |
| [#262](https://github.com/audiocontrol-org/deskwork/issues/262) | About deskwork modal — masthead ⋮ menu placeholder | Build the in-studio modal (version + license + thesis link); replace the `<a href="/dev/editorial-help">` placeholder | ~60 LOC + tests | none |
| [#263](https://github.com/audiocontrol-org/deskwork/issues/263) | shortform-row ⋮ on Desk needs v0.20-style popover | Per the v0.20 popover pattern; replicate the row-level affordance | ~80 LOC + smoke | none |
| [#299](https://github.com/audiocontrol-org/deskwork/issues/299) | No affordance to find where marginalia comments were addressed in the new revision | Add a "addressed-in" link on each resolved comment pointing at the diff between revisions in which the rewrite landed | ~100 LOC + tests | none |
| [#240](https://github.com/audiocontrol-org/deskwork/issues/240) | Review surface horizontally scrolls on phone | Constrain tables + code blocks via `overflow-x: auto` containers; run `scripts/probe-ios-overflow.mjs` to verify on real WebKit | ~30 LOC CSS + WebKit verification | none, but verify against WebKit |
| [#245](https://github.com/audiocontrol-org/deskwork/issues/245) | Mobile scrapbook sheet: cloned items have inert event handlers | Move (not clone) the `[data-sidebar-list]` element into the sheet OR rebind via `initScrapbookLightbox(slot)` after clone | ~30 LOC + smoke | none |

## Larger / sprint-sized

| # | Title | Action | Size | Deps |
|---|---|---|---|---|
| [#154](https://github.com/audiocontrol-org/deskwork/issues/154) | Review surface needs more design work | Run `/frontend-design` pass against the surface; operator picks direction; implement | sprint, design-driven | none |
| [#161](https://github.com/audiocontrol-org/deskwork/issues/161) | Scrapbook UI/UX umbrella ("look like the mockup") | Audit current scrapbook vs the mockup; surface remaining deltas after the v0.13.0 + Phase 34 work; sub-fixes closed in audit | sprint, design-driven | #164 (deferred-by-design) |
| [#54](https://github.com/audiocontrol-org/deskwork/issues/54) | Studio review surface: agent-reply margin notes (capsule responses paired to operator comments) | New annotation type + studio render + iterate-skill integration; design-driven | sprint | none |
| [#73](https://github.com/audiocontrol-org/deskwork/issues/73) | Review surface has no table of contents view — long documents are shape-blind | #169 closed (TOC drawer ships); verify whether #73's framing is fully covered or there's a residual gap | sprint, but possibly already done | verify against shipped TOC |
| [#84](https://github.com/audiocontrol-org/deskwork/issues/84) | `/deskwork:iterate` Step 2 read-comments has no documented agent path | See deskwork-core.md for the CLI side; the studio side is the existing API endpoint at `GET /api/dev/editorial-review/annotations` | sprint | #267 |
| [#171](https://github.com/audiocontrol-org/deskwork/issues/171) | Phase 34a — studio longform review surface structurally broken | Margin-note authoring + version strip remain unverified per audit. The legacy `pages/review.ts` retirement is verified done | sprint, partial | #173, #174 |
| [#170](https://github.com/audiocontrol-org/deskwork/issues/170) | Phase 34 umbrella | Closes when all sub-issues close; #171 is the gate | meta | #171 |
| [#179](https://github.com/audiocontrol-org/deskwork/issues/179) | Content view layout outlier | Reconcile the split-screen layout with the project's component design language; design-driven | sprint, design-driven | none |
| [#180](https://github.com/audiocontrol-org/deskwork/issues/180) | Compositor's desk + manual feel like different apps | Cross-surface design language pass; touches /dev/editorial-review-shortform + /dev/editorial-help | sprint, design-driven | none |
| [#72](https://github.com/audiocontrol-org/deskwork/issues/72) | Shortform desk shows hardcoded platform list (reddit/linkedin/youtube/instagram) | Replace with per-collection configurable platform list; couples to #60 (content type vocabulary) | sprint | #60 |
| [#217](https://github.com/audiocontrol-org/deskwork/issues/217) | Feature: auto-open studio URL in default browser on launch | New CLI flag (`--no-open` to opt out); cross-platform `open` invocation | sprint | none |
| [#82](https://github.com/audiocontrol-org/deskwork/issues/82) | Editable voice catalog | New skill + studio surface for voice-catalog CRUD | sprint | none |
| [#85](https://github.com/audiocontrol-org/deskwork/issues/85) | Need a version diff view | Studio surface comparing two revisions of the same entry; touches history-journal reader | sprint | none |
| [#87](https://github.com/audiocontrol-org/deskwork/issues/87) | Skinnable studio | Theme registry + per-collection skin override; design-driven | sprint, design-driven | none |
| [#142](https://github.com/audiocontrol-org/deskwork/issues/142) | (operator triage — see operator-triage.md) | — | — | — |

## Operator triage required

| # | Title | Why operator needs to decide |
|---|---|---|
| [#173](https://github.com/audiocontrol-org/deskwork/issues/173) | Design: entry-keyed reject semantics for the longform decision strip | Reject is disabled in current strip with a link to this issue. Operator picks the entry-centric reject contract |
| [#174](https://github.com/audiocontrol-org/deskwork/issues/174) | Design: entry-keyed edit-in-browser save semantics for longform Save button | Same shape as #173 — Save disabled; operator picks the entry-centric save contract |
| [#164](https://github.com/audiocontrol-org/deskwork/issues/164) | design(studio): expanded-secret-card visual continuity (deferred from #161 G3 Q3) | Deferred by design; operator decides whether to revive |

## Already-tracked / informational

- The audit closed #74, #99, #115, #152, #155, #156, #157, #159, #160, #163, #165, #166, #167, #168, #169, #175, #176, #178, #181, #199 in this lane — see `issue-closure-audit-2026-05-29.md`.
- The studio's per-page test suite lives at `packages/studio/test/`; every Quick Fix should land with at least one regression case.
