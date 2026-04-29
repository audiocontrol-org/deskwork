## deskwork-studio

Web studio for the deskwork editorial calendar — a local Hono server exposing a dashboard, longform review surface, shortform review desk, scrapbook viewer, and the compositor's manual.

This is a thin Claude Code plugin shell. The actual server lives in the [@deskwork/studio](../../packages/studio/) npm package, vendored into the plugin tree at `vendor/studio/` (and `vendor/core/`) so that a fresh marketplace install has the package source at hand. The `bin/deskwork-studio` wrapper handles dev-vs-installed resolution: workspace clone uses the workspace-linked `tsx` binary; marketplace install does a one-time `npm install --omit=dev` against the plugin tree on first invocation, then exec's the resulting bin.

### Install

```
/plugin marketplace add https://github.com/audiocontrol-org/deskwork
/plugin install deskwork-studio@deskwork
```

Pairs with the [`deskwork`](../deskwork/) plugin, which provides the editorial lifecycle skills. You can install both, or `deskwork` alone for headless use.

### First-run install

The first time you invoke `/deskwork-studio:studio` (or run `deskwork-studio` directly) after a marketplace install or fresh clone, the bin wrapper executes `npm install --omit=dev` inside the plugin tree (~30s on a typical machine). Subsequent invocations skip that step and exec straight through `tsx` — boot is fast (well under a second to first byte).

### Runtime architecture

The studio runs from source via `tsx` — there's no precompiled bundle to keep in sync with the source. Client-side assets (`/static/dist/*.js`) are produced by an on-startup esbuild pass that reads `plugins/deskwork-studio/public/src/*.ts` and writes outputs to `<pluginRoot>/.runtime-cache/dist/`. The cache is gitignored and regenerated automatically; cold boots include the build (a few hundred ms), warm boots check mtimes and skip the build (~50ms).

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

The studio is **dev-only** — no auth, localhost binding only.

### Updates + pinning

Tracks the default branch of `audiocontrol-org/deskwork`. Update with `/plugin marketplace update deskwork && /reload-plugins`. Pin to a tagged release via `/plugin marketplace add audiocontrol-org/deskwork#v0.1.0`. Full story in the [root README](../../README.md#getting-updates).
