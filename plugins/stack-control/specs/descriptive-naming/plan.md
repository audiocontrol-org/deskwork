# Implementation Plan: Descriptive Naming

**Branch**: `feature/stack-control` (one-long-lived-branch convention) | **Date**: 2026-06-10 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/descriptive-naming/spec.md`

## Summary

Slugs, not fake ordinals, on every human-facing surface. Four stories: new specs are slug-only (US1 — already proven by `specs/installation-isolation`; this story removes the remaining ordinal expectations from grammars and the authoring path), backlog interaction is slug-first over the adopted tool's internal counter (US2), agents speak in friendly names (US3), and recorded history stays navigable with zero ledger rewrites (US4 — grandfathered, forward-only per Clarification 2026-06-10).

## Technical Context

**Language/Version**: TypeScript (strict), Node 22, tsx — changes inside `plugins/stack-control/` (+ skill-body SKILL.md edits, which travel with the plugin)

**Primary Dependencies**: existing in-tree modules; backlog.md stays the backlog tool (Clarification: slug-first over the tool; `TASK-n` remains its internal key)

**Storage**: backlog task files gain a stable slug recorded at capture (an additive label, `slug:<value>`, via the existing labels seam — titles stay editable without breaking identity); no other storage changes

**Testing**: vitest; tmp fixtures on real fs; verb-output assertions (slug-first lines) + resolver tests (slug input, ambiguity fail-loud)

**Constraints**: exit codes frozen; no ledger rewrites (FR-004); no `any`/`as`/`@ts-ignore`; files ≤300–500 lines

**Scale/Scope**: 4 stories; ~8 source files + 3 skill bodies; suite baseline stays green

## Research (Phase 0, condensed — ground truth verified this session)

- **Spec dirs**: `resolveFeatureRoot` already matches exact slugs (`name === slug`); Spec Kit's `feature.json#feature_directory` accepts any path; the unnumbered chain is proven end-to-end by `specs/installation-isolation` (spec→plan→tasks→execute-check all passed). Remaining ordinal expectations: `backlog/promote-targets.ts` `SPEC_DIR = /^specs\/\d+-[a-z0-9-]*$/` (rejects unnumbered refs — the one hard blocker); the authoring guidance's auto-numbering default (`init-options.json` `branch_numbering`) — the program's front-door authoring (the define skill body) must pass the slug-only directory explicitly.
- **Backlog**: `backend.ts` projects task files (id, title, status, labels, refs); `create` accepts labels — the slug label rides the existing seam. Surfaces that print `TASK-n`-first today: `backlog list`/capture confirmation (`subcommands/backlog.ts`), promote records (`Promoted-to` notes + stdout), slush dispositions (`Status: migrated-to-backlog TASK-n` written into audit-logs by `slush-migrate.ts`), session-start orientation (the backlog section), import summaries.
- **Slug derivation (D1)**: deterministic kebab-case of the title (lowercased, non-alphanumeric → dashes, collapsed), truncated at a word boundary (~60 chars); recorded once at capture in the `slug:` label (stable under later title edits). Collisions: capture fails loud listing the colliding item and requiring a qualifier — never an appended counter (FR-003). Input resolution: exact slug label match → unique title-derived match → `TASK-n` alias; ambiguity lists candidates and exits 2.
- **Audit-log dispositions (D2)**: new records become `Status: migrated-to-backlog <slug> (TASK-n)` — slug-first with the alias parenthesized (recorded history keeps both navigable; FR-004 satisfied without rewrites because old lines are simply grandfathered).
- **Agent surfaces (D3)**: the session-start orientation verb and the backlog/governance skill bodies lead with slugs; counters demoted to parentheses. Discipline lives in the skill bodies per enforcement-lives-in-skills; the verb outputs make slug-first the path of least resistance.
- **Promote grammar (D4)**: `SPEC_DIR` accepts `specs/<slug>` AND the grandfathered `specs/NNN-<slug>`; same fail-loud shape errors.

## Constitution Check

*PASS.* Test-First (RED-first per story); Integration-First (no new stores; the slug rides existing labels); Faithful Tool Adoption (backlog.md untouched internally — Clarification decision); No Fallbacks (collision/ambiguity fail loud); Strict typing; Commit & push early. No Complexity Tracking entries.

## Project Structure

```text
specs/descriptive-naming/   # spec.md, plan.md (this file), checklists/, tasks.md
plugins/stack-control/src/
├── backlog/
│   ├── slug.ts                  # NEW: derive/validate/resolve (D1) — the one new module
│   ├── backend.ts               # capture stamps slug label; projection exposes slug
│   ├── promote-targets.ts       # D4 grammar
│   └── slush-migrate.ts         # D2 disposition format
├── subcommands/backlog.ts       # slug-first list/capture/promote output; slug input resolution
├── subcommands/session-start*.ts# orientation leads with slugs
plugins/stack-control/skills/{backlog,session-start,session-end}/SKILL.md  # US3 discipline (FR-008)
```

## Per-story design

- **US1**: D4 grammar change + the front-door authoring guidance (define skill body) states slug-only directories; a regression test pins that an unnumbered spec passes promote-target parsing and the full chain checks.
- **US2**: D1 module + capture stamping + slug-first output lines + slug input resolution on promote/edit/notes paths; D2 disposition format in slush-migrate.
- **US3**: skill-body edits (backlog, session-start, session-end, the governance reporting guidance) — lead with friendly names, counters parenthetical; orientation verb output reordered slug-first (the testable half of FR-008).
- **US4**: grandfather tests — numbered dirs and bare `TASK-n` input keep resolving; zero rewrites of committed ledger lines (probe: git diff over fixture ledgers after running the new surfaces).

## Complexity Tracking

No constitution violations — table intentionally empty.
