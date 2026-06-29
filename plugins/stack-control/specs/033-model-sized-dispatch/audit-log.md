---
slug: 033-model-sized-dispatch
targetVersion: ""
---

# Audit log — 033-model-sized-dispatch

## 2026-06-29 — audit-barrage lift (end-govern-after_implement)

### AUDIT-20260629-01 — Empty `[tier:]` tag generates double error: parse error + resolution error for the same task

Finding-ID: AUDIT-20260629-01
Status:     open
Severity:   high
Per-lane:   claude=high
Decision:   adjudicated (gate-counted high) — blast-radius=unstated, reachability=unstated, fix-debt=no; no down-calibration signal — high retained.
Surface:    src/execute/tasks-tier-parser.ts:63–98 + src/subcommands/resolve-tiers.ts:72–84

In `tasks-tier-parser.ts`, when a task has `[tier:]` (present but empty), the parser pushes a `ParseError` of category `empty-tier` but does **not** `continue` — the task is still pushed to `tasks[]` with `tierLabel: undefined`. Compare the `missing-body` case two lines later (lines 78–81), which uses `continue` to exclude the task. The empty-tier case has no such guard.

As a result, when `resolve-tiers.ts` calls `resolveTasks(tasks, ...)`, this task generates a second `TierError` of category `no-tier`: "task T004 has no model tier declared". Both are emitted to stderr:
```
resolve-tiers: empty-tier: task T004 has an empty [tier:] tag (line N)
resolve-tiers: no-tier: task T004 has no model tier declared
```
The operator sees two errors for a single problem and cannot tell which one is the actionable signal. The fix is to add `continue` after the empty-tier error push (mirroring the `missing-body` pattern), so the malformed-declaration task is excluded from `tasks[]` entirely.

The test at `tasks-tier-parser.test.ts:37` destructures only `{ errors }`, not `{ tasks, errors }`, so it cannot detect that T004 is still added to `tasks[]` despite the error. Adding an assertion that `tasks` does not include T004 would pin the fix.

---

### AUDIT-20260629-02 — Codex-only model allowlist makes the host-agnostic tier map unusable on non-Claude hosts

Finding-ID: AUDIT-20260629-02
Status:     open
Severity:   high
Per-lane:   codex=high
Decision:   single-model (gate-counted high)
Surface:    src/execute/accepted-models.ts:14-20; src/config/config-loader.ts:11-117; specs/033-model-sized-dispatch/spec.md:240-248

The implementation makes `haiku|sonnet|opus|fable` the single accepted model set in `src/execute/accepted-models.ts:14-20`, and `parseInstallationConfig()` rejects any `tier_map` value outside that set during ordinary config load via `src/config/config-loader.ts:11` and `src/config/config-loader.ts:113-117`. That means an installation running on the other named target, Codex, cannot configure a Codex-valid model keyword at all; the config loader fails before `/stack-control:execute` reaches the skill-level host-capability check described in `spec.md:240-248`.

Blast radius is high because this breaks the stated portability surface, not just a rare edge case. A downstream adopter on Codex who follows the “backend-agnostic tier discipline” language will hit a hard config error for the correct host-specific model values. A reasonable fix is to move accepted-model validation behind a dispatch-surface capability resolver, or make the configured host/model vocabulary explicit installation data rather than importing the Claude Code set into the global config loader.
