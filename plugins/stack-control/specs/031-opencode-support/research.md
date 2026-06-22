# Research: opencode plugin architecture

**Feature**: opencode support  
**Branch**: `031-opencode-support`  
**Date**: 2026-06-22

## Decision: Single-file plugin structure

**Rationale**: The spec clarifies that the plugin should be a single file for simplicity. This aligns with opencode's typical plugin pattern where plugins are single TypeScript files exported to `.opencode/plugins/`.

**Alternatives considered**:
- Module directory structure: Rejected as overly complex for initial release. A single file is easier to install and maintain.
- Multi-file plugin with package.json: Rejected as it adds unnecessary complexity for a plugin with a single responsibility (CLI delegation).

## Decision: TypeScript implementation

**Rationale**: TypeScript is the project's standard language for plugins. It provides strict typing, which is required by Principle VI (Strict Typing & Composition).

**Alternatives considered**:
- JavaScript: Rejected due to lack of type safety.
- Rust/WASM: Rejected as overkill for this feature and would complicate distribution.

## Decision: CLI delegation via shell API

**Rationale**: The plugin should delegate all operations to the `stackctl` CLI to maintain a single source of truth. This aligns with the spec's User Story 3 (Plugin delegates to stackctl CLI).

**Implementation approach**:
- Use opencode's `$` shell API to invoke `stackctl` commands
- Capture stdout/stderr and return to opencode
- Handle non-zero exit codes as errors

**Alternatives considered**:
- Direct function calls to stackctl: Rejected as it would require bundling the CLI or creating a complex API layer.
- HTTP-based communication: Rejected as overly complex and not aligned with opencode's plugin patterns.

## Decision: Event mapping via command.executed

**Rationale**: The spec specifies that skills should be triggered via opencode's `command.executed` event when the command starts with `/stack-control:`. This is the most straightforward integration pattern.

**Implementation approach**:
- Register for `command.executed` event
- Check if command starts with `/stack-control:`
- Route to appropriate skill based on suffix (e.g., `/stack-control:define` → define skill)

**Alternatives considered**:
- Custom tool registration: Rejected as it would duplicate functionality already available via commands.
- Event hooks: Rejected as opencode's event hooks are not designed for skill invocation.

## Decision: Single file entry point

**Rationale**: The plugin should export a single function following opencode's plugin API. This simplifies installation (copy one file) and maintenance.

**Implementation approach**:
- Export a plugin function from `opencode-plugin.ts`
- Register all skills within the plugin initialization
- Use separate modules for CLI delegation, skill routing, and event mapping

**Alternatives considered**:
- Multiple entry points: Rejected as it would complicate the installation process.
- Dynamic loading: Rejected as it adds unnecessary complexity for a small plugin.

## Decision: Version reporting via package.json

**Rationale**: The plugin should report its version for compatibility checking. This is specified in User Story 5 (Plugin version sync).

**Implementation approach**:
- Read version from `package.json` in the plugin directory
- Compare with `stackctl --version` output
- Warn if versions differ

**Alternatives considered**:
- Hardcoded version: Rejected as it would require manual updates.
- Git-based version: Rejected as it's not reliable for installed plugins.

## Decision: Error handling for missing CLI

**Rationale**: The plugin must provide clear error messages when `stackctl` is not found. This is specified in FR-007.

**Implementation approach**:
- Attempt to invoke `stackctl --version` on plugin load
- If it fails, store error state and report to user on skill invocation
- Provide clear error message with installation instructions

**Alternatives considered**:
- Silent failure: Rejected as it would confuse users.
- Auto-install: Rejected as it's outside the scope of a plugin.
