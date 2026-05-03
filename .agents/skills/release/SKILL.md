---
name: release
description: Run the hard-gated deskwork monorepo release flow: preconditions, version bump, operator-side publish, smoke, tag, and atomic push.
---

# Release

Use `RELEASING.md` and the helper scripts under `.claude/skills/release/` as the canonical release implementation.

Required pauses:

1. Preconditions + version choice
2. Post-bump diff review
3. Operator-side `make publish` in their own terminal
4. Smoke + tag message
5. Final push confirmation

Rules:

- no force flags
- no skipping smoke
- no agent-run interactive OTP publish
- preserve the manual/operator handoff where the flow requires it
