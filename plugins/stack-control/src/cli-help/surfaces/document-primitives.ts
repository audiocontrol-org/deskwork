// Mounted-verb declarations for the document-primitives family (028 US1; FR-003):
// archive, unarchive, curate. These are SINGLE-ACTION verbs — each takes flags +
// (no) positionals and dispatches no sub-actions (their parsers in
// src/subcommands/{archive,unarchive,curate}.ts do a flat flag scan, not an
// args[0] sub-action switch). Each is built via `buildFlatSurfaceCommand` so its
// help surface derives from the same flag set the parser accepts (non-drift).
//
// All three are MUTATING: each writes the governed document when invoked with
// `--apply` (dry-run by default, FR-009). They are gated by mediation accordingly.

import type { MountedVerb } from '../command-surface.js';
import { buildFlatSurfaceCommand } from '../surface-builder.js';

/** The document-primitives mounted verbs (archive / unarchive / curate). */
export const DOCUMENT_PRIMITIVES_VERBS: readonly MountedVerb[] = [
  {
    build: () =>
      buildFlatSurfaceCommand({
        verb: 'archive',
        description:
          'Move terminal-status Units of a governed document into its sibling archive (dry-run unless --apply).',
        flags: [
          { name: 'doc', arg: 'path', description: 'path to the governed document (required)' },
          { name: 'apply', description: 'write the moves (default: dry-run)' },
        ],
      }),
    meta: { deprecatedAliasOf: null, verbMediation: 'mutating' },
  },
  {
    build: () =>
      buildFlatSurfaceCommand({
        verb: 'unarchive',
        description:
          'Return a named archived Unit to the live document at its declared-order position (dry-run unless --apply).',
        flags: [
          { name: 'doc', arg: 'path', description: 'path to the governed document (required)' },
          { name: 'id', arg: 'identifier', description: 'identifier of the archived Unit to restore (required)' },
          { name: 'apply', description: 'write the restore (default: dry-run)' },
        ],
      }),
    meta: { deprecatedAliasOf: null, verbMediation: 'mutating' },
  },
  {
    build: () =>
      buildFlatSurfaceCommand({
        verb: 'curate',
        description:
          'Ensure a governed document is well-formed, well-ordered, and properly archived; report ledger/archive coherence (dry-run unless --apply).',
        flags: [
          { name: 'doc', arg: 'path', description: 'path to the governed document (required)' },
          { name: 'apply', description: 'write the reorder/archive fixes (default: dry-run)' },
        ],
      }),
    meta: { deprecatedAliasOf: null, verbMediation: 'mutating' },
  },
];
