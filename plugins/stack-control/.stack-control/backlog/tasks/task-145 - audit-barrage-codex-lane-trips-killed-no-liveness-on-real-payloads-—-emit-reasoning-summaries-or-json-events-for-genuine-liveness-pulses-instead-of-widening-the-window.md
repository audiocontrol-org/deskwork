---
id: TASK-145
title: >-
  audit-barrage: codex lane trips killed-no-liveness on real payloads — emit
  reasoning summaries (or --json events) for genuine liveness pulses instead of
  widening the window
status: To Do
assignee: []
created_date: '2026-06-16 23:29'
labels:
  - agent-found
  - 'type:bug'
dependencies: []
ordinal: 145000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Observed 2026-06-16 (025 phase-1 govern): the codex lane (model gpt-5.5, output_mode text, liveness_signal stderr) reasons SILENTLY on a real ~17KB audit payload for >60s before its first stderr pulse, so the liveness watchdog kills it (killed-no-liveness) well before its 300s timeout. Only claude emitted -> the 2-model floor failed -> govern refused to record. Stopgap applied: widened the codex liveness_window_seconds 60->300 in .stack-control/audit-barrage-config.yaml (blunt — the watchdog now only catches a genuine multi-minute hang). Better fix to validate+adopt: make codex EMIT during reasoning so it produces real liveness pulses, letting the window stay tight. Two levers confirmed available in codex exec v0.139: (a) -c model_reasoning_summary=detailed|auto in args_template (codex prints reasoning summaries to stderr during the reasoning phase; default is 'none' which is why stderr is silent); (b) --json to stream JSONL events to stdout (continuous liveness, but changes output parsing — codex.md would need a stream-json extractor like the claude lane has). Acceptance: codex emits a liveness pulse within a tight window (e.g. 60s) on a real audit payload; restore the tighter window; update BOTH the installation config and templates/audit-barrage-config.yaml default (the shipped default has the same too-tight 60s codex window). Possibly fold into TASK-26 (audit-barrage spawn watchdog).
<!-- SECTION:DESCRIPTION:END -->
