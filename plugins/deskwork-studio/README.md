## deskwork-studio

Web studio for the deskwork editorial calendar — a local Hono server exposing a dashboard, longform review surface, shortform review desk, scrapbook viewer, and the compositor's manual.

This is a thin Claude Code plugin shell. The actual server lives in the [@deskwork/studio](../../packages/studio/) npm package; this plugin's `bin/deskwork-studio` wrapper resolves to the workspace-linked binary inside the monorepo. Until `@deskwork/studio` is published to npm, running the skill against a fresh plugin install requires a one-time `npm install` inside the cloned plugin tree.

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

The skill prompts for an optional project root and port, then launches the server. Default URL: `http://localhost:4321/dev/editorial-studio`.

### Routes

| Path | Purpose |
|---|---|
| `/dev/editorial-studio` | Calendar dashboard across all sites; hierarchical entries indent under their ancestor |
| `/dev/editorial-review/<slug>` | Longform review of an active workflow (slug accepts `/`-separated paths) |
| `/dev/editorial-review-shortform` | Shortform copy review desk |
| `/dev/editorial-help` | The compositor's manual |
| `/dev/scrapbook/<site>/<path>` | Scrapbook viewer; `<path>` may be any depth (e.g. `the-outbound/characters/strivers`); secret items appear in a separate section with a `private` badge |

The studio is **dev-only** — no auth, localhost binding only.
