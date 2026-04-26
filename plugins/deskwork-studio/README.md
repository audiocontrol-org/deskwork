## deskwork-studio

Web studio for the deskwork editorial calendar — a local Hono server exposing a dashboard, longform review surface, shortform review desk, scrapbook viewer, and the compositor's manual.

This is a thin Claude Code plugin shell. The actual server lives in the [@deskwork/studio](../../packages/studio/) npm package; this plugin's `bin/deskwork-studio` wrapper finds the workspace-linked binary or falls back to `npx -y @deskwork/studio@latest`.

### Install

```
claude plugin install --marketplace https://github.com/audiocontrol-org/deskwork deskwork-studio
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
| `/dev/editorial-studio` | Calendar dashboard across all sites |
| `/dev/editorial-review/<slug>` | Longform review of an active workflow |
| `/dev/editorial-review-shortform` | Shortform copy review desk |
| `/dev/editorial-help` | The compositor's manual |
| `/dev/scrapbook/<site>/<slug>` | Scrapbook viewer for research artifacts |

The studio is **dev-only** — no auth, localhost binding only.
