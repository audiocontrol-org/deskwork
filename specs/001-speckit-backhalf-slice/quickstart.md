# Quickstart: validate governance fires after Spec Kit implements

Runnable validation that proves the slice end-to-end. Details live in `contracts/governance-extension.contract.md` and `data-model.md`; this is the run guide.

## Prerequisites

- Spec Kit 0.9.4 installed (`specify version`), project initialized (`.specify/` present).
- deskwork CLI on PATH (`dw-lifecycle --help`), with the audit-barrage battery configured for ≥2 lanes (claude + codex).
- The `deskwork-governance` extension authored at `.specify/extensions/deskwork-governance/`.

## Setup

```bash
# Install the local extension (dev mode)
specify extension add .specify/extensions/deskwork-governance --dev --force

# Confirm it registered + wired the after_implement hook
specify extension list                       # deskwork-governance enabled
grep -A2 after_implement .specify/extensions.yml   # names speckit.deskwork.govern
```

## Validate (the demonstration)

```bash
# Run Spec Kit's native implement on a feature with at least one task.
# (For the slice's own dogfood, this is /speckit-implement on tasks.md.)
#   /speckit-implement
#
# When it completes, the after_implement hook fires speckit.deskwork.govern automatically.
```

**Expected outcomes (map to Success Criteria):**

- **SC-001:** a new run-dir appears under `.dw-lifecycle/scope-discovery/audit-runs/<ts>-pluggable-lifecycle-providers/` with **no manual** `dw-lifecycle audit-barrage` invocation.
- **SC-002 / SC-004:** that run-dir's `INDEX.md` shows ≥2 model lanes (claude + codex) with positive stdout bytes; findings were lifted into `audit-log.md`.
- **SC-003:** `grep -rn` over the command + `govern.sh` finds zero authoring/execution tool-name string branches.
- **SC-005:** the seam record (context consumed + command-name resolution) is written to `tooling-feedback.md`.

## Negative / edge checks

```bash
# No-op implement (empty diff): governance runs, reports no defects, exits 0 (no error).
# dw-lifecycle absent: the command FAILS LOUDLY (no silent skip).
```

## Teardown

```bash
specify extension remove deskwork-governance   # unwire the hook when done
```
