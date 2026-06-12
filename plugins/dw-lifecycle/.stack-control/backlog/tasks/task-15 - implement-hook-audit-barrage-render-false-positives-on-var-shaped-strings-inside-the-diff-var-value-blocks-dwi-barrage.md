---
id: TASK-15
title: >-
  implement-hook audit-barrage-render false-positives on {{var}}-shaped strings
  inside the diff var value (blocks /dwi barrage)
status: To Do
assignee: []
created_date: '2026-06-10 20:07'
labels:
  - 'type:imported-issue'
  - bug
dependencies: []
references:
  - gh-396
ordinal: 15000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Summary

`dw-lifecycle implement-hook` (the /dwi end-of-task audit-barrage hook) aborts at the `audit-barrage-render` step with:

```
audit-barrage-render: declared var(s) not substituted in rendered output: feature_slug, workplan_summary, diff
(the template references these EXPECTED_VARS markers but the substitution pass left them in place — vars list and template are out of sync)
```

…even though the vars file supplies all five EXPECTED_VARS. The error is a FALSE POSITIVE.

## Root cause

`prompt-renderer.ts` substitutes each `{{var}}` then `rejectUnsubstitutedTokens` throws if any declared-var marker survives. But the `diff` var VALUE can itself contain literal `{{feature_slug}}`-shaped strings — and does whenever the diff range touches files that use the marker syntax (notably deskwork's OWN audit-barrage code: `prompt-renderer.ts`, its test, `templates/audit-barrage-prompt.md`).

Substitution order is `feature_slug`, `workplan_summary`, `diff`, … . When `{{diff}}` is replaced with diff text that contains `{{feature_slug}}` / `{{workplan_summary}}` / `{{diff}}`, those markers land in the output AFTER their own keys were already substituted, so the guard fires.

Aggravating factor: when no prior barrage marker exists, `implement-hook.ts:245` defaults the range to `HEAD~10..HEAD`. On a fresh scope-discovery opt-in that window easily spans a merge of the tooling itself, guaranteeing the marker-bearing files are in the diff.

## Reproduction

1. In a project freshly opted into scope-discovery (no `last-hook-run.json`), make any commit whose `HEAD~10..HEAD` diff touches a file containing literal `{{feature_slug}}` (e.g. the audit-barrage template/renderer).
2. Run `dw-lifecycle implement-hook --feature <slug>`.
3. Observe the render abort. The renderer works fine on a vars file with simple values — confirming it is the marker-shaped content of the `diff` var, not a template/vars drift.

## Impact

Blocks the /dwi end-of-task audit barrage entirely on any iteration whose diff window contains `{{...}}`-marker-shaped text. Because the hook never writes its marker, the `check-implement-hook-ran` commit-msg gate then refuses the next commit and `check-implement-hook-coverage` refuses the push — so a single un-runnable barrage stalls the whole loop.

## Fix options (maintainer's call)

- Scope `rejectUnsubstitutedTokens` to the TEMPLATE pre-substitution (check the template's own marker references against EXPECTED_VARS), NOT the post-injection output — the drift it wants to catch is template-vs-EXPECTED_VARS, which is knowable before values are injected.
- Or substitute via a single non-recursive pass / sentinel tokens so values containing `{{var}}` are never re-scanned.
- Separately reconsider the `HEAD~10..HEAD` default range for the no-marker case (it over-captures on fresh opt-in).

## Provenance

Surfaced 2026-06-02 dogfooding `/dwi` on the #394 doctor fix — the first `implement-hook` run on this project after scope-discovery opt-in.
<!-- SECTION:DESCRIPTION:END -->
