# Skill-surface mediation spike — CONCLUSION (empirical)

**Date:** 2026-06-18
**Roadmap node:** `design:gap/skill-surface-mediation` (part-of `design:feature/capability-interface-mediation`); ref TASK-241
**Question (from the node):** Does `UserPromptExpansion` (or ANY hook event) fire for AGENT-initiated `Skill`-tool invocations (the reach-around threat), or only USER-typed slash commands? Last session's live T018 validation reported the `PreToolUse` `Skill` matcher INERT.

## Headline finding — last session's diagnosis was WRONG

The `PreToolUse` hook **DOES fire** for agent-initiated `Skill`-tool calls. The reach-around
was launching un-denied **not** because the hook is inert, but because the interceptor's
decision core **reads the wrong `tool_input` field**: it reads `skill_name`, while the real
Claude Code payload field is **`skill`**. Empty identity → `matchCapability` returns null →
permit. A one-field bug, masquerading as a hook-firing limitation.

The threat 026 cares about (the AGENT reaching around `/stack-control:execute` to run a raw
`/speckit-implement`) **is interceptable on the existing `PreToolUse` + `Skill` surface**. No
new event (`UserPromptExpansion`, etc.) is required for the in-scope threat.

## Empirical evidence (this session, live, installed release 0.51.0)

Method: instrumented the loaded plugin hook (`…/cache/deskwork/stack-control/0.51.0/bin/intercept`)
to log every PreToolUse payload unconditionally, ran a Bash positive control, then invoked a
skill via the **`Skill` tool** (the agent-initiated path = the reach-around threat), then
reverted the instrumentation (install left pristine; `diff` confirmed identical).

1. **Positive control (Bash):** hook fired —
   `"hook_event_name":"PreToolUse","tool_name":"Bash",…`
2. **Agent `Skill`-tool call (`feature-help`):** hook **FIRED** —
   `"hook_event_name":"PreToolUse","tool_name":"Skill","tool_input":{"skill":"feature-help"}`
   → PreToolUse fires for agent-initiated skills. **Contradicts the "inert" conclusion.**
3. **Real payload field is `skill`, not `skill_name`.** The Claude Code `Skill` tool's input
   parameter is literally `skill` (matches the tool schema). The 026 "T002 spike" recorded
   `skill_name` — empirically wrong.

Verb-level confirmation (`stackctl intercept`, no front-door marker):

| payload `tool_input` | result | why |
|---|---|---|
| `{"skill_name":"speckit-implement"}` | **DENY** | code reads `skill_name` (line 62) |
| `{"skill":"speckit-implement"}` (real CC shape) | **PERMIT (bug)** | `skill` never read → empty identity → "not a fronted backend" |

## Root cause

`src/capability/intercept.ts:62`

```ts
} else if (toolName === 'Skill') {
  surface = 'skill';
  identity = str(input.skill_name);   // ← WRONG: real PreToolUse field is `skill`
}
```

The comments at `intercept.ts:12` and `:42` both cite the "T002 spike: `skill_name`"
conclusion. That spike's field name was never validated against a real Claude Code payload —
the classic "tested against the implementation's own assumption, not the real contract" blind
spot. Last session's `intercept` tests (which made the "decision logic is correct" claim) used
`skill_name` payloads, so they passed while the live surface permitted everything.

## Recommended fix (implementation work for the node, TDD-first)

1. **RED first** — a regression test using the **real** payload shape
   `{"tool_name":"Skill","tool_input":{"skill":"speckit-implement"}}` asserting DENY, plus
   `{"skill":"feature-help"}` asserting PERMIT (SC-003). This test must fail against current
   `intercept.ts`.
2. **GREEN** — read `input.skill` at `intercept.ts:62`. (If args are ever needed for identity,
   the `Skill` tool also carries an `args` string; identity matching is on the skill name, so
   `skill` alone is sufficient for the registry match.)
3. **Correct the recorded contract.** Fix the `skill_name` references in `intercept.ts`
   comments, `specs/026-…/contracts/interceptor-hook.md`, `research.md` (D7 / T002 spike), and
   any test fixtures that hardcode `skill_name`. The spike conclusion in the spec that "the
   shipped decision logic is correct" must be corrected — it was correct only for a payload
   shape Claude Code does not send.
4. **Correct the PR #484 / journal overclaim** that PreToolUse does not fire for skills.
5. Re-validate live on the next installed release (raw `Skill`-tool `speckit-implement` →
   denied; benign skill → permitted; front-door marker present → permitted).

## Residual (out of the 026 threat model, note for completeness)

A **USER who types** `/speckit-implement` themselves takes Path A (CLI prompt-expansion), which
bypasses `PreToolUse`. That is the operator's explicit action, not the agent reach-around 026
targets, and the load-bearing US3 graduate-gate backstop still covers un-governed work either
way. IF gating user-typed direct invocation is later wanted, a `UserPromptExpansion`-class event
is the candidate surface — but that claim comes from docs research below and is **unverified
empirically**; verify with the same instrument-and-observe method before relying on it.

---

## Appendix — docs research (secondary; treat event enumeration as UNVERIFIED)

A `claude-code-guide` sub-agent fetched the hooks docs. Its narrative model (two paths: agent
`Skill`-tool call → `PreToolUse`; user-typed `/cmd` → prompt-expansion) matches the empirical
result above and is what pointed at the field-name root cause. **However**, its enumeration of
hook events (it listed `UserPromptExpansion`, `StopFailure`, `ConfigChange`, `PostToolBatch`,
`TaskCreated`, `TeammateIdle`, etc.) is expansive and `claude-code-guide` is known to
over-assert; do not treat that list as authoritative without the instrument-and-observe check.
The only claims this spike treats as settled are the three EMPIRICAL findings above.
