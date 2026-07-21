// US1 help-probe — fleet-control-plane family (036 T120; FR-001/002; SC-001).
//
// `plane`/`sidecar` are registered in the CLI dispatcher (src/cli.ts SUBCOMMANDS)
// but were, before T120-T125, mounted nowhere in the command surface — the exact
// C2b gap `check-front-door` names. This is the focused RED-before/GREEN-after
// coverage for that gap: before mounting FLEET_VERBS, `buildCommandSurface()`
// carries no 'plane'/'sidecar' descriptor and both probes below fail; after
// mounting (src/cli-help/surfaces/fleet.ts wired into mounted-verbs.ts), every
// assertion here passes.

import { describe, expect, it } from 'vitest';
import { buildCommandSurface } from '../../cli-help/command-surface.js';
import { isHelpConformant, probeHelp } from './command-surface-harness.js';

function descriptor(verb: string) {
  const d = buildCommandSurface().find((x) => x.verb === verb);
  if (!d) throw new Error(`test setup: ${verb} descriptor missing`);
  return d;
}

describe('plane --help (T120)', () => {
  it('is mounted in the command surface with its one subaction', () => {
    const d = descriptor('plane');
    expect(d.subActions.map((s) => s.name).sort()).toEqual(['serve']);
  });

  it('every subaction is declared mutating (Decision 4)', () => {
    for (const sub of descriptor('plane').subActions) {
      expect(sub.mediationClass, sub.name).toBe('mutating');
    }
  });

  it('the verb itself emits conformant help', () => {
    expect(isHelpConformant(probeHelp('plane'))).toBe(true);
  });

  it('every sub-action emits conformant help (exit 0 + usage body)', () => {
    for (const sub of descriptor('plane').subActions) {
      const probe = probeHelp('plane', sub.name);
      expect(isHelpConformant(probe), `plane ${sub.name} --help (exit ${probe.status})`).toBe(true);
    }
  });
});

describe('sidecar --help (T120)', () => {
  it('is mounted in the command surface with its one subaction', () => {
    const d = descriptor('sidecar');
    expect(d.subActions.map((s) => s.name)).toEqual(['run']);
  });

  it('the subaction is declared mutating (Decision 4)', () => {
    for (const sub of descriptor('sidecar').subActions) {
      expect(sub.mediationClass, sub.name).toBe('mutating');
    }
  });

  it('the verb itself emits conformant help', () => {
    expect(isHelpConformant(probeHelp('sidecar'))).toBe(true);
  });

  it('every sub-action emits conformant help (exit 0 + usage body)', () => {
    for (const sub of descriptor('sidecar').subActions) {
      const probe = probeHelp('sidecar', sub.name);
      expect(isHelpConformant(probe), `sidecar ${sub.name} --help (exit ${probe.status})`).toBe(true);
    }
  });
});
