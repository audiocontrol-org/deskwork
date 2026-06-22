# Data Model: opencode support

**Feature**: opencode support  
**Branch**: `031-opencode-support`  
**Date**: 2026-06-22

## Entities

### Plugin

Represents the opencode plugin module.

**Fields**:
- `name`: string - Plugin identifier (`stack-control`)
- `version`: string - Plugin version (from package.json)
- `skills`: Skill[] - Registered skills

**Relationships**:
- Has many Skills

**Validation rules**:
- Version must match `stackctl` CLI version (with warning if mismatch)
- Skills must have unique names

**State transitions**:
- N/A (plugin is stateless)

---

### Skill

Represents a stack-control skill registered with opencode.

**Fields**:
- `name`: string - Skill name (e.g., `define`, `extend`, `execute`)
- `commandPrefix`: string - Command prefix (`/stack-control:`)
- `handler`: function - Skill execution handler

**Relationships**:
- Belongs to Plugin
- Has many Event mappings

**Validation rules**:
- Name must match stack-control skill names
- Handler must be a callable function

**State transitions**:
- N/A (skills are static)

---

### CLI

Represents the `stackctl` command-line interface.

**Fields**:
- `path`: string - CLI executable path
- `version`: string - CLI version
- `available`: boolean - Whether CLI is accessible

**Relationships**:
- Used by Plugin for execution

**Validation rules**:
- Path must be valid executable
- Version must be parseable (semantic versioning)

**State transitions**:
- `available: true` → `available: false` when CLI becomes inaccessible
- `available: false` → `available: true` when CLI becomes accessible

---

### Session

Represents an opencode session context.

**Fields**:
- `id`: string - Session identifier
- `context`: object - Session context data

**Relationships**:
- Used by Plugin for skill invocation

**Validation rules**:
- ID must be unique within plugin lifetime

**State transitions**:
- N/A (sessions are ephemeral)

---

## Data Flow

1. **Plugin Load**:
   - Read `package.json` for version
   - Validate `stackctl` CLI availability
   - Load skills from `skills.ts`
   - Register skills with opencode

2. **Skill Invocation**:
   - opencode fires `command.executed` event
   - Plugin checks if command starts with `/stack-control:`
   - Route to appropriate skill handler
   - Skill handler invokes `stackctl <command>` via shell API
   - Output returned to opencode

3. **Version Check**:
   - Plugin reads `package.json` version
   - Plugin invokes `stackctl --version`
   - Compare versions
   - Warn if mismatch
