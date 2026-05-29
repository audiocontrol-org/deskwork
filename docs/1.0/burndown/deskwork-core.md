---
slug: burndown-deskwork-core
date: 2026-05-29
kind: burndown-marching-orders
lane: deskwork-core
source: docs/1.0/001-IN-PROGRESS/hygiene/issue-closure-audit-2026-05-29.md
---

# Marching Orders — @deskwork/core + @deskwork/cli

Covers the core editorial pipeline: schema, ingest, approve, doctor, calendar regeneration, iterate, publish, scrapbook helpers. The CLI (small surface) is folded in.

**Status as of 2026-05-29:** Core is functionally complete for the linear pipeline through Published. Open issues cluster around (a) the calendar/sidecar drift family, (b) ingest defaults + sanitization, (c) doctor rule coverage gaps, (d) approve/iterate semantic gaps for non-pipeline content.

## Quick fixes (~1 hour each)

| # | Title | Action | Size | Deps |
|---|---|---|---|---|
| [#256](https://github.com/audiocontrol-org/deskwork/issues/256) | CLI `--version` / `-v` / `version` subcommand all return "unknown subcommand" | Add subcommand to `@deskwork/cli`; read `package.json` version field; print on any of those argv shapes | ~10 LOC + 1 test | none |
| [#221](https://github.com/audiocontrol-org/deskwork/issues/221) | ingest slug rejects dots; sanitizer not added | In `core/src/ingest-derive.ts` `deriveSlug`: when source is `'path'`, replace `.` → `-` before kebab-case validation. Keep strict rejection for explicit `--slug`. | ~5 LOC + 3 regression cases | none |
| [#232](https://github.com/audiocontrol-org/deskwork/issues/232) | `regenerateCalendar(projectRoot)` hardcodes `.deskwork/calendar.md` | Read `config.calendarPath` from `.deskwork/config.json`; threads through the regen call sites in approve + doctor repair | ~10 LOC + 1 smoke | none |
| [#198](https://github.com/audiocontrol-org/deskwork/issues/198) | iterate rejects `--dispositions` for longform/outline | Wire `--dispositions <path>` through `iterate/iterate.ts` for longform + outline kinds (already works for shortform); remove the `// Future:` TODO at line 12 | ~20 LOC + 2 tests | none |

## Medium effort (1-2 days)

| # | Title | Action | Size | Deps |
|---|---|---|---|---|
| [#218](https://github.com/audiocontrol-org/deskwork/issues/218) | doctor missing `legacy-calendar-to-sidecars` rule that MIGRATING.md says it ships | Implement the rule under `packages/core/src/doctor/rules/`; mirror the existing migration shape | ~150 LOC + integration tests | none |
| [#219](https://github.com/audiocontrol-org/deskwork/issues/219) | doctor `missing-frontmatter-id` false-positives on Ideas-stage + non-blog entries | Add stage-exclusion gate (skip Ideas + Planned where no artifact-file is expected); extend exclusion to non-blog content kinds | ~50 LOC + 4 regression cases | none |
| [#300](https://github.com/audiocontrol-org/deskwork/issues/300) | doctor `orphan-frontmatter-id` false positive for every Final/Cancelled entry | Read-side counterpart of the same family as #219; same stage-exclusion fix shape | ~30 LOC + tests | #219 (share the gate) |
| [#65](https://github.com/audiocontrol-org/deskwork/issues/65) | doctor `--yes` skips `missing-frontmatter-id` even when path is unambiguously recoverable | Lift the auto-resolution path when exactly one candidate matches; keep skip when ambiguous | ~30 LOC + 2 regression cases | none |
| [#223](https://github.com/audiocontrol-org/deskwork/issues/223) | calendar.md regen inconsistency — ingest-side drops `Updated` column; approve-side adds it | Align both call sites on the same `renderCalendar()` helper; byte-equal regression smoke | ~20 LOC | none |
| [#267](https://github.com/audiocontrol-org/deskwork/issues/267) | No CLI command to enumerate pending annotations; iterate silently reports `addressedComments: []` | Add `deskwork pending-annotations <entry>` walking `.deskwork/review-journal/history/`; filter `kind: entry-annotation` not yet addressed | ~60 LOC + tests | none |
| [#234](https://github.com/audiocontrol-org/deskwork/issues/234) | ingest writes per-site `calendarPath`; approve writes unified `.deskwork/calendar.md` (v0.16+ divergence) | Same family as #232 — unify on the configured `calendarPath` | ~15 LOC | #232 (do them together) |
| [#226](https://github.com/audiocontrol-org/deskwork/issues/226) | iterate `--auto-dispositions=<value>` to skip the temp-dispositions-file dance | New CLI flag — when set, all unresolved comments get that disposition (`addressed` / `deferred` / `wontfix`) automatically | ~40 LOC + tests | #198 (same code path) |
| [#62](https://github.com/audiocontrol-org/deskwork/issues/62) | `/deskwork:ingest` behavior on files without frontmatter unclear; defaults wrong | Document the defaults explicitly in SKILL.md + add `--require-frontmatter` flag; align CLI errors with the documented behavior | ~30 LOC + SKILL.md edit | none |
| [#64](https://github.com/audiocontrol-org/deskwork/issues/64) | `/deskwork:ingest` derives title from slug, ignores H1/H2 + title frontmatter | Add title-derivation precedence (frontmatter > first H1 > slug-as-title); per-source result in `deriveTitle` output | ~40 LOC + 4 regression cases | none |
| [#58](https://github.com/audiocontrol-org/deskwork/issues/58) | `/deskwork:add` should redirect to `/deskwork:ingest` when file already exists | Detect existing file in `add.ts` precondition; surface a one-line stderr pointing at the ingest skill | ~15 LOC | none |
| [#59](https://github.com/audiocontrol-org/deskwork/issues/59) | No way to remove a calendar entry added by mistake (only pause exists) | Add `deskwork remove <entry>` subcommand that deletes the sidecar + regenerates calendar; refuses on entries with history | ~80 LOC + tests | none |
| [#215](https://github.com/audiocontrol-org/deskwork/issues/215) | approve leaves journal/sidecar drift + calendar not updated to Final lane | Audit the approve transition for the specific drift; align journal write order; closure of related sub-issues already shipped per the audit | ~60 LOC + integration smoke | possibly subsumed by other approve work |

## Larger / sprint-sized

| # | Title | Action | Size | Deps |
|---|---|---|---|---|
| [#84](https://github.com/audiocontrol-org/deskwork/issues/84) | `/deskwork:iterate` Step 2 "read the comments" has no documented agent path | Couples to #267 (CLI enumerator); SKILL.md update documents the path; agent-driven probe shape | sprint | #267 |
| [#57](https://github.com/audiocontrol-org/deskwork/issues/57) | Mandatory SEO keywords in `/deskwork:plan` nonsensical for internal docs | Skill-prose refactor + scoring rubric change; deeper change because the keyword extraction is woven into the plan output | sprint | none |
| [#61](https://github.com/audiocontrol-org/deskwork/issues/61) | Calendar stage decoupled from review workflow state — no auto-advance on `applied` | Auto-advance gate logic; touches approve.ts + workflow-state transitions; needs decision on which states trigger which transitions | sprint, design-driven | #246 (related semantic question) |
| [#60](https://github.com/audiocontrol-org/deskwork/issues/60) | Content type vocabulary (blog/youtube/tool) hardcoded for website use case | Pluralizes to per-collection vocabulary; couples to #56 (collections refactor) | sprint | #56 |

## Operator triage required

| # | Title | Why operator needs to decide |
|---|---|---|
| [#246](https://github.com/audiocontrol-org/deskwork/issues/246) | core/approve refuses Final → Published; spec says approve is universal | Real divergence between `approve.ts` (refuses) and `DESKWORK-STATE-MACHINE.md` + approve SKILL.md (universal). Operator picks: (a) make approve universal per Commandment II; (b) keep refusal as design-intentional and update spec/skill; (c) split the verb |
| [#266](https://github.com/audiocontrol-org/deskwork/issues/266) | Schema vocabulary: `DraftWorkflowState` still uses retired `ReviewState` union (Commandment III/VI) | Architectural; operator picks whether DraftWorkflowState is genuinely separate from entry reviewState or this is straight drift |
| [#142](https://github.com/audiocontrol-org/deskwork/issues/142) | Pipeline stages don't fit project-internal feature docs (PRDs/specs/plans) | Capture-mode: feature uses Drafting for PRDs; UX is misleading; operator picks rename / new kind / accept-as-is |
| [#56](https://github.com/audiocontrol-org/deskwork/issues/56) | Phase 24: Content collections (not websites) — v0.9.0 | Schema rename `sites` → `collections`; partial — `host`-becomes-optional shipped; full vocabulary migration not. Operator picks v1 ship-shape |
| [#222](https://github.com/audiocontrol-org/deskwork/issues/222) | Architectural: single document evolves + scrapbook accumulates approved snapshots | Phase 11 Task 1 work; T1 fix-landed per audit log; operator triages whether Option B+hybrid suffices long-term |

## Already-tracked / informational

- The audit closed #151, #163, #182, #185, #195, #197, #205, #206, #207, #214, #225, #247 in this lane.
- The CLI is intentionally a thin dispatcher; per-subcommand semantics live in `@deskwork/core`. Most "CLI bug" issues actually trace back to core.
