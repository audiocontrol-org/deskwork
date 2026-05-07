---
name: listen
description: Drop the agent into bridge listen mode — process operator messages from the studio chat panel as turns. Each operator message becomes a normal turn the agent handles end-to-end (read context if referenced, run tools, compose response, send back) before re-entering the await loop. Stops when the operator interrupts via terminal Ctrl-C or when the studio MCP connection closes.
---

## Listen

Drop into the studio bridge listen loop. Each operator message arriving from the studio chat panel becomes a normal turn — read any referenced context, run whatever tools the request needs, send a final prose response, then re-enter the await.

### Prerequisite

The studio's `/mcp` endpoint must be registered as an MCP server in the operator's Claude Code config. The two tools `await_studio_message` and `send_studio_response` MUST be available in the current session. If either tool is missing, surface this error and stop:

> The studio bridge MCP server is not registered. See the `deskwork-studio` README for the MCP client snippet to add to `.claude/settings.json` or `.mcp.json`.

The project's `.deskwork/config.json` should also have `studioBridge.enabled: true` (the SessionStart hook depends on this). The skill itself does NOT re-check the flag — the operator is invoking it explicitly.

### Idle timeout

Read `<projectRoot>/.deskwork/config.json` once at start. Use `studioBridge.idleTimeout` if set (positive integer seconds); otherwise default to **600** (10 minutes). Pass this value as `timeoutSeconds` on every `await_studio_message` call. Do not refresh the config mid-loop.

### Loop

1. **Announce.** Send one prose message so the chat panel shows the agent is alive AND identifies which Claude Code session has claimed the bridge. Operators commonly run multiple CC sessions (one per worktree) — the prose should name this one:

   `send_studio_response({ kind: 'prose', text: "Listening from <session-id>. Type a message and I'll handle it." })`

   Substitute `<session-id>` with whatever stable identifier this CC session exposes (env var, MCP handshake metadata, etc.). If no stable identifier is available, prefer the form `"Listening from this Claude Code session. Type a message and I'll handle it."` over a generic message — the operator needs to know WHICH agent claimed the bridge, not just that A bridge is connected.

2. **Await.** Call `await_studio_message({ timeoutSeconds: <idleTimeout> })`.

3. **Branch on the result:**

   - **`{ received: false, message: null }`** (timeout): re-enter the await immediately. The operator simply hasn't sent anything yet. Do NOT report the timeout to the chat panel.

   - **`{ received: true, message: { seq, ts, role: 'operator', text, contextRef? } }`**: process this as a normal operator turn:
     - If `contextRef` is set, optionally `Read` the file or resolve the entry it references (e.g. an entry UUID — translate via `.deskwork/entries/<uuid>.json`). Trivial reads do NOT need a tool-use card; they're a UX courtesy, not a contract.
     - Process `text` as a normal operator turn. Use the full tool set (Read, Edit, Write, Bash, Grep, Glob, etc.).
     - **For each non-trivial tool call** (anything with side effects OR taking more than a fraction of a second — Edit, Write, Bash, long Reads, MCP calls into other servers): wrap with tool-use cards:
       - BEFORE the tool: `send_studio_response({ kind: 'tool-use', tool: '<name>', args: <args>, status: 'starting' })`
       - AFTER the tool succeeds: `send_studio_response({ kind: 'tool-use', tool: '<name>', args: <args>, status: 'done', result: <result> })`
       - If the tool errored: `send_studio_response({ kind: 'tool-use', tool: '<name>', args: <args>, status: 'error', result: <error message> })`
     - When all tool calls are complete and a final response is composed, send the prose:
       `send_studio_response({ kind: 'prose', text: <final response> })`
     - Re-enter the await.

4. **Always re-enter `await_studio_message` after responding.** The loop is the contract; do not stop after one message.

### Terminal-side activity

If the operator types at the terminal mid-await, Claude Code's runtime interrupts the in-flight tool call. Handle the terminal turn as a normal Claude Code interaction (respond at the terminal). When the terminal turn finishes, re-enter `await_studio_message` to resume listening on the bridge.

### Stop conditions

Exit the loop (do NOT re-enter `await_studio_message`) only when one of these happens, listed in order of preference:

1. **Operator interrupts at the terminal (Ctrl-C / ESC).** This is the deterministic v1 exit. Claude Code's runtime delivers the interrupt to the agent; the in-flight `await_studio_message` tool call cancels. Treat this as "exit gracefully": send a final prose status via `send_studio_response({ kind: 'prose', text: 'Listen loop ended.' })`, then exit without re-entering the await.

2. **MCP connection closes** — the bridge is torn down or the studio process stops. `await_studio_message` rejects with an abort/disconnect-shaped error. Per project rule "no fallbacks", surface this explicitly:
   > Studio bridge disconnected. Listen loop ended.
   Then exit the loop.

3. **Soft intent recognition (fallback).** If the operator types something at the terminal whose intent is clearly "stop listening" (e.g. "stop listening", "exit listen mode", "end the bridge"), recognize the intent and exit. This is a soft signal — prefer Ctrl-C as the canonical exit; this branch exists for cases where Ctrl-C isn't natural (e.g. the agent is mid-compose on a long response).

A `/deskwork:stop-listening` slash command is intentionally NOT shipped in v1. Ctrl-C is the deterministic exit.

### Tool-use cards: courtesy, not contract

Tool-use cards exist so the chat panel renders progress as the agent works. They are a UX courtesy. Do not burn a `send_studio_response` round-trip on a trivial Read of a small file — the prose response will summarize what was read. Reserve tool-use cards for visibly-running operations: Bash commands, Edits/Writes, long Reads, multi-step pipelines, MCP calls into other servers.
