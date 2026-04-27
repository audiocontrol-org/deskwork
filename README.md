## deskwork

Open-source plugins for [Claude Code](https://claude.com/claude-code). Flagship plugin `deskwork` — an editorial calendar lifecycle tool — is the first inhabitant of this monorepo; `feature-image` and `analytics` will follow.

### Plugins

| Name | Status | Purpose |
|---|---|---|
| `deskwork` | Shipping (v0 — pre-npm publish; see caveat below) | Editorial calendar lifecycle: capture, plan, outline, draft, review, publish |
| `deskwork-studio` | Shipping (v0 — pre-npm publish; see caveat below) | Optional local Hono web surface — dashboard, review pane, scrapbook, manual |
| `feature-image` | Planned | Feature image generation for blog posts and pages |
| `analytics` | Planned | Content performance analytics |

### Installation

The monorepo publishes a Claude Code marketplace at the repository root. Inside any Claude Code session:

```
/plugin marketplace add https://github.com/audiocontrol-org/deskwork
/plugin install deskwork@deskwork
/plugin install deskwork-studio@deskwork    # optional companion
```

Then bootstrap the host project:

```
/deskwork:install
```

**Pre-publish caveat:** `@deskwork/cli` and `@deskwork/studio` aren't on npm yet. The plugins' bin wrappers resolve to workspace-linked binaries inside the monorepo. To make a fresh `claude plugin install` runnable end-to-end, run `npm install` once inside the cloned plugin's directory (Claude's plugin cache). Tracked for fix in v0.1 (npm publish + npx fallback restoration).

See each plugin's `README.md` under `plugins/` for configuration and usage.

### Repository layout

```
deskwork/
├── .claude-plugin/
│   └── marketplace.json     # Marketplace manifest (lists each plugin)
├── packages/
│   ├── core/                # @deskwork/core — pure lib (no entry point)
│   ├── cli/                 # @deskwork/cli — single-dispatcher CLI
│   └── studio/              # @deskwork/studio — Hono web server
├── plugins/
│   ├── deskwork/            # Lifecycle plugin shell (SKILL.md + bash wrapper)
│   └── deskwork-studio/     # Studio plugin shell (single launch skill)
├── docs/                    # Feature PRDs, workplans, implementation notes
├── package.json             # npm workspaces root
├── LICENSE
└── README.md
```

Plugins are self-contained — no cross-plugin `../` imports. The plugin shells are thin (manifest + SKILL.md + bash wrapper); all logic lives in the npm packages under `packages/`.

### Development

See `docs/1.0/001-IN-PROGRESS/` for active feature work. The repo uses the feature lifecycle skills under `.claude/skills/feature-*` — run `/feature-help` for an overview.

### License

GPL-3.0-or-later. See `LICENSE`.
