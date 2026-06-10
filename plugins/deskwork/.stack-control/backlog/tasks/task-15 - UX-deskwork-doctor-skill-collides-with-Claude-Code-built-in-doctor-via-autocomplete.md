---
id: TASK-15
title: >-
  UX: deskwork /doctor skill collides with Claude Code built-in /doctor via
  autocomplete
status: To Do
assignee: []
created_date: '2026-06-10 19:00'
labels:
  - agent-found
  - 'type:bug'
dependencies: []
references:
  - gh-233
ordinal: 15000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Imported from https://github.com/audiocontrol-org/deskwork/issues/233

## Problem

The deskwork plugin's `doctor` skill (`plugins/deskwork/skills/doctor/SKILL.md`, surfaced as `/deskwork:doctor`) collides via autocomplete with Claude Code's built-in `/doctor` command. The CC slash-command picker autocompletes plugin-namespaced skills alongside built-ins; when the operator starts typing `/doc...` they see `/deskwork:doctor` in the suggestions, accept it, and invoke the deskwork calendar auditor instead of CC's built-in `/doctor` diagnostic.

This is not strict namespace shadowing (typing `/doctor` exactly still hits the CC built-in). It is an autocomplete-induced UX collision: any plugin skill that shares a name with a CC built-in turns the autocomplete suggestion into a foot-gun.

The principle: **plugin skill names should not duplicate CC built-in command names**, even when the plugin's namespace prefix technically disambiguates them at exact-match time. The autocomplete surface treats them as equivalent options.

## Reproduction

1. Install the deskwork plugin via the marketplace path.
2. Launch a CC session against any project.
3. Type `/doc` at the CC prompt and look at the autocomplete suggestions.
4. Observed: `/deskwork:doctor` appears as a suggestion. Accepting it (or hitting enter on a partial typed string that the picker auto-resolves) invokes the deskwork skill — not CC's `/doctor`.
5. Expected: a plugin skill should not appear as an autocomplete candidate when the operator's prefix unambiguously points at a CC built-in.

(The CC autocomplete picker's behavior is on CC's side; the deskwork-side fix is to not name a skill after a CC built-in in the first place.)

## Why this matters

- Adopter-facing UX foot-gun. Operators reach for `/doctor` (CC built-in), accept the autocomplete, get the deskwork skill instead.
- The collision is silent. There's no warning at install time that the plugin's skill name overlaps a CC built-in.
- Generalizes: any deskwork skill named after a CC built-in (e.g. `init`, `review`, `help`, `clear`) creates the same friction. The current skill list is fine on this front EXCEPT for `doctor`.

## Proposed fix

Rename the deskwork skill to something that won't collide with any CC built-in:

- `calendar-doctor` — most accurate; the skill validates the editorial calendar.
- `pipeline-doctor` — focused on the lifecycle pipeline.
- `audit` — shorter, but `/audit` is generic enough to risk a future CC built-in collision.

`calendar-doctor` is the safest choice.

Migration:
1. Rename `plugins/deskwork/skills/doctor/` → `plugins/deskwork/skills/calendar-doctor/`.
2. Update SKILL.md frontmatter `name: calendar-doctor`.
3. Update any internal references (`/deskwork:doctor` mentions in other skills, README, install skill, journal entries) to `/deskwork:calendar-doctor`.
4. The helper-side `deskwork doctor` CLI subcommand is a separate decision — the CLI is internal to skill scripts, not part of the operator's slash-command surface, so its rename is optional.

## Forward-looking guideline

When adding new deskwork skills, check the proposed skill name against CC's built-in command list. Avoid duplicates. Add this check to the project conventions if it is not already there.

## Source attribution

Surfaced during the M1–M10 studio-bridge smoke walk on 2026-05-07. The friction was: operator reached for CC's built-in `/doctor`, autocomplete suggested `/deskwork:doctor`, the deskwork skill was invoked instead. Initially mis-diagnosed as namespace shadowing; the actual mechanism is autocomplete-suggestion collision.
<!-- SECTION:DESCRIPTION:END -->
