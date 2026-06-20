// workflow family surface (028 US1, T018/T019; FR-001/002/003). The 022
// parseable-lifecycle-workflow engine: `stackctl workflow <subaction>`. Help-only
// commander Command — execution stays on the flat dispatcher.

import { Command } from 'commander';
import type { MediationClass, MountedVerb } from '../command-surface.js';

const WORKFLOW_MEDIATION: Readonly<Record<string, MediationClass>> = {
  status: 'read-only',
  'can-enter': 'read-only',
  next: 'read-only',
  compass: 'read-only',
  advance: 'mutating',
  'link-design': 'mutating',
  'link-spec': 'mutating',
  redesign: 'mutating',
};

function buildWorkflowCommand(): Command {
  const program = new Command('workflow')
    .description('Parseable lifecycle workflow engine — phase/gate reasoning over a roadmap item (022).')
    .helpOption(false);

  const status = program.command('status').description('report an item\'s current phase + gate state').helpOption(false);
  status.argument('<item>');
  status.option('--json', 'emit the machine-readable status');

  const canEnter = program.command('can-enter').description('check whether an item may enter a given stage').helpOption(false);
  canEnter.argument('<item>');
  canEnter.argument('<stage>');

  const next = program.command('next').description('report the single legitimate next action for an item').helpOption(false);
  next.argument('<item>');

  const compass = program.command('compass').description('orient on an item + diff the declared intent against the current phase').helpOption(false);
  compass.argument('<item>');
  compass.option('--intent <action>', 'the action being attempted (its phase is checked against the current one)');
  compass.option('--json', 'emit the machine-readable compass verdict');

  const advance = program.command('advance').description('advance an item to its next phase (dry-run unless --apply)').helpOption(false);
  advance.argument('<item>');
  advance.option('--apply', 'write the phase transition (default: dry-run)');

  const linkDesign = program.command('link-design').description('set the design pointer on an item (dry-run unless --apply)').helpOption(false);
  linkDesign.argument('<item>');
  linkDesign.argument('<doc>');
  linkDesign.option('--apply', 'write the link (default: dry-run)');

  const linkSpec = program.command('link-spec').description('set the spec pointer on an item (dry-run unless --apply)').helpOption(false);
  linkSpec.argument('<item>');
  linkSpec.argument('<doc>');
  linkSpec.option('--apply', 'write the link (default: dry-run)');

  const redesign = program.command('redesign').description('re-open an item\'s designing phase (dry-run unless --apply)').helpOption(false);
  redesign.argument('<item>');
  redesign.option('--apply', 'write the redesign transition (default: dry-run)');

  return program;
}

export const WORKFLOW_VERBS: readonly MountedVerb[] = [
  { build: buildWorkflowCommand, meta: { deprecatedAliasOf: null, subActionMediation: WORKFLOW_MEDIATION } },
];
