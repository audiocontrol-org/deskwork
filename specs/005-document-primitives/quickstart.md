# Quickstart: validating document-primitives

**Feature**: `design/document-primitives` | **Date**: 2026-06-07

Runnable scenarios that prove the feature end-to-end. Each maps to a Success Criterion in [spec.md](./spec.md) and the [contracts](./contracts/). Details live in the contracts and [data-model.md](./data-model.md), not here.

## Prerequisites

- `plugins/stack-control` built/runnable via `tsx`; the three verbs registered in the `stackctl` dispatcher.
- The two proof documents exist with grammars: `plugins/stack-control/DESIGN-INBOX.md` (title-keyed) and `plugins/stack-control/ROADMAP.md` (`<phase>/<slug>`-keyed).
- Built-in grammars present: `plugins/stack-control/grammars/{design-inbox,roadmap}.peg`.

## Scenario 1 — Archive keeps a live document lean (SC-001, US1)

1. In a tmp copy of `ROADMAP.md`, ensure ≥1 row has a terminal status (`shipped`) and ≥1 is active (`in-flight`/`planned`).
2. `stackctl archive --doc <tmp>/ROADMAP.md` → **dry-run** reports the shipped row(s) as planned moves; nothing written.
3. `stackctl archive --doc <tmp>/ROADMAP.md --apply` → shipped rows moved to `ROADMAP-archive.md`; ledger entries added **in the archive file**.
4. **Assert**: the live `ROADMAP.md` contains **zero** terminal-status rows; the live file has no ledger bookkeeping.

## Scenario 2 — Round-trip + coherence (SC-007, US1)

1. From Scenario 1's applied state, `stackctl unarchive --doc <tmp>/ROADMAP.md --id <phase>/<slug> --apply`.
2. **Assert**: the row is back in the live document; the document content matches the pre-archive state (round-trip restores); the archive ledger matches the archive file's remaining contents (coherence).

## Scenario 3 — Curate reorders + flags un-archived (SC-002, US2)

1. In a tmp copy of `DESIGN-INBOX.md`, shuffle entries out of the declared order and leave one `promoted` entry un-archived.
2. `stackctl curate --doc <tmp>/DESIGN-INBOX.md` → reports the disorder and the un-archived `promoted` entry; up-to-date check is silent (no hook declared) — or `declared, not yet executed` if a hook is present.
3. `stackctl curate --doc <tmp>/DESIGN-INBOX.md --apply` → entries reordered to the declared order; the `promoted` entry archived.
4. **Assert**: the document parses against its grammar; entries are in declared order; **no identifier changed**.

## Scenario 4 — Fail-loud cases produce zero writes (SC-003, FR-010)

Each of these MUST exit non-zero with an actionable message and **write nothing**:

1. A document with no embedded grammar block and no resolvable `doc-grammar` reference (ungovernable).
2. A document that does not parse against its grammar (offending span named).
3. A grammar admitting an ordinal-looking identifier (`F3`, a bare number, `phase-2`) → rejected naming the identifier (SC-004).
4. `unarchive --id X` where `X` already exists live (collision).

## Scenario 5 — Generality: one engine, two document shapes (SC-005, FR-013)

1. Run `archive` + `curate` against **both** `DESIGN-INBOX.md` (title identifiers) and `ROADMAP.md` (`<phase>/<slug>` identifiers).
2. **Assert**: both are governed by the same engine code path; the only difference is their `.peg` grammar.

## Scenario 6 — Anti-coupling gate is clean (SC-006, FR-011)

1. Run `scripts/check-no-predecessor-refs.sh` over the new surface (engine, verbs, skills, grammars, fixtures, READMEs).
2. **Assert**: **zero** predecessor-plugin references; exit 0. (A Vitest test also invokes this; a non-zero exit blocks the feature.)
