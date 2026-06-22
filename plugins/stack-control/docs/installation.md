# Installation Guide: stack-control opencode plugin

**Version**: 0.1.0  
**Branch**: `031-opencode-support`  
**Date**: 2026-06-22

## Prerequisites

- opencode 1.0 or later installed
- `stackctl` CLI installed and available in PATH

## Installation

### Method 1: Copy (Recommended)

Copy the plugin file to opencode's plugins directory:

```bash
cp plugins/stack-control/opencode-plugin.ts ~/.opencode/plugins/stack-control.ts
```

### Method 2: Symlink

Create a symlink to the plugin file:

```bash
ln -s $(pwd)/plugins/stack-control/opencode-plugin.ts ~/.opencode/plugins/stack-control.ts
```

## Verification

1. Restart opencode to load the plugin

2. Verify the plugin loads by checking the command palette for `/stack-control:` commands

3. Test a skill invocation:

```
/stack-control:define --help
```

## Success Criteria

- [ ] Plugin file copied to `.opencode/plugins/stack-control.ts`
- [ ] opencode restarts without errors
- [ ] `/stack-control:` commands appear in command palette
- [ ] Skill invocation returns output (delegates to `stackctl` CLI)

## Troubleshooting

### Plugin doesn't load

- Verify the file is at `~/.opencode/plugins/stack-control.ts`
- Check opencode logs for errors
- Ensure the file has proper TypeScript syntax

### Skill invocation fails

- Verify `stackctl` CLI is installed: `stackctl --version`
- Check that `stackctl` is in your PATH
- Restart opencode after installing `stackctl`

### Version mismatch warning

- The plugin version is `0.1.0`
- The CLI version is detected from `stackctl --version`
- Version mismatch is informational only
