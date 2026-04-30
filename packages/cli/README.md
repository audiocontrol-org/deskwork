## @deskwork/cli

Editorial calendar lifecycle CLI for the [deskwork](https://github.com/audiocontrol-org/deskwork) Claude Code plugin. Drives the editorial pipeline: capture ideas, plan drafts, run a structured review loop, publish, and track distribution.

### Audience

This package backs the [`deskwork`](https://github.com/audiocontrol-org/deskwork/tree/main/plugins/deskwork) Claude Code plugin shell. Direct npm install of `@deskwork/cli` into a non-deskwork host is unusual — the canonical entry point is the plugin shell, which `npm install`s this package on first run and dispatches via its bin shim.

If you want the editorial calendar lifecycle inside Claude Code, follow the marketplace install instructions at the [marketplace repo](https://github.com/audiocontrol-org/deskwork#install).

### Subcommands

The CLI exposes a single dispatcher that routes to ~17 subcommands: `add`, `plan`, `outline`, `draft`, `publish`, `ingest`, `review-start`, `iterate`, `approve`, `review-cancel`, `review-help`, `review-report`, `shortform-start`, `distribute`, `customize`, `doctor`, `install`. Each maps to a Claude Code skill under the `/deskwork:` namespace; the skills are the operator-facing surface and documented in the plugin shell.

### Source

Repository: [`audiocontrol-org/deskwork`](https://github.com/audiocontrol-org/deskwork). The CLI source lives at [`packages/cli/`](https://github.com/audiocontrol-org/deskwork/tree/main/packages/cli); shared core logic in [`@deskwork/core`](https://www.npmjs.com/package/@deskwork/core); the optional web studio in [`@deskwork/studio`](https://www.npmjs.com/package/@deskwork/studio).

### License

GPL-3.0-or-later — same as the monorepo. See [`LICENSE`](https://github.com/audiocontrol-org/deskwork/blob/main/LICENSE) for details.
