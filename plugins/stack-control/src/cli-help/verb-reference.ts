// Auto-generated verb reference + descriptor artifact (028 US1, T039/T041;
// FR-004/052; contracts C3/C4/C5). Both DERIVE from the command surface — never
// hand-maintained — so they cannot drift from what the CLI exposes (FR-041).

import { buildCommandSurface, type CommandDescriptor, type FlagDescriptor } from './command-surface.js';

/** One flag's reference line: `-d, --depends-on <value>  description`. */
function flagLine(flag: FlagDescriptor): string {
  const lead = flag.shortFlag ? `-${flag.shortFlag}, --${flag.name}` : `--${flag.name}`;
  const token = flag.arg ? `${lead} ${flag.arg}` : lead;
  const req = flag.required ? ' (required)' : '';
  return `      ${token}${req}${flag.description ? `  ${flag.description}` : ''}`.trimEnd();
}

/** Render the complete verb reference (C3) — every verb, sub-action, and flag. */
export function renderVerbReference(): string {
  const lines: string[] = ['# stackctl verb reference', ''];
  for (const verb of [...buildCommandSurface()].sort((a, b) => a.verb.localeCompare(b.verb))) {
    const alias = verb.deprecatedAliasOf ? ` (deprecated alias of ${verb.deprecatedAliasOf})` : '';
    lines.push(`## ${verb.verb}${alias}`);
    lines.push(verb.description);
    for (const flag of verb.flags) lines.push(flagLine(flag));
    for (const sub of verb.subActions) {
      const positionals = sub.positionals.length > 0 ? ` ${sub.positionals.join(' ')}` : '';
      lines.push(`  - ${verb.verb} ${sub.name}${positionals} — ${sub.description} [${sub.mediationClass}]`);
      for (const flag of sub.flags) lines.push(flagLine(flag));
    }
    lines.push('');
  }
  return lines.join('\n');
}

/** A flag entry in the descriptor artifact (C4). */
export interface ArtifactFlag {
  readonly arg: string | null;
  readonly required: boolean;
  readonly description: string;
}

/** A sub-action entry in the descriptor artifact (C4). */
export interface ArtifactSubAction {
  readonly description: string;
  readonly positionals: readonly string[];
  readonly mediationClass: string;
  readonly flags: Record<string, ArtifactFlag>;
}

/** A command (verb) entry in the descriptor artifact (C4). */
export interface ArtifactCommand {
  readonly description: string;
  readonly mediationClass: string | null;
  readonly flags: Record<string, ArtifactFlag>;
  readonly subActions: Record<string, ArtifactSubAction>;
}

/** The oclif-manifest-style descriptor artifact (C4). */
export interface DescriptorArtifact {
  readonly id: string;
  readonly commands: Record<string, ArtifactCommand>;
}

function flagsObject(flags: readonly FlagDescriptor[]): Record<string, ArtifactFlag> {
  const out: Record<string, ArtifactFlag> = {};
  for (const flag of flags) {
    out[flag.name] = { arg: flag.arg, required: flag.required, description: flag.description };
  }
  return out;
}

function commandObject(descriptor: CommandDescriptor): ArtifactCommand {
  const subActions: Record<string, ArtifactSubAction> = {};
  for (const sub of descriptor.subActions) {
    subActions[sub.name] = {
      description: sub.description,
      positionals: sub.positionals,
      mediationClass: sub.mediationClass,
      flags: flagsObject(sub.flags),
    };
  }
  return {
    description: descriptor.description,
    mediationClass: descriptor.mediationClass,
    flags: flagsObject(descriptor.flags),
    subActions,
  };
}

/**
 * Emit the descriptor artifact (C4) — derived from the live command surface, never
 * authored (FR-041/052). The round-trip test (C5) asserts it carries exactly the
 * verbs / sub-actions / flags the tree exposes.
 */
export function emitDescriptorArtifact(): DescriptorArtifact {
  const commands: Record<string, ArtifactCommand> = {};
  for (const descriptor of buildCommandSurface()) {
    commands[descriptor.verb] = commandObject(descriptor);
  }
  return { id: 'stack-control-command-surface-v1', commands };
}
