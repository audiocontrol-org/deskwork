---
name: implement
description: "Walk workplan tasks; delegate to subagents; commit at task boundaries; auto-invokes scope-widen between tasks unless --no-scope-widen"
---

# /dw-lifecycle:implement

Drive implementation through the workplan. Selects the next unchecked task, dispatches subagents per task, reviews output, marks the task done, commits. Repeats.

## Steps

1. Confirm slug and target version.
2. **Open-findings gate.** Before picking up the next task, run:

   ```bash
   dw-lifecycle check-open-findings --feature <slug>
   ```

   On `exit 0` (zero `Status: open` audit-log findings), proceed. On `exit 1` (one or more open findings), the verb emits a refusal message naming every open finding ID and pointing at `/dw-lifecycle:promote-findings` as the cure — STOP the skill and surface the refusal to the operator. On `exit 2` (feature root not found or argv error), surface the message and pause for operator action.

   Per Phase 13's anti-deferral discipline, open findings block task pickup with no override flag in v1. The cure is to either run `/dw-lifecycle:promote-findings --feature <slug>` to scope each open finding into the workplan as a TDD-first fix task, OR (if the finding's fix has already landed) flip its audit-log status to `fixed-<sha>` and re-run the gate. Project rule cited verbatim: "broken implementation is not done — it's broken."
3. Invoke `superpowers:subagent-driven-development` as the orchestration discipline. The skill walks the workplan, dispatching per-task subagents with full task context.
4. For features touching existing code, dispatch `code-explorer` (from `feature-dev`) once at start to orient the agent. Skip if feature-dev not installed.
5. For each task in the workplan:
   - **Re-run the open-findings gate before picking up the task** (see Step 2). Findings can accrue mid-session — a per-turn audit, a closed PR's verification re-audit, an in-band judge fire — and the gate's purpose is to refuse advance the moment any open finding exists. Skipping the re-check on follow-on tasks defeats the discipline.
   - If the task involves architecture decisions, dispatch `code-architect` (from `feature-dev`) to propose 2–3 approaches before coding. Skip if feature-dev not installed.
   - If the task introduces or modifies tested code, follow `superpowers:test-driven-development` (write failing test → minimal impl → pass → commit).
   - If a step is independent of others, consider `superpowers:dispatching-parallel-agents` to fan out.
   - Every sub-agent dispatched in this loop (implementer, reviewer, code-explorer, code-architect, etc.) MUST be routed through the dispatch wrapper — see "Dispatch-wrapper engagement" below.
   - When the task body is complete, mark its checkboxes and commit.
6. Auto-invoke scope-widen between tasks (default behavior) unless `--no-scope-widen` was passed:
   - Runs after the task-completion commit lands and BEFORE the next task starts.
   - When the completed task introduced NEW shapes / surfaces / primitives not enumerated in the project's existing `.dw-lifecycle/scope-discovery/scope-manifest.yaml`, invoke `dw-lifecycle scope-widen <slug> "<task brief as complaint>"` to expand the manifest. The "complaint" is the task title or workplan brief reframed as the unmet-coverage observation (e.g. `"new <NewPrimitive> surface introduced by Task N; scope-manifest needs the additional theme"`).
   - The widened scope-manifest is read by the next task's implementer brief so its dispatch sees the augmented scope context.
   - If `.dw-lifecycle/scope-discovery/` is not present in the project, the auto-invocation is silently skipped. No warning, no error — scope-discovery is opt-in per project.
7. After each task, optionally run `/dw-lifecycle:review` or `/dw-lifecycle:audit` (does NOT block; operator chooses cadence).
   - They are synonyms. Both write findings into `audit-log.md` with stable IDs and explicit status transitions.
8. Repeat from step 5 until all tasks done or operator pauses.

## Flags

| Flag | Purpose |
|---|---|
| `--no-scope-widen` | Skip the Step 6 between-tasks auto-invocation of `scope-widen`. Use when the operator has already widened the manifest explicitly, or when the feature's tasks are all purely-additive against an already-comprehensive scope-manifest. |

## When to use `--no-scope-widen`

- The operator has already widened the manifest by hand or by an explicit `/dw-lifecycle:scope-widen` invocation against the relevant tasks.
- The feature is purely additive (new files only, no new primitives) against a scope-manifest that already enumerates every existing shape the work touches.
- The implementation is short enough (one or two tasks) that running widen between every task is more noise than signal.

