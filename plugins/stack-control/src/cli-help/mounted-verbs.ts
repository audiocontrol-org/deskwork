// The mounted-verb registry (028 US1; FR-003). `buildCommandSurface` walks this
// list and projects each entry into a CommandDescriptor. Each entry pairs a
// help-only commander `Command` (the structure the descriptor derives from) with
// the declared metadata commander cannot carry (mediation class per node).
//
// Phase 3 grows this registry family-by-family. Grammar-based verbs (roadmap,
// backlog, inbox, …) are built from their real `SUBACTION_SPECS` via
// `buildGrammarSurfaceCommand` (non-drift); roadmap keeps its bespoke builder
// (it also executes through commander).

import { buildRoadmapCommand } from '../subcommands/roadmap-command.js';
import { SUBACTION_SPECS as BACKLOG_SPECS } from '../subcommands/backlog.js';
import { SUBACTION_SPECS as INBOX_SPECS } from '../subcommands/inbox.js';
import type { MediationClass, MountedVerb } from './command-surface.js';
import { buildGrammarSurfaceCommand } from './surface-builder.js';

/** Mediation class per roadmap sub-action (read-only query vs mutating write). */
const ROADMAP_MEDIATION: Readonly<Record<string, MediationClass>> = {
  next: 'read-only',
  blocked: 'read-only',
  blocks: 'read-only',
  order: 'read-only',
  graph: 'read-only',
  reconcile: 'read-only',
  add: 'mutating',
  advance: 'mutating',
  decompose: 'mutating',
  reclassify: 'mutating',
  defer: 'mutating',
  cluster: 'mutating',
  group: 'mutating',
  'close-related': 'mutating',
};

const BACKLOG_MEDIATION: Readonly<Record<string, MediationClass>> = {
  capture: 'mutating',
  list: 'read-only',
  'import-github': 'mutating',
  'import-slush': 'mutating',
  promote: 'mutating',
};

const INBOX_MEDIATION: Readonly<Record<string, MediationClass>> = {
  capture: 'mutating',
  promote: 'mutating',
  drop: 'mutating',
  list: 'read-only',
};

/** The mounted commander verbs. Phase 3 appends each migrated family here. */
export const MOUNTED: readonly MountedVerb[] = [
  {
    build: buildRoadmapCommand,
    meta: {
      deprecatedAliasOf: null,
      subActionMediation: ROADMAP_MEDIATION,
      // roadmap declares `[identifier]` in commander (so requireId owns the
      // error) but every id-taking subaction requires it (AUDIT-BARRAGE-codex-01).
      positionalsRequired: true,
    },
  },
  {
    build: () =>
      buildGrammarSurfaceCommand({
        verb: 'backlog',
        description: 'Structured slush pile for found-mid-work bugs/gaps, kept separate from the curated roadmap.',
        specs: BACKLOG_SPECS,
        summaries: {
          capture: 'capture a found bug/gap in one move (capture ≠ scope)',
          list: 'list the open backlog items (read-only)',
          'import-github': 'one-time import of open GitHub issues into the pile (dry-run unless --apply)',
          'import-slush': 'route audit-barrage parked residuals into the pile (dry-run unless --apply)',
          promote: 'promote an item into the feature-rigor tier (dry-run unless --apply)',
        },
        flagDescriptions: {
          type: 'item type: bug | gap (required for capture)',
          ref: 'a url or locator the item references',
          body: 'detail body for the item',
          feature: 'feature slug to scope the slush import',
          to: 'promotion target ref',
        },
        positionalName: 'id',
      }),
    meta: { deprecatedAliasOf: null, subActionMediation: BACKLOG_MEDIATION },
  },
  {
    build: () =>
      buildGrammarSurfaceCommand({
        verb: 'inbox',
        description: 'Low-friction insight capture — a holding area for ideas surfaced mid-work.',
        specs: INBOX_SPECS,
        summaries: {
          capture: 'capture an idea into the inbox (dry-run unless --apply)',
          promote: 'promote an inbox idea to a destination (dry-run unless --apply)',
          drop: 'drop an inbox idea with a reason (dry-run unless --apply)',
          list: 'list the open inbox ideas (read-only)',
        },
        flagDescriptions: {
          idea: 'the idea text',
          surfaced: 'where/how the idea surfaced',
          context: 'supporting context',
          home: 'the idea\'s home location',
          to: 'promotion destination',
          reason: 'reason for dropping',
        },
        positionalName: 'id',
      }),
    meta: { deprecatedAliasOf: null, subActionMediation: INBOX_MEDIATION },
  },
];
