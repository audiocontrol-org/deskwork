// Mounted-verb declaration for `audit-runs` (TASK-425) — bounded retention for the
// audit-barrage run dirs. A sub-action verb (list / prune) built from its real
// SUBACTION_SPECS via `buildGrammarSurfaceCommand` (non-drift). `list` is read-only;
// `prune` mutates (deletes run dirs) and is gated mutating accordingly.

import type { MediationClass, MountedVerb } from '../command-surface.js';
import { buildGrammarSurfaceCommand } from '../surface-builder.js';
import { SUBACTION_SPECS as AUDIT_RUNS_SPECS } from '../../subcommands/audit-runs.js';

const AUDIT_RUNS_MEDIATION: Readonly<Record<string, MediationClass>> = {
  list: 'read-only',
  prune: 'mutating',
};

export const AUDIT_RUNS_VERBS: readonly MountedVerb[] = [
  {
    build: () =>
      buildGrammarSurfaceCommand({
        verb: 'audit-runs',
        description:
          'Bounded retention for the audit-barrage run dirs under .stack-control/audit-runs (they grow without bound otherwise).',
        specs: AUDIT_RUNS_SPECS,
        summaries: {
          list: 'list the run dirs with their sizes, newest first (read-only)',
          prune: 'prune run dirs by --keep-last <n> or --older-than-days <t> (dry-run unless --apply)',
        },
        flagDescriptions: {
          at: 'resolve the installation enclosing <dir> instead of the cwd',
          'keep-last': 'keep the N newest run dirs; prune the rest',
          'older-than-days': 'prune run dirs older than this many days',
        },
        // No positionalName: both sub-actions declare positionals: 0, so none is
        // ever rendered (omitting avoids a confusing literal in the surface decl).
      }),
    meta: { deprecatedAliasOf: null, subActionMediation: AUDIT_RUNS_MEDIATION },
  },
];
