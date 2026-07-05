# Research: Governance Code Scope

Phase 0 decisions. Every NEEDS-CLARIFICATION-class question the plan surfaced is resolved here; the design-record open questions are carried forward as noted (not resolved beyond what the design settled).

## Decision 1 — Glob engine: adopt `picomatch` as a direct dependency

**Decision**: Use `picomatch` for include/exclude matching; add it to `plugins/stack-control/package.json` `dependencies` (pin `^2.3.2` to match the version already resolved in the tree).

**Rationale**:
- `picomatch@2.3.2` is **already present transitively** (via `jscpd`/`backlog.md`), so adoption adds no new install surface — it only makes an existing, battle-tested matcher a *declared* dependency instead of relying on a transitive one (which the project's dependency hygiene forbids leaning on implicitly).
- FR-009 requires matching at the **repository root as well as nested** and the default include uses a double-`**` pattern (`**/.claude/rules/**/*.md`). Picomatch handles `**` segment semantics, root matching (`picomatch('**/*.md')('README.md') === true`), and dotfile matching (`{ dot: true }` for `.claude/…`) correctly. An in-house matcher would re-implement exactly the `**`/root/dot edge cases picomatch already gets right — the classic footgun (Principle V favors a correct primitive over a hand-rolled partial one).
- Pure, synchronous, zero-I/O — fits the deterministic-floor testing model (the filter stays a decidable transform).

**Alternatives considered**:
- **`minimatch`**: not in the tree (would be a genuinely new install); comparable capability but no advantage over the already-present picomatch.
- **In-house glob→regex matcher**: avoids a declared dependency but re-implements `**`-across-separators, root-vs-nested, and dotfile handling — high bug surface precisely where FR-009 is strict. Rejected: correctness risk outweighs the dependency saving, and the dependency is already resolved anyway.
- **git pathspec (`:(glob)`)**: the existing per-phase arm uses git `:(exclude)` pathspecs, but the inclusion-based 030 pipeline filters `DiffScope` in-process (not via git), so a git-pathspec approach would not compose at the single `scopeDiff` seam. Rejected: wrong layer for the inclusion-based pipeline.

**Config note**: `picomatch` must be called with `{ dot: true }` so `**/.claude/**` and dotfile paths match; a matcher factory compiled once per policy resolution (not per file) keeps it O(files × globs).

## Decision 2 — Module placement: new `src/govern/code-scope.ts`

**Decision**: Put `CodeScopePolicy`, `resolveCodeScopePolicy(config)`, `applyCodeScope(scope, policy)`, and the picomatch helper in a **new** `src/govern/code-scope.ts`. `payload-diff-scope.ts` keeps `DiffScope`/`filterDiffScope` unchanged and is imported by the new module.

**Rationale**: `payload-diff-scope.ts` is ~323 lines — adding the filter + policy resolution + glob helper would push it past the 300–500-line cap (Principle VI). A focused module is more testable and mirrors the single-responsibility of the existing scope files. `applyCodeScope` reuses the `DiffScope → DiffScope` shape and the "preserve survivors' per-file diffs" pattern from `filterDiffScope`.

**Alternatives considered**: extend `payload-diff-scope.ts` in place (rejected — file-size cap); put policy resolution in `govern-arms.ts` (rejected — keep the arm thin; resolution is pure and belongs with the filter it feeds, though the arm *calls* it).

## Decision 3 — Empty-code-scope success signal

**Decision**: When code-only filtering reduces a **previously non-empty** scope to empty, the pipeline returns a distinct "nothing to govern — no code in scope" success outcome (not the existing empty-scope FATAL). A genuinely empty diff (nothing changed at all) keeps its current handling. The success outcome satisfies the graduation precondition (FR-011).

**Rationale**: The FATAL at `end-govern-pipeline.ts:105` exists to catch "the exclusion filters removed the whole surface" as an error; under code-only that is a legitimate state for a documentation-only change. Distinguishing "emptied by code-only filtering" from "genuinely empty" keeps the FATAL meaningful for the truly-empty case while allowing the doc-only case to graduate.

**Alternatives considered**: always treat empty as success (rejected — loses the genuine-empty guard); fall back to auditing docs when code scope is empty (rejected — reintroduces the doc obsession exactly when the change is docs-only, contradicting the feature).

**Implementation note**: the pipeline needs to know whether the pre-filter scope was non-empty. Options: the runtime's `scopeDiff` returns both raw and filtered counts, or the arm captures the raw scope size before threading. The plan's tasks will pin this; the contract is "emptied-by-code-only ⇒ success," verified by test.

## Decision 4 — Lens variant selection

**Decision**: Add a code-only variant of `CODE_AUDIT_LENS` (in `audit-constants.ts`) that is identical except it omits the documentation-drift bullet (current line 18). `govern-vars.ts` selects the variant when `code_only` is active, exactly where it currently sets `audit_lens`/`BarrageVars`.

**Rationale**: Mirrors the existing mode-selected lens pattern (`CODE_AUDIT_LENS` vs `SPEC_AUDIT_LENS`); keeps the lens a plain selected constant. FR-010.

**Alternatives considered**: mutate the single lens string conditionally (rejected — a named variant is clearer and directly testable, FR/SC-006); keep the bullet (rejected — un-anchorable instruction reintroduces doc speculation).

## Decision 5 — Malformed config throws (Principle V)

**Decision**: An **absent** `govern` block applies the documented defaults (FR-006). A **present-but-malformed** `govern` block (wrong types, non-array lists, unknown `code_only` value) MUST throw a descriptive error naming the offending key — never silently fall back to defaults.

**Rationale**: Principle V — a fallback that masks a malformed operator config is a bug factory. Defaults-when-absent is the *specified behavior*; defaults-when-malformed would hide operator error.

## Carried-forward open questions (design-record; NOT resolved here)

Per the design record, these remain open by intent and are recorded for the implementer, not decided in this feature:
1. **List replace-vs-merge** — design chose *replace* (FR-008); a future `merge` opt-in is out of scope.
2. **Root vs nested matching corner** — handled by picomatch + the explicit root entries (`CLAUDE.md`, `AGENTS.md`) in the default include; validated by test (FR-009 / US2 scenario 5).
3. **Markdown test fixtures** — dropped under default `exclude`; operator rescues via `include`. Documented in quickstart, no auto-detection.
4. **Default include breadth for rule files** — ships treating `.claude/rules/**/*.md` + `CLAUDE.md`/`AGENTS.md` as code; tunable via config if too broad.

## Out of scope (not this feature)

- Reframing/retiring the roadmap item `multi:gap/govern-doc-aware-audit-lens` (operator-owned roadmap disposition).
- Any change to spec-mode governance or the clone sub-step (already code-only).
- A doc-governance venue (documentation is operator-reviewed).
