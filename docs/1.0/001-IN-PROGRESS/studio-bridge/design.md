---
deskwork:
  id: b2eefee7-5184-47a1-b9ee-fca894b721a5
---

# Studio ↔ Claude Code Bridge — Design Spec

Date: 2026-05-06
Status: Draft (brainstorming converged; awaiting writing-plans)
Target: deskwork-plugin feature, candidate Phase 36 (or successor) on `feature/deskwork-plugin`

## Summary

Add a control channel between the deskwork-studio web UI and the operator's locally-running Claude Code session. The channel lets the operator dispatch slash commands and free-form prescribed actions ("commit and push", "/deskwork:approve <slug>", "regenerate the calendar") to the agent from a phone or iPad — surfaces the agent's tool-use and prose responses back into a chat panel in the studio — without requiring the operator to be at a terminal. Implemented as a **single-process consolidation**: `@deskwork/studio` already runs a long-lived Hono server; it gains an MCP server endpoint alongside its existing HTTP routes, plus a chat panel in the web UI.

## Motivation

The motivating use case is `writingcontrol.org`, an editorial collection used for creative literary writing (character studies, chapter notes, story ideas). The operator works on this content from a phone or iPad while away from the desk. The studio's existing edit interfaces already work on mobile for *content* (textarea / source mode / scrapbook). What's missing is a way to ask the agent to run prescribed commands — skill invocations, git commits, deskwork verbs — without resorting to a terminal on a phone.

The current flow for those commands is clipboard-copy: studio buttons copy `/deskwork:<verb> <slug>` to the clipboard; the operator switches to Claude Code in a terminal and pastes. That flow assumes the operator is at a desk. On a phone, it's broken — there's no terminal to paste into.

This design provides a chat-shaped surface in the studio that routes operator commands to the same Claude Code session that's already running in the worktree, preserving conversation continuity. **Writing happens in the existing edit interfaces; the chat is a control channel only.**

## Architectural alignment

This design is consistent with the project's `THESIS.md`:

- **Consequence 1 (distribution keeps source agent-reachable):** unchanged. The bridge is part of `@deskwork/studio`, ships via npm + the marketplace, source open.
- **Consequence 2 (skills do the work; studio routes commands):** preserved. The studio's chat panel routes operator-initiated commands to the agent. The agent does the work using its own tools (Read, Edit, Bash, skill invocations). The studio does not run state-machine logic; the bridge is plumbing for operator-dispatched commands. Tool-use is rendered in the chat panel so the operator sees the agent's actions — the anti-pattern of "UI takes a multi-step action without surfacing what it's doing" is explicitly avoided.
- **Consequence 3 (operator extends via their agent):** the chat panel chrome, the listen-loop skill prose, and the per-collection bridge config are candidates for `<projectRoot>/.deskwork/` overrides. v1 ships sensible defaults; the override seam slots in later without re-architecture.

## Architecture

```
┌─────────────────────────────────────────┐
│  browser(s) — phone / iPad / desktop    │
└─────────────────┬───────────────────────┘
                  │  HTTPS over Tailscale magic-DNS
                  │  POST /api/chat/send         (operator → bridge)
                  │  GET  /api/chat/stream       (bridge → operator, SSE)
                  │  GET  /api/chat/state        (bridge connection state)
                  │  GET  /api/chat/history      (replay JSONL log)
                  ▼
┌──────────────────────────────────────────────┐
│              deskwork-studio                 │
│  ┌──────────────────────────────────────┐    │
│  │  in-process bridge queue             │    │
│  │   - inbox: operator messages         │    │
│  │   - SSE fanout: agent events         │    │
│  └──────────────────────────────────────┘    │
│            ▲                ▼                │
│  ┌──────────────────────────────────────┐    │
│  │  MCP server endpoint /mcp            │    │
│  │  Tools (loopback only):              │    │
│  │   - await_studio_message(timeout)    │    │
│  │   - send_studio_response(payload)    │    │
│  └──────────────────────────────────────┘    │
└─────────────────┬────────────────────────────┘
                  │  MCP over HTTP, loopback only
                  ▼
┌─────────────────────────────────────────┐
│       claude code (terminal)            │
│  agent in /deskwork:listen loop         │
│  full tool access in worktree           │
└─────────────────────────────────────────┘
```

