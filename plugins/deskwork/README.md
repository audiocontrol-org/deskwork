## deskwork

Editorial calendar lifecycle plugin for [Claude Code](https://claude.com/claude-code). Capture ideas, plan drafts, publish, and track distribution through an agent-driven workflow.

### Status

Phase 1 — plugin skeleton only. The `install` skill exists but is not yet functional. Lifecycle skills (`add`, `plan`, `draft`, `publish`, `help`, `status`, `distribute`, `social-review`) are added incrementally in later phases.

### Install

From the deskwork marketplace:

```
/plugin marketplace add https://github.com/audiocontrol-org/deskwork
/plugin install deskwork@deskwork
```

For local development, point Claude Code at this plugin directory:

```
claude --plugin-dir plugins/deskwork
```

### Usage

All skills are namespaced under `deskwork:`. Once the plugin is installed, run:

```
/deskwork:install
```

to bootstrap a host project. The install skill writes `.deskwork/config.json` and creates an editorial calendar file.

### Skills

| Skill | Purpose | Status |
|---|---|---|
| `install` | Bootstrap deskwork in a host project | Skeleton (Phase 1) |
| `add` | Capture a new editorial idea | Planned (Phase 3) |
| `plan` | Move an idea to planned drafts | Planned (Phase 3) |
| `draft` | Create a draft from a planned item | Planned (Phase 3) |
| `publish` | Mark a draft published | Planned (Phase 3) |
| `help` | Show the editorial workflow | Planned (Phase 5) |
| `status` | Display calendar state by stage | Planned (Phase 5) |
| `distribute` | Track cross-posting and syndication | Planned (Phase 5) |
| `social-review` | Review social posts against the calendar | Planned (Phase 5) |

### Configuration

Managed by the `install` skill (Phase 2). Configuration lives in `.deskwork/config.json` in the host project and describes content locations, site layout, and frontmatter conventions.

### License

GPL-3.0-or-later. See the monorepo `LICENSE`.
