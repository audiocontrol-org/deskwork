---
name: detect-clones
description: "Legacy alias for /dw-lifecycle:check-clones — runs the jscpd clone detector against the project"
---

# /dw-lifecycle:detect-clones (legacy alias)

This skill is a **back-compat alias** for `/dw-lifecycle:check-clones`. The subcommand was renamed from `detect-clones` to `check-clones` per the Phase 6 Task 2 verb-naming pass; both names dispatch to the same handler so existing operator workflows + adopter pre-commit hooks installed by earlier versions of `install-scope-discovery-hooks` continue to work without modification.

For the canonical procedure, flags, error handling, and "When to use" guidance, follow `/dw-lifecycle:check-clones` (`plugins/dw-lifecycle/skills/check-clones/SKILL.md`).

## Steps

Forward to `/dw-lifecycle:check-clones`. The underlying CLI invocation `dw-lifecycle detect-clones [args]` dispatches to the same handler as `dw-lifecycle check-clones [args]` — same flags, same exit codes, same output. New code should prefer the canonical `check-clones` invocation.

## Migration

- **Operator-side workflow.** Replace `/dw-lifecycle:detect-clones` calls with `/dw-lifecycle:check-clones`. No behavior change.
- **Adopter-installed hooks.** Pre-commit hooks installed by an earlier version of `install-scope-discovery-hooks` invoke `dw-lifecycle detect-clones --gate-mode`. Those continue to work. To migrate the hook to the canonical name, re-run `/dw-lifecycle:install-scope-discovery-hooks --replace` — the newly-written hook chain will emit `dw-lifecycle check-clones --gate-mode`.

The legacy alias has no scheduled removal.
