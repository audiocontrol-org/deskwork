# Phase 1 Data Model: governance-as-`after_implement`-extension

This slice is config + orchestration, so the "data model" is the shape of the config artifacts and the finding record, not a domain database.

## Entity: Governance extension manifest (`extension.yml`)

Spec Kit extension descriptor at `.specify/extensions/deskwork-governance/extension.yml`.

| Field | Type | Notes |
|---|---|---|
| `schema_version` | string | `"1.0"` (matches Spec Kit's extension schema) |
| `extension.id` | string | `deskwork-governance` |
| `extension.name` / `version` / `description` / `author` | string | metadata |
| `requires.speckit_version` | semver range | `">=0.9.0"` |
| `requires.tools[]` | list | `dw-lifecycle` (the deskwork CLI), `git` |
| `provides.commands[]` | list | one entry: `{ name: speckit.deskwork.govern, file: commands/speckit.deskwork.govern.md, description }` |
| `hooks.after_implement` | object | `{ command: speckit.deskwork.govern, optional: false, description }` |

Validation: must register exactly one command; the `hooks.after_implement.command` must match a `provides.commands[].name`.

## Entity: Governance command (`speckit.deskwork.govern`)

The invokable unit fired on `after_implement`. Input/output is its **contract** (see `contracts/`).

| Aspect | Value |
|---|---|
| Trigger | `after_implement` (whole-run) |
| Inputs consumed | working-tree diff (`git diff`), feature slug, plan/spec paths |
| Action | render audit prompt → run `dw-lifecycle audit-barrage` (≥2 CLI lanes) → lift findings |
| Side effects | creates an audit run-dir; appends findings to `audit-log.md` |
| Forbidden | any branch on authoring/execution tool name (Constitution III, FR-003) |

## Entity: Audit run (existing deskwork artifact)

Produced by `dw-lifecycle audit-barrage`; unchanged by this slice. Located at `.dw-lifecycle/scope-discovery/audit-runs/<timestamp>-<feature>/` with `INDEX.md`, `PROMPT.md`, `<model>.md`, `stderr/<model>.txt`.

## Entity: Finding entry (in `audit-log.md`)

Lifted from the run via `dw-lifecycle audit-barrage-lift`.

| Field | Type | Notes |
|---|---|---|
| Finding-ID | string | stable `AUDIT-<YYYYMMDD>-NN` |
| Status | enum | `open` at lift (→ `fixed-<sha>` → `verified-<date>` later) |
| Severity | enum | HIGH / MEDIUM / LOW |
| Surface | string | which artifact/region |
| Body | string | defect + fix guidance |
| cross-model | flag | set when ≥2 lanes agree |

## Entity: Seam record (research deliverable, FR-007/SC-005)

A written note (in `tooling-feedback.md` or a slice summary) capturing: (a) the context the command consumed from Spec Kit (diff/plan/feature-dir), and (b) how the command name was registered/resolved for the `claude` integration. Not a runtime entity — a documentation artifact that closes User Story 2.

## State transitions

Finding lifecycle (existing deskwork state machine, unchanged): `open → fixed-<sha> → verified-<date>` (or `acknowledged-<date>` with reason). This slice only *creates* `open` findings; later governance passes transition them.
