---
name: execute
description: "Run a Spec Kit spec by dispatching each task to a fresh, right-sized subagent at the model its declared [tier:] resolves to (model-sized dispatch), with deskwork governance firing automatically afterward (cross-model audit-barrage + finding lift)"
---

# /stack-control:execute

Run a Spec Kit spec by **dispatching each `tasks.md` task to a fresh subagent**, in-session, at the explicit model its declared `[tier:<label>]` resolves to (model-sized dispatch, 033) — then let the rehomed **deskwork-governance** extension fire automatically over the committed feature. This is the execution touch point of the stack-control front door (Feature 1, US1). It adopts the proven subagent-driven-development discipline (fresh per-task subagent, isolated brief, test-first, task review, durable ledger) and adds a declarative, operator-controlled model-tier layer on top; it does not reimplement Spec Kit's executor and it does not manually invoke governance; it gates, resolves, dispatches, and reports.

> Per `.claude/rules/enforcement-lives-in-skills.md`: the discipline lives in this skill body + the `stackctl` verb it calls, never in a git hook. The skill travels with the plugin install.

## Compass precondition (024 — the un-skippable lifecycle)

**Before doing ANY of this skill's work**, consult the compass for the roadmap item this invocation operates on, declaring this skill as the intent:

```bash
stackctl workflow compass <item> --intent execute
```

> Invoke the CLI as bare `stackctl` (it is on `PATH` in a plugin install). Do NOT
> use the source-repo `plugins/stack-control/bin/stackctl` form — it 404s in an
> adopter's host install (GitHub #480).

A **non-zero exit is a hard refusal**: print the compass's reason (it names the violated invariant and, for an `ahead` verdict, the skipped step) and **STOP — perform none of this skill's work**. Proceed only on exit 0 (`on-course` / `behind`). If no item resolves (a spec dir with no roadmap node is `off-rail`), refuse loud and direct the operator to capture/design/specify it first. The lifecycle rules live in one place (the compass + the governed `WORKFLOW.md`), not re-encoded here; per `.claude/rules/enforcement-lives-in-skills.md` the gate lives in this skill body + the `stackctl workflow compass` verb, never a git hook.

## Preconditions

- You are in an interactive coding-agent session whose host can drive the local
  Spec Kit execution chain for this installation (Claude Code and Codex are the
  current portability targets; there is **no headless/batch CLI dependency**,
  by design; FR-006).
- The GitHub Spec Kit framework (`.specify/`) is present and the `deskwork-governance` extension is installed and enabled (`specify extension list`).

### Front-door completeness gate (028 US4 — refuse when RED)

**Before driving any execution**, run the front-door regression guard as a **hard gate**
(per `enforcement-lives-in-skills`, the gate lives in this skill body + the `stackctl
check-front-door` verb — never a git hook):

```bash
stackctl check-front-door
```

- **Exit 0** → the front door is complete and discoverable; proceed.
- **Non-zero** → **STOP. Refuse to execute.** A gap (a deleted/renamed skill, a broken
  `--help`, an unfronted mutating verb, or a skill↔verb parity break) means an operation
  this run may touch is not fronted/discoverable/mediated. Print the named gaps and fix
  the surface first — never weaken the check to proceed.

## Steps

1. **Resolve the target spec dir.** Use the spec dir passed as the argument. If none is given, resolve the active feature's spec dir from the `<!-- SPECKIT START -->…<!-- SPECKIT END -->` marker in `CLAUDE.md` (it names the active `specs/<feature>/plan.md`). State which spec dir you resolved before proceeding. **If neither an argument nor the marker resolves a spec dir** (marker absent/empty, or it points at a `plan.md` that no longer exists), **STOP and report that no spec dir could be resolved — do not guess a directory** (AUDIT-20260605-07). Guessing risks running native execution against the wrong spec or fabricating a runnable verdict; this mirrors the fail-loud STOP in step 2.

2. **Gate on runnability — fail loud, no partial run.** Run:

   ```bash
   stackctl execute-check --spec <spec-dir>
   ```

   - Exit `0` (`runnable`) → continue to step 3.
   - Exit non-zero → **STOP.** Surface the `stackctl` stderr **verbatim** (it names the missing artifact, e.g. `tasks.md missing; spec not runnable (run /speckit-tasks first)`). Do not start native execution, do not fabricate a run, do not paper over the gap (FR-008, Principle V). The recovery is to author the spec to runnable via `/stack-control:extend` (or `/speckit-tasks`), then re-run execute.