**Network binding split (security):**

- Web routes (`/api/chat/*`, existing studio routes): bound to Tailscale + loopback. Operator on the tailnet from any device can dispatch commands. Same auth model as the rest of the studio.
- MCP route (`/mcp`): **loopback only**. Only the local Claude Code session can attach as the agent. A request from a non-loopback address returns 403. Without this split, anyone on the tailnet could in theory connect their own CC session to the studio's MCP endpoint and impersonate the agent.

**Listen-loop semantics:** the agent enters bridge mode via `/deskwork:listen` (manual) or a SessionStart hook (config-driven). It loops on `await_studio_message(timeout)`; each iteration receives an operator message, processes it with full tool access, emits tool-use events + a final prose response via `send_studio_response`, then re-enters the await. Terminal-side typing is treated as a normal CC turn that the agent handles, then the loop continues.

**`BridgeState` (observable to browsers via SSE):**

```
{
  mcpConnected:    boolean,  // an MCP client is currently connected to /mcp
  listenModeOn:    boolean,  // agent has entered listen mode and not cancelled it
                              // (true while busy processing; false only after /deskwork:stop or MCP drop)
  awaitingMessage: boolean,  // agent is currently blocked in await_studio_message right now
}
```

The two booleans `mcpConnected` and `listenModeOn` together mean "agent is available to receive operator messages." `awaitingMessage` is just useful for UX (browser shows different chrome for "agent ready" vs "agent currently processing your last message") — it's not a gate.

**Single-agent invariant per worktree:** at most one Claude Code session can have an MCP connection to the bridge at a time. A second MCP connection attempt is rejected with `409 Conflict`.

## Components

### Server-side — new files in `packages/studio/src/bridge/`

| File | Purpose |
|---|---|
| `queue.ts` | In-process bridge queue. Promise-based `enqueueOperatorMessage()` + `awaitNextOperatorMessage(timeoutMs)`; SSE-subscriber fanout for agent events. |
| `mcp-server.ts` | MCP server mounted at `/mcp`. Registers `await_studio_message` + `send_studio_response`. Loopback-only guard. Uses MCP SDK over HTTP transport. |
| `routes.ts` | Hono routes: `POST /api/chat/send`, `GET /api/chat/stream` (SSE), `GET /api/chat/state`, `GET /api/chat/history`. |
| `persistence.ts` | Append-only JSONL log at `<worktree>/.deskwork/chat-log/<YYYY-MM-DD>.jsonl`. Daily rotation via atomic-rename. |
| `types.ts` | Shared contracts: `OperatorMessage`, `AgentEvent` (tool-use vs prose), `BridgeState`. Imported by both server and client. |

### Client-side — new files in `plugins/deskwork-studio/public/src/`

| File | Purpose |
|---|---|
| `chat-panel.ts` | Docked panel component. Mounts on review/scrapbook/dashboard. Subscribes to `/api/chat/stream`. Mobile: full-screen on small viewports. |
| `chat-page.ts` | Full-page route at `/dev/chat`. Thin wrapper that mounts the panel standalone. |
| `chat-renderer.ts` | Renders agent events: tool-use as compact expandable cards; prose as markdown. Failures always fully rendered. |
| `affordance-routing.ts` | Bridge-aware helper: `dispatchToAgent(cmd)` → if bridge live, pre-fill chat input + focus + scroll into view; else fall back to existing `copyOrShowFallback`. Wraps the current clipboard path. |

### Skill + hook + config

| File | Purpose |
|---|---|
| `plugins/deskwork/skills/listen/SKILL.md` | `/deskwork:listen` skill. Prose instructs the agent: enter `await_studio_message` loop; process each message with full tool access; emit tool-use events and the final response via `send_studio_response`; loop until cancelled; terminal-side turns are normal interactions, the agent re-enters the loop after responding. |
| `plugins/deskwork/hooks/bridge-autostart.sh` | SessionStart hook. Reads `<projectRoot>/.deskwork/config.json` for `studioBridge.enabled`; if true, instructs the agent to enter listen mode automatically. |
| `packages/core/src/config.ts` | Schema extension: `studioBridge?: { enabled?: boolean; idleTimeout?: number }`. |

