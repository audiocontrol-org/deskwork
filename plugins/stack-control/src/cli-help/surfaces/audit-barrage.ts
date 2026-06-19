// Mounted-verb declarations for the audit-barrage family (028 US1; FR-003):
// audit-barrage, audit-barrage-render, audit-barrage-lift, govern. These are
// SINGLE-ACTION verbs — each takes flags only (no args[0] sub-action switch;
// their parsers in src/subcommands/{audit-barrage,audit-barrage-render,
// audit-barrage-lift,govern}.ts do a flat flag scan). Each is built via
// `buildFlatSurfaceCommand` so its help surface derives from the same flag set
// the parser accepts (non-drift).
//
// All four are MUTATING: audit-barrage / audit-barrage-render write run
// artifacts under .stack-control/audit-runs; audit-barrage-lift writes findings
// into the audit-log; govern writes checkpoints + the audit-log. They are gated
// by mediation accordingly (Decision 4 — declared, never inferred from --apply).

import type { MountedVerb } from '../command-surface.js';
import { buildFlatSurfaceCommand } from '../surface-builder.js';

/** The audit-barrage mounted verbs (audit-barrage / -render / -lift / govern). */
export const AUDIT_BARRAGE_VERBS: readonly MountedVerb[] = [
  {
    build: () =>
      buildFlatSurfaceCommand({
        verb: 'audit-barrage',
        description:
          'Fire the configured CLI model fleet in parallel against a feature, capturing per-model output into a run dir and emitting a BarrageRun as JSON.',
        flags: [
          { name: 'feature', arg: 'slug', description: 'feature directory slug; used in the run-dir name (required)' },
          { name: 'prompt-file', arg: 'path', description: 'path to a file containing the audit prompt (required)' },
          { name: 'at', arg: 'dir', description: 'resolve the installation enclosing <dir> instead of the cwd' },
          { name: 'models', arg: 'comma-list', description: 'comma-separated subset of the configured models (default: all)' },
          { name: 'require-models', arg: 'n', description: 'minimum number of emitting models for the run to pass (default: no floor)' },
          { name: 'quiet', description: 'suppress the stderr summary line' },
          { name: 'output-run-dir', description: 'print just the absolute run-dir path on stdout (suppress JSON)' },
        ],
      }),
    meta: { deprecatedAliasOf: null, verbMediation: 'mutating' },
  },
  {
    build: () =>
      buildFlatSurfaceCommand({
        verb: 'audit-barrage-render',
        description:
          'Render the audit-barrage prompt from a vars JSON file (project override takes precedence over the plugin default); output feeds `audit-barrage --prompt-file`.',
        flags: [
          { name: 'feature', arg: 'slug', description: 'feature slug; must match vars.feature_slug in the vars file (required)' },
          { name: 'vars-file', arg: 'path', description: 'JSON file mapping each EXPECTED_VARS key to its substitution value (required)' },
          { name: 'output', arg: 'path', description: 'file path to write the rendered prompt to (default: stdout)' },
          { name: 'repo-root', arg: 'path', description: 'project root for override resolution (default: cwd)' },
        ],
      }),
    meta: { deprecatedAliasOf: null, verbMediation: 'mutating' },
  },
  {
    build: () =>
      buildFlatSurfaceCommand({
        verb: 'audit-barrage-lift',
        description:
          'Lift findings from an audit-barrage run directory into the feature audit-log as sequential AUDIT-<date>-NN entries (dry-run unless --apply).',
        flags: [
          { name: 'feature', arg: 'slug', description: 'feature slug; resolves the feature audit-log (required)' },
          { name: 'run-dir', arg: 'path', description: 'path to the audit-barrage run directory (required)' },
          { name: 'date', arg: 'YYYYMMDD', description: 'date stamp for new AUDIT-<date>-NN ids (default: today UTC)' },
          { name: 'at', arg: 'dir', description: 'resolve the installation enclosing <dir> (default: cwd)' },
          { name: 'apply', description: 'perform the audit-log write (default: dry-run)' },
        ],
      }),
    meta: { deprecatedAliasOf: null, verbMediation: 'mutating' },
  },
  {
    build: () =>
      buildFlatSurfaceCommand({
        verb: 'govern',
        description:
          'Run the cross-model governance convergence gate for a feature (implement or spec mode), writing checkpoints and the audit-log; reports may-graduate / refused.',
        flags: [
          { name: 'mode', arg: 'implement|spec', description: 'governance mode (required)' },
          { name: 'feature', arg: 'slug', description: 'feature slug (else derived from feature/<slug>)' },
          { name: 'item', arg: 'id', description: 'roadmap item id — resolve the feature authoritatively from its spec: pointer' },
          { name: 'at', arg: 'dir', description: 'resolve the installation enclosing <dir> (default: cwd)' },
          { name: 'ceiling', arg: 'N', description: 'convergence iteration ceiling (default 1)' },
          { name: 'override', arg: 'reason', description: 'record an explicit override' },
          { name: 'require-models', arg: 'n', description: 'minimum emitting models for the barrage fleet (default 2)' },
          { name: 'no-slush', description: 'disable the slush step (address every finding)' },
          { name: 'json', description: 'emit the gate verdict JSON only' },
          { name: 'diff-base', arg: 'ref', description: 'implement mode: diff base (default HEAD~1)' },
          { name: 'phase', arg: 'id', description: 'implement mode: audit ONE tasks.md phase (per-phase unit)' },
          { name: 'spec-path', arg: 'path', description: 'spec mode: spec under audit (else the CLAUDE.md SPECKIT marker)' },
          { name: 'plan-path', arg: 'path', description: 'spec mode: fold the plan (the after_plan checkpoint)' },
          { name: 'checkpoint', arg: 'name', description: 'spec mode: override the checkpoint label' },
        ],
      }),
    meta: { deprecatedAliasOf: null, verbMediation: 'mutating' },
  },
];
