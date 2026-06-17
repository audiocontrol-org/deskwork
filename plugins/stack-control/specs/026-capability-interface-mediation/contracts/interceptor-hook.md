# Contract: PreToolUse interceptor hook (Claude adapter)

**Feature**: 026-capability-interface-mediation. The thin vendor adapter that turns a Claude Code PreToolUse event into a `stackctl mediate-check` call. Plugin-shipped (travels with `claude plugin install`) — the permitted enforcement surface per the no-git-hook ADR ruling (spec Decision 5).

## Declaration

`plugins/stack-control/hooks/hooks.json` (plugin hook surface), registering PreToolUse for two matchers:

```json
{
  "hooks": {
    "PreToolUse": [
      { "matcher": "Bash",  "hooks": [{ "type": "command", "command": "${CLAUDE_PLUGIN_ROOT}/bin/intercept" }] },
      { "matcher": "Skill", "hooks": [{ "type": "command", "command": "${CLAUDE_PLUGIN_ROOT}/bin/intercept" }] }
    ]
  }
}
```

## Input (stdin JSON, from Claude Code)

```jsonc
{
  "session_id": "…",            // → mediate-check --session
  "cwd": "…",                   // → mediate-check --at (installation resolution)
  "hook_event_name": "PreToolUse",
  "tool_name": "Bash" | "Skill",
  "tool_input": { … }            // Bash: { "command": "<str>" }; Skill: { <skill-name field>: "<name>" }
}
```

**Open shape (D3 spike)**: the exact `tool_input` field carrying the skill name for `tool_name: "Skill"` is undocumented. The FIRST implementation task is a throwaway spike that logs this payload to capture the real field; the adapter then reads that confirmed field. (If the spike falsifies skill-name visibility, the `Skill` matcher is dropped and `spec-*` falls to the Approach C backstop — the contingency in research D3.)

## Adapter logic

1. Read stdin JSON.
2. Derive `surface` + `identity`:
   - `Bash` → tokenize `tool_input.command`, normalize `argv[0]` (basename, strip `env`/`sudo` wrappers) → `identity`.
   - `Skill` → read the skill-name field → `identity`.
3. Cheap local pre-filter: if `identity` is obviously in no registry set, exit 0 immediately (no `stackctl` spawn) — bounds per-call latency (research D7).
4. Else call `stackctl mediate-check --surface <s> --identity <id> --session <sid> --at <cwd> --json`.
5. Map result → PreToolUse output:

| mediate-check | Hook stdout (JSON) | Hook exit |
|---|---|---|
| exit 0 (permit) | *(none)* — tool proceeds | 0 |
| exit 1 (refuse) | `{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"<reason>"}}` | 0 |
| exit 2 (usage) | *(none)* — fail loud to stderr; do NOT silently permit a matched backend | non-zero (surfaced to user) |

- On `deny`, `permissionDecisionReason` is the registry-sourced redirect (e.g. *"Direct `speckit-implement` is refused — drive it through `/stack-control:execute`."*). The agent sees the reason and can re-route.
- The adapter contains **no decision logic** (Principle III) — it only marshals the payload and maps the verb's verdict.

## Codex adapter (sequenced — D8)

Same `stackctl mediate-check` core. Codex PreToolUse is **Bash-only**, so the Codex adapter covers `cliArgv0` surfaces (`backlog`); `spec-*` skill surfaces on Codex rely on the Approach C backstop. Built as the US4 follow-on; not v1-blocking.
