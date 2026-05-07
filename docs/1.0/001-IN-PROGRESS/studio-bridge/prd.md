---
deskwork:
  id: 5c456674-4dcf-4d80-85e9-08389730ad67
title: "PRD: studio-bridge"
date: 2026-05-06
author: oletizi
---

## PRD: studio-bridge

**Status:** Exploratory. This feature lives on its own branch (`feature/studio-bridge`) and worktree. It is NOT folded into the deskwork plugins until the bridge proves itself out in real use. If the experiment fails, the branch is deleted; if it succeeds, the work is integrated into `@deskwork/studio` and `plugins/deskwork-studio` via a normal PR.

### Problem Statement

The deskwork-studio web UI lets the operator review, annotate, and edit a content collection from any device on the operator's tailnet — including a phone or iPad. But every command the operator wants the agent to run (skill invocations like `/deskwork:approve`, git operations, `deskwork ingest`, etc.) requires the operator to be at a terminal: the studio's existing affordances copy slash commands to the clipboard, and the operator pastes them into Claude Code in a terminal session. On a phone, that flow is broken — there's no terminal to paste into.

The motivating concrete use case is `writingcontrol.org`, an editorial collection used for creative literary writing (character studies, chapter notes, story ideas). The operator works on this collection from a phone or iPad while away from the desk, drafting and editing content via the studio's existing edit interfaces. They cannot continue the session if they need the agent to run anything — they have to wait until they're back at a desk.

### Solution

Add a control channel between the deskwork-studio web UI and the operator's locally-running Claude Code session. The studio gains a chat panel (and a full-page chat surface) that lets the operator dispatch commands to the agent — via free-form text, or via the studio's existing affordances which now pre-fill the chat input when the bridge is live. The agent's responses (tool-use events + final prose) stream back into the chat panel.

The bridge is implemented as a single-process consolidation: `@deskwork/studio` already runs a long-lived Hono server; it gains an MCP server endpoint at `/mcp` (loopback-only) alongside its existing HTTP routes. Two MCP tools (`await_studio_message`, `send_studio_response`) provide the agent's view of the queue. Operator messages flow browser → HTTP → in-process queue → MCP `await` → agent. Agent responses flow agent → MCP `send` → in-process fanout → SSE → browser.

The full design is captured in [`design.md`](./design.md) — read that first before reading the workplan.

### Acceptance Criteria

- The studio process serves an MCP endpoint at `/mcp` that is reachable only from loopback. Non-loopback requests return 403.
- Two MCP tools are exposed: `await_studio_message(timeout)` and `send_studio_response(payload)`. Behavior matches the design's queue contract.
- The studio exposes four new HTTP routes: `POST /api/chat/send`, `GET /api/chat/stream` (SSE), `GET /api/chat/state`, `GET /api/chat/history`. Routes follow the design's request/response shapes.
- The studio's web UI exposes a chat panel — both as a docked panel mounted on existing pages (review, scrapbook, dashboard) and as a full-page route at `/dev/chat`. Tool-use events render as compact, expandable cards.
- A new `/deskwork:listen` skill drops the agent into the listen loop; a SessionStart hook + `studioBridge.enabled` config flag dispatches the skill automatically when set.
- The studio's existing decision-strip / induct affordances pre-fill the chat input (when the bridge is live) instead of clipboard-copying. Bridge-offline behavior is unchanged (clipboard fallback).
- Operator messages and agent responses persist to `<worktree>/.deskwork/chat-log/<YYYY-MM-DD>.jsonl` with monotonic `seq` + `ts` per row. Browser reconnection replays history via `/api/chat/history`.
- `POST /api/chat/send` returns `503 Bridge Offline` when no agent is connected or no agent has entered listen mode. Browsers disable Send + buffer drafts in localStorage.
- A second concurrent MCP connection on the same worktree is rejected with `409 Conflict`.
- All new tests (unit + integration) pass. Smoke script extended to verify MCP endpoint + loopback guard + 503 behavior. Existing tests pass unchanged.

### Out of Scope

