## deskwork-studio

Web studio for the deskwork editorial calendar — a local Hono server exposing a dashboard, longform review surface, shortform review desk, scrapbook viewer, and the compositor's manual.

This is a thin Claude Code plugin shell. The actual server lives in the [`@deskwork/studio`](https://www.npmjs.com/package/@deskwork/studio) npm package; the `bin/deskwork-studio` wrapper handles dev-vs-installed resolution. In a workspace clone, the wrapper detects the workspace symlink at `node_modules/@deskwork/studio` and dispatches directly. On a fresh marketplace install, the wrapper runs `npm install --omit=dev --workspaces=false @deskwork/studio@<version>` against the public npm registry on first invocation, caches the result under `<pluginRoot>/node_modules/`, and dispatches via `node_modules/.bin/deskwork-studio`.

### Install

```
/plugin marketplace add https://github.com/audiocontrol-org/deskwork
/plugin install deskwork-studio@deskwork
```

Pairs with the [`deskwork`](../deskwork/) plugin, which provides the editorial lifecycle skills. You can install both, or `deskwork` alone for headless use.

### First-run install

The first time you invoke `/deskwork-studio:studio` (or run `deskwork-studio` directly) after a marketplace install or fresh clone, the bin wrapper executes `npm install --omit=dev --workspaces=false @deskwork/studio@<version>` against the public npm registry to populate `<pluginRoot>/node_modules/`. Subsequent invocations skip that step and dispatch straight to the cached binary — startup is under a second.

### Runtime architecture

The studio's server-side code is compiled (`@deskwork/studio` ships a `dist/` tree under `node_modules/`). Client-side assets (`/static/dist/*.js`) are produced by an on-startup esbuild pass that reads `plugins/deskwork-studio/public/src/*.ts` and writes outputs to `<pluginRoot>/.runtime-cache/dist/`. The cache is gitignored and regenerated automatically; cold boots include the build (a few hundred ms), warm boots check mtimes and skip the build (~50ms).

### Customization layer

Operators can override the plugin's built-in studio templates without forking the plugin. Drop a file at `<projectRoot>/.deskwork/templates/<name>.ts` and the runtime resolver uses it instead of the built-in. To get a starting point copied into the project:

```
/deskwork:customize templates dashboard
```

(or any other template basename — `content`, `content-project`, `scrapbook`, `review`, `help`). The skill also supports `doctor` rule overrides under `.deskwork/doctor/`. See the customize skill for the full list.

### Usage

In a project that has a `.deskwork/config.json` (run `/deskwork:install` first if not):

```
/deskwork-studio:studio
```

The skill prompts for an optional project root, port, and host, then launches the server. Default URL: `http://localhost:47321/dev/editorial-studio`. The default port is `47321` (chosen to avoid the Astro dev server's default `4321` — most projects deskwork manages run an Astro dev server alongside).

### Reaching the studio from another device

By default the studio detects Tailscale on launch and binds to **both** loopback AND the local Tailscale interface(s). Tailscale peers can reach the studio at the magic-DNS hostname (`<machine>.<tailnet>.ts.net`) without any flags. The startup banner lists every reachable URL.

If Tailscale isn't installed or running, the studio binds to loopback only.

Overrides:

| Goal | Flag |
|---|---|
| Loopback only (skip Tailscale even if running) | `--no-tailscale` |
| Bind ONLY to a specific address (LAN/Wi-Fi opt-in) | `--host 0.0.0.0` (or a specific IP) |

The studio has **no authentication** and **no rate-limiting**. Tailscale is treated as a trusted network. `--host` overrides print a loud warning when bound beyond loopback.

### Routes

| Path | Purpose |
|---|---|
| `/dev/editorial-studio` | Calendar dashboard across all sites; hierarchical entries indent under their ancestor |
| `/dev/editorial-review/<slug>` | Longform review of an active workflow (slug accepts `/`-separated paths) |
| `/dev/editorial-review-shortform` | Shortform copy review desk |
| `/dev/editorial-help` | The compositor's manual |
| `/dev/scrapbook/<site>/<path>` | Scrapbook viewer; `<path>` may be any depth (e.g. `the-outbound/characters/strivers`); secret items appear in a separate section with a `private` badge |
| `/dev/chat` | Full-page bridge chat panel (only useful when bridge mode is enabled — see below) |

The studio is **dev-only** — no auth, localhost binding only.

### Bridge mode (experimental)

> **Status: experimental.** The bridge currently lives on the [`feature/studio-bridge`](https://github.com/audiocontrol-org/deskwork/tree/feature/studio-bridge) branch and is NOT yet shipped through the marketplace install. This section documents the design so operators tracking the branch can wire it up. The bridge will fold into mainline only after the Phase 8 validation gate passes.

#### What it is

A control channel between the studio web UI and the operator's Claude Code session, so commands can be dispatched from a phone or iPad without a terminal. The studio gains:

- An **MCP endpoint** at `/mcp` (loopback-only). Two tools — `await_studio_message` and `send_studio_response` — let an agent in your local Claude Code session block on operator input from the studio's chat panel and stream tool-use cards + prose responses back.
- A **chat panel UI** rendered both as a docked panel on entry-review pages and as a full-page surface at `/dev/chat`. The panel persists operator-side input via `localStorage` (keyed on worktree path), replays history on reload, and reconnects through SSE when the bridge drops and comes back.

The bridge is loopback-bound by construction. The chat panel's HTTP routes (`/api/chat/{send,stream,state,history}`) are reachable over Tailscale; the MCP endpoint at `/mcp` is not. Your phone never connects to MCP — only the agent on the same machine as the studio does.

#### When to use it

When you want to dispatch deskwork skill commands (Approve, Iterate, Reject, etc.) from a non-terminal surface — e.g. iPad on the couch, phone over Tailscale on the road. The decision-strip buttons on entry-review pages route through the bridge when it's live: clicking Approve pre-fills the chat input with the skill command; you tap Send and the agent on your laptop runs it.

When the bridge is offline, those same buttons fall back to the existing copy-to-clipboard panel — no behavior change for non-bridge users.

#### Setup

1. **Enable per-project** in `<projectRoot>/.deskwork/config.json`:

   ```json
   {
     "sites": [ ... ],
     "studioBridge": { "enabled": true }
   }
   ```

   Optional: `"studioBridge": { "enabled": true, "idleTimeout": 600 }` — seconds the listen skill blocks on each `await_studio_message` iteration before re-entering. Default 600.

2. **Register the studio's MCP endpoint with Claude Code.** The exact mechanism depends on your CC version; the typical shape is a `mcpServers` entry in `.claude/settings.json` or `.mcp.json` pointing at the studio's loopback URL. Using the studio's default port:

   ```json
   {
     "mcpServers": {
       "deskwork-studio": {
         "type": "http",
         "url": "http://localhost:47321/mcp"
       }
     }
   }
   ```

   The studio prints the exact bridge URL in its startup banner, e.g.:

   ```
   Bridge: http://localhost:47321/mcp (loopback-only)
   ```

   If you launched the studio on a non-default port, match that here. The MCP endpoint accepts only loopback connections (responses are 403 for any other peer); register the endpoint from the same machine that runs the studio.

3. **Start a Claude Code session and run** `/deskwork:listen`. With `studioBridge.enabled: true`, the SessionStart hook in the [`deskwork`](../deskwork/) plugin emits a one-shot directive instructing the agent to dispatch the listen skill automatically — no manual invocation needed once the hook fires.

4. **Open the chat panel.** Either visit `http://<host>:<port>/dev/chat` for the full-page version, or open any `/dev/editorial-review/<id>` page — the docked chat panel appears as a column on those surfaces.

#### What works end-to-end

| Surface | Behavior |
|---|---|
| Chat panel (full-page or docked) | Subscribes to `/api/chat/stream` (SSE); replays history on mount via `/api/chat/history`; reflects bridge state via `/api/chat/state`. Renders tool-use cards (compact, expand-on-tap) and agent prose. |
| Operator input | Persisted to `localStorage` per worktree path so a refresh / mobile-app-switcher doesn't lose draft text. Disabled when `mcpConnected || listenModeOn` is false; a banner explains why. |
| Decision-strip buttons (Approve / Iterate / Reject) | When the bridge is live, click pre-fills the chat input with the corresponding skill command; tap Send to dispatch. When offline, falls back to the existing copy-to-clipboard flow. |
| Reconnect | Browser closes and reopens, or the bridge drops and comes back: the panel reconnects to SSE and replays missed events from the JSONL chat log under `<projectRoot>/.deskwork/chat-log/<YYYY-MM-DD>.jsonl`. |
| Listen-loop survival | The listen skill re-enters `await_studio_message` after every operator turn AND after a terminal-side interrupt that interrupts the in-flight tool. Ctrl-C at the terminal is the deterministic exit. |

#### Limitations + known issues

- **Single-agent invariant.** Only one Claude Code session can hold the bridge at a time per studio process. A second connection attempt receives 409 from `/mcp`. Run one CC session per worktree.
- **Experimental status.** The bridge is on the `feature/studio-bridge` branch and has not cleared the Phase 8 validation gate. Don't depend on it for important work yet; expect schema and contract changes before the integration PR lands.
- **Phone-side rendering.** Tool-use card bodies are capped at 300px max-height with internal scroll. Large diffs / long Bash output may be cramped on small screens — future iteration may improve this.
- **No CSRF / origin protection beyond the loopback bind + Origin allow-list.** The MCP endpoint relies on loopback-only binding for authentication; the chat panel routes are reachable from Tailscale peers (intentional — that's how a phone reaches them). The studio still has no per-request auth.
- **`/deskwork:stop-listening` is not shipped in v1.** Cancel via terminal Ctrl-C, which interrupts the in-flight `await_studio_message` and lets the agent exit gracefully.

#### Security note

The MCP endpoint is loopback-only by design and verified by the server's loopback guard (403 for non-loopback peers) plus an Origin allow-list (403 for cross-site Origin headers). Tailscale exposes the studio's web routes (`/dev/chat`, history, send/state) but NOT `/mcp`. Your agent connects to MCP from the same machine that runs the studio — there is no path for an off-machine peer to reach the MCP surface.

The chat-panel HTTP routes accept input from any peer that can reach the studio's bind address (loopback + Tailscale by default). Treat the studio's surface area as a trusted-network tool.

### Updates + pinning

Tracks the default branch of `audiocontrol-org/deskwork`. Update with `/plugin marketplace update deskwork && /reload-plugins`. Pin to a tagged release via `/plugin marketplace add audiocontrol-org/deskwork#<tag>` — see the [GitHub releases page](https://github.com/audiocontrol-org/deskwork/releases) for tag names. Full story in the [root README](../../README.md#getting-updates).
