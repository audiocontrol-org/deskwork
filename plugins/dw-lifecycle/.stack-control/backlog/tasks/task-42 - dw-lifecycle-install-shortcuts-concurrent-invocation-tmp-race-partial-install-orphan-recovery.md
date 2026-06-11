---
id: TASK-42
title: >-
  dw-lifecycle install-shortcuts: concurrent-invocation tmp race +
  partial-install orphan recovery
status: To Do
assignee: []
created_date: '2026-06-10 20:07'
labels:
  - 'type:imported-issue'
dependencies: []
references:
  - gh-258
ordinal: 42000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Two minor findings from the branch-level code review of `command-shortcuts` (`feature/command-shortcuts`, on `plugins/dw-lifecycle/src/subcommands/install-shortcuts.ts`) deferred from the main fix commit (4cbaba2 closed the related Important path-traversal finding only).

## 1. Concurrent install-shortcuts invocations share a single `.tmp` path

`writeManifest` in `plugins/dw-lifecycle/src/shortcuts/manifest.ts` writes to `${manifestPath}.tmp` and then `renameSync`s into place. Two parallel install-shortcuts invocations against the same `$HOME` (e.g. two terminal windows, or a session-start hook racing with a manual install) would race on the single `.tmp` filename before the atomic rename. The slower writer can overwrite the faster writer's `.tmp` mid-flight; the rename then publishes a torn-or-stale manifest.

**Reviewer's exact framing:** *"Two parallel installs would race on `${manifestPath}.tmp` before `renameSync`. Per-call unique suffix (PID + random) would fix it."*

**Proposed fix:** suffix the temp file with `process.pid` + a random 8-char hex chunk: `${manifestPath}.tmp.${pid}-${rand}`. Atomic-rename semantics still hold (same filesystem); concurrent writers no longer collide because each picks a unique tmp name.

**Threat model:** narrow — concurrent installs aren't a documented workflow, but the failure mode is silent corruption of the manifest at the exact moment the operator is making a state change, which is the worst time for a silent failure.

## 2. Partial-install failure leaves orphan shims

`installShortcuts` writes shim files in a loop before writing the manifest. If a shim `writeFileSync` throws mid-loop (disk full, permission denied on one filename, EIO, ...), N shims exist on disk under `${commandsDir}/${shimName}.md` and the manifest never gets written. The next install run sees N orphan files with no manifest entry and refuses to proceed without `--force`. The error message names `--force` as the remedy, but:

- The recovery path isn't covered by an integration test.
- The skill prose (`plugins/dw-lifecycle/skills/install-shortcuts/SKILL.md` and the README's Shortcuts section) does NOT mention this recovery flow. An operator hitting a mid-install `EACCES` would be left to infer that `--force` is safe to re-run, with no documentation backing.

**Reviewer's exact framing:** *"If a shim writeFileSync throws mid-loop during install, N shims exist with no manifest. Operator must use --force on retry. The error message already names what to do, but the failure mode isn't tested and the skill prose doesn't document the recovery path."*

**Proposed fix:** two parts.

1. **Test:** add an integration test that forces a mid-loop `writeFileSync` failure (e.g. pre-create a read-only file at one of the shim paths so the second write throws). Assert: error message names `--force`; partial shims remain on disk; a follow-up call with `--force` repairs cleanly.
2. **Docs:** add a "Recovery" subsection to the install-shortcuts SKILL prose and the README's Shortcuts section that names the failure mode and the `--force` remedy explicitly.

**Threat model:** narrow — disk-error mid-install isn't common, but the orphan state is invisible to the operator until the next install attempt, by which point the surprise factor is high.

---

Both items were surfaced by the branch-level code-review pass on `feature/command-shortcuts` at commit `6bf352d`. The Important finding (manifest path-traversal) shipped in `4cbaba2`. These two Minors are scoped together because both touch `install-shortcuts` durability — a future PR can address both in one cut.
<!-- SECTION:DESCRIPTION:END -->