3. **Resolve tiers, then dispatch each task to a fresh, right-sized subagent (033 — model-sized dispatch; 030 — govern-at-end).** Do NOT walk the tasks serially inline and do NOT shell out to a headless/batch CLI (FR-006; the durability motivation behind Principle IX). Instead:

   **3a — Resolve tiers FIRST (the pre-dispatch gate).** Run:

   ```bash
   stackctl resolve-tiers --spec <spec-dir>
   ```

   - Exit `0` → it emits a `TierResolution` JSON `{ specDir, tasks: [{ id, tierLabel, model }] }`. Build the `id → model` map from it.
   - Exit non-zero → **STOP. Dispatch nothing.** Surface the **complete** tier-error set verbatim (every `has no model tier declared` / `declares unknown tier` / `no tier_map configured` error). Resolution is all-or-nothing — no partial dispatch (FR-006 / SC-002). The recovery is to fix the plan's `[tier:<label>]` tags or the installation's `tier_map` in `.stack-control/config.yaml`, then re-run execute. **Never** dispatch an unresolved task at the session's inherited default model to "keep moving" (Principle V — the silent-default gap this feature exists to close).

   **3b — Dispatch per the adopted subagent-driven-development discipline, at the EXPLICIT resolved model.** For each task (in the order chosen in 3e, skipping ids the ledger already records complete — 3d), dispatch a **fresh subagent with an isolated, task-scoped brief** — the task's `body` plus the files/contracts it names, NOT this session's accumulated history (FR-009) — invoked **explicitly at the model the task's tier resolved to in 3a**, never an inherited session default (FR-002, SC-001). The subagent works **test-first** (RED→GREEN), self-reviews, and commits its own work. (Cross-host portability, spec assumption U1: this assumes the host exposes a per-dispatch model-selection surface — Claude Code's Agent/Task dispatch does. If a host cannot select a model per dispatch, this step MUST **fail loud** naming the missing host capability — never silently inherit the session default; Principle V.)

   **3c — Task-review loop.** After a subagent returns, review its work (a fresh reviewer subagent, or the controller). On findings, dispatch a fix subagent and re-review; only a **clean** review ledgers the task complete (the adopted discipline's gate).

   **3d — Durable ledger (resume safety + observability).** Record each completed task in the execution ledger under `<installation>/.stack-control/execute/<feature>.ledger.jsonl` — its `id`, declared `tierLabel`, resolved `model`, `commitRange`, and `reviewClean` verdict. On a **resumed/compacted** run, skip every id already in the ledger (SC-005); the declared tier + resolved model stay observable afterward (FR-010/011, SC-004). The ledger is anchored in the installation working-file set (installation-anchor invariant).

   **3e — Ordering / parallelism is controller judgment (adopted stance — NO mechanical scheduler).** Dispatch genuinely-independent tasks (`[P]`) in parallel and run dependent tasks in plan order — this is the controller's call per the adopted superpowers stance, NOT a mechanism this feature enforces (FR-012). Never dispatch multiple implementation subagents that write the same files concurrently (the conflict superpowers goes serial to avoid). The mechanical dependency-DAG + worktree-isolated parallel engine remains `impl:feature/execution-engine` (specs/002), out of scope here.

   This discipline is applied by stack-control **itself** — it does NOT require the superpowers plugin to be installed; behavior is identical whether or not it is (FR-013 / SC-006). **Governance does NOT fire per phase** — the per-phase `--phase` checkpoint apparatus is retired (030); govern runs once at the end of `implementing`, in step 4, over the committed whole-feature diff.

   At each implementation boundary, **commit, then push — mechanically (025 US3):** **commit the work** (it lands locally first, so completed work is never lost — FR-009), then **push** to the branch's remote (FR-010). This is automatic boundary behavior, not something the operator has to ask for. If the **push fails** (offline / auth / pre-push hook), surface the failure loud — the local commit is intact and pushes on retry; **never** continue silently and **never** use `--no-verify` (fix the hook, don't bypass it; FR-011/SC-007).

   There is **no skip/defer/shortcut branch** anywhere in this loop (US5). A heavy step is *done*, not offered for deferral.

