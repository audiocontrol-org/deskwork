## @deskwork/studio

Local web studio for the [deskwork](https://github.com/audiocontrol-org/deskwork) editorial-calendar plugin. Hono-backed dev server exposing the editorial dashboard, a unified review surface for longform and shortform workflows, the scrapbook viewer, and the compositor's manual.

### Audience

This package backs the [`deskwork-studio`](https://github.com/audiocontrol-org/deskwork/tree/main/plugins/deskwork-studio) Claude Code plugin shell. Direct npm install of `@deskwork/studio` into a non-deskwork host is unusual — the canonical entry point is the plugin shell, which `npm install`s this package on first run and dispatches via its bin shim.

If you want the editorial studio inside Claude Code, follow the marketplace install instructions at the [marketplace repo](https://github.com/audiocontrol-org/deskwork#install). The studio plugin pairs with the lifecycle plugin (`deskwork`) — install both, or just the lifecycle one for headless use.

### Network model

The studio binds to loopback by default (`127.0.0.1`) plus the local Tailscale interface when one is detected, so peers on the same tailnet can reach it via magic-DNS without any flags. There is no authentication and no rate-limiting — it is dev-only by design. Public-internet exposure stays opt-in via `--host`.

### Routes

| Path | Surface |
|---|---|
| `/dev/editorial-studio` | Calendar dashboard across all collections |
| `/dev/editorial-review/<id>` | Unified review surface for longform and shortform workflows |
| `/dev/editorial-review-shortform` | Shortform desk index (per-platform composition) |
| `/dev/editorial-help` | The compositor's manual |
| `/dev/scrapbook/<site>/<path>` | Scrapbook viewer at any depth |
| `/dev/content/<site>/<project>` | Bird's-eye content tree view |

### Source

Repository: [`audiocontrol-org/deskwork`](https://github.com/audiocontrol-org/deskwork). The studio source lives at [`packages/studio/`](https://github.com/audiocontrol-org/deskwork/tree/main/packages/studio); shared core logic in [`@deskwork/core`](https://www.npmjs.com/package/@deskwork/core); the lifecycle CLI in [`@deskwork/cli`](https://www.npmjs.com/package/@deskwork/cli).

### License

GPL-3.0-or-later — same as the monorepo. See [`LICENSE`](https://github.com/audiocontrol-org/deskwork/blob/main/LICENSE) for details.
