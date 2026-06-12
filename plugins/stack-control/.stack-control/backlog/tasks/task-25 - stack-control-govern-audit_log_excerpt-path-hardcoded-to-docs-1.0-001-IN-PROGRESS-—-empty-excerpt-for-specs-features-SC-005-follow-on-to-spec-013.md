---
id: TASK-25
title: >-
  stack-control: govern audit_log_excerpt path hardcoded to
  docs/1.0/001-IN-PROGRESS — empty excerpt for specs/ features (SC-005 follow-on
  to spec 013)
status: Done
assignee: []
created_date: '2026-06-10 22:25'
updated_date: '2026-06-11 00:28'
labels:
  - agent-found
  - 'type:bug'
dependencies: []
references:
  - 'specs/013-audit-protocol-hardening; govern.ts:207'
  - '242'
ordinal: 25000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
buildImplementVars (govern.ts:207) and buildSpecVars (govern.ts:242) construct the audit-log path directly as join(repoRoot,'docs','1.0','001-IN-PROGRESS',slug,'audit-log.md'), bypassing the layout-aware resolveFeatureRoot helper. For a specs/NNN-slug feature that path does not exist, so the existsSync()?:'' branch silently yields an empty audit_log_excerpt in the barrage prompt — a forbidden fallback (degraded governance context, no error). Surfaced by spec 013 T016/SC-005: a governance consumer (not scope-discovery) constructing the audit-log path outside the helper. Fix: route the excerpt through resolveFeatureRoot. Design fork: buildImplementVars/buildSpecVars are sync (existsSync/readFileSync) and exported+unit-tested; resolveFeatureRoot is async — fixing needs either resolving the root in async runGovern and threading the excerpt down, or a sync layout-aware resolver.
<!-- SECTION:DESCRIPTION:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verified fixed in the formally-installed v0.42.0 marketplace copy (2026-06-11): behavioral probe drove the installed govern.ts resolveAuditLogExcerpt against a specs/NNN-slug fixture — the excerpt carried the specs/ audit-log content (previously silently empty for specs/ features). Installed source confirms the excerpt routes through the layout-aware resolveFeatureRoot helper; the only remaining docs/1.0/001-IN-PROGRESS string in installed govern.ts is the explanatory doc comment. Closed per operator direction after installed-release verification.
<!-- SECTION:NOTES:END -->
