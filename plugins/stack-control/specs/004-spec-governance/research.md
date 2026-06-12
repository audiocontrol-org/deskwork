# Phase 0 Research: `design/spec-governance`

All findings below are grounded in the actual dw-lifecycle + founding-extension source (read 2026-06-06). The feature has **no open NEEDS CLARIFICATION** (resolved in `/speckit-clarify`); this research records the *technical* decisions for faithfully porting the audit-barrage + audit protocol.

## R1 — Compose the barrage in-house via the existing verb chain (don't reimplement)

**Decision**: The extension orchestration script invokes the existing dw-lifecycle verb chain, exactly as the founding `govern.sh` does: `audit-barrage-render` → `audit-barrage` → `audit-barrage-lift`.

**Rationale**: These verbs already exist and are battle-tested (`plugins/dw-lifecycle/src/subcommands/audit-barrage{,-render,-lift}.ts`). FR-006 + Constitution Principle II (integration-first) + the isolation invariant all require composing the real capability, not forking it. The founding `deskwork-governance/scripts/bash/govern.sh` is the proven template (render with a vars JSON → fire with `--output-run-dir` → lift with `--apply`).

**Alternatives considered**: (a) reimplement a spec-specific barrage — rejected (duplication, drift, violates FR-006/Principle II); (b) wait for `multi/migrate-audit-barrage` to rehome the verbs first — rejected (that migration is sequenced *after* this feature; FR-006 mandates in-house composition until then).

## R2 — The audit unit is the SPEC artifact, not a code diff

**Decision**: Where `govern.sh` folds a *git diff of implemented code* into the `diff` var, `govern-spec.sh` folds the **spec file contents** (and the plan, when the `after_plan` checkpoint fires) into the audit payload. The same five render vars are reused (`feature_slug`, `workplan_summary`, `diff`, `audit_log_excerpt`, `commit_subjects`); `diff` carries the spec/plan text.

**Rationale**: spec-governance audits the *design artifact*, which exists as a whole file at `after_clarify` (not a working-tree diff). Reusing the existing render template + vars keeps us composing, not rebuilding (R1). The manual `specs/002` barrage that motivated the feature did exactly this — fed the spec text to the models.

**Alternatives considered**: a new render template with a `spec` var — deferred; reusing `diff` avoids template surgery now and the prompt template already frames its content as "the work under audit." A bespoke template can come later if the prose proves confusing.

**Open implementation detail (for tasks/impl, not blocking)**: bound the spec payload the same way `govern.sh` bounds the untracked fold (256 KB soft budget, log drops — no silent cap). Specs are small, so this is a guard, not a hot path.

## R3 — Port the convergence protocol as a GATE, reusing the already-mechanized dampener logic

**Decision**: The convergence criterion is **already mechanized** in `plugins/dw-lifecycle/src/scope-discovery/promote-findings/check-barrage-dampener.ts` (Rule A: last 2 consecutive runs each 0 HIGH+; Rule B: most recent run 0 HIGH+ AND 0 MEDIUM). Port that *same logic* into the new `stackctl spec-governance-gate` verb, but wire its verdict to **gate spec graduation** (block / allow / non-converged) rather than to the slush-vs-promote disposition it drives inside `implement-hook`.

**Rationale**: FR-010 quotes this exact criterion; the operator's directive was "port the audit protocol, not just the barrage." The logic exists and is trusted — reuse it. The *only* new behavior is the wiring: in dw-lifecycle the dampener decides whether to park MEDIUM/LOW findings; here the criterion decides whether the spec may advance to the next Spec Kit step (SC-007).

**Alternatives considered**: (a) call `dw-lifecycle implement-hook` directly — rejected: it embeds workplan-aware promote/slush semantics tied to a `workplan.md`, which Spec-Kit-tracked features don't have (the exact TF-12 impedance already logged in `tooling-feedback.md`); we want only the convergence verdict. (b) Re-derive the criterion from prose — rejected: re-deriving an already-mechanized rule risks drift; port the function. **Implementation note**: if the dampener function isn't cleanly importable across the plugin boundary in-house, the faithful port is to extract/share the same logic (and, at migration time, it moves wholesale) — never a hand-retyped approximation.

## R4 — Iterative convergence loop is bounded (unattended-safe)

