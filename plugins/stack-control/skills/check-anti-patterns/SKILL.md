---
name: check-anti-patterns
description: "Scan the per-codebase source tree for legacy shapes registered in anti-patterns.yaml (stackctl check-anti-patterns) — finds code matching a registered legacy fingerprint (regex / multi-pattern proximity) scoped to the enclosing stack-control installation; an empty or absent registry is a clean no-op (exit 0); --gate-mode exits 1 on findings"
---

# /stack-control:check-anti-patterns

Thin adapter over the `stackctl check-anti-patterns` verb (the vendor-neutral core; this skill adds nothing the CLI can't do — it sequences and reports). Scans the source tree **scoped to the codebase you are in** (the nearest-enclosing stack-control installation) for any code matching a legacy shape registered in `<installation>/.stack-control/scope-discovery/anti-patterns.yaml`. Refactor commits that extract a primitive append an entry naming the shape the primitive replaces, so future drift gets caught structurally even without a token-level clone match.

> Per `.claude/rules/enforcement-lives-in-skills.md`: the discipline lives in this skill body + the `stackctl` verb it calls, never in a git hook. The skill travels with the plugin install.

## Config-activated

An **empty or absent** `anti-patterns.yaml` makes this a clean no-op: the verb exits 0 and contributes nothing. The check only does work once the registry has at least one actively-enforced entry — adopters opt in by populating the registry.

## When to use

- Before opening a PR, to surface code that re-introduced a retired shape.
- During `/stack-control:govern --mode implement`.
- After a refactor, to confirm the legacy shape is gone everywhere.

## Steps

1. **Run the gate from inside the codebase you want scanned:**

   ```bash
   stackctl check-anti-patterns              # informational: prints findings, exits 0
   stackctl check-anti-patterns --gate-mode  # exit 1 on any finding (pre-commit friendly)
   ```

   Useful flags (each validated; an unknown flag exits 2):
   - `--registry <path>` — override the registry (default `<installation>/.stack-control/scope-discovery/anti-patterns.yaml`).
   - `--root <path>` — override the scan root (default: the resolved installation).
   - `--json` — machine-readable output for tooling.
   - `--quiet` — summary line only.

2. **Read the exit code:** `0` = empty registry OR no findings OR findings without `--gate-mode`; `1` = findings present under `--gate-mode`; `2` = parse / I/O / invalid-args error (the message names the cause).

3. **Address each finding** by replacing the flagged code with the canonical primitive the entry names (`replacement: <primitive> from <import>`). Per the project's no-"just for now" discipline, do not leave a flagged shape in place without an explicit operator-approved disposition.

## Notes

- A `canonical_file:` entry whose file no longer exists fails the scan loud (exit 2) — the primitive was likely renamed without updating the registry.
- Entries with `status` outside `{blessed, cursed}` (pending / ignore / tracked-holdout / withdrawn) are skipped — only actively-enforced entries produce findings.
