---
slug: command-shortcuts
targetVersion: "1.0"
date: 2026-05-11
---

# Workplan: command-shortcuts

**Goal:** Ship `/dw-lifecycle:install-shortcuts` + `/dw-lifecycle:uninstall-shortcuts` so operators can install user-level shim files at `~/.claude/commands/<short>.md` that forward to the namespaced `/dw-lifecycle:<command>` form. Three naming schemes; manifest-driven uninstall; collision detection.

Design spec: `docs/superpowers/specs/2026-05-11-command-shortcuts-design.md`.

## Phase 1: Schemes module + CLI helpers

**Deliverable:** `dw-lifecycle install-shortcuts` + `dw-lifecycle uninstall-shortcuts` CLI subcommands work end-to-end against a tmp HOME fixture with full test coverage.

### Task 1: Schemes module + tests

- [ ] Author `plugins/dw-lifecycle/src/shortcuts/schemes.ts` with static command→shim maps for schemes A (2-letter `dw<initial>` with disambiguation), B (3-letter `dw-<2-char>`), and C (`dw-<verb>`).
- [ ] Unit-test correctness: every one of the 16 dw-lifecycle commands maps to a unique shim name within each scheme; no duplicates within a scheme; the full table is covered for all three schemes.
- [ ] Tests live at `plugins/dw-lifecycle/src/__tests__/shortcuts.test.ts`.

**Acceptance Criteria:**
- [ ] Vitest passes locally for the schemes module
- [ ] All 16 commands × 3 schemes have explicit test coverage
- [ ] No-duplicates invariant is asserted per scheme

### Task 2: Install CLI helper

- [ ] Author `plugins/dw-lifecycle/src/subcommands/install-shortcuts.ts` exposing `dw-lifecycle install-shortcuts --scheme=<A|B|C> [--force] [--dry-run] [--rename <prefix>] [--replace]`.
- [ ] Probe `~/.claude/commands/` for collisions against the chosen scheme; refuse and exit non-zero (code 2) unless `--force`.
- [ ] Write each shim's one-line body: `/dw-lifecycle:<command> $ARGUMENTS`.
- [ ] Write the manifest at `~/.claude/commands/.dw-lifecycle-shortcuts.json` recording the scheme, every shim path, and the dw-lifecycle plugin version.
- [ ] Register the subcommand in `plugins/dw-lifecycle/src/cli.ts`.
- [ ] Integration test at `plugins/dw-lifecycle/src/__tests__/install-shortcuts.smoke.test.ts` exercising tmp HOME fixture, `--force`, `--dry-run`, `--replace`.

**Acceptance Criteria:**
- [ ] Dry-run prints intended writes and touches no files
- [ ] Force overwrite path is exercised in a test
- [ ] Re-run with different scheme refuses without `--replace`

### Task 3: Uninstall CLI helper

- [ ] Author `plugins/dw-lifecycle/src/subcommands/uninstall-shortcuts.ts` exposing `dw-lifecycle uninstall-shortcuts [--force-uninstall] [--dry-run]`.
- [ ] Read manifest; drift-check each shim's current content against what was originally written; refuse on drift unless `--force-uninstall`.
- [ ] Remove each shim; remove the manifest.
- [ ] Register the subcommand in `plugins/dw-lifecycle/src/cli.ts`.
- [ ] Extend the integration test to cover install → uninstall cycle, drift refusal, missing-shim graceful handling.

**Acceptance Criteria:**
- [ ] Manifest drift is detected and surfaces a diff
- [ ] `--force-uninstall` overrides drift refusal
- [ ] A manually-deleted shim is noted but doesn't fail the uninstall

## Phase 2: Skills + plugin integration

**Deliverable:** `/dw-lifecycle:install-shortcuts` and `/dw-lifecycle:uninstall-shortcuts` are first-class plugin commands surfaced in the slash-command picker, with prose that walks the operator through the three schemes and the manifest contract.

### Task 4: Install skill

- [ ] Author `plugins/dw-lifecycle/skills/install-shortcuts/SKILL.md` rendering the three scheme options in a terminal table with example mappings; default scheme C.
- [ ] Author the matching `plugins/dw-lifecycle/commands/install-shortcuts.md` command file.
- [ ] Skill prose invokes the CLI helper with the operator-picked scheme.

**Acceptance Criteria:**
- [ ] Skill is discoverable via Claude Code slash-command picker as `/dw-lifecycle:install-shortcuts`
- [ ] Default scheme is C (verbose)

### Task 5: Uninstall skill

- [ ] Author `plugins/dw-lifecycle/skills/uninstall-shortcuts/SKILL.md`.
- [ ] Author the matching `plugins/dw-lifecycle/commands/uninstall-shortcuts.md` command file.

**Acceptance Criteria:**
- [ ] Skill is discoverable as `/dw-lifecycle:uninstall-shortcuts`
- [ ] Skill surfaces the manifest path and drift behavior in its report

### Task 6: Existing-install nudge

- [ ] Add one line to the final report of `plugins/dw-lifecycle/skills/install/SKILL.md`: "Want shorter command invocations? Run /dw-lifecycle:install-shortcuts."
- [ ] Verify nothing else in the install skill changes; the nudge is purely additive.

**Acceptance Criteria:**
- [ ] Nudge appears in the install skill's report only; doesn't alter behavior

## Phase 3: Documentation + dogfood

**Deliverable:** README documents the new skills; the feature has been exercised end-to-end on this monorepo and one round of friction-issues has been filed.

### Task 7: README update

- [ ] Add a new "Shortcuts" section to `plugins/dw-lifecycle/README.md` covering: what the three schemes are, install/uninstall commands, manifest location, drift behavior, collision handling.

**Acceptance Criteria:**
- [ ] Section is reachable from the README's table of contents
- [ ] Each scheme has an example mapping
- [ ] Uninstall path is documented as visible as install

### Task 8: Integration tests

- [ ] Confirm `plugins/dw-lifecycle/src/__tests__/install-shortcuts.smoke.test.ts` covers: install with each of A/B/C; collision with/without `--force`; dry-run for both subcommands; drift refusal on uninstall; replace flow.
- [ ] Run `npm --workspace @deskwork/plugin-dw-lifecycle test` and confirm green.

**Acceptance Criteria:**
- [ ] All three schemes have install + uninstall coverage
- [ ] Drift detection is exercised explicitly

### Task 9: Manual dogfood

- [ ] Run `/dw-lifecycle:install-shortcuts` (scheme C) against this repo's `~/.claude/commands/`.
- [ ] Exercise three shortcuts (e.g. `/dw-implement`, `/dw-setup`, `/dw-doctor`) to confirm forwarding works.
- [ ] Run `/dw-lifecycle:uninstall-shortcuts`; confirm clean state.
- [ ] File any friction discovered as separate GitHub issues with reproductions.

**Acceptance Criteria:**
- [ ] At least three shortcuts confirmed working end-to-end
- [ ] Uninstall leaves `~/.claude/commands/` in a state indistinguishable from pre-install (manifest gone, shims gone)
- [ ] Friction (if any) is captured as filed issues with links recorded here
