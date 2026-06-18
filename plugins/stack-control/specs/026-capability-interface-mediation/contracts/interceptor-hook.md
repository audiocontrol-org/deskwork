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

## Codex adapter (US4 / T027 — Bash-only, D8)

The Codex adapter is a thin shell over the SAME vendor-neutral core — it contains no
decision logic (Principle III; proven by the T026 purity test: the core branches on
capability/identity only). It is **Bash-only** (research D8: Codex's PreToolUse equivalent
intercepts Bash, not a Skill tool), so it covers the `cliArgv0` surfaces (`backlog`); the
`spec-*` SKILL surfaces on Codex rely on the Approach C / US3 graduate-gate backstop.

**Adapter contract** (the part that is vendor-neutral and pinned now):

1. On a Codex Bash PreToolUse event, extract the command string, the session id, and cwd.
2. Invoke `stackctl mediate-check --surface bash --identity "<command>" --session "<id>" --at "<cwd>" --json`.
3. Map the verdict: exit 0 (permit) → allow; exit 1 (refuse) → block the call, surfacing the
   registry-sourced redirect (`reason`/stderr) to the agent; exit 2 (usage) → fail loud, do
   NOT silently permit a matched backend (mirrors the Claude adapter's fail-closed posture).

Parity with the Claude adapter for the same raw Bash call is guaranteed because both call
the same verb (asserted by the T028 cross-vendor parity test, SC-005).

**Confirmed at Codex integration (live gate, like Claude's T018)**: the concrete Codex
PreToolUse hook-registration config (its file format + the exact payload field carrying the
command + its block-output schema) is intentionally NOT invented here — Codex's hook schema
is "less-defined" (D8) and must be quoted from Codex's own docs at wiring time, not guessed.
The vendor-neutral verb above is the stable contract the Codex shim binds to.
