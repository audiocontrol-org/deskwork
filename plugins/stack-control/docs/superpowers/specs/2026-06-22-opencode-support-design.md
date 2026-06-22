# Design: opencode support

**Roadmap node**: `design:feature/opencode-support`  
**Created**: 2026-06-22  
**Status**: Draft

---

## problem-domain

The stack-control plugin currently supports Claude Code and Codex as coding agent hosts. Opencode is another AI coding agent with a plugin system that could benefit from stack-control's governance and lifecycle capabilities.

Opencode's plugin system allows extensions via JavaScript/TypeScript modules that hook into various events. The plugin system supports:
- Event hooks (session, tool, file, shell events)
- Custom tools
- Dependencies via package.json
- Local and npm-based plugins

The gap is that stack-control doesn't have a first-class integration with opencode's plugin format, making it difficult for opencode users to use stack-control's governance and lifecycle features.

---

## solution-space

### Alternative 1: Direct opencode plugin

Create a stack-control opencode plugin that follows opencode's plugin structure:

**Pros:**
- Follows opencode's established plugin pattern
- Automatic loading from `.opencode/plugins/`
- Native event system integration
- Easy installation (just copy plugin file)

**Cons:**
- Requires duplicating the CLI surface in plugin form
- Must re-implement skill dispatch via opencode events
- Limited to opencode's event system capabilities

**Implementation:**
- Create `plugins/stack-control/opencode-plugin.ts` with the plugin function
- Map stack-control skills to opencode events (e.g., `command.executed` for skill invocation)
- Implement custom tools for stack-control commands
- Use opencode's `$` shell API for CLI invocation

### Alternative 2: Use stackctl CLI directly

Provide stack-control as a CLI tool that opencode users can invoke directly:

**Pros:**
- No plugin implementation needed
- Single source of truth (the CLI)
- Works in any environment with stackctl installed

**Cons:**
- No automatic skill discovery in opencode
- Users must know to install stackctl separately
- Less integrated experience

### Alternative 3: Hybrid approach

Package stack-control as both a CLI and an opencode plugin, with the plugin delegating to the CLI:

**Pros:**
- Best of both worlds: integrated experience + single implementation
- Plugin handles event mapping; CLI handles execution
- Easy updates (update CLI, plugin auto-syncs)

**Cons:**
- More complex distribution
- Two packages to maintain

**Recommendation**: Alternative 1 (Direct opencode plugin) is the best approach for a first-class opencode integration. It provides the most seamless experience for opencode users and follows opencode's established patterns.

---

## decisions

1. **Implement as a direct opencode plugin** - This provides the best user experience and follows opencode's established plugin patterns.

2. **Plugin structure** - The plugin will be a TypeScript module exported from `plugins/stack-control/opencode-plugin.ts` that:
   - Exports a plugin function following opencode's plugin API
   - Maps stack-control skills to opencode events
   - Uses the existing `stackctl` CLI for command execution

3. **Event mapping** - Stack-control skills will be triggered via:
   - `command.executed` events for skill invocation
   - Custom tools exposed via opencode's tool system
   - Session events for lifecycle hooks (start/end)

4. **CLI delegation** - The plugin will delegate to the `stackctl` CLI for all operations, ensuring a single source of truth and easy maintenance.

5. **Installation path** - The plugin will be installed via:
   - Local: Copy `opencode-plugin.ts` to `.opencode/plugins/`
   - npm: Publish `@deskwork/opencode-plugin` package

---

## open-questions

1. **Which opencode events should trigger stack-control skills?**
   - Should we use `command.executed` and check for `/stack-control:` prefix?
   - Or should we register custom tools for each skill?
   - Or use a combination of both?

2. **How should the plugin handle the CLI path?**
   - Should it assume `stackctl` is on PATH?
   - Should it bundle the CLI or reference it via relative path?
   - Should it support both local and global stackctl installations?

3. **What about the `stackctl` CLI installation?**
   - Should the plugin auto-install stackctl if missing?
   - Or should it require pre-installation?
   - What's the user experience for first-time setup?

4. **Should we expose stack-control skills as opencode custom tools?**
   - This would allow calling them via `/tool mytool` syntax
   - But might duplicate functionality already available via commands

5. **How should the plugin integrate with opencode's configuration system?**
   - Should it read from opencode's config?
   - Or use its own `.stack-control/` configuration?

---

## provenance

- **Design author**: AI assistant
- **Date**: 2026-06-22
- **Trigger**: User request to add opencode support to stack-control
- **Related**: 
  - Opencode plugin documentation: https://opencode.ai/docs/plugins
  - Opencode plugin examples: https://opencode.ai/docs/ecosystem#plugins
  - stack-control plugin: `plugins/stack-control/`
  - Opencode plugin format research: Web fetch of opencode.ai/docs/plugins