### Existing-file edits (not new files)

- `plugins/deskwork-studio/public/src/entry-review/decision.ts` — replaces direct `copyOrShowFallback` calls with `dispatchToAgent` (bridge-aware routing).
- `plugins/deskwork-studio/public/src/editorial-review-client.ts` — same.
- `packages/studio/src/server.ts` — wire the new bridge module into `bootstrapStudio()`; print MCP URL on startup banner alongside the web URLs.
- `plugins/deskwork-studio/README.md` — adopter-facing docs: how to add the studio MCP server to `.claude/settings.json` / `.mcp.json`.

## Data flow

### 1. Bridge startup

When `deskwork-studio` boots: HTTP routes ready on the configured port; MCP server ready at `/mcp` (loopback bind); bridge queue initialized empty; today's chat-log JSONL opened in append mode. Startup banner prints all reachable web URLs (loopback + Tailscale IP + magic-DNS hostname) and the loopback-only MCP URL.

The MCP endpoint exists from t=0; whether an agent has *connected* to it is a separate state captured in `BridgeState`.

### 2. Agent connects + enters listen mode

Operator's CC session resolves `mcpServers.deskwork-studio` from `.claude/settings.json` (or `.mcp.json`) and connects to `http://localhost:<port>/mcp`. The studio observes the MCP client connection; `BridgeState.mcpConnected` flips to `true`. SSE pushes the state change to all subscribed browsers; the docked panel header re-renders accordingly.

The operator runs `/deskwork:listen` — or a SessionStart hook fires it if `studioBridge.enabled = true` in `.deskwork/config.json`. The skill instructs the agent to call `await_studio_message(timeout=600s)`. `BridgeState.listenModeOn` flips to `true` (and stays true across processing); `awaitingMessage` flips to `true` only while the agent is currently inside the await call. SSE pushes the update.

### 3. Operator sends a message

Phone browser: operator types a command + taps Send. Browser POSTs to `/api/chat/send` with `{ text, contextRef? }`. Studio: validates, persists to today's JSONL with `{ seq, ts, role: 'operator', text, contextRef }`, enqueues to the bridge queue, returns 200. Browser optimistically renders the message + a spinner.

The pending `await_studio_message` tool call resolves; MCP returns the message text + contextRef to the agent. The agent processes the command — typically a sequence of tool calls (Read, Edit, Bash for `deskwork`/`git`, etc.) interleaved with `send_studio_response({ kind: 'tool-use', tool, args, result })` events. After the work is done, the agent calls `send_studio_response({ kind: 'prose', text })` with the final response and re-enters `await_studio_message` for the next iteration.

For each `send_studio_response` call, the studio appends to JSONL and fans out to all SSE subscribers. Browsers render tool-use cards (compact, expandable) inline as they arrive; the spinner clears when the prose response lands.

### 4. Affordance click (bridge-aware routing)

Operator viewing an entry in the studio taps the existing "Approve" button (or any other decision-strip / induct affordance). `dispatchToAgent("/deskwork:approve --site writingcontrol antagonist-margot")` runs:

- If `BridgeState.listenModeOn = true`: the command is pre-filled into the chat input area, focused, scrolled into view. The operator reviews the pre-filled text, hits Send. Now the message flows through path #3 above.
- If bridge is not live (`listenModeOn = false`): falls back to `copyOrShowFallback` (the current clipboard / manual-copy panel pattern), unchanged.

Operator confirmation is preserved either way — the affordance never auto-dispatches.

### 5. Browser reconnect

Browser opens or refreshes any page mounting the panel: `GET /api/chat/history?since=<bookmark>` returns recent N JSONL rows; `GET /api/chat/stream` subscribes for live events; `GET /api/chat/state` returns the current `BridgeState`. Browser renders recent history (most recent at the bottom), an infinite-scroll button at the top, the live SSE stream, and a header reflecting bridge state. SSE handles network blips via `Last-Event-ID`.

