## deskwork-studio

Web studio for the deskwork editorial calendar — a local Hono server exposing a dashboard, longform review surface, shortform review desk, scrapbook viewer, and the compositor's manual.

This is a thin Claude Code plugin shell. The actual server lives in the [@deskwork/studio](../../packages/studio/) npm package; this plugin's `bin/deskwork-studio` wrapper resolves to the workspace-linked binary on dev installs, or falls back to the self-contained bundle at `plugins/deskwork-studio/bundle/server.mjs` (committed to git) for fresh `claude plugin install` users. No `npm install` ceremony required either way.

### Install

```
/plugin marketplace add https://github.com/audiocontrol-org/deskwork
/plugin install deskwork-studio@deskwork
```

Pairs with the [`deskwork`](../deskwork/) plugin, which provides the editorial lifecycle skills. You can install both, or `deskwork` alone for headless use.

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

The studio is **dev-only** — no auth, localhost binding only.

### Updates + pinning

Tracks the default branch of `audiocontrol-org/deskwork`. Update with `/plugin marketplace update deskwork && /reload-plugins`. Pin to a tagged release via `/plugin marketplace add audiocontrol-org/deskwork#v0.1.0`. Full story in the [root README](../../README.md#getting-updates).
