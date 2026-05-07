## Workplan: studio-bridge

Implementation tracking for the studio ↔ Claude Code bridge feature. The PRD is [`prd.md`](./prd.md); the architecture and contracts are in [`design.md`](./design.md). This workplan breaks the design into 8 phases with deliverables + tasks + acceptance criteria.

This feature is **exploratory**. Phases 1–7 are the build; Phase 8 is the validation gate. If Phase 8 surfaces show-stoppers, the experiment ends without merging into mainline. If Phase 8 succeeds, an integration PR folds the work into `@deskwork/studio` + `plugins/deskwork-studio` + `plugins/deskwork`.

---

### Phase 1: Server-side bridge primitives

**Deliverable:** In-process queue + persistence + shared type contracts. No HTTP, no MCP, no UI yet — pure plumbing with tests.

Tasks:

- [ ] Create `packages/studio/src/bridge/types.ts` — shared contracts:
  - `OperatorMessage` ({ seq, ts, role: 'operator', text, contextRef? })
  - `AgentEvent` (discriminated union: `{ kind: 'tool-use', tool, args, result }` | `{ kind: 'prose', text }`)
  - `BridgeState` ({ mcpConnected, listenModeOn, awaitingMessage })
  - `ChatLogRow` (union of OperatorMessage + AgentEvent + meta rows)
- [ ] Create `packages/studio/src/bridge/queue.ts` — single-class `BridgeQueue`:
  - `enqueueOperatorMessage(text, contextRef?): OperatorMessage` — assigns `{ seq, ts }`, appends to inbox, resolves any pending `await`
  - `awaitNextOperatorMessage(timeoutMs): Promise<OperatorMessage | null>` — promise-based, with timeout
  - `subscribe(callback): unsubscribe` — multi-subscriber SSE fanout for agent events
  - `publishAgentEvent(event): void` — fans out to all subscribers
  - `currentState(): BridgeState` — observable; flips on connect/disconnect/listenModeOn changes
  - `setMcpConnected(b)`, `setListenModeOn(b)`, `setAwaitingMessage(b)` — state mutators called from MCP layer (Phase 3)
- [ ] Create `packages/studio/src/bridge/persistence.ts` — JSONL log:
  - `ChatLog` class with `append(row)`, `loadHistory(sinceSeq?, limit?)`, `rotateIfNewDay()`
  - File path: `<projectRoot>/.deskwork/chat-log/<YYYY-MM-DD>.jsonl`
  - Atomic-rename on day rotation (write `<date>.jsonl.tmp-<pid>` → rename)
  - Per-message append uses `appendFile` with `{ flag: 'a' }`; no rename per message
  - Corruption detection at load: scan for seq gaps + reverse-ts pairs; emit `{ kind: 'corruption-marker', from, to }` events in the loaded stream
- [ ] Tests:
  - `packages/studio/test/bridge/queue.test.ts` — enqueue/await pairing; multi-subscriber fanout (3 subs, all get every event in order); `awaitNextOperatorMessage` resolves with message OR null on timeout; sequence-counter monotonicity; timestamp-monotonicity invariants
  - `packages/studio/test/bridge/persistence.test.ts` — append/replay; corruption detection (seeded gap → marker emitted); day rotation atomic-rename semantics

**Acceptance Criteria:**

- [ ] All new files under 300 lines; types.ts can be ~80
- [ ] Strict TypeScript, no `any`, no `as Type`, no `@ts-ignore`
- [ ] Composition over inheritance (queue is a class but no inheritance hierarchy; persistence is a class for the same reason)
- [ ] Vitest suite passes for all new tests
- [ ] No I/O outside `persistence.ts` (queue is pure in-memory)

**Notes:**

- Sequence number is per-day-file, not global. Resets to 0 at day rotation. Documented in design.md.
- `awaitNextOperatorMessage` should be cancellable — when the MCP connection drops, any pending await needs to reject. Implementation: AbortSignal threaded through.

---

### Phase 2: HTTP routes

**Deliverable:** Four new HTTP routes wired into the studio's existing Hono app, with tests.

Tasks:

