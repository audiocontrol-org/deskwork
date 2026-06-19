// Mounted-verb surface — the `capability` family (028 US1; FR-003). Declares the
// help-only commander structure + per-node mediation metadata for the five
// capability-interface-mediation verbs (specs/026): `capability`, `mediate-check`,
// `front-door`, `intercept`, and the deprecated `speckit-guard` alias.
//
// Structure (sub-actions, flags, positionals) is DERIVED here from the same grammar
// each verb's parser enforces in src/subcommands/{capability,capability-reconcile,
// mediate-check,front-door,intercept,speckit-guard}.ts — so the command SURFACE
// (help / verb reference / registry) cannot drift from what the CLI accepts.
//
// MIRRORS src/cli-help/mounted-verbs.ts. Execution stays on the flat SUBCOMMANDS
// dispatcher in cli.ts; these Commands exist only to feed buildSurfaceFrom().

import { Command } from 'commander';
import type { MediationClass, MountedVerb } from '../command-surface.js';
import { buildFlatSurfaceCommand } from '../surface-builder.js';

// ── capability (multi-action: list | reconcile) ─────────────────────────────
// `list` is a pure registry query (read-only). `reconcile` is report-only — it
// scans spec-execution state and reports un-governed residue, never mutating
// (capability-reconcile.ts: "REPORT-ONLY (exit 0, never mutates)").
const CAPABILITY_MEDIATION: Readonly<Record<string, MediationClass>> = {
  list: 'read-only',
  reconcile: 'read-only',
};

function buildCapabilityCommand(): Command {
  const c = new Command('capability')
    .description('Agent-facing discovery of the mediated capability API: each capability\'s interface, mediated identities, and policies from the one registry.')
    .helpOption(false);

  const list = c
    .command('list')
    .description('list each capability\'s interface, mediated identities, and policies (read-only)')
    .helpOption(false);
  list.option('--json', 'emit the registry verbatim (it IS the API spec) instead of the human table');

  const reconcile = c
    .command('reconcile')
    .description('report spec-execution state that lacks a current governance checkpoint — the residue of a bypassed front door (report-only, never mutates)')
    .helpOption(false);
  reconcile.option('--at <dir>', 'resolve the enclosing installation from this directory (default: cwd)');
  reconcile.option('--json', 'emit the findings as JSON for adapters instead of the human report');

  return c;
}

// ── front-door (multi-action: enter | exit) ─────────────────────────────────
// Both write the session-keyed marker store (enter pushes an entry, exit removes
// one) → mutating.
const FRONT_DOOR_MEDIATION: Readonly<Record<string, MediationClass>> = {
  enter: 'mutating',
  exit: 'mutating',
};

function buildFrontDoorCommand(): Command {
  const c = new Command('front-door')
    .description('Marker writer the capability-interface skills call to bracket a sanctioned backend drive: enter pushes a session-keyed marker and prints its token; exit removes that token\'s entry.')
    .helpOption(false);

  const enter = c
    .command('enter')
    .description('push a session-keyed front-door marker for a capability and print its token (installation-anchored — refuses with no enclosing installation)')
    .helpOption(false);
  enter.option('--capability <id>', 'the capability id to open the front door for (must be a known registry capability)');
  enter.option('--session <id>', 'the session id to key the marker under (typically $CLAUDE_CODE_SESSION_ID)');
  enter.option('--at <dir>', 'anchor the marker write to the installation enclosing this directory (default: cwd)');

  const exit = c
    .command('exit')
    .description('remove only this token\'s marker entry (a no-op success when there is nothing to anchor — crash-safe)')
    .helpOption(false);
  exit.option('--token <tok>', 'the literal token value that `enter` printed');
  exit.option('--session <id>', 'the session id the marker was keyed under');
  exit.option('--at <dir>', 'anchor the marker removal to the installation enclosing this directory (default: cwd)');

  return c;
}

// ── single-action verbs ─────────────────────────────────────────────────────

function buildMediateCheckCommand(): Command {
  return buildFlatSurfaceCommand({
    verb: 'mediate-check',
    description: 'Vendor-neutral mediation decision verb every PreToolUse adapter calls: resolves the registry + session marker and permits/refuses (exit 0/1/2). Read-only — never writes the marker or backend state.',
    flags: [
      { name: 'surface', arg: 'bash|skill', description: 'the invocation surface to evaluate' },
      { name: 'identity', arg: 'str', description: 'the backend identity (skill name or cli argv0) being invoked' },
      { name: 'session', arg: 'id', description: 'the session id whose front-door markers to read' },
      { name: 'at', arg: 'dir', description: 'resolve the enclosing installation from this directory (default: cwd)' },
      { name: 'json', description: 'emit the decision as JSON instead of a human refusal line' },
    ],
  });
}

function buildInterceptCommand(): Command {
  return buildFlatSurfaceCommand({
    verb: 'intercept',
    description: 'Claude PreToolUse adapter entry: reads the hook payload from stdin, runs the shared interceptor decision, and on refuse emits the PreToolUse deny JSON to stdout. Always exits 0 (a PreToolUse hook denies via stdout JSON). Read-only.',
  });
}

function buildSpeckitGuardCommand(): Command {
  return buildFlatSurfaceCommand({
    verb: 'speckit-guard',
    description: 'Portable refusal verb: given a backend skill identity, refuses a direct invocation and names the sanctioned stack-control front door, or permits one reached via the front-door marker. Read-only (decides + prints).',
    positionals: [{ name: 'skill-name', required: true }],
  });
}

/** The mounted `capability` family — projected by buildSurfaceFrom() into typed
 * CommandDescriptors that drive `--help`, the verb reference, and the registry. */
export const CAPABILITY_VERBS: readonly MountedVerb[] = [
  {
    build: buildCapabilityCommand,
    meta: { deprecatedAliasOf: null, subActionMediation: CAPABILITY_MEDIATION },
  },
  {
    build: buildFrontDoorCommand,
    meta: { deprecatedAliasOf: null, subActionMediation: FRONT_DOOR_MEDIATION },
  },
  {
    build: buildMediateCheckCommand,
    // Read-only: it only DECIDES and prints; it never writes the marker or any
    // backend state (mediate-check.ts: "Read-only (Principle IV)").
    meta: { deprecatedAliasOf: null, verbMediation: 'read-only' },
  },
  {
    build: buildInterceptCommand,
    // Read-only: a thin stdin→stdout decision shell; never writes state.
    meta: { deprecatedAliasOf: null, verbMediation: 'read-only' },
  },
  {
    build: buildSpeckitGuardCommand,
    // Deprecated (026 T017): superseded by the capability interceptor; new adapters
    // call `mediate-check`, which is the front door this verb redirects callers to.
    // Read-only — it evaluates the refusal and prints; it writes no state.
    meta: { deprecatedAliasOf: 'mediate-check', verbMediation: 'read-only' },
  },
];
