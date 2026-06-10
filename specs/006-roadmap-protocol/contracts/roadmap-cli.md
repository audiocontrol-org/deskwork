# Contract: `stackctl roadmap` verb

The semantic-layer surface. One verb, subactions. Dry-run / report subactions write nothing; mutations re-validate the whole graph and are zero-write on failure (FR-010). Discipline lives here + the `/stack-control:roadmap` skill body (never a git hook).

`--doc <path>` defaults to the canonical roadmap (`plugins/stack-control/ROADMAP.md`). All subactions fail loud (exit non-zero, zero writes) on an ungovernable/parse-failing/invalid-graph document.

## Query / report (read-only)

| Subaction | Output | FR |
|---|---|---|
| `roadmap next [--doc P]` | the ready-list: items whose `depends-on` are all `shipped`, no `deferred-until`, non-terminal | FR-012 |
| `roadmap blocked [--doc P]` | each non-ready item + what blocks it (non-shipped deps named; `deferred` marker) | FR-013 |
| `roadmap blocks <id> [--doc P]` | items that declare `depends-on: <id>` | FR-013 |
| `roadmap order [--doc P]` | topological order (phase-tiebroken) | FR-008 |
| `roadmap graph [--doc P]` | mermaid flowchart from `depends-on` | FR-014 |
| `roadmap reconcile [--doc P]` | status-drift proposals + orphans + unresolved correspondences; **writes nothing** | FR-016/016a/016b/017 |

## Mutations (re-validate graph; zero-write on failure; dry-run unless `--apply`)

| Subaction | Effect | FR |
|---|---|---|
| `roadmap add <id> [--status S] [--scope "…"] [--depends-on a,b] [--part-of p] [--deferred-until "…"] [--spec path] [--ref link] [--apply]` | insert item; one-move emergent capture | FR-009/FR-011 |
| `roadmap advance <id> --to <status> [--apply]` | change status along the lifecycle | FR-009 |
| `roadmap decompose <id> --into x,y,z [--apply]` | replace one item with N; resolve former dependents; re-validate | FR-009 |
| `roadmap reclassify <id> --to <newPhaseKindOrSlug> [--apply]` | rename identifier + rewrite referencing edges atomically | FR-001a/FR-009 |
| `roadmap defer <id> --until "…" [--clear] [--apply]` | set/clear the prose `deferred-until` | FR-004/FR-009 |
| `roadmap archive [--doc P] [--apply]` | move terminal-status items out (composes `archive`) | FR-009 |

## Exit codes (consistent with `curate`/document-model)

- `0` — success (report produced, or mutation applied/dry-run clean).
- `1` — write failure on `--apply` (document recoverable from version control).
- `2` — usage/config/validation error: ungovernable doc, parse failure, identifier/referential-integrity/acyclicity violation, ambiguous reclassify. Fail loud, zero writes.

## Invariants (tested)

- No query subaction ever writes.
- `reconcile` never mutates a status (FR-017) — asserted by a before/after document-hash equality test.
- Every mutation that would invalidate the graph leaves the document byte-for-byte unchanged.
- `next` never lists an item with an unshipped `depends-on` or a set `deferred-until`.
