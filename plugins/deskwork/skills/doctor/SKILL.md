---
name: doctor
description: Validate calendar; orchestrates LLM-as-judge sub-agent for invocation sanity
---

## Doctor

Validate the deskwork calendar end-to-end. Combines schema/reconciliation (helper-side `deskwork doctor`) with an LLM-as-judge sub-agent dispatch for semantic coherence.

### Input

```
/deskwork:doctor              # default: helper run + judge sub-agent
/deskwork:doctor --no-judge   # helper run only (offline / fast-path)
/deskwork:doctor --audit      # helper run + per-entry judge + global cross-entry judge
```

### Steps

1. Run the helper: `deskwork doctor --json`.
2. Parse helper output. If schema or reconciliation failures: surface them; do not run judge.
3. If `--no-judge`, stop and report.
4. Read `.deskwork/config.json` to get `judge.subagentModel` (default: "haiku").
5. For each entry with recent journal activity (events in the latest hour OR since last doctor run):
   - Read the sidecar
   - Read up to 10 most-recent journal events for the entry
   - Read the on-disk artifact at sidecar.currentStage; capture first 500 chars + last 500 chars + byteSize
   - Dispatch a sub-agent:
     ```
     Agent({
       subagent_type: "general-purpose",
       model: "<configured-model>",
       description: "Judge entry <slug> sanity",
       prompt: "<system prompt>\n\n<entry sidecar>\n<recent events>\n<artifact preview>\n\nEvaluate. Output JSON: {verdict, explanation, concerns}."
     })
     ```
6. Aggregate verdicts. Surface warns + fails to operator.
7. Report combined output: helper passes/failures + judge pass/warn/fail per entry.

### Judge system prompt (cached)

```
You are a deskwork pipeline auditor. The deskwork pipeline has these stages,
in order: Ideas → Planned → Outlining → Drafting → Final → Published. Off-pipeline:
Blocked, Cancelled. Invariants:

- Stage advancement is one-step (forward); approve graduates by exactly one.
- iterationByStage values are non-negative integers; should match the count of
  iteration journal events per stage.
- Published entries are frozen — no iteration events should appear post-Published.
- Blocked and Cancelled entries always have priorStage set.
- Pipeline-stage entries should not have priorStage set.
- An entry's latest journal stage-transition event's `to` must equal the sidecar's
  currentStage.
- An entry's latest review-state-change must match the sidecar's reviewState.

Read the entry's state and recent journal trail; report whether the sequence
is coherent.

Output JSON: {verdict: "pass" | "warn" | "fail", explanation: string, concerns: string[]}
```

### Error handling

- **Helper failed.** Surface; skip judge.
- **Sub-agent dispatch failed.** Treat as "judge unavailable"; don't fail the overall doctor run.
- **Sub-agent returned malformed JSON.** Treat as unavailable; log warning.
