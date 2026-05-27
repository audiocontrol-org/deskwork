---
name: implement
description: "Walk workplan tasks; delegate to subagents; commit at task boundaries; auto-invokes scope-widen between tasks unless --no-scope-widen"
---

# /dw-lifecycle:implement

Drive implementation through the workplan. Selects the next unchecked task, dispatches subagents per task, reviews output, marks the task done, commits. Repeats.

## Steps

1. Confirm slug and target version.
2. Invoke `superpowers:subagent-driven-development` as the orchestration discipline. The skill walks the workplan, dispatching per-task subagents with full task context.
3. For features touching existing code, dispatch `code-explorer` (from `feature-dev`) once at start to orient the agent. Skip if feature-dev not installed.
4. For each task in the workplan:
   - If the task involves architecture decisions, dispatch `code-architect` (from `feature-dev`) to propose 2–3 approaches before coding. Skip if feature-dev not installed.
   - If the task introduces or modifies tested code, follow `superpowers:test-driven-development` (write failing test → minimal impl → pass → commit).
   - If a step is independent of others, consider `superpowers:dispatching-parallel-agents` to fan out.
   - Every sub-agent dispatched in this loop (implementer, reviewer, code-explorer, code-architect, etc.) MUST be routed through the dispatch wrapper — see "Dispatch-wrapper engagement" below.
   - When the task body is complete, mark its checkboxes and commit.
5. Auto-invoke scope-widen between tasks (default behavior) unless `--no-scope-widen` was passed:
   - Runs after the task-completion commit lands and BEFORE the next task starts.
   - When the completed task introduced NEW shapes / surfaces / primitives not enumerated in the project's existing `.dw-lifecycle/scope-discovery/scope-manifest.yaml`, invoke `dw-lifecycle scope-widen <slug> "<task brief as complaint>"` to expand the manifest. The "complaint" is the task title or workplan brief reframed as the unmet-coverage observation (e.g. `"new <NewPrimitive> surface introduced by Task N; scope-manifest needs the additional theme"`).
   - The widened scope-manifest is read by the next task's implementer brief so its dispatch sees the augmented scope context.
   - If `.dw-lifecycle/scope-discovery/` is not present in the project, the auto-invocation is silently skipped. No warning, no error — scope-discovery is opt-in per project.
6. After each task, optionally run `/dw-lifecycle:review` or `/dw-lifecycle:audit` (does NOT block; operator chooses cadence).
   - They are synonyms. Both write findings into `audit-log.md` with stable IDs and explicit status transitions.
7. Repeat from step 4 until all tasks done or operator pauses.

## Flags

| Flag | Purpose |
|---|---|
| `--no-scope-widen` | Skip the Step 5 between-tasks auto-invocation of `scope-widen`. Use when the operator has already widened the manifest explicitly, or when the feature's tasks are all purely-additive against an already-comprehensive scope-manifest. |

## When to use `--no-scope-widen`

- The operator has already widened the manifest by hand or by an explicit `/dw-lifecycle:scope-widen` invocation against the relevant tasks.
- The feature is purely additive (new files only, no new primitives) against a scope-manifest that already enumerates every existing shape the work touches.
- The implementation is short enough (one or two tasks) that running widen between every task is more noise than signal.

Default = run scope-widen between tasks. Skipping is the exception, not the rule.

## Dispatch-wrapper engagement

Every sub-agent dispatch fired by this skill — implementer, reviewer, code-explorer, code-architect, parallel fan-out workers — MUST be routed through `wrap()` from `plugins/dw-lifecycle/src/scope-discovery/dispatch-wrapper.ts` (the Phase 5 library API). The wrapper enforces three contracts on the sub-agent's return:

- **Return grammar.** Every dispatched response MUST conclude with three labelled blocks:

  ```text
  Searched: <pattern> — <N matches>
  Included: <file:line>, <file:line>, ...
  Excluded: <file:line> — <one-line non-deferral reason>
  ```

  `parseReturn()` extracts the blocks; `validateParsed()` rejects on missing blocks AND on the "skipped same-class audit" shape (Searched count > 1, Included covers exactly 1 match, Excluded empty).