4. **Govern once, at the end, over the whole committed feature (030 — chunked govern-at-end; non-discretionary).** When every `tasks.md` task is complete and committed (the workflow's `start-governing` gate is `tasks-complete spec`), run the single whole-feature governance pass — a skill-body post-condition, **not** an agent choice (FR-006):

   > **Manual / operator-acceptance tasks use the `- [~]` marker (gh-499 / gh-501).** A task a coding agent cannot complete in-session — e.g. *"operator live re-bless (manual, read-only)"* — is written `- [~]` (or `- [-]`), which the `tasks-complete` gate **excludes**, so the cross-model audit runs **before** the operator spends a live-prod acceptance (audit-before-acceptance). Do **not** leave such a task as `- [ ]` (it would block govern) and do **not** fake it `- [x]`. A normal unchecked `- [ ]` still blocks; an unrecognized marker (a typo'd `[?]`) is counted as open, never silently excluded.

   ```bash
   stackctl govern --mode implement          # feature derived from the SPECKIT marker / branch
   # or, when driven by a roadmap item:
   stackctl govern --mode implement --item <id>
   ```

   This scopes the cross-model `audit-barrage` to the **whole-feature committed diff**, **chunking it into bite-sized sub-payloads** that each fit under the model-fleet envelope, parallelizing audit + fix across the fleet, and reconciling **once** at the end. Because the payload is chunked, a large feature **never FATALs on size** — 030 retires the per-phase `boundary-too-large` regime that the old per-phase split existed to avoid. This skill never runs `audit-barrage` directly (SC-002); `stackctl govern` owns it.

5. **Confirm and report.** Report:
   - the spec dir that was executed,
   - the whole-feature govern run-dirs (under `.stack-control/audit-runs/`) and the convergence record written (`.stack-control/govern/convergence/<item>.json`),
   - where findings landed (`audit-log.md`),
   - how many model lanes produced output, and the per-chunk round count.

   If govern failed (e.g. the model fleet floor was not met), surface the descriptive error — governance is **not** optional, and a missing capability fails loud. Do not lower `--require-models` or `--override` to "keep moving" (that is the prohibited offroad).

## Process drivers (029 US8 / FR-029 — apply when fixing a govern finding before re-firing)

These codify the structural drivers of myopic convergence (TASK-60), so the loop converges in fewer rounds with less fix-induced surface growth. When you fix a finding and re-govern, apply all five:

- **Channel-enumeration.** A fix that ADDS to an allowlist/surface (a new flag, accepted value, parser branch, fold path) is not done on the one example it fixes — enumerate the channels it opens: **value** (other inputs now accepted), **state** (new reachable states), **multiline / composition** (how it composes with adjacent surfaces) — and add a fixture per opened channel before re-firing.
- **Invariant-first boundary.** When you disposition a finding as a scope boundary, state the **mechanism's invariant + an in-scope exception**, never the exclusion of the counterexample ("we exclude X" is the smell; "the invariant is I, X is the in-scope exception because…" is the disposition).
- **Round-0 self-red-team.** Before re-firing the barrage, do a **self-red-team pass over your fix diff itself**: what new edge did it open? what did it move rather than remove? Treat your fix as a fresh surface under audit.
- **Fleet-degradation pricing.** Price a "0 HIGH" round by the fleet that produced it. A **degraded** fleet (a timed-out / killed / zero-byte lane — US2 observability) makes cross-model agreement weaker; do not treat a degraded-fleet quiet round as full convergence.
- **Severity-rubric anchoring.** Triage findings by the blast-radius rubric (US3), not by alarm — a quietly-plausible wrong reading an unattended agent would build outranks an obvious contradiction a reader would resolve.

## Commit and push (025 US3 — mechanical, at each implementation boundary)

At each implementation boundary during step 3 (before the end-of-feature govern), the
boundary runs — in order, non-discretionary:

1. **Commit, local-first.** `git add -A` then `git commit` the work. The commit
   lands locally before the push so completed work is never lost (FR-009). One logical
   change per commit (Principle VII).
2. **Push.** `git push` the branch to its remote (FR-010).
3. **On push failure, fail loud.** Offline / auth / a pre-push hook refusal → surface the
   error, leave the local commit intact (it pushes on retry), do **not** continue silently,
   and **never** use `--no-verify` — a hook failure is *fixed*, not bypassed (FR-011/SC-007).

This is the mechanism that replaces the recurring "remember to commit and push" reminder
(Principle VII as a mechanism, not advice). It runs in the **implementation session**
(feature worktree); the orchestrator session never runs `execute`, so the cadence does not
cross that boundary.

## Postcondition

Tiers resolved cleanly (or the run STOPPED with the complete tier-error set and dispatched
nothing — SC-002), each task ran in a fresh subagent at its explicit resolved model with a
durable ledger entry, and once every task was complete and committed,
`stackctl govern --mode implement` governed the **whole committed feature in one chunked
pass** (the payload streamed across the fleet under the envelope, so size never FATALs); the
graduate gate reads the converged whole-feature record that pass wrote. On any blocked path,
you surfaced a descriptive error naming the missing piece (runnable spec / unresolved tier /
missing host model-selection capability / governance capability) — never a faked or partial
run (SC-006).

## Honest boundary (FR-017)

This mechanism binds an agent **following the skills**. It does NOT claim to prevent a
deliberate human bypass via raw `git` / `gh` / the vendored `speckit` scripts — a person
running those directly is outside the skill surface. What IS guaranteed: the **graduate
gate** narrows the worst hole — a feature implemented raw (without a converged whole-feature
govern record) **cannot graduate to `shipped`**, on any host (the defense-in-depth, FR-014).
The cross-vendor point-of-invocation interception of a raw backend call is a filed follow-on
(`design:gap/speckit-bypass-point-of-invocation-refusal`), not claimed here.

## What this skill does NOT do

- It does not author or repair the spec (use `/stack-control:define` / `/stack-control:extend`).
- It does not reimplement `/speckit-implement`.
- It does not build a dependency-DAG scheduler, cycle detector, or wave engine (FR-012) — ordering/parallelism is controller judgment under the adopted stance; the mechanical parallel+worktree engine is `impl:feature/execution-engine` (specs/002).
- It does not hardcode model identifiers — tiers are operator data in `tier_map`, resolved by `stackctl resolve-tiers` (Principle III / FR-007).
- It does not run `audit-barrage` directly — `stackctl govern --mode implement` owns the one whole-feature chunked govern-at-end pass (SC-002).
- It does not offer to skip/defer/shortcut any step (US5), and it does not lower the fleet floor or `--override` to bypass a failed govern.
- It does not branch on which tool authored the spec (Principle III — capability, not provider identity).

## Front-door marker (026 — capability mediation)

This skill is the sanctioned interface for the **spec-execution** capability. The plugin's
PreToolUse interceptor refuses a RAW backend call (a direct native `/speckit-implement`); a call this skill
makes is permitted because the skill sets the front-door marker first. **Bracket the
backend drive:**

1. Confirm the session id is populated, then `enter` — it PRINTS a token value and fails
   loud (exit 2) if `$CLAUDE_CODE_SESSION_ID` is empty (do NOT proceed to the backend if so):

   ```bash
   test -n "$CLAUDE_CODE_SESSION_ID" || { echo "no session id; cannot mediate — stop"; exit 1; }
   stackctl front-door enter --capability spec-execution --session "$CLAUDE_CODE_SESSION_ID"
   ```

   Read the token value it printed. **Your `enter` and `exit` run in SEPARATE Bash tool
   calls**, so a `$TOKEN` shell variable will NOT survive between them — carry the LITERAL
   token value yourself.

2. Drive the execution (the per-task subagent dispatch of step 3 — the sanctioned spec-execution backend), then govern the whole feature at the end. The marker bracket still wraps the execution even though the dispatch is per-task subagents rather than a single monolithic backend call — a stray RAW `/speckit-implement` outside this skill stays refused.

3. **ALWAYS `exit` — on success AND on a failed/aborted drive** — passing the LITERAL token
   value from step 1 (not a shell variable, which is gone by now; `exit` rejects an empty
   token loudly). A skipped/empty `exit` leaks the marker (it would wrongly permit a later
   raw call) until the staleness bound prunes it.

   ```bash
   stackctl front-door exit --token <the-token-value-printed-in-step-1> --session "$CLAUDE_CODE_SESSION_ID"
   ```

The marker is session-keyed and nesting-safe — a nested/parallel drive gets its own token
and one `exit` never clears another's (FR-014a); writes are lock-serialized. NOTE (open
spike, task-164): the permit path relies on `$CLAUDE_CODE_SESSION_ID` equalling the id the
interceptor reads from the hook payload (`session_id`) — the expected mechanism, not yet
live-verified. If a sanctioned drive is refused right after a successful `enter`, a
session-id mismatch is the prime suspect (task-164).
