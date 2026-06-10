---
name: check-clones
description: "Run the per-codebase clone-detection gate (stackctl check-clones) — finds duplicated TypeScript/TSX spans scoped to the enclosing stack-control installation, never cross-codebase; reports NEW groups vs the committed baseline and prints paste-ready batch-dispose hints"
---

# /stack-control:check-clones

Thin adapter over the `stackctl check-clones` verb (the vendor-neutral core; this skill adds nothing the CLI can't do — it sequences and reports). Detects duplicated code **scoped to the codebase you are in**: the scan boundary is the nearest-enclosing stack-control installation (the directory whose `.stack-control/config.yaml` encloses your cwd), and any nested child installation subtree is excluded. This is the per-codebase default — it never scans the whole repo, so vendored copies from another codebase (e.g. audit-barrage vendored from dw-lifecycle) are not flagged as clones of their origin.

> Per `.claude/rules/enforcement-lives-in-skills.md`: the discipline lives in this skill body + the `stackctl` verb it calls, never in a git hook. The skill travels with the plugin install.

## When to use

- Before opening a PR, to surface NEW duplication introduced on the branch.
- During `/stack-control:govern --mode implement` (the govern clone step calls this verb).
- After a refactor, to confirm a duplicate was actually collapsed (it drops from the baseline).

## Steps

1. **Run the gate from inside the codebase you want scanned:**

   ```bash
   stackctl check-clones            # default: scope to the enclosing installation
   stackctl check-clones --gate-mode  # exit 1 on any NEW group (pre-commit friendly)
   ```

   Useful flags (each validated; an unknown flag exits 2):
   - `--root <path>` — override the scan root (non-default; default is the resolved installation).
   - `--baseline <path>` — override the committed baseline (default `<installation>/.stack-control/scope-discovery/clones.yaml`).
   - `--diff` — print only NEW + DROPPED groups.
   - `--json` — machine-readable output for tooling.
   - `--quiet` — summary line only.
   - `--refresh-baseline` — rewrite the baseline from this run, carrying forward operator dispositions.

2. **Read the exit code:** `0` = no NEW groups (or first-run baseline written); `1` = one or more NEW groups since the baseline; `2` = I/O / parse / engine error (the message names the cause).

3. **Disposition any NEW group** the gate surfaces using the printed `stackctl batch-dispose` hint, or `/stack-control:dispose-clone`. A NEW group is not "done" until it is either collapsed (refactor) or dispositioned with a reason. Per the project's no-"just for now" discipline, do not leave a NEW clone undispositioned.

## Notes

- First run in a fresh codebase writes the initial baseline (every detected group at `pending`) and exits 0; subsequent runs compare against it.
- A present-but-malformed baseline fails loud (exit 2) rather than being silently overwritten — hand-fix the YAML or remove it to regenerate.
