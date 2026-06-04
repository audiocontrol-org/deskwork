---
name: implement
description: "Walk workplan tasks; delegate to subagents; commit at task boundaries; auto-invokes scope-widen between tasks unless --no-scope-widen"
---

# /dw-lifecycle:implement

Drive implementation through the workplan. Selects the next unchecked task, dispatches subagents per task, reviews output, marks the task done, commits. Repeats.

## Steps

1. Confirm slug and target version.
2. **Workplan-aware open-findings gate.** Before picking up the next task, run:

   ```bash
   dw-lifecycle check-open-findings --feature <slug>
   ```

   Exit 0 = proceed. Two flavors of exit 0:
   - `no-open-findings` — the audit-log has zero `Status: open` entries.
   - `open-findings-scoped-as-next` — open findings exist, AND the next N unchecked workplan tasks at positions `[0..N-1]` are the `(fix-finding-AUDIT-<id>)` tasks covering exactly those finding IDs. The loop is allowed because the open findings ARE the next work.

   Exit 1 = refusal. Three modes, each with a specific cure rendered in the message:
   - `non-fix-task-before-fix-tasks` — an unchecked task at a position before all open-finding fix-tasks is NOT tagged `(fix-finding-AUDIT-<id>)`. Cure: reorder the workplan so the fix-tasks come first.
   - `coverage-mismatch (missing)` — one or more open findings have no scoped fix-task in positions `[0..N-1]`. Cure: run `dw-lifecycle promote-findings --feature <slug> --apply` to scope them.
   - `coverage-mismatch (extra)` — scoped fix-tasks in positions `[0..N-1]` reference Finding-IDs that are not currently open. Cure: flip those audit-log entries to `fixed-<sha>`/`verified-<date>` OR remove the stale scoped tasks from the workplan.

   Exit 2 = config error (feature root not found or argv error). Surface and pause.

   Per Phase 13's anti-deferral discipline + the Phase 15 operator directive (*"audit findings are failures of the previous implementation that shouldn't be treated like exceptions — they are guardrails to point the implementation team back to the happy path"*), open findings do NOT block task pickup when they're scoped as the next work; they DO block when they're unscoped or non-next. No `--ignore-open-findings` override flag — the workplan-aware semantic IS the cure, not an escape hatch.
3. Invoke `superpowers:subagent-driven-development` as the orchestration discipline. The skill walks the workplan, dispatching per-task subagents with full task context.
4. For features touching existing code, dispatch `code-explorer` (from `feature-dev`) once at start to orient the agent. Skip if feature-dev not installed.
5. For each task in the workplan:
   - **Re-run the open-findings gate before picking up the task** (see Step 2). Findings can accrue mid-session — a per-turn audit, a closed PR's verification re-audit, an in-band judge fire — and the gate's purpose is to refuse advance the moment any open finding exists. Skipping the re-check on follow-on tasks defeats the discipline.
   - If the task involves architecture decisions, dispatch `code-architect` (from `feature-dev`) to propose 2–3 approaches before coding. Skip if feature-dev not installed.
   - If the task introduces or modifies tested code, follow `superpowers:test-driven-development` (write failing test → minimal impl → pass → commit).
   - If a step is independent of others, consider `superpowers:dispatching-parallel-agents` to fan out.
   - Every sub-agent dispatched in this loop (implementer, reviewer, code-explorer, code-architect, etc.) MUST be routed through the dispatch wrapper — see "Dispatch-wrapper engagement" below.
   - When the task body is complete, mark its checkboxes and commit.
