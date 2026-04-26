## PRD: deskwork-plugin

### Problem Statement

The editorial calendar and workflow skills built for audiocontrol.org are locked inside a private repo. They represent hundreds of sessions of iteration on an agent-driven editorial workflow. They need to be extracted into an open-source Claude Code plugin so they are visible, installable, and usable by anyone developing content with a coding agent. The extraction must happen incrementally -- audiocontrol.org's running editorial calendar cannot stop while the plugin is built.

### Solution

Extract the editorial skills into a Claude Code plugin called "deskwork" (codename), distributed via a public monorepo that will also host future plugins (feature-image, analytics). The plugin uses an adapter layer to decouple skill logic from host project structure. An install skill explores the host project and writes a config file. Migration from project-local skills to plugin skills happens incrementally with side-by-side validation.

### Acceptance Criteria

- A public monorepo exists with the deskwork plugin structured for Claude Code plugin distribution
- The plugin includes a marketplace.json that supports git-subdir installation
- The plugin ships 9 skills: install, add, plan, draft, publish, help, status, distribute, social-review
- An adapter layer decouples plugin logic from host project structure via a config file
- The install skill explores a host project and writes the config
- audiocontrol.org runs the plugin version of all editorial skills (old project-local skills removed)
- The plugin validates against the live audiocontrol.org editorial calendar with no data loss or behavioral regression

### Out of Scope

- Feature-image plugin (future, same monorepo)
- Analytics plugin (future, same monorepo)
- Reddit, YouTube, or analytics integrations (future additions to deskwork)
- Codex or other agent plugin formats
- ~~Astro dev server studio pages~~ (now in scope — see Extension below; rendered as a standalone Hono server, not Astro)
- Editorial skills not in the core set: suggest, performance, reddit-sync, reddit-opportunities, cross-link-review, ~~iterate, approve, shortform-draft~~ (review-loop ported in commit 4b3255e; shortform/cross-link still deferred)

### Extension: severance from Astro + headless/UI split (added mid-implementation)

**Why now.** The original PRD assumed the editorial studio would remain in audiocontrol.org's Astro app. Reviewing the live workflow showed this is where most of the editorial time is actually spent, and locking it to one host project's framework defeats the open-source goal. The studio surface needs to run independently of any host project's framework.

**Friction principle.** Past MCP server experiences (notably Codex's GitHub tooling) wasted cycles via deceptive failures and security theater. Tools that aspire to elegance but introduce protocol failure surfaces are worse than nothing. The extension prefers proven CLIs invoked via Bash over MCP for v0.1.

**Plugin pattern survey.** Of 8 official Anthropic plugins surveyed, 7 ship zero code (markdown + `.mcp.json` only); the 8th (`superpowers`) ships pure bash. The `playwright` plugin demonstrates the pattern that fits us: a thin plugin pointing at an npm package the agent invokes via npx.

**New scope.**

- Three npm packages: `@deskwork/core` (lib, no entry point), `@deskwork/cli` (subcommand dispatcher invoked via npx), `@deskwork/studio` (Hono web server depending on `@deskwork/core`)
- Two plugin shells: `deskwork` (lifecycle skills invoking `@deskwork/cli`) and `deskwork-studio` (single skill that launches `@deskwork/studio`)
- Headless users install `deskwork` only — no Hono, no UI assets. Studio users opt in by enabling `deskwork-studio`.
- Studio UI assets ported verbatim from `~/work/audiocontrol.org/src/shared/` (~5,000 lines of TS + CSS that have zero Astro dependencies). The 3 Astro pages convert to HTML-string render functions (~400 lines of mechanical rewrite).
- MCP server explicitly deferred. Revisit only if friction with the CLI emerges. If it later becomes interesting, it ships as a fourth package (`@deskwork/mcp-server`) importing from `@deskwork/core`.
- npm registry publishing deferred to v0.1 cut. Initial dev uses `file:` workspace deps for local dogfood.

**Plan reference.** Approved plan: `/Users/orion/.claude/plans/i-would-like-to-wiggly-hennessy.md`

### Technical Approach

**Strategy:** Approach C -- extract existing skills with an adapter layer. The adapter handles path resolution, frontmatter I/O, and site detection. Skills call adapter functions instead of hardcoded paths. The install skill writes the adapter config by exploring the host project.

**Monorepo structure:**

```
deskwork/
+-- .claude-plugin/
|   +-- marketplace.json
+-- plugins/
|   +-- deskwork/
|   |   +-- .claude-plugin/plugin.json
|   |   +-- skills/ (9 skill directories)
|   |   +-- bin/ (helper scripts)
|   |   +-- lib/ (adapter layer)
|   |   +-- package.json
|   |   +-- README.md
|   +-- feature-image/ (future)
|   +-- analytics/ (future)
+-- README.md
+-- LICENSE
```

**Plugin skills:**

| Skill | Invocation | Purpose |
|---|---|---|
| install | /deskwork:install | Explore host project, write config, create calendar |
| add | /deskwork:add | Capture an idea in the Ideas stage |
| plan | /deskwork:plan | Move idea to Planned, set keywords/tags |
| draft | /deskwork:draft | Scaffold blog post, create GitHub issue, move to Drafting |
| publish | /deskwork:publish | Move to Published, close issue |
| help | /deskwork:help | Show workflow and current calendar status |
| status | /deskwork:status | Display calendar status across all stages |
| distribute | /deskwork:distribute | Record a share to a social platform |
| social-review | /deskwork:social-review | Show posts vs. platforms matrix |

**Adapter config** (`.deskwork/config.json`, written by install skill):

```json
{
  "sites": [
    {
      "name": "my-blog",
      "contentDir": "src/content/blog",
      "frontmatter": {
        "titleField": "title",
        "descriptionField": "description",
        "dateField": "date",
        "tagsField": "tags"
      }
    }
  ],
  "calendarPath": ".deskwork/calendar.md"
}
```

**Calendar format:** Plugin-owned. Pipe-delimited markdown tables with stages: Ideas, Planned, Drafting, Review, Published, Distribution.

### Dependencies

- Claude Code plugin system (stable, shipping)
- GitHub for monorepo hosting and marketplace distribution
- audiocontrol.org editorial calendar (the live system being migrated)

### Open Questions

- Monorepo name and GitHub org
- GitHub issue integration: opt-in via config or always-on?
- Helper script runtime: ship compiled JS in bin/, or require tsx as a peer dependency?
- Calendar file location default: .deskwork/calendar.md vs. configurable

### Design Spec

See `docs/superpowers/specs/2026-04-20-deskwork-plugin-design.md`
