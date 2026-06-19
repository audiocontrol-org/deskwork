// Mounted-verb declarations for the scope-checks family (028 US1; FR-003):
// check-anti-patterns, check-adopters, check-module-symmetry, check-editor-symmetry,
// check-deprecations. These are SINGLE-ACTION verbs — each takes flags + (no)
// positionals and dispatches no sub-actions (their parsers in
// src/scope-discovery/check-*.ts do a flat flag scan, not an args[0] sub-action
// switch). Each is built via `buildFlatSurfaceCommand` so its help surface derives
// from the same flag set the parser accepts (non-drift).
//
// Mediation classes (declared per Decision 4, not inferred):
//   - check-anti-patterns / check-adopters are READ-ONLY: they scan + report and
//     write nothing (informational gates; --gate-mode only flips the exit code).
//   - check-module-symmetry / check-deprecations are MUTATING: each writes a
//     committed operator-readable artifact under `--write` (--artifact path).
//   - check-editor-symmetry is a DEPRECATED ALIAS of check-module-symmetry —
//     same behavior, same flags, so it inherits the mutating class.

import type { MountedVerb } from '../command-surface.js';
import { buildFlatSurfaceCommand } from '../surface-builder.js';
import type { FlagSpec } from '../surface-builder.js';

/** Flags shared by the two registry-driven informational gates (anti-patterns,
 * adopters): identical override + output set. */
const REGISTRY_GATE_FLAGS: readonly FlagSpec[] = [
  { name: 'registry', arg: 'path', description: 'override registry path (default: per-codebase scope-discovery registry)' },
  { name: 'root', arg: 'path', description: 'override scan root (default: the enclosing stack-control installation)' },
  { name: 'quiet', description: 'suppress per-match output; print the summary only' },
  { name: 'json', description: 'emit findings as JSON' },
  { name: 'gate-mode', description: 'pre-commit-hook-friendly: exit 1 on findings (default: informational, exit 0)' },
];

/** The scope-checks mounted verbs. */
export const SCOPE_CHECKS_VERBS: readonly MountedVerb[] = [
  {
    build: () =>
      buildFlatSurfaceCommand({
        verb: 'check-anti-patterns',
        description:
          'Per-codebase anti-pattern gate: scan the enclosing installation for registered anti-patterns and report matches.',
        flags: REGISTRY_GATE_FLAGS,
      }),
    meta: { deprecatedAliasOf: null, verbMediation: 'read-only' },
  },
  {
    build: () =>
      buildFlatSurfaceCommand({
        verb: 'check-adopters',
        description:
          'Per-codebase adopter-manifest gate: scan for modules that hold out from a registered adopter manifest and report holdouts.',
        flags: REGISTRY_GATE_FLAGS,
      }),
    meta: { deprecatedAliasOf: null, verbMediation: 'read-only' },
  },
  {
    build: () =>
      buildFlatSurfaceCommand({
        verb: 'check-module-symmetry',
        description:
          'Per-codebase fleet matrix: compute the cross-module adoption matrix for the installation and report ⚠/✗ cells.',
        flags: [
          { name: 'registry', arg: 'path', description: 'override registry path (default: per-codebase scope-discovery registry)' },
          { name: 'root', arg: 'path', description: 'override scan root (default: the enclosing stack-control installation)' },
          { name: 'module-root', arg: 'path', description: 'override the module-root the matrix scans' },
          { name: 'write', description: 'write the rendered matrix to the --artifact path' },
          { name: 'artifact', arg: 'path', description: 'override the artifact path (default: the committed fleet-matrix artifact)' },
          { name: 'quiet', description: 'suppress matrix output on stdout; print the summary line only' },
        ],
      }),
    meta: { deprecatedAliasOf: null, verbMediation: 'mutating' },
  },
  {
    build: () =>
      buildFlatSurfaceCommand({
        verb: 'check-editor-symmetry',
        description:
          'Deprecated alias of check-module-symmetry — same flags and exit codes; emits a deprecation notice to stderr, then forwards.',
        flags: [
          { name: 'registry', arg: 'path', description: 'override registry path (default: per-codebase scope-discovery registry)' },
          { name: 'root', arg: 'path', description: 'override scan root (default: the enclosing stack-control installation)' },
          { name: 'module-root', arg: 'path', description: 'override the module-root the matrix scans' },
          { name: 'write', description: 'write the rendered matrix to the --artifact path' },
          { name: 'artifact', arg: 'path', description: 'override the artifact path (default: the committed fleet-matrix artifact)' },
          { name: 'quiet', description: 'suppress matrix output on stdout; print the summary line only' },
        ],
      }),
    meta: { deprecatedAliasOf: 'check-module-symmetry', verbMediation: 'mutating' },
  },
  {
    build: () =>
      buildFlatSurfaceCommand({
        verb: 'check-deprecations',
        description:
          'Per-codebase deprecation queue: scan the installation for @deprecated markers and their importers and report the queue.',
        flags: [
          { name: 'root', arg: 'path', description: 'override scan root (default: the enclosing stack-control installation)' },
          { name: 'module-root', arg: 'path', description: 'override the module root for the @/ alias' },
          { name: 'write', description: 'write the rendered markdown to the --artifact path' },
          { name: 'artifact', arg: 'path', description: 'override the artifact path (default: the committed deprecation-queue artifact)' },
          { name: 'quiet', description: 'suppress the markdown body on stdout; print the summary line only' },
          { name: 'json', description: 'emit JSON to stdout instead of the markdown body' },
        ],
      }),
    meta: { deprecatedAliasOf: null, verbMediation: 'mutating' },
  },
];