- **Forbidden-deferral phrases.** Any `Excluded` reason containing a deferral substring or matching a deferral regex (per `FORBIDDEN_DEFERRAL_PHRASES` / `FORBIDDEN_DEFERRAL_REGEXES`) is rejected. Project overrides at `.dw-lifecycle/scope-discovery/forbidden-deferral-phrases.yaml` are honored.

- **Refactor-marker auto-prelude.** When the task prompt contains a refactor marker (`refactor`, `extraction`, `clones.yaml`, `canonical_side`, `tests_proof`, or any project-supplied marker from `.dw-lifecycle/scope-discovery/refactor-markers.yaml`), `wrap()` automatically appends the REFACTOR-CONTEXT PRECONDITIONS prelude to the dispatched prompt. Refactor dispatches without the Step 0 obligation are the failure mode the prelude exists to prevent; the marker set is intentionally narrow so false positives stay cheap.

The wrapper is library-only — `wrap(agentType, taskPrompt, { dispatchFn })`. The controller (this skill's orchestrating agent) supplies the `dispatchFn` callback that drives the Agent tool. On `DispatchRejected`, the controller re-prompts the sub-agent with the violation reason in the next iteration; persistent rejection escalates to the operator with the parsed-return excerpt.

Cross-reference: `plugins/dw-lifecycle/templates/scope-discovery/dispatch-wrapper-prelude.md` documents the convention and the override files in full.

If `.dw-lifecycle/scope-discovery/` is not present in the project, the dispatch-wrapper still runs — the wrapper itself is plugin code, not project config — but it falls back to the built-in `FORBIDDEN_DEFERRAL_PHRASES` / `REFACTOR_CONTEXT_MARKERS` defaults. Project overrides are the only thing the project-side install gates.

## Phase 11 — Autonomous loop (per-turn audit/judge stack)

When `.dw-lifecycle/scope-discovery/` is present in the project, this skill runs an autonomous per-turn audit/judge stack via the `runOrchestratorTurn` library at `plugins/dw-lifecycle/src/scope-discovery/orchestrator-loop/loop-turn.ts`. The function composes the Phase 11 Tasks 2-11 libraries into a deterministic cycle:

1. **Audit-log read** — `llm/audit-log-reader.ts` surfaces new audit-log entries since the durable watermark at `.dw-lifecycle/scope-discovery/orchestrator-runtime/last-audit-read.json`.
2. **Wrong-decision detection** — `recovery/detect-wrong-decisions.ts` matches audit-log findings whose body contains a disagreement token against agent-driven catalog entries; auto-reverses via `recovery/reverse-disposition.ts` when confidence supports, queues escalation otherwise.
3. **Internal LLM-judge pass** — `llm/judge.ts` runs in-band through `wrap()` (dispatch-grammar + forbidden-deferral phrases enforced); emits ranked disposition proposals with confidence scores.
4. **Mediation** — `mediation/mediation.ts` clusters recent findings into architectural summaries + (when dispositions supplied) proposes catalog edits.
5. **Controller** — `controller/controller.ts` reads the codebase-state metrics + auditor-correction-rate; adjusts cadence/intensity/escalation-threshold for the next turn; persists history to `.dw-lifecycle/scope-discovery/orchestrator-runtime/controller-state.json`.
6. **Codebase-state metrics** — `discovery-agents/codebase-state-metrics.ts` produces the seven Phase 11 Task 4 metrics; the loop projects them to the controller's `MetricsSnapshot` shape.
7. **External auditor fire** — `llm/auditor.ts` emits an audit-request artifact under `.dw-lifecycle/scope-discovery/pending-audits/` (fire-and-forget; results materialize next turn via the audit-log reader).
8. **Escalation visibility** — `escalation/escalation-visibility.ts` surfaces queued escalations + their quick-links.

The function returns a structured `TurnReport`:

- `auditRead` (new entry count + prior/new watermarks)
- `wrongDecisions` + `reversalProposals`
- `judgeResult` (proposals + narrative) when judgeInput supplied
- `mediationClusters` + `mediationSummaries`
- `controllerDecision` (frequency/intensity/escalationThreshold + audit_trail)
- `auditorArtifactPath` when auditorInput supplied
- `escalationVisibility` (count + rows)
- `nextLoopState` (caller persists via `persistLoopState` after committing the in-process actions)
- `summary` — single-sentence digest the orchestrator includes in the per-task report

Run one orchestrator turn **before each task** (assess what changed since the prior turn) and **after each task** (assess what the just-completed task introduced). Surface the `summary` field in the per-task report; surface `escalationVisibility` whenever its count is non-zero.

When `.dw-lifecycle/scope-discovery/` is absent, the Phase 11 loop is silently skipped (the project hasn't opted into scope-discovery).

Resumability: `loopState` persists across `/dw-lifecycle:implement` invocations. The orchestrator-agent reads via `loadLoopState`, runs the turn, and persists `report.nextLoopState` via `persistLoopState`. The audit-log watermark + controller history advance with each turn; pending-escalations + audit-requests survive in their own durable artifacts.

Configuration: defaults at `DEFAULT_LOOP_CONFIG` in `orchestrator-loop/loop-config.ts`. Operator overrides at `.dw-lifecycle/scope-discovery/loop-config.yaml` (turn_history_retention + auto_apply_confidence_floor). The judge model, auditor model, and orchestrator-runtime dir come from `llm-judge.yaml`; the controller's cadence/intensity tunables come from `controller-config.yaml`.

## Error handling

- **feature-dev not installed.** Print one-line warning at start; agent dispatch steps that depend on it are skipped. Skill continues with single-agent fallback. Dispatch-wrapper engagement still applies to the remaining dispatches.
- **Bug surfaces during a task.** Invoke `superpowers:systematic-debugging` before continuing the task. Don't push through with a known bug.
- **Test failures during TDD.** Per the TDD discipline: failing test is expected before implementation. Failing tests AFTER implementation means the impl is wrong; iterate, don't bypass the test.
- **Auto-invocation behavior (scope-widen).** When `.dw-lifecycle/scope-discovery/` is absent, the Step 5 auto-invocation is silently skipped. When present, `scope-widen` runs with default flags (dry-run is its default; `--apply` is passed when this skill invokes it because the merged manifest must be readable by the next task's implementer brief). The widen run's resulting `scope-manifest.yaml` path AND the additive-delta summary are passed into the next task's dispatched-agent context so the implementer sees the augmented scope before starting.
- **`scope-widen` fails.** Surface the error in the next task's brief; the task still proceeds. The operator can re-run scope-widen manually (`/dw-lifecycle:scope-widen <slug> "<complaint>"`) after addressing the cause.
- **`DispatchRejected` from `wrap()`.** Re-prompt the sub-agent with the violation reason (missing block / forbidden phrase / skipped-audit signal). After two consecutive rejections on the same dispatch, surface the parsed-return excerpt to the operator and pause the task.
- **Phase 11 loop — judge dispatch fails.** `runOrchestratorTurn` propagates `DispatchRejected` from the judge's `wrap()` call. Surface the violation to the operator; the next turn re-runs the judge with the same input (recovery is operator-decided per the wrong-decision-recovery primitives at `recovery/`).
- **Phase 11 loop — wrong-decision detected but reversal proposal needs operator review.** The reversal proposal lands in `TurnReport.reversalProposals`. Auto-apply when `controllerDecision.intensity` AND the recovery library's trust-calibration both support it; otherwise enqueue an escalation via `escalation/escalation-queue.ts#enqueueEscalation`. Escalations surface in the next turn's `escalationVisibility`.
