---
id: TASK-9
title: >-
  audit-barrage E2BIG fix (#397) is inert for existing configs: committed
  .dw-lifecycle config + install-scope-discovery 'Example override' still use
  {{prompt}} (argv)
status: To Do
assignee: []
created_date: '2026-06-10 20:07'
labels:
  - 'type:imported-issue'
  - bug
dependencies: []
references:
  - gh-418
ordinal: 9000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Summary

The `audit-barrage` E2BIG fix (#397, v0.37.0) added a `{{prompt-stdin}}` placeholder that delivers the prompt via child stdin instead of argv, bypassing `ARG_MAX`, and made `{{prompt-stdin}}` the default in the shipped **template** (`plugins/dw-lifecycle/templates/audit-barrage-config.yaml`). But the fix only reaches a project that takes that template **fresh**. Two surfaces still hand out the broken argv `{{prompt}}` form, so the fix is **inert for existing configs and for any adopter who customizes**, and `spawn E2BIG` recurs on a large diff.

## Surfaces

1. **This repo's own committed dogfood config** — `.dw-lifecycle/scope-discovery/audit-barrage-config.yaml`:25,29 still use:
   ```yaml
   args_template: "-p {{prompt}}"     # claude
   args_template: "exec {{prompt}}"   # codex
   ```
   So deskwork's own `/dwi` `implement-hook` barrage still E2BIGs on a large diff (it only ran in this session because the diff-since-last-tip happened to fit under `ARG_MAX`). The committed config was not migrated when #397 changed the default.

2. **The installer's seeded "Example override" block** — `plugins/dw-lifecycle/src/scope-discovery/install-scope-discovery.ts:119-130` still shows `{{prompt}}`:
   ```
   # Example override (uncomment + edit to activate):
   #     args_template: "-p {{prompt}}"
   #     args_template: "exec {{prompt}}"
   #     args_template: "{{prompt}}"
   ```
   Any adopter who uncomments this to customize a model adopts the argv form and reintroduces the exact E2BIG #397 fixed — the example teaches the broken default.

## Repro

1. On a project whose `.dw-lifecycle/scope-discovery/audit-barrage-config.yaml` uses `{{prompt}}` (i.e. any pre-#397 config, including this repo's), run `/dwi` `implement-hook` (or `dw-lifecycle audit-barrage`) on a large diff (e.g. the `HEAD~10..HEAD` bootstrap range #397 itself names).
2. Observe `spawn E2BIG` — the cross-model audit silently degrades to an outage, same as before #397.

## Impact

`#397` is reported closed/fixed, but every existing adopter (and this repo's own dogfood loop) keeps losing cross-model audit coverage on large diffs until they hand-edit their config. The "fix shipped" claim is only true for net-new fresh-template installs.

## Suggested fix

- Migrate this repo's own `.dw-lifecycle/scope-discovery/audit-barrage-config.yaml` to `{{prompt-stdin}}`.
- Update the `install-scope-discovery.ts` "Example override" block to use `{{prompt-stdin}}` (match the #397 template default).
- Consider an automatic migration (a doctor rule, or an `audit-barrage` warning at fire time when a config still uses `{{prompt}}` and the prompt exceeds a byte threshold) so existing adopters don't silently stay broken — `classifyE2BIGSpawnError` already names the cure on failure, but only *after* a lost run.

## Provenance

Surfaced 2026-06-04 verifying the v0.37.0 E2BIG fix on `feature/deskwork-plugin` after a large Phase-39 session: the barrage ran clean only because the diff-since-last-tip fit under `ARG_MAX`; the committed config + installer example both still use `{{prompt}}`. Root fix: #386 / #397 (both closed). This is the migration/default follow-up.
<!-- SECTION:DESCRIPTION:END -->
