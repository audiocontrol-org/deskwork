# Feature Specification: opencode support

**Feature Branch**: `feature/stack-control-opencode`

**Created**: 2026-06-22

**Status**: Draft

**Input**: User description: "Add first-class support for opencode as a coding agent host. The stack-control plugin registers the primary lifecycle skills (define, extend, execute, workflow, roadmap) and delegates to the `stackctl` CLI for all operations."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Use stack-control skills in opencode (Priority: P1)

Opencode users want to use stack-control's governance and lifecycle capabilities directly within opencode. They should be able to invoke stack-control skills (like defining features, planning, executing) without leaving the opencode environment.

**Why this priority**: This is the core value proposition - enabling opencode users to leverage stack-control's workflow capabilities natively. Without this, opencode users must use the CLI separately, creating friction.

**Independent Test**: Can be fully tested by installing the stack-control opencode plugin, opening a session, and invoking `/stack-control:define` to create a new feature spec. Delivers immediate workflow capability within opencode.

**Acceptance Scenarios**:

1. **Given** opencode is installed with the stack-control plugin, **When** user types `/stack-control:define`, **Then** the skill is invoked and the spec authoring chain begins
2. **Given** user has invoked a stack-control skill, **When** the skill requires CLI operations, **Then** the plugin delegates to the local `stackctl` CLI
3. **Given** user is in an opencode session, **When** they invoke `/stack-control:extend`, **Then** the skill executes in the installation context

---

### User Story 2 - Install stack-control plugin in opencode (Priority: P1)

Opencode users need a straightforward way to install the stack-control plugin. They should be able to copy the plugin file to their opencode plugins directory.

**Why this priority**: Without installation, the feature doesn't exist. This is the entry point for all opencode users.

**Independent Test**: Can be fully tested by copying `opencode-plugin.ts` to `.opencode/plugins/stack-control.ts` and verifying the plugin loads on opencode restart. Delivers the plugin file for user consumption.

**Acceptance Scenarios**:

1. **Given** user has the stack-control plugin file, **When** they copy it to `.opencode/plugins/stack-control.ts`, **Then** opencode loads the plugin on next start
2. **Given** opencode loads the stack-control plugin, **When** the plugin initializes, **Then** it exports the plugin function following opencode's plugin API
3. **Given** plugin is loaded, **When** user types any stack-control skill, **Then** the skill is available in the command menu

---

### User Story 3 - Plugin delegates to stackctl CLI (Priority: P2)

The opencode plugin should delegate all stack-control operations to the `stackctl` CLI. Users shouldn't need to know about the CLI, but it must be available for the plugin to function.

**Why this priority**: This ensures a single source of truth for stack-control functionality. The plugin is just a wrapper that maps events to CLI commands.

**Independent Test**: Can be fully tested by running stack-control skills via the plugin and verifying CLI commands execute. Delivers CLI delegation as the execution model.

**Acceptance Scenarios**:

1. **Given** plugin receives a skill invocation, **When** the skill requires execution, **Then** the plugin invokes `stackctl <command>` via the shell API with the opencode session's active project/workspace as the working context
2. **Given** `stackctl` is not installed, **When** plugin tries to execute a command, **Then** the plugin reports a clear error about missing CLI
3. **Given** CLI command completes, **When** output is returned, **Then** the plugin formats and returns it to opencode

Note: `/stack-control:version` is an exception that reports plugin-local metadata, not a CLI operation.

---

### User Story 4 - Skill mapping to opencode events (Priority: P2)

Stack-control skills must be properly mapped to opencode's event system. Users should be able to invoke skills through natural command patterns.

**Why this priority**: Without proper event mapping, skills won't be triggered. This is the integration glue between opencode and stack-control.

**Independent Test**: Can be fully tested by verifying skill invocation via opencode's command system. Delivers the event-to-skill mapping.

**Acceptance Scenarios**:

1. **Given** opencode fires a `command.executed` event, **When** the command starts with `/stack-control:`, **Then** the plugin routes it to the appropriate skill
2. **Given** user types a skill name, **When** the skill is registered, **Then** it appears in opencode's command palette
3. **Given** plugin loads, **When** the plugin function is called, **Then** it registers the primary lifecycle skills (`define`, `extend`, `execute`, `workflow`, `roadmap`) with opencode

---

### User Story 5 - Plugin version sync with stackctl CLI (Priority: P3)

The plugin version should match the `stackctl` CLI version to avoid compatibility issues. Users should be able to verify version alignment.

**Why this priority**: This is important for maintainability but not critical for first release. Users can manually ensure alignment if needed.

**Independent Test**: Can be fully tested by comparing plugin version to CLI version. Delivers version consistency checking.

**Acceptance Scenarios**:

