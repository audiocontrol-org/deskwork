## Feature: studio-bridge

A control channel between the deskwork-studio web UI and the operator's locally-running Claude Code session, so operator commands (skill invocations, git operations, prescribed actions) can be dispatched from a phone or iPad without resorting to a terminal. Implemented as a single-process consolidation: studio gains a loopback-only MCP endpoint alongside its existing HTTP routes, plus a chat panel in the web UI.

**Status:** Exploratory. This feature lives on its own branch (`feature/studio-bridge`) and worktree (`~/work/deskwork-work/studio-bridge/`). Not folded into the deskwork plugins until Phase 8 validates that the bridge works in real use.

### Documents

| File | Purpose |
|---|---|
| [`design.md`](./design.md) | Full architecture, components, data flow, error handling, testing strategy. The brainstorming-converged design spec; read first. |
| [`prd.md`](./prd.md) | Product framing: problem, solution, acceptance criteria, scope, risks, success criteria for the experiment. |
| [`workplan.md`](./workplan.md) | 8-phase implementation breakdown with tasks + acceptance criteria. |

### Phase Status

| Phase | Description | Status |
|---|---|---|
| 1 | Server-side bridge primitives (queue, persistence, types) | Done — `b1de288`, `12ced39` |
| 2 | HTTP routes (`/api/chat/*`) | Done — `4c63714`, `aae8c68`, `6cb94bf` |
| 3 | MCP server endpoint + loopback guard | Done — `69c04c0`, `9d4ba26` |
| 4 | Studio chat panel UI (docked + full-page) | Done — `890d56d`, `f8f4ce1` |
| 5 | Affordance routing helper + decision-strip integration | Done — `912a892`, `13803f3` |
| 6 | `/deskwork:listen` skill + SessionStart hook + config schema | Done — `8b58f95`, `06ab08f` |
| 7 | Documentation + adopter wiring (MCP client config example) | Done — `76a084f` |
| 8 | Local end-to-end smoke (validation gate) | Automated smoke landed (this commit); manual smoke checklist below — operator-driven |

### Worktree

```
~/work/deskwork-work/studio-bridge/   # feature/studio-bridge branch
```

### Branch lifecycle

- **If Phase 8 succeeds:** integration PR to mainline that folds the bridge into `@deskwork/studio` + `plugins/deskwork-studio` + `plugins/deskwork`, ships in the next deskwork release.
- **If Phase 8 fails:** branch is preserved for reference. Document the failure mode in this README + DEVELOPMENT-NOTES.md. Explore an alternative design (file-watch IPC fallback, or revisit the agent-host model from the brainstorming session).

### Key Links

- Brainstorming session: archived in the conversation that produced [`design.md`](./design.md) (commit `ff6dc1b` originally on `feature/deskwork-plugin`, moved here on branch creation).
- Motivating use case: `writingcontrol.org` editorial collection (creative literary writing on phone/iPad).
- THESIS alignment: see `THESIS.md` at repo root; this design is consistent with all three consequences (see PRD § "Architectural alignment" in [`design.md`](./design.md)).

### Not yet decided

- Whether `/deskwork:stop-listening` ships in v1 or remains deferred (current plan: deferred; cancel via terminal Ctrl-C).
- MCP transport choice details (HTTP streamable vs SSE) — settled in Phase 3.
- Override seam shape for per-collection chat-panel chrome — explicitly deferred per the design.

### Phase 8 — automated smoke (`scripts/smoke-bridge.sh`)

Local-only, run by hand against the workspace studio. Per project rule (`.claude/rules/agent-discipline.md` *"No test infrastructure in CI"*), this script is NOT wired into CI.

```bash
bash scripts/smoke-bridge.sh
```

What it does:

1. mktemp-d's a fixture project root with `.deskwork/config.json` (one site + `studioBridge.enabled = true`).
2. Boots the workspace studio (`node_modules/.bin/deskwork-studio`) bound to `--host 0.0.0.0` on port `47398` (override via `SMOKE_PORT=...`) so the loopback-guard can be exercised from a non-loopback peer.
3. Waits for the listening banner; aborts after `STUDIO_BOOT_TIMEOUT_S` (default 30s) if the studio doesn't come up.
4. Runs the assertions:
   - **A1** `GET /api/chat/state` → `{"mcpConnected":false,"listenModeOn":false,"awaitingMessage":false}`
   - **A2** `POST /api/chat/send` (bridge offline) → 503 with `error: "bridge-offline"`
   - **A3** `POST /mcp` initialize from loopback → 200 with `event: message` carrying the MCP server-info payload identifying as `deskwork-studio-bridge`
   - **A4** `GET /mcp` from loopback → 400 `session-required` (documented protocol behavior — confirms a loopback peer reaches the MCP handler)
   - **A5** `POST /mcp` from a detected non-loopback IP → 403 `loopback-only`. **Skipped** when the host has no non-loopback IPv4 (e.g. air-gapped runner). When skipped, the operator must verify the 403 path via the manual checklist below.
