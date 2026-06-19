// The scope-surface mounted-verb family (028 US1; FR-003). Eleven flat
// single-action verbs that bootstrap, run, and validate scope-discovery for a
// codebase: install-scope-discovery, customize, scope-doctor, scope-summary,
// scope-export, scope-inventory, scope-widen, validate-scope-discovery,
// install-drift, wrap-prompt, validate-return.
//
// Each verb's help surface is a help-only commander Command built from the REAL
// flags + positionals its own `parseCli` accepts (read from the sources under
// src/scope-discovery/ and src/subcommands/) — non-drift. Mediation class is
// DECLARED per verb (Decision 4): reports/validators/transforms are 'read-only';
// verbs that write files into the installation are 'mutating'.

import type { MediationClass, MountedVerb } from '../command-surface.js';
import { buildFlatSurfaceCommand } from '../surface-builder.js';

/** The recognized Agent-tool agent types `wrap-prompt` / `validate-return`
 * accept on `--agent-type`. Mirrored from the verb sources (KNOWN_AGENT_TYPES). */
const AGENT_TYPE_DESC =
  'Agent-tool agent type (implementer, reviewer, code-explorer, code-architect, ' +
  'ui-engineer, typescript-pro, documentation-engineer, project-orchestrator, ' +
  'feature-orchestrator, codebase-auditor, architect-reviewer, code-reviewer)';

/** Convenience constructor for a flat verb with a declared mediation class. */
function flat(
  verbMediation: MediationClass,
  spec: Parameters<typeof buildFlatSurfaceCommand>[0],
): MountedVerb {
  return {
    build: () => buildFlatSurfaceCommand(spec),
    meta: { deprecatedAliasOf: null, verbMediation },
  };
}

