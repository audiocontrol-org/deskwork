---
name: define
description: "Author a NEW Spec Kit spec for a new feature, in-session — drive native /speckit-specify and the downstream authoring chain via the in-session agent, confirming state with stackctl spec-check (spec-authoring only; does not create worktree/docs infra)"
---

# /stack-control:define

Author a **new** Spec Kit spec through the stack-control front door (Feature 1, US2). You drive **native** Spec Kit's authoring chain — `/speckit-specify` and the steps downstream of it — via the in-session agent, and use `stackctl spec-check` to confirm artifact state as the spec advances. This skill does **not** reimplement Spec Kit's authoring; it sequences it and reports.

> Per `.claude/rules/enforcement-lives-in-skills.md`: the discipline lives in this skill body + the `stackctl` verb it calls, never in a git hook. The skill travels with the plugin install.

> **Where a new feature can originate.** A feature is not always authored from a
> blank intent — it can **graduate up from the backlog**. When a found-work item
> in the [backlog](../backlog/SKILL.md) earns the full spec-driven treatment, the
> operator `backlog promote <id> --to spec:specs/NNN-slug` records the promotion
> linkage on the item (record-only), then authors the spec here. By convention
> the new spec notes its originating `TASK-<n>` in its Context, so the promotion
> is navigable both ways. See [`/stack-control:backlog`](../backlog/SKILL.md)
> § *Promote into the feature rigor* for the canonical description of the seam.

## Compass precondition + capture-fusion (024 — FR-008 model b)

`define` is the **authoring front door that FUSES capture** (FR-008, model b — operator decision
2026-06-16): authoring a spec for a feature with **no roadmap node CREATES the node in the same
move** — never a refuse-and-go-capture-first detour. So the opening branch is *create-or-gate*,
not *refuse*:

1. **Resolve the feature/item.** Determine the roadmap node id for the feature you are about to
   author (the `--item` if given, else the active feature).
2. **No node yet → CREATE it (capture-fusion).** Author the spec dir via `/speckit-specify`
   first (it numbers `specs/NNN-<slug>/`), then create the referencing node in the same
   operation:

   ```bash
   stackctl roadmap add <id> --spec specs/NNN-<slug> --apply
   ```

   A spec dir is never left without a node (no orphan). Do **not** refuse.
3. **Node already exists → compass-gate.** Consult the compass and refuse loud on a non-zero
   verdict (an `ahead`/`off-rail` action — e.g. the item is in a terminal side-state), performing
   none of this skill's work:

   ```bash
   stackctl workflow compass <id> --intent define
   ```

**Backstop (FR-009, mechanical):** any spec dir that still ends up with no roadmap node (e.g.
hand-authored outside this path) is a hard error — the compass reports it `off-rail` and every
spec-resolving verb refuses. So orphans are impossible through the front door (define creates the
node) AND caught if they appear another way. Per `.claude/rules/enforcement-lives-in-skills.md`
the discipline lives in this skill body + the `stackctl` verbs, never a git hook.

## Scope — authoring only

`define` is **spec-authoring only**. It does NOT create a worktree, a docs tree, or any other physical infrastructure — that is a separate concern (mirrors dw-lifecycle's `define` ≠ `setup`, and Constitution Principle IV: providers own authoring intent; physical substrate is a distinct responsibility). If infra is needed, that is the operator's separate call.

## Preconditions

- You are in an interactive coding-agent session whose host can drive the local
  Spec Kit authoring chain for this installation (Claude Code and Codex are the
  current portability targets; there is **no headless/batch CLI dependency**,
  by design; FR-006/007).
- The GitHub Spec Kit framework (`.specify/`) is present.

## Steps

1. **Establish the new feature's intent.** Capture what the operator wants the feature to do. Per Constitution Principle II (Integration-First) and the project's capture-don't-cut rule: capture everything known or knowably-implied; do **not** insert unrequested scope cuts ("YAGNI", "deferred", "not in v1"). Scoping is a separate, explicit, operator-driven pass.

2. **Drive native `/speckit-specify`** via the in-session agent to create the new spec. Honor Spec Kit's prescribed order (Principle VIII — Faithful Tool Adoption): `specify → clarify → plan → checklist → tasks → analyze`. Do not skip or off-road; let each `/speckit-*` step run in order as the spec matures.

3. **Resolve and state the spec dir.** `/speckit-specify` numbers the new spec dir (`specs/NNN-<slug>/`). Resolve it before you reference it anywhere below. Note: this program runs on one long-lived branch (`feature/pluggable-lifecycle-providers`) with numbered spec dirs, so Spec Kit's `check-prerequisites.sh` rejects the branch name (TF-09) — the active spec dir is resolved via the `<!-- SPECKIT START -->…<!-- SPECKIT END -->` marker in `CLAUDE.md`, not via the branch. State which spec dir you created before proceeding (matching `extend`'s resolve-then-report ordering).

4. **Confirm artifact state as it advances.** After each authoring step that adds an artifact, run `stackctl spec-check` against the dir you resolved in step 3:

   ```bash
   stackctl spec-check --spec <spec-dir>
   ```

   It prints a machine-readable presence line (`spec=yes plan=yes tasks=no`). Use it to confirm the chain actually produced what you expect before moving to the next step — read it, do not assume.

5. **Advance toward runnable.** Bring the spec through the chain to the point where `tasks.md` exists — at which `/stack-control:execute`'s `execute-check` will pass. Confirm with a final `stackctl spec-check`.

## Postcondition

A new Spec Kit spec exists and is advanced toward runnable; its state is confirmed by `stackctl spec-check`. Handing it to `/stack-control:execute` runs without manual re-assembly. (FR-005, with `extend`, delivers the full create / edit / iterate / review loop.)

## Self-hosting

Together with `extend` (author existing) and `execute` (run), `define` is sufficient to author **and** run the *next* feature's spec through the front door (SC-005 / FR-009) — the self-hosting proof.

## What this skill does NOT do

- It does not create worktree / docs infra (`define` ≠ `setup`).
- It does not reimplement `/speckit-specify` or any `/speckit-*` step.
- It does not run the spec — that is `/stack-control:execute`.
- It does not branch on which tool will author or run the spec (Principle III — capability, not provider identity).
- It does not paper over a missing Spec Kit mechanism: a "cannot proceed" branch surfaces the underlying error verbatim (Principle V).

## Front-door marker (026 — capability mediation)

This skill is the sanctioned interface for the **spec-definition** capability. The plugin's
PreToolUse interceptor refuses a RAW backend call (a direct `/speckit-specify` / `/speckit-clarify` / `/speckit-plan` / `/speckit-checklist` / `/speckit-tasks` / `/speckit-analyze`); a call this skill
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

2. Drive the backend (`/speckit-specify` / `/speckit-clarify` / `/speckit-plan` / `/speckit-checklist` / `/speckit-tasks` / `/speckit-analyze`).

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