- [ ] Create `packages/studio/src/bridge/routes.ts`:
  - `POST /api/chat/send` — validates body (text length ≤32KB, JSON shape); rejects 503 if `!state.mcpConnected || !state.listenModeOn`; on success: `queue.enqueueOperatorMessage`; persists to chat-log; returns 200 `{ seq, ts }`
  - `GET /api/chat/stream` — SSE; subscribes to `queue.subscribe(...)`; emits agent events as `{ id: <seq>, event: 'agent-event', data: <json> }`; supports `Last-Event-ID` resume by replaying log rows since that seq
  - `GET /api/chat/state` — returns current `BridgeState` JSON
  - `GET /api/chat/history?since=<seq>&limit=<n>` — replays chat-log JSONL rows; default limit 100
- [ ] Wire into `packages/studio/src/server.ts` `bootstrapStudio()`:
  - Construct `BridgeQueue` + `ChatLog` instances per project root
  - Mount routes
  - Pass instances to startup banner (banner doesn't print MCP URL until Phase 3)
- [ ] Tests:
  - `packages/studio/test/bridge/routes.test.ts` — each route's happy path and error shapes; 503 when bridge offline; 400 on malformed body; SSE Last-Event-ID resume
  - Reuse `BridgeQueue` from Phase 1 directly in tests (no MCP mock yet)

**Acceptance Criteria:**

- [ ] `routes.ts` under 200 lines
- [ ] All new tests pass
- [ ] Studio still boots cleanly (`node_modules/.bin/deskwork-studio --project-root <fixture>`); existing routes unchanged
- [ ] `/api/chat/state` returns `{ mcpConnected: false, listenModeOn: false, awaitingMessage: false }` initially (before MCP layer exists)

**Notes:**

- SSE library choice: Hono's built-in `streamSSE`. Don't reach for a third-party library.
- localStorage draft persistence is client-side (Phase 4); routes only know about server-side state.

---

### Phase 3: MCP server endpoint + loopback guard

**Deliverable:** `/mcp` endpoint with two MCP tools, loopback-only enforcement, single-agent invariant.

Tasks:

- [ ] Choose MCP transport: HTTP transport via `@modelcontextprotocol/sdk` (streamable HTTP). Document choice in `design.md` if it diverges.
- [ ] Add `@modelcontextprotocol/sdk` to `packages/studio/package.json` dependencies.
- [ ] Create `packages/studio/src/bridge/mcp-server.ts`:
  - Loopback guard middleware: 403 if `req.socket.remoteAddress` is not `127.0.0.1` / `::1` / `localhost`
  - Single-agent invariant: 409 if a second client tries to connect while one is already connected
  - Register tool `await_studio_message(timeoutSeconds)`:
    - Calls `queue.setAwaitingMessage(true)`, then `queue.awaitNextOperatorMessage(timeoutSeconds * 1000)`
    - Returns the OperatorMessage (or null on timeout); flips `awaitingMessage` back to false
  - Register tool `send_studio_response(payload)`:
    - Validates payload (≤1MB; structured shape: tool-use or prose)
    - Persists to chat-log via `ChatLog.append`
    - Publishes via `queue.publishAgentEvent`
  - On connect: `queue.setMcpConnected(true)`
  - On disconnect (channel close, error): `queue.setMcpConnected(false)`, `queue.setListenModeOn(false)`, abort any pending await
  - The tool's first call from the agent in any session implicitly flips `listenModeOn = true` — actually clearer: add a third no-op tool `enter_listen_mode()` the listen skill calls explicitly to flip the flag, OR have the listen skill instruct the agent to call `await_studio_message` and we infer listenModeOn from "first await call." **Decision for v1:** infer from first `await_studio_message` call. Flag flips to false only on disconnect. Simpler API surface.
- [ ] Wire `mcp-server.ts` into `bootstrapStudio()`:
  - Mount at `/mcp` on the same Hono app (loopback-bound; the binding split is a route guard, not a separate listener)
  - Print loopback URL in startup banner: `Bridge: http://localhost:<port>/mcp (loopback-only)`
- [ ] Tests:
  - `packages/studio/test/bridge/mcp-server.test.ts` — tool registration; `await_studio_message` blocks until enqueue, returns null on timeout; `send_studio_response` fans out to subscribers; loopback guard 403s for synthetic non-loopback requests; single-agent invariant 409s second connection
  - Integration: end-to-end via in-process MCP client + queue (no real CC needed)

**Acceptance Criteria:**

- [ ] `mcp-server.ts` under 300 lines
- [ ] MCP handshake succeeds for loopback client; 403 for non-loopback
- [ ] First `await_studio_message` call flips `listenModeOn` to true; observable via `/api/chat/state`
- [ ] Second concurrent connection attempt → 409
- [ ] Disconnect cleanly resets bridge state (mcpConnected=false, listenModeOn=false, awaitingMessage=false; pending await rejects)
- [ ] All tests pass

**Notes:**

- Don't use the MCP SDK's stdio transport — stdio assumes spawning the server as a subprocess; we want HTTP so the studio's existing process serves it.
- The single-agent invariant is enforced at connection time, not per-request. Track active connection count in `mcp-server.ts`.

---

### Phase 4: Studio chat panel UI

**Deliverable:** Docked panel + full-page chat surface in the studio web UI. Renders messages, tool-use cards, agent prose. Subscribes to SSE.

Tasks:

- [ ] Create `plugins/deskwork-studio/public/src/chat-renderer.ts`:
  - `renderMessage(row)` — renders an OperatorMessage, AgentEvent, or corruption marker
  - Tool-use rendering: compact card with tool name + key arg; expand-on-tap to show full content/diff/output
  - Prose rendering: markdown via existing studio markdown helper
  - Failure states: `result.kind === 'error'` → always full-rendered, red border
- [ ] Create `plugins/deskwork-studio/public/src/chat-panel.ts`:
  - Web component (or class-based vanilla TS; match existing studio code style)
  - Connects to `/api/chat/stream` (EventSource)
  - Loads history via `/api/chat/history` on mount
  - Polls/subscribes to `/api/chat/state` for bridge state
  - Renders header showing bridge state + connection status
  - Input area: text + Send button; disabled when bridge offline; localStorage draft buffering keyed on worktree path
  - Mobile breakpoint: docked → full-screen at viewport <600px
  - Public API: `mountInto(parentElement, options)`; options include initial `contextRef` from current page
- [ ] Create `plugins/deskwork-studio/public/src/chat-page.ts`:
  - Thin wrapper: imports `chat-panel.ts`, mounts it standalone in a full-page layout
  - No surrounding chrome (the panel IS the surface)
- [ ] Server-side route registration:
  - Add `GET /dev/chat` route in `packages/studio/src/server.ts` (or wherever page routes live) that serves the page shell calling `chat-page.ts`
  - Mount the docked panel on existing pages (review, scrapbook, dashboard) — small new initialization in those pages' bootstrap
- [ ] Manual smoke (no automated test for visual rendering):
  - Boot studio against a fixture worktree
  - Browse to `/dev/chat`
  - Visually verify the chat panel renders, accepts input, shows bridge-offline banner

**Acceptance Criteria:**

- [ ] `chat-panel.ts` under 300 lines
- [ ] `chat-renderer.ts` under 250 lines
- [ ] `chat-page.ts` under 100 lines
- [ ] Strict TypeScript; no `any`
- [ ] Visual smoke confirms: docked panel mounts on review surface; full-page route works; input disables when bridge offline; tool-use cards render compactly
- [ ] Mobile breakpoint switches to full-screen at <600px viewport (test via browser devtools responsive mode)

**Notes:**

- Existing studio uses vanilla TS + Hono (not React). Match that pattern. No new framework.
- Use the existing `clipboard.ts` `copyOrShowFallback` import path; no changes to that module yet (Phase 5).
- Don't write any "save my draft" feature — operator-text durability is via localStorage on the input field only.

---

### Phase 5: Affordance routing helper + decision-strip integration

**Deliverable:** Existing studio affordance buttons (Approve, Iterate, Reject, induct picker) become bridge-aware: pre-fill chat input when bridge live; clipboard fallback when offline.

Tasks:

- [ ] Create `plugins/deskwork-studio/public/src/affordance-routing.ts`:
  - `dispatchToAgent(command: string): Promise<void>` — checks bridge state via `/api/chat/state`; if `listenModeOn`, finds the chat-panel input element, pre-fills with `command`, focuses, scrolls into view; else falls through to existing `copyOrShowFallback`
  - Single helper used by both the docked panel's host pages and the full-page chat
- [ ] Update existing affordances:
  - `plugins/deskwork-studio/public/src/entry-review/decision.ts` — replace `copyOrShowFallback(command, ...)` calls with `dispatchToAgent(command)`
  - `plugins/deskwork-studio/public/src/editorial-review-client.ts` — same pattern (the older review surface still uses the same approve/iterate path)
  - Verify no other affordance call sites use the clipboard pattern; if found, update them too
- [ ] Tests:
  - `plugins/deskwork-studio/public/test/affordance-routing.test.ts` — dispatch with bridge live → pre-fill verified via DOM mock; dispatch with bridge offline → falls back to `copyOrShowFallback`
- [ ] Manual smoke: with bridge live, click Approve in entry-review; verify chat input gets the command and the operator can hit Send to dispatch

**Acceptance Criteria:**

- [ ] `affordance-routing.ts` under 100 lines
- [ ] All existing affordance code paths route through `dispatchToAgent`; no direct `copyOrShowFallback` calls remain in `entry-review/decision.ts` or `editorial-review-client.ts`
- [ ] Tests pass; existing tests still pass
- [ ] Manual smoke confirms: Approve button when bridge on → chat input filled, focused; Approve when bridge off → clipboard panel appears as before

**Notes:**

- `copyOrShowFallback` is NOT deleted. It's the offline fallback. The change is just where it's called from.
- The chat input element is identified by a stable class/id so `affordance-routing.ts` can find it without knowing whether the panel is docked or full-page.

---

### Phase 6: Listen skill + SessionStart hook + config schema

**Deliverable:** `/deskwork:listen` skill drops the agent into the listen loop. SessionStart hook + `studioBridge.enabled` config flag auto-engages.

Tasks:

- [ ] Extend `packages/core/src/config.ts` schema:
  - `studioBridge?: { enabled?: boolean; idleTimeout?: number }` on `DeskworkConfig`
  - `idleTimeout` defaults to 600 (seconds); used by the listen skill's `await_studio_message` timeout per iteration
  - Update `parseConfig` validation accordingly
  - Test: `packages/core/test/config.test.ts` — accepts both `studioBridge: { enabled: true }` and the field absent
- [ ] Create `plugins/deskwork/skills/listen/SKILL.md`:
  - Frontmatter: `name: listen`, `description: "Drop the agent into bridge listen mode — process operator messages from the studio chat panel as turns."`
  - Body prose:
    - Call `await_studio_message(timeout=<idleTimeout>)`. If null (timeout), call again. If a message arrives:
      - Optionally `Read` files referenced by `contextRef`
      - Process the message as a normal operator turn — use full tool set
      - Before each non-trivial tool call: `send_studio_response({ kind: 'tool-use', tool, args, status: 'starting' })`
      - After each non-trivial tool call: `send_studio_response({ kind: 'tool-use', tool, args, result })`
      - Compose final prose response; `send_studio_response({ kind: 'prose', text })`
      - Re-enter `await_studio_message`
    - If the operator types at the terminal mid-await: CC's interrupt cancels the tool. Process the terminal turn normally. After responding, re-enter `await_studio_message`.
    - Stop conditions: explicit `/deskwork:stop-listening` slash command (if added later) or operator's terminal-side ESC/Ctrl-C interrupt that the listen-skill prose recognizes as "exit gracefully."
  - The skill's prose must be readable by the agent and cause it to actually loop. The behavior is in the prose, not in any TS code.
- [ ] Create the SessionStart hook:
  - `plugins/deskwork/hooks/bridge-autostart.sh` (or wherever existing SessionStart hooks live; reuse existing harness)
  - Reads `<projectRoot>/.deskwork/config.json`; if `studioBridge?.enabled === true`, instructs the agent to dispatch `/deskwork:listen` once on session start
  - Wire into `plugins/deskwork/.claude-plugin/plugin.json` `hooks` configuration
- [ ] Tests:
  - Config schema test: accepts/rejects shapes correctly
  - Hook script test: given a fixture `.deskwork/config.json` with `enabled: true`, hook produces the expected agent-prompt instruction; with `enabled: false` or absent, produces no instruction

**Acceptance Criteria:**

- [ ] Config schema extension lands without breaking existing schema validation
- [ ] `SKILL.md` is well-formed; `claude --plugin-dir plugins/deskwork` shows `/deskwork:listen` in the skill list
- [ ] SessionStart hook fires only when `studioBridge.enabled = true` in the project config
- [ ] All tests pass

**Notes:**

- The listen skill's prose is what makes the loop work. Be precise about the instructions: "always re-enter await after responding," "treat terminal turns as normal interactions then re-enter," etc.
- Do NOT auto-engage the bridge if the config flag isn't set. The default for an existing deskwork project is bridge-off.
- `/deskwork:stop-listening` is deferred per the design's open-question section. v1 cancels via terminal Ctrl-C interrupting the await.

---

### Phase 7: Documentation + adopter wiring

**Deliverable:** README updates explaining the bridge, MCP client config example, dev-mode notes.

Tasks:

- [ ] Update `plugins/deskwork-studio/README.md`:
  - New section "Bridge mode (experimental)" with: what it is, when to use it, how to wire the MCP client (snippet for `.claude/settings.json` / `.mcp.json`)
  - Per-project enabling: `.deskwork/config.json` → `"studioBridge": { "enabled": true }`
  - The bridge is currently on a feature branch (`feature/studio-bridge`); adopter-facing language should reflect the experimental status
- [ ] Update `plugins/deskwork/README.md`:
  - Mention `/deskwork:listen` in the skill list with a note about its dependency on the studio bridge
- [ ] Update `DEVELOPMENT.md` (top-level):
  - Add a section describing the bridge dev loop: how to test the listen skill against a workspace-built studio
- [ ] Optional: update `docs/1.0/001-IN-PROGRESS/studio-bridge/README.md` (this feature's README) with phase-by-phase status table — done as part of session-end / phase progress

**Acceptance Criteria:**

- [ ] Adopter can read `plugins/deskwork-studio/README.md` and configure their MCP client correctly without further questions
- [ ] No version pinning in adopter docs (per `.claude/rules/documentation.md`)
- [ ] Experimental status clearly marked

**Notes:**

- This feature is on its own branch. The README updates land on the branch but only ship to the marketplace when the branch is merged.
- If we don't merge (experiment fails), the README updates die with the branch — that's fine.

---

### Phase 8: Local end-to-end smoke (validation gate)

**Deliverable:** Real smoke against writingcontrol.org from a real phone over Tailscale. Pass-or-fail decision on whether to integrate.

Tasks:

- [ ] Extend `scripts/smoke-marketplace.sh`:
  - Boot studio against fixture worktree
  - `curl http://localhost:<port>/mcp` → expect MCP handshake response
  - `curl http://<tailscale-IP>:<port>/mcp` → expect 403 (loopback guard)
  - `curl http://localhost:<port>/api/chat/state` → expect `{ mcpConnected: false, listenModeOn: false, awaitingMessage: false }`
  - `curl -X POST http://localhost:<port>/api/chat/send -d '{"text":"hi"}'` → expect 503 (bridge offline)
- [ ] Manual smoke against writingcontrol.org:
  - Boot the workspace studio: `node_modules/.bin/deskwork-studio --project-root ~/work/writingcontrol.org`
  - Open phone browser to the Tailscale magic-DNS URL (`/dev/chat`)
  - Run `/deskwork:listen` in the desktop CC
  - From the phone: send a free-form message ("what's in the calendar?")
  - From the phone: click Approve on a real entry; verify chat-input pre-fill; hit Send
  - Verify tool-use cards render comprehensibly on the phone
  - Background the desktop terminal; close the browser; reopen on phone — verify history replays
  - Type at the terminal mid-bridge — verify auto re-entry to listen
  - Disconnect (kill CC); verify browser shows bridge-offline banner; reconnect (restart CC) — verify bridge becomes live again
- [ ] Document findings in this feature's `README.md`:
  - What worked
  - What didn't
  - Outstanding issues (file as GitHub issues if they need engineering work)
  - Recommendation: integrate, iterate, or abandon

**Acceptance Criteria (for this PHASE — separate from project success):**

- [ ] Automated smoke checks pass
- [ ] Manual smoke walked through end-to-end at least once
- [ ] Findings written up in feature README

**Acceptance Criteria for the EXPERIMENT (PRD success criteria):**

- [ ] Real creative-writing session on writingcontrol from phone, no terminal fallback needed
- [ ] Affordance commands work via chat panel
- [ ] Operator-text durability holds across reconnects/refreshes
- [ ] Tool-use cards comprehensible on phone
- [ ] Listen loop survives terminal interrupt + auto re-enter

**Notes:**

- This phase is the gate. If acceptance criteria fail, the experiment ends.
- If criteria pass: write up an integration plan (not code) — what's the path from feature branch to mainline merge? Identify any thesis violations to fix before integration.
- The smoke tests added to `scripts/smoke-marketplace.sh` only land in mainline if we integrate. Until then, the smoke extensions live on the feature branch.

---

### Phase 9: Phone UX fixes (Phase-8 smoke findings)

**Origin.** Discovered during the Phase-8 manual smoke walk on 2026-05-07 — see [`phone-ux-findings.md`](./phone-ux-findings.md) for the full Playwright-driven analysis with screenshots. The chat-panel design that works on desktop is broken on phone: the docked panel auto-promotes to a fullscreen overlay at <600px width, has no stow affordance, and completely covers the entry-review surface — making M3 (affordance pre-fill on entry-review) impossible to exercise from a phone, which is the bridge's primary use case.

This phase is bridge-blocking for any real phone use and must land before the integration PR. Operator clarified the bridge is internal-use only for the foreseeable future, so the audience for this fix is the operator's own daily-driver phone usage, not external adopters.

**Deliverable.** Chat panel is usable from a phone in BOTH portrait and landscape. M3 (Approve / Iterate / Reject pre-fills the chat input) can be exercised end-to-end on a real iPhone. Subordinate fixes (F3–F5) land where cheap; expensive ones get filed as separate issues.

#### Phase 9a — F1: Stowable chat panel with bottom-edge tab on phone (BLOCKER fix)

**Pre-implementation gate.** Per `.claude/rules/affordance-placement.md`, write down answers to all three questions before any markup or CSS is touched. The answers below ARE the design contract for this sub-phase; deviation requires explicit operator approval.

1. **Existing pattern mirrored.** `.er-marginalia-tab` and `.er-outline-tab` (right- and left-edge stowed-drawer pull tabs) — `editorial-review.css:2192` and adjacent rules. Pattern: stowed-state affordance is a thin pull tab on the edge the component vanished into; visible-state affordance is a chevron stow button in the component's own chrome; both controls dispatch through the same client-side handler and share `aria-pressed`. The chat panel mirrors this, with the tab on the **bottom edge** because the panel rises from the bottom when expanded.

2. **Physical placement + why.** Stowed state: thin strip pinned at `position: fixed; bottom: 0; left: 0; right: 0`, ~36px tall, full viewport width, displaying the bridge-state chip ("Listening…", "bridge offline", etc.) on the left and a chevron-up affordance on the right. **Component-attached** to the chat panel — when the panel collapses it leaves this strip behind on the edge it vanished into. Expanded state: the existing `chat-panel--mobile-full` overlay, with a chevron-down stow control added to the chat panel header (sits in the panel's own `.chat-header` chrome, mirroring `.er-marginalia-stow`).

3. **Direct-manipulation principle.** Chevron-up on the stowed strip = "open from below"; chevron-down inside the expanded panel header = "close back to below." Operator's spatial mental model: chat slides up from the bottom edge, slides back down to it. The bridge-state chip in the stowed strip continuously affirms what the bridge is doing without forcing an expand. Position of the expand-affordance mirrors position of the stow-affordance (both on the right side of their respective container) so muscle memory transfers.

Tasks:

- [x] Add a `chat-panel--collapsed` CSS class as the default state at viewport <600px when `!fullPage` (entry-review pages). Class renders the panel as a 36px-tall fixed strip at `bottom: 0`, displaying the existing `.chat-state-chip` (left) + a new `.chat-collapse-toggle` button (right) carrying a chevron-up icon and `aria-label="Expand chat (Shift+C)"`.
- [x] In `chat-panel--full` / `chat-panel--mobile-full` state, render the existing `.chat-header` with a new `.chat-stow-toggle` button (chevron-down, `aria-label="Stow chat (Shift+C or Esc)"`) to the right of the state chip. Mirror the geometry of `.er-marginalia-stow`.
- [x] Add expand/stow handlers in `chat-panel.ts` that toggle the `--collapsed` class. Both controls dispatch through the same handler. Persist the user's last choice in `localStorage` keyed on worktree path so refreshes restore intent (default for first-ever visit on phone: collapsed).
- [x] Wire keyboard shortcut: `Shift+C` toggles, `Esc` from the expanded panel collapses (mirrors marginalia's `Shift+M` / outline's `O`/`Esc`).
- [x] When a new operator message arrives via `await_studio_message` AND the panel is in `--collapsed` state on the operator's own message round-trip, briefly flash the strip (subtle 1s pulse on the chip) — but do NOT auto-expand. Operator stays in control of layout.
- [x] When the bridge state changes (mcpConnected flips, listenModeOn flips), update the chip text inside the strip without expanding.
- [x] Tests: vitest unit on the toggle handler (collapsed → expanded → collapsed) covering default state, paired-affordance click toggle, Shift+C / Esc shortcuts, localStorage round-trip across simulated refresh, desktop / fullPage opt-out, chip dual-update on bridge-state, prefillInput auto-expand. Playwright assertions left as operator-side smoke (no Playwright tests in CI per project rules).

**Acceptance Criteria:**

- [x] At `<600px` width on entry-review pages, the chat panel defaults to a 36px bottom strip; entry body, decision strip, and all existing review surfaces are visible.
- [x] Tapping the strip's chevron-up expands the panel to fullscreen overlay; tapping the chevron-down in the expanded header collapses back.
- [ ] `Shift+C` and `Esc` keyboard shortcuts work on a real iPhone (test via Bluetooth keyboard) — operator-side verification post-release.
- [x] localStorage round-trips the collapsed/expanded state across refresh.
- [ ] M3 of the smoke checklist now passes from the phone: tap Approve → chat input pre-fills → tap Send → CC dispatches — operator-side verification post-release.
- [x] No regression on `/dev/chat` (full-page surface) — that surface ignores the collapsed/expanded flag.
- [x] No regression on desktop (>=600px) — docked panel renders as before.
- [x] Tests pass; vitest jsdom test added to `packages/studio/test/bridge/chat-panel.test.ts` (Playwright assertions are operator-side smoke, not CI tests, per project rules).

**Notes.**

- Bridge-state chip is the load-bearing UX of the collapsed strip — the operator must be able to glance at the bottom of any review page and confirm "the bridge is alive." Don't replace it with a generic "Chat" label.
- The `chat-mount.ts` already finds the right placeholder; this phase only changes the panel's own state-machine + CSS, not the mount path.

#### Phase 9b — F2: Docked panel sticky to viewport edge, not normal flow (HIGH)

**Deliverable.** At ≥600px on entry-review pages, the docked panel stays pinned to the viewport edge (right column on wide screens, sliver-tab on narrow) instead of being pushed below 38000px of article body. This makes landscape-phone and small-tablet usage viable.

Tasks:

- [ ] Audit the editorial-review page's grid template: identify why the panel is in normal flow at smaller-but-not-mobile widths. Check `editorial-review.css` for the grid breakpoint that establishes the right column.
- [ ] Add a `position: sticky; top: <header-height>` to the chat-panel column at the medium breakpoint (e.g. 600px ≤ width < 1024px) so the panel stays visible while the operator scrolls the article.
- [ ] Decide whether the medium breakpoint should ALSO use the collapsed/expanded model from 9a. Probable answer: yes — share the affordance pattern, just with the strip on the right edge instead of the bottom for ≥600px.
- [ ] Tests: Playwright at 844×390 (landscape phone) asserting panel `getBoundingClientRect().top` is within viewport (not 38628px down).

**Acceptance Criteria:**

- [ ] At 844×390, the chat panel is visible in the viewport without scrolling 30000px.
- [ ] No horizontal-overflow regression on the entry-review article column at this width.

#### Phase 9c — F3: Chat list bottom-aligns when sparse (LOW)

**Deliverable.** `/dev/chat` with a small message count (1–3 rows) doesn't render with 430px of dead vertical space between the messages and the input. Either bottom-align the chat list (latest message touches the input area), or render an empty-state hint that fills the gap with content.

Tasks:

- [ ] Add `display: flex; flex-direction: column; justify-content: flex-end` (or equivalent) to `.chat-scroll` when message count is small.
- [ ] Decide on visual treatment: bottom-aligned list vs. middle-aligned list with empty-state placeholder above. Default: bottom-aligned, latest-message-near-input.

**Acceptance Criteria:**

- [ ] At 390×844 with 1–3 messages, no >100px gap between the latest message bubble and the input area.

**Notes.** Low priority — file as a follow-up issue if Phase 9a/9b run long.

#### Phase 9d — F4: Top nav collapse on phone (LOW)

**Deliverable.** Studio's horizontal nav (`INDEX | DASHBOARD | CONTENT | SHORTFORM | MANUAL`) is no longer clipped at phone width.

Tasks:

- [ ] At <600px, collapse the nav to a hamburger menu OR overflow-scroll horizontally with a fade-edge indicator.

**Acceptance Criteria:**

- [ ] At 390×844, the nav is fully reachable (either by tap-to-open menu or horizontal scroll).

**Notes.** This is a project-wide nav fix, not bridge-specific. Probably belongs as its own GitHub issue rather than as a sub-phase of the bridge work; capture the issue link here when filed and let `/dw-lifecycle:implement` skip if scope-deferred.

#### Phase 9e — F5: Visual viewport / `100dvh` for soft keyboard (LOW)

**Deliverable.** When the soft keyboard pops up on a real phone, the chat input does not slide behind the keyboard.

Tasks:

- [ ] Replace `100vh` with `100dvh` (or equivalent) where the panel computes its height.
- [ ] Listen for `window.visualViewport.resize` and adjust the panel's bottom padding so the input stays above the keyboard.
- [ ] Manual smoke against a real iPhone (no Playwright proxy for soft-keyboard).

**Acceptance Criteria:**

- [ ] On a real iPhone, tapping the chat textarea does not hide the Send button under the keyboard.

**Notes.** Cannot Playwright-test this. The acceptance is operator-driven on a real phone.

#### Phase 9 — Dependencies + sequencing

| Sub-phase | Depends on | Priority | Mandatory for integration PR? |
|---|---|---|---|
| 9a | — | BLOCKER | yes |
| 9b | 9a (shares affordance pattern) | HIGH | yes |
| 9c | — | LOW | no — file as issue if punted |
| 9d | — | LOW | no — file as issue (project-wide nav fix) |
| 9e | 9a (shares panel-height code paths) | LOW | yes for daily phone use |

`/dw-lifecycle:implement` should walk 9a → 9b first; 9c–9e can be parallelized after.

#### Phase 9 — Test artifacts (already on disk)

- `phone-chat-page.png` — `/dev/chat` at 390×844 (showing the dead-space symptom).
- `phone-entry-review-default.png` — entry-review at 390×844 (the F1 blocker, panel covers everything).
- `phone-entry-review-landscape.png` — entry-review at 844×390 (the F2 high, panel buried at y=38628).
- `phone-dashboard.png` — `/dev` at 390×844 (the F4 nav clip).

These were captured during the diagnosis pass; new test artifacts (post-fix) should land beside them with `phone-*-fixed.png` filenames so the before/after delta is reviewable.

---

## Dependencies + parallelism

| Phase | Depends on |
|---|---|
| 1 | — |
| 2 | 1 |
| 3 | 1 (also needs MCP SDK added to deps) |
| 4 | 1 (can mock 2/3 in tests) |
| 5 | 4 |
| 6 | 1, 3 (skill prose references the MCP tools) |
| 7 | 4, 5, 6 |
| 8 | 1–7 |
| 9 | 8 (smoke-finding-driven) |

Parallelism windows:
- After Phase 1: Phases 2, 3, 4 can proceed concurrently
- Phase 6 can be drafted as soon as Phase 1 + 3 land
- Phase 5 must wait for Phase 4
- Phase 7 must wait for 4 + 5 + 6
- Phase 8 must wait for everything
- Phase 9 follows Phase 8 (it is the response to Phase 8's findings); 9a is required before 9b

---

## Out of scope (reaffirmed)

These are NOT in this workplan:

- Document save / scrapbook upload changes (existing routes unchanged)
- Token / per-action confirm auth
- Override seams for chat-panel chrome / per-collection prompts
- Multi-device labels
- Cross-worktree dashboard
- Voice input
- Marketplace publishing of bridge code (that's the integration-PR follow-up if Phase 8 succeeds)

---

## Notes on file size + style

Per project conventions:
- All new TypeScript files under 300–500 lines (target 250 for ergonomic limit)
- Strict types; no `any`, no `as Type`, no `@ts-ignore`
- `@/` import pattern in TypeScript
- Composition over inheritance — use classes for stateful holders (queue, log) but no inheritance
- Tests alongside implementation, not after
- Use Bun / Node test runners as already configured in the workspace
- Smoke scripts go in `scripts/`, not embedded in TS
