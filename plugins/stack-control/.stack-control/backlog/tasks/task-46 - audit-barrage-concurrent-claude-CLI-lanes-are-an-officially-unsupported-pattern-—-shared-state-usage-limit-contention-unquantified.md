---
id: TASK-46
title: >-
  audit-barrage: concurrent claude-CLI lanes are an officially-unsupported
  pattern — shared state + usage-limit contention unquantified
status: To Do
assignee: []
created_date: '2026-06-12 05:19'
labels:
  - agent-found
  - 'type:gap'
dependencies: []
ordinal: 46000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The default fleet now runs two claude-binary lanes (opus + sonnet) concurrently, plus the orchestrating session itself. Empirical: a live 2-lane probe (run 20260612T051629248Z-claude-concurrency-probe) completed both lanes exit 0 with correct artifacts, and every prior barrage already ran its claude lane concurrent with the orchestrating claude session (7 governance rounds 2026-06-11, zero failures). Documented risks (claude-code-guide sweep, 2026-06-12): parallel CLI instances are an UNSUPPORTED pattern (GH issues 26523/19415/2382/20801 closed not-planned, incl. one segfault report); ~/.claude.json + settings have no documented locking (assume last-writer-wins); token-refresh race behavior undocumented (no failures reported); lanes share the subscription 5-hour usage bucket TODAY, and what a -p lane does when a usage limit hits mid-run is undocumented (likely fast non-zero exit -> the 014 terminal-state machinery classifies it as loud degradation, not silent corruption — contained failure mode). NOTE: 2026-06-15 credit split gives claude -p a SEPARATE Agent SDK monthly credit pool — re-evaluate contention after that date. Candidate mitigations if field evidence shows trouble: per-lane env injection in the config grammar (e.g. CLAUDE_CONFIG_DIR — undocumented for this purpose), a capability-field spawn_serial_group to serialize same-binary lanes (never branch on binary name, Principle III), or Agent SDK as an execution backend.
<!-- SECTION:DESCRIPTION:END -->