5. Tears down the studio + tmp dir on success or failure (`trap`). Set `KEEP_TMP=1` to preserve the fixture for inspection.

Pre-flight requirements:

- `npm install` must have run (so `node_modules/.bin/deskwork-studio` exists).
- `node_modules/.bin/deskwork-studio` must dereference to a workspace build that includes the bridge (the studio package's `dist/` must be current — `npm run build --workspace @deskwork/studio` if needed).
- The `SMOKE_PORT` (default `47398`) must be free.

### Phase 8 — manual smoke checklist (operator-driven)

The bridge's lived experience can't be automated: a phone over Tailscale, a desktop CC running `/deskwork:listen`, real entries in a real worktree. The script above covers HTTP-shape assertions only. Everything else lives here for the operator to walk through.

**Test setup**

1. From this worktree's root, run `npm install` and `npm run build --workspaces` once if anything is stale.
2. Boot the workspace studio against a real worktree (e.g. writingcontrol):
   ```bash
   node_modules/.bin/deskwork-studio --project-root ~/work/writingcontrol.org
   ```
   Default networking auto-detects Tailscale and binds to loopback + tailnet. Note the magic-DNS URL the banner prints — that's what the phone hits.
3. Open Claude Code in a desktop terminal whose working directory is the same worktree, with the workspace plugin loaded:
   ```bash
   claude --plugin-dir plugins/deskwork
   ```
4. From that CC session, dispatch `/deskwork:listen`. The agent should call `await_studio_message` and block.

**Checklist** — fill in after walking each item against the live surface. Don't pre-check anything.

| # | Item | What to look for | Status | Notes |
|---|---|---|---|---|
| M1 | Phone navigates to `/dev/chat` over Tailscale magic-DNS | Page renders without 404. Chat panel mounts. Bridge-state header reads "live" (or equivalent). | | |
| M2 | Free-form message round-trip from phone | Type "what's in the calendar?" and Send. Agent receives via `await_studio_message`, emits tool-use cards as it works, and final prose lands in the panel. | | |
| M3 | Affordance pre-fill on entry-review page | On the phone, navigate to `/dev/editorial-review/entry/<uuid>` for any real entry. Click Approve. Chat input pre-fills with `/deskwork:approve <slug>`. Hit Send; verify CC receives + executes. | | |
| M4 | Operator-text durability across refresh | Type a draft (don't send). Refresh the page. Draft restores from localStorage. | | |
| M5 | History replay on reconnect | Send a few messages. Close the chat panel tab. Reopen. Earlier turns render via `/api/chat/history`. SSE catches up to live. | | |
| M6 | Single-agent invariant | In a second terminal, `claude --plugin-dir plugins/deskwork` and try `/deskwork:listen`. The second `await_studio_message` call should fail with the bridge-busy / single-agent error. The original CC session keeps working. | | |
| M7 | Disconnect cleanup | In the desktop CC, `Ctrl-C` to kill the session (or close the terminal). The chat panel header flips to bridge-offline within ~1s. | | |
| M8 | Reconnect after Ctrl-C | Restart `claude --plugin-dir plugins/deskwork` and re-run `/deskwork:listen`. Panel header flips back to live; messages start flowing again. | | |
| M9 | Terminal-side interrupt mid-await | While CC is in `await_studio_message`, type at the terminal. Verify CC processes the terminal turn, responds, and re-enters listen. Send a phone message after — verify the loop is still healthy. | | |
| M10 | Non-loopback `/mcp` 403 (manual fallback) | If `scripts/smoke-bridge.sh` SKIPPED A5 (no non-loopback IP), reproduce by curling `/mcp` from a Tailscale peer or a second machine: `curl -X POST http://<tailnet-ip>:47321/mcp -H 'content-type: application/json' -d '{"jsonrpc":"2.0",...}'` → expect HTTP 403 with `loopback-only`. | | |

**UX defects to look for** (note any in the table or as a separate finding)

- Does the chat panel render readably on a small phone screen? (font sizes, line lengths, panel chrome doesn't crowd the input)
- Are tool-use cards comprehensible without expanding? (tool name visible, key arg visible, status visible)
- Does the input area work with the on-screen keyboard? (focus management, send button reachable, no zoom-to-input regression)
- Race conditions on rapid send/state changes? (multiple sends in quick succession; sending while bridge is reconnecting; toggling listen mode mid-send)
- Bridge-state transitions: does the panel header change immediately on reconnect/disconnect, or does it lag visibly?
- localStorage draft survives a hard kill of the browser tab (not just refresh)?
- Does the `/dev/chat` full-page surface look OK in landscape on iPad?

### Phase 8 outcomes (filled in when reached)

_The automated smoke (`scripts/smoke-bridge.sh`) lands with this commit and passes locally. Manual checklist above is the operator's to walk through; populate the Status column as items are exercised. Findings — what worked, what didn't, outstanding issues — get written up below + as GitHub issues for anything requiring engineering work._

_Final recommendation (integrate / iterate / abandon) is captured here after the manual walk completes._
