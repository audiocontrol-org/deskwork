---
name: execute
description: "Run a Spec Kit spec via native /speckit-implement in-session, with deskwork governance firing automatically afterward (cross-model audit-barrage + finding lift)"
---

# /stack-control:execute

Run a Spec Kit spec through **native** `/speckit-implement` — driven by the in-session agent — and let the rehomed **deskwork-governance** extension fire automatically on `after_implement`. This is the execution touch point of the stack-control front door (Feature 1, US1). It does not reimplement Spec Kit's executor and it does not manually invoke governance; it gates, drives, and reports.

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

## Steps

1. **Resolve the target spec dir.** Use the spec dir passed as the argument. If none is given, resolve the active feature's spec dir from the `<!-- SPECKIT START -->…<!-- SPECKIT END -->` marker in `CLAUDE.md` (it names the active `specs/<feature>/plan.md`). State which spec dir you resolved before proceeding. **If neither an argument nor the marker resolves a spec dir** (marker absent/empty, or it points at a `plan.md` that no longer exists), **STOP and report that no spec dir could be resolved — do not guess a directory** (AUDIT-20260605-07). Guessing risks running native execution against the wrong spec or fabricating a runnable verdict; this mirrors the fail-loud STOP in step 2.

2. **Gate on runnability — fail loud, no partial run.** Run:

   ```bash
   stackctl execute-check --spec <spec-dir>
   ```

   - Exit `0` (`runnable`) → continue to step 3.
   - Exit non-zero → **STOP.** Surface the `stackctl` stderr **verbatim** (it names the missing artifact, e.g. `tasks.md missing; spec not runnable (run /speckit-tasks first)`). Do not start native execution, do not fabricate a run, do not paper over the gap (FR-008, Principle V). The recovery is to author the spec to runnable via `/stack-control:extend` (or `/speckit-tasks`), then re-run execute.

3. **Drive native `/speckit-implement` PHASE BY PHASE, governing at each boundary (025 US2 — non-discretionary).** Walk the `tasks.md` phases **in order**. For each phase:

   1. **Refuse to start a phase until every prior phase is governed.** A phase may begin only when all earlier `tasks.md` phases have a *current* per-phase checkpoint (FR-007). `stackctl` enforces this at govern time; do not start phase N+1's work while phase N is missing/stale.
   2. **Drive that phase's tasks** via native `/speckit-implement`, in this session, with this agent. **Do NOT shell out to a headless/batch CLI** to invoke the agent (FR-006; the durability motivation behind Principle IX). Native execution does the work; stack-control does not walk the tasks itself.
   3. **At the phase boundary, run per-phase governance** — a skill-body post-condition, **not** an agent choice (FR-006):

      ```bash
      stackctl govern --mode implement --phase <id>
      ```

      This scopes the cross-model `audit-barrage` to the phase's files (a right-sized payload) and writes the phase checkpoint. Governance runs **per phase, here — never batched into one whole-feature pass at the end** (a whole-feature barrage exceeds the model-fleet envelope → `boundary-too-large`; FR-006a, and the `.claude/rules/agent-discipline.md` "No offroading" rule this feature mechanizes).
      - If a **single phase** still exceeds the fleet envelope, `stackctl` fails loud with **`boundary-too-large`** pointing at right-sizing guidance (TASK-75). **Do NOT auto-split the phase and do NOT silently scope it down** (FR-008). The recovery is to re-shape the phase's `tasks.md` boundary, then re-run — never to bypass govern.
   4. **Commit, then push — at this boundary, mechanically (025 US3).** After the phase's govern, **commit the phase's work** (it lands locally first, so completed work is never lost — FR-009), then **push** to the branch's remote (FR-010). This is automatic boundary behavior, not something the operator has to ask for. If the **push fails** (offline / auth / pre-push hook), surface the failure loud — the local commit is intact and pushes on retry; **never** continue silently and **never** use `--no-verify` (fix the hook, don't bypass it; FR-011/SC-007).

   There is **no skip/defer/shortcut branch** anywhere in this loop (US5). A heavy step is *done*, not offered for deferral.

4. **Governance is the per-phase pass — the `governing` phase composes, it does not re-barrage (FR-006a).** Because every phase was governed in step 3 during `implementing`, the per-phase checkpoints already exist when the feature reaches `governing`. The whole-feature `record-converged impl` signal the graduate gate reads is **composed** from the union of those per-phase checkpoints (it carries converged-and-unchanged phases and re-audits only cross-cutting remainder) — there is **no new whole-feature barrage**. This skill never runs `audit-barrage` directly (SC-002); `stackctl govern --phase` owns it.

5. **Confirm and report.** Report:
   - the spec dir that was executed,
   - the per-phase govern run-dirs (under `.stack-control/audit-runs/`) and the phase checkpoints written (`.stack-control/govern/phase-checkpoints/<feature>/`),
   - where findings landed (`audit-log.md`),
   - how many model lanes produced output per phase.

   If a per-phase govern failed (e.g. the model fleet floor was not met), surface the descriptive error — governance is **not** optional, and a missing capability fails loud. Do not lower `--require-models` or `--override` to "keep moving" (that is the prohibited offroad).

## Commit and push (025 US3 — mechanical, at each phase boundary)

After each phase's govern (step 3.3), the boundary runs — in order, non-discretionary:

1. **Commit, local-first.** `git add -A` then `git commit` the phase's work. The commit
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

Native execution ran over the spec **phase by phase**, with `stackctl govern --phase` governing each boundary (never one batched whole-feature run); per-phase checkpoints exist for every phase; the graduate gate's signal is composed from them. On any blocked path, you surfaced a descriptive error naming the missing piece (runnable spec / oversized boundary → TASK-75 / governance capability) — never a faked or partial run (SC-006).

## Honest boundary (FR-017)

This mechanism binds an agent **following the skills**. It does NOT claim to prevent a
deliberate human bypass via raw `git` / `gh` / the vendored `speckit` scripts — a person
running those directly is outside the skill surface. What IS guaranteed: the **US1 per-phase
graduate gate** narrows the worst hole — a feature implemented raw (without per-phase govern
checkpoints) **cannot graduate to `shipped`**, on any host (the defense-in-depth, FR-014).
The cross-vendor point-of-invocation interception of a raw backend call is a filed follow-on
(`design:gap/speckit-bypass-point-of-invocation-refusal`), not claimed here.

## What this skill does NOT do

- It does not author or repair the spec (use `/stack-control:define` / `/stack-control:extend`).
- It does not reimplement `/speckit-implement`.
- It does not run a single batched whole-feature `audit-barrage` — governance is per-phase (`stackctl govern --phase`); the `governing` phase composes from the checkpoints (FR-006a).
- It does not offer to skip/defer/shortcut any step (US5), and it does not lower the fleet floor or `--override` to bypass a failed govern.
- It does not branch on which tool authored the spec (Principle III — capability, not provider identity).
