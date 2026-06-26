// 026 T020 — `stackctl capability list` (contracts/cli-verbs.md, US2). Agent-facing
// discovery: surfaces each capability's interface, mediated identities, and policies
// from the ONE registry (FR-012) — the capability API IS this listing, and a new backend
// is a registry entry, not new adapter code. Pure core (`capability`) returns a result
// (hermetically testable); `runCapabilityCli` does the process I/O + exit. The sibling
// `reconcile` subaction (US3 backstop) lives in its own module (`capability-reconcile.ts`)
// and is dispatched by `cli.ts`; this USAGE advertises it so the verb's own help surface
// stays complete.

import { CAPABILITY_REGISTRY, redirectFor, type Capability } from '../capability/registry.js';

// Enumerated-subaction usage (matching the front-door convention) — advertises BOTH the
// `list` discovery verb and the `reconcile` backstop so neither is invisible from this
// surface (the only place the error output appears, via `usageErr`).
const USAGE = 'usage: stackctl capability <list [--json] | reconcile [--at <dir>] [--json]>';

export interface CapabilityResult {
  readonly code: 0 | 2;
  readonly stdout: string;
  readonly stderr: string;
}

function usageErr(message: string): CapabilityResult {
  return { code: 2, stdout: '', stderr: `capability: ${message}\n${USAGE}\n` };
}

function renderHuman(cap: Capability): string {
  const skills = cap.backendIdentities.skills;
  const clis = cap.backendIdentities.cliArgv0;
  const identities = [
    ...skills.map((s) => `skill:${s}`),
    ...clis.map((c) => `cli:${c}`),
  ].join(', ');
  return [
    `● ${cap.id}`,
    `    interface:  ${cap.interface.map((d) => `/${d}`).join(', ')}`,
    `    mediates:   ${identities}`,
    `    policies:   ${cap.policies.join('; ')}`,
    `    redirect:   ${redirectFor(cap)}`,
  ].join('\n');
}

/** Pure core: `capability list [--json]`. The `--json` form emits the registry verbatim
 *  (it IS the API spec, FR-012); the default is a human-readable table. */
export function capability(args: readonly string[]): CapabilityResult {
  const sub = args[0];
  // `reconcile` is a real sibling subaction routed by cli.ts before this core is reached;
  // the error names both so a bare/typo invocation discovers it (it never claims `list` is
  // the only one). The USAGE string appended by usageErr enumerates the full set.
  if (sub !== 'list') return usageErr(`unknown subaction '${sub ?? ''}' (expected 'list' or 'reconcile')`);

  let json = false;
  for (let i = 1; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === '--json') json = true;
    else return usageErr(`unexpected argument '${arg}'`);
  }

  if (json) return { code: 0, stdout: `${JSON.stringify(CAPABILITY_REGISTRY, null, 2)}\n`, stderr: '' };

  const lines = [
    `stack-control capabilities (${CAPABILITY_REGISTRY.id}) — the mediated agent-facing API:`,
    '',
    ...CAPABILITY_REGISTRY.capabilities.map(renderHuman),
  ];
  return { code: 0, stdout: `${lines.join('\n')}\n`, stderr: '' };
}

/** Thin CLI wrapper: run the pure core, emit its I/O, exit with its code. */
export async function runCapabilityCli(args: string[]): Promise<void> {
  const result = capability(args);
  if (result.stdout.length > 0) process.stdout.write(result.stdout);
  if (result.stderr.length > 0) process.stderr.write(result.stderr);
  process.exit(result.code);
}
