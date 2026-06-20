// Mounted-verb declarations for the session-setup family (028 US1; FR-003):
// session-start, session-end, setup, config-domain, release-check,
// release-helper, version.
//
// Most are SINGLE-ACTION verbs built via `buildFlatSurfaceCommand` (their parsers
// do a flat flag scan, not an args[0] sub-action switch). Two dispatch real
// sub-actions and are built as help-only commander Commands directly:
//   - config-domain (show | use | clear) — src/subcommands/config-domain.ts
//   - release-helper (check-preconditions | validate-version |
//     assert-not-published | assert-published | atomic-push) — src/release/helpers.ts
// Each help surface derives from the real flags / positionals the parser accepts
// (non-drift); flags below are read from source, not invented.

import { Command } from 'commander';
import type { MediationClass, MountedVerb } from '../command-surface.js';
import { buildFlatSurfaceCommand } from '../surface-builder.js';

/** Mediation class per config-domain sub-action: `show` reads; `use`/`clear`
 * write the domain preference. */
const CONFIG_DOMAIN_MEDIATION: Readonly<Record<string, MediationClass>> = {
  show: 'read-only',
  use: 'mutating',
  clear: 'mutating',
};

/** Mediation class per release-helper sub-action: the asserts/validations/checks
 * are read-only queries; `atomic-push` writes to the remote. */
const RELEASE_HELPER_MEDIATION: Readonly<Record<string, MediationClass>> = {
  'check-preconditions': 'read-only',
  'validate-version': 'read-only',
  'assert-not-published': 'read-only',
  'assert-published': 'read-only',
  'atomic-push': 'mutating',
};

/** Help-only commander Command for `config-domain` (show | use | clear). */
function buildConfigDomainCommand(): Command {
  const program = new Command('config-domain')
    .description('Resolve, set, or clear the per-session / per-branch domain (installation) preference.')
    .helpOption(false);

  program
    .command('show')
    .description('show the resolved domain preference and candidate installations (read-only)')
    .helpOption(false)
    .option('--at <dir>', 'directory to resolve from (default: cwd)');

  program
    .command('use')
    .description('set the session or branch domain preference to a named installation')
    .helpOption(false)
    .argument('<dir>')
    .option('--scope <value>', 'preference scope: session | branch')
    .option('--at <dir>', 'directory to resolve from (default: cwd)');

  program
    .command('clear')
    .description('clear the session, branch, or all domain preferences')
    .helpOption(false)
    .option('--scope <value>', 'preference scope: session | branch | all')
    .option('--at <dir>', 'directory to resolve from (default: cwd)');

  return program;
}

/** Help-only commander Command for `release-helper` (the release-pipeline steps). */
function buildReleaseHelperCommand(): Command {
  const program = new Command('release-helper')
    .description('Release-pipeline building blocks: preflight checks, version validation, and the atomic tag+branch push.')
    .helpOption(false);

  program
    .command('check-preconditions')
    .description('report HEAD / working-tree / tracking-remote release readiness (read-only)')
    .helpOption(false);

  program
    .command('validate-version')
    .description('assert <version> is MAJOR.MINOR.PATCH and strictly greater than <last-tag> (read-only)')
    .helpOption(false)
    .argument('<version>')
    .argument('<last-tag>');

  program
    .command('assert-not-published')
    .description('assert no @deskwork package is already published at <version> on npm (read-only)')
    .helpOption(false)
    .argument('<version>');

  program
    .command('assert-published')
    .description('wait until every @deskwork package is published at <version> on npm (read-only)')
    .helpOption(false)
    .argument('<version>');

  program
    .command('atomic-push')
    .description('atomically push HEAD + the release <tag> to origin (mutating)')
    .helpOption(false)
    .argument('<tag>')
    .argument('<branch>');

  return program;
}

/** The session-setup mounted verbs. */
export const SESSION_SETUP_VERBS: readonly MountedVerb[] = [
  {
    build: () =>
      buildFlatSurfaceCommand({
        verb: 'session-start',
        description:
          'Read-only boot orientation: resolve the enclosing installation, assemble the session report, and stop.',
        flags: [
          { name: 'at', arg: 'dir', description: 'resolve the installation from this directory (default: cwd)' },
          { name: 'json', description: 'emit the orientation report as JSON' },
        ],
      }),
    meta: { deprecatedAliasOf: null, verbMediation: 'read-only' },
  },
  {
    build: () =>
      buildFlatSurfaceCommand({
        verb: 'session-end',
        description:
          'Capture-only session close: assemble the journal entry, record friction, then commit and push the doc changes.',
        flags: [
          { name: 'at', arg: 'dir', description: 'resolve the installation from this directory (default: cwd)' },
          { name: 'since', arg: 'sha', description: 'session boundary base commit (default: auto-detected)' },
          { name: 'no-push', description: 'commit the record locally but do not push' },
          { name: 'friction', arg: 'text', description: 'record one surfaced tooling-friction note (repeatable)' },
          { name: 'json', description: 'emit the session-end report as JSON' },
        ],
      }),
    meta: { deprecatedAliasOf: null, verbMediation: 'mutating' },
  },
  {
    build: () =>
      buildFlatSurfaceCommand({
        verb: 'setup',
        description:
          'Resolve-or-create the installation, scaffold and verify its working files; dry-run unless --apply.',
        flags: [
          { name: 'at', arg: 'dir', description: 'target installation directory (default: cwd)' },
          { name: 'apply', description: 'write the scaffold (default: dry-run)' },
        ],
      }),
    meta: { deprecatedAliasOf: null, verbMediation: 'mutating' },
  },
  {
    build: buildConfigDomainCommand,
    meta: { deprecatedAliasOf: null, subActionMediation: CONFIG_DOMAIN_MEDIATION },
  },
  {
    build: () =>
      buildFlatSurfaceCommand({
        verb: 'release-check',
        description:
          'Report the portable release state: the lockstep version and per-channel distribution versions (read-only).',
        flags: [{ name: 'json', description: 'emit the portable release state as JSON' }],
      }),
    meta: { deprecatedAliasOf: null, verbMediation: 'read-only' },
  },
  {
    build: buildReleaseHelperCommand,
    meta: { deprecatedAliasOf: null, subActionMediation: RELEASE_HELPER_MEDIATION },
  },
  {
    build: () =>
      buildFlatSurfaceCommand({
        verb: 'version',
        description: "Print the plugin's lockstep version, read from the plugin manifest (read-only).",
      }),
    meta: { deprecatedAliasOf: null, verbMediation: 'read-only' },
  },
];
