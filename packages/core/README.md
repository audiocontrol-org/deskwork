## @deskwork/core

Core lifecycle library for the [deskwork](https://github.com/audiocontrol-org/deskwork) editorial-calendar plugin family. Pure logic with no entry point — config schema, content-tree walker, frontmatter binding, calendar parser, doctor rules, scrapbook resolver, review pipeline.

### Audience

This package exists to back the deskwork Claude Code plugins; it is shared between [`@deskwork/cli`](https://www.npmjs.com/package/@deskwork/cli) and [`@deskwork/studio`](https://www.npmjs.com/package/@deskwork/studio). Direct npm install of `@deskwork/core` into a non-deskwork host is unusual — most adopters install the plugin instead, which `npm install`s this package on first run.

If you want the editorial calendar lifecycle as a Claude Code plugin (the canonical entry point), follow the install instructions at the [marketplace repo](https://github.com/audiocontrol-org/deskwork#install).

### Use cases for direct install

You may want this package directly if you are:

- Writing a tool that walks deskwork-managed content trees (e.g. a custom doctor rule, a static-site renderer, an analytics script).
- Building a downstream plugin that reuses the calendar parser or frontmatter binding code.
- Embedding deskwork's lifecycle handlers into a non-Claude-Code surface.

### Subpath exports

The package exposes ~25 subpath exports (`@deskwork/core/calendar`, `@deskwork/core/frontmatter`, `@deskwork/core/content-tree`, `@deskwork/core/doctor`, `@deskwork/core/review`, etc.) — see [`package.json`](./package.json) for the full list.

### Source

Repository: [`audiocontrol-org/deskwork`](https://github.com/audiocontrol-org/deskwork) — monorepo with the package at [`packages/core/`](https://github.com/audiocontrol-org/deskwork/tree/main/packages/core), the CLI at [`packages/cli/`](https://github.com/audiocontrol-org/deskwork/tree/main/packages/cli), and the studio at [`packages/studio/`](https://github.com/audiocontrol-org/deskwork/tree/main/packages/studio). The plugin shells live under [`plugins/`](https://github.com/audiocontrol-org/deskwork/tree/main/plugins).

### License

GPL-3.0-or-later — same as the monorepo. See [`LICENSE`](https://github.com/audiocontrol-org/deskwork/blob/main/LICENSE) for details.
