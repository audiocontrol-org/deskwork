---
id: TASK-288
title: >-
  Promote the no-grounding claude-lane fix to the plugin shipping default
  (templates/audit-barrage-config.yaml) so adopters + fresh installs inherit the
  fast, reliable lane
status: Done
assignee: []
created_date: '2026-06-19 02:12'
updated_date: '2026-06-20 07:47'
labels:
  - agent-found
  - 'type:bug'
dependencies: []
references:
  - >-
    plugins/stack-control/.stack-control/audit-barrage-config.yaml (validated
    reference impl)
ordinal: 288000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
PROBLEM: the SHIPPED default template templates/audit-barrage-config.yaml still runs both Anthropic lanes (claude/opus L99-101 + sonnet/claude-sonnet-4-6 L120-124) with --permission-mode plan. That permission mode lets the model READ files to ground findings, and the audit prompt instructs grounding, so the lane runs an unbounded Read/Grep tool-loop that consumes the WHOLE budget -> timeout on larger per-phase payloads (opus killed at 311s on 24KB, sonnet at 300s on 14KB; degraded fleet -> forced overrides). Every adopter and every fresh stackctl setup — installation root: /Users/orion/work/deskwork-work/stack-control/plugins/stack-control
(dry run — no files written; pass --apply to create)
  [already-present] config: /Users/orion/work/deskwork-work/stack-control/plugins/stack-control/.stack-control/config.yaml
  [already-present] roadmap: /Users/orion/work/deskwork-work/stack-control/plugins/stack-control/ROADMAP.md
  [already-present] inbox: /Users/orion/work/deskwork-work/stack-control/plugins/stack-control/DESIGN-INBOX.md
  [already-present] backlog: /Users/orion/work/deskwork-work/stack-control/plugins/stack-control/.stack-control/backlog
  [already-present] auditLog: /Users/orion/work/deskwork-work/stack-control/plugins/stack-control/.stack-control/audit-log.md
  [already-present] fleetKnowledge: /Users/orion/work/deskwork-work/stack-control/plugins/stack-control/.stack-control/fleet-knowledge.yaml
ready: yes (all required items present + well-formed) inherits this slow/timeout-prone default; the fix currently lives ONLY in this monorepo's project override (.stack-control/audit-barrage-config.yaml), so it does NOT propagate (Packaging-is-UX / 'the fix does not exist for an adopter who follows the README').

ROOT CAUSE: the wall-clock cost is the agentic grounding tool-loop, NOT token throughput (an opus->sonnet model swap did not help — both hit their cap). Confirmed empirically 2026-06-19.

FIX (validated in the project override): run the Anthropic lanes WITHOUT tool access — a single text-only pass over the payload (which already contains the diff under audit). Per Anthropic lane in the template:
 - args_template: remove '--permission-mode plan'.
 - readonly_enforcement: '--disallowedTools Bash,Read,Grep,Glob,Edit,Write,WebFetch,WebSearch,Task,NotebookRead,NotebookEdit' (comma-joined single token to survive the harness whitespace split; spawn-cli injects it into argv; no tools = readonly by construction AND no grounding loop).
 - timeout_floor_seconds: 300 -> 420 (kill-cap headroom; successful runs complete ~167-233s).
EVIDENCE: sonnet no-grounding completed in 167-233s on 14-24KB payloads (vs >300s timeout grounded), restored 2-of-2 cross-model agreement, and still surfaces real findings (caught cross-model-confirmed Phase-3 test gaps the degraded govern missed).

TRADEOFF to document in the template: no-grounding lanes cannot verify against files outside the payload, so they emit more SPECULATIVE findings (a claude lane floated a --help false positive); cross-model agreement filters these (codex grounds via --sandbox). codex stays the deep file-grounding lane.

SCOPE / CAVEATS: (1) apply ONLY the grounding-config change; do NOT touch the template's fleet COMPOSITION (the opus+codex+sonnet 3-lane set is the separate 2026-06-12 calibration-backed operator decision). (2) opus no-grounding is mechanism-sound (strictly removes the tool loop) but only SONNET is wall-clock-validated; calibrate opus or consider dropping it. (3) keep the existing whole-feature caveat (sonnet-4-6 produced 0 output on a ~186KB whole-feature payload; per-phase never sends that, FR-006a). (4) update the template header rationale (L78-94) which currently leans on --permission-mode plan for the read-only guarantee — --disallowedTools also guarantees read-only.
<!-- SECTION:DESCRIPTION:END -->
