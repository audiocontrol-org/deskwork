---
deskwork:
  id: 7f4a3e2b-1c8d-4f9a-b6e5-2d7c9a4f8b13
title: "Design addendum: Phase 10 — long-lived bridge sidecar"
date: 2026-05-07
author: oletizi
---

# Design addendum: Phase 10 — long-lived bridge sidecar

This addendum extends [`design.md`](./design.md). It does not replace it. The Phase-1 design's contracts (queue API, MCP tool surface, JSONL persistence, security split, single-agent invariant) all carry forward unchanged; Phase 10 changes only the **process boundary** they live behind.

## 1. Scope

This addendum decides the architectural contract for splitting the bridge surface out of the studio process: package shape, IPC mechanism, discovery descriptor schema + lifecycle, port allocation policy, chat-panel URL discovery, smoke-test shape, and THESIS alignment. It does NOT decide implementation specifics — file naming, exact function signatures, test fixture names, the precise reverse-proxy middleware composition, or the migration ordering of moves vs. re-exports. Those land in 10b/10c when the contract here gives them somewhere stable to land.

## 2. Audit: bridge surface vs studio surface

Every file under `packages/studio/src/` that's relevant to the split, plus the boot-orchestration touchpoints in `server.ts`. "Sidecar" = moves to `deskwork-bridge`'s home (per §3). "Studio" = stays where it is.

