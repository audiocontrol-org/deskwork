---
name: extend
description: "Refine an EXISTING Spec Kit spec in place, in-session — report state with stackctl spec-check, then run the edit/iterate/review loop (/speckit-clarify, re-/speckit-plan, re-/speckit-tasks, edits) reusing the current spec dir, bringing it to a runnable state"
---

# /stack-control:extend

Refine an **existing** Spec Kit spec through the stack-control front door (Feature 1, US2). You provide the full **edit / iterate / review loop** over a spec that already exists — driving native Spec Kit's `/speckit-*` steps via the in-session agent, reusing the current spec dir — and bring it to a **runnable** state so `/stack-control:execute` can run it without manual re-assembly. This skill sequences and reports; it does not reimplement Spec Kit.

> Per `.claude/rules/enforcement-lives-in-skills.md`: the discipline lives in this skill body + the `stackctl` verb it calls, never in a git hook. The skill travels with the plugin install.

## Preconditions

- You are in an interactive coding-agent session whose host can drive the local
  Spec Kit iteration chain for this installation (Claude Code and Codex are the
  current portability targets; no headless/batch CLI dependency; FR-006/007).
- The spec dir already exists (this is `extend`, not `define`).

## Steps

1. **Resolve and report current state.** Resolve the target spec dir (arg, or the active feature's dir from the `<!-- SPECKIT START -->…<!-- SPECKIT END -->` marker in `CLAUDE.md` — the program uses one long-lived branch with numbered spec dirs, so the marker resolves the dir, not the branch name; TF-09). State which spec dir you resolved, then run:

   ```bash
   stackctl spec-check --spec <spec-dir>
   ```

   It prints a machine-readable presence line (`spec=yes plan=yes tasks=no`). This tells you what already exists and therefore what the loop needs to advance. Read it — do not assume the spec's state.

   **If the spec dir does not exist**, `spec-check` fails loud with a descriptive error. STOP and surface it verbatim — do not silently fall through to `define` (that is a different skill and a different intent; Principle V).

2. **Run the edit / iterate / review loop in place** (FR-005). Reusing the **current spec dir**, drive the relevant native Spec Kit steps via the in-session agent — `/speckit-clarify` to resolve underspecified areas, re-`/speckit-plan` after design changes, re-`/speckit-tasks` to regenerate the task spine, and direct edits — honoring Spec Kit's prescribed order where steps chain (Principle VIII). Capture-don't-cut applies (Principle II): record everything known/knowably-implied; scoping is a separate operator-driven pass. Re-run `stackctl spec-check` between steps to confirm each produced what you expect.

3. **Bring the spec to runnable.** Continue until `tasks.md` exists (and the upstream artifacts it depends on are current) — the state at which `/stack-control:execute`'s `execute-check` passes. Confirm with a final `stackctl spec-check` (and, if you want the gate's exact verdict, `stackctl execute-check --spec <dir>`).

## Postcondition

The existing spec is advanced toward runnable, in place (same dir, no manual re-assembly); handing it to `/stack-control:execute` runs. (FR-005, with `define`, delivers the full create / edit / iterate / review loop.)

## Self-hosting

Together with `define` (author new) and `execute` (run), `extend` is sufficient to advance the *next* feature's spec to runnable through the front door (SC-005 / FR-009) — the self-hosting proof: e.g. `extend` Feature 2's spec (`specs/002-parallel-execution-engine`) to runnable, then `execute` it.

## What this skill does NOT do

- It does not create a new spec (use `/stack-control:define`).
- It does not create worktree / docs infra.
- It does not run the spec — that is `/stack-control:execute`.
- It does not reimplement any `/speckit-*` step.
- It does not branch on which tool authored the spec (Principle III — capability, not provider identity).
- It does not paper over a missing spec or Spec Kit mechanism: a "cannot proceed" branch surfaces the underlying error verbatim (Principle V).

## Front-door marker (026 — capability mediation)

This skill is the sanctioned interface for the **spec-definition** capability. The plugin's
PreToolUse interceptor refuses a RAW backend call (a direct `/speckit-*` clarify / re-plan / re-tasks chain); a call this skill
makes is permitted because the skill sets the front-door marker first. **Bracket the
backend drive:**

1. Confirm the session id is populated, then `enter` — it PRINTS a token value and fails
   loud (exit 2) if `$CLAUDE_CODE_SESSION_ID` is empty (do NOT proceed to the backend if so):

   ```bash
   test -n "$CLAUDE_CODE_SESSION_ID" || { echo "no session id; cannot mediate — stop"; exit 1; }
   stackctl front-door enter --capability spec-definition --session "$CLAUDE_CODE_SESSION_ID"
   ```

   Read the token value it printed. **Your `enter` and `exit` run in SEPARATE Bash tool
   calls**, so a `$TOKEN` shell variable will NOT survive between them — carry the LITERAL
   token value yourself.

2. Drive the backend (the `/speckit-*` clarify / re-plan / re-tasks chain).

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
