# Phase 25 Task 1 — editor → module rename inventory

Generated 2026-06-03. Captures every surface that needs an `editor` → `module` rename under Phase 25's single-rename strategy (operator-confirmed via blocking-questions pass).

## Strategy recap

- **Single-rename + doctor migration** (operator decision) — no dual-name period; `legacy-editor-symmetry-field-rename` doctor rule auto-migrates adopter YAML on `--fix`.
- **CLI verb** — alias for one release cycle (workplan Task 5 lean) so adopter scripts keep working; hard-rename in the release after.
- **Skill folder** — retire entirely; old skill at `check-editor-symmetry/` removed (no stub).
- **Audiocontrol pilot** — rename in lockstep (operator confirmed); file an issue on the pilot tracker as the handoff.

## Surfaces requiring rename

### Source — primary

- `plugins/dw-lifecycle/src/scope-discovery/editor-symmetry-matrix.ts` → `module-symmetry-matrix.ts`
- `plugins/dw-lifecycle/src/scope-discovery/editor-symmetry-report.ts` → `module-symmetry-report.ts`
- `plugins/dw-lifecycle/src/scope-discovery/util/editors.ts` → `util/modules.ts`
  - `discoverEditors()` → `discoverModules()`
  - `editorsTargetedByGlob()` → `modulesTargetedByGlob()`
  - `editorForPath()` → `moduleForPath()`
- `plugins/dw-lifecycle/src/subcommands/check-editor-symmetry.ts` → `check-module-symmetry.ts`
- `plugins/dw-lifecycle/src/scope-discovery/check-editor-symmetry.ts` → `check-module-symmetry.ts`

### Schema + types

- `plugins/dw-lifecycle/src/scope-discovery/schema/scope-manifest.yaml.schema.json` — `editor_symmetry` field → `module_symmetry`
- `plugins/dw-lifecycle/src/scope-discovery/discovery-agents/types.ts` — `RegimeHoldoutSource.editor_symmetry` → `RegimeHoldoutSource.module_symmetry`
- `plugins/dw-lifecycle/src/scope-discovery/synthesis-types.ts` — `SymmetryMatrix.editors` → `SymmetryMatrix.modules`
- `plugins/dw-lifecycle/templates/scope-discovery/LAYOUT.md` — schema example references

### Source — secondary (importers)

- `plugins/dw-lifecycle/src/scope-discovery/synthesis.ts`
- `plugins/dw-lifecycle/src/scope-discovery/synthesis-report.ts`
- `plugins/dw-lifecycle/src/scope-discovery/synthesis-derive-regime.ts`
- `plugins/dw-lifecycle/src/scope-discovery/scope-inventory.ts`
- `plugins/dw-lifecycle/src/scope-discovery/scope-inventory-cli.ts`
- `plugins/dw-lifecycle/src/scope-discovery/scope-widen-delta.ts`
- `plugins/dw-lifecycle/src/scope-discovery/adopter-manifests-registry.ts`
- `plugins/dw-lifecycle/src/scope-discovery/check-deprecations.ts`
- `plugins/dw-lifecycle/src/scope-discovery/deprecation-report.ts`
- `plugins/dw-lifecycle/src/scope-discovery/orchestrator-turn.ts`
- `plugins/dw-lifecycle/src/scope-discovery/discovery-agents/regime-holdout-detector.ts`
- `plugins/dw-lifecycle/src/scope-discovery/discovery-agents/README.md`
- `plugins/dw-lifecycle/src/scope-discovery/util/catalog-status.ts`
- `plugins/dw-lifecycle/src/cli.ts` — `'check-editor-symmetry'` dispatch entry → `'check-module-symmetry'` + alias entry for one release cycle

### Tests

