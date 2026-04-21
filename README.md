## deskwork

Open-source plugins for [Claude Code](https://claude.com/claude-code). Flagship plugin `deskwork` — an editorial calendar lifecycle tool — is the first inhabitant of this monorepo; `feature-image` and `analytics` will follow.

### Plugins

| Name | Status | Purpose |
|---|---|---|
| `deskwork` | In progress | Editorial calendar lifecycle: capture, plan, draft, publish, distribute |
| `feature-image` | Planned | Feature image generation for blog posts and pages |
| `analytics` | Planned | Content performance analytics |

### Installation

The monorepo publishes a Claude Code marketplace at the repository root. Install a specific plugin with:

```
/plugin install --marketplace https://github.com/audiocontrol-org/deskwork <plugin-name>
```

See each plugin's `README.md` for configuration and usage.

### Repository layout

```
deskwork/
├── .claude-plugin/
│   └── marketplace.json      # Marketplace manifest (git-subdir entries)
├── plugins/
│   └── <plugin>/              # Self-contained plugin directory
│       ├── .claude-plugin/
│       │   └── plugin.json
│       ├── skills/            # SKILL.md per skill
│       ├── bin/               # Helper scripts (added to PATH)
│       ├── lib/               # Library code (adapter, helpers)
│       ├── package.json
│       └── README.md
├── docs/                      # Feature PRDs, workplans, implementation notes
├── LICENSE
└── README.md
```

Each plugin is self-contained — no cross-plugin `../` imports.

### Development

See `docs/1.0/001-IN-PROGRESS/` for active feature work. The repo uses the feature lifecycle skills under `.claude/skills/feature-*` — run `/feature-help` for an overview.

### License

GPL-3.0-or-later. See `LICENSE`.
