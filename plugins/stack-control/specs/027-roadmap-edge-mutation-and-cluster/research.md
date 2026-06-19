# Research — roadmap edge-mutation and cluster (Phase 0)

Resolves the spec's open questions and the technical unknowns. Two decisions; both grounded in the ADR (`docs/superpowers/specs/2026-06-18-governed-markdown-foundation-adr.md`) and existing code.

## Decision 1 — parser library for self-documenting CLI

**Decision:** Adopt **`commander`** as the argument-parser, with a thin per-verb typed-options adapter so parsed flags reach handler code as a typed object (no `as`/`any`, honoring Constitution Principle VI). `roadmap` is the first verb mounted on it; `--help` / usage / per-subaction help / completion are derived from the command definition.

**Rationale:**
- **Incremental migration of a flat dispatcher.** `src/cli.ts` is a flat `SUBCOMMANDS` map of ~50 hand-parsing verbs. `commander` lets us mount one verb (roadmap) as a `Command` with sub-commands while the existing dispatcher keeps delegating the un-migrated verbs unchanged (FR-006 non-regression). Lowest-friction path to "prove on roadmap, migrate the rest later."
- **Non-drift by construction (FR-001/FR-005).** Help, usage, and completion are generated from the same command/option declarations the parser enforces — help cannot describe a flag the parser rejects.
- **ESM-native, maintained, ubiquitous**, zero heavy runtime — consistent with the no-external-runtime ethos.
- **Faithful Tool Adoption (Principle VIII):** adopting a mature parser instead of hand-rolling one is the principle, not a violation of it.

**Alternatives considered:**
- **`clipanion`** (Yarn's parser): TS-first, class-per-command, native typed args + built-in completions — strongest on Principle VI, but class-based/opinionated and a heavier migration shape for a flat dispatcher. Viable type-safety-max alternative.
- **`cmd-ts`**: functional, fully type-safe composable parsers — excellent types, smaller ecosystem/maturity.
- **`yargs`**: powerful but a heavier, less-ergonomic API; help good.
- **Keep hand-rolled / build a bespoke combinator**: rejected by the ADR (reinvents a commodity).

**Open validation:** confirm during the roadmap migration spike that the commander-options→typed-adapter boundary holds with **zero `as`/`any`** (Principle VI). If it cannot, fall back to `clipanion`/`cmd-ts` (typed by construction). This is a RED-test-able boundary, not a design risk.

## Decision 2 — cluster atomicity: reuse the existing mutation machinery

**Decision:** Implement `cluster` as a new function in **`src/roadmap/mutations.ts`** that composes the existing in-memory edit primitives, then performs ONE build→revalidate→write. **No new transactional helper.**

**Rationale:**
- `mutations.ts` already documents and implements exactly the required contract: *"builds the mutated document in memory, re-validates the whole graph (identifier uniqueness, referential integrity, acyclicity) via `loadDocument`, and only then writes — a validation failure leaves the on-disk document byte-for-byte unchanged (FR-010 zero-write); dry-run (`apply=false`) returns the candidate."* This is exactly spec FR-011/FR-012/FR-013.
- `reclassify` already performs an **atomic multi-edge** mutation (rename a heading + rewrite every referencing `depends-on`/`part-of` edge in one validate-then-write), proving the pattern carries cluster's multi-edge case (create-or-reuse parent + N `part-of` attachments + optional `--chain` `depends-on` wiring).
- `rewriteEdgeLine` + `setField` + `add` are the reusable primitives cluster composes.

**Alternatives considered:**
- **New transactional buffer/commit helper**: rejected — duplicates machinery that already exists and is tested; would violate DRY and add surface.
- **Per-edge separate writes**: rejected — non-atomic; would violate FR-013 (partial multi-edge write on failure).

## Decision 3 — multi-parent & chain-conflict semantics (from clarify)

Already settled in the spec (Clarifications 2026-06-18): `cluster` ADDS a `part-of` to a child that already belongs to a different parent (multi-parent allowed; refuse only exact-duplicate, FR-009); `--chain` REFUSES when a child already carries a conflicting `depends-on` (FR-014). No further research needed; these map directly onto `rewriteEdgeLine`/`setField` with a pre-write conflict check.

## Decision 4 — store-seam hardening (FR-006a)

**Decision:** Keep `roadmap-model` (typed-graph projection) as the only module that knows how `document-model` serializes; route cluster's reads/writes through `roadmap-model` + `mutations.ts`, not raw document-model calls from the verb. The verb layer stays store-agnostic. This is a *boundary discipline* (no new abstraction), satisfying the ADR's "harden the seam" without speculative pluggability (Principle II).

## Technical context resolved

- **Language/runtime:** TypeScript (strict), Node ESM, run via `tsx`. **Primary deps (new):** `commander` (+ types). **Store:** governed markdown via `document-model` (unchanged). **Testing:** Vitest (unit + integration on fixture roadmaps; local-only, no CI browser/boot). **Project type:** CLI (`stackctl`). **Scale:** roadmap ~50 nodes. **Constraints:** zero `as`/`any` (Principle VI); files ≤300–500 lines; no fallbacks outside tests (Principle V).
