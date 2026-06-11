# Quickstart Validation — Installation Isolation (specs/installation-isolation)

Per-story runnable validations. Prereqs: suite runner `npx vitest run` from `plugins/stack-control/`; verbs via `plugins/stack-control/bin/stackctl`. Contracts: [contracts/cli-contracts.md](./contracts/cli-contracts.md); invariants: [data-model.md](./data-model.md).

**Suite baseline**: 185 files / 1220 tests green pre-feature; every story adds RED-first tests and ends green.

- **US1**: build the nested fixture (outer git repo ⊃ installation), snapshot the outer tree, run each state-writing verb from the probe table, re-snapshot. Expect: byte-identical outside the installation; run-dirs/seeds/config reads all under `<installation>/.stack-control/`. (RED today: barrage run-dirs and widen auto-seed land at the outer root.)
- **US2**: same verbs in a repo with NO installation. Expect: uniform FATAL naming the start dir + `stackctl setup`; zero new state anywhere; exit non-zero.
- **US3**: govern over the nested fixture with a committed change inside the installation AND spec artifacts outside it. Expect: payload paths installation-relative; the labeled cross-tree feature arm present; run-dir inside the installation; `--repo-root`/`GOVERN_REPO_ROOT` refused loudly.
- **US4**: run one verb from the installation root, a subdirectory, and the outer repo with `--at`. Expect: byte-identical placement (SC-003). `backlog` store resolution honors a threaded start point.
- **US5**: fixture with a marker-less `.stack-control/` at the outer root + a proper installation below. Expect: the three-part legacy notice on every resolving verb; no writes to the legacy location; advice never names an existing tuned file as an overwrite target. **This repo**: after the operator-approved migration step, `git status` shows the root `.stack-control/` retired into the installation and SC-004's re-runnable probe passes.
- **US6**: relocate `.specify/` + `specs/` into the installation (history-preserving move), update the agent-context pointer; then `stackctl spec-check --spec <installation>/specs/installation-isolation` reports all-yes, a fresh authoring step lands under the installation, and govern's payload carries spec artifacts with no cross-tree arm.

**Feature-level close-out**: full suite green; per-story RED commits precede fixes; the isolation probe is a permanent suite member; constitution carries the installation-anchor principle (FR-010).
