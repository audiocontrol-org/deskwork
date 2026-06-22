---
id: TASK-147
title: >-
  session-start skill quotes a source-repo-only path
  (plugins/stack-control/bin/stackctl) that 404s in host installs
status: Done
assignee: []
created_date: '2026-06-16 23:37'
updated_date: '2026-06-22 17:24'
labels:
  - 'type:imported-issue'
  - bug
  - documentation
dependencies: []
references:
  - gh-480
ordinal: 147000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Friction report

**Plugin:** stack-control v0.48.1
**Skill:** `stack-control:session-start`
**Severity:** low (documentation / path-assumption mismatch — verb itself works)

### What happened

The `session-start` SKILL body instructs the agent to invoke the verb at a repo-relative path:

```bash
plugins/stack-control/bin/stackctl session-start [--at <dir>] [--json]
```

Running that path verbatim from a host project fails:

```
(eval):1: no such file or directory: plugins/stack-control/bin/stackctl
exit code 127
```

The path `plugins/stack-control/bin/stackctl` does not exist relative to the host project's working directory. In a plugin-cache install the binary actually lives at:

```
/Users/<user>/.claude/plugins/cache/deskwork/stack-control/0.48.1/bin/stackctl
```

That directory is on `PATH`, so re-invoking as bare `stackctl session-start` worked (after a one-time `npm install` of dependencies on first run for v0.48.1).

### Impact

- An agent that follows the quoted command literally hits exit 127 and has to recover by hunting for the real binary location, costing a couple of extra tool round-trips on every fresh session.
- The `plugins/stack-control/bin/stackctl` form appears to assume the agent is running inside the stack-control source repo (where that relative path is valid), not in an arbitrary host project consuming the published plugin.

### Suggested fix

In the SKILL body, quote the verb as bare `stackctl session-start` (relying on `PATH`), or note explicitly that the `plugins/stack-control/bin/stackctl` form is source-repo-only and host installs should use `stackctl` directly.

### Environment

- Host project: a separate consuming repo (not the stack-control source tree)
- Install: Claude Code plugin cache, marketplace `audiocontrol-org/deskwork`
- Platform: macOS (darwin 24.6.0)
<!-- SECTION:DESCRIPTION:END -->
