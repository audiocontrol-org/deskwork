# Plugin: opencode support

**Version**: 0.1.0  
**Branch**: `031-opencode-support`  
**Date**: 2026-06-22

## Overview

stack-control plugin for opencode that delegates all operations to the `stackctl` CLI.

## Installation

Copy the plugin file to opencode's plugins directory:

```bash
cp plugins/stack-control/opencode-plugin.ts ~/.opencode/plugins/stack-control.ts
```

Restart opencode to load the plugin.

## Prerequisites

- opencode 1.0 or later
- `stackctl` CLI installed and available in PATH

## Usage

Once installed, stack-control skills are available through opencode's command system:

```
/stack-control:define
/stack-control:extend
/stack-control:execute
```

## Development

### Build

```bash
cd plugins/stack-control/opencode
npm install
npm run build
```

### Test

```bash
npm test
```

## License

MIT
