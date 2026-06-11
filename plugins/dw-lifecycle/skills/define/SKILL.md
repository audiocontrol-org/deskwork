---

> **RETIRED.** `dw-lifecycle` has been superseded by `stack-control`. This skill is preserved for historical reference only and is no longer maintained. Use [stack-control](../../../stack-control/) skills instead.

# /dw-lifecycle:define

Capture a new feature's problem, scope, approach, and task breakdown. Hands off to `superpowers:brainstorming` for the interview itself; this skill wraps brainstorming's output with the project-management envelope.

## Steps

1. Confirm the feature slug (kebab-case; the operator picks).
2. Invoke `superpowers:brainstorming` to drive the design conversation. The brainstorming skill produces a design doc; we'll capture its key fields into `feature-definition.md`.
3. (Optional) For features that touch existing code, dispatch the `code-explorer` agent (from `feature-dev`) before the interview to surface relevant patterns/files. Skip if `feature-dev` is not installed (warning printed at skill start; install via `/plugin install feature-dev@claude-plugins-official`).
4. Write `/tmp/feature-definition-<slug>.md` from the brainstorming output. Required sections:
   - Problem (1–2 paragraphs)
   - Scope (in/out)
   - Approach (chosen design summary)
   - Tasks (high-level phase list)
5. Auto-invoke `/scope-inventory <slug>` (default behavior) unless `--no-scope-inventory` was passed. Behavior:
   - If `.dw-lifecycle/scope-discovery/` is not present in the project, the auto-invocation is silently skipped. The operator sees nothing — scope-discovery is opt-in per project.
   - When present, the helper runs with default flags (no `--evidence-trail`; that's reserved for full standalone runs invoked via `/dw-lifecycle:scope-inventory`).
   - The resulting `scope-manifest.yaml` path is included in this skill's final report so the operator can read it before scoping the workplan.
6. Report: definition file path, scope-manifest path (when produced), and the suggested next command:
   `/dw-lifecycle:setup <slug> --target <version> --definition <path>`.

## Flags

| Flag | Purpose |
|---|---|
| `--no-scope-inventory` | Skip the Step 5 auto-invocation. Use when the operator has already produced a scope-manifest by hand, or when the feature is too small / too purely-additive to warrant the inventory pass. |

## When to use `--no-scope-inventory`

- The feature is a one-file change with no existing-code reuse story (e.g. an isolated new helper, a one-off doc).
- The operator has already run `/scope-inventory <slug>` explicitly and doesn't want a second pass.
- The feature is being defined against a fresh repo where scope-discovery hasn't been installed yet and the operator knows they want to skip rather than letting the silent-skip path fire.

Default = run the inventory. Skipping is the exception, not the rule.

## Error handling

- **Brainstorming not finished.** This skill does NOT bypass brainstorming. If the operator wants to skip, they should write the definition file by hand and call `/dw-lifecycle:setup` directly.
- **feature-dev not installed.** Warning at start; the `code-explorer` step is skipped. Skill continues.
- **scope-discovery not installed.** Step 5 silently skips. No warning, no error. (To opt in, run `/dw-lifecycle:install-scope-discovery` in the project.)
- **`/scope-inventory` fails.** The error is surfaced in the report; the definition file still lands. The operator can re-run scope-inventory manually after addressing the cause.

## Composed discipline: capture mode vs scope mode

Composed from `.claude/rules/agent-discipline.md` (feature `decompose-agent-discipline`); the rules file now points here.

A definition / spec / PRD is a **capture artifact** — its job is to record every aspect of the problem space that's known or knowably-implied, so the operator (and future agents) have a complete picture to scope from. **Scoping is a separate, explicit, operator-driven pass that happens AFTER capture.** During the interview, do NOT scope-cut. Phrases the agent inserts unprompted — *"YAGNI until concrete use,"* *"deferred to a follow-up,"* *"not in v1,"* *"out of scope for now,"* *"keeps it simple"* — are scope-pushback dressed as discipline (the same shape as "just for now"). Capture everything; state every edge case and cross-cut impact the design implies; write open questions into the doc rather than omitting them. The operator's framing: *"I don't need you to push back on scope. I need you to help me find the hidden areas where undiscovered scope is implied but not specified… capture everything we know. THEN we can worry about how to scope it."* Scope-narrowing compounds with the agent's hallucination + forgetting tendencies — comprehensive capture is the antidote. Only help scope when the operator explicitly asks ("now let's scope for v1"), and record those cuts as the operator's decisions.