**Decision**: The gate verb evaluates the criterion against the per-feature barrage run history (the `audit-runs/` dirs + `audit-log.md` finding states). The loop (barrage → fix → re-barrage) runs until the criterion is met, an override is recorded, or a configured **iteration ceiling** is hit — at which point a `non-converged` terminal state is recorded and escalated (FR-014 / SC-008).

**Rationale**: the all-night/unattended directive (program thesis) requires the loop terminate without an operator present. An unbounded "fix until clean" loop can spin forever on a genuinely-hard finding. The ceiling + non-converged terminal state mirrors the `impl/execution-engine` spec's bounded-termination posture.

**Alternatives considered**: unbounded loop with operator interrupt — rejected (defeats unattended operation); single-pass only — rejected (contradicts FR-010's two-consecutive-iterations rule).

## R5 — Delivery as a Spec Kit extension with hooks (mirror the founding extension)

**Decision**: Ship `plugins/stack-control/spec-kit/spec-governance/` mirroring `deskwork-governance/`: an `extension.yml` declaring an `after_clarify` hook (non-optional, default) and an `after_plan` hook (configurable), each pointing at a `speckit.spec-governance.govern-spec` command that shells to `govern-spec.sh`.

**Rationale**: FR-012 (resolved in clarify). An extension fires universally — whether the operator uses the front-door `define`/`extend` skills or raw `/speckit-*` — and is symmetric with `impl/governance`'s `after_implement`. The `extension.yml` schema, `requires.tools` (dw-lifecycle + git), `provides.commands`, and `hooks` blocks are copied from the founding extension and re-pointed.

**Alternatives considered**: fold into front-door skills only (rejected in clarify — misses raw `/speckit-*`); both (rejected — redundant maintenance).

**Hook-point nuance**: `after_specify` is intentionally excluded by default — a spec there may still carry intentional unresolved-clarification placeholders, which generate noise. `after_clarify` is where the spec is decision-complete (exactly where the motivating `specs/002` barrage ran).

## R6 — Findings home: the existing per-feature audit-log (one governance surface)

**Decision**: Spec-barrage findings are lifted into the same per-feature `audit-log.md` the implementation-phase governance uses (`audit-barrage-lift --apply`), carrying the checkpoint context. No separate spec-only findings artifact.

**Rationale**: SC-005 (one format, one triage workflow for both phases). The lift verb + finding state machine (`open` → `fixed-<sha>` / `verified-<date>` / `acknowledged-*`, with cross-model agreement) already exist and are the canonical record. Reusing them keeps an operator triaging spec and code findings identically.

**Alternatives considered**: a `spec-findings.md` artifact — rejected (divergent second surface, breaks SC-005).

## R7 — Fail-loud + degraded-coverage honesty (inherit govern.sh's guards)

**Decision**: Inherit `govern.sh`'s guards verbatim in shape: fail loud (exit 2) if the barrage capability is absent (`command -v` the barrage entrypoint); proceed with available model families but record reduced coverage when some are missing; never silent-skip; handle the all-models-failed outage explicitly.

**Rationale**: FR-005 / FR-008 / Principle V. The founding script already encodes these (the `dw-lifecycle not on PATH → FATAL exit 2` guard, the bounded fold, the empty-diff note). The known issues the research surfaced (E2BIG/maxBuffer, `GOVERN_DIFF_BASE` ancestry fallback) carry over and are handled by the composed verbs, not re-solved here.

## Resolved unknowns summary

| Unknown | Resolution |
|---|---|
| How to run the barrage over a spec | Compose `render → audit-barrage → lift`; spec text in the `diff` var (R1, R2) |
| How to implement the convergence gate | Port `check-barrage-dampener` Rule A/B logic; wire to a graduation verdict (R3) |
| Termination under unattended runs | Bounded iteration ceiling + `non-converged` terminal state (R4) |
| Delivery mechanism | Spec Kit extension, `after_clarify` default + `after_plan` configurable (R5) |
| Where findings live | Existing per-feature `audit-log.md` via `audit-barrage-lift` (R6) |
| Capability-absent behavior | Fail loud (exit 2); degraded coverage recorded, never silent-skip (R7) |

No remaining NEEDS CLARIFICATION. Ready for Phase 1 design artifacts.
