# Phase 1 Data Model: Backlog slush-pile surface

The persistent shape is owned by `backlog.md` (YAML-frontmatter markdown task files under `backlog/`). This document defines the *logical* entities the feature reasons about and the project-stamped fields the adapter sets — not the backend's on-disk schema (that is backlog.md's, pinned at implementation).

## Entity: Backlog item

One unit of found work in the slush pile. The unit of capture and of later triage.

| Field | Meaning | Source / rule |
|---|---|---|
| `title` | Short description of the found work | Required on capture; non-empty (else fail-loud, FR-001/edge). |
| `type` | `bug` \| `gap` \| `imported-issue` \| `migrated-finding` | `capture` requires at minimum `bug`/`gap` (FR-002). `imported-issue`/`migrated-finding` are set by the import paths to mark provenance class. |
| `priority` | Backlog priority | Set for `migrated-finding` from finding severity (FR-019); default/unset for plain captures (triage assigns later — capture ≠ scope, FR-003). |
| `labels` | Project + carried labels | `capture` stamps a project label (e.g. `agent-found`). `import-github` carries the issue's labels (FR-014). |
| `ref` | Provenance backlink | `import-github`: source issue URL / `gh-NNN` (FR-011). `migrated-finding`: a link to the audit-log entry + barrage finding id (FR-016). Optional on plain capture (FR-002). |
| `status` | Backlog lifecycle status | Owned by backlog.md (its `config.yml` statuses). New items start at the configured initial status; this feature does not impose its own status vocabulary. |
| `body` | Detail / context | Optional free text; for `import-github`, the issue body (handled as arbitrary text incl. `#`, FR-015). |

**Identity / uniqueness**: backlog.md assigns the task id. For idempotency, an *imported* item's identity for de-dup is its `ref` (`gh-NNN` for issues; the barrage finding id for migrated findings) — re-running an import skips items whose `ref` already exists (FR-012, FR-021). No content-hash dedup (concurrency/semantic-dedup deferred, spec § Out of Scope).

## Entity: Backlog (the pile)

The collection of backlog items under `backlog/`, committed markdown. Separate from `ROADMAP.md` — capturing never writes the roadmap (FR-004). Reviewed via `list` (read-only, FR-007) and backlog.md's native `board`/`show` (delegated, Principle VIII).

## Entity: Source GitHub issue (import input, external)

Read-only snapshot input: `number`, `title`, `body`, `labels`, `url`. Canonical and unmodified (FR-010). Mapped → a backlog item of type `imported-issue` with `ref = gh-<number>` and carried labels.

## Entity: Parked audit finding (migration input, internal)

A residual cross-model audit-barrage finding the convergence-loop dampener parks. Severity ∈ {MEDIUM, LOW} (HIGH is **never** parked, FR-018). Carries: originating feature slug, barrage finding id, severity, and its audit-log entry location. Mapped → a backlog item of type `migrated-finding` with `priority = severity→priority(severity)` and `ref` = audit-log backlink.

## Mappings (pure, unit-tested — `src/backlog/mappings.ts`)

- **type/label stamp**: `capture` input type → backlog `type` + the project label (`agent-found`).
- **GitHub label carry**: issue labels → backlog labels (carried verbatim; mapping is identity unless a project rename is later introduced).
- **severity → priority**: barrage severity (MEDIUM/LOW) → backlog priority. HIGH is excluded upstream (the dampener never parks it); the mapping does not need a HIGH case, and an unexpected HIGH reaching the mapping fails loud (Principle V).

## State / lifecycle notes

- **Capture** is terminal-for-this-feature: it records an item; triage/promotion to a status or to `ROADMAP.md` is a later, separate, operator-driven act (FR-003; promotion seam is out of scope).
- **slush migration** is a one-way move of the *destination* of a parked finding:
  - audit-log entry: `acknowledged-slush-pile-<date>` (old) → `migrated-to-backlog <task-id>` (new). The dampener *decision* (when to park) is unchanged (FR-016/FR-017).
  - The audit-log remains the clean open/fixed convergence ledger (FR-020).
- **Idempotency** is enforced on both imports by `ref` existence (FR-012, FR-021), so re-runs are safe no-ops for already-present items.
