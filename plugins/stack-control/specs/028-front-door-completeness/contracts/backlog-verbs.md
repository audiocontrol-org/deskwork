# Contract: Backlog Lifecycle Verbs

**Feature**: `028-front-door-completeness` | **Phase**: 1 | Satisfies FR-010/011/012/013/018; SC-002/003.

New sub-actions on the existing `backlog` verb (`src/subcommands/backlog.ts`), born
discoverable on the Phase-A command surface. Terminal model: one disposition
(`done`) + `--reason`, with `archive` separate (preserve-not-delete) — Clarification
2026-06-19. Backed by `src/backlog/backend.ts` (the `backlog.md` adapter; `close(id)`
already exists and sets status `Done`).

---

## B1 — `backlog done <id> --reason <r>` (FR-010)

**Signature.** `stackctl backlog done <id> --reason <reason> [--apply]`.

**Inputs.** `<id>` (positional, required); `--reason <r>` (required — carries
fixed-vs-wontfix nuance, mirrors `inbox drop`).

**Success output.**
- dry-run (default): `backlog done: dry-run — would close <id> (reason: <r>) (use --apply to write)`.
- `--apply`: records terminal disposition through the interface (status → `Done` via `backend.close`), prints `backlog done: closed <id> (reason: <r>)`. **Exit 0.**

**Error output.** Unknown id → `BacklogError` → exit 1 (never a fabricated close).
Missing `<id>` / missing `--reason` → exit 2 (usage). Empty `--reason` → exit 2.

**Mediation class.** `mutating`.

**Satisfies.** FR-010. This is the ONE closure mechanism `roadmap close-related`
re-points to (FR-018, B5).

---

## B2 — `backlog archive <id>` (FR-011)

**Signature.** `stackctl backlog archive <id> [--apply]`.

**Inputs.** `<id>` (positional, required). Item SHOULD be terminal (`Done`).

**Success output.**
- dry-run: `backlog archive: dry-run — would archive <id> (use --apply to write)`.
- `--apply`: moves the terminal item OUT of the live store while **preserving** it (never deletes — "databases preserve"). Prints `backlog archive: archived <id> (preserved)`. **Exit 0.**

**Error output.** Unknown id → exit 1. Archiving a non-terminal item → exit 2
(usage: archive a `done` item, not an open one). Missing `<id>` → exit 2.

**Invariant.** The archived record remains readable after archive (a test asserts
preservation). **Edge-aware (FR-017):** archiving an item still referenced by a
`depends-on`/`part-of` roadmap edge MUST NOT dangle the edge → refuse loud (cross-
ref roadmap-verbs §RM-edge-aware-archival).

**Mediation class.** `mutating`.

**Satisfies.** FR-011, FR-017.

---

## B3 — `backlog unpromote <id>` (FR-012)

**Signature.** `stackctl backlog unpromote <id> [--apply]`.

**Inputs.** `<id>` (positional, required) — a previously-promoted item.

**Success output.**
- dry-run: `backlog unpromote: dry-run — would remove promotion linkage on <id> (use --apply to write)`.
- `--apply`: removes the promotion linkage `backlog promote` recorded (the inverse of `promote`). Prints `backlog unpromote: removed promotion linkage on <id>`. **Exit 0.**

**Error output.** Unknown id → exit 1. An item with no promotion linkage → exit 2
(usage: nothing to unpromote). Missing `<id>` → exit 2.

**Mediation class.** `mutating`.

**Satisfies.** FR-012.

---

## B4 — `backlog capture` hardening (FR-013)

**Signature (unchanged).** `stackctl backlog capture <title> --type <t> [--ref <r>] [--body <b>]`.

**New contract.**
- **Filename safety:** the on-disk filename is derived slugify + truncate within OS limits — a long title MUST NOT raise `ENAMETOOLONG`. A test drives a title past the OS limit and asserts a clean capture.
- **Dedupe by `--ref`:** when `--ref <r>` matches an existing item (`backend.exists(ref)`), capture dedupes rather than silently creating a duplicate — it reports the existing id instead of creating a second.

**Success output.** `backlog capture: <id>` (existing), or `backlog capture: <id>
(already captured for ref <r>)` on a dedupe hit. **Exit 0.**

**Error output.** Empty title / missing `--type` / unknown `--type` → exit 2
(existing). A malformed store blocking the dedupe integrity check → exit 2
(`BacklogError`, the existing `exists()` fail-loud-on-undecidable-negative behavior).

**Mediation class.** `mutating`.

**Satisfies.** FR-013.

---

## B5 — `roadmap close-related` re-point (FR-018)

**Contract.** `roadmap close-related` (`src/subcommands/roadmap.ts`, already calls
`backend.close`) is re-pointed to call the SAME backlog-closure path as `backlog
done` (B1), so there is exactly one closure mechanism, not two divergent paths.

**Behavior unchanged for the operator:** `roadmap close-related <item>` still closes
the recorded `closes:`/`ref:` ids of a terminal node; internally it routes through
the shared closure used by `backlog done`.

**Satisfies.** FR-018.

---

## Exit-code summary

| Outcome | Exit |
|---|---|
| dry-run or `--apply` success | 0 |
| Unknown id / backend non-zero (runtime fail-loud) | 1 |
| Usage (missing positional/flag, non-terminal archive, nothing-to-unpromote, dangling-edge refusal) | 2 |