export const SCOPE_SURFACE_VERBS: readonly MountedVerb[] = [
  flat('mutating', {
    verb: 'install-scope-discovery',
    description:
      'Bootstrap .stack-control/scope-discovery/ (registries + schemas + config) in the enclosing installation.',
    flags: [
      { name: 'at', arg: 'dir', description: 'Installation/scan root (default: nearest-enclosing installation above cwd)' },
      { name: 'force', description: 'Overwrite files that already exist' },
      { name: 'dry-run', description: 'Print the planned actions; do not write' },
    ],
  }),
  flat('mutating', {
    verb: 'customize',
    description:
      'Copy a scope-discovery plugin default into the project override location so it can be edited.',
    positionals: [{ name: 'category' }, { name: 'name' }],
    flags: [
      { name: 'at', arg: 'dir', description: 'Installation walk-up start dir (default: cwd)' },
      { name: 'force', description: 'Overwrite an existing override' },
    ],
  }),
  flat('read-only', {
    verb: 'scope-doctor',
    description:
      'Run the scope-discovery doctor rules against the enclosing installation.',
    flags: [
      { name: 'at', arg: 'dir', description: 'Installation walk-up start dir (default: cwd)' },
      { name: 'fix', description: 'Apply fixes (reserved; current rule set is read-only)' },
      { name: 'json', description: 'Emit findings as JSON' },
    ],
  }),
  flat('read-only', {
    verb: 'scope-summary',
    description:
      'Day-to-day reporter: how many clone groups touch a surface.',
    flags: [
      { name: 'surface', arg: 'glob', description: 'Surface glob, matched against bare member paths (required)' },
      { name: 'clones', arg: 'path', description: 'Override clones.yaml path (default: per-codebase baseline)' },
      { name: 'at', arg: 'dir', description: 'Installation walk-up start dir (default: cwd)' },
      { name: 'json', description: 'Emit a JSON object with the four counts' },
      { name: 'verbose', description: 'Print each matching group id + match count to stderr' },
    ],
  }),
  flat('read-only', {
    verb: 'scope-export',
    description:
      'Emit a previously-produced scope-manifest.yaml to stdout (raw YAML or parsed JSON).',
    flags: [
      { name: 'slug', arg: 'slug', description: 'Feature slug; default manifest path resolves to <feature-root>/scope-manifest.yaml' },
      { name: 'manifest', arg: 'path', description: 'Override manifest path explicitly' },
      { name: 'repo-root', arg: 'path', description: 'Override the base root (default: enclosing installation)' },
      { name: 'at', arg: 'dir', description: 'Installation walk-up start dir (default: cwd)' },
      { name: 'json', description: 'Emit parsed JSON instead of raw YAML' },
      { name: 'quiet', description: 'Suppress informational stderr' },
    ],
  }),
  flat('mutating', {
    verb: 'scope-inventory',
    description:
      'Up-front scope discovery: fan the discovery agents, synthesize + validate the scope-manifest, write it plus run-evidence.',
    flags: [
      { name: 'slug', arg: 'feature-slug', description: 'Feature slug (required)' },
      { name: 'out', arg: 'manifest-path', description: 'Override the manifest output path (default: <feature-root>/scope-manifest.yaml)' },
      { name: 'prd-path', arg: 'prd-path', description: 'Override the PRD path (default: <feature-root>/prd.md)' },
      { name: 'at', arg: 'dir', description: 'Installation walk-up start dir (default: cwd)' },
      { name: 'module-root', arg: 'module-root', description: 'Module root for module-attribution (default: src)' },
      { name: 'evidence-trail', arg: 'on|off', description: 'Write the per-run evidence trail (default: on)' },
      { name: 'module-symmetry-out', arg: 'path', description: 'Override the module-symmetry artifact path' },
      { name: 'no-require-modules', description: 'Suppress the zero-modules advisory' },
      { name: 'quiet', description: 'Suppress informational stderr' },
    ],
  }),
  flat('mutating', {
    verb: 'scope-widen',
    description:
      'Mid-implementation scope widening: re-run discovery against an operator complaint and surface the additive delta (dry-run unless --apply).',
    positionals: [{ name: 'complaint' }],
    flags: [
      { name: 'slug', arg: 'feature-slug', description: 'Feature slug (required)' },
      { name: 'manifest', arg: 'manifest-path', description: 'Override the prior manifest path (default: <feature-root>/scope-manifest.yaml)' },
      { name: 'prd-path', arg: 'prd-path', description: 'Override the PRD path (default: <feature-root>/prd.md)' },
      { name: 'at', arg: 'dir', description: 'Installation walk-up start dir (default: cwd)' },
      { name: 'module-root', arg: 'module-root', description: 'Module root for module-attribution (default: src)' },
      { name: 'apply', description: 'Merge the delta into the manifest (default: dry-run)' },
      { name: 'evidence-trail', arg: 'on|off', description: 'Write the per-run evidence trail (default: on)' },
      { name: 'quiet', description: 'Suppress informational stderr' },
    ],
  }),
  flat('read-only', {
    verb: 'validate-scope-discovery',
    description:
      'Run the full scope-discovery adversarial harness suite via vitest.',
    flags: [
      { name: 'quiet', description: 'Compact dot reporter' },
    ],
  }),
  flat('read-only', {
    verb: 'install-drift',
    description:
      'Advisory (non-blocking): warn when local .specify extension copies have drifted from the plugin source.',
    flags: [
      { name: 'project-root', arg: 'path', description: 'Project root to diff against the plugin source (default: cwd)' },
    ],
  }),
  flat('read-only', {
    verb: 'wrap-prompt',
    description:
      'Augment an operator-authored sub-agent prompt (grammar instruction + optional refactor prelude) and emit it to stdout.',
    flags: [
      { name: 'agent-type', arg: 'type', description: `${AGENT_TYPE_DESC} (required)` },
      { name: 'prompt-file', arg: 'path', description: 'Path to the operator-authored sub-agent prompt (read verbatim; required)' },
      { name: 'repo-root', arg: 'path', description: 'Project root for resolving .stack-control/scope-discovery/*.yaml overrides (default: cwd)' },
      { name: 'quiet', description: 'Suppress the stderr one-line summary' },
    ],
  }),
  flat('read-only', {
    verb: 'validate-return',
    description:
      'Validate a sub-agent response against the dispatch grammar (Searched/Included/Excluded blocks + forbidden-deferral checks); emit a ValidationResult JSON.',
    flags: [
      { name: 'response-file', arg: 'path|-', description: 'Path to the sub-agent response (or `-` to read from stdin; required)' },
      { name: 'agent-type', arg: 'type', description: `${AGENT_TYPE_DESC} (required)` },
      { name: 'repo-root', arg: 'path', description: 'Project root for resolving .stack-control/scope-discovery/*.yaml overrides (default: cwd)' },
      { name: 'json', description: 'Emit only the structured JSON to stdout (suppress the stderr summary)' },
    ],
  }),
];