Default = run scope-widen between tasks. Skipping is the exception, not the rule.

## Dispatch-wrapper engagement

Every sub-agent dispatch fired by this skill — implementer, reviewer, code-explorer, code-architect, parallel fan-out workers — MUST be routed through the dispatch wrapper. The wrapper enforces three contracts on the sub-agent's return:

- **Return grammar.** Every dispatched response MUST conclude with three labelled blocks:

  ```text
  Searched: <pattern> — <N matches>
  Included: <file:line>, <file:line>, ...
  Excluded: <file:line> — <one-line non-deferral reason>
  ```

  The parser extracts the blocks; the validator rejects on missing blocks AND on the "skipped same-class audit" shape (Searched count > 1, Included covers exactly 1 match, Excluded empty).

- **Forbidden-deferral phrases.** Any `Excluded` reason containing a deferral substring or matching a deferral regex (per `FORBIDDEN_DEFERRAL_PHRASES` / `FORBIDDEN_DEFERRAL_REGEXES`) is rejected. Project overrides at `.dw-lifecycle/scope-discovery/forbidden-deferral-phrases.yaml` are honored.

- **Refactor-marker auto-prelude.** When the task prompt contains a refactor marker (`refactor`, `extraction`, `clones.yaml`, `canonical_side`, `tests_proof`, or any project-supplied marker from `.dw-lifecycle/scope-discovery/refactor-markers.yaml`), the wrapper automatically appends the REFACTOR-CONTEXT PRECONDITIONS prelude to the dispatched prompt. Refactor dispatches without the Step 0 obligation are the failure mode the prelude exists to prevent; the marker set is intentionally narrow so false positives stay cheap.

### How the orchestrator engages the wrapper