| File / location | Lines | Disposition | Note |
|---|---|---|---|
| `packages/studio/src/bridge/types.ts` | 1–55 | sidecar | Shared contracts. Browser code imports the same types — re-exported by studio for client-build path resolution; ownership moves. |
| `packages/studio/src/bridge/queue.ts` | 1–321 | sidecar | `BridgeQueue`. Pure in-memory, no I/O. Owns the seq counter + waiter + state. |
| `packages/studio/src/bridge/persistence.ts` | 1–50 (read; full file is the JSONL log) | sidecar | `ChatLog` writes to `<projectRoot>/.deskwork/chat-log/<YYYY-MM-DD>.jsonl`. |
| `packages/studio/src/bridge/routes.ts` | 1–50 (read) | sidecar | The four `/api/chat/*` routes. |
| `packages/studio/src/bridge/mcp-server.ts` | 1–60 (read) | sidecar | `/mcp` endpoint, loopback guard, single-agent tracker. |
| `packages/studio/src/bridge/mcp-tools.ts` | 1–50 (read) | sidecar | Tool handlers (`await_studio_message`, `send_studio_response`). |
| `packages/studio/src/server.ts` line 41–44 | imports | studio (boot wiring deletes these imports; sidecar gets its own boot) | `createChatRouter`, `createMcpHandler`, `BridgeQueue`, `ChatLog` imports. |
| `packages/studio/src/server.ts` lines 232–242 | mount block | studio (block deletes; replaced by reverse-proxy mount in 10c) | Today: `if (ctx.bridge !== undefined)` mounts `/api/chat`, `/mcp`, `/dev/chat`. Post-split: `/api/chat` and `/mcp` live in the sidecar; `/dev/chat` HTML stays studio-side because it composes the layout shell, but it's reverse-proxied through the sidecar. |
| `packages/studio/src/server.ts` lines 495–499 | construct bridge | studio (deletes; sidecar's main constructs its own queue + log) | The `const bridge = { queue: new BridgeQueue(), log: new ChatLog({ projectRoot }) }` block. |
| `packages/studio/src/server.ts` lines 625–631 | banner | studio (deletes; sidecar prints its own bridge banner; studio prints a "proxying through bridge :PORT" note) | The `if (b.bridgeMounted) ... Bridge: http://localhost:<port>/mcp` line. |
| `packages/studio/src/pages/chat.ts` | 1–37 | studio | Renders `/dev/chat` HTML shell. Layout, CSS hrefs, bodyAttrs, `chat-page` script module. Stays studio-side; sidecar reverse-proxies. |
| `packages/studio/src/build-client-assets.ts` | 1–30 (read) | studio | esbuild-on-boot for client modules. Bridge has no client surface to build. |
| `packages/studio/src/pages/**` (dashboard, entry-review, scrapbook, etc.) | — | studio | All `/dev/*` routes stay; sidecar reverse-proxies them. |
| `packages/studio/src/routes/api.ts` (`createApiRouter`) | — | studio | `/api/dev/editorial-review/*` mutations are studio-owned and unchanged. |
| `plugins/deskwork-studio/public/src/{chat-panel,chat-transport,chat-mount,chat-page,chat-renderer,chat-collapse}.ts` | — | studio (build-side) — runtime data goes through sidecar | Client-side chat code is built by the studio's esbuild pipeline (Phase 23e) and served via studio's `/static/dist/*`. Browser fetches it on the canonical (sidecar) port via reverse proxy. The TS sources stay in `plugins/deskwork-studio/public/src/`. |
| `plugins/deskwork-studio/public/src/chat-transport.ts` calls | `/api/chat/{history,stream,state,send}` | sidecar (relative URLs already resolve correctly, see §7) | `chat-transport.ts:109,115,121,163` — all relative; no change. |
| `plugins/deskwork-studio/public/src/affordance-routing.ts` | line 89 | sidecar (relative, no change) | `fetch('/api/chat/state')`. |

Existing smoke `scripts/smoke-bridge.sh` covers the in-process shape. Phase 10c extends or sibling-adds (`scripts/smoke-bridge-sidecar.sh`) to cover the two-process shape — see §8.

## 3. Package shape decision

**Decision: Option (a) — new `packages/bridge/` package, published as `@deskwork/bridge`. Bin name: `deskwork-bridge`.**

Rationale, grounded in the existing layout:

- **Workspace pattern is one-package-per-bin already.** `packages/cli` ships `deskwork`, `packages/studio` ships `deskwork-studio`. The plugin shell at `plugins/deskwork-studio/bin/deskwork-studio` first-run installs `@deskwork/studio@<plugin.json#version>` and dispatches to `node_modules/.bin/deskwork-studio` (`plugins/deskwork-studio/bin/deskwork-studio:12-13` and the manifest version pin at line 62). A new bin under `@deskwork/studio` would mean the plugin shell installs the studio package and dispatches the bridge bin from `node_modules/.bin/`, which works, but conflates two lifecycles into one published artifact and forces sidecar-only adopters (eventually) to install the studio's HTML/CSS/esbuild closure they don't need.

- **First-run npm install model favors small, single-purpose packages.** The shell at `plugins/deskwork-studio/bin/deskwork-studio:124,159-163` runs `npm install --omit=dev @deskwork/studio@<version> --workspaces=false`. The studio package today carries `esbuild`, `@codemirror/*`, the MCP SDK, Hono, and the full studio render closure (`packages/studio/package.json:43-56`). Bundling the bridge alongside means every sidecar boot pulls the entire studio surface. Splitting publishes smaller artifacts (`@deskwork/bridge` carries `@modelcontextprotocol/sdk`, `hono`, `zod`, plus `@deskwork/core` for config + paths; nothing else).

- **Lockstep version requirement is workspace-wide already.** `scripts/bump-version.ts` already bumps `@deskwork/{core,cli,studio}` in lockstep with each plugin's `plugin.json#version`. Adding `@deskwork/bridge` extends the same script — one more entry in the bump list. `packages/cli/package.json:37` and `packages/studio/package.json:49` both pin `@deskwork/core` to an exact version (`"0.15.0"`); the bridge package follows the same pin pattern. No new version-coupling machinery.

- **Mechanical churn is bounded.** The audit table above moves six existing files (`bridge/{types,queue,persistence,routes,mcp-server,mcp-tools}.ts`) and their tests into `packages/bridge/src/` + `packages/bridge/test/`. Imports inside the moved files (`@deskwork/core/config`, `./queue.ts`, etc.) keep working under the `@/` import pattern with a per-package `tsconfig`. The studio loses ~30 lines of bridge-mount wiring in `server.ts` and gains ~30 lines of reverse-proxy + descriptor-reader wiring (10c). Option (b) would mean the same file moves anyway (the bridge is a separate boot path; it can't share `server.ts`'s boot flow without re-entangling them); the `package.json` machinery is the only delta.

Option (b) was considered and rejected. Two bins inside one package implies one shared `dependencies` block (the bridge would carry esbuild it never uses, the studio would carry MCP SDK transitively even when bridge mode is off), and one shared `dist/` which obscures the runtime-coupling we're explicitly trying to break. The package boundary IS the lifecycle boundary; collapsing them re-couples what 10b is decoupling.

**Adopter-shell follow-up (deferred to 10d, captured here for traceability):** when the bridge is approved for public release, a sibling plugin shell `plugins/deskwork-bridge/bin/deskwork-bridge` mirrors the existing `plugins/deskwork-studio/bin/deskwork-studio` shape — first-run installs `@deskwork/bridge@<plugin.json#version>` and dispatches to `node_modules/.bin/deskwork-bridge`. Until 10d, the bridge runs from the workspace symlink during dogfood; no plugin shell yet.

## 4. IPC mechanism

**Loopback HTTP between studio and sidecar. The sidecar is the front door; the studio is upstream-only.**

The studio's existing Hono app already speaks HTTP (`packages/studio/src/server.ts:218`). Reusing HTTP avoids introducing a new IPC framework (Unix sockets, named pipes, MessagePort over stdio). Both processes are Hono apps; both already serialize and deserialize the same shapes; the gain from a binary protocol is zero, the cost is operational.

**Studio → sidecar (descriptor read).** At boot, the studio reads `<projectRoot>/.deskwork/.bridge` (see §5) to learn the sidecar's port. Studio binds its own loopback-only port for `/dev/*` and `/static/*`.

**Sidecar → studio (reverse proxy).** The sidecar's Hono app routes:
- `/mcp`, `/api/chat/*` — handled directly (handlers from `packages/bridge/src/`).
- `/dev/*`, `/static/*` — reverse-proxied to `http://127.0.0.1:<studioPort>/$1` via Hono's `proxy` helper from `hono/proxy` ([Hono helpers / proxy](https://hono.dev/docs/helpers/proxy)). Streaming responses pass through unbuffered (the helper forwards the upstream `Response` body as-is, which preserves SSE / chunked transfer / large responses).

**Failure modes:**
- Studio process exits → sidecar's `/dev/*` proxy receives `ECONNREFUSED` from `fetch()`. The sidecar maps that to a 502 with a small "Studio restarting…" HTML body for `/dev/*` GETs and a JSON 502 for `/static/*` (the chat client never hits `/static/*` after page load, so a 502 here is acceptable for the brief restart window). MCP and `/api/chat/*` are unaffected.
- Sidecar exits → CC's MCP connection drops; chat panel SSE drops. Operator restarts the sidecar; CC restarts listen mode. This is the same recovery shape as today's single-process bridge.

**Why not sidecar-spawns-studio (or reverse).** Auto-spawn re-couples lifecycles — kill the parent, kill the child. The whole point is independent restart. Operators run the two processes deliberately. This is documented in PRD § "Phase 10 — Out of scope": `Auto-spawn of sidecar from studio (re-couples lifecycles; defeats the purpose)`.

## 5. Discovery descriptor

**Path:** `<projectRoot>/.deskwork/.bridge`

**Schema** (TypeScript interface; serialized as JSON):

```ts
interface BridgeDescriptor {
  readonly port: number;        // sidecar's chosen loopback port
  readonly pid: number;         // sidecar process id
  readonly startedAt: string;   // ISO 8601 (e.g. "2026-05-07T18:42:11.039Z")
  readonly version: string;     // @deskwork/bridge package version
}
```

The descriptor is JSON, single-line preferred (atomic write fits in a single `writeFile`). No partial-update semantics — the sidecar owns the file's lifetime entirely.

**Lifecycle:**

1. **Write at boot.** Sidecar binds its port (§6), constructs the descriptor with the bound port, then `writeFile`'s the descriptor atomically (`writeFile` to `.bridge.tmp-<pid>` → `rename` → `.bridge`). Order matters: bind first, then descriptor write. A descriptor that exists must always reflect a live or recently-live sidecar.
2. **Remove on graceful exit.** SIGTERM and SIGINT handlers `unlink` the descriptor before exiting. SIGKILL bypasses cleanup; that's the stale-descriptor case below.
3. **Worktree-local.** Each worktree has its own descriptor under its own `.deskwork/`; no cross-worktree registry in v1.

**Stale-descriptor handling at studio boot:** the studio's descriptor reader walks five cases and decides per-case:

| # | Descriptor state | Sidecar PID | Sidecar port | Studio behavior |
|---|---|---|---|---|
| a | missing | — | — | Error: `"Sidecar not running. Run \`deskwork-bridge\` first."` Exit 1. |
| b | present | alive | responds OK on health-check (§ below) | Bind own loopback port, proceed to reverse-proxy mount. |
| c | present | dead | port free | Error: `"Stale sidecar descriptor at <path>; sidecar crashed without cleanup. Run \`deskwork-bridge\` to restart."` Exit 1. |
| d | present | dead | port held by a *different* process | Error: `"Stale sidecar descriptor at <path>; another process holds port <N>. Investigate before restarting."` Exit 1. Do NOT auto-kill. |
| e | present | alive | port doesn't respond to health-check | Error: `"Sidecar pid <P> is alive but not responding on port <N>. Check sidecar logs; do not loop."` Exit 1. |

**Health-check shape.** Studio's pre-bind probe: `GET http://127.0.0.1:<port>/api/chat/state` with a 1s timeout. A 200 response with the documented `BridgeState` JSON shape proves the sidecar is the right software at the right port. Anything else (timeout, non-200, non-JSON, wrong shape) is "not responding" per case (e). The studio does NOT use `/mcp` for the probe (case (e) probe must not interfere with the single-agent invariant; `/api/chat/state` is read-only and unconnected from MCP state).

**No auto-recovery.** Cases (c), (d), (e) all surface errors and exit. The operator decides what to do. The bridge is internal-use-only (per PRD); auto-killing or auto-restarting in any scenario re-couples lifecycles in ways that hide failure causes.

## 6. Port allocation

**Sidecar:**
- CLI flag: `--port <N>` (default `47321` — same as today's studio default; the canonical phone-facing port).
- On bind failure (`EADDRINUSE`): if `--port` was explicit, fail loudly with the exit-2 pattern `packages/studio/src/server.ts:108,560` already uses (`portExplicit` semantics). If default, auto-increment one port at a time within `[47321, 47321 + 100]`. First bind that succeeds wins. If all 101 ports fail, exit with a clear error.
- Writes the bound port into the descriptor (§5) so the studio finds the actual port, not the requested one.

**Studio:**
- CLI flag: `--studio-port <N>` (default `47422` — distinct from the canonical port to prevent accidental collision).
- Loopback-only by construction. The studio's Tailscale auto-detection becomes a no-op in two-process mode; the sidecar is the Tailscale-reachable surface (its bind policy mirrors today's studio: loopback + Tailscale interfaces unless `--no-tailscale`). The studio's bind is `127.0.0.1` and only `127.0.0.1`.
- Auto-increment range `[47422, 47422 + 100]` on `EADDRINUSE`. Same explicit-port semantics as the sidecar.
- Port not written anywhere durable — the sidecar discovers it from a CLI argument (`deskwork-bridge --studio-url http://127.0.0.1:<port>` passed by the operator's wrapping script, OR `deskwork-studio --bridge-descriptor <path>` to flip the discovery direction). Phase 10c picks one; the contract here is "the studio binds first, the sidecar's reverse proxy targets the studio's URL." Decision deferred to 10c is fine because the descriptor write/read protocol (§5) is what locks down the user-facing semantics.

**Why two ports.** The phone hits the canonical port (sidecar). The chat-panel HTML, dev surfaces, and static assets are reverse-proxied through that same port from the operator's perspective. The studio's loopback-only port is not user-facing — it's the upstream the sidecar proxies to. Operators who curl directly should use the sidecar's port for everything.

## 7. Chat panel URL discovery

**Decision: no studio-to-panel URL injection. The chat-panel HTML is reverse-proxied through the sidecar's canonical port, and all chat-panel JS uses relative URLs, so browser-relative URL resolution already targets the sidecar.**

Verification by file:line in the existing code — every chat-panel HTTP call is relative:

| Call site | URL |
|---|---|
| `plugins/deskwork-studio/public/src/chat-transport.ts:109` | `/api/chat/history?since=0&limit=${limit}` |
| `plugins/deskwork-studio/public/src/chat-transport.ts:115` | `/api/chat/state` |
| `plugins/deskwork-studio/public/src/chat-transport.ts:121` | `new EventSource('/api/chat/stream')` |
| `plugins/deskwork-studio/public/src/chat-transport.ts:163` | `/api/chat/send` |
| `plugins/deskwork-studio/public/src/affordance-routing.ts:89` | `/api/chat/state` |

When the browser loads `/dev/chat` from the sidecar's canonical port, `chat-page.ts` and `chat-panel.ts` mount, then issue these relative `fetch()` and `EventSource` requests. Browser URL resolution applies the document's origin — which is the sidecar. The sidecar serves `/api/chat/*` directly (no proxy hop). The `/static/*` URLs in `packages/studio/src/pages/chat.ts:29-32` (CSS hrefs `/static/css/*` and `scriptModules: ['chat-page']` resolving to `/static/dist/chat-page.js`) also resolve to the sidecar, which reverse-proxies to the studio.

**No work needed in 10c for URL injection.** No new bootstrap variable, no `<meta>` tag, no inline JSON config. The relative-URL pattern was the right call in Phase 1 and pays off in Phase 10.

**Audit confirms no absolute URLs.** A grep of `plugins/deskwork-studio/public/src/` for the chat-panel surface finds no `http://`, no `window.location.origin + ...`, no hardcoded ports. If a future change introduces an absolute or origin-bound URL, it must route through a single helper that consults a runtime config (deferred to 10d if it's even needed); there is no such code today and 10c does not need to add it.

## 8. Smoke-test shape

Phase 10c extends `scripts/smoke-bridge.sh` (or sibling-adds `scripts/smoke-bridge-sidecar.sh` if size pushes us past readability — operator's call). The shape mirrors the existing script's style (`scripts/smoke-bridge.sh:1-365`): `set -euo pipefail`, `mktemp -d` fixture, ANSI helpers, `kill_tree` cleanup trap, numbered assertions printed with `info`/`ok`/`fail`. Local-only per `.claude/rules/agent-discipline.md` — not wired into CI.

Numbered assertions:

1. **Boot sidecar against tmp fixture.** `mktemp -d` a fixture project with a minimal `.deskwork/config.json` (mirrors `scripts/smoke-bridge.sh:155-172`). Spawn `${BRIDGE_BIN} --project-root <fixture> --port <SIDECAR_PORT>`. Wait up to 30s for the listening banner. Assert `${FIXTURE}/.deskwork/.bridge` exists with the documented schema (parse JSON, check keys + types).
2. **Boot studio against same fixture, pointing at sidecar.** Spawn `${STUDIO_BIN} --project-root <fixture> --studio-port <STUDIO_PORT>`. Wait for its listening banner. Assert the studio's banner mentions the discovered sidecar URL or the sidecar's port (exact wording deferred to 10c).
3. **HTTP-init the MCP client over streamable HTTP.** From loopback against the sidecar's port: `POST <sidecar>/mcp` with the documented initialize JSON (mirrors `scripts/smoke-bridge.sh:290-300`). Assert HTTP 200 with `event: message` and `deskwork-studio-bridge` in the response (the existing A3 assertion shape).
4. **Send a message; round-trip through studio surfaces.** Probe the sidecar's `GET /api/chat/state` and assert `{mcpConnected: true, listenModeOn, awaitingMessage}` shape. Probe the studio's `/dev/editorial-studio` *through the sidecar* (`GET <sidecar>/dev/editorial-studio`) and assert HTTP 200 with the dashboard's content marker — proves the reverse proxy wires up.
5. **SIGKILL the studio process.** `kill -9 ${STUDIO_PID}`. Wait briefly for the kernel to mark the port as free.
6. **Restart studio.** Spawn `${STUDIO_BIN} --project-root <fixture> --studio-port <STUDIO_PORT>` again. Wait for its banner.
7. **Confirm MCP client's existing connection is unaffected.** From the same MCP session opened in step 3, issue another `await_studio_message` call (or the equivalent JSON-RPC over the open session). Assert the call resolves normally (the queue is sidecar-side; the studio's restart did not touch it). Also probe `<sidecar>/api/chat/state` and assert the sidecar still reports `mcpConnected: true`.
8. **Probe `/dev/*` through the sidecar after restart.** `GET <sidecar>/dev/editorial-studio` must return 200 again — proves reverse proxy reconnected to the new studio port.
9. **Teardown.** Trap-driven (mirrors `scripts/smoke-bridge.sh:129-148`): kill_tree both sidecar and studio, rm -rf `<TMP>` unless `KEEP_TMP=1`.

Skip-on-no-non-loopback-IP for step (any external 403 check) follows the existing precedent at `scripts/smoke-bridge.sh:184-203` if a 10c assertion needs it.

## 9. THESIS alignment check

- **Consequence 1 (distribution must keep source agent-reachable).** Both processes ship as TypeScript-compiled JS dist with public source. `@deskwork/bridge` follows `@deskwork/studio`'s artifact shape (`packages/studio/package.json:20-27`: `dist`, `package.json`, `README.md` are the only published files; bin is `./dist/server.js`). The plugin shell pattern (when 10d lands) mirrors `plugins/deskwork-studio/bin/deskwork-studio:1-187`'s first-run-install shape. No opacity introduced. **Aligned.**

- **Consequence 2 (skills do the work; the studio routes commands).** The bridge is plumbing for operator-dispatched commands; the listen skill is the load-bearing program (`plugins/deskwork/skills/listen/SKILL.md`). Phase 10 moves the plumbing into a sidecar; the routing semantics are unchanged. The chat panel still pre-fills affordance-routed commands (Phase 5 helper at `plugins/deskwork-studio/public/src/affordance-routing.ts`); the operator still confirms with Send; the agent still does the work via its own tools. The studio still doesn't run state-machine logic — the only studio-side mutations remain the existing `/api/dev/editorial-review/*` and `/api/dev/scrapbook/*` routes (`packages/studio/src/server.ts:228,378`), unchanged by Phase 10. **Aligned.**

- **Consequence 3 (operator extends via agent).** Override seams (templates, doctor) are studio-side and unaffected — `packages/studio/src/lib/override-render.ts` and `@deskwork/core/overrides` continue to live in the studio process and continue to serve `<projectRoot>/.deskwork/templates/<name>.ts` overrides. The bridge is not a customization point in v1; per PRD § "Open questions / future work" override seams for chat-panel chrome and per-collection prompts are deferred. Phase 10 doesn't take any of those off the table — when they land, they slot in studio-side because the chat HTML is rendered studio-side (`packages/studio/src/pages/chat.ts`). **Aligned.**

## 10. Risks

Carried forward from the workplan's "Phase 10 — Risks" section, plus one new risk surfaced by this audit.

- **Reverse-proxy correctness for streaming responses.** The studio serves chunked / streaming responses for some `/dev/*` routes. Hono's proxy must stream, not buffer. Mitigation: integration test in 10c that asserts a long-running `/dev/*` request streams through the proxy correctly. (Carried from workplan.)
- **Discovery race.** Studio boots before sidecar's descriptor is written → studio errors with "sidecar not running." Mitigation: surface a clear, actionable error per case (a) above; do not auto-spawn. (Carried from workplan.)
- **MCP single-agent invariant interaction.** Studio restart + chat panel reconnect — does the sidecar's MCP slot still belong to the same CC session? Yes — MCP is sidecar-process-scoped; SSE/HTTP reconnects are independent. Mitigation: documented above in §4 and §8 step 7. (Carried from workplan.)
- **Port collision on second worktree.** Two worktrees both want `:47321` → second auto-increments per §6. Each sidecar's descriptor is in its own worktree's `.deskwork/.bridge`. Studio finds its sidecar via the worktree-local descriptor. Verify in 10c integration tests. (Carried from workplan.)
- **NEW — Client-asset versioning across processes.** The studio's `build-client-assets.ts` (`packages/studio/src/build-client-assets.ts:1-30`) builds chat client modules into `<pluginRoot>/.runtime-cache/dist/` at boot. The sidecar reverse-proxies `/static/dist/<name>.js` to the studio. If the studio is upgraded to a new version while the sidecar remains an older version, the chat client (built by the new studio) may speak a protocol shape the older sidecar doesn't recognize (e.g. a new field in `send_studio_response` payload). Mitigation: lockstep version pin between `@deskwork/bridge` and `@deskwork/studio` (already enforced workspace-wide by `scripts/bump-version.ts`); a startup-time version-mismatch check in the studio's descriptor reader (§5: case (e) extension — studio also probes `<sidecar>/api/dev/version` if added, or compares `descriptor.version` against its own `getStudioVersion()` and warns on mismatch). 10c lands the warn-on-mismatch check; a hard-fail can be added later if mismatches turn out to break things in practice.

## 11. What's explicitly NOT in this addendum

The following are 10b/10c implementation decisions; this addendum sets the contract, not the code:

- Exact file naming inside `packages/bridge/src/` (mirror today's `bridge/{types,queue,persistence,routes,mcp-server,mcp-tools}.ts` likely; final names land with the moves in 10b).
- Whether Phase 10b moves files vs. re-exports them through the new package boundary in a transitional commit. Either is acceptable as long as `packages/studio/src/bridge/` is empty at the end of 10b.
- The exact CLI surface of `deskwork-bridge --help` (foreground-only in 10b per workplan; flags beyond `--project-root`, `--port`, `--help` deferred).
- The reverse-proxy implementation's exact composition (single `app.all('/dev/*', proxy(...))` plus `app.all('/static/*', proxy(...))` is the obvious shape using `hono/proxy`; final code lands in 10c).
- Test-fixture names and tmp-dir layout for the new integration test (`packages/<bridge>/test/sidecar-boot.test.ts` per workplan).
- launchd / systemd unit shapes for adopters — explicitly 10d, deferred until adopter-facing hardening.
- Whether the 10c smoke is a sibling script (`smoke-bridge-sidecar.sh`) or an extension to `smoke-bridge.sh`. Final call lands when 10c has the assertion blocks written.
- The `--studio-url` vs `--bridge-descriptor` direction-of-discovery question called out in §6 — both work; 10c picks based on which integrates more cleanly with existing studio CLI parsing at `packages/studio/src/server.ts:90-136`.
