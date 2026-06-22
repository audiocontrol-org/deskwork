# Quickstart: opencode support

**Feature**: opencode support  
**Branch**: `031-opencode-support`  
**Date**: 2026-06-22

## Prerequisites

- opencode 1.0 or later installed
- `stackctl` CLI installed and available in PATH
- Node.js runtime (for TypeScript compilation)

## Setup

1. Copy the plugin file to opencode's plugins directory:

```bash
cp plugins/stack-control/opencode-plugin.ts ~/.opencode/plugins/stack-control.ts
```

2. Restart opencode to load the plugin

3. Verify the plugin loads:

```bash
# In opencode session
/stack-control:define --help
```

## Validation

### Test 1: Plugin Installation

**Setup**: Plugin file copied to `.opencode/plugins/stack-control.ts`

**Commands**:
```bash
# Restart opencode
opencode --restart
```

**Expected**: Plugin loads without errors

**Verification**: Plugin version is reported on skill invocation

---

### Test 2: Skill Invocation

**Setup**: Plugin installed, `stackctl` CLI available

**Commands**:
```bash
# In opencode session
/stack-control:define
```

**Expected**: Skill is invoked and spec authoring chain begins

**Verification**: Output matches `stackctl define` output

---

### Test 3: CLI Delegation

**Setup**: Plugin installed, `stackctl` CLI available

**Commands**:
```bash
# In opencode session
/stack-control:workflow compass design:feature/opencode-support
```

**Expected**: Command delegates to `stackctl` and returns output

**Verification**: Output matches direct CLI invocation

---

### Test 4: Missing CLI Handling

**Setup**: Plugin installed, `stackctl` CLI not available

**Commands**:
```bash
# In opencode session
/stack-control:workflow compass design:feature/opencode-support
```

**Expected**: Clear error message about missing CLI

**Verification**: Error message includes installation instructions

---

### Test 5: Version Mismatch Warning

**Setup**: Plugin installed with version mismatch

**Commands**:
```bash
# In opencode session
/stack-control:define
```

**Expected**: Warning about version mismatch

**Verification**: Warning includes plugin and CLI versions
