---
name: check-refactor-preconditions
description: "Commit-message gate verifying refactor preconditions for commits that close a clone group (stackctl check-refactor-preconditions) — when the message carries `Closes clones.yaml <id>`, checks canonical_side file-existence, tests_proof.sha git-resolution, and that named tests pass at HEAD; informational by default, --gate-mode exits non-zero"
---

# /stack-control:check-refactor-preconditions

Thin adapter over the `stackctl check-refactor-preconditions` verb. When a commit message names one or more clones.yaml entries via `Closes clones.yaml <id>`, the gate enforces the refactor-precondition protocol on top of parse-time validation:

- `canonical_side` points to a file that exists (when not `"all"`/`"new"`);
- `tests_proof.sha` resolves via `git rev-parse`;
- each named `tests[]` command exits 0 at HEAD;
- parse-time precondition errors surface verbatim.

Silent on commits without a refactor marker.

> Per `.claude/rules/enforcement-lives-in-skills.md`: the discipline lives in this skill body + the `stackctl` verb it calls, never in a git hook. An adopter who wants this as a hard commit-msg gate wires the verb into their own `.husky/commit-msg` — the plugin gives you the verb; the wiring is your project's call.

## When to use

- Before (or as) a commit whose message closes a clone group via a refactor.
- To validate a clones.yaml `refactor` entry you hand-edited (dispose-clone refuses to apply refactor dispositions and redirects you here).

## Steps

1. **Run from inside the codebase:**

   ```bash
   stackctl check-refactor-preconditions                          # informational: print failures, exit 0
   stackctl check-refactor-preconditions --gate-mode              # hook-friendly: exit 1 on failures
   stackctl check-refactor-preconditions --commit-msg-file <path> # commit-msg hook supplies this
   ```

   Flags (each validated; an unknown flag exits 2):
   - `--commit-msg-file <path>` / `--commit-msg <text>` — source of the commit message (default: latest commit's message).
   - `--baseline <path>` — override the per-codebase clones.yaml.
   - `--repo <path>` — override repo root.
   - `--test-timeout-seconds <n>` — per-test timeout (default 300).
   - `--skip-test-run` — skip running the named tests (validates shape only).
   - `--gate-mode` — exit 1 (rather than 0) on precondition failures.

2. **Read the exit code:** `0` = silent/clean OR failures present without `--gate-mode` (informational default, detail on stderr); `1` = failures present AND `--gate-mode` set; `2` = infra error.

## Notes

- Per-codebase default: the baseline is the nearest-enclosing stack-control installation's clones.yaml.
- The default informational mode prints failures but exits 0, so the gate can be run ad-hoc without terminating a session; `--gate-mode` is the hook-wiring shape.
- The marker grammar is `Closes clones.yaml <id>` (ids are 12 lowercase hex chars; comma/space-separated and multi-line markers are supported).