The wrapper is engaged via two Bash invocations bracketing every Agent-tool dispatch. The orchestrator (this skill's Claude session) cannot supply a TypeScript `dispatchFn` callback to the wrapper because the Agent tool is a runtime tool-use primitive, not a callable. The CLI verbs below factor the wrapper's prompt-augmentation half and response-validation half out into separate steps the orchestrator drives.

1. **Before dispatch — augment the operator-authored prompt.** Write the prompt to a temp file via `mktemp`, then invoke:

   ```bash
   dw-lifecycle wrap-prompt --agent-type <type> --prompt-file <path>
   ```

   Stdout is the augmented prompt (original prompt + grammar instruction + optional refactor-context prelude). Stderr is a one-line summary (suppress with `--quiet`). Paste stdout into the Agent tool's `prompt` parameter. The verb resolves project overrides under `.dw-lifecycle/scope-discovery/*.yaml` against `--repo-root` (defaults to cwd).

2. **After dispatch — validate the sub-agent's response.** Write the response to a temp file, then invoke:

   ```bash
   dw-lifecycle validate-return --agent-type <type> --response-file <path>
   ```

   Stdout is a structured `ValidationResult` JSON: `{ valid, foundBlocks: {searched, included, excluded}, missingBlocks, parseError, forbiddenPhrases: [{phrase, file, line, reason}], refactorPreconditionViolations, skippedAudit, summary }`. Exit code: 0 if valid; 1 on validation failure. Pass `--json` to suppress the stderr summary in pipelines.

   On exit 1, the orchestrator rejects the response and re-dispatches with the same augmented prompt + a correction note quoting the violation surfaced in the JSON. After two consecutive rejections on the same dispatch, surface the parsed-return excerpt to the operator and pause the task.

Agent types recognized by both verbs: `implementer`, `reviewer`, `code-explorer`, `code-architect`, `ui-engineer`, `typescript-pro`, `documentation-engineer`, `project-orchestrator`, `feature-orchestrator`, `codebase-auditor`, `architect-reviewer`, `code-reviewer`. The augmentation profile is currently uniform across types; the flag is required so future per-type profiles ship without a CLI breaking change. The refactor-precondition cue check in `validate-return` fires only when the response itself claims a refactor (mentions `refactor` / `extraction` / `clones.yaml` / `canonical_side`) AND the agent type is refactor-eligible (`implementer`, `code-architect`, `typescript-pro`).

Cross-reference: `plugins/dw-lifecycle/templates/scope-discovery/dispatch-wrapper-prelude.md` documents the convention and the override files in full. In-band TypeScript callers (e.g. the orchestrator-turn's judge step) still engage the dispatch wrapper via `wrap()` from `plugins/dw-lifecycle/src/scope-discovery/dispatch-wrapper.ts`; the CLI verbs share the same library functions for marker detection, override loading, grammar instruction, and parser/validator.

If `.dw-lifecycle/scope-discovery/` is not present in the project, the verbs still run — the dispatch grammar is plugin code, not project config — and fall back to the built-in `FORBIDDEN_DEFERRAL_PHRASES` / `REFACTOR_CONTEXT_MARKERS` defaults. Project overrides are the only thing the project-side install gates.

## Orchestrator loop (per-turn audit/judge stack)

When `.dw-lifecycle/scope-discovery/` is present in the project, this skill runs an orchestrator-loop per-turn audit/judge stack. Invoke the loop via Bash:

```bash
dw-lifecycle orchestrator-turn --feature <slug> [--skip-judge] [--skip-auditor]
```

The CLI verb assembles `TurnInput` from on-disk state (catalog entries, audit-log, fresh codebase-state metrics, discovery-agent findings) and calls the orchestrator-loop library. It emits a machine-readable `TurnReport` (JSON) to stdout and a one-line human summary to stderr. Pass `--json` to suppress the stderr summary.

Per-turn the loop composes the following libraries into a deterministic cycle:

1. **Audit-log read** — `llm/audit-log-reader.ts` surfaces new audit-log entries since the durable watermark at `.dw-lifecycle/scope-discovery/orchestrator-runtime/last-audit-read.json`.
2. **Wrong-decision detection** — `recovery/detect-wrong-decisions.ts` matches audit-log findings whose body contains a disagreement token against agent-driven catalog entries; auto-reverses via `recovery/reverse-disposition.ts` when confidence supports, queues escalation otherwise.
3. **Internal LLM-judge pass** — `llm/judge.ts` runs in-band through `wrap()` (dispatch-grammar + forbidden-deferral phrases enforced); emits ranked disposition proposals with confidence scores. The judge runs only when `--judge-input <path>` is supplied (operator opt-in for the in-band LLM call); otherwise skipped.
4. **Mediation** — `mediation/mediation.ts` clusters recent findings into architectural summaries + (when dispositions supplied) proposes catalog edits.
5. **Controller** — `controller/controller.ts` reads the codebase-state metrics + auditor-correction-rate; adjusts cadence/intensity/escalation-threshold for the next turn; persists history to `.dw-lifecycle/scope-discovery/orchestrator-runtime/controller-state.json`.
6. **Codebase-state metrics** — `discovery-agents/codebase-state-metrics.ts` produces the seven metrics; the loop projects them to the controller's `MetricsSnapshot` shape.
7. **External auditor fire** — `llm/auditor.ts` emits an audit-request artifact under `.dw-lifecycle/scope-discovery/pending-audits/` (fire-and-forget; results materialize next turn via the audit-log reader). Fires only when `--auditor-input <path>` is supplied; suppressed with `--skip-auditor`.
8. **Escalation visibility** — `escalation/escalation-visibility.ts` surfaces queued escalations + their quick-links.

The CLI verb persists `nextLoopState` to disk after the turn completes; the agent does not need to call `persistLoopState` separately.

### Reading the TurnReport

Stdout JSON conforms to `TurnReport` in `plugins/dw-lifecycle/src/scope-discovery/orchestrator-loop/loop-types.ts`. The agent reads the parsed JSON and acts on each field:

- `auditRead.newEntryCount` — new audit-log entries since last turn.
- `wrongDecisions` + `reversalProposals` — operator-or-agent reversal candidates. Apply auto when `controllerDecision.intensity` and `recovery/trust-calibration.ts` both support; otherwise enqueue an escalation.
- `judgeResult` (proposals + narrative) — present only when `--judge-input` was supplied.
- `mediationClusters` + `mediationSummaries` — architectural-scale clusters the synthesis discovery pass would surface as `discovered_candidates`.
- `controllerDecision` — frequency/intensity/escalationThreshold for the NEXT turn.
- `auditorArtifactPath` — pending audit-request artifact path; present only when `--auditor-input` was supplied and `--skip-auditor` was not passed.
- `escalationVisibility` — count + rows. Surface whenever count > 0.
- `nextLoopState` — already persisted by the CLI verb.
- `summary` — single-sentence digest. Echo this in the per-task report.

### When to run

Run one orchestrator turn **before each task** (assess what changed since the prior turn) and **after each task** (assess what the just-completed task introduced). Surface `summary` in the per-task report; surface `escalationVisibility` rows whenever its count is non-zero.

When `.dw-lifecycle/scope-discovery/` is absent, skip the orchestrator-turn invocation entirely (the project hasn't opted into scope-discovery).

### Resumability

`loop-state.json` (`.dw-lifecycle/scope-discovery/orchestrator-runtime/loop-state.json`) persists across `/dw-lifecycle:implement` invocations. The audit-log watermark + controller history advance with each turn; pending-escalations + audit-requests survive in their own durable artifacts.

### Configuration

Defaults at `DEFAULT_LOOP_CONFIG` in `orchestrator-loop/loop-config.ts`. Operator overrides at `.dw-lifecycle/scope-discovery/loop-config.yaml` (turn_history_retention + auto_apply_confidence_floor). The judge model, auditor model, and orchestrator-runtime dir come from `llm-judge.yaml`; the controller's cadence/intensity tunables come from `controller-config.yaml`.

## Error handling

- **Open-findings gate refuses (`dw-lifecycle check-open-findings` exit 1).** STOP the skill. Surface the refusal message verbatim. The cure is `/dw-lifecycle:promote-findings --feature <slug>` to scope each open finding into the workplan as a TDD-first fix task. Per Phase 13's anti-deferral discipline there is no `--ignore-open-findings` flag — the gate is intentionally strict. If a finding is already addressed but its audit-log Status still reads `open`, flip it to `fixed-<sha>` (or `acknowledged-<ref>` with a substantive reason that passes the validator) before re-running the gate.
- **Open-findings gate config error (`dw-lifecycle check-open-findings` exit 2).** Feature root not found OR an argv error. Surface the message; pause for operator action. Common causes: invalid slug, missing `docs/<v>/001-IN-PROGRESS/<slug>/` layout, missing `--feature` argument.
- **feature-dev not installed.** Print one-line warning at start; agent dispatch steps that depend on it are skipped. Skill continues with single-agent fallback. Dispatch-wrapper engagement still applies to the remaining dispatches.
- **Bug surfaces during a task.** Invoke `superpowers:systematic-debugging` before continuing the task. Don't push through with a known bug.
- **Test failures during TDD.** Per the TDD discipline: failing test is expected before implementation. Failing tests AFTER implementation means the impl is wrong; iterate, don't bypass the test.
- **Auto-invocation behavior (scope-widen).** When `.dw-lifecycle/scope-discovery/` is absent, the Step 6 auto-invocation is silently skipped. When present, `scope-widen` runs with default flags (dry-run is its default; `--apply` is passed when this skill invokes it because the merged manifest must be readable by the next task's implementer brief). The widen run's resulting `scope-manifest.yaml` path AND the additive-delta summary are passed into the next task's dispatched-agent context so the implementer sees the augmented scope before starting.
- **`scope-widen` fails.** Surface the error in the next task's brief; the task still proceeds. The operator can re-run scope-widen manually (`/dw-lifecycle:scope-widen <slug> "<complaint>"`) after addressing the cause.
- **`dw-lifecycle validate-return` exit 1.** The sub-agent's response was rejected by the dispatch grammar (missing block / forbidden phrase / skipped-audit signal / refactor-precondition violation). Re-dispatch with the same augmented prompt + a correction note that quotes the violation surfaced in the JSON. After two consecutive rejections on the same dispatch, surface the parsed-return excerpt to the operator and pause the task.
- **Orchestrator loop — judge dispatch fails.** `dw-lifecycle orchestrator-turn` exits non-zero when the in-band judge's wrapper call rejects. Surface the violation to the operator; the next turn re-runs the judge with the same input (recovery is operator-decided per the wrong-decision-recovery primitives at `recovery/`).
- **Orchestrator loop — wrong-decision detected but reversal proposal needs operator review.** The reversal proposal lands in `TurnReport.reversalProposals`. Auto-apply when `controllerDecision.intensity` AND the recovery library's trust-calibration both support it; otherwise enqueue an escalation via `escalation/escalation-queue.ts#enqueueEscalation`. Escalations surface in the next turn's `escalationVisibility`.
