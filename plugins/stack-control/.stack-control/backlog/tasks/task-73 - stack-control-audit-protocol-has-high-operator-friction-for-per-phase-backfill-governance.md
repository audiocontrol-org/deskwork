---
id: TASK-73
title: >-
  stack-control audit protocol has high operator friction for per-phase backfill
  governance
status: To Do
assignee: []
created_date: '2026-06-14 02:14'
updated_date: '2026-06-14 02:14'
labels:
  - 'type:imported-issue'
  - promoted
dependencies: []
references:
  - gh-469
ordinal: 73000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Summary

Running a real per-phase audit-barrage backfill on `plugins/design-control` exposed substantial operator friction in the current `stack-control` audit protocol. We were able to get a bounded phase (`2C`) to complete on June 14, 2026 only after multiple manual workarounds across spec structure, fleet configuration, and barrage execution.

This is not one bug. It is a workflow-level ergonomics gap where the operator had to discover and repair several protocol assumptions by hand before `stackctl govern --phase` became usable.

Related narrower bugs already filed and closed:
- #467 `stackctl govern --phase only parses colon-form phase headers`
- #468 `stackctl per-phase govern scoping is unsound when tasks.md lacks authoritative file lists`

## Environment

- Repo: `audiocontrol-org/deskwork`
- Active nested installation: `plugins/design-control`
- Branch during backfill: `feature/design-control`
- Date of the observed run sequence: June 13-14, 2026
- Working fleet during the successful bounded run: `codex/gpt-5.5` + `codex/gpt-5.4`

## What happened

### 1. Per-phase govern was not immediately usable on an existing spec

Before we could even run historical per-phase governance, we had to fix two separate spec/task-shape mismatches:

- `tasks.md` used `## Phase N — ...` headers, while the phase parser only accepted `## Phase N: ...`.
- The phase task entries did not contain authoritative file scopes, so phase scoping collapsed to accidental prose matches or widened incorrectly.

Those specific defects were covered by #467 and #468, but the broader point is that `govern --phase` currently has no robust onboarding path for a spec that predates the latest phase-scoping assumptions.

### 2. Historical backfill required manual spec decomposition to make payloads sane

Once phase parsing worked, the historical backfill payloads were still too large for a practical barrage run:

- original `phase 1` prompt was about `339,954` bytes / `~84,989` tokens
- original `phase 2` prompt was about `132,242` bytes / `~33,061` tokens
- original `phase 3` prompt was about `37,445` bytes / `~9,362` tokens

To keep faith with the protocol, we had to manually decompose the spec's earlier phases into smaller audit units (`1A`, `1B`, `1C`, `2A`, `2B`, `2C`) and then rerun governance on those bounded units.

This worked operationally, but it was entirely manual. There is no first-class stack-control guidance or tooling for “this historical phase is too large to govern reasonably; split it like this and preserve audit semantics.”

### 3. The original fleet was operationally unreliable, but the protocol offered little help diagnosing it

The local barrage fleet had been reduced to `codex + sonnet` because of operator usage constraints.

Observed behavior:
- `sonnet` stalled twice with thinking-only / no-final-report behavior.
- It stalled once on a very large historical backfill (`phase 1`).
- It then stalled again on a bounded slice (`phase 2C`) where the prompt was only about `16.8 KB`.
- In both cases, `govern` ultimately failed with a fleet-floor shortfall instead of reaching policy convergence.

This meant the root cause was not just prompt size. It was lane reliability. But the operator had to infer that from repeated runs and live artifact inspection.

### 4. Swapping to a new OpenAI lane required account-specific trial and error

We then tried replacing `sonnet` with a comparable OpenAI lane available to Codex.

The first attempt used `gpt-5`, which looked reasonable from prior barrage history, but the run failed because this Codex ChatGPT-backed account does not support that model. The exact runtime error was:

> The `gpt-5` model is not supported when using Codex with a ChatGPT account.

There does not appear to be a stable `codex` CLI command for “list models available to this account/environment.” We had to fall back to a combination of:
- inspecting `~/.codex/models_cache.json`
- inspecting `~/.codex/config.toml`
- probing candidate models manually with `codex exec -m <model> 'Reply with exactly OK'`

Only after that did we land on a working temporary fleet of:
- `codex / gpt-5.5`
- `codex / gpt-5.4`

### 5. Once the fleet was corrected, the barrage worked

After swapping to `gpt-5.4`, the bounded `phase 2C` govern run completed normally:
- both lanes were monitored via stderr liveness
- both lanes produced final reports
- `govern` reached the real policy gate instead of failing at fleet-floor
- the phase was then blocked for legitimate `HIGH` findings, not infrastructure failure

This is important because it shows the protocol can work once the operator has done enough manual repair. The friction is in getting there.

## Why this matters

The current protocol puts too much burden on the operator to discover and repair workflow assumptions in three different places at once:

- spec/task authoring assumptions
- historical backfill sizing assumptions
- barrage fleet/model availability assumptions

A capable operator can work through this. But the amount of manual debugging required is high enough that it threatens the intended discipline. A less stubborn operator would reasonably conclude that per-phase barrage is too fragile to use and would fall back to ad hoc judgment.

## Requested improvements

### 1. Add fleet preflight that validates the configured barrage models before a real govern run

A command or automatic preflight should verify, per configured lane:
- the CLI binary exists
- the requested model is actually available to the current account/provider
- a trivial read-only prompt can complete
- the configured liveness signal behaves as expected

This should fail fast with a precise operator message before a real barrage run starts.

### 2. Add first-class payload sizing and split guidance for historical backfill

Before the barrage starts, stack-control should be able to report:
- rendered prompt size in bytes and approximate tokens
- the scoped file set contributing to that payload
- a warning when a phase is unusually large for per-phase governance
- guidance or helpers for splitting a historical phase into smaller audit units while preserving provenance

### 3. Make phase-scoping assumptions more self-describing and more repairable

Even after #467 and #468, the operator experience would improve if `govern --phase` could explicitly say:
- whether it found an authoritative file scope
- which lines/entries it used
- when it fell back to a weaker heuristic
- what exact task/spec edits would make the phase scope authoritative

### 4. Provide a documented backfill workflow for specs that predate current protocol expectations

There should be an explicit stack-control playbook for “retrofit per-phase barrage onto an existing feature,” including:
- phase heading normalization
- authoritative file-scope recording
- diff-base selection
- when to split a phase into subphases
- how to preserve audit-log continuity

### 5. Consider a native model-discovery surface for Codex-backed lanes

Even if this belongs partly outside stack-control, the barrage operator experience would be materially better if the OpenAI/Codex path had a stable way to ask “what models are usable here?” without resorting to local cache inspection and trial prompts.

## Concrete acceptance signal

This class of issue is improved when an operator can take an existing spec with completed historical phases and get from:
- “I want to backfill per-phase barrage governance”

to:
- “I have a bounded, valid, runnable phase govern command with a verified fleet”

without needing repo surgery, manual model probing, or repeated failed barrage runs just to discover the environment constraints.
<!-- SECTION:DESCRIPTION:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
- **Promoted-to:** tasks:specs/021-audit-protocol-friction-burndown
<!-- SECTION:NOTES:END -->
