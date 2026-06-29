// Mounted-verb declarations for the spec-misc family (028 US1; FR-003):
// spec-check, spec-governance-gate, slush-findings, execute-check,
// no-shortcuts-audit. These are SINGLE-ACTION verbs — each runs a flat flag scan
// in its parser (src/subcommands/{spec-check,spec-governance-gate,slush-findings,
// execute-check,no-shortcuts-audit}.ts), no args[0] sub-action switch — so each is
// built via `buildFlatSurfaceCommand`, deriving its help surface from the same flag
// set the parser accepts (non-drift).
//
// Mediation classes (Decision 4 — declared, never inferred):
//   * spec-check / spec-governance-gate / execute-check / no-shortcuts-audit are
//     CHECKS / gates that REPORT a state and write nothing → 'read-only'.
//   * slush-findings is 'mutating': with `--apply` it atomic-writes the feature's
//     audit-log and migrates parked findings into the backlog (dry-run by default).

import type { MountedVerb } from '../command-surface.js';
import { buildFlatSurfaceCommand } from '../surface-builder.js';

/** The spec-misc mounted verbs. */
export const SPEC_MISC_VERBS: readonly MountedVerb[] = [
  {
    build: () =>
      buildFlatSurfaceCommand({
        verb: 'spec-check',
        description:
          'Report a Spec Kit spec\'s authoring state (spec/plan/tasks presence) so define/extend know what to advance; read-only, never authors or repairs.',
        flags: [
          { name: 'spec', arg: 'dir', description: 'path to the Spec Kit spec directory (required)' },
        ],
      }),
    meta: { deprecatedAliasOf: null, verbMediation: 'read-only' },
  },
  {
    build: () =>
      buildFlatSurfaceCommand({
        verb: 'spec-governance-gate',
        description:
          'Evaluate the spec-governance convergence gate for a feature; prints exactly `true` (OPEN — may graduate) or `false` (BLOCKED). Read-only.',
        flags: [
          { name: 'feature', arg: 'slug', description: 'feature slug whose audit-log + run history are evaluated (required)' },
          { name: 'override', arg: 'reason', description: 'force the gate OPEN, recording a mandatory reason' },
          { name: 'checkpoint', arg: 'name', description: 'scope convergence to runs for this checkpoint only (FR-011)' },
          { name: 'repo-root', arg: 'path', description: 'project root (default: cwd)' },
        ],
      }),
    meta: { deprecatedAliasOf: null, verbMediation: 'read-only' },
  },
  {
    build: () =>
      buildFlatSurfaceCommand({
        verb: 'slush-findings',
        description:
          'When the dampener is engaged, park residual MEDIUM/LOW findings by migrating them into the backlog and recording it on the audit-log (dry-run unless --apply); HIGHs are never slushed.',
        flags: [
          { name: 'feature', arg: 'slug', description: 'feature slug whose audit-log is acted on (required)' },
          { name: 'at', arg: 'dir', description: 'resolve the installation enclosing <dir> (default: cwd)' },
          { name: 'checkpoint', arg: 'name', description: 'scope the dampener decision to one checkpoint' },
          { name: 'slush-date', arg: 'YYYY-MM-DD', description: 'date passed to the dampener decision (default: today UTC)' },
          { name: 'scope', arg: 'latest|all', description: 'sections to act on (default: latest)' },
          { name: 'apply', description: 'write the change (default: dry-run)' },
        ],
      }),
    meta: { deprecatedAliasOf: null, verbMediation: 'mutating' },
  },
  {
    build: () =>
      buildFlatSurfaceCommand({
        verb: 'execute-check',
        description:
          'Validate that a Spec Kit spec directory is runnable for native /speckit-implement (tasks.md present); read-only, fail-loud — a non-runnable spec never exits 0.',
        flags: [
          { name: 'spec', arg: 'dir', description: 'path to the Spec Kit spec directory (required)' },
        ],
      }),
    meta: { deprecatedAliasOf: null, verbMediation: 'read-only' },
  },
  {
    build: () =>
      buildFlatSurfaceCommand({
        verb: 'no-shortcuts-audit',
        description:
          'Scan the plugin\'s shipped prompt surfaces (skills/*/SKILL.md + commands/*.md) for an agent-offered skip/defer/shortcut affordance (FR-015); read-only.',
        flags: [
          { name: 'at', arg: 'dir', description: 'plugin root to scan (default: the installed plugin root)' },
        ],
      }),
    meta: { deprecatedAliasOf: null, verbMediation: 'read-only' },
  },
  {
    build: () =>
      buildFlatSurfaceCommand({
        verb: 'resolve-tiers',
        description:
          'Resolve each task\'s [tier:<label>] in a spec\'s tasks.md to a concrete model via the installation\'s tier_map; read-only, fail-loud — emits a per-task {id,tierLabel,model} resolution or the complete tier-error set (033 model-sized-dispatch).',
        flags: [
          { name: 'spec', arg: 'dir', description: 'path to the Spec Kit spec directory (must contain tasks.md; required)' },
          { name: 'json', description: 'emit the TierResolution as JSON (default)' },
        ],
      }),
    meta: { deprecatedAliasOf: null, verbMediation: 'read-only' },
  },
];