6. **End-of-task chain (full Phase 24 composition).** After every task-completion commit, run the full chain in this order. Per `.claude/rules/enforcement-lives-in-skills.md` + the no-git-hook-enforcement ADR (`docs/superpowers/specs/2026-06-03-no-git-hook-enforcement.md`), this is the *enforcing* counterpart to the *advisory* snapshot at session-start. The discipline that used to live in `.husky/commit-msg` + `.husky/pre-push` (`check-implement-hook-ran`, `check-implement-hook-coverage`) and `.husky/pre-commit` (structural chain) now lives here in the skill body — adopters get it by installing the plugin, not by wiring git hooks.

   **Step 6a — Structural chain (refuse-to-advance on new findings).** When `.dw-lifecycle/scope-discovery/` is present:

   ```bash
   dw-lifecycle check-clones --feature <slug> --gate-mode
   dw-lifecycle check-anti-patterns --feature <slug> --gate-mode
   dw-lifecycle check-adopters --feature <slug> --gate-mode
   dw-lifecycle check-module-symmetry --feature <slug>
   ```

   Any non-zero exit code (new clone group, new anti-pattern hit, new holdout, or symmetry delta the surface doesn't sanction) STOPS the loop. The agent surfaces the verb's stderr report verbatim and pauses until the operator decides how to disposition. The structural chain at end-of-implement-task is enforcing because the pathology that motivated `Just for now is bullshit` was the *audit-finding* chain (high volume, bookkeeping-heavy), not the structural one (low volume, real defects). When `.dw-lifecycle/scope-discovery/` is absent, Step 6a silently skips.

   **Step 6b — Audit-barrage chain.** After Step 6a passes:

   ```bash
   dw-lifecycle implement-hook --feature <slug>
   ```

   This single verb composes the audit-barrage half of the chain: new-diff guard (`check-barrage-tip`), prompt rendering (`audit-barrage-render`), parallel CLI fan-out (`audit-barrage`), finding extraction (`audit-barrage-lift`), dampener evaluation (`check-barrage-dampener`), and disposition (either `slush-remaining --apply` when the dampener is engaged or `promote-findings --auto` when it isn't). Exit 0 = hook ran cleanly OR new-diff guard skipped; exit 1 = mid-flight failure; exit 2 = config error.

   When `.dw-lifecycle/scope-discovery/` is absent in the project, the verb silently allows (scope-discovery is opt-in).

   **Step 6c — Workplan-aware gate (refuse-to-advance on open findings unscoped or non-next).**

   ```bash
   dw-lifecycle check-open-findings --feature <slug>
   ```

   Exit 0 (zero open findings OR open findings are scoped as the next-N workplan tasks) = continue to Step 7. Exit 1 = STOP per Step 2's refusal-mode taxonomy (the gate refusal IS the cure path).

   **Step 6d — Apply audit-flips.** Walk recent commits for `Closes AUDIT-X` trailers and apply the corresponding `open → fixed-<sha>` flips to the audit-log. Folded into the end-of-task step (no separate manual call):

   ```bash
   dw-lifecycle apply-audit-flips --feature <slug> --apply
   ```

   When the working-tree is clean post-flip, no commit is needed; when the flip-write modifies the audit-log, stage + commit as part of the next task's commit (small bookkeeping batched with substantive work, not a separate bookkeeping commit).

   **Step 6e — Fix-task TDD check (in-skill advisory).** When the just-completed task is a fix-task (`(fix-finding-AUDIT-<id>)` shape), verify the commit body cites a test file + line range under `**/__tests__/**`:

   ```bash
   dw-lifecycle check-fix-task-tdd --feature <slug>
   ```

   Advisory only — the verb surfaces missing-citation as a warning rather than refusing. The fix-task discipline is encoded in the skill's instruction to the agent, not as a separate hook the agent could `--no-verify` past.

   **No git-hook fallback.** Per Phase 24, the layered-with-teeth Phase 17 model (commit-msg gate + pre-push coverage gate) is RETIRED. There is no `.husky/` enforcement supplementing this skill body. The discipline lives here; an agent who skips Step 6 ships a bug; the only correction is operator review.

7. Auto-invoke scope-widen between tasks (default behavior) unless `--no-scope-widen` was passed:
   - Runs after the task-completion commit lands and BEFORE the next task starts.
   - When the completed task introduced NEW shapes / surfaces / primitives not enumerated in the project's existing `.dw-lifecycle/scope-discovery/scope-manifest.yaml`, invoke `dw-lifecycle scope-widen <slug> "<task brief as complaint>"` to expand the manifest. The "complaint" is the task title or workplan brief reframed as the unmet-coverage observation (e.g. `"new <NewPrimitive> surface introduced by Task N; scope-manifest needs the additional theme"`).
   - The widened scope-manifest is read by the next task's implementer brief so its dispatch sees the augmented scope context.
   - If `.dw-lifecycle/scope-discovery/` is not present in the project, the auto-invocation is silently skipped. No warning, no error — scope-discovery is opt-in per project.
8. After each task, optionally run `/dw-lifecycle:review` or `/dw-lifecycle:audit` (does NOT block; operator chooses cadence).
   - They are synonyms. Both write findings into `audit-log.md` with stable IDs and explicit status transitions.
9. Repeat from step 5 until all tasks done or operator pauses.

## Flags

| Flag | Purpose |
|---|---|
| `--no-scope-widen` | Skip the Step 7 between-tasks auto-invocation of `scope-widen`. Use when the operator has already widened the manifest explicitly, or when the feature's tasks are all purely-additive against an already-comprehensive scope-manifest. |

There is **no `--skip-audit-barrage-hook` flag.** Per Phase 15's operator directive, the end-of-task audit-barrage hook (Step 6) is unconditional. The hook is silently skipped when `.dw-lifecycle/scope-discovery/` is absent in the project (scope-discovery is opt-in), but cannot be skipped via a flag when the project HAS opted in.

## When to use `--no-scope-widen`

- The operator has already widened the manifest by hand or by an explicit `/dw-lifecycle:scope-widen` invocation against the relevant tasks.
- The feature is purely additive (new files only, no new primitives) against a scope-manifest that already enumerates every existing shape the work touches.
- The implementation is short enough (one or two tasks) that running widen between every task is more noise than signal.

Default = run scope-widen between tasks. Skipping is the exception, not the rule.

## Audit-barrage hook behavior reference

The detailed semantics of the `dw-lifecycle implement-hook` verb invoked in Step 6. Step 6 itself is mechanically simple; this section is the operator-facing reference.

### Disposition rules

The dampener engages via **either** of two rules:

1. **N-quiet rule.** The last 2 consecutive barrages each surfaced 0 HIGH+ open findings.
2. **Single-run rule** (added 2026-05-31). The most recent barrage surfaced 0 HIGH+ AND 0 MEDIUM open findings — a single clean run is signal enough.

The dampener engaging means *"recent runs were quiet on real bugs — new findings (on this iteration's new diff) get slushed rather than promoted."* It does NOT mean *"the auditor has gone quiet on real bugs"* in a sense that would justify skipping audits on new work — that framing was the structural bug #383 closed.

Per the operator's 2026-05-31 directive (baked into /dwi): *"Do work, audit barrage, if 0 HIGH and 0 MEDIUM findings on the NEW work, put new findings in slush. If there have been 2 consecutive audits on the new work with 0 HIGH findings, then put new findings in slush."* The two rules mechanize this exactly.

When engaged, `slush-remaining --apply` flips MED/LOW/INFO `Status: open` findings in the most-recent barrage section to `acknowledged-slush-pile-<YYYY-MM-DD>` AND ticks the matching workplan fix-task blocks' checkboxes — so the workplan-aware gate (Step 2) sees zero open findings and the loop continues. The audit-log entries stay as historical record per the preservation rule. **HIGHs are NEVER slushed**: the severity filter is defense-in-depth (the dampener's invariant already prevents HIGHs from being in the most-recent section when engaged, but the filter ensures `--scope all` and any future legacy paths still preserve them).

When the dampener is NOT engaged, `promote-findings --auto` scopes the findings as fix-tasks at the head of the workplan and the next iteration's gate sees them as the next-N work.

### Operator-acknowledged trade-offs (2026-05-31 framing — these are CHOICES, not bugs)

- **MEDIUM bugs slush under Rule B.** Sequence: barrage N is 0 HIGH+ (counter=1, no slush yet) → barrage N+1 lands 0 HIGH + 3 MEDIUMs. Rule B fires (2 consecutive 0-HIGH) → 3 real MEDIUMs go to slush even though they're real bugs. Same trade as the existing post-#380 severity filter (HIGHs only preserved); the operator explicitly accepts the cost.
- **First-barrage slushing.** A clean feature start's first barrage that comes back 0 HIGH + 0 MEDIUM fires Rule A immediately. LOWs land in slush with no history. Consistent with the single-run-rule's explicit "no history required" semantic.
- **Per-iteration barrage cost when dampened.** Pre-Phase-16, a dampened iteration was zero cost (skipped). Post-Phase-16, every iteration with new diff fires a barrage. Cost is on subscription-auth CLIs (no per-call billing); the autonomous-loop context means the operator isn't waiting. Cross-model audit coverage on new work is the third audit surface's whole reason for existing. The loop-stop is unchanged — workplan-exhaustion still stops the loop; the dampener was never the stop mechanism.

### Failure-path policy (fail loud; do not pause the loop on findings)

The `implement-hook` verb maps internal failures to one of three outcomes:

- **Exit 0** — hook ran cleanly OR new-diff guard skipped. Marker written. The commit-msg gate will allow the next commit.
- **Exit 1** — mid-flight failure. Marker NOT written. The commit-msg gate will refuse the next commit until the operator re-runs successfully.
- **Exit 2** — config error (missing slug, feature root not found). Marker NOT written.

Inside the chain, the per-step semantics are:

- `check-barrage-tip` no-new-diff (exit 1) → verb exits 0 with stderr `no new diff since last barrage; skip without firing.`
- `audit-barrage-render` non-zero → exit 1; the vars JSON is malformed or the template has unsubstituted markers. Fix and re-run.
- `audit-barrage` exit 1 (every CLI failed) → verb exits 0 with stderr `audit-barrage all-models-failed (outage); hook complete.` The hook forward-progresses (per *"barrage was an outage, NOT a finding"*); the operator investigates.
- `audit-barrage` exit 0 but partial spawn failures → proceed with healthy models (degraded barrage; cross-model agreement weaker but findings still emit).
- `audit-barrage-lift` exit 0 with zero findings → proceed to Step 7 (scope-widen) without firing disposition (nothing to dispose).
- `audit-barrage-lift` non-zero → exit 1; write to audit-log failed (drift/permissions/parser).
- `slush-remaining --apply` non-zero → exit 1; flips failed.
- `promote-findings --auto` non-zero → exit 1; scoping failed (per operator directive, findings are guardrails; failing to scope is structural).
- `check-open-findings` non-zero post-disposition → exit 1; auto-scoping landed but gate still refuses (investigate).

### Per-task report shape

After every `implement-hook` invocation, the per-task report includes (stderr only, no persisted artifact):

- `new-diff` — commit count since last barrage (0 = skip case).
- `barrage status` — e.g. `2/3 models healthy` (printed by the barrage verb).
- `dampener result` — `Dampened: ...` or `Not dampened: ...` (printed by `check-barrage-dampener`).
- `disposition` — `fired-and-slushed`, `fired-and-promoted`, or the verb exits early with `no new diff` or `outage` text.
- `findings`/`promoted`/`slushed` counts.

When the barrage fires, the run directory at `.dw-lifecycle/scope-discovery/audit-runs/<timestamp>-<feature>/` is the durable record (INDEX.md + per-model output + tip.sha). Per Phase 24's no-git-hook-enforcement contract, the verb no longer writes `last-hook-run.json` or appends to `hook-run-log.jsonl` — those artifacts existed only to satisfy the retired commit-msg + pre-push gates. No-new-diff-skip and barrage-outage outcomes consequently leave only stderr text behind (an operator-acknowledged trade-off per the dampener slush logic that already accepts MED/LOW losses).

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

2. **After dispatch — validate the sub-agent's response.** Either write the response to a temp file, or pipe it via stdin using the `-` sentinel:

   ```bash
   dw-lifecycle validate-return --agent-type <type> --response-file <path>
   # or, mirroring `gh issue create --body-file -`:
   echo "$RESPONSE" | dw-lifecycle validate-return --agent-type <type> --response-file -
   ```

   Stdout is a structured `ValidationResult` JSON: `{ valid, foundBlocks: {searched, included, excluded}, missingBlocks, parseError, forbiddenPhrases: [{phrase, file, line, reason}], refactorPreconditionViolations, skippedAudit, summary }`. Exit code: 0 if valid; 1 on validation failure; 2 on usage errors (missing flag, file not found, or empty stdin when `-` is passed). Pass `--json` to suppress the stderr summary in pipelines.

   On exit 1, the orchestrator rejects the response and re-dispatches with the same augmented prompt + a correction note quoting the violation surfaced in the JSON. After two consecutive rejections on the same dispatch, surface the parsed-return excerpt to the operator and pause the task.

Agent types recognized by both verbs: `implementer`, `reviewer`, `code-explorer`, `code-architect`, `ui-engineer`, `typescript-pro`, `documentation-engineer`, `project-orchestrator`, `feature-orchestrator`, `codebase-auditor`, `architect-reviewer`, `code-reviewer`. The augmentation profile is currently uniform across types; the flag is required so future per-type profiles ship without a CLI breaking change. The refactor-precondition cue check in `validate-return` fires only when the response itself claims a refactor (mentions `refactor` / `extraction` / `clones.yaml` / `canonical_side`) AND the agent type is refactor-eligible (`implementer`, `code-architect`, `typescript-pro`).

Cross-reference: `plugins/dw-lifecycle/templates/scope-discovery/dispatch-wrapper-prelude.md` documents the convention and the override files in full. In-band TypeScript callers (e.g. the orchestrator-turn's judge step) still engage the dispatch wrapper via `wrap()` from `plugins/dw-lifecycle/src/scope-discovery/dispatch-wrapper.ts`; the CLI verbs share the same library functions for marker detection, override loading, grammar instruction, and parser/validator.

If `.dw-lifecycle/scope-discovery/` is not present in the project, the verbs still run — the dispatch grammar is plugin code, not project config — and fall back to the built-in `FORBIDDEN_DEFERRAL_PHRASES` / `REFACTOR_CONTEXT_MARKERS` defaults. Project overrides are the only thing the project-side install gates.

## Orchestrator loop (per-turn audit/judge stack)

When `.dw-lifecycle/scope-discovery/` is present in the project, this skill runs an orchestrator-loop per-turn audit/judge stack. Invoke the loop via Bash:

```bash
dw-lifecycle orchestrator-turn --feature <slug> [--skip-judge] [--skip-auditor] [--verbose]
```

The CLI verb assembles `TurnInput` from on-disk state (catalog entries, audit-log, fresh codebase-state metrics, discovery-agent findings) and calls the orchestrator-loop library. It emits a machine-readable `TurnReport` (JSON) to stdout and a one-line human summary to stderr. Pass `--json` to suppress the stderr summary.

`--verbose` forces the `NOTE: only N/6 catalog files present (...)` summary decoration even when the catalog count is unchanged from the prior turn (Phase 14 Task 1 — AUDIT-20260529-12). Default behavior: emit the NOTE on the first turn or whenever the count changes (file added or removed); suppress on steady-state turns to keep the per-turn summary signal-dense. The `WARNING: no scope-discovery catalog files` line (count === 0) is NOT subject to gating; it always fires.

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

- **Workplan-aware gate refuses (`dw-lifecycle check-open-findings` exit 1).** STOP the skill. Surface the refusal message verbatim. The refusal mode determines the cure: `non-fix-task-before-fix-tasks` → reorder the workplan so fix-tasks occupy positions `[0..N-1]`; `coverage-mismatch (missing)` → run `dw-lifecycle promote-findings --feature <slug> --apply` to scope unscoped findings; `coverage-mismatch (extra)` → flip stale audit-log entries to `fixed-<sha>`/`verified-<date>` OR remove the stale scoped fix-tasks. The new semantic + the absence of an override flag (per Phase 13 rigidity stance + Phase 15 operator directive) are intentional: findings ARE the next work, not exceptions blocking it.
- **Workplan-aware gate config error (`dw-lifecycle check-open-findings` exit 2).** Feature root not found OR an argv error. Surface the message; pause for operator action. Common causes: invalid slug, missing `docs/<v>/001-IN-PROGRESS/<slug>/` layout, missing `--feature` argument.
- **feature-dev not installed.** Print one-line warning at start; agent dispatch steps that depend on it are skipped. Skill continues with single-agent fallback. Dispatch-wrapper engagement still applies to the remaining dispatches.
- **Bug surfaces during a task.** Invoke `superpowers:systematic-debugging` before continuing the task. Don't push through with a known bug.
- **Test failures during TDD.** Per the TDD discipline: failing test is expected before implementation. Failing tests AFTER implementation means the impl is wrong; iterate, don't bypass the test.
- **Auto-invocation behavior (scope-widen).** When `.dw-lifecycle/scope-discovery/` is absent, the Step 7 auto-invocation is silently skipped. When present, `scope-widen` runs with default flags (dry-run is its default; `--apply` is passed when this skill invokes it because the merged manifest must be readable by the next task's implementer brief). The widen run's resulting `scope-manifest.yaml` path AND the additive-delta summary are passed into the next task's dispatched-agent context so the implementer sees the augmented scope before starting.
- **End-of-task audit-barrage hook failures (Step 6).** Each stage of the five-CLI hook has a specific failure response. `audit-barrage-render` non-zero → stop loop, fix vars/template. `audit-barrage` all-models-failed (exit 1) → degraded path: proceed without lift; surface single-line warning. `audit-barrage-lift` non-zero with extracted findings → stop loop (audit-log write failed; drift/permissions/parser issue). `promote-findings --auto` non-zero → stop loop (per operator directive, findings are guardrails; failing to scope them is a structural failure). `check-open-findings` non-zero AFTER the auto-promote → stop loop (the gate refused despite the auto-scoping; investigate workplan + audit-log state). Failures that stop the loop surface the underlying error verbatim in the per-task report; the operator addresses them before the next `/dw-lifecycle:implement` invocation.
- **`scope-widen` fails.** Surface the error in the next task's brief; the task still proceeds. The operator can re-run scope-widen manually (`/dw-lifecycle:scope-widen <slug> "<complaint>"`) after addressing the cause.
- **`dw-lifecycle validate-return` exit 1.** The sub-agent's response was rejected by the dispatch grammar (missing block / forbidden phrase / skipped-audit signal / refactor-precondition violation). Re-dispatch with the same augmented prompt + a correction note that quotes the violation surfaced in the JSON. After two consecutive rejections on the same dispatch, surface the parsed-return excerpt to the operator and pause the task.
- **Orchestrator loop — judge dispatch fails.** `dw-lifecycle orchestrator-turn` exits non-zero when the in-band judge's wrapper call rejects. Surface the violation to the operator; the next turn re-runs the judge with the same input (recovery is operator-decided per the wrong-decision-recovery primitives at `recovery/`).
- **Orchestrator loop — wrong-decision detected but reversal proposal needs operator review.** The reversal proposal lands in `TurnReport.reversalProposals`. Auto-apply when `controllerDecision.intensity` AND the recovery library's trust-calibration both support it; otherwise enqueue an escalation via `escalation/escalation-queue.ts#enqueueEscalation`. Escalations surface in the next turn's `escalationVisibility`.

## Composed disciplines

These were composed from `.claude/rules/agent-discipline.md` (feature `decompose-agent-discipline`); the rules file now points here.

### Design tasks go through /frontend-design first (precondition)

Before picking up any task involving a **design decision** — a new UI surface, a redesign, an affordance-placement decision, a visual-language choice, anything that asks *"what should this look like / how should this work"* — invoke **`/frontend-design`** first. It produces 2–3 opinionated mockups the operator picks from, turning implementation into a translation problem instead of an exploration problem. Skip it only when the design is fully determined upstream (the task names exact CSS/markup, or the operator named "use pattern X exactly"). When in doubt, run it. Applies to dispatch prompts too: instruct design-task sub-agents to use `/frontend-design`.

### Sub-agent dispatch reports are action lists, not disclosures

When a dispatched sub-agent's report flags an adjacent issue as *"out of scope but worth flagging,"* that is NOT a valid resting place. Treat every such flag as an action: fix it in-scope now (if small and related), or file a GitHub issue immediately so the operator can decide. *"Noted in the dispatch report"* is not a disposition — the operator may not read the report until a downstream user trips over the bug. Report which flags you fixed vs. filed (with the issue link) in your task summary.

### This skill runs in the implementation session, not the orchestrator session

`/dw-lifecycle:implement` runs in a **feature-worktree session** opened against `~/work/<project>-work/<slug>/`, distinct from the orchestrator session that ran define → setup → PRD-iterate/approve → issues in the main repo. The two-session split keeps orchestration context out of implementation context. The operator's framing: *"you are the orchestrator, not the implementer."* If you're in the orchestrator session about to run implement, hand off — open a fresh session against the worktree. (Operator override of this boundary is the operator's explicit call.)