- `plugins/dw-lifecycle/src/__tests__/scope-discovery/editor-symmetry.test.ts`
- `plugins/dw-lifecycle/src/__tests__/scope-discovery/editor-symmetry.fixtures.ts`
- `plugins/dw-lifecycle/src/__tests__/scope-discovery/editor-symmetry.tracked-holdouts.test.ts`
- `plugins/dw-lifecycle/src/__tests__/scope-discovery/cross-surface-loop.test.ts`
- `plugins/dw-lifecycle/src/__tests__/scope-discovery/loop-foundation.test.ts`
- `plugins/dw-lifecycle/src/__tests__/scope-discovery/orchestrator-loop/catalog-note-noise.test.ts`
- `plugins/dw-lifecycle/src/__tests__/scope-discovery/orchestrator-turn.test.ts`
- `plugins/dw-lifecycle/src/__tests__/scope-discovery/phase-11-acceptance/keygroup-summary-repro.test.ts`
- `plugins/dw-lifecycle/src/__tests__/scope-discovery/scope-widen.test.ts`
- `plugins/dw-lifecycle/src/__tests__/scope-discovery/synthesis-report.test.ts`
- `plugins/dw-lifecycle/src/__tests__/scope-discovery/discovery-agents/regime-holdout-detector.test.ts`
- `plugins/dw-lifecycle/src/__tests__/shortcuts.test.ts` — `'check-editor-symmetry'` in META_COMMANDS

### Skill folders + skill prose

- `plugins/dw-lifecycle/skills/check-editor-symmetry/` → `plugins/dw-lifecycle/skills/check-module-symmetry/` (rename folder; rewrite SKILL.md)
- `plugins/dw-lifecycle/skills/check-adopters/SKILL.md` — refs `check-editor-symmetry` cross-link
- `plugins/dw-lifecycle/skills/scope-inventory/SKILL.md` — refs `check-editor-symmetry`
- `plugins/dw-lifecycle/skills/implement/SKILL.md` — Step 6a invokes `check-editor-symmetry` (Phase 24 Task 5 wiring)
- `plugins/dw-lifecycle/skills/review/SKILL.md` — Step 3b/3c invokes `check-editor-symmetry` (Phase 24 Task 7 wiring)
- `plugins/dw-lifecycle/skills/session-start/SKILL.md` — Step 7 invokes `check-editor-symmetry` (Phase 24 Task 4 wiring)

### Command shims

- `plugins/dw-lifecycle/commands/check-editor-symmetry.md` → `commands/check-module-symmetry.md` (plus keep the old file as an alias-pointer shim during the deprecation period)

## Out of scope for Phase 25 (per AUDIT-20260603-30)

- `docs/1.0/001-IN-PROGRESS/scope-discovery/audit-log.md` — historical finding bodies preserved verbatim per the audit-log preservation rule.
- `DEVELOPMENT-NOTES.md` — historical journal entries preserved per the same rule.
- Workplan-archive entries that mention `editor-symmetry` in historical Phase headers (archived phases describe their state at archive time).

## New doctor rule (Task 8)

`legacy-editor-symmetry-field-rename` — detects `editor_symmetry:` in adopter YAML (`.dw-lifecycle/scope-discovery/adopter-manifests.yaml`); under `--fix`, rewrites to `module_symmetry:`. Tests:
- happy path: pre-rename YAML migrates cleanly
- idempotent: post-rename YAML passes the rule without false positives
- mixed: file with both legacy + new (unusual; surface as warning, don't auto-rewrite)

## Audiocontrol pilot lockstep (Task 10)

The pilot at `~/work/audiocontrol-work/audiocontrol-scope-discovery-protocol/` mirrors the same `editor_symmetry` schema field + uses `discoverEditors` etc. Operator-confirmed lockstep coordination: file an issue on the pilot's tracker linking to the dw-lifecycle plugin's Phase 25 PR + state that the pilot's parallel rename should land within the same release cycle.

## Estimated impact

- ~40 files touched (5 source rename + ~14 importer edits + ~12 test edits + 6 skill prose edits + 3 command/template edits)
- ~150-300 line-level changes
- Doctor-rule addition: ~80 lines source + ~50 lines tests
- Release-notes entry: ~30 lines

This is mechanical-precise work that benefits from `sed`-free Edit-tool batched changes. The next session should pick this up with the inventory above as the work list.

## Sequencing

Recommended order (within a single PR):
1. Schema + types (Tasks 3 + 4): rename source identifiers + schema field; let tsc surface every dangling import.
2. Importer fixes: walk each tsc error and fix.
3. CLI verb rename + alias entry (Task 5).
4. Skill folder + skill prose (Task 6).
5. Doctor rule (Task 8) + tests.
6. PRD + workplan sweep (Task 9).
7. Release notes (Task 11).
8. Audiocontrol pilot issue (Task 10).
