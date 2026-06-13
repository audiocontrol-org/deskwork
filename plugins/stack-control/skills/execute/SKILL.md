---
name: execute
description: "Run a Spec Kit spec via native /speckit-implement in-session, with deskwork governance firing automatically afterward (cross-model audit-barrage + finding lift)"
---

# /stack-control:execute

Run a Spec Kit spec through **native** `/speckit-implement` — driven by the in-session agent — and let the rehomed **deskwork-governance** extension fire automatically on `after_implement`. This is the execution touch point of the stack-control front door (Feature 1, US1). It does not reimplement Spec Kit's executor and it does not manually invoke governance; it gates, drives, and reports.

> Per `.claude/rules/enforcement-lives-in-skills.md`: the discipline lives in this skill body + the `stackctl` verb it calls, never in a git hook. The skill travels with the plugin install.

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
   plugins/stack-control/bin/stackctl execute-check --spec <spec-dir>
   ```

   - Exit `0` (`runnable`) → continue to step 3.
   - Exit non-zero → **STOP.** Surface the `stackctl` stderr **verbatim** (it names the missing artifact, e.g. `tasks.md missing; spec not runnable (run /speckit-tasks first)`). Do not start native execution, do not fabricate a run, do not paper over the gap (FR-008, Principle V). The recovery is to author the spec to runnable via `/stack-control:extend` (or `/speckit-tasks`), then re-run execute.

3. **Drive native `/speckit-implement` via the in-session agent.** Invoke the native Spec Kit implement step over the resolved spec — in this session, with this agent. **Do NOT shell out to a headless/batch CLI** to invoke the agent (FR-006; the durability motivation behind Principle IX). Native execution does the work; stack-control does not walk the tasks itself (governance is the differentiator, execution is commodity).

4. **Let governance fire automatically — do not invoke it manually.** Native `/speckit-implement`'s `after_implement` hook fires `speckit.deskwork-governance.govern` (`optional: false`) automatically: it gathers the implemented diff, runs deskwork's cross-model `audit-barrage`, and lifts findings into the feature `audit-log.md`. **This skill does not call governance itself** (SC-002: zero manual barrage invocations). If the hook is non-optional and does not fire, that is a failure to surface — not something to work around.

5. **Confirm and report.** Confirm governance fired and report:
   - the spec dir that was executed,
   - the governance run-dir (printed by `govern.sh`, under `.dw-lifecycle/scope-discovery/audit-runs/`),
   - where findings landed (`audit-log.md`),
   - how many model lanes produced output.

   If governance failed (e.g. `dw-lifecycle` absent from PATH), surface the descriptive error — governance is **not** optional, and a missing dependency fails loud (the cross-plugin seam, guarded by `scripts/smoke-governance-missing-dep.sh`).

## Postcondition

Native execution ran over the spec; governance fired automatically on `after_implement`; findings are recorded. On any blocked path, you surfaced a descriptive error naming the missing piece (mechanism / runnable spec / governance capability) — never a faked or partial run (SC-006).

## What this skill does NOT do

- It does not author or repair the spec (use `/stack-control:define` / `/stack-control:extend`).
- It does not reimplement `/speckit-implement`.
- It does not manually run `audit-barrage` — the `after_implement` hook owns that.
- It does not branch on which tool authored the spec (Principle III — capability, not provider identity).