### 6. Bridge state changes

When the agent's CC session ends (operator quits, crash), the MCP connection drops. `BridgeState` flips to `{ mcpConnected: false, listenModeOn: false, awaitingMessage: false }`; SSE pushes the update. Browsers' affordances revert to clipboard fallback. When the operator restarts CC, MCP reconnects; once `/deskwork:listen` fires (manually or via the SessionStart hook), bridge state updates; affordances become bridge-aware again.

If the operator wants to leave listen mode without ending CC (rare — say, to shift focus to a different worktree-internal task), the listen skill should expose a sibling stop mechanism. v1 deferral: cancel via Ctrl-C / ESC at the terminal, which interrupts the await and the listen-loop prose treats the cancellation as a graceful exit (no auto re-enter). Future: a `/deskwork:stop-listening` skill if it's needed.

### 7. Terminal-side turn mid-bridge

The agent is blocked in `await_studio_message`. The operator types at the terminal — CC's interrupt cancels the tool call. The agent receives the operator's terminal message as a normal user turn, processes it (any tool calls render in CC's terminal display, *not* through `send_studio_response`), then per the listen-skill prose re-enters `await_studio_message`. Bridge stays live across the interaction.

Open detail for the listen skill prose: terminal-side turns are *not* mirrored into the chat log by default. The chat log shows only studio-initiated turns. If we want terminal-side mirroring later, the skill prose can opt in to call `send_studio_response({ kind: 'terminal-turn-mirror', ... })` opportunistically.

## Error handling

The design is **pessimistic** about bridge failure. The operator's first-class concern is not losing text they wrote; conversation reassembly is explicitly secondary because the chat-log JSONL is committed to git as part of `.deskwork/`.

- **Bridge offline → reject.** `POST /api/chat/send` returns `503 Bridge Offline` when `BridgeState.mcpConnected = false` OR `BridgeState.listenModeOn = false` (no agent connected, or agent connected but hasn't entered listen mode). The browser disables the Send button and shows the bridge-state banner. No optimistic enqueue, no drain-on-reconnect logic. Note: the agent being mid-processing (`awaitingMessage = false` but `listenModeOn = true`) does NOT trigger rejection — incoming messages queue normally and drain when the agent re-enters await. Rejection is only for "no agent at all."
- **Operator-text durability.** The browser stores the unsent input field contents in `localStorage` (per-worktree draft key) so closing the tab or reload doesn't lose typed-but-unsent text. Operator hits Send when bridge comes back.
- **Every message carries `{ seq, ts }`.** `seq` is a monotonic counter per chat-log file (resets at daily rotation); `ts` is unix-ms. Both are written to JSONL on every line. Corruption detection at history load = scan for sequence gaps OR pairs whose `ts` regresses.
- **No reassembly heroics.** On corruption: log a warning, render a "history may be incomplete from seq X–Y" marker in the panel, continue. The JSONL is in git; operator can `git log` / `git diff` if they need to recover anything specific.
- **Agent crash mid-processing.** No retry, no re-enqueue, no "no response timeout" reaction. If a message went to the agent and no response came back, that's visible in the chat ("agent processing…" with no terminal event). Operator can resend manually.
- **Concurrent CC sessions on the same worktree.** Reject the second MCP connection with `409 Conflict`. Single-agent invariant per worktree.
- **Disk-full / write fails.** `503` from `POST /api/chat/send`; input stays populated; operator decides what to do.
- **Hostile / malformed input.** `POST /api/chat/send` validates message length (≤32KB), JSON shape; rejects 400 otherwise. `send_studio_response` payloads >1MB are truncated at the response boundary with a `[truncated]` marker.

Trust model: filesystem + git is the durability story; the design carries no special integrity logic beyond the seq/ts gap detection.

## Out of scope

The bridge is a control channel only. Explicitly outside this work:

- The studio's existing source-mode editor → save endpoint. Operator edits document body, POSTs to the existing route, studio writes the file. Bridge does not see it.
- The studio's existing scrapbook upload routes.
- The studio's existing margin-note APIs.
- All other existing studio mutations (operator-initiated, not bridge-initiated).

The agent CAN still cause file writes via its own `Edit`/`Write` tool calls (e.g., the operator types in chat: "regenerate the calendar"; the agent runs `deskwork`, which writes `.deskwork/calendar.md`). Those writes happen through the agent's tools, not through the bridge. The chat panel renders them as tool-use cards so the operator sees them happening. The bridge itself is just the control channel.

`affordance-routing.ts` applies only to `/deskwork:<verb>` skill-routing buttons (the existing decision-strip + induct picker, plus future Publish at Final stage). Save / Cancel / source-mode toggle buttons in existing edit interfaces are unchanged.

## Testing

Per the project's testing rules: vitest unit tests + integration tests with on-disk fixtures + local-only smoke; nothing in CI beyond what's already there.

### Unit (vitest)

- **`bridge/queue.test.ts`** — single-producer/single-consumer FIFO; multi-subscriber SSE fanout (3 subscribers, all see every event in order); `awaitNextOperatorMessage(timeout)` resolves on enqueue or returns `null` on timeout; sequence-counter monotonicity; timestamp-monotonicity invariants.
- **`bridge/persistence.test.ts`** — append-only JSONL writes; replay returns rows in seq order; corruption detection (synthetic gap → warning event surfaced, scan continues); daily rotation + atomic-rename semantics; no rename mid-day on per-message append.
- **`bridge/mcp-server.test.ts`** — MCP tool registration; `await_studio_message` blocks on empty queue, resolves on enqueue; `send_studio_response` fans out to SSE subscribers; loopback-only guard 403s for non-loopback addresses.
- **`bridge/routes.test.ts`** — `/api/chat/send` validates payload (length cap, JSON shape, malformed rejection), returns 503 when bridge offline, returns 200 + persists when live; `/api/chat/state` shape; SSE stream reconnect with `Last-Event-ID`.
- **`affordance-routing.test.ts`** (client-side) — `dispatchToAgent` routes to chat-input pre-fill when bridge live; falls back to `copyOrShowFallback` when offline.

### Integration (vitest + fixture worktree)

- **End-to-end happy path:** boot studio against fixture worktree; simulate MCP client connecting + entering listen; POST `/api/chat/send`; assert MCP `await` returns the message; simulate `send_studio_response` from the MCP side; assert SSE delivers the response to a subscribed test client; assert chat-log JSONL contains both lines with monotonic seq.
- **Bridge offline rejection:** boot studio with no MCP client connected; POST `/api/chat/send`; assert 503 + nothing persisted to JSONL.
- **Loopback-only guard:** issue MCP request from non-loopback test client → 403; from loopback → success.
- **Single-agent invariant:** two simulated MCP clients try to connect; second gets 409.
- **History replay:** seed JSONL with N messages; boot; GET `/api/chat/history?since=<bookmark>`; returns expected rows in order.
- **Corruption detection:** seed JSONL with a synthetic seq gap; boot; history load surfaces the gap as a marker event in the response; doesn't crash.
- **Day rotation:** advance simulated clock past midnight UTC; next message appends to a new dated JSONL file with seq reset to 0; old file unchanged.

### Smoke (local, not CI)

Extend `scripts/smoke-marketplace.sh`:

- After studio boot, assert `curl http://localhost:<port>/mcp` returns a valid MCP handshake response.
- Assert `curl http://<tailscale-IP>:<port>/mcp` returns 403 (loopback-only guard).
- Assert `/api/chat/state` returns JSON with `{ mcpConnected: false, listenModeOn: false, awaitingMessage: false }` initially.
- Assert `POST /api/chat/send` returns 503 when no agent connected.

### Deliberately not tested

- Claude Code's MCP client behavior (out of our control; trust CC's own tests).
- The agent's prose responses to operator messages (non-deterministic; same rule that already excludes "model response to a SKILL.md prompt" per `.claude/rules/testing.md`).
- iPad / iPhone browser-specific rendering (visual; covered by manual smoke when shipping).
- Real network conditions (Tailscale flaps, cellular drops); covered by SSE's reconnect-with-Last-Event-ID logic which is already battle-tested.

## Decisions log

Decisions made during the brainstorming session that produced this spec, with rationale:

| Q | Decision | Why |
|---|---|---|
| Process model | Studio-as-MCP-server (single process; HTTP routes + MCP endpoint coexist) | Collapses the studio and bridge into one daemon; sidesteps file-IPC race conditions; uses MCP as the official extension seam. Operator's reframe: *"the studio server could also be the mcp server."* |
| Entry mode | Both: manual `/deskwork:listen` + config-flag SessionStart auto-on | Manual covers deskwork-dev case (default off); config flag covers writingcontrol case (always-on). Same skill code; flag just dispatches it from a hook. |
| Terminal interrupt model | Terminal input is a normal CC turn; bridge stays on; agent re-enters await loop after responding | Listen loop should be the steady state; not something the operator keeps re-engaging. |
| Tool-use visibility | Compact-card rendering with progressive disclosure | (i) violates thesis Consequence 2 (UI hides agent work); (iii) is overload on a phone screen; (ii) keeps the work visible while staying mobile-friendly. |
| Surface placement | Both: full-page route + docked panel | They share the same component; building both is barely more than one; they map to two real workflows (phone-only vs desk-with-side-panel). |
| Context-passing | Lightweight pointer (`[context: site=…, slug=…]`) for free-form messages | Heavy context front-loads tokens; no context is friction-heavy; affordance-generated commands already carry their context inline so the pointer is mostly a free-form-fallback. |
| Affordance routing | Hybrid: pre-fill chat input if bridge live, clipboard fallback if not. Always operator-confirmed (no auto-send). | Preserves the thesis-aligned "operator dispatches each step visibly" semantics; no auto-send; bridge-aware without changing the affordance's intent. |
| Persistence | Full history, scrollable, JSONL per-day at `<worktree>/.deskwork/chat-log/` | Multi-day creative writing flow needs continuity; cheap append-only log; lives in git as part of `.deskwork/`. |
| Generality | Build general from day one | Same contract regardless of collection; writingcontrol is the motivating case; a writingcontrol-only seam would be retrofit work later. |
| Auth (v1) | Tailscale boundary, no extra token | Same model as the rest of the studio; tool-use visibility provides audit; defer token / per-action confirms to v1+1. |
| Network split | Web routes Tailscale + loopback; MCP loopback only | Without this split, a tailnet-connected device could connect its own CC as the agent and impersonate; loopback-only on MCP forecloses that. |
| Failure mode | Pessimistic: reject when bridge offline; localStorage-buffer drafts; seq+ts gap detection at load; no reassembly | Operator's stated priority: don't lose what they wrote. Filesystem + git is the durability story. |
| Bridge scope | Control channel only — does not handle document save / scrapbook upload / margin-note APIs | These are operator-initiated mutations through existing studio routes. The bridge is for agent-talk, nothing else. |

## Open questions / future work

Not v1 blockers; flagged for later phases.

- **Override seams (thesis Consequence 3):** per-collection custom prompts in the chat panel header; per-collection chat-panel chrome (greeting, suggested commands); per-collection bridge-skill prose. Default to plugin defaults; allow `<projectRoot>/.deskwork/templates/chat-panel.ts` overrides via the existing override resolver.
- **Token / per-action auth (v1+1):** opt-in token requirement for `/api/chat/send` to harden against shared tailnets; per-action confirms for destructive commands (`git push --force`, `rm`, etc.).
- **Multi-device chat coherence:** two browsers (phone + iPad) connected; each sees the same fan-out. Currently no device labels; could add per-message device markers later.
- **Cross-worktree bridge browsing:** a single dashboard view of "all my worktrees' bridge states" if the operator runs multiple deskwork projects. Out of v1.
- **Voice input on phone:** browser speech-to-text → chat input. Likely a thin client wrapper, no server changes.