- **Document save / scrapbook upload / margin-note APIs.** The bridge is a control channel only. Existing studio mutation routes are unchanged.
- **Token / per-action confirms (auth beyond Tailscale).** v1 inherits the studio's existing tailnet-only auth model. Future hardening if a real adopter on a shared tailnet asks.
- **Override seams (per-collection chat-panel chrome, custom prompts).** Default plugin behavior only in v1; thesis Consequence 3 override seams slot in later via the existing `<projectRoot>/.deskwork/templates/` resolver.
- **Multi-device coherence beyond same-fanout.** Each connected browser gets the same SSE stream; no per-device labels or routing in v1.
- **Cross-worktree bridge browsing.** Each worktree's studio is independent; v1 doesn't aggregate across worktrees.
- **Voice input.** Out of v1 (likely a thin client wrapper if it lands).
- **Marketplace publishing.** This feature is exploratory. If it works out, v0.17.0 (or whatever's next at the time) integrates it into the published `@deskwork/studio`. Until then it stays on the feature branch.

### Technical Approach

The full architecture, components list, data flow, error handling, and test strategy are captured in [`design.md`](./design.md). At the highest level:

- **Single-process consolidation.** Studio's existing Hono app gains the MCP endpoint and four new HTTP routes. No separate daemon.
- **Network split for security.** Web routes bind to Tailscale + loopback (existing model); MCP routes bind to loopback only.
- **Listen loop is the steady state.** Agent enters via `/deskwork:listen` (manual) or SessionStart hook (config-driven); terminal-side typing is treated as a normal CC turn that the agent handles, then re-enters await.
- **Pessimistic on bridge failure.** No optimistic enqueue when bridge is down; `503` immediately. Browser buffers unsent text in localStorage.
- **Filesystem + git as the durability story.** Append-only JSONL log per day under `.deskwork/chat-log/`; corruption detected at load via seq/ts gap scan; no reassembly heroics.

### Risks + Open Questions

- **MCP protocol fit.** The two-tool design (`await_studio_message`, `send_studio_response`) treats MCP as a generic IPC channel. Some MCP transports may not handle long-blocking tool calls cleanly. Mitigation: HTTP transport with appropriate timeout configuration; fall back to polling-style if blocking proves fragile.
- **Conversation context bloat.** Long-running listen mode + studio chat conversations grow the CC session's context steadily. CC's own compaction handles this, but the latency of compaction may bite mid-listen-loop. Mitigation: surface this in the listen-skill prose; operator can `/clear` if desired.
- **Single-agent invariant feels right but limits use.** What if the operator wants to run a CC session AND the studio chat from the same desktop simultaneously? The 409 on second connection is correct per the design but might frustrate. Verify in real use.
- **Phone UX of compact tool-use cards.** Mobile rendering quality of the cards (especially when tool output is large) is hard to predict from desktop testing. Real device testing is part of the smoke pass.
- **Listen-skill robustness across CC versions.** The skill prose tells the agent to loop; CC's own behavior on long tool calls (especially under compaction) determines whether the loop stays robust. Surfaces during smoke.

### Success Criteria for the Experiment

The experiment is "successful" if:

1. The operator can use the studio chat from a phone (over Tailscale) for at least one full creative-writing session on writingcontrol.org without falling back to a terminal.
2. Affordance-routed commands (Approve, Iterate, etc.) work end-to-end via the chat panel.
3. The operator's text input is durable across phone reconnects, browser refreshes, and bridge offline periods.
4. Tool-use cards render comprehensibly on a phone screen.
5. The listen loop survives at least one terminal-side interruption + auto re-enter without operator intervention.

If those check, the next step is integration: review against `THESIS.md` consequences, write up an integration PR that folds the bridge code into `@deskwork/studio` mainline + `plugins/deskwork-studio` shell + `plugins/deskwork/skills/`, and ship in the next deskwork release.

If they don't check — typically because the MCP-via-studio mechanism turns out to be fragile, or the phone UX falls short — the branch is preserved for reference and we explore an alternative shape (file-watch IPC fallback, or revisiting the agent-host model from the brainstorming session).

### Implementation Phases

See [`workplan.md`](./workplan.md) for the full phase breakdown with tasks and acceptance criteria.

At a high level:
1. Server-side bridge primitives (queue, persistence, types)
2. HTTP routes (chat send, stream, state, history)
3. MCP server endpoint + loopback guard
4. Studio chat panel UI (docked + full-page)
5. Affordance routing helper + decision-strip integration
6. Listen skill + SessionStart hook + config schema
7. Documentation + adopter wiring (MCP client config example)
8. Local end-to-end smoke (against writingcontrol.org from a real phone)
