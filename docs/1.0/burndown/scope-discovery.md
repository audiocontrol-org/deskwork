---
slug: burndown-scope-discovery
date: 2026-05-29
kind: burndown-marching-orders
lane: scope-discovery
source: docs/1.0/001-IN-PROGRESS/hygiene/issue-closure-audit-2026-05-29.md
---

# Marching Orders — scope-discovery

The scope-discovery feature lives at [`docs/1.0/001-IN-PROGRESS/scope-discovery/`](../001-IN-PROGRESS/scope-discovery/). It ships scope-aware discovery skills (anti-pattern catalogs, clone detection, editor-symmetry checks, adopter manifests) that run pre-commit + on-demand.

**Status as of 2026-05-29:** Phases 1–5, 9, 10 closed in the audit. Phases 6, 7, 8, 11 remain open with concrete tasks; dogfood-feedback items from the graphical-entries canary (#349) need triage.

## Quick fixes (~1 hour each)

| # | Title | Action | Size | Deps |
|---|---|---|---|---|
| [#294](https://github.com/audiocontrol-org/deskwork/issues/294) | pre-commit hook breaks when dw-lifecycle binary predates scope-discovery subcommands | Add a `which dw-lifecycle && dw-lifecycle help \| grep check-clones` defensive guard at hook top; fallback to `exit 0` on miss with a one-line stderr breadcrumb | ~10 LOC hook fragment + smoke | none |
| [#295](https://github.com/audiocontrol-org/deskwork/issues/295) | `install-scope-discovery-hooks` writes `check-editor-symmetry --gate-mode` but verb rejects the flag | Pick one: (a) add `--gate-mode` to `check-editor-symmetry` (mirror the other check-* verbs); (b) drop the flag from the hook fragment | ~5 LOC + test | none |
| [#352](https://github.com/audiocontrol-org/deskwork/issues/352) | scope-discovery pre-commit gate runs on docs-only commits (canary #349 §3c) | Filter on `git diff --staged --name-only \| grep -v '^docs/'` before invoking the gate suite | ~5 LOC | none |
| [#350](https://github.com/audiocontrol-org/deskwork/issues/350) | `validate-return`: refactor-cue substring match false-positives (canary #349 §3a) | Tighten the substring matcher to require word boundaries + return-context anchor | ~15 LOC + 3 regression cases | none |
| [#351](https://github.com/audiocontrol-org/deskwork/issues/351) | session-start/session-end helper-subcommand availability check (canary #349 §3b) | Probe `dw-lifecycle help` once at session start; emit actionable error with install hint when subcommand is missing | ~20 LOC + smoke | none |
| [#354](https://github.com/audiocontrol-org/deskwork/issues/354) | clone gate scans gitignored dirs — gate result depends on local untracked state | Set `"gitignore": true` in both `.jscpd.json` files (root + `.dw-lifecycle/scope-discovery/`), or pass only git-tracked files to jscpd; regression check for "gitignored sandbox present" | ~5 LOC + 1 regression | none |

## Medium effort (1-2 days)

| # | Title | Action | Size | Deps |
|---|---|---|---|---|
| [#335](https://github.com/audiocontrol-org/deskwork/issues/335) | Extract shared `gh-runtime` module from `debt-report` + `triage-issues` duplication (hygiene Phase 2 follow-up) | Create `plugins/dw-lifecycle/src/lib/gh-runtime.ts`; refactor both callers; verify the existing tests still pass | ~150 LOC refactor + clone-detector baseline update | none |
| [#297](https://github.com/audiocontrol-org/deskwork/issues/297) | clone-detector tests flake under full-suite parallel load | Probe for resource contention (esbuild + jscpd concurrency); serialize the suite within a single worker, or use `vitest.poolOptions.threads.singleThread = true` for that file only | ~30 LOC config + repro script | none |
| [#290](https://github.com/audiocontrol-org/deskwork/issues/290) | primitive-extraction dispatch hygiene (TF-016 from audiocontrol pilot) | Implement the audit's recommended dispatch table; see TF-016 in the pilot's `tooling-feedback.md` | ~200 LOC | none |
| [#349](https://github.com/audiocontrol-org/deskwork/issues/349) | scope-discovery dogfood feedback (Phase 6 graphical-entries canary) | Triage the 3 sub-items: §3a (#350), §3b (#351), §3c (#352). After those land, sweep the umbrella for anything left | meta | #350, #351, #352 |

## Larger / sprint-sized

| # | Title | Action | Size | Deps |
|---|---|---|---|---|
| [#279](https://github.com/audiocontrol-org/deskwork/issues/279) | Phase 6: CLI subcommands | Per existing workplan in `docs/1.0/001-IN-PROGRESS/scope-discovery/workplan.md` § Phase 6 | sprint | #292 |
| [#280](https://github.com/audiocontrol-org/deskwork/issues/280) | Phase 7: Slash command skill prose | Per workplan § Phase 7 | sprint | #279 |
| [#281](https://github.com/audiocontrol-org/deskwork/issues/281) | Phase 8: Install / migrate / uninstall machinery | Per workplan § Phase 8 | sprint | #279, #280 |
| [#292](https://github.com/audiocontrol-org/deskwork/issues/292) | design + implement scope-widen verb (Phase 6 Task 1 + Phase 7 Task 1) | Design pass via `/frontend-design` for the CLI surface; then implement | sprint | none |
| [#285](https://github.com/audiocontrol-org/deskwork/issues/285) | anti-patterns pattern-type dispatcher extends beyond regex (glob, ast-grep, ts-morph) | v1 ships regex-only; this is the v2 dispatcher | sprint | none |
| [#286](https://github.com/audiocontrol-org/deskwork/issues/286) | router strategies — port Vue Router / Next.js / SvelteKit defaults | Per-router strategy registry; cross-router smoke fixtures | sprint | none |
| [#315](https://github.com/audiocontrol-org/deskwork/issues/315) | discovery agents act as pattern inventory; miss novel anti-patterns | Closely-related to the canary failure in §3 of #349; needs design conversation on whether the orchestrator-agent mediation layer (Phase 11 Task 3) is the right answer or whether per-handler discovery probes need their own escalation path | sprint, design-driven | none |

## Operator triage required

| # | Title | Why operator needs to decide |
|---|---|---|
| [#273](https://github.com/audiocontrol-org/deskwork/issues/273) | feature lifecycle parent (umbrella) | Will close when Phases 6–11 close; nothing to do at the umbrella |
| [#314](https://github.com/audiocontrol-org/deskwork/issues/314) | Canonicalize visual-verification gate in dw-lifecycle | Cross-cuts scope-discovery + dw-lifecycle + studio; operator picks the shape (skill / hook / rule) |

## Already-tracked / informational

- The audit log's "Burn-down candidates" section already covers #294, #295, #350, #351, #352. This sheet expands them with action+size+dependency annotations.
