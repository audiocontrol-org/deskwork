# Plugin Contract: opencode support

**Feature**: opencode support  
**Branch**: `031-opencode-support`  
**Date**: 2026-06-22

## Plugin Entry Point

### Exported Function

```typescript
export default function plugin(): opencode.Plugin {
  // Plugin initialization
}
```

**Contract**:
- Must return an object conforming to opencode's `Plugin` interface
- Must register all stack-control skills on initialization
- Must validate `stackctl` CLI availability on load

**Error Handling**:
- If `stackctl` is not found, store error state and report on skill invocation
- If skill registration fails, throw descriptive error

---

## Skill Registration

### API

```typescript
interface SkillRegistration {
  name: string;
  command: string;
  handler: (args: string[]) => Promise<string>;
}
```

**Contract**:
- Each skill must be registered with a unique name
- Command must start with `/stack-control:`
- Handler must accept argument array and return promise of output string

**Validation**:
- Skill names must match stack-control skill names
- Command format must be `/stack-control:<skill-name>`

---

## CLI Delegation

### API

```typescript
interface CLIInvocation {
  command: string;
  args: string[];
  cwd?: string;
}

interface CLIResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}
```

**Contract**:
- Must invoke `stackctl` via opencode's shell API
- Must capture stdout, stderr, and exit code
- Must handle non-zero exit codes as errors

**Error Handling**:
- If `stackctl` is not found, return error with installation instructions
- If command fails, return stderr as error message

---

## Event Mapping

### API

```typescript
interface CommandEvent {
  type: 'command.executed';
  command: string;
  context: {
    session_id: string;
    // ... other opencode-provided context
  };
}
```

**Contract**:
- Must listen for `command.executed` events
- Must check if command starts with `/stack-control:`
- Must route to appropriate skill handler

**Validation**:
- Only process commands starting with `/stack-control:`
- Ignore other commands

---

## Version Reporting

### API

```typescript
interface VersionInfo {
  plugin: string;
  cli: string;
  match: boolean;
}
```

**Contract**:
- Must read plugin version from package.json
- Must invoke `stackctl --version` to get CLI version
- Must report whether versions match

**Error Handling**:
- If CLI version cannot be determined, report as unknown
- Warn if versions don't match
