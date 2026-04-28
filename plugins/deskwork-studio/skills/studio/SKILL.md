---
name: studio
description: Launch the deskwork web studio — a local dev server (default port 47321, loopback only) exposing the editorial dashboard, unified review surface (longform + shortform), scrapbook viewer, and the compositor's manual. Reads .deskwork/config.json from the current project. Use when the operator wants a browser surface for the editorial workflow rather than driving everything through CLI subcommands.
---

## Studio

Launch the deskwork studio against the current project. The studio runs as a local Hono server with no network dependencies; everything reads from / writes to the project's `.deskwork/` tree on disk.

### Step 1 — Confirm the project root

The studio reads `.deskwork/config.json` relative to a project root. Defaults to `process.cwd()` of the launched process. If the operator wants to point at a different tree, capture the absolute path before invoking.

### Step 2 — Port (default 47321)

The default is `47321`. This is intentionally *not* `4321` — Astro's dev server defaults to `4321`, and most projects deskwork manages run an Astro dev server alongside the studio. Override with `--port <n>` if needed.

If the chosen port is already in use, the studio's behavior depends on whether `--port` was explicitly passed:

- **No explicit `--port`** — auto-increments through the range `47321`…`47350` and prints `Started on http://localhost:<port>` when it finds a free port.
- **Explicit `--port <n>`** — fails fast with a clear error including the address conflict and a `--port <other>` suggestion. Auto-increment is suppressed because the operator asked for a specific port on purpose.

If the auto-increment range is exhausted, the studio fails with a clear error listing the range it tried.

### Step 3 — Host policy (Tailscale-aware default)

The studio's default networking policy:

- Always binds to `127.0.0.1` (loopback) so `localhost:<port>` works on this machine.
- **If Tailscale is detected**, also binds to the local Tailscale interface(s). The studio then becomes reachable from any other tailnet member at the magic-DNS hostname (`<machine>.<tailnet>.ts.net`) without any flags.
- LAN / Wi-Fi / public-internet exposure stays opt-in via `--host`.

Detection is automatic — no flag needed. The studio walks `os.networkInterfaces()` for an IP in `100.64.0.0/10` (Tailscale's reserved CGNAT range) and binds to it if found. Magic-DNS hostname comes from `tailscale status --json` when the CLI is on PATH; otherwise the banner shows the Tailscale IP directly.

To override:

| Goal | Flag |
|---|---|
| Loopback only (skip Tailscale even if it's running) | `--no-tailscale` |
| Bind ONLY to a specific address (no auto-detect) | `--host <addr>` |
| Reach from any local interface (LAN + Wi-Fi + Tailscale + everything) | `--host 0.0.0.0` |

The studio has **no authentication** and **no rate-limiting**. Tailscale is treated as a trusted network — peers on the same tailnet are usually devices the operator owns. `--host` exposing beyond loopback prints a loud warning in the startup banner.

### Step 4 — Launch

Invoke the wrapper (available on PATH because it lives under the plugin's `bin/`):

```
deskwork-studio
```

Or with explicit overrides:

```
deskwork-studio --project-root /absolute/path/to/project --port 47321
deskwork-studio --no-tailscale                # loopback only
deskwork-studio --host 0.0.0.0                # all interfaces (LAN + Wi-Fi + Tailscale)
deskwork-studio --host 100.64.0.5             # bind to a specific Tailscale IP only
```

The wrapper resolves the studio binary in this order:

1. Workspace-linked binary at `node_modules/.bin/deskwork-studio` (dev path; runs source via tsx, supports edits without rebuild)
2. Self-contained ESM bundle at `plugins/deskwork-studio/bundle/server.mjs` (committed to git; what fresh `claude plugin install` users hit)
3. Loud error pointing at `npm install` / `npm run build`

The server logs (loopback only — when Tailscale isn't running or `--no-tailscale` is passed):

```
deskwork-studio listening on:
  http://localhost:47321/
  project: /absolute/path/to/project
  sites:   writingcontrol
```

When Tailscale is detected, every reachable URL is listed:

```
deskwork-studio listening on:
  http://localhost:47321/
  http://100.64.0.5:47321/
  http://orion-m4.tail8254f4.ts.net:47321/    (Tailscale magic-DNS)
  project: /absolute/path/to/project
  sites:   writingcontrol
```

When `--host` exposes the studio beyond loopback, a warning appends:

```
deskwork-studio listening on:
  http://0.0.0.0:47321/
  project: /absolute/path/to/project
  sites:   writingcontrol
  bound to 0.0.0.0. Studio has no authentication —
  only run this on a trusted network (Tailscale, VPN, etc.).
```

Press Ctrl-C to stop.

### Step 5 — Routes the operator can visit

| Path | Surface |
|---|---|
| `/` | Redirects to `/dev/editorial-studio` |
| `/dev/editorial-studio` | Dashboard — calendar across all sites, awaiting press, recent proofs, voice-drift signal, shortform coverage matrix |
| `/dev/editorial-review/<id>` | **Unified review surface** for longform and shortform workflows (margin notes, editor, decision controls). For shortform workflows, a small platform/channel header renders above the same editor used for longform. Slug-based legacy URLs 302-redirect here. |
| `/dev/editorial-review-shortform` | Shortform desk **index** — one row per `(slug, platform, channel?)` tuple. Cells with an active workflow link to `/dev/editorial-review/<id>`; empty cells expose a compose button that POSTs to `/api/dev/editorial-review/start-shortform` and redirects to the new review URL. There is no per-platform editor on this index page itself — editing always happens on the unified review surface. |
| `/dev/editorial-help` | The compositor's manual — reference for the editorial workflow and skill catalogue |
| `/dev/scrapbook/<site>/<path>` | Scrapbook viewer for research artifacts. The path segment supports hierarchical paths (slashes are accepted by the route's `:path{.+}` glob), e.g. `the-outbound/characters/strivers` resolves to that nested node's scrapbook. |

### Step 6 — Report to the operator

After launch, tell them:

- The URL (`http://localhost:<port>/dev/editorial-studio` for loopback; the actual host:port shown in the banner otherwise)
- Which routes to visit for the surface they asked for
- That the server reads from `.deskwork/config.json` — if no config exists, `/deskwork:install` should run first
- If they passed `--host`, remind them the studio has no auth — make sure the network is trusted

### Notes

- The studio is **dev-only**. There is no auth, no rate-limiting, and no review of mutation handlers against a hostile caller. Default loopback bind keeps that posture safe; `--host` is opt-in for trusted overlay networks.
- All mutations from the studio go through the same `@deskwork/core` handlers the CLI uses, so calendar/journal state stays consistent regardless of which surface the operator drives.
- Shortform composition reuses the longform review surface — same DOM contract, same Save / Iterate / Approve / Reject controls. There is no parallel composer to maintain.