1. **Given** user runs `/stack-control:version`, **When** the command is invoked, **Then** plugin reports only its version
2. **Given** CLI version differs from plugin version, **When** user runs a skill, **Then** a warning is displayed about version mismatch
3. **Given** user runs `/stack-control:version`, **When** the command is invoked, **Then** the plugin version is displayed

Note: `/stack-control:version` is plugin-local and does not invoke `stackctl`. CLI version detection happens silently for mismatch warnings on skill invocation.

---

### Edge Cases

- What happens when the opencode session ends during a long-running stack-control skill?
- How does the plugin handle errors from the `stackctl` CLI (non-zero exit codes)?
- What if the user has multiple opencode sessions running simultaneously?
- How does the plugin handle network timeouts or file system errors during CLI execution?
- What happens if `stackctl` CLI is installed globally but not in PATH?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The plugin MUST export a function following opencode's plugin API signature
- **FR-002**: The plugin MUST register the primary lifecycle skills when loaded (`define`, `extend`, `execute`, `workflow`, `roadmap`)
- **FR-003**: The plugin MUST delegate skill execution to the `stackctl` CLI via the shell API, except for `/stack-control:version` which reports the plugin-local version
- **FR-004**: The plugin MUST forward skill arguments to the CLI as command arguments, preserving opencode command argument token boundaries and quoting semantics (e.g., `/stack-control:define "opencode support"` passes command `define` and one argument with value `opencode support` to `stackctl`)
- **FR-005**: The plugin MUST capture CLI output and return it to opencode
- **FR-006**: The plugin MUST handle CLI errors (non-zero exit codes) and report them to opencode
- **FR-007**: The plugin MUST provide a clear error message when `stackctl` CLI is not found
- **FR-008**: The plugin MUST map `/stack-control:` prefixed commands to the appropriate skill; unknown commands produce a clear "unknown stack-control command" error
- **FR-009**: The plugin MUST load from `.opencode/plugins/stack-control.ts` (local file installation)
- **FR-010**: The plugin MUST support npm package installation by exporting a default function that opencode loads from `node_modules/@stack-control/opencode-plugin` (npm package entrypoint is the same single file)
- **FR-011**: The plugin MUST expose a `/stack-control:version` command that reports only the plugin version
- **FR-012**: The plugin MUST detect version mismatch between plugin and CLI and warn users when a skill is invoked

### Key Entities

- **Plugin**: The opencode plugin module that exports the plugin function and skill mappings
- **Skill**: A stack-control skill that is registered with opencode. The set of skills registered by the plugin is: `define`, `extend`, `execute`, `workflow`, `roadmap` (the primary lifecycle skills)
- **CLI**: The `stackctl` command-line interface that performs actual stack-control operations
- **Session**: An opencode session context that the plugin uses for skill invocation

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can install the stack-control plugin and invoke `/stack-control:define` within 5 minutes of first opening opencode
- **SC-002**: Plugin successfully delegates all five listed happy-path skill invocations to the CLI without errors (`/stack-control:define`, `/stack-control:extend`, `/stack-control:execute`, `/stack-control:workflow`, `/stack-control:roadmap`)
- **SC-003**: Skill invocation latency (from typing command to first output) is under 2 seconds for local CLI
- **SC-004**: Plugin works with opencode versions 1.0 and later (tested against opencode 1.0+; compatibility with future versions depends on opencode's plugin API stability)
- **SC-005**: Plugin loads successfully in opencode without requiring additional configuration

## Clarifications

### Session 2026-06-22

- Q: How should the opencode plugin be structured? → A: Single file (`opencode-plugin.ts`) for both local copy and npm package entrypoint
- Q: Which stack-control skills are registered with opencode? → A: `define`, `extend`, `execute`, `workflow`, `roadmap`, `version` (primary lifecycle skills + version command)
- Q: How does npm installation work? → A: Plugin exports default function; npm package entrypoint is the same single file
- Q: What happens with unknown `/stack-control:` commands? → A: Clear "unknown stack-control command" error
- Q: What happens with `/speckit-*` commands? → A: Not supported in this feature; only `/stack-control:` commands are routed
- Q: How are version mismatches detected? → A: Plugin detects mismatch and warns on skill invocation; users manually resolve

## Assumptions

- Users have `stackctl` CLI installed and available in their PATH (or opencode has access to it via shell)
- Opencode users have basic familiarity with stack-control concepts (roadmap, workflow, phases)
- The opencode plugin system supports the event hooks needed (command.executed, session events)
- The plugin detects version mismatch and warns users; users manually resolve mismatches
- The plugin is installed per-project (not globally for all opencode sessions)
- Opencode's shell API (`$`) provides sufficient functionality for CLI invocation
- Users have appropriate file system permissions to install the plugin in `.opencode/plugins/`
- The plugin will be a single file (`opencode-plugin.ts`) rather than a module directory
- Skill invocations execute `stackctl` with the opencode session's active project/workspace as the working context
