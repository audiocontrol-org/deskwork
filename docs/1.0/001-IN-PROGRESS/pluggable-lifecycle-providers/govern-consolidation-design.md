# Design: single-source the audit-protocol orchestration (`stackctl govern`)

Status: in progress (operator directive 2026-06-06 — "rip out the duplication now"). This is an
implementation-task design, not a Spec Kit feature spec.

## Problem (verified)

The audit-protocol *orchestration* is duplicated and divergent across bash scripts; only the
*primitives* (barrage verbs, `check-barrage-dampener`, `slush-remaining`, the gate) are single-sourced.

- `plugins/stack-control/spec-kit/spec-governance/scripts/bash/govern-spec.sh` (235 ln): render → barrage
  → lift → **slush → gate** (full convergence protocol).
- `plugins/stack-control/spec-kit/deskwork-governance/scripts/bash/govern.sh` (141 ln): render → barrage
  → lift only. **No slush, no gate.** Comment literally says "mirror govern.sh lines 25-42".
- `.specify/extensions/deskwork-governance/scripts/bash/govern.sh`: a STALE hand-copy (Spec Kit installer
  copies plugin→.specify + records manifest_hash in `.registry`; no re-sync). Still shells `dw-lifecycle`
  (pre-`multi/migrate-audit-barrage`). **This is the copy the live `after_implement` hook runs** → the
  "no dw-lifecycle dependency" achievement is not live; the command `.md` discipline edits are not live.

The clone detector missed this because `.jscpd.json` scanned only `**/*.ts` (FIXED — now ts/tsx/sh/bash)
AND because clone detection fires from no skill on the Spec Kit path (the husky gate was retired).

## Target

One protocol definition, reused at both stages + invokable standalone.

### `stackctl govern` (new TS subcommand)

Flags: `--mode <implement|spec>` (required), `--feature <slug>` (else derive from `feature/<slug>`),
`--repo-root <path>`, `--ceiling <N>`, `--override "<reason>"`, `--no-slush`, `--json`,
implement-mode: `--diff-base <ref>` (default HEAD~1);
spec-mode: `--spec-path <p>`, `--plan-path <p>`, `--checkpoint <name>`.
Env parity preserved for the shims: `GOVERN_FEATURE_SLUG`, `GOVERN_DIFF_BASE`, `GOVERN_SPEC_PATH`,
`GOVERN_PLAN_PATH`, `GOVERN_CHECKPOINT`, `GOVERN_CEILING`, `GOVERN_OVERRIDE`, `GOVERN_MODELS`,
`GOVERN_REPO_ROOT`, `GOVERN_BARRAGE_BIN` (test stub), `GOVERN_NO_SLUSH`, `GOVERN_PAYLOAD_BUDGET`.

Steps (single orchestration):
1. resolve repo-root + slug (shared; fail-loud on empty slug).
2. capability guards: barrage bin present (fail-loud). (Drop the `jq` dependency — assemble vars JSON in TS.)
3. payload assembly via **mode strategy**:
   - implement: `git diff <base>` + untracked-fold (bounded, binary-skip, continue-not-break — port the
     existing edge-case logic from govern.sh WITH tests).
   - spec: fold spec (+ plan when checkpoint=after_plan), bounded; checkpoint defaulting
     (GOVERN_CHECKPOINT > after_plan-if-plan > after_clarify).
4. build vars (slug, mode-specific workplan_summary, diff payload, audit_log excerpt, commit_subjects) →
   write vars.json (JSON.stringify).
5. render → barrage → lift (shell the barrage bin; barrage OUTAGE = non-zero exit → fail-loud, do NOT lift).
6. slush (unless `--no-slush`): `stackctl slush-findings` (per-checkpoint when spec mode).
7. gate: `stackctl spec-governance-gate` → verdict + exit code (0 converged/overridden, 1 blocked/non-converged, 2 fatal).
8. **clone step — implement mode ONLY** (code clones; skip for spec/markdown): run the clone check
   (path ii: advisory jscpd snapshot over the fixed repo-level config); report NEW clones. Advisory in v1
   (does not change the gate verdict) — full baseline/disposition gating arrives with the vendored
   clone-detector under design/migrate-scope-discovery.

Per-stage difference is ONLY: payload (mode), what `blocked` gates (spec=next-step graduation;
implement=done-ness), and the implement-only clone step. Convergence criterion / finding state machine /
slush / gate are identical (the existing single-sourced primitives).

### Shims (thin)

- `plugins/stack-control/spec-kit/spec-governance/scripts/bash/govern-spec.sh` → `exec stackctl govern --mode spec "$@"` (passing env).
- `plugins/stack-control/spec-kit/deskwork-governance/scripts/bash/govern.sh` → `exec stackctl govern --mode implement "$@"`.
- Re-install `.specify/extensions/deskwork-governance/` from the (now-thin) source via the public installer so the live hook is current (no dw-lifecycle; carries the discipline). Verify `.registry` manifest_hash updates.

### Clone detection cadence (path ii — advisory now)

One clone-check step, fired from: `govern --mode implement` (impl code), `session-end` (catches quick
fixes / donkey work written outside `/speckit-implement`), `session-start` (inherited snapshot). Skill
bodies, not git hooks (enforcement-lives-in-skills ADR). Uses the fixed `.jscpd.json`. Full vendored
clone-detector (baselines, dispositions, NEW-gating) tracked under design/migrate-scope-discovery.

## TDD (write RED first)

- payload-implement: git diff + untracked fold (binary skip, budget continue-not-break) — fixture repo.
- payload-spec: spec(+plan) fold, budget fail-loud, checkpoint defaulting.
- slug resolution + empty-slug fail-loud; barrage-bin-absent fail-loud; barrage OUTAGE (non-zero) → no lift, fail-loud.
- full protocol with a STUBBED barrage bin (GOVERN_BARRAGE_BIN): both modes run slush+gate; verdict + exit codes.
- implement mode runs the clone step; spec mode does NOT.
- preserve/adapt existing tests (governance-seam, governance-neutrality, hook-wiring) — update intentionally
  where impl phase now gates (justify in the test).

## Constraints

Constitution: TDD-first; no `any`/`as`/`@ts-ignore`; files 300-500 ln (split: `subcommands/govern.ts` +
`src/govern/payload-*.ts` + `src/govern/protocol.ts`); relative `.js` ESM imports (match the package).
No fallbacks (fail-loud). Preserve every edge-case fix ported from the bash (cite the AUDIT-id in a comment).
